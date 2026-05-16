<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <div class="flex items-center gap-3">
      <router-link to="/history" class="text-blue-600 hover:underline text-sm">&larr; 返回历史</router-link>
      <h2 class="text-xl font-bold">评测结果</h2>
    </div>

    <div v-if="!result" class="text-gray-500 text-sm">加载中...</div>
    <template v-else>
      <!-- Summary cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-white rounded-lg shadow p-4 text-center">
          <div class="text-2xl font-bold text-green-600">{{ result.summary.passed }}</div>
          <div class="text-xs text-gray-500">通过</div>
        </div>
        <div class="bg-white rounded-lg shadow p-4 text-center">
          <div class="text-2xl font-bold text-red-600">{{ result.summary.failed + result.summary.errored }}</div>
          <div class="text-xs text-gray-500">失败/错误</div>
        </div>
        <div class="bg-white rounded-lg shadow p-4 text-center">
          <div class="text-2xl font-bold">{{ result.summary.total_tokens?.total }}</div>
          <div class="text-xs text-gray-500">总 Token</div>
        </div>
        <div class="bg-white rounded-lg shadow p-4 text-center">
          <div class="text-2xl font-bold">{{ result.summary.total_tool_calls?.total }}</div>
          <div class="text-xs text-gray-500">工具调用</div>
        </div>
      </div>

      <!-- Metadata -->
      <div class="bg-white rounded-lg shadow p-4 text-sm text-gray-600 flex flex-wrap gap-4">
        <span>模型: <code>{{ result.metadata.config.model }}</code></span>
        <span>耗时: {{ result.metadata.duration }}</span>
        <span>通过率: {{ (result.summary.pass_rate * 100).toFixed(1) }}%</span>
      </div>

      <!-- Cases table -->
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-2 text-left">ID</th>
              <th class="px-4 py-2 text-left">名称</th>
              <th class="px-4 py-2 text-left">状态</th>
              <th class="px-4 py-2 text-right">得分</th>
              <th class="px-4 py-2 text-right">耗时</th>
              <th class="px-4 py-2 text-right">Token</th>
              <th class="px-4 py-2 text-right">工具</th>
              <th class="px-4 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in result.cases" :key="c.id" class="border-t hover:bg-gray-50">
              <td class="px-4 py-2 font-mono text-xs">{{ c.id }}</td>
              <td class="px-4 py-2">{{ c.name }}</td>
              <td class="px-4 py-2">{{ statusEmoji(c.status) }}</td>
              <td class="px-4 py-2 text-right">{{ c.score?.toFixed(2) ?? "—" }}</td>
              <td class="px-4 py-2 text-right">{{ c.duration }}</td>
              <td class="px-4 py-2 text-right">{{ c.metrics.tokens.total }}</td>
              <td class="px-4 py-2 text-right">{{ c.metrics.tool_calls.total }}</td>
              <td class="px-4 py-2 text-right">
                <router-link :to="`/results/${runId}/cases/${c.id}`" class="text-blue-600 hover:underline">详情</router-link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { api } from "@/api/client";

const props = defineProps<{ runId: string }>();
const result = ref<any>(null);

onMounted(async () => {
  result.value = await api.getResult(props.runId);
});

function statusEmoji(s: string) {
  switch (s) {
    case "passed": return "✅";
    case "failed": return "❌";
    case "errored": return "💥";
    case "timeout": return "⌛";
    default: return "⏭";
  }
}
</script>
