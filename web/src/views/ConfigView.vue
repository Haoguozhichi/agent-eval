<template>
  <div class="max-w-6xl mx-auto space-y-6">
    <h2 class="text-xl font-bold">评测配置</h2>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Config Form -->
      <div class="bg-white rounded-lg shadow p-6 space-y-4">
        <h3 class="font-semibold text-gray-700">eval.config.json</h3>

        <div class="space-y-3">
          <label class="block">
            <span class="text-sm text-gray-600">评测名称</span>
            <input v-model="config.name" class="input" placeholder="my-eval" />
          </label>

          <label class="block">
            <span class="text-sm text-gray-600">描述</span>
            <input v-model="config.description" class="input" placeholder="评测描述" />
          </label>

          <label class="block">
            <span class="text-sm text-gray-600">模型 (provider/model)</span>
            <input v-model="config.opencode.model" class="input" placeholder="lmstudio/qwen3.5-9b" />
          </label>

          <div class="border rounded p-3 space-y-2">
            <span class="text-sm font-medium text-gray-600">Provider 配置</span>
            <textarea v-model="providerJson" rows="6" class="input font-mono text-xs" placeholder='{"lmstudio": {...}}'></textarea>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <label class="block">
              <span class="text-sm text-gray-600">并发数</span>
              <input v-model.number="config.execution.concurrency" type="number" min="1" class="input" />
            </label>
            <label class="block">
              <span class="text-sm text-gray-600">用例超时 (ms)</span>
              <input v-model.number="config.execution.case_timeout_ms" type="number" class="input" />
            </label>
          </div>

          <label class="block">
            <span class="text-sm text-gray-600">全局超时 (ms)</span>
            <input v-model.number="config.execution.global_timeout_ms" type="number" class="input" />
          </label>

          <!-- Judge Section -->
          <div class="border rounded p-3 space-y-3">
            <label class="flex items-center gap-2">
              <input type="checkbox" v-model="hasJudge" />
              <span class="text-sm font-medium text-gray-600">启用 LLM 裁判</span>
            </label>
            <template v-if="hasJudge">
              <div class="grid grid-cols-2 gap-3">
                <label class="block">
                  <span class="text-xs text-gray-500">裁判模型</span>
                  <input v-model="config.judge.model" class="input" placeholder="qwen3.5-9b" />
                </label>
                <label class="block">
                  <span class="text-xs text-gray-500">API 地址</span>
                  <input v-model="config.judge.base_url" class="input" placeholder="http://127.0.0.1:1234/v1" />
                </label>
              </div>
              <label class="block">
                <span class="text-xs text-gray-500">API Key</span>
                <input v-model="config.judge.api_key" class="input" placeholder="empty" />
              </label>

              <!-- Scoring Dimensions -->
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-medium text-gray-600">评分维度</span>
                  <div class="flex items-center gap-3">
                    <label class="text-xs text-gray-500">
                      量表: <input v-model.number="config.judge.scoring.scale" type="number" min="1" class="w-12 border rounded px-1 text-center" />
                    </label>
                    <label class="text-xs text-gray-500">
                      通过阈值: <input v-model.number="config.judge.scoring.pass_threshold" type="number" min="0" class="w-12 border rounded px-1 text-center" />
                    </label>
                  </div>
                </div>
                <div class="space-y-1">
                  <div v-for="(dim, i) in config.judge.scoring.dimensions" :key="i" class="flex items-center gap-2">
                    <input v-model="dim.name" class="input flex-1 text-xs" placeholder="名称" />
                    <input v-model.number="dim.weight" type="number" step="0.1" min="0" class="input w-16 text-xs" placeholder="权重" />
                    <input v-model="dim.description" class="input flex-[2] text-xs" placeholder="描述" />
                    <button @click="removeDimension(i)" class="text-red-400 hover:text-red-600 text-sm">✕</button>
                  </div>
                </div>
                <button @click="addDimension" class="text-xs text-blue-600 hover:underline">+ 添加维度</button>
              </div>
            </template>
          </div>
        </div>

        <button @click="saveConfig" class="btn-primary">保存配置</button>
        <span v-if="configSaved" class="text-sm text-green-600 ml-2">已保存</span>
      </div>

      <!-- Dataset Editor -->
      <div class="bg-white rounded-lg shadow p-6 space-y-4">
        <h3 class="font-semibold text-gray-700">dataset.json</h3>

        <div
          @drop.prevent="onDrop"
          @dragover.prevent="dragOver = true"
          @dragleave="dragOver = false"
          :class="['border-2 border-dashed rounded-lg p-4 text-center transition-colors', dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300']"
        >
          <p class="text-sm text-gray-500">拖拽 JSON 文件到此处，或</p>
          <label class="text-sm text-blue-600 cursor-pointer hover:underline">
            点击选择文件
            <input type="file" accept=".json" class="hidden" @change="onFileSelect" />
          </label>
        </div>

        <textarea
          v-model="datasetJson"
          rows="20"
          class="input font-mono text-xs"
          placeholder="在此编辑 dataset JSON..."
        ></textarea>

        <div class="flex gap-2">
          <button @click="saveDataset" class="btn-primary">保存数据集</button>
          <span v-if="datasetSaved" class="text-sm text-green-600 self-center">已保存</span>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex gap-3">
      <button @click="validate" class="btn-secondary">验证配置</button>
      <button @click="startRun" class="btn-primary">开始评测</button>
    </div>
    <p v-if="message" :class="['text-sm', messageType === 'error' ? 'text-red-600' : 'text-green-600']">{{ message }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { api } from "@/api/client";

const router = useRouter();

const config = ref<any>({
  name: "",
  description: "",
  opencode: { model: "", provider: {}, mcp: {}, skills: {}, permission: {} },
  execution: { concurrency: 2, case_timeout_ms: 300000, global_timeout_ms: 3600000 },
  judge: {
    type: "openai_compatible",
    model: "",
    base_url: "",
    api_key: "",
    scoring: { scale: 10, pass_threshold: 6, dimensions: [] },
  },
  dataset: "./dataset.json",
});

const hasJudge = ref(false);
const providerJson = ref("{}");
const datasetJson = ref("{}");
const configSaved = ref(false);
const datasetSaved = ref(false);
const dragOver = ref(false);
const message = ref("");
const messageType = ref<"success" | "error">("success");

onMounted(async () => {
  try {
    const cfg = await api.getConfig();
    Object.assign(config.value, cfg);
    hasJudge.value = !!(cfg as any).judge;
    if (!config.value.judge) {
      config.value.judge = {
        type: "openai_compatible", model: "", base_url: "", api_key: "",
        scoring: { scale: 10, pass_threshold: 6, dimensions: [] },
      };
    }
    if (!config.value.judge.scoring) {
      config.value.judge.scoring = { scale: 10, pass_threshold: 6, dimensions: [] };
    }
    providerJson.value = JSON.stringify(config.value.opencode?.provider ?? {}, null, 2);
  } catch {}
  try {
    const ds = await api.getDataset();
    datasetJson.value = JSON.stringify(ds, null, 2);
  } catch {}
});

function addDimension() {
  config.value.judge.scoring.dimensions.push({ name: "", weight: 1, description: "" });
}

function removeDimension(i: number) {
  config.value.judge.scoring.dimensions.splice(i, 1);
}

async function saveConfig() {
  try {
    config.value.opencode.provider = JSON.parse(providerJson.value);
    const toSave = { ...config.value };
    if (!hasJudge.value) delete toSave.judge;
    await api.saveConfig(toSave);
    configSaved.value = true;
    setTimeout(() => (configSaved.value = false), 2000);
  } catch (err) {
    message.value = `配置保存失败: ${(err as Error).message}`;
    messageType.value = "error";
  }
}

async function saveDataset() {
  try {
    const parsed = JSON.parse(datasetJson.value);
    await api.saveDataset(parsed);
    datasetSaved.value = true;
    setTimeout(() => (datasetSaved.value = false), 2000);
  } catch (err) {
    message.value = `数据集保存失败: ${(err as Error).message}`;
    messageType.value = "error";
  }
}

function onDrop(e: DragEvent) {
  dragOver.value = false;
  const file = e.dataTransfer?.files[0];
  if (file) readFile(file);
}

function onFileSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) readFile(file);
}

function readFile(file: File) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      JSON.parse(reader.result as string);
      datasetJson.value = reader.result as string;
      message.value = `已加载 ${file.name}`;
      messageType.value = "success";
    } catch {
      message.value = "文件不是有效的 JSON";
      messageType.value = "error";
    }
  };
  reader.readAsText(file);
}

async function validate() {
  try {
    await saveConfig();
    await saveDataset();
    message.value = "配置和数据集验证通过";
    messageType.value = "success";
  } catch (err) {
    message.value = `验证失败: ${(err as Error).message}`;
    messageType.value = "error";
  }
}

async function startRun() {
  try {
    await saveConfig();
    await saveDataset();
    await api.startRun();
    router.push("/run");
  } catch (err) {
    message.value = `启动失败: ${(err as Error).message}`;
    messageType.value = "error";
  }
}
</script>

<style scoped>
.input {
  @apply w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400;
}
.btn-primary {
  @apply px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors;
}
.btn-secondary {
  @apply px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 transition-colors;
}
</style>
