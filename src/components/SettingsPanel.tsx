/**
 * 设置面板（顶部触发按钮 + 模态弹窗 + 顶部提示横幅）
 *
 * 主要功能：让玩家输入 DeepSeek API Key 来启用 LLM 战略顾问。
 *
 * 本地运行安全设计：
 * - 输入框默认 type="password"，可点 👁 切换显示
 * - 提交后立即清空输入框（防止 DevTools DOM 抓取）
 * - 仅保存到模块级 llmKeyStore，不写 localStorage / cookie / IndexedDB
 * - 不在 console.log 中输出明文 key
 *
 * 优先级：用户在 UI 中输入的运行时 key > .env 编译期注入的 key
 *
 * 视觉层次（从最显眼的入口到最细节）：
 * 1. APIKeyHint 横幅 — 未配置时顶部醒目黄色 CTA，已配置时紧凑绿色徽章
 * 2. 左上角 SettingsPanel — 带文字标签（"AI 已启用"/"AI 未启用"）和状态点
 * 3. SettingsModal — 完整配置 UI
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { llmKeyStore, maskKey, getEnvKey } from '../store/llmKeyStore';
import { reloadAdvisor } from '../hooks/usePixiApp';

type TestState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok' }
  | { kind: 'fail'; message: string };

/** 共用的"当前 LLM 状态" hook */
function useLLMStatus() {
  const [hasEnvKey, setHasEnvKey] = useState<boolean>(!!getEnvKey());
  const [hasRuntimeKey, setHasRuntimeKey] = useState<boolean>(!!llmKeyStore.getKey());

  useEffect(() => {
    const refresh = () => {
      setHasEnvKey(!!getEnvKey());
      setHasRuntimeKey(!!llmKeyStore.getKey());
    };
    refresh();
    return llmKeyStore.subscribe(refresh);
  }, []);

  return { hasEnvKey, hasRuntimeKey, hasAnyKey: hasEnvKey || hasRuntimeKey };
}

// ===== 顶部提示横幅 =====
// 未配置时显示醒目黄色 CTA，已配置时显示紧凑绿色徽章
export const APIKeyHint: React.FC = () => {
  const { hasAnyKey } = useLLMStatus();
  const [open, setOpen] = useState(false);

  if (hasAnyKey) {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="w-full bg-gradient-to-r from-green-900/40 to-emerald-900/40 border-b border-green-500/40 px-4 py-1.5 flex items-center justify-center gap-2 text-xs font-game hover:from-green-900/60 hover:to-emerald-900/60 transition-colors group"
          title="点击查看或修改 LLM 设置"
        >
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          <span className="text-green-300">🤖 AI 战略顾问：已启用</span>
          <span className="text-green-500/70 group-hover:text-green-300 transition-colors">
            点击管理 →
          </span>
        </button>
        <SettingsModal open={open} onClose={() => setOpen(false)} />
      </>
    );
  }

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        className="w-full cursor-pointer bg-gradient-to-r from-yellow-600/40 via-amber-500/40 to-yellow-600/40 border-b-2 border-yellow-400/70 px-4 py-2.5 flex items-center justify-center gap-3 hover:from-yellow-600/60 hover:via-amber-500/60 hover:to-yellow-600/60 transition-all"
        role="button"
        title="点击填写 DeepSeek API Key 启用 LLM 战略顾问"
      >
        <span className="text-2xl animate-bounce">🤖</span>
        <div className="flex flex-col items-start">
          <span className="text-yellow-200 font-game font-bold text-sm">
            启用 AI 战略顾问，让你的对手更聪明！
          </span>
          <span className="text-yellow-300/70 text-xs">
            需要 DeepSeek API Key（仅保存在内存，刷新即清空）
          </span>
        </div>
        <span className="ml-4 px-4 py-1.5 bg-yellow-400 text-yellow-900 font-game font-bold text-sm rounded shadow-lg hover:bg-yellow-300 transition-colors">
          🔑 立即配置 API Key
        </span>
      </div>
      <SettingsModal open={open} onClose={() => setOpen(false)} />
    </>
  );
};

