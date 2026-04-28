/**
 * 孵化系统
 * 负责蚂蚁孵化
 */

import { useGameStore } from '../store/gameStore';
import { GameEvents } from '../core/Events';

export class SpawnSystem {
  constructor() {}

  /**
   * 更新孵化系统
   */
  update(deltaTime: number): void {
    this.handleHatcherySpawning(deltaTime);
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
   * 计算当前孵化间隔（初始4秒，每过1分钟延长1秒）
   */
  getCurrentSpawnInterval(): number {
    const state = useGameStore.getState();
    const minutesElapsed = Math.floor(state.stats.gameTime / 60000);
    return state.config.spawnInterval + minutesElapsed * 1000;
  }

  /**
   * 处理孵化室生产
   */
  private handleHatcherySpawning(deltaTime: number): void {
    const state = useGameStore.getState();
    const { maxAntsPerHatchery } = state.config;
    
    // 更新孵化室冷却
    state.updateHatcheryCooldowns(deltaTime * 1000);
    
    // 计算当前孵化间隔
    const currentSpawnInterval = this.getCurrentSpawnInterval();
    
    // 检查每个孵化室是否可以生产
    const updatedState = useGameStore.getState();
    for (const hatchery of updatedState.hatcheries) {
      if (hatchery.spawnCooldown <= 0) {
        // 检查该孵化室的存活蚂蚁数量
        const aliveAntsFromHatchery = updatedState.ants.filter(
          ant => ant.hatcheryId === hatchery.id && ant.state !== 'dead'
        ).length;
        
        // 如果存活蚂蚁数量已达上限，跳过生产
        if (aliveAntsFromHatchery >= maxAntsPerHatchery) {
          continue;
        }
        
        // 生产蚂蚁
        const ant = updatedState.spawnAntFromHatchery(hatchery);
        
        if (ant) {
          GameEvents.emitAntSpawn(ant, hatchery);
        }
        
        // 重置冷却时间
        useGameStore.setState((s) => ({
          hatcheries: s.hatcheries.map(h => 
            h.id === hatchery.id 
              ? { ...h, spawnCooldown: currentSpawnInterval }
              : h
          ),
        }));
      }
    }
  }
}
