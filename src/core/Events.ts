/**
 * 游戏事件系统
 * 提供游戏内部的事件通信机制
 */

import type { Ant, Hatchery, Projectile, Buff, Side, GridPosition, AntTemplate } from '../types';

// ============================================
// 事件类型定义
// ============================================

// 蚂蚁相关事件
export interface AntSpawnEvent {
  type: 'ant_spawn';
  ant: Ant;
  hatchery: Hatchery;
}

export interface AntDeathEvent {
  type: 'ant_death';
  ant: Ant;
  killer?: Ant;
}

export interface AntStateChangeEvent {
  type: 'ant_state_change';
  antId: string;
  oldState: Ant['state'];
  newState: Ant['state'];
}

export interface AntDamagedEvent {
  type: 'ant_damaged';
  antId: string;
  damage: number;
  attackerId?: string;
  newHp: number;
}

// 孵化室相关事件
export interface HatcheryBuiltEvent {
  type: 'hatchery_built';
  hatchery: Hatchery;
  side: Side;
}

export interface HatcheryUpgradedEvent {
  type: 'hatchery_upgraded';
  hatcheryId: string;
  oldLevel: number;
  newLevel: number;
}

export interface HatcheryDemolishedEvent {
  type: 'hatchery_demolished';
  hatcheryId: string;
  side: Side;
  refund: number;
}

// 战斗相关事件
export interface CombatEvent {
  type: 'combat';
  attackerId: string;
  targetId: string;
  damage: number;
}

export interface ProjectileFireEvent {
  type: 'projectile_fire';
  projectile: Projectile;
}

export interface ProjectileHitEvent {
  type: 'projectile_hit';
  projectile: Projectile;
  targetId: string;
  damage: number;
}

// Buff 相关事件
export interface BuffAppliedEvent {
  type: 'buff_applied';
  antId: string;
  buff: Buff;
}

export interface BuffExpiredEvent {
  type: 'buff_expired';
  antId: string;
  buffType: Buff['type'];
}

// 技能相关事件
export interface AbilityTriggeredEvent {
  type: 'ability_triggered';
  antId: string;
  abilityType: string;
  targetId?: string;
}

export interface StingerStrikeEvent {
  type: 'stinger_strike';
  antId: string;
  targetId: string;
}

export interface HoneypotExplosionEvent {
  type: 'honeypot_explosion';
  position: { x: number; y: number };
  side: Side;
  healedAntIds: string[];
}

export interface TauntTriggeredEvent {
  type: 'taunt_triggered';
  antId: string;
  affectedAntIds: string[];
}

export interface EscapeAbilityEvent {
  type: 'escape_ability';
  antId: string;
  healAmount: number;
}

// 蚁后相关事件
export interface QueenDamagedEvent {
  type: 'queen_damaged';
  side: Side;
  damage: number;
  newHp: number;
}

export interface QueenDefeatedEvent {
  type: 'queen_defeated';
  side: Side;
}

export interface QueenAttackEvent {
  type: 'queen_attack';
  side: Side;
  targetId: string;
  damage: number;
}

// AI 相关事件
export interface AIDecisionEvent {
  type: 'ai_decision';
  action: 'build' | 'upgrade' | 'demolish' | 'wait';
  reason?: string;
}

// 资源相关事件
export interface FoodChangedEvent {
  type: 'food_changed';
  side: Side;
  oldAmount: number;
  newAmount: number;
}

// 解锁相关事件
export interface PartUnlockedEvent {
  type: 'part_unlocked';
  side: Side;
  partType: 'head' | 'thorax' | 'abdomen';
  variant: string;
  nameCN: string;
}

// 游戏状态事件
export interface GameStartEvent {
  type: 'game_start';
}

export interface GamePauseEvent {
  type: 'game_pause';
}

export interface GameResumeEvent {
  type: 'game_resume';
}

export interface GameEndEvent {
  type: 'game_end';
  result: 'victory' | 'defeat';
}

// 联合事件类型
export type GameEvent = 
  | AntSpawnEvent
  | AntDeathEvent
  | AntStateChangeEvent
  | AntDamagedEvent
  | HatcheryBuiltEvent
  | HatcheryUpgradedEvent
  | HatcheryDemolishedEvent
  | CombatEvent
  | ProjectileFireEvent
  | ProjectileHitEvent
  | BuffAppliedEvent
  | BuffExpiredEvent
  | AbilityTriggeredEvent
  | StingerStrikeEvent
  | HoneypotExplosionEvent
  | TauntTriggeredEvent
  | EscapeAbilityEvent
  | QueenDamagedEvent
  | QueenDefeatedEvent
  | QueenAttackEvent
  | AIDecisionEvent
  | FoodChangedEvent
  | PartUnlockedEvent
  | GameStartEvent
  | GamePauseEvent
  | GameResumeEvent
  | GameEndEvent;

// ============================================
// 事件监听器类型
// ============================================

type EventCallback<T extends GameEvent = GameEvent> = (event: T) => void;

// ============================================
// 事件管理器
// ============================================

