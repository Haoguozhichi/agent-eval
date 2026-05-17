<template>
  <div class="max-w-6xl mx-auto space-y-6">
    <h2 class="text-xl font-bold">评测配置</h2>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Left: Config Form -->
      <div class="space-y-4">
        <!-- Basic -->
        <div class="bg-white rounded-lg shadow p-5 space-y-3">
          <h3 class="font-semibold text-gray-700">基本配置</h3>
          <label class="block">
            <span class="text-sm text-gray-600">评测名称</span>
            <input v-model="config.name" class="input" placeholder="my-eval" />
          </label>
          <label class="block">
            <span class="text-sm text-gray-600">模型 (provider/model)</span>
            <input v-model="config.opencode.model" class="input" placeholder="lmstudio/qwen3.5-9b" />
          </label>
          <div class="border rounded p-3 space-y-2">
            <span class="text-sm font-medium text-gray-600">Provider 配置 (JSON)</span>
            <textarea v-model="providerJson" rows="5" class="input font-mono text-xs"></textarea>
          </div>
          <div class="grid grid-cols-3 gap-3">
            <label class="block">
              <span class="text-xs text-gray-500">并发数</span>
              <input v-model.number="config.execution.concurrency" type="number" min="1" class="input" />
            </label>
            <label class="block">
              <span class="text-xs text-gray-500">用例超时(ms)</span>
              <input v-model.number="config.execution.case_timeout_ms" type="number" class="input" />
            </label>
            <label class="block">
              <span class="text-xs text-gray-500">全局超时(ms)</span>
              <input v-model.number="config.execution.global_timeout_ms" type="number" class="input" />
            </label>
          </div>
        </div>

        <!-- MCP -->
        <div class="bg-white rounded-lg shadow p-5 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-gray-700">MCP 服务器</h3>
            <div class="flex gap-2">
              <button @click="mcpMode = 'form'" :class="['text-xs px-2 py-1 rounded', mcpMode === 'form' ? 'bg-blue-100 text-blue-700' : 'text-gray-500']">表单</button>
              <button @click="mcpMode = 'json'" :class="['text-xs px-2 py-1 rounded', mcpMode === 'json' ? 'bg-blue-100 text-blue-700' : 'text-gray-500']">JSON</button>
            </div>
          </div>

          <template v-if="mcpMode === 'form'">
            <div v-for="(server, i) in mcpServers" :key="i" class="border rounded p-3 space-y-2">
              <div class="flex items-center gap-2">
                <input v-model="server.name" class="input flex-1 text-xs" placeholder="服务器名称" />
                <select v-model="server.type" class="input w-24 text-xs">
                  <option value="url">远程 URL</option>
                  <option value="command">本地命令</option>
                </select>
                <button @click="mcpServers.splice(i, 1)" class="text-red-400 hover:text-red-600">✕</button>
              </div>
              <input v-if="server.type === 'url'" v-model="server.url" class="input text-xs" placeholder="https://mcp.example.com/mcp" />
              <template v-else>
                <input v-model="server.command" class="input text-xs" placeholder="命令 (如 npx)" />
                <input v-model="server.args" class="input text-xs" placeholder="参数 (逗号分隔)" />
              </template>
            </div>
            <button @click="addMcpServer" class="text-xs text-blue-600 hover:underline">+ 添加 MCP 服务器</button>
          </template>

          <template v-else>
            <textarea v-model="mcpJson" rows="6" class="input font-mono text-xs" placeholder='{"server-name": {"url": "..."}}'></textarea>
          </template>
        </div>

        <!-- Skills -->
        <div class="bg-white rounded-lg shadow p-5 space-y-3">
          <h3 class="font-semibold text-gray-700">Skills</h3>
          <p class="text-xs text-gray-500">选择要加载的 Skill（放在 data/skills/ 目录下的 .md 文件）</p>
          <div v-if="availableSkills.length === 0" class="text-xs text-gray-400">暂无可用 Skill</div>
          <div v-else class="space-y-1">
            <label v-for="skill in availableSkills" :key="skill.name" class="flex items-center gap-2 text-sm">
              <input type="checkbox" :value="skill.name" v-model="selectedSkills" />
              <span class="font-mono text-xs">{{ skill.name }}</span>
            </label>
          </div>
        </div>

        <!-- Judge -->
        <div class="bg-white rounded-lg shadow p-5 space-y-3">
          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="hasJudge" />
            <span class="font-semibold text-gray-700">LLM 裁判</span>
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
            <div class="border-t pt-3 space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-gray-600">评分维度</span>
                <div class="flex items-center gap-4 text-xs text-gray-500">
                  <label>量表: <input v-model.number="config.judge.scoring.scale" type="number" min="1" class="w-12 border rounded px-1 text-center" /></label>
                  <label>通过阈值: <input v-model.number="config.judge.scoring.pass_threshold" type="number" min="0" class="w-12 border rounded px-1 text-center" /></label>
                </div>
              </div>

              <div v-for="(dim, i) in config.judge.scoring.dimensions" :key="i" class="border rounded p-3 space-y-2 bg-gray-50">
                <div class="flex items-center gap-2">
                  <input v-model="dim.name" class="input flex-1 text-sm font-medium" placeholder="维度名称（如 correctness）" />
                  <label class="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap">
                    权重:
                    <input v-model.number="dim.weight" type="number" step="0.1" min="0" class="w-14 border rounded px-1 text-center" />
                  </label>
                  <button @click="config.judge.scoring.dimensions.splice(i, 1)" class="text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
                </div>
                <textarea v-model="dim.description" rows="2" class="input text-xs" placeholder="评分细节描述（裁判会根据此描述打分）"></textarea>
                <div class="text-xs text-gray-400 text-right">占比: {{ dimensionPercent(dim.weight) }}%</div>
              </div>

              <button @click="addDimension" class="text-sm text-blue-600 hover:underline">+ 添加评分维度</button>
            </div>
          </template>
        </div>
      </div>

      <!-- Right: Dataset Editor -->
      <div class="space-y-4">
        <div class="bg-white rounded-lg shadow p-5 space-y-4">
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
            rows="28"
            class="input font-mono text-xs"
            placeholder="在此编辑 dataset JSON..."
          ></textarea>

          <button @click="saveDataset" class="btn-primary">保存数据集</button>
          <span v-if="datasetSaved" class="text-sm text-green-600 ml-2">已保存</span>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex gap-3 items-center">
      <button @click="saveAll" class="btn-secondary">保存全部</button>
      <button @click="startRun" class="btn-primary">开始评测</button>
      <p v-if="message" :class="['text-sm', messageType === 'error' ? 'text-red-600' : 'text-green-600']">{{ message }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { api } from "@/api/client";

const router = useRouter();

const config = ref<any>({
  name: "",
  description: "",
  opencode: { model: "", provider: {}, mcp: {}, skills: [], permission: {} },
  execution: { concurrency: 2, case_timeout_ms: 300000, global_timeout_ms: 3600000 },
  judge: {
    type: "openai_compatible", model: "", base_url: "", api_key: "",
    scoring: { scale: 10, pass_threshold: 6, dimensions: [] },
  },
  dataset: "./dataset.json",
});

const hasJudge = ref(false);
const providerJson = ref("{}");
const mcpMode = ref<"form" | "json">("form");
const mcpJson = ref("{}");
const mcpServers = ref<any[]>([]);
const selectedSkills = ref<string[]>([]);
const availableSkills = ref<{ name: string; file: string }[]>([]);
const datasetJson = ref("{}");
const configSaved = ref(false);
const datasetSaved = ref(false);
const dragOver = ref(false);
const message = ref("");
const messageType = ref<"success" | "error">("success");

onMounted(async () => {
  // Load config
  try {
    const cfg = await api.getConfig() as any;
    Object.assign(config.value, cfg);
    hasJudge.value = !!cfg.judge;
    if (!config.value.judge) {
      config.value.judge = { type: "openai_compatible", model: "", base_url: "", api_key: "", scoring: { scale: 10, pass_threshold: 6, dimensions: [] } };
    }
    if (!config.value.judge.scoring) {
      config.value.judge.scoring = { scale: 10, pass_threshold: 6, dimensions: [] };
    }
    providerJson.value = JSON.stringify(config.value.opencode?.provider ?? {}, null, 2);
    selectedSkills.value = config.value.opencode?.skills ?? [];

    // Parse MCP into form
    const mcp = config.value.opencode?.mcp ?? {};
    mcpServers.value = Object.entries(mcp).map(([name, cfg]: [string, any]) => ({
      name,
      type: cfg.url ? "url" : "command",
      url: cfg.url ?? "",
      command: cfg.command ?? "",
      args: (cfg.args ?? []).join(", "),
    }));
    mcpJson.value = JSON.stringify(mcp, null, 2);
  } catch {}

  // Load dataset
  try {
    const ds = await api.getDataset();
    datasetJson.value = JSON.stringify(ds, null, 2);
  } catch {}

  // Load available skills
  try {
    availableSkills.value = await api.getSkills() as any[];
  } catch {}
});

function addMcpServer() {
  mcpServers.value.push({ name: "", type: "url", url: "", command: "", args: "" });
}

function addDimension() {
  config.value.judge.scoring.dimensions.push({ name: "", weight: 1, description: "" });
}

function dimensionPercent(weight: number): string {
  const total = config.value.judge.scoring.dimensions.reduce((s: number, d: any) => s + (d.weight || 0), 0);
  if (total === 0) return "0";
  return ((weight / total) * 100).toFixed(0);
}

function buildMcpConfig(): Record<string, unknown> {
  if (mcpMode.value === "json") {
    try { return JSON.parse(mcpJson.value); } catch { return {}; }
  }
  const result: Record<string, unknown> = {};
  for (const s of mcpServers.value) {
    if (!s.name) continue;
    if (s.type === "url") {
      result[s.name] = { url: s.url };
    } else {
      const args = s.args ? s.args.split(",").map((a: string) => a.trim()).filter(Boolean) : [];
      result[s.name] = { command: s.command, args };
    }
  }
  return result;
}

async function saveAll() {
  try {
    config.value.opencode.provider = JSON.parse(providerJson.value);
    config.value.opencode.mcp = buildMcpConfig();
    config.value.opencode.skills = selectedSkills.value;
    const toSave = { ...config.value };
    if (!hasJudge.value) delete toSave.judge;
    await api.saveConfig(toSave);

    const parsed = JSON.parse(datasetJson.value);
    await api.saveDataset(parsed);

    message.value = "配置和数据集已保存";
    messageType.value = "success";
    setTimeout(() => (message.value = ""), 2000);
  } catch (err) {
    message.value = `保存失败: ${(err as Error).message}`;
    messageType.value = "error";
  }
}

async function saveDataset() {
  try {
    await api.saveDataset(JSON.parse(datasetJson.value));
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

async function startRun() {
  try {
    await saveAll();
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
