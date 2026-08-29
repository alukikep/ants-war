/**
 * LLM API Key 内存存储（仅运行时，由用户在 UI 中显式输入）
 *
 * 安全设计（已强化）：
 * - 仅保存到模块作用域变量，不写入 localStorage / sessionStorage / cookie / IndexedDB
 * - 页面刷新即丢失，符合"用户每次会话显式输入"的隐私预期
 * - **不再自动读取 .env**：Vite 会把 VITE_* 变量编译期注入到前端 bundle，部署后任何
 *   访问者都可以在 DevTools / 静态资源里看到。把 .env 中的 key 用在前端相当于"明文发布"。
 *   因此本模块只接收用户在 UI 中输入的 key（runtime key）。
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

/**
 * 当前生效的 key（仅 runtime，不再回退到 env）。
 *
 * 历史上曾回退到 `import.meta.env.VITE_DEEPSEEK_API_KEY`，但该路径会把 key 打包进前端
 * bundle，部署后任何用户都能看到，属于明文泄漏。已经移除该回退。
 *
 * 如确需读取 .env key（**强烈不推荐**，仅用于本地 dev + 部署到受信任的环境），可以
 * 直接调用 `readEnvKeyUnsafe()`，但默认代码路径不再使用它。
 */
export function getActiveKey(): string | null {
  return runtimeKey;
}

/**
 * ⚠️ 不安全：直接读取 .env 编译期注入的 key。
 *
 * 调用者必须明确知道这会把 key 暴露给前端 bundle。仅供特殊场景（如本地 Electron 调试）
 * 通过调试入口显式调用。常规 UI / Hook 路径请使用 `getActiveKey()` / `llmKeyStore.getKey()`。
 */
export function readEnvKeyUnsafe(): string | null {
  const raw = (import.meta.env.VITE_DEEPSEEK_API_KEY as string | undefined) ?? '';
  const trimmed = raw.trim();
  // 即便值是示例占位符（your_api_key_here）也视为未配置
  if (!trimmed || trimmed === 'your_api_key_here') return null;
  return trimmed;
}

export const llmKeyStore = {
  /** 读取当前运行时 key */
  getKey(): string | null {
    return runtimeKey;
  },

  /** 当前生效 key 的来源：'runtime' | null（已移除 'env' 自动回退） */
  getSource(): 'runtime' | null {
    return runtimeKey ? 'runtime' : null;
  },

  /** 是否配置了任何可用 key */
  hasKey(): boolean {
    return !!runtimeKey;
  },

  /** 设置运行时 key（空白字符串视为无效，忽略） */
  setKey(key: string): void {
    const trimmed = key.trim();
    if (!trimmed) return;
    runtimeKey = trimmed;
    notify();
  },

  /** 清除运行时 key */
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