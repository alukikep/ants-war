/**
 * LLM 运行时配置存储（仅内存，由用户在 UI 中显式输入）
 *
 * v0.3 改造：从"单 key"升级到"按 provider 分桶 + 当前 provider 选择"。
 *
 * 数据结构：
 * - `runtimeKeys`: Map<providerId, apiKey> —— 每个服务商一个 key
 * - `userConfig`: Map<providerId, { baseUrl, model }> —— 用户运行时覆盖
 *   baseUrl / model（允许临时切换 Custom 或预设里的其他 model）
 * - `activeProviderId`: 当前生效的服务商
 *
 * 安全设计（保留 + 强化）：
 * - 仅保存到模块作用域变量，不写入 localStorage / sessionStorage / cookie / IndexedDB
 * - 页面刷新即丢失，符合"用户每次会话显式输入"的隐私预期
 * - **不再自动读取 .env**：Vite 会把 VITE_* 变量编译期注入到前端 bundle，部署后任何
 *   访问者都可以在 DevTools / 静态资源里看到。把 .env 中的 key 用在前端相当于"明文发布"。
 *   因此本模块只接收用户在 UI 中输入的 key（runtime key）。
 * - 控制台日志里只输出脱敏后的 mask（"sk-****abcd"），避免明文泄漏到日志
 */

import {
  DEFAULT_PROVIDER_ID,
  findProvider,
  resolveProviderConfig,
  type LLMProvider,
} from '../ai/providers';

type Listener = () => void;

// ===== 模块作用域：仅运行时存活，刷新即清空 =====

/** 当前选中的 provider id（默认 deepseek，兼容旧用户） */
let activeProviderId: string = DEFAULT_PROVIDER_ID;

/** 每个 provider 的 API key（仅在用户在 UI 输入时写入） */
const runtimeKeys = new Map<string, string>();

/** 每个 provider 的 baseUrl / model 用户覆盖 */
const userConfig = new Map<string, { baseUrl: string; model: string }>();

/** 从 .env 注入的"开发辅助 key"已尝试标记（仅尝试一次） */
let envBootstrapped = false;

const listeners = new Set<Listener>();


/**
 * 把任意字符串脱敏为 "前2位 + **** + 末4位"。
 * 输入过短时整体显示为 "****"。
 */
export function maskKey(key: string | null | undefined): string {
  if (!key) return '****';
  const k = String(key);
  if (k.length <= 6) return '****';
  return `${k.slice(0, 2)}****${k.slice(-4)}`;
}

// ===== 兼容旧 API =====

/**
 * 当前生效的 key（仅 runtime，不再回退到 env）。
 *
 * 默认返回当前 provider 的 key。调用方（reloadAdvisor 等）已迁移到
 * `llmKeyStore.getKey()`，但保留此 API 防止外部脚本/调试时引用。
 */
export function getActiveKey(): string | null {
  return runtimeKeys.get(activeProviderId) ?? null;
}

/**
 * ⚠️ 不安全：直接读取 .env 编译期注入的 key。
 *
 * 仅在第一次调用时尝试从 `VITE_DEEPSEEK_API_KEY` 读取并写入 DeepSeek provider 的
 * runtime key（**仅当 DeepSeek 当前无 key 时才灌入**）。调用者必须明确知道这会把
 * key 暴露给前端 bundle——仅供本地 dev / Electron 调试使用。
 */
export function readEnvKeyUnsafe(): string | null {
  if (envBootstrapped) return runtimeKeys.get('deepseek') ?? null;
  envBootstrapped = true;
  const raw = (import.meta.env.VITE_DEEPSEEK_API_KEY as string | undefined) ?? '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'your_api_key_here') return null;
  if (!runtimeKeys.has('deepseek')) {
    runtimeKeys.set('deepseek', trimmed);
    notify();
  }
  return trimmed;
}

// ===== 主 store =====

export const llmKeyStore = {
  // -------- 当前 provider 选择 --------

  getActiveProviderId(): string {
    return activeProviderId;
  },

  setActiveProviderId(id: string): void {
    const next = findProvider(id).id; // 自动 fallback
    if (next === activeProviderId) return;
    activeProviderId = next;
    notify();
  },

  getActiveProvider(): LLMProvider {
    return findProvider(activeProviderId);
  },

  // -------- API Key（按 provider 分桶） --------

  getKey(providerId: string = activeProviderId): string | null {
    return runtimeKeys.get(providerId) ?? null;
  },

  hasKey(providerId: string = activeProviderId): boolean {
    return !!runtimeKeys.get(providerId);
  },

  /** 是否有任何 provider 配置了 key（用于顶部横幅的绿色徽章判定） */
  hasAnyKey(): boolean {
    return runtimeKeys.size > 0;
  },

  setKey(key: string, providerId: string = activeProviderId): void {
    const trimmed = key.trim();
    if (!trimmed) return;
    runtimeKeys.set(providerId, trimmed);
    notify();
  },

  clearKey(providerId: string = activeProviderId): void {
    runtimeKeys.delete(providerId);
    notify();
  },


  // -------- baseUrl / model 用户覆盖（按 provider 分桶） --------

  /**
   * 读取指定 provider 的用户覆盖配置。
   * 返回 null 表示完全用 provider 默认值。
   */
  getConfig(providerId: string = activeProviderId): { baseUrl: string; model: string } | null {
    return userConfig.get(providerId) ?? null;
  },

  /**
   * 设置指定 provider 的用户覆盖。
   * - 空字符串或 undefined 视为不覆盖（保留原值）
   * - baseUrl 自动去末尾斜杠
   */
  setConfig(
    cfg: { baseUrl?: string; model?: string },
    providerId: string = activeProviderId,
  ): void {
    const prev = userConfig.get(providerId) ?? { baseUrl: '', model: '' };
    const next = {
      baseUrl: (cfg.baseUrl ?? prev.baseUrl).trim().replace(/\/+$/, ''),
      model: (cfg.model ?? prev.model).trim(),
    };
    if (!next.baseUrl && !next.model) {
      userConfig.delete(providerId);
    } else {
      userConfig.set(providerId, next);
    }
    notify();
  },

  clearConfig(providerId: string = activeProviderId): void {
    userConfig.delete(providerId);
    notify();
  },

  // -------- 解析"最终生效配置"（给 advisor 用） --------

  resolveActive(): {
    providerId: string;
    provider: LLMProvider;
    apiKey: string;
    baseUrl: string;
    model: string;
  } | null {
    const provider = findProvider(activeProviderId);
    const apiKey = runtimeKeys.get(provider.id);
    if (!apiKey) return null;
    const { baseUrl, model } = resolveProviderConfig(
      provider,
      userConfig.get(provider.id) ?? null,
    );
    return { providerId: provider.id, provider, apiKey, baseUrl, model };
  },

  /** 兼容：source 仅作诊断用 */
  getSource(): 'runtime' | null {
    return runtimeKeys.get(activeProviderId) ? 'runtime' : null;
  },

  // -------- 订阅 --------

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

function notify() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* ignore listener errors */
    }
  });
}

