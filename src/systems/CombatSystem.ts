/**
 * 战斗系统
 * 负责战斗逻辑、索敌和攻击
 */

import { useGameStore } from '../store/gameStore';
import { GameEvents } from '../core/Events';
import type { Ant } from '../types';

// 工具函数
function getDistance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

function getAngle(x1: number, y1: number, x2: number, y2: number): number {
  return Math.atan2(y2 - y1, x2 - x1);
}

function lerpAngle(current: number, target: number, t: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * t;
}

export class CombatSystem {
  private lastTargetingTime = 0;

  constructor() {}

  /**
   * 更新战斗系统
   */
  update(deltaTime: number): void {
    this.handleTargeting();
    this.handleCombat(deltaTime);
  }

  /**
   * 重置系统
   */
  reset(): void {
    this.lastTargetingTime = 0;
  }

  /**
   * 销毁系统
   */
  destroy(): void {
    // 清理资源
  }

  /**
   * 索敌逻辑：检测敌人并锁定目标
   */
  private handleTargeting(): void {
    const state = useGameStore.getState();
    const { detectionRange, collisionDistance } = state.config;
    const updates: { id: string; changes: Partial<Ant> }[] = [];

    for (const ant of state.ants) {
      // 跳过死亡、战斗中、射击中、被秒杀中的蚂蚁
      if (ant.state === 'dead' || ant.state === 'fighting' || ant.state === 'shooting' || ant.isBeingExecuted) continue;

      // 获取敌方蚂蚁（排除被秒杀中的）
      const enemies = state.ants.filter(a => 
        a.side !== ant.side && a.state !== 'dead' && !a.isBeingExecuted
      );

      if (enemies.length === 0) {
        // 没有敌人，恢复正常移动
        if (ant.state === 'chasing') {
          updates.push({
            id: ant.id,
            changes: { state: 'moving', targetId: null },
          });
        }
        continue;
      }

      // 寻找最近的敌人
      let nearestEnemy: Ant | null = null;
      let nearestDistance = Infinity;

      for (const enemy of enemies) {
        const dist = getDistance(
          ant.position.x, ant.position.y,
          enemy.position.x, enemy.position.y
        );
        if (dist < nearestDistance) {
          nearestDistance = dist;
          nearestEnemy = enemy;
        }
      }

      if (!nearestEnemy) continue;

      // 远程蚂蚁的攻击范围使用 ant.attackRange，近战使用 collisionDistance
      const effectiveAttackRange = ant.isRanged ? ant.attackRange : collisionDistance;

      // 检查是否在攻击范围内
      if (nearestDistance <= effectiveAttackRange) {
        if (ant.isRanged) {
          // 远程蚂蚁进入射击状态
          if (ant.state !== 'shooting') {
            updates.push({
              id: ant.id,
              changes: { state: 'shooting', targetId: nearestEnemy.id },
            });
          }
        } else {
          // 近战蚂蚁进入战斗状态
          if (ant.state !== 'fighting') {
            updates.push({
              id: ant.id,
              changes: { state: 'fighting', targetId: nearestEnemy.id },
            });
          }
        }
      }
      // 检查是否在索敌范围内（远程单位索敌范围等于攻击范围）
      else if (nearestDistance <= Math.max(detectionRange, effectiveAttackRange)) {
        // 锁定目标，开始追击
        if (ant.state !== 'chasing' || ant.targetId !== nearestEnemy.id) {
          updates.push({
            id: ant.id,
            changes: { state: 'chasing', targetId: nearestEnemy.id },
          });
        }
      }
      // 超出索敌范围，继续正常移动
      else if (ant.state === 'chasing') {
        updates.push({
          id: ant.id,
          changes: { state: 'moving', targetId: null },
        });
      }
    }

    if (updates.length > 0) {
      state.updateAnts(updates);
    }
  }

  /**
   * 处理战斗逻辑
   */
  private handleCombat(deltaTime: number): void {
    const state = useGameStore.getState();
    const updates: { id: string; changes: Partial<Ant> }[] = [];

    // 处理近战战斗（fighting状态）
    const fightingAnts = state.ants.filter(a => a.state === 'fighting');

    for (const ant of fightingAnts) {
      const target = ant.targetId ? state.ants.find(a => a.id === ant.targetId) : null;
      
      if (!target || target.state === 'dead') {
        updates.push({
          id: ant.id,
          changes: { state: 'moving', targetId: null },
        });
        continue;
      }
      
      if (target.isBeingExecuted || target.isExecuting) continue;

      // 检查攻击冷却
      if (ant.attackCooldown <= 0) {
        // 计算护甲减伤后的实际伤害
        const armorMultiplier = this.getArmorMultiplier(target);
        const actualDamage = Math.max(1, Math.floor(ant.damage * armorMultiplier));
        const newTargetHp = target.hp - actualDamage;
        
        updates.push({
          id: target.id,
          changes: { hp: newTargetHp },
        });
        
        // 更新攻击冷却
        const effectiveAttackSpeed = this.getEffectiveAttackSpeed(ant);
        updates.push({
          id: ant.id,
          changes: { 
            attackCooldown: effectiveAttackSpeed,
            rotation: lerpAngle(ant.rotation, getAngle(ant.position.x, ant.position.y, target.position.x, target.position.y), deltaTime * 10),
          },
        });

        // 目标死亡
        if (newTargetHp <= 0) {
          updates.push({
            id: target.id,
            changes: { state: 'dead' },
          });
          updates.push({
            id: ant.id,
            changes: { state: 'moving', targetId: null },
          });
          
          GameEvents.emitCombat(ant.id, target.id, actualDamage);
        }
      }
    }

    if (updates.length > 0) {
      state.updateAnts(updates);
    }
  }

  /**
   * 计算蚂蚁的有效护甲值
   */
  private getArmorMultiplier(ant: Ant): number {
    let armorValue = ant.baseArmor;
    for (const buff of ant.buffs) {
      if (buff.type === 'armor') {
        armorValue = Math.max(armorValue, buff.value);
      }
    }
    armorValue = Math.min(0.9, armorValue);
    return 1 - armorValue;
  }

  /**
   * 计算有效攻击间隔
   */
  private getEffectiveAttackSpeed(ant: Ant): number {
    let speedMultiplier = 1 + ant.attackSpeedBonus;
    let buffMultiplier = 1;
    
    for (const buff of ant.buffs) {
      switch (buff.type) {
        case 'attackSpeedUp':
          buffMultiplier *= (1 + buff.value);
          break;
        case 'attackSpeedDown':
          buffMultiplier *= (1 - buff.value);
          break;
      }
    }
    
    let totalMultiplier = speedMultiplier * buffMultiplier;
    totalMultiplier = Math.max(0.2, Math.min(3.0, totalMultiplier));
    
    return Math.max(100, ant.attackSpeed / totalMultiplier);
  }
}
