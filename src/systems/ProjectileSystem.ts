/**
 * 投射物系统
 * 负责子弹/投射物的管理
 */

import { useGameStore } from '../store/gameStore';
import type { Ant, Projectile } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { GameEvents } from '../core/Events';
import { SPITTER_SLOW_CONFIG, RANGED_CONFIG } from '../config/partStats';
import { QUEEN_CONFIG, QUEEN_ATTACK_CONFIG } from '../config/gameConfig';

// 工具函数
function getDistance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

function getAngle(x1: number, y1: number, x2: number, y2: number): number {
  return Math.atan2(y2 - y1, x2 - x1);
}

export class ProjectileSystem {
  constructor() {}

  /**
   * 更新投射物系统
   */
  update(deltaTime: number): void {
    this.updateProjectiles(deltaTime);
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
   * 发射远程子弹
   */
  fireProjectile(shooter: Ant, target: Ant): void {
    const state = useGameStore.getState();
    
    const offsetX = Math.cos(shooter.rotation) * 15;
    const offsetY = Math.sin(shooter.rotation) * 15;
    
    const angle = getAngle(
      shooter.position.x, shooter.position.y,
      target.position.x, target.position.y
    );
    
    const slowValue = SPITTER_SLOW_CONFIG.slowByLevel[shooter.sourceLevel - 1] || 0;
    
    const projectile: Projectile = {
      id: uuidv4(),
      side: shooter.side,
      ownerId: shooter.id,
      targetId: target.id,
      damage: shooter.rangedDamage,
      speed: RANGED_CONFIG.projectileSpeed,
      position: {
        x: shooter.position.x + offsetX,
        y: shooter.position.y + offsetY,
      },
      rotation: angle,
      slowEffect: slowValue > 0 ? {
        value: slowValue,
        duration: SPITTER_SLOW_CONFIG.duration,
      } : undefined,
    };
    
    state.addProjectile(projectile);
    GameEvents.emitProjectileFire(projectile);
  }

  /**
   * 发射蚁后子弹
   */
  fireQueenProjectile(side: 'player' | 'enemy', queenPos: { x: number; y: number }, target: Ant): void {
    const state = useGameStore.getState();

    const angle = getAngle(queenPos.x, queenPos.y, target.position.x, target.position.y);

    const projectile: Projectile = {
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
   * 更新所有子弹的位置和碰撞检测
   */
  private updateProjectiles(deltaTime: number): void {
    const state = useGameStore.getState();
    const projectiles = state.projectiles;
    
    if (projectiles.length === 0) return;
    
    const toRemove: string[] = [];
    const antUpdates: { id: string; changes: Partial<Ant> }[] = [];
    const projectileUpdates: { id: string; changes: Partial<Projectile> }[] = [];
    
    for (const projectile of projectiles) {
      const moveX = Math.cos(projectile.rotation) * projectile.speed * deltaTime;
      const moveY = Math.sin(projectile.rotation) * projectile.speed * deltaTime;
      
      const newX = projectile.position.x + moveX;
      const newY = projectile.position.y + moveY;
      
      // 检查是否超出地图边界
      if (newX < 0 || newX > 1800 || newY < 0 || newY > 600) {
        toRemove.push(projectile.id);
        continue;
      }
      
      const target = state.ants.find(a => a.id === projectile.targetId);
      let hitTarget: Ant | null = null;
      
      if (target && target.state !== 'dead' && !target.isExecuting && !target.isBeingExecuted) {
        const distToTarget = getDistance(newX, newY, target.position.x, target.position.y);
        if (distToTarget <= 15) {
          hitTarget = target;
        }
      }
      
      if (!hitTarget) {
        const enemies = state.ants.filter(a => 
          a.side !== projectile.side && a.state !== 'dead' && !a.isExecuting && !a.isBeingExecuted
        );
        
        for (const enemy of enemies) {
          const dist = getDistance(newX, newY, enemy.position.x, enemy.position.y);
          if (dist <= 15) {
            hitTarget = enemy;
            break;
          }
        }
      }
      
      if (hitTarget) {
        const armorMultiplier = this.getArmorMultiplier(hitTarget);
        const actualDamage = Math.max(1, Math.floor(projectile.damage * armorMultiplier));
        const newHp = hitTarget.hp - actualDamage;
        
        antUpdates.push({
          id: hitTarget.id,
          changes: { hp: newHp },
        });
        
        if (newHp <= 0) {
          antUpdates.push({
            id: hitTarget.id,
            changes: { state: 'dead' },
          });
        } else if (projectile.slowEffect) {
          // 减速效果需要通过 BuffSystem 处理，这里只是记录事件
          GameEvents.emitProjectileHit(projectile, hitTarget.id, actualDamage);
        }
        
        toRemove.push(projectile.id);
        continue;
      }
      
      projectileUpdates.push({
        id: projectile.id,
        changes: { position: { x: newX, y: newY } },
      });
    }
    
    if (antUpdates.length > 0) {
      state.updateAnts(antUpdates);
    }
    
    if (projectileUpdates.length > 0) {
      state.updateProjectiles(projectileUpdates);
    }
    
    for (const id of toRemove) {
      state.removeProjectile(id);
    }
  }

  /**
   * 计算护甲减伤
   */
  private getArmorMultiplier(ant: Ant): number {
    let armorValue = ant.baseArmor;
    for (const buff of ant.buffs) {
      if (buff.type === 'armor') {
        armorValue = Math.max(armorValue, buff.value);
      }
    }
    return 1 - Math.min(0.9, armorValue);
  }
}
