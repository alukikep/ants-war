/**
 * Buff 系统
 * 负责 Buff 效果管理
 */

import { useGameStore } from '../store/gameStore';
import type { Ant, Buff } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { GameEvents } from '../core/Events';

export class BuffSystem {
  constructor() {}

  /**
   * 更新 Buff 系统
   */
  update(deltaTime: number): void {
    this.updateBuffs(deltaTime);
    this.updateAttackSpeedBonus(deltaTime);
    this.updateStingerCooldowns(deltaTime);
    this.updateTauntCooldowns(deltaTime);
  }

  /**
   * 重置系统
   */
  reset(): void {}

  /**
   * 销毁系统
   */
  destroy(): void {}

  /**
   * 更新所有蚂蚁的 Buff 效果
   */
  private updateBuffs(deltaTime: number): void {
    const state = useGameStore.getState();
    const deltaMs = deltaTime * 1000;
    const updates: { id: string; changes: Partial<Ant> }[] = [];

    for (const ant of state.ants) {
      if (ant.state === 'dead' || ant.buffs.length === 0) continue;

      let newHp = ant.hp;
      
      // 处理中毒 tick 伤害
      for (const buff of ant.buffs) {
        if (buff.type === 'poison' && buff.tickDamage && !ant.isExecuting) {
          const tickDamage = buff.tickDamage * deltaTime;
          newHp -= tickDamage;
        }
      }

      // 更新每个 Buff 的持续时间
      const updatedBuffs = ant.buffs
        .map(buff => ({
          ...buff,
          duration: buff.duration - deltaMs,
        }))
        .filter(buff => buff.duration > 0);

      const changes: Partial<Ant> = {};
      
      if (newHp !== ant.hp) {
        changes.hp = Math.max(0, newHp);
        if (newHp <= 0) {
          changes.state = 'dead';
        }
      }
      
      if (updatedBuffs.length !== ant.buffs.length || 
          ant.buffs.some((buff, i) => buff.duration !== updatedBuffs[i]?.duration)) {
        changes.buffs = updatedBuffs;
      }

      if (Object.keys(changes).length > 0) {
        updates.push({ id: ant.id, changes });
      }
    }

    if (updates.length > 0) {
      state.updateAnts(updates);
    }
  }

  /**
   * 更新所有蚂蚁的攻速加成衰减
   */
  private updateAttackSpeedBonus(deltaTime: number): void {
    const state = useGameStore.getState();
    const decayAmount = 0.20 * deltaTime; // 每秒衰减 20%
    const updates: { id: string; changes: Partial<Ant> }[] = [];

    for (const ant of state.ants) {
      if (ant.state === 'dead' || ant.attackSpeedBonus <= 0) continue;

      const newBonus = Math.max(0, ant.attackSpeedBonus - decayAmount);
      
      if (newBonus !== ant.attackSpeedBonus) {
        updates.push({
          id: ant.id,
          changes: { attackSpeedBonus: newBonus },
        });
      }
    }

    if (updates.length > 0) {
      state.updateAnts(updates);
    }
  }

  /**
   * 更新尾针技能冷却时间
   */
  private updateStingerCooldowns(deltaTime: number): void {
    const state = useGameStore.getState();
    const deltaMs = deltaTime * 1000;
    const updates: { id: string; changes: Partial<Ant> }[] = [];

    for (const ant of state.ants) {
      if (ant.state === 'dead' || !ant.hasStingerAbility || ant.stingerCooldown <= 0) continue;

      const newCooldown = Math.max(0, ant.stingerCooldown - deltaMs);
      
      if (newCooldown !== ant.stingerCooldown) {
        updates.push({
          id: ant.id,
          changes: { stingerCooldown: newCooldown },
        });
      }
    }

    if (updates.length > 0) {
      state.updateAnts(updates);
    }
  }

  /**
   * 更新嘲讽技能冷却时间
   */
  private updateTauntCooldowns(deltaTime: number): void {
    const state = useGameStore.getState();
    const deltaMs = deltaTime * 1000;
    const updates: { id: string; changes: Partial<Ant> }[] = [];

    for (const ant of state.ants) {
      if (ant.state === 'dead' || !ant.hasTauntAbility || ant.tauntCooldown <= 0) continue;

      const newCooldown = Math.max(0, ant.tauntCooldown - deltaMs);
      
      if (newCooldown !== ant.tauntCooldown) {
        updates.push({
          id: ant.id,
          changes: { tauntCooldown: newCooldown },
        });
      }
    }

    if (updates.length > 0) {
      state.updateAnts(updates);
    }
  }

  /**
   * 给蚂蚁添加 Buff
   */
  addBuff(antId: string, newBuff: Omit<Buff, 'id'>): void {
    const state = useGameStore.getState();
    const ant = state.ants.find(a => a.id === antId);
    if (!ant || ant.state === 'dead') return;

    const buffWithId: Buff = {
      ...newBuff,
      id: uuidv4(),
    };

    let updatedBuffs: Buff[];

    if (newBuff.stackable) {
      updatedBuffs = [...ant.buffs, buffWithId];
    } else {
      const existingBuffIndex = ant.buffs.findIndex(b => b.type === newBuff.type);
      if (existingBuffIndex >= 0) {
        const existingBuff = ant.buffs[existingBuffIndex];
        const mergedBuff: Buff = {
          ...buffWithId,
          value: Math.max(existingBuff.value, newBuff.value),
          duration: Math.max(existingBuff.duration, newBuff.duration),
        };
        updatedBuffs = [
          ...ant.buffs.slice(0, existingBuffIndex),
          mergedBuff,
          ...ant.buffs.slice(existingBuffIndex + 1),
        ];
      } else {
        updatedBuffs = [...ant.buffs, buffWithId];
      }
    }

    state.updateAnt(antId, { buffs: updatedBuffs });
    GameEvents.emitBuffApplied(antId, buffWithId);
  }
}
