/**
 * 蚁后系统
 * 负责蚁后攻击和伤害处理
 */

import { useGameStore } from '../store/gameStore';
import { GameEvents } from '../core/Events';
import { QUEEN_CONFIG, QUEEN_ATTACK_CONFIG } from '../config/gameConfig';
import type { Ant, Side } from '../types';
import { v4 as uuidv4 } from 'uuid';

function getDistance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

function getAngle(x1: number, y1: number, x2: number, y2: number): number {
  return Math.atan2(y2 - y1, x2 - x1);
}

export class QueenSystem {
  private playerQueenAttackCooldown = 0;
  private enemyQueenAttackCooldown = 0;

  constructor() {}

  /**
   * 更新蚁后系统
   */
  update(deltaTime: number): void {
    this.handleQueenAttacks(deltaTime);
    this.handleQueenCollisions();
  }

  /**
   * 重置系统
   */
  reset(): void {
    this.playerQueenAttackCooldown = 0;
    this.enemyQueenAttackCooldown = 0;
  }

  /**
   * 销毁系统
   */
  destroy(): void {}

  /**
   * 处理蚁后攻击
   */
  private handleQueenAttacks(deltaTime: number): void {
    const state = useGameStore.getState();
    const deltaMs = deltaTime * 1000;

    this.playerQueenAttackCooldown = Math.max(0, this.playerQueenAttackCooldown - deltaMs);
    this.enemyQueenAttackCooldown = Math.max(0, this.enemyQueenAttackCooldown - deltaMs);

    const aliveAnts = state.ants.filter(a => a.state !== 'dead' && !a.isBeingExecuted);

    // 玩家蚁后攻击
    if (this.playerQueenAttackCooldown <= 0 && state.playerQueen.hp > 0) {
      const target = this.findNearestTarget('player', aliveAnts);
      if (target) {
        this.fireQueenProjectile('player', QUEEN_CONFIG.playerPosition, target);
        this.playerQueenAttackCooldown = QUEEN_ATTACK_CONFIG.attackInterval;
        GameEvents.emitQueenAttack('player', target.id, QUEEN_ATTACK_CONFIG.damage);
      }
    }

    // 敌方蚁后攻击
    if (this.enemyQueenAttackCooldown <= 0 && state.enemyQueen.hp > 0) {
      const target = this.findNearestTarget('enemy', aliveAnts);
      if (target) {
        this.fireQueenProjectile('enemy', QUEEN_CONFIG.enemyPosition, target);
        this.enemyQueenAttackCooldown = QUEEN_ATTACK_CONFIG.attackInterval;
        GameEvents.emitQueenAttack('enemy', target.id, QUEEN_ATTACK_CONFIG.damage);
      }
    }
  }

  /**
   * 发射蚁后子弹
   */
  private fireQueenProjectile(side: Side, queenPos: { x: number; y: number }, target: Ant): void {
    const state = useGameStore.getState();

    const angle = getAngle(queenPos.x, queenPos.y, target.position.x, target.position.y);

    const projectile = {
      id: uuidv4(),
      side,
      ownerId: `queen-${side}`,
      targetId: target.id,
      damage: QUEEN_ATTACK_CONFIG.damage,
      speed: QUEEN_ATTACK_CONFIG.projectileSpeed,
      position: {
        x: queenPos.x + Math.cos(angle) * 40,
        y: queenPos.y + Math.sin(angle) * 40,
      },
      rotation: angle,
      isQueenProjectile: true,
    };

    state.addProjectile(projectile);
    GameEvents.emitProjectileFire(projectile);
  }

  /**
   * 寻找最近的敌方蚂蚁
   */
  private findNearestTarget(side: Side, aliveAnts: Ant[]): Ant | null {
    const queenPos = side === 'player' ? QUEEN_CONFIG.playerPosition : QUEEN_CONFIG.enemyPosition;
    const { range } = QUEEN_ATTACK_CONFIG;

    let nearest: Ant | null = null;
    let nearestDist = Infinity;

    for (const ant of aliveAnts) {
      if (ant.side === side) continue;

      const dist = getDistance(queenPos.x, queenPos.y, ant.position.x, ant.position.y);
      if (dist <= range && dist < nearestDist) {
        nearestDist = dist;
        nearest = ant;
      }
    }

    return nearest;
  }

  /**
   * 处理蚂蚁到达蚁后位置
   */
  private handleQueenCollisions(): void {
    const state = useGameStore.getState();
    const { queenDamage } = state.config;
    const toRemove: string[] = [];

    for (const ant of state.ants) {
      if (ant.state === 'dead') continue;

      // 玩家蚂蚁到达敌方蚁后
      if (ant.side === 'player' && ant.position.x >= QUEEN_CONFIG.enemyPosition.x - 30) {
        state.damageQueen('enemy', queenDamage);
        toRemove.push(ant.id);
        GameEvents.emitQueenDamaged('enemy', queenDamage, state.enemyQueen.hp);
      }

      // 敌方蚂蚁到达玩家蚁后
      if (ant.side === 'enemy' && ant.position.x <= QUEEN_CONFIG.playerPosition.x + 30) {
        state.damageQueen('player', queenDamage);
        toRemove.push(ant.id);
        GameEvents.emitQueenDamaged('player', queenDamage, state.playerQueen.hp);
      }
    }

    // 移除已攻击蚁后的蚂蚁
    for (const id of toRemove) {
      state.removeAnt(id);
    }
  }
}
