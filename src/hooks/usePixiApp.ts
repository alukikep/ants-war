/**
 * React Hook - PixiJS 应用管理
 * 封装 PixiJS 生命周期，与 React 组件无缝集成
 *
 * DeepSeek 战略顾问的接入：
 * - 引擎自己 60s 节奏调 advise()（见 GameEngine.maybeAdvise）
 * - 这里只在挂载时立刻触发一次，让开局就有战略
 * - 不再需要外部定时器
 */

import { useEffect, useRef, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import { PixiRenderer } from '../game/PixiRenderer';
import { getGameEngine } from '../game/GameEngine';
import { useGameStore } from '../store/gameStore';
import { llmKeyStore, getActiveKey } from '../store/llmKeyStore';
import { GAME_CONFIG } from '../config/gameConfig';

interface UsePixiAppOptions {
  backgroundColor?: number;
}

export function usePixiApp(options: UsePixiAppOptions = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const rendererRef = useRef<PixiRenderer | null>(null);
  const animationRef = useRef<number | null>(null);

  const {
    backgroundColor = 0x0a0f1a,
  } = options;

  // 初始化 PixiJS
  useEffect(() => {
    if (!containerRef.current) return;

    // 使用固定游戏尺寸
    const gameWidth = GAME_CONFIG.mapWidth;
    const gameHeight = GAME_CONFIG.mapHeight;

    const app = new PIXI.Application({
      width: gameWidth,
      height: gameHeight,
      backgroundColor,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    containerRef.current.appendChild(app.view as HTMLCanvasElement);
    appRef.current = app;

    rendererRef.current = new PixiRenderer(app);

    const renderLoop = () => {
      if (rendererRef.current) {
        rendererRef.current.update();
      }
      animationRef.current = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    // === 接入 DeepSeek 战略顾问（仅当用户在 UI 输入了 key 时）===
    // 引擎每 ~60s 调一次 advise() 调整 mode + weights；
    // 本地 AI 仍由 DefaultAIDecisionMaker 负责每 2s 决策。
    // 已移除 .env 自动加载以避免 key 被打包到前端 bundle 暴露给访问者。
    reloadAdvisor();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      // 卸下战略顾问
      try {
        getGameEngine().setStrategicAdvisor(null);
      } catch {
        /* ignore */
      }
      if (rendererRef.current) {
        rendererRef.current.destroy();
      }
      if (appRef.current) {
        appRef.current.destroy(true, { children: true, texture: true });
        appRef.current = null;
      }
    };
  }, [backgroundColor]);

  const startGame = useCallback(() => {
    getGameEngine().start();
  }, []);

  const pauseGame = useCallback(() => {
    getGameEngine().pause();
  }, []);

  const resumeGame = useCallback(() => {
    getGameEngine().resume();
  }, []);

  const resetGame = useCallback(() => {
    getGameEngine().reset();
  }, []);

  return {
    containerRef,
    startGame,
    pauseGame,
    resumeGame,
    resetGame,
  };
}

/**
 * 重新挂载 DeepSeek 战略顾问。
 *
 * 仅使用 llmKeyStore 中的运行时 key（用户在 UI 中输入的）。
 * **不再回退到 .env 编译期注入的 key**，因为那样会把 key 打包进前端 bundle 暴露给任何访问者。
 *
 * 未配置 key 时卸下 advisor（关闭 LLM 功能，回到纯本地启发式 AI）。
 *
 * 该函数是幂等的：调用前先 setStrategicAdvisor(null)，再按需装载新实例。
 * 用户在 UI 中保存/清除 key 后调用本函数即可生效。
 *
 * 模块级导出，SettingsPanel 等组件可直接 import 调用。
 */
export async function reloadAdvisor(): Promise<void> {
  // 先卸下旧 advisor，避免新旧并存导致重复调用
  try {
    getGameEngine().setStrategicAdvisor(null);
  } catch { /* ignore */ }

  const apiKey = getActiveKey();
  if (!apiKey) {
    console.log('[DeepSeekAdvisor] 未配置 API key，LLM 战略顾问已关闭（使用纯本地启发式）');
    return;
  }

  // baseUrl / model / timeout 不是敏感配置，可以从 .env 读（不会泄漏密钥）
  const baseUrl = (import.meta.env.VITE_DEEPSEEK_BASE_URL as string | undefined) || undefined;
  const model = (import.meta.env.VITE_DEEPSEEK_MODEL as string | undefined) || undefined;
  const timeoutMs = Number(import.meta.env.VITE_DEEPSEEK_TIMEOUT_MS) || undefined;

  try {
    const { DeepSeekStrategicAdvisor } = await import('../ai/DeepSeekStrategicAdvisor');
    const advisor = new DeepSeekStrategicAdvisor({ apiKey, baseUrl, model, timeoutMs });
    getGameEngine().setStrategicAdvisor(advisor);
    console.log('[DeepSeekAdvisor] 已启用 -', {
      source: 'runtime',
      baseUrl: baseUrl || 'https://api.deepseek.com',
      model: model || 'deepseek-chat',
      interval: '60s/次',
    });

    // 立即拉一次（不等到 60s），让保存 key 后立刻看到效果
    try {
      const ctx = getGameEngine().getBattleContext();
      const defaultAI = getGameEngine().getDefaultAIDecisionMaker();
      if (defaultAI) {
        const directive = await advisor.advise(ctx);
        defaultAI.mode = directive.mode;
        defaultAI.setWeights(directive.weights);
        // 同步告诉引擎：顾问刚被调过，避免引擎在 16ms 后立刻再调一次
        getGameEngine().markAdvisorCalled();
        if (directive.taunt) {
          try { useGameStore.getState().setAITrashTalk(directive.taunt); } catch { /* ignore */ }
        }
        console.log('[DeepSeekAdvisor] 初始战略:', directive.mode);
      }
    } catch (err) {
      console.warn('[DeepSeekAdvisor] 初始调用失败:', err);
    }
  } catch (err) {
    console.warn('[DeepSeekAdvisor] 加载失败:', err);
  }
}
