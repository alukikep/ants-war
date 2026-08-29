/**
 * 战斗系统
 * 负责战斗逻辑、索敌和攻击
 */

import { useGameStore } from '../store/gameStore';
import { GameEvents } from '../core/Events';
import type { Ant } from '../types';
import { playSound } from '../components/SoundControl';

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
  private _lastTargetingTime = 0;

  constructor() { }

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
    this._lastTargetingTime = 0;
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
          const currentState = ant.state as string;
          if (currentState !== 'shooting') {
            updates.push({
              id: ant.id,
              changes: { state: 'shooting', targetId: nearestEnemy.id },
            });
          }
        } else {
          // 近战蚂蚁进入战斗状态
          const currentState = ant.state as string;
          if (currentState !== 'fighting') {
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
        // 计算护甲减伤后的实际伤害（先百分比减伤，再固定值减伤）
        const armorMultiplier = this.getArmorMultiplier(target);
        let baseDamage = Math.floor(ant.damage * armorMultiplier);
        // 暴击判定（切叶蚁头部）
        if (ant.critChance > 0 && Math.random() < ant.critChance) {
          baseDamage *= 3;
        }
        const actualDamage = Math.max(1, baseDamage - target.flatArmor);
        const newTargetHp = target.hp - actualDamage;

        updates.push({
          id: target.id,
          changes: { hp: newTargetHp },
        });

        // 触发肾上腺素技能检查（子弹蚁胸）
        if (target.hasAdrenaline && !target.hasUsedAdrenaline) {
          // 根据孵化室等级计算肾上腺素效果和持续时间
          const level = target.sourceLevel || 1;
          const adrenalineBonus = level === 1 ? { damage: 0.5, armor: 0.5, duration: 5000 } : level === 2 ? { damage: 0.75, armor: 0.6, duration: 8000 } : { damage: 1.0, armor: 0.8, duration: 12000 };
          updates.push({
            id: target.id,
            changes: {
              hasUsedAdrenaline: true,
              adrenalineCooldown: 60000, // 60秒冷却
              // 添加攻击力buff和护甲buff
              buffs: [
                ...target.buffs,
                {
                  id: `adrenaline_damage_${Date.now()}`,
                  type: 'damageUp' as const,
                  value: adrenalineBonus.damage,
                  duration: adrenalineBonus.duration,
                  maxDuration: adrenalineBonus.duration,
                  stackable: false,
                },
                {
                  id: `adrenaline_armor_${Date.now()}`,
                  type: 'armor' as const,
                  value: adrenalineBonus.armor,
                  duration: adrenalineBonus.duration,
                  maxDuration: adrenalineBonus.duration,
                  stackable: false,
                },
              ],
            },
          });
        }

        // 更新攻击冷却
        const effectiveAttackSpeed = this.getEffectiveAttackSpeed(ant);
        updates.push({
          id: ant.id,
          changes: {
            attackCooldown: effectiveAttackSpeed,
            rotation: lerpAngle(ant.rotation, getAngle(ant.position.x, ant.position.y, target.position.x, target.position.y), deltaTime * 10),
          },
        });

        // 播放攻击音效（近战）
        if (!ant.isRanged) {
          playSound.attack(false);
        }

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
