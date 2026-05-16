<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <div class="flex items-center gap-3">
      <router-link :to="`/results/${runId}`" class="text-blue-600 hover:underline text-sm">&larr; 返回结果</router-link>
      <h2 class="text-xl font-bold">{{ caseId }}</h2>
    </div>

    <!-- Tabs -->
    <div class="flex border-b">
      <button v-for="tab in tabs" :key="tab.key"
        @click="activeTab = tab.key"
        :class="['px-4 py-2 text-sm', activeTab === tab.key ? 'border-b-2 border-blue-600 text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700']"
      >{{ tab.label }}</button>
    </div>

    <!-- Validators -->
    <div v-if="activeTab === 'validators'" class="bg-white rounded-lg shadow overflow-hidden">
      <table class="w-full text-sm" v-if="caseData">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-2 text-left">类型</th>
            <th class="px-4 py-2 text-left">结果</th>
            <th class="px-4 py-2 text-right">得分</th>
            <th class="px-4 py-2 text-left">说明</th>
            <th class="px-4 py-2 text-right">耗时</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="v in caseData.validators" :key="v.type" class="border-t">
            <td class="px-4 py-2 font-mono text-xs">{{ v.type }}</td>
            <td class="px-4 py-2">{{ v.passed ? '✅' : '❌' }}</td>
            <td class="px-4 py-2 text-right">{{ v.score?.toFixed(2) ?? '—' }}</td>
            <td class="px-4 py-2 text-gray-600">{{ v.message }}</td>
            <td class="px-4 py-2 text-right">{{ v.duration }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Messages -->
    <div v-if="activeTab === 'messages'" class="space-y-3">
      <div v-if="!messages" class="text-gray-500 text-sm">加载中...</div>
      <div v-else v-for="(msg, i) in messages" :key="i"
        :class="['rounded-lg p-4', roleStyle(msg.info?.role)]"
      >
        <div class="text-xs text-gray-500 mb-1 font-medium">{{ roleLabel(msg.info?.role) }}</div>
        <div v-for="(part, j) in msg.parts" :key="j" class="mt-1">
          <template v-if="part.type === 'text'">
            <pre class="whitespace-pre-wrap text-sm">{{ part.text }}</pre>
          </template>
          <template v-else-if="part.type === 'tool'">
            <div class="bg-gray-100 rounded p-2 text-xs font-mono">
              <span class="font-bold text-blue-700">{{ part.tool }}</span>
              <span :class="['ml-2', part.state?.status === 'completed' ? 'text-green-600' : 'text-red-600']">
                {{ part.state?.status }}
              </span>
              <details v-if="part.state?.input" class="mt-1">
                <summary class="cursor-pointer text-gray-500">输入</summary>
                <pre class="mt-1 text-xs overflow-auto max-h-40">{{ JSON.stringify(part.state.input, null, 2) }}</pre>
              </details>
              <details v-if="part.state?.output" class="mt-1">
                <summary class="cursor-pointer text-gray-500">输出</summary>
                <pre class="mt-1 text-xs overflow-auto max-h-40">{{ part.state.output }}</pre>
              </details>
            </div>
          </template>
          <template v-else-if="part.type === 'reasoning'">
            <details class="text-xs text-gray-400">
              <summary class="cursor-pointer">思考过程</summary>
              <pre class="mt-1 whitespace-pre-wrap">{{ part.reasoning }}</pre>
            </details>
          </template>
        </div>
      </div>
    </div>

    <!-- Files -->
    <div v-if="activeTab === 'files'" class="bg-white rounded-lg shadow p-4">
      <div v-if="!files" class="text-gray-500 text-sm">加载中...</div>
      <div v-else-if="files.length === 0" class="text-gray-500 text-sm">无文件</div>
      <div v-else class="space-y-2">
        <div v-for="f in files" :key="f.path"
          @click="f.type === 'file' && loadFile(f.path)"
          :class="['text-sm cursor-pointer hover:bg-gray-50 px-2 py-1 rounded flex items-center gap-2', f.type === 'directory' ? 'text-gray-400' : 'text-blue-600']"
        >
          <span>{{ f.type === 'directory' ? '📁' : '📄' }}</span>
          <span class="font-mono text-xs">{{ f.path }}</span>
          <span v-if="f.size" class="text-gray-400 text-xs ml-auto">{{ f.size }}B</span>
        </div>

        <div v-if="fileContent" class="mt-4 border rounded p-3">
          <div class="text-xs text-gray-500 mb-2 font-mono">{{ fileContent.path }}</div>
          <pre class="text-xs overflow-auto max-h-96 bg-gray-50 p-3 rounded">{{ fileContent.content }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { api } from "@/api/client";

const props = defineProps<{ runId: string; caseId: string }>();

const tabs = [
  { key: "validators", label: "验证器" },
  { key: "messages", label: "对话日志" },
  { key: "files", label: "工作区文件" },
];
const activeTab = ref("validators");

const caseData = ref<any>(null);
const messages = ref<any[] | null>(null);
const files = ref<any[] | null>(null);
const fileContent = ref<any>(null);

onMounted(async () => {
  const result = await api.getResult(props.runId) as any;
  caseData.value = result.cases?.find((c: any) => c.id === props.caseId);

  api.getMessages(props.runId, props.caseId).then((m) => (messages.value = m)).catch(() => {});
  api.getFiles(props.runId, props.caseId).then((f) => (files.value = f as any[])).catch(() => (files.value = []));
});

async function loadFile(path: string) {
  fileContent.value = await api.getFileContent(props.runId, props.caseId, path);
}

function roleStyle(role?: string) {
  switch (role) {
    case "user": return "bg-blue-50 border border-blue-200";
    case "assistant": return "bg-gray-50 border border-gray-200";
    default: return "bg-yellow-50 border border-yellow-200";
  }
}

function roleLabel(role?: string) {
  switch (role) {
    case "user": return "用户";
    case "assistant": return "Agent";
    case "system": return "系统";
    default: return role ?? "未知";
  }
}
</script>
