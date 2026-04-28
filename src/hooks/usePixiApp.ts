/**
 * React Hook - PixiJS 应用管理
 * 封装 PixiJS 生命周期，与 React 组件无缝集成
 */

import { useEffect, useRef, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import { PixiRenderer } from '../game/PixiRenderer';
import { getGameEngine } from '../game/GameEngine';
import { GAME_CONFIG } from '../config/gameConfig';

interface UsePixiAppOptions {
  width?: number;
  height?: number;
  backgroundColor?: number;
}

export function usePixiApp(options: UsePixiAppOptions = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const rendererRef = useRef<PixiRenderer | null>(null);
  const animationRef = useRef<number | null>(null);

  const {
    width = GAME_CONFIG.mapWidth,
    height = GAME_CONFIG.mapHeight,
    backgroundColor = 0x0a0f1a,
  } = options;

  // 初始化 PixiJS
  useEffect(() => {
    if (!containerRef.current) return;

    // 创建 PIXI 应用
    const app = new PIXI.Application({
      width,
      height,
      backgroundColor,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    containerRef.current.appendChild(app.view as HTMLCanvasElement);
    appRef.current = app;

    // 创建渲染器
    rendererRef.current = new PixiRenderer(app);

    // 渲染循环
    const renderLoop = () => {
      if (rendererRef.current) {
        rendererRef.current.update();
      }
      animationRef.current = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    // 清理函数
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (rendererRef.current) {
        rendererRef.current.destroy();
      }
      if (appRef.current) {
        appRef.current.destroy(true, { children: true, texture: true });
        appRef.current = null;
      }
    };
  }, [width, height, backgroundColor]);

  // 游戏控制方法
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
