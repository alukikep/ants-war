/**
 * 移动系统
 * 负责蚂蚁移动、碰撞处理
 */

import { useGameStore } from '../store/gameStore';
import type { Ant } from '../types';
import { GAME_CONFIG } from '../config/gameConfig';

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

export class MovementSystem {
  constructor() { }

  /**
   * 更新移动系统
   */
  update(deltaTime: number): void {
    this.updateAnts(deltaTime);
    this.resolveAntCollisions();
  }

  /**
   * 重置系统
   */
  reset(): void { }

  /**
   * 销毁系统
   */
  destroy(): void { }

  /**
   * 更新蚂蚁移动
   */
  private updateAnts(deltaTime: number): void {
    const state = useGameStore.getState();
    const _collisionDistance = state.config.collisionDistance;
    const updates: { id: string; changes: Partial<Ant> }[] = [];

    for (const ant of state.ants) {
      if (ant.state === 'dead') continue;

      // 战斗中的蚂蚁（近战）
      if (ant.state === 'fighting') {
        const target = ant.targetId ? state.ants.find(a => a.id === ant.targetId) : null;

        if (!target || target.state === 'dead') {
          updates.push({
            id: ant.id,
            changes: { state: 'moving', targetId: null },
          });
          continue;
        }

        updates.push({
          id: ant.id,
          changes: {
            attackCooldown: Math.max(0, ant.attackCooldown - deltaTime * 1000),
            rotation: lerpAngle(ant.rotation, getAngle(ant.position.x, ant.position.y, target.position.x, target.position.y), deltaTime * 10),
          },
        });
        continue;
      }

      // 远程射击中的蚂蚁
      if (ant.state === 'shooting') {
        const target = ant.targetId ? state.ants.find(a => a.id === ant.targetId) : null;

        if (!target || target.state === 'dead') {
          updates.push({
            id: ant.id,
            changes: { state: 'moving', targetId: null },
          });
          continue;
        }

        const distToTarget = getDistance(
          ant.position.x, ant.position.y,
          target.position.x, target.position.y
        );

        if (distToTarget > ant.attackRange) {
          updates.push({
            id: ant.id,
            changes: { state: 'chasing', targetId: target.id },
          });
          continue;
        }

        updates.push({
          id: ant.id,
          changes: {
            attackCooldown: Math.max(0, ant.attackCooldown - deltaTime * 1000),
            rotation: lerpAngle(ant.rotation, getAngle(ant.position.x, ant.position.y, target.position.x, target.position.y), deltaTime * 10),
          },
        });
        continue;
      }

      // 追击状态：向目标移动
      if (ant.state === 'chasing') {
        const target = ant.targetId ? state.ants.find(a => a.id === ant.targetId) : null;

        if (!target || target.state === 'dead') {
          updates.push({
            id: ant.id,
            changes: { state: 'moving', targetId: null },
          });
          continue;
        }

        const dx = target.position.x - ant.position.x;
        const dy = target.position.y - ant.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 0) {
          const dirX = dx / distance;
          const dirY = dy / distance;

          const targetAngle = getAngle(
            ant.position.x, ant.position.y,
            target.position.x, target.position.y
          );

          const effectiveSpeed = this.getEffectiveSpeed(ant);
          const moveDistance = effectiveSpeed * deltaTime;
          const newX = ant.position.x + dirX * moveDistance;
          const newY = ant.position.y + dirY * moveDistance;

          const clampedY = Math.max(150, Math.min(450, newY));

          updates.push({
            id: ant.id,
            changes: {
              position: { x: newX, y: clampedY },
              rotation: lerpAngle(ant.rotation, targetAngle, deltaTime * 8),
            },
          });
        }
        continue;
      }

      // 正常移动状态：向敌方基地前进
      const effectiveSpeed = this.getEffectiveSpeed(ant);
      const baseDirection = ant.side === 'player' ? 1 : -1;
      const targetAngle = ant.side === 'player' ? 0 : Math.PI;

      const centerY = 300;
      const yDiff = centerY - ant.position.y;
      const yMove = Math.sign(yDiff) * Math.min(Math.abs(yDiff) * 0.5, effectiveSpeed * 0.3) * deltaTime;

      const newX = ant.position.x + baseDirection * effectiveSpeed * deltaTime;
      const newY = ant.position.y + yMove;

      updates.push({
        id: ant.id,
        changes: {
          position: { x: newX, y: newY },
          rotation: lerpAngle(ant.rotation, targetAngle, deltaTime * 5),
        },
      });
    }

    if (updates.length > 0) {
      state.updateAnts(updates);
    }
  }

  /**
   * 计算蚂蚁的有效移速
   */
  private getEffectiveSpeed(ant: Ant): number {
    let speedMultiplier = 1;

    for (const buff of ant.buffs) {
      switch (buff.type) {
        case 'slow':
          speedMultiplier *= (1 - buff.value);
          break;
        case 'speedUp':
          speedMultiplier *= (1 + buff.value);
          break;
      }
    }

    return Math.max(10, ant.speed * speedMultiplier);
  }

  /**
   * 蚂蚁碰撞分离
   */
  private resolveAntCollisions(): void {
    const state = useGameStore.getState();
    const { antCollisionRadius } = state.config;
    const minDist = antCollisionRadius * 2;
    const minDistSq = minDist * minDist;

    const aliveAnts = state.ants.filter(a => a.state !== 'dead' && !a.isBeingExecuted);
    if (aliveAnts.length < 2) return;

    const positionAdjustments = new Map<string, { dx: number; dy: number }>();

    const getAdj = (id: string) => {
      let adj = positionAdjustments.get(id);
      if (!adj) {
        adj = { dx: 0, dy: 0 };
        positionAdjustments.set(id, adj);
      }
      return adj;
    };

    for (let i = 0; i < aliveAnts.length; i++) {
      const a = aliveAnts[i];
      for (let j = i + 1; j < aliveAnts.length; j++) {
        const b = aliveAnts[j];

        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;
        const distSq = dx * dx + dy * dy;

        if (distSq >= minDistSq) continue;

        const dist = Math.sqrt(distSq);
        const overlap = minDist - dist;

        let pushX: number, pushY: number;
        if (dist < 0.01) {
          const randomAngle = Math.random() * Math.PI * 2;
          pushX = Math.cos(randomAngle);
          pushY = Math.sin(randomAngle);
        } else {
          pushX = dx / dist;
          pushY = dy / dist;
        }

        const pushAmount = overlap * 0.4;
        const adjA = getAdj(a.id);
        const adjB = getAdj(b.id);

        adjA.dx -= pushX * pushAmount;
        adjA.dy -= pushY * pushAmount;
        adjB.dx += pushX * pushAmount;
        adjB.dy += pushY * pushAmount;
      }
    }

    if (positionAdjustments.size > 0) {
      const updates: { id: string; changes: Partial<Ant> }[] = [];

      for (const ant of aliveAnts) {
        const adj = positionAdjustments.get(ant.id);
        if (!adj || (adj.dx === 0 && adj.dy === 0)) continue;

        const newX = ant.position.x + adj.dx;
        const newY = ant.position.y + adj.dy;

        updates.push({
          id: ant.id,
          changes: {
            position: {
              x: Math.max(50, Math.min(GAME_CONFIG.mapWidth - 50, newX)),
              y: Math.max(150, Math.min(450, newY)),
            },
          },
        });
      }

      if (updates.length > 0) {
        state.updateAnts(updates);
      }
    }
  }
}
