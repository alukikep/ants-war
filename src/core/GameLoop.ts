/**
 * 游戏循环管理器
 * 负责游戏帧更新、时间管理和游戏状态控制
 */

import { useGameStore } from '../store/gameStore';
import { GameEvents } from './Events';

export interface GameLoopCallbacks {
  onUpdate: (deltaTime: number) => void;
  onFixedUpdate?: (fixedDeltaTime: number) => void;
}

export class GameLoop {
  private isRunning = false;
  private animationFrameId: number | null = null;
  private lastFrameTime = 0;
  
  // 固定时间步长（用于物理计算）
  private readonly FIXED_TIMESTEP = 1 / 60; // 60 FPS 物理更新
  private fixedTimeAccumulator = 0;
  
  // 回调函数
  private callbacks: Set<GameLoopCallbacks> = new Set();
  
  // 性能统计
  private frameCount = 0;
  private lastFpsUpdate = 0;
  private currentFps = 0;

  constructor() {
    this.lastFrameTime = performance.now();
    this.lastFpsUpdate = this.lastFrameTime;
  }

  /**
   * 注册更新回调
   */
  registerCallback(callbacks: GameLoopCallbacks): () => void {
    this.callbacks.add(callbacks);
    return () => this.callbacks.delete(callbacks);
  }

  /**
   * 启动游戏循环
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.fixedTimeAccumulator = 0;
    
    GameEvents.emitGameStart();
    this.gameLoop();
    
    console.log('[GameLoop] Started');
  }

  /**
   * 停止游戏循环
   */
  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    console.log('[GameLoop] Stopped');
  }

  /**
   * 暂停游戏循环
   */
  pause(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    GameEvents.emitGamePause();
    console.log('[GameLoop] Paused');
  }

  /**
   * 恢复游戏循环
   */
  resume(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.gameLoop();
    GameEvents.emitGameResume();
    console.log('[GameLoop] Resumed');
  }

  /**
   * 重置游戏循环
   */
  reset(): void {
    this.stop();
    this.fixedTimeAccumulator = 0;
    this.frameCount = 0;
    this.lastFpsUpdate = performance.now();
    this.currentFps = 0;
  }

  /**
   * 主游戏循环
   */
  private gameLoop = (): void => {
    if (!this.isRunning) return;

    const currentTime = performance.now();
    const rawDeltaTime = (currentTime - this.lastFrameTime) / 1000; // 转换为秒
    this.lastFrameTime = currentTime;

    const state = useGameStore.getState();
    
    // 检查游戏状态
    if (state.status !== 'playing') {
      this.animationFrameId = requestAnimationFrame(this.gameLoop);
      return;
    }

    // 应用游戏速度倍率
    const deltaTime = Math.min(rawDeltaTime, 0.1) * state.gameSpeed; // 限制最大帧时间防止跳跃

    // 固定时间步长更新（物理计算）
    this.fixedTimeAccumulator += deltaTime;
    while (this.fixedTimeAccumulator >= this.FIXED_TIMESTEP) {
      this.callbacks.forEach(cb => {
        if (cb.onFixedUpdate) {
          cb.onFixedUpdate(this.FIXED_TIMESTEP);
        }
      });
      this.fixedTimeAccumulator -= this.FIXED_TIMESTEP;
    }

    // 可变时间步长更新
    this.callbacks.forEach(cb => cb.onUpdate(deltaTime));

    // 更新 FPS 统计
    this.updateFps(currentTime);

    this.animationFrameId = requestAnimationFrame(this.gameLoop);
  };

  /**
   * 更新 FPS 统计
   */
  private updateFps(currentTime: number): void {
    this.frameCount++;
    const elapsed = currentTime - this.lastFpsUpdate;
    
    if (elapsed >= 1000) {
      this.currentFps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.lastFpsUpdate = currentTime;
      
      // 可选：调试信息
      // console.log(`[FPS] ${this.currentFps}`);
    }
  }

  /**
   * 获取当前 FPS
   */
  getFps(): number {
    return this.currentFps;
  }

  /**
   * 获取游戏运行状态
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * 获取固定时间步长
   */
  getFixedTimestep(): number {
    return this.FIXED_TIMESTEP;
  }
}

// 导出单例
let gameLoopInstance: GameLoop | null = null;

export function getGameLoop(): GameLoop {
  if (!gameLoopInstance) {
    gameLoopInstance = new GameLoop();
  }
  return gameLoopInstance;
}
