<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <h2 class="text-xl font-bold">历史评测</h2>

    <div v-if="loading" class="text-gray-500 text-sm">加载中...</div>
    <div v-else-if="runs.length === 0" class="bg-white rounded-lg shadow p-6 text-center text-gray-500">
      暂无历史评测记录
    </div>
    <div v-else class="bg-white rounded-lg shadow overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-2 text-left">时间</th>
            <th class="px-4 py-2 text-left">状态</th>
            <th class="px-4 py-2 text-right">通过率</th>
            <th class="px-4 py-2 text-right">用例数</th>
            <th class="px-4 py-2 text-right">总 Token</th>
            <th class="px-4 py-2 text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="run in runs" :key="run.id" class="border-t hover:bg-gray-50">
            <td class="px-4 py-2 font-mono text-xs">{{ run.id }}</td>
            <td class="px-4 py-2">
              <span :class="['text-xs px-1.5 py-0.5 rounded', runStatusClass(run.status)]">{{ runStatusText(run.status) }}</span>
            </td>
            <td class="px-4 py-2 text-right">{{ formatRate(run.summary?.pass_rate) }}</td>
            <td class="px-4 py-2 text-right">{{ run.summary?.total ?? "—" }}</td>
            <td class="px-4 py-2 text-right">{{ run.summary?.total_tokens?.total ?? "—" }}</td>
            <td class="px-4 py-2 text-right">
              <router-link v-if="run.status === 'completed'" :to="`/results/${run.id}`" class="text-blue-600 hover:underline">详情</router-link>
              <span v-else class="text-gray-400 text-xs">{{ run.status === 'incomplete' ? '未完成' : '—' }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { api } from "@/api/client";

const runs = ref<any[]>([]);
const loading = ref(true);

onMounted(async () => {
  try {
    runs.value = await api.getResults() as any[];
  } catch {}
  loading.value = false;
});

function formatRate(rate?: number) {
  if (rate === undefined || rate === null) return "—";
  return (rate * 100).toFixed(1) + "%";
}

function runStatusClass(status: string) {
  switch (status) {
    case "completed": return "bg-green-100 text-green-700";
    case "incomplete": return "bg-yellow-100 text-yellow-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

function runStatusText(status: string) {
  switch (status) {
    case "completed": return "已完成";
    case "incomplete": return "未完成";
    default: return "空";
  }
}
</script>
