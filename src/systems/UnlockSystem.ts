/**
 * 解锁系统
 * 负责部件解锁逻辑
 */

import { useGameStore } from '../store/gameStore';
import { GameEvents } from '../core/Events';
import { UNLOCK_CONFIG } from '../config/gameConfig';
import { HEAD_CONFIGS, THORAX_CONFIGS, ABDOMEN_CONFIGS } from '../config/partStats';
import type { Side } from '../types';

export class UnlockSystem {
  private lastUnlockGameTime = 0;

  constructor() { }

  /**
   * 更新解锁系统
   */
  update(gameTime: number): void {
    this.handlePartUnlocking(gameTime);
  }

  /**
   * 重置系统
   */
  reset(): void {
    this.lastUnlockGameTime = 0;
  }

  /**
   * 销毁系统
   */
  destroy(): void { }

  /**
   * 部件解锁逻辑
   */
  private handlePartUnlocking(gameTime: number): void {
    const { unlockInterval } = UNLOCK_CONFIG;

    if (gameTime - this.lastUnlockGameTime < unlockInterval) return;
    this.lastUnlockGameTime += unlockInterval;

    // 双方各独立解锁一个部件
    this.unlockRandomPart('player', gameTime);
    this.unlockRandomPart('enemy', gameTime);
  }

  /**
   * 为指定阵营随机解锁一个部件
   */
  private unlockRandomPart(side: Side, gameTime: number): void {
    const state = useGameStore.getState();
    const unlockedParts = side === 'player' ? state.playerUnlockedParts : state.enemyUnlockedParts;
    const { phaseTimeRequirements, parts } = UNLOCK_CONFIG;

    // 根据游戏时间确定当前可用的最高阶段
    let maxPhase = 0;
    for (let i = 0; i < phaseTimeRequirements.length; i++) {
      if (gameTime >= phaseTimeRequirements[i]) {
        maxPhase = i + 1;
      }
    }

    // 获取所有可用阶段中尚未解锁的部件
    const available = parts.filter(p => {
      if (p.phase > maxPhase) return false;
      switch (p.type) {
        case 'head': return !unlockedParts.heads.includes(p.variant as any);
        case 'thorax': return !unlockedParts.thoraxes.includes(p.variant as any);
        case 'abdomen': return !unlockedParts.abdomens.includes(p.variant as any);
      }
    });

    if (available.length === 0) return;

    // 随机选取一个部件解锁
    const picked = available[Math.floor(Math.random() * available.length)];

    // 获取部件中文名
    let nameCN = '';
    switch (picked.type) {
      case 'head': nameCN = HEAD_CONFIGS[picked.variant as keyof typeof HEAD_CONFIGS].nameCN; break;
      case 'thorax': nameCN = THORAX_CONFIGS[picked.variant as keyof typeof THORAX_CONFIGS].nameCN; break;
      case 'abdomen': nameCN = ABDOMEN_CONFIGS[picked.variant as keyof typeof ABDOMEN_CONFIGS].nameCN; break;
    }

    state.unlockPart(side, picked, nameCN);

    const sideLabel = side === 'player' ? '玩家' : 'AI';
    console.log(`[解锁] ${sideLabel}解锁了 ${nameCN}（阶段${picked.phase}）`);

    GameEvents.emitPartUnlocked(side, picked.type, picked.variant, nameCN);
  }
}
