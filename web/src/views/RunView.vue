<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <h2 class="text-xl font-bold">评测运行</h2>

    <div v-if="status === 'idle'" class="bg-white rounded-lg shadow p-6 text-center text-gray-500">
      <p>当前没有正在运行的评测</p>
      <router-link to="/config" class="text-blue-600 text-sm hover:underline">去配置页面启动评测</router-link>
    </div>

    <div v-else class="space-y-4">
      <!-- Dataset info + spinner -->
      <div class="bg-white rounded-lg shadow p-6 space-y-3">
        <div class="flex items-center gap-3">
          <div v-if="status === 'running'" class="spinner"></div>
          <div>
            <div class="text-sm font-medium text-gray-700">
              {{ evalName || '评测进行中' }}
            </div>
            <div class="text-xs text-gray-500">
              {{ currentCaseLabel }}
            </div>
          </div>
          <span :class="['ml-auto text-sm font-medium', statusColor]">{{ statusText }}</span>
        </div>

        <!-- Progress bar -->
        <div class="w-full bg-gray-200 rounded-full h-3">
          <div
            class="bg-blue-600 h-3 rounded-full transition-all duration-500"
            :style="{ width: progressPercent + '%' }"
          ></div>
        </div>
        <div class="flex gap-4 text-sm text-gray-600">
          <span>进度: {{ progress.completed }} / {{ progress.total }}</span>
          <span>✅ {{ progress.passed }}</span>
          <span>❌ {{ progress.failed }}</span>
        </div>
      </div>

      <!-- Case list -->
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-2 text-left">ID</th>
              <th class="px-4 py-2 text-left">名称</th>
              <th class="px-4 py-2 text-left">状态</th>
              <th class="px-4 py-2 text-right">耗时</th>
              <th class="px-4 py-2 text-right">Token</th>
              <th class="px-4 py-2 text-right">工具调用</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in cases" :key="c.id" :class="['border-t', c.status === 'running' ? 'bg-blue-50' : '']">
              <td class="px-4 py-2 font-mono text-xs">{{ c.id }}</td>
              <td class="px-4 py-2">{{ c.name || c.id }}</td>
              <td class="px-4 py-2">
                <span class="flex items-center gap-1">
                  <span v-if="c.status === 'running'" class="spinner-sm"></span>
                  {{ statusEmoji(c.status) }}
                </span>
              </td>
              <td class="px-4 py-2 text-right">{{ c.duration ?? "—" }}</td>
              <td class="px-4 py-2 text-right">{{ c.tokens ?? "—" }}</td>
              <td class="px-4 py-2 text-right">{{ c.tool_calls ?? "—" }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Actions -->
      <div class="flex gap-3">
        <button v-if="status === 'running'" @click="abort" class="px-4 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700">
          中止评测
        </button>
        <router-link v-if="status === 'completed' && runId" :to="`/results/${runId}`" class="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 inline-block">
          查看结果
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { api } from "@/api/client";

const status = ref<string>("idle");
const runId = ref<string | null>(null);
const evalName = ref("");
const progress = ref({ total: 0, completed: 0, passed: 0, failed: 0 });
const cases = ref<any[]>([]);
const currentCaseId = ref<string | null>(null);
let eventSource: EventSource | null = null;

const progressPercent = computed(() =>
  progress.value.total > 0 ? (progress.value.completed / progress.value.total) * 100 : 0
);

const currentCaseLabel = computed(() => {
  if (status.value === "completed") return `已完成 ${progress.value.total} 个用例`;
  if (status.value === "error") return "评测出错";
  if (currentCaseId.value) return `正在评测: ${currentCaseId.value}`;
  if (progress.value.total > 0) return `共 ${progress.value.total} 个用例`;
  return "准备中...";
});

const statusText = computed(() => {
  switch (status.value) {
    case "running": return "运行中";
    case "completed": return "已完成";
    case "error": return "出错";
    default: return "空闲";
  }
});

const statusColor = computed(() => {
  switch (status.value) {
    case "running": return "text-blue-600";
    case "completed": return "text-green-600";
    case "error": return "text-red-600";
    default: return "text-gray-600";
  }
});

function statusEmoji(s: string) {
  switch (s) {
    case "passed": return "✅ 通过";
    case "failed": return "❌ 失败";
    case "errored": return "💥 错误";
    case "timeout": return "⌛ 超时";
    case "running": return "运行中";
    default: return "⏳ 等待";
  }
}

onMounted(async () => {
  // Load eval name from config
  try {
    const cfg = await api.getConfig() as any;
    evalName.value = cfg.name || "评测";
  } catch {}

  const s = await api.getRunStatus();
  status.value = s.status;
  runId.value = s.run_id;
  if (s.progress) progress.value = s.progress as any;

  // Always connect SSE to receive real-time updates
  connectSSE();
});

function connectSSE() {
  eventSource = api.subscribeEvents();
  eventSource.onmessage = (e) => {
    const data = JSON.parse(e.data);
    switch (data.type) {
      case "run.started":
        status.value = "running";
        runId.value = data.run_id;
        progress.value = { total: data.total, completed: 0, passed: 0, failed: 0 };
        cases.value = [];
        break;
      case "case.started":
        currentCaseId.value = data.id;
        cases.value.push({ id: data.id, name: data.id, status: "running" });
        break;
      case "case.completed":
        currentCaseId.value = null;
        progress.value.completed += 1;
        if (data.status === "passed") progress.value.passed += 1;
        else progress.value.failed += 1;
        // Update existing case or add new one
        const idx = cases.value.findIndex((c: any) => c.id === data.id);
        if (idx >= 0) {
          cases.value[idx] = data;
        } else {
          cases.value.push(data);
        }
        break;
      case "run.completed":
        status.value = "completed";
        currentCaseId.value = null;
        break;
      case "run.error":
        status.value = "error";
        currentCaseId.value = null;
        break;
      case "ping":
        break;
    }
  };
}

async function abort() {
  await api.abortRun();
  status.value = "idle";
  eventSource?.close();
}

onUnmounted(() => {
  eventSource?.close();
});
</script>

<style scoped>
.spinner {
  width: 20px;
  height: 20px;
  border: 3px solid #e5e7eb;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.spinner-sm {
  width: 12px;
  height: 12px;
  border: 2px solid #e5e7eb;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
