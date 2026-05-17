<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <h2 class="text-xl font-bold">评测运行</h2>

    <div v-if="status === 'idle' && completedCases.length === 0" class="bg-white rounded-lg shadow p-6 text-center text-gray-500">
      <p>当前没有正在运行的评测</p>
      <router-link to="/config" class="text-blue-600 text-sm hover:underline">去配置页面启动评测</router-link>
    </div>

    <div v-else class="space-y-4">
      <!-- Header -->
      <div class="bg-white rounded-lg shadow p-5">
        <div class="flex items-center gap-3 mb-3">
          <div v-if="status === 'running'" class="spinner"></div>
          <div class="flex-1">
            <div class="font-medium text-gray-800">{{ evalName || '评测' }}</div>
            <div class="text-xs text-gray-500 mt-0.5">{{ currentCaseLabel }}</div>
          </div>
          <span :class="['text-sm font-medium px-2 py-1 rounded', statusBadgeClass]">{{ statusText }}</span>
        </div>

        <!-- Progress bar -->
        <div class="w-full bg-gray-200 rounded-full h-2.5">
          <div class="bg-blue-600 h-2.5 rounded-full transition-all duration-500" :style="{ width: progressPercent + '%' }"></div>
        </div>
        <div class="flex gap-4 text-xs text-gray-500 mt-2">
          <span>进度: {{ progress.completed }}/{{ progress.total }}</span>
          <span class="text-green-600">✅ {{ progress.passed }}</span>
          <span class="text-red-600">❌ {{ progress.failed }}</span>
        </div>
      </div>

      <!-- Currently running case -->
      <div v-if="currentCaseId" class="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
        <div class="spinner-sm"></div>
        <div>
          <div class="text-sm font-medium text-blue-800">正在评测: {{ currentCaseId }}</div>
        </div>
      </div>

      <!-- Completed cases -->
      <div v-if="completedCases.length > 0" class="space-y-3">
        <h3 class="text-sm font-medium text-gray-600">已完成用例 ({{ completedCases.length }})</h3>
        <div v-for="c in completedCases" :key="c.id" :class="['border rounded-lg p-4', caseCardClass(c.status)]">
          <div class="flex items-center justify-between">
            <div>
              <span class="text-sm font-medium">{{ statusIcon(c.status) }} {{ c.name || c.id }}</span>
              <span class="text-xs text-gray-500 ml-2 font-mono">{{ c.id }}</span>
            </div>
            <span :class="['text-xs px-2 py-0.5 rounded', caseStatusClass(c.status)]">{{ c.status }}</span>
          </div>
          <div class="flex gap-4 text-xs text-gray-500 mt-2">
            <span>耗时: {{ c.duration || '—' }}</span>
            <span>Token: {{ c.tokens ?? '—' }}</span>
            <span>工具调用: {{ c.tool_calls ?? '—' }}</span>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-3">
        <button v-if="status === 'running'" @click="abort" class="px-4 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700">
          中止评测
        </button>
        <router-link v-if="status === 'completed' && runId" :to="`/results/${runId}`" class="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 inline-block">
          查看详细结果
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
const completedCases = ref<any[]>([]);
const currentCaseId = ref<string | null>(null);
let eventSource: EventSource | null = null;

const progressPercent = computed(() =>
  progress.value.total > 0 ? (progress.value.completed / progress.value.total) * 100 : 0
);

const currentCaseLabel = computed(() => {
  if (status.value === "completed") return `已完成全部 ${progress.value.total} 个用例`;
  if (status.value === "error") return "评测出错";
  if (currentCaseId.value) return `正在评测第 ${progress.value.completed + 1}/${progress.value.total} 个用例`;
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

const statusBadgeClass = computed(() => {
  switch (status.value) {
    case "running": return "bg-blue-100 text-blue-700";
    case "completed": return "bg-green-100 text-green-700";
    case "error": return "bg-red-100 text-red-700";
    default: return "bg-gray-100 text-gray-600";
  }
});

function statusIcon(s: string) {
  switch (s) { case "passed": return "✅"; case "failed": return "❌"; case "errored": return "💥"; case "timeout": return "⌛"; default: return "⏭"; }
}
function caseCardClass(s: string) {
  switch (s) { case "passed": return "border-green-200 bg-green-50"; case "failed": return "border-red-200 bg-red-50"; case "errored": return "border-orange-200 bg-orange-50"; case "timeout": return "border-yellow-200 bg-yellow-50"; default: return "border-gray-200 bg-gray-50"; }
}
function caseStatusClass(s: string) {
  switch (s) { case "passed": return "bg-green-100 text-green-700"; case "failed": return "bg-red-100 text-red-700"; case "errored": return "bg-orange-100 text-orange-700"; case "timeout": return "bg-yellow-100 text-yellow-700"; default: return "bg-gray-100 text-gray-600"; }
}

onMounted(async () => {
  try {
    const cfg = await api.getConfig() as any;
    evalName.value = cfg.name || "评测";
  } catch {}

  // Restore full state from backend (including completed cases)
  const s = await api.getRunStatus() as any;
  status.value = s.status;
  runId.value = s.run_id;
  currentCaseId.value = s.current_case ?? null;
  if (s.progress) progress.value = s.progress;
  if (s.cases && Array.isArray(s.cases)) {
    completedCases.value = s.cases;
  }

  // Connect SSE for real-time updates
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
        completedCases.value = [];
        currentCaseId.value = null;
        break;
      case "case.started":
        currentCaseId.value = data.id;
        break;
      case "case.completed":
        currentCaseId.value = null;
        progress.value.completed += 1;
        if (data.status === "passed") progress.value.passed += 1;
        else progress.value.failed += 1;
        completedCases.value.push(data);
        break;
      case "run.completed":
        status.value = "completed";
        currentCaseId.value = null;
        break;
      case "run.error":
        status.value = "error";
        currentCaseId.value = null;
        break;
    }
  };
}

async function abort() {
  await api.abortRun();
  status.value = "idle";
  currentCaseId.value = null;
  eventSource?.close();
}

onUnmounted(() => {
  eventSource?.close();
});
</script>

<style scoped>
.spinner { width: 20px; height: 20px; border: 3px solid #e5e7eb; border-top-color: #2563eb; border-radius: 50%; animation: spin 0.8s linear infinite; }
.spinner-sm { width: 14px; height: 14px; border: 2px solid #bfdbfe; border-top-color: #2563eb; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
