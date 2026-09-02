/**
 * LLM Provider 预设列表
 *
 * 目的：让用户在 UI 中选择 AI 服务商（DeepSeek / 硅基流动 / 月之暗面 / OpenAI /
 * OpenRouter / Ollama / 自定义），而不是被 DeepSeek 硬编码。
 *
 * 设计原则：
 * - 所有预设都是 OpenAI 兼容协议（`POST {baseUrl}/chat/completions`，Bearer auth，
 *   `response_format: json_object`），因此可复用同一个 `DeepSeekStrategicAdvisor` 类
 *   （该类名属于历史遗留，内部已通用化，未来如需重命名可平滑迁移）。
 * - Anthropic（Claude）API 格式不同（`x-api-key` header + `/v1/messages` + 无
 *   `response_format`），第一版**不支持**。如未来要加，新建
 *   `AnthropicStrategicAdvisor` 子类即可，不要往本表里塞。
 * - `modelCandidates` 仅用于 UI 下拉框提示，**用户仍可手动输入任意 model 字符串**
 *   （特别适合 Custom 和 OpenRouter 这种模型矩阵多变的网关）。
 * - 默认 baseUrl / model 仅作 fallback。运行时用户覆盖的 baseUrl/model 通过
 *   `llmKeyStore.setConfig()` 保存到内存（仍不写 localStorage）。
 *
 * 安全：baseUrl / model 不是敏感配置；只有 API key 是敏感的。
 */

export type LLMProviderVendor =
  | 'DeepSeek'
  | 'SiliconFlow'
  | 'OpenAI'
  | 'Moonshot'
  | 'OpenRouter'
  | 'Ollama'
  | 'Custom';

export interface LLMProvider {
  /** 唯一 id，用于 store key、advisor 日志 */
  id: string;
  /** UI 显示名（中文） */
  name: string;
  /** 服务提供方简称 */
  vendor: LLMProviderVendor;
  /** 默认 baseUrl（末尾不带 /）。Custom 时为空，由用户填写 */
  defaultBaseUrl: string;
  /** 默认 model id。Custom 时为空 */
  defaultModel: string;
  /** UI 下拉框候选模型（用户仍可自由输入） */
  modelCandidates: string[];
  /** API key 输入框的 placeholder 提示 */
  keyHint: string;
  /** 备注：显示在 UI 上帮用户判断选哪个 */
  note: string;
}

/**
 * 内置 provider 列表。
 *
 * 顺序 = UI 下拉框的顺序。把"国内直连"放前面方便大多数玩家。
 */
export const LLM_PROVIDERS: LLMProvider[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek（深度求索）',
    vendor: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    modelCandidates: ['deepseek-chat', 'deepseek-reasoner'],
    keyHint: 'sk-...',
    note: '国内直连 · 性价比高',
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow（硅基流动）',
    vendor: 'SiliconFlow',
    defaultBaseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'Qwen/Qwen2.5-72B-Instruct',
    modelCandidates: [
      'Qwen/Qwen2.5-72B-Instruct',
      'Qwen/Qwen2.5-32B-Instruct',
      'Qwen/Qwen2.5-7B-Instruct',
      'deepseek-ai/DeepSeek-V3',
      'deepseek-ai/DeepSeek-R1',
    ],
    keyHint: 'sk-...',
    note: '国内直连 · 多模型可选',
  },
  {
    id: 'moonshot',
    name: 'Moonshot（月之暗面 Kimi）',
    vendor: 'Moonshot',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    modelCandidates: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    keyHint: 'sk-...',
    note: '国内直连 · 长上下文',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    vendor: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    modelCandidates: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'o3-mini', 'o4-mini'],
    keyHint: 'sk-...',
    note: '需科学上网',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter（统一网关）',
    vendor: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'deepseek/deepseek-chat',
    modelCandidates: [
      'deepseek/deepseek-chat',
      'deepseek/deepseek-r1',
      'anthropic/claude-3.5-haiku',
      'google/gemini-2.0-flash-exp:free',
      'meta-llama/llama-3.3-70b-instruct',
    ],
    keyHint: 'sk-or-...',
    note: '一站式接入多家模型',
  },
  {
    id: 'ollama',
    name: 'Ollama（本地推理）',
    vendor: 'Ollama',
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultModel: 'qwen2.5:7b',
    modelCandidates: ['qwen2.5:7b', 'qwen2.5:14b', 'llama3.2:3b', 'deepseek-r1:7b'],
    keyHint: '任意字符串（本地无需 key）',
    note: '本地推理 · 需先启动 Ollama 服务',
  },
  {
    id: 'custom',
    name: '自定义（OpenAI 兼容）',
    vendor: 'Custom',
    defaultBaseUrl: '',
    defaultModel: '',
    modelCandidates: [],
    keyHint: 'sk-...',
    note: '自填 baseUrl + model，适用于任意 OpenAI 兼容服务',
  },
];

/** 默认 provider id（兼容旧用户） */
export const DEFAULT_PROVIDER_ID = 'deepseek';

/**
 * 根据 id 查找 provider；找不到时回退到 DeepSeek（保证 advisor 永远有合理默认）。
 */
export function findProvider(id: string | null | undefined): LLMProvider {
  if (!id) return LLM_PROVIDERS[0];
  return LLM_PROVIDERS.find((p) => p.id === id) ?? LLM_PROVIDERS[0];
}

/**
 * 计算"实际生效的 baseUrl / model"。
 *
 * 优先级：
 *   1. 用户运行时覆盖（llmKeyStore.setConfig）—— 让 Custom/特殊场景能临时改
 *   2. provider 默认值
 */
export function resolveProviderConfig(
  provider: LLMProvider,
  userOverride: { baseUrl?: string; model?: string } | null,
): { baseUrl: string; model: string } {
  const baseUrl =
    userOverride?.baseUrl?.trim() || provider.defaultBaseUrl || '';
  const model = userOverride?.model?.trim() || provider.defaultModel || '';
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    model,
  };
}