class EventEmitter {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  /**
   * 订阅事件
   */
  on<T extends GameEvent>(eventType: T['type'], callback: EventCallback<T>): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback as EventCallback);

    // 返回取消订阅函数
    return () => this.off(eventType, callback);
  }

  /**
   * 取消订阅
   */
  off<T extends GameEvent>(eventType: T['type'], callback: EventCallback<T>): void {
    const callbacks = this.listeners.get(eventType);
    if (callbacks) {
      callbacks.delete(callback as EventCallback);
    }
  }

  /**
   * 触发事件
   */
  emit<T extends GameEvent>(event: T): void {
    const callbacks = this.listeners.get(event.type);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(event);
        } catch (error) {
          console.error(`Error in event listener for ${event.type}:`, error);
        }
      });
    }
  }

  /**
   * 清空所有监听器
   */
  clear(): void {
    this.listeners.clear();
  }

  /**
   * 获取事件类型的监听器数量
   */
  listenerCount(eventType: string): number {
    return this.listeners.get(eventType)?.size ?? 0;
  }
}

// 导出单例
export const gameEvents = new EventEmitter();

// 便捷的快捷方法
export const GameEvents = {
  // 蚂蚁事件
  emitAntSpawn: (ant: Ant, hatchery: Hatchery) => 
    gameEvents.emit({ type: 'ant_spawn', ant, hatchery }),
  
  emitAntDeath: (ant: Ant, killer?: Ant) => 
    gameEvents.emit({ type: 'ant_death', ant, killer }),
  
  emitAntStateChange: (antId: string, oldState: Ant['state'], newState: Ant['state']) =>
    gameEvents.emit({ type: 'ant_state_change', antId, oldState, newState }),
  
  emitAntDamaged: (antId: string, damage: number, attackerId: string | undefined, newHp: number) =>
    gameEvents.emit({ type: 'ant_damaged', antId, damage, attackerId, newHp }),

  // 孵化室事件
  emitHatcheryBuilt: (hatchery: Hatchery, side: Side) =>
    gameEvents.emit({ type: 'hatchery_built', hatchery, side }),
  
  emitHatcheryUpgraded: (hatcheryId: string, oldLevel: number, newLevel: number) =>
    gameEvents.emit({ type: 'hatchery_upgraded', hatcheryId, oldLevel, newLevel }),
  
  emitHatcheryDemolished: (hatcheryId: string, side: Side, refund: number) =>
    gameEvents.emit({ type: 'hatchery_demolished', hatcheryId, side, refund }),

  // 战斗事件
  emitCombat: (attackerId: string, targetId: string, damage: number) =>
    gameEvents.emit({ type: 'combat', attackerId, targetId, damage }),
  
  emitProjectileFire: (projectile: Projectile) =>
    gameEvents.emit({ type: 'projectile_fire', projectile }),
  
  emitProjectileHit: (projectile: Projectile, targetId: string, damage: number) =>
    gameEvents.emit({ type: 'projectile_hit', projectile, targetId, damage }),

  // Buff 事件
  emitBuffApplied: (antId: string, buff: Buff) =>
    gameEvents.emit({ type: 'buff_applied', antId, buff }),
  
  emitBuffExpired: (antId: string, buffType: Buff['type']) =>
    gameEvents.emit({ type: 'buff_expired', antId, buffType }),

  // 技能事件
  emitAbilityTriggered: (antId: string, abilityType: string, targetId?: string) =>
    gameEvents.emit({ type: 'ability_triggered', antId, abilityType, targetId }),
  
  emitStingerStrike: (antId: string, targetId: string) =>
    gameEvents.emit({ type: 'stinger_strike', antId, targetId }),
  
  emitHoneypotExplosion: (position: { x: number; y: number }, side: Side, healedAntIds: string[]) =>
    gameEvents.emit({ type: 'honeypot_explosion', position, side, healedAntIds }),
  
  emitTauntTriggered: (antId: string, affectedAntIds: string[]) =>
    gameEvents.emit({ type: 'taunt_triggered', antId, affectedAntIds }),
  
  emitEscapeAbility: (antId: string, healAmount: number) =>
    gameEvents.emit({ type: 'escape_ability', antId, healAmount }),

  // 蚁后事件
  emitQueenDamaged: (side: Side, damage: number, newHp: number) =>
    gameEvents.emit({ type: 'queen_damaged', side, damage, newHp }),
  
  emitQueenDefeated: (side: Side) =>
    gameEvents.emit({ type: 'queen_defeated', side }),
  
  emitQueenAttack: (side: Side, targetId: string, damage: number) =>
    gameEvents.emit({ type: 'queen_attack', side, targetId, damage }),

  // AI 事件
  emitAIDecision: (action: 'build' | 'upgrade' | 'demolish' | 'wait', reason?: string) =>
    gameEvents.emit({ type: 'ai_decision', action, reason }),

  // 资源事件
  emitFoodChanged: (side: Side, oldAmount: number, newAmount: number) =>
    gameEvents.emit({ type: 'food_changed', side, oldAmount, newAmount }),

  // 解锁事件
  emitPartUnlocked: (side: Side, partType: 'head' | 'thorax' | 'abdomen', variant: string, nameCN: string) =>
    gameEvents.emit({ type: 'part_unlocked', side, partType, variant, nameCN }),

  // 游戏状态事件
  emitGameStart: () => gameEvents.emit({ type: 'game_start' }),
  emitGamePause: () => gameEvents.emit({ type: 'game_pause' }),
  emitGameResume: () => gameEvents.emit({ type: 'game_resume' }),
  emitGameEnd: (result: 'victory' | 'defeat') => gameEvents.emit({ type: 'game_end', result }),
};
