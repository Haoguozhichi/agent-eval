<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <h2 class="text-xl font-bold">评测运行</h2>

    <div v-if="status === 'idle'" class="bg-white rounded-lg shadow p-6 text-center text-gray-500">
      <p>当前没有正在运行的评测</p>
      <router-link to="/config" class="text-blue-600 text-sm hover:underline">去配置页面启动评测</router-link>
    </div>

    <div v-else class="space-y-4">
      <!-- Progress -->
      <div class="bg-white rounded-lg shadow p-6 space-y-3">
        <div class="flex justify-between items-center">
          <span class="text-sm text-gray-600">进度: {{ progress.completed }} / {{ progress.total }}</span>
          <span :class="['text-sm font-medium', statusColor]">{{ statusText }}</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-3">
          <div
            class="bg-blue-600 h-3 rounded-full transition-all duration-300"
            :style="{ width: progressPercent + '%' }"
          ></div>
        </div>
        <div class="flex gap-4 text-sm text-gray-600">
          <span>✅ 通过: {{ progress.passed }}</span>
          <span>❌ 失败: {{ progress.failed }}</span>
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
            <tr v-for="c in cases" :key="c.id" class="border-t">
              <td class="px-4 py-2 font-mono text-xs">{{ c.id }}</td>
              <td class="px-4 py-2">{{ c.name }}</td>
              <td class="px-4 py-2">{{ statusEmoji(c.status) }}</td>
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
        <router-link v-if="status === 'completed' && runId" :to="`/results/${runId}`" class="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
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
const progress = ref({ total: 0, completed: 0, passed: 0, failed: 0 });
const cases = ref<any[]>([]);
let eventSource: EventSource | null = null;

const progressPercent = computed(() =>
  progress.value.total > 0 ? (progress.value.completed / progress.value.total) * 100 : 0
);

const statusText = computed(() => {
  switch (status.value) {
    case "running": return "运行中...";
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
    case "running": return "🔄 运行中";
    default: return "⏳ 等待";
  }
}

onMounted(async () => {
  const s = await api.getRunStatus();
  status.value = s.status;
  runId.value = s.run_id;
  if (s.progress) progress.value = s.progress as any;

  // Always connect SSE if running or just started
  if (s.status === "running" || s.status === "idle") {
    connectSSE();
  }
});

function connectSSE() {
  eventSource = api.subscribeEvents();
  eventSource.onmessage = (e) => {
    const data = JSON.parse(e.data);
    switch (data.type) {
      case "run.started":
        status.value = "running";
        runId.value = data.run_id;
        progress.value.total = data.total;
        break;
      case "case.completed":
        progress.value.completed += 1;
        if (data.status === "passed") progress.value.passed += 1;
        else progress.value.failed += 1;
        cases.value.push(data);
        break;
      case "run.completed":
        status.value = "completed";
        eventSource?.close();
        break;
      case "run.error":
        status.value = "error";
        eventSource?.close();
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
