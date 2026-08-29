/**
 * LLM API Key 内存存储（仅运行时）
 *
 * 本地运行安全设计：
 * - 仅保存到模块作用域变量，不写入 localStorage / sessionStorage / cookie / IndexedDB
 * - 页面刷新即丢失，符合"用户每次会话显式输入"的隐私预期
 * - 提供订阅机制，方便 React 组件在不持有 key 明文的情况下刷新 UI 状态
 * - 控制台日志里只输出脱敏后的 mask（"sk-****abcd"），避免明文泄漏到日志
 */

type Listener = () => void;

// 模块作用域：仅运行时存活，刷新即清空
let runtimeKey: string | null = null;

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

/** 读取 .env 中编译期注入的 key（不一定存在，取决于用户是否配了 .env） */
export function getEnvKey(): string | null {
  const raw = (import.meta.env.VITE_DEEPSEEK_API_KEY as string | undefined) ?? '';
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** 当前真正生效的 key：运行时 key 优先 > env key */
export function getActiveKey(): string | null {
  return runtimeKey || getEnvKey();
}

export const llmKeyStore = {
  /** 读取当前运行时 key（不读 env key） */
  getKey(): string | null {
    return runtimeKey;
  },

  /** 当前生效 key 的来源：'runtime' | 'env' | null */
  getSource(): 'runtime' | 'env' | null {
    if (runtimeKey) return 'runtime';
    if (getEnvKey()) return 'env';
    return null;
  },

  /** 是否配置了任何可用 key */
  hasKey(): boolean {
    return !!getActiveKey();
  },

  /** 设置运行时 key（空白字符串视为无效，忽略） */
  setKey(key: string): void {
    const trimmed = key.trim();
    if (!trimmed) return;
    runtimeKey = trimmed;
    notify();
  },

  /** 清除运行时 key（不影响 env key） */
  clearKey(): void {
    runtimeKey = null;
    notify();
  },

  /** 订阅 key 状态变化，返回退订函数 */
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