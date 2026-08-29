/**
 * 游戏主控制器
 * 协调所有游戏系统，管理游戏生命周期
 */

import { useGameStore } from '../store/gameStore';
import { getGameLoop, GameLoop } from './GameLoop';
import { gameEvents } from './Events';
import { DIFFICULTY_CONFIG } from '../config/gameConfig';
import { playSound } from '../components/SoundControl';

// 导入各游戏系统
import { CombatSystem } from '../systems/CombatSystem';
import { MovementSystem } from '../systems/MovementSystem';
import { BuffSystem } from '../systems/BuffSystem';
import { SpawnSystem } from '../systems/SpawnSystem';
import { ProjectileSystem } from '../systems/ProjectileSystem';
import { QueenSystem } from '../systems/QueenSystem';
import { UnlockSystem } from '../systems/UnlockSystem';
import { AISystem } from '../ai/AISystem';

// 游戏系统接口
export interface IGameSystem {
  init(): void;
  update(deltaTime: number): void;
  reset(): void;
  destroy(): void;
}

export class Game {
  private gameLoop: GameLoop;

  // 游戏系统实例
  private combatSystem: CombatSystem;
  private movementSystem: MovementSystem;
  private buffSystem: BuffSystem;
  private spawnSystem: SpawnSystem;
  private projectileSystem: ProjectileSystem;
  private queenSystem: QueenSystem;
  private unlockSystem: UnlockSystem;
  private aiSystem: AISystem;

  // 时间追踪
  private lastFoodTime = 0;
  private lastAIDecisionTime = 0;
  private _lastUnlockGameTime = 0;

  // 状态追踪
  private isInitialized = false;
  private _postGameSummarized = false;
  private previousStatus: 'idle' | 'playing' | 'paused' | 'victory' | 'defeat' = 'idle';

  constructor() {
    this.gameLoop = getGameLoop();

    // 初始化各系统
    this.combatSystem = new CombatSystem();
    this.movementSystem = new MovementSystem();
    this.buffSystem = new BuffSystem();
    this.spawnSystem = new SpawnSystem();
    this.projectileSystem = new ProjectileSystem();
    this.queenSystem = new QueenSystem();
    this.unlockSystem = new UnlockSystem();
    this.aiSystem = new AISystem();
  }

  /**
   * 初始化游戏
   */
  init(): void {
    if (this.isInitialized) return;

    // 注册游戏循环回调
    this.gameLoop.registerCallback({
      onUpdate: this.handleUpdate.bind(this),
    });

    this.isInitialized = true;
    console.log('[Game] Initialized');
  }

  /**
   * 开始游戏
   */
  start(): void {
    this.init();
    this.reset();
    useGameStore.getState().startGame();
    this.gameLoop.start();
    console.log('[Game] Started');
  }

  /**
   * 暂停游戏
   */
  pause(): void {
    this.gameLoop.pause();
    useGameStore.getState().pauseGame();
  }

  /**
   * 恢复游戏
   */
  resume(): void {
    this.gameLoop.resume();
    useGameStore.getState().resumeGame();
  }

  /**
   * 重置游戏
   */
  reset(): void {
    this.gameLoop.reset();
    useGameStore.getState().resetGame();

    // 重置所有系统
    this.combatSystem.reset();
    this.movementSystem.reset();
    this.buffSystem.reset();
    this.spawnSystem.reset();
    this.projectileSystem.reset();
    this.queenSystem.reset();
    this.unlockSystem.reset();
    this.aiSystem.reset();

    // 重置时间追踪
    this.lastFoodTime = Date.now();
    this.lastAIDecisionTime = Date.now();
    this._lastUnlockGameTime = 0;
    this._postGameSummarized = false;

    console.log('[Game] Reset');
  }

  /**
   * 游戏更新主函数
   */
  private handleUpdate(deltaTime: number): void {
    const state = useGameStore.getState();

    // 检查游戏是否结束
    if (state.status === 'victory' || state.status === 'defeat') {
      // 检查是否刚结束，播放音效
      if (this.previousStatus === 'playing') {
        if (state.status === 'victory') {
          playSound.ui('victory');
        } else {
          playSound.ui('defeat');
        }
      }
      this.previousStatus = state.status;
      return;
    }

    // 更新 previousStatus
    if (state.status !== this.previousStatus) {
      this.previousStatus = state.status;
    }

    // 更新游戏时间
    state.incrementGameTime(deltaTime * 1000);
    const gameTime = state.stats.gameTime;

    // 食物生成
    this.handleFoodGeneration();

    // 部件解锁
    this.unlockSystem.update(gameTime);

    // AI 决策与执行
    this.handleAIDecision();

    // 更新各个游戏系统
    this.spawnSystem.update(deltaTime);
    this.buffSystem.update(deltaTime);
    this.combatSystem.update(deltaTime);
    this.movementSystem.update(deltaTime);
    this.projectileSystem.update(deltaTime);
    this.queenSystem.update(deltaTime);
  }

  /**
   * 处理食物生成
   */
  private handleFoodGeneration(): void {
    const now = Date.now();
    const state = useGameStore.getState();

    if (now - this.lastFoodTime >= state.config.foodInterval / state.gameSpeed) {
      const midLineX = state.config.mapWidth / 2;
      const { tugOfWarFoodBonus } = state.config;

      // 动态食物生成量（初始5，每分钟+1）
      const minutesElapsed = Math.floor(state.stats.gameTime / 60000);
      const currentFood = state.config.foodPerInterval + minutesElapsed;

      // 检测拔河优势
      const aliveAnts = state.ants.filter(a => a.state !== 'dead');
      const playerHasAdvantage = aliveAnts.some(a => a.side === 'player' && a.position.x > midLineX);
      const enemyHasAdvantage = aliveAnts.some(a => a.side === 'enemy' && a.position.x < midLineX);

      const playerFoodAmount = currentFood + (playerHasAdvantage ? tugOfWarFoodBonus : 0);
      const enemyFoodBonus = DIFFICULTY_CONFIG[state.difficulty].enemyFoodBonus;
      const enemyFoodAmount = currentFood + enemyFoodBonus + (enemyHasAdvantage ? tugOfWarFoodBonus : 0);

      state.addFood('player', playerFoodAmount);
      state.addFood('enemy', enemyFoodAmount);
      this.lastFoodTime = now;
    }
  }

  /**
   * 处理 AI 决策
   */
  private handleAIDecision(): void {
    const now = Date.now();
    const state = useGameStore.getState();

    if (now - this.lastAIDecisionTime < 2000 / state.gameSpeed) return;
    this.lastAIDecisionTime = now;

    this.aiSystem.makeDecision();
  }

  /**
   * 销毁游戏
   */
  destroy(): void {
    this.gameLoop.stop();

    // 销毁所有系统
    this.combatSystem.destroy();
    this.movementSystem.destroy();
    this.buffSystem.destroy();
    this.spawnSystem.destroy();
    this.projectileSystem.destroy();
    this.queenSystem.destroy();
    this.unlockSystem.destroy();
    this.aiSystem.destroy();

    // 清空事件监听
    gameEvents.clear();

    this.isInitialized = false;
    console.log('[Game] Destroyed');
  }

  /**
   * 获取各个系统实例（用于渲染器等外部组件）
   */
  getSystems() {
    return {
      combatSystem: this.combatSystem,
      movementSystem: this.movementSystem,
      buffSystem: this.buffSystem,
      spawnSystem: this.spawnSystem,
      projectileSystem: this.projectileSystem,
      queenSystem: this.queenSystem,
      unlockSystem: this.unlockSystem,
      aiSystem: this.aiSystem,
    };
  }
}

// 导出单例
let gameInstance: Game | null = null;

export function getGame(): Game {
  if (!gameInstance) {
    gameInstance = new Game();
  }
  return gameInstance;
}