// ===== 模态弹窗（hooks + handlers）=====
const SettingsModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [input, setInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const { hasEnvKey, hasRuntimeKey } = useLLMStatus();
  const [testState, setTestState] = useState<TestState>({ kind: 'idle' });
  const pendingKeyRef = useRef<string | null>(null);

  const handleSave = useCallback(async () => {
    const key = input.trim();
    if (!key) return;
    pendingKeyRef.current = key;
    llmKeyStore.setKey(key);
    setInput('');
    setShowKey(false);
    onClose();
    setTestState({ kind: 'idle' });
    await reloadAdvisor();
  }, [input, onClose]);

  const handleTest = useCallback(async () => {
    const key = input.trim() || pendingKeyRef.current;
    if (!key) {
      setTestState({ kind: 'fail', message: '请先输入 API Key' });
      return;
    }
    setTestState({ kind: 'testing' });
    try {
      const baseUrl =
        (import.meta.env.VITE_DEEPSEEK_BASE_URL as string | undefined) ||
        'https://api.deepseek.com';
      const model =
        (import.meta.env.VITE_DEEPSEEK_MODEL as string | undefined) ||
        'deepseek-chat';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 4,
          stream: false,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (resp.ok) {
        setTestState({ kind: 'ok' });
      } else if (resp.status === 401 || resp.status === 403) {
        setTestState({ kind: 'fail', message: 'Key 无效或无权限（HTTP ' + resp.status + '）' });
      } else {
        const text = await resp.text().catch(() => '');
        setTestState({ kind: 'fail', message: 'HTTP ' + resp.status + '：' + text.slice(0, 100) });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setTestState({ kind: 'fail', message: '请求超时（>10s）' });
      } else {
        setTestState({ kind: 'fail', message: String((err as Error)?.message || err) });
      }
    }
  }, [input]);

  const handleClearRuntime = useCallback(async () => {
    llmKeyStore.clearKey();
    pendingKeyRef.current = null;
    setTestState({ kind: 'idle' });
    await reloadAdvisor();
  }, []);

  const source = llmKeyStore.getSource();
  const statusLabel =
    !hasEnvKey && !hasRuntimeKey
      ? '未配置'
      : hasRuntimeKey
        ? '运行时 Key（生效中）'
        : '本地 .env Key（生效中）';

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-yellow-400 font-game text-lg font-bold">LLM 战略顾问设置</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none" title="关闭">×</button>
        </div>

        <div className="mb-4 p-3 rounded bg-gray-800/50 border border-gray-700">
          <div className="text-xs text-gray-400 mb-1">当前状态</div>
          <div className={`text-sm font-game ${statusLabel === '未配置' ? 'text-gray-400' : 'text-green-400'}`}>
            {statusLabel}
          </div>
          {source === 'env' && hasEnvKey && (
            <div className="text-xs text-gray-500 mt-1 font-mono">
              来源: {maskKey(getEnvKey())}（.env 编译期注入）
            </div>
          )}
        </div>

        <label className="block text-sm text-gray-300 mb-2 font-game">DeepSeek API Key</label>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && input.trim()) void handleSave(); }}
            placeholder="sk-..."
            autoComplete="off"
            spellCheck={false}
            className="w-full px-3 py-2 pr-10 rounded bg-gray-800 border border-gray-600 text-white text-sm font-mono focus:outline-none focus:border-yellow-500"
          />
          <button type="button" onClick={() => setShowKey((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-sm" title={showKey ? '隐藏' : '显示'}>
            {showKey ? '🙈' : '👁'}
          </button>
        </div>

        {testState.kind !== 'idle' && (
          <div className={`mt-2 text-xs px-2 py-1 rounded ${
            testState.kind === 'ok' ? 'bg-green-900/30 text-green-300 border border-green-700/50'
              : testState.kind === 'fail' ? 'bg-red-900/30 text-red-300 border border-red-700/50'
              : 'bg-blue-900/30 text-blue-300 border border-blue-700/50'
          }`}>
            {testState.kind === 'testing' && '🔄 正在测试连接…'}
            {testState.kind === 'ok' && '✅ 连接成功，Key 有效'}
            {testState.kind === 'fail' && `❌ ${testState.message}`}
          </div>
        )}

        <div className="flex items-center gap-2 mt-4">
          <button onClick={handleSave} disabled={!input.trim()} className="flex-1 px-4 py-2 rounded text-sm font-game bg-yellow-500/30 text-yellow-300 border border-yellow-500/50 hover:bg-yellow-500/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">💾 保存并启用</button>
          <button onClick={handleTest} disabled={!input.trim() && !pendingKeyRef.current} className="px-4 py-2 rounded text-sm font-game bg-blue-500/30 text-blue-300 border border-blue-500/50 hover:bg-blue-500/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors" title="用当前输入的 Key 发起一次最小请求验证有效性">🧪 测试</button>
        </div>

        {hasRuntimeKey && (
          <button onClick={handleClearRuntime} className="w-full mt-2 px-4 py-2 rounded text-sm font-game bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/40 transition-colors">🗑 清除运行时 Key（回退到 .env）</button>
        )}

        <div className="mt-4 p-3 rounded bg-yellow-900/20 border border-yellow-700/30 text-xs text-yellow-200/80 leading-relaxed">
          🔒 <strong>隐私提示</strong>：API Key 仅保存在<strong>内存</strong>中，<strong>不会</strong>
          写入 localStorage、Cookie 或任何持久化存储。刷新页面 / 关闭浏览器后即丢失。
          请勿在截图或录屏中暴露 Key。
        </div>
      </div>
    </div>
  );
};

// ===== 左上角入口按钮（升级版：带文字标签 + 状态点 + "配置" 徽章）=====
export const SettingsPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const { hasAnyKey, hasRuntimeKey } = useLLMStatus();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-game border transition-colors ${
          hasAnyKey
            ? 'bg-green-500/20 text-green-300 border-green-500/50 hover:bg-green-500/30'
            : 'bg-yellow-500/30 text-yellow-200 border-yellow-500/60 hover:bg-yellow-500/50 shadow-md shadow-yellow-500/20'
        }`}
        title={hasAnyKey ? '管理 LLM 战略顾问（已启用）' : '配置 API Key 启用 AI 战略顾问'}
      >
        <span className="relative inline-flex h-2 w-2">
          {hasAnyKey && (
            <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60 animate-ping" />
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${hasAnyKey ? 'bg-green-400' : 'bg-yellow-400'}`} />
        </span>
        <span className="font-bold">{hasAnyKey ? '🤖 AI 已启用' : '🧠 AI 未启用'}</span>
        {hasRuntimeKey && (
          <span className="text-[10px] text-amber-300 ml-0.5" title="运行时 Key（覆盖 .env）">Ⓡ</span>
        )}
        {!hasAnyKey && (
          <span className="text-[10px] bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded ml-1 font-bold animate-pulse">
            配置
          </span>
        )}
      </button>
      <SettingsModal open={open} onClose={() => setOpen(false)} />
    </>
  );
};
