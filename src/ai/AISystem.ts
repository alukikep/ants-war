/**
 * AI 系统
 * 负责 AI 决策和执行
 */

import { useGameStore, calculateHatcheryCost } from '../store/gameStore';
import { GameEvents } from '../core/Events';
import type { AntTemplate, HeadVariant, ThoraxVariant, AbdomenVariant, GridPosition, Hatchery } from '../types';
import { HEAD_CONFIGS, THORAX_CONFIGS, ABDOMEN_CONFIGS, calculateAntStats } from '../config/partStats';

/**
 * AI 运行模式
 */
export type AIMode = 'upgrade_focus' | 'build_focus' | 'iterate';

/**
 * AI 决策动作类型
 */
export type AIActionType = 'build' | 'upgrade' | 'demolish' | 'wait';

/**
 * AI 决策结果
 */
export interface AIDecision {
  action: AIActionType;
  buildPosition?: GridPosition;
  buildTemplate?: AntTemplate;
  targetHatcheryId?: string;
  reason?: string;
}

/**
 * AI 战场态势分析数据
 */
export interface AIBattleContext {
  enemyFood: number;
  playerFood: number;
  enemyQueenHp: number;
  enemyQueenMaxHp: number;
  playerQueenHp: number;
  playerQueenMaxHp: number;
  enemyHatcheries: Hatchery[];
  playerHatcheries: Hatchery[];
  enemyAntsCount: number;
  playerAntsCount: number;
  availableBuildPositions: GridPosition[];
  upgradableHatcheries: Hatchery[];
  gameTime: number;
  availableHeads: HeadVariant[];
  availableThoraxes: ThoraxVariant[];
  availableAbdomens: AbdomenVariant[];
}

/**
 * AI 决策器接口
 */
export interface AIDecisionMaker {
  makeDecision(context: AIBattleContext): AIDecision;
}

/**
 * 默认 AI 决策器
 */
export class DefaultAIDecisionMaker implements AIDecisionMaker {
  mode: AIMode = 'iterate'; // 默认使用迭代模式，主动拆除弱单位替换为强单位
  preferredTemplate: AntTemplate | null = null;

  makeDecision(context: AIBattleContext): AIDecision {
    const { enemyFood, enemyHatcheries, availableBuildPositions, availableHeads, availableThoraxes, availableAbdomens } = context;

    if (enemyHatcheries.length === 0 && availableBuildPositions.length > 0) {
      const template = this.selectTemplate(availableHeads, availableThoraxes, availableAbdomens);
      const cost = calculateHatcheryCost(template);
      if (enemyFood >= cost) {
        return {
          action: 'build',
          buildPosition: this.pickBuildPosition(availableBuildPositions),
          buildTemplate: template,
          reason: '没有孵化室，优先建造',
        };
      }
    }

    switch (this.mode) {
      case 'upgrade_focus':
        return this.decideUpgradeFocus(context);
      case 'build_focus':
        return this.decideBuildFocus(context);
      case 'iterate':
        return this.decideIterate(context);
      default:
        return this.decideBuildFocus(context);
    }
  }

  private decideUpgradeFocus(context: AIBattleContext): AIDecision {
    const { enemyFood, upgradableHatcheries, availableBuildPositions, availableHeads, availableThoraxes, availableAbdomens } = context;

    if (upgradableHatcheries.length > 0) {
      const sorted = [...upgradableHatcheries].sort((a, b) => a.level - b.level);
      for (const hatchery of sorted) {
        if (enemyFood >= hatchery.cost) {
          return {
            action: 'upgrade',
            targetHatcheryId: hatchery.id,
            reason: `[升级优先] 升级孵化室(等级${hatchery.level}→${hatchery.level + 1})`,
          };
        }
      }
    }

    if (availableBuildPositions.length > 0) {
      const template = this.selectTemplate(availableHeads, availableThoraxes, availableAbdomens);
      const cost = calculateHatcheryCost(template);
      if (enemyFood >= cost) {
        return {
          action: 'build',
          buildPosition: this.pickBuildPosition(availableBuildPositions),
          buildTemplate: template,
          reason: '[升级优先] 无可升级，建造新孵化室',
        };
      }
    }

    return { action: 'wait', reason: '[升级优先] 资源不足' };
  }

  private decideBuildFocus(context: AIBattleContext): AIDecision {
    const { enemyFood, availableBuildPositions, upgradableHatcheries, availableHeads, availableThoraxes, availableAbdomens } = context;

    if (availableBuildPositions.length > 0) {
      const template = this.selectTemplate(availableHeads, availableThoraxes, availableAbdomens);
      const cost = calculateHatcheryCost(template);
      if (enemyFood >= cost) {
        return {
          action: 'build',
          buildPosition: this.pickBuildPosition(availableBuildPositions),
          buildTemplate: template,
          reason: '[扩张优先] 建造新孵化室扩大军队',
        };
      }
    }

    if (upgradableHatcheries.length > 0) {
      const sorted = [...upgradableHatcheries].sort((a, b) => b.cost - a.cost);
      for (const hatchery of sorted) {
        if (enemyFood >= hatchery.cost) {
          return {
            action: 'upgrade',
            targetHatcheryId: hatchery.id,
            reason: `[扩张优先] 已满，升级孵化室(等级${hatchery.level}→${hatchery.level + 1})`,
          };
        }
      }
    }

    return { action: 'wait', reason: '[扩张优先] 资源不足' };
  }

  private decideIterate(context: AIBattleContext): AIDecision {
    const { enemyFood, enemyHatcheries, availableBuildPositions, upgradableHatcheries, availableHeads, availableThoraxes, availableAbdomens } = context;

    const targetTemplate = this.selectTemplate(availableHeads, availableThoraxes, availableAbdomens);
    const targetPower = this.calculateTemplatePower(targetTemplate);
    const targetCost = calculateHatcheryCost(targetTemplate);

    // 计算敌方孵化室的战力，找出最弱的
    let weakestHatchery: Hatchery | null = null;
    let weakestPower = Infinity;
    for (const h of enemyHatcheries) {
      const power = this.calculateHatcheryPower(h);
      if (power < weakestPower) {
        weakestPower = power;
        weakestHatchery = h;
      }
    }

    // 当接近满员时（剩余1个位置），考虑拆除最弱的并建更强的
    if (availableBuildPositions.length <= 1 && enemyHatcheries.length > 0 && weakestHatchery) {
      // 只有当新模板比最弱孵化室强至少10%时才拆除重建
      if (weakestPower * 1.1 < targetPower && enemyFood >= targetCost) {
        return {
          action: 'demolish',
          targetHatcheryId: weakestHatchery.id,
          reason: `[迭代] 拆除弱孵化室(战力${weakestPower.toFixed(0)})建造更强(战力${targetPower.toFixed(0)})`,
        };
      }
      // 如果新模板不够强但有位置，直接建造（不要拆除）
      if (availableBuildPositions.length > 0 && enemyFood >= targetCost) {
        return {
          action: 'build',
          buildPosition: this.pickBuildPosition(availableBuildPositions),
          buildTemplate: targetTemplate,
          reason: `[迭代] 有空位，建造高级孵化室(战力${targetPower.toFixed(0)})`,
        };
      }
    }

    // 位置充足时直接建造
    if (availableBuildPositions.length > 1) {
      if (enemyFood >= targetCost) {
        return {
          action: 'build',
          buildPosition: this.pickBuildPosition(availableBuildPositions),
          buildTemplate: targetTemplate,
          reason: `[迭代] 有空位，建造高级孵化室(战力${targetPower.toFixed(0)})`,
        };
      }
    }

    // 升级已有的高级孵化室
    if (upgradableHatcheries.length > 0) {
      // 优先升级等级高、成本高的
      const sorted = [...upgradableHatcheries].sort((a, b) => {
        // 优先升级3级（最高级）的孵化室
        if (a.level === 3 && b.level !== 3) return -1;
        if (b.level === 3 && a.level !== 3) return 1;
        return b.cost - a.cost;
      });

      for (const hatchery of sorted) {
        if (enemyFood >= hatchery.cost) {
          return {
            action: 'upgrade',
            targetHatcheryId: hatchery.id,
            reason: `[迭代] 升级高级孵化室(等级${hatchery.level}→${hatchery.level + 1})`,
          };
        }
      }
    }

    return { action: 'wait', reason: '[迭代] 资源不足' };
  }

  /**
   * 计算单个孵化室的战力
   */
  private calculateHatcheryPower(hatchery: Hatchery): number {
    const stats = calculateAntStats(
      hatchery.template.head,
      hatchery.template.thorax,
      hatchery.template.abdomen
    );

    // 综合战力 = 攻击*2 + 生命 + 速度 + 攻速加成
    // 攻速越快（attackSpeed越小）加成越高，所以用 1000 - attackSpeed
    const basePower = stats.damage * 2 + stats.hp + stats.speed + (1000 - stats.attackSpeed);

    // 等级加成：每级 +30% 战力
    const levelMultiplier = 1 + (hatchery.level - 1) * 0.3;

    return basePower * levelMultiplier;
  }

  /**
   * 计算模板的战力（不考虑等级，用于比较）
   */
  private calculateTemplatePower(template: AntTemplate): number {
    const stats = calculateAntStats(
      template.head,
      template.thorax,
      template.abdomen
    );
    return stats.damage * 2 + stats.hp + stats.speed + (1000 - stats.attackSpeed);
  }

  private selectTemplate(heads: HeadVariant[], thoraxes: ThoraxVariant[], abdomens: AbdomenVariant[]): AntTemplate {
    if (this.preferredTemplate) {
      return { ...this.preferredTemplate };
    }

    // 优先选择高价值部件（成本高的部件通常属性更强）
    const head = this.selectBestPart(heads, HEAD_CONFIGS);
    const thorax = this.selectBestPart(thoraxes, THORAX_CONFIGS);
    const abdomen = this.selectBestPart(abdomens, ABDOMEN_CONFIGS);

    return {
      head,
      thorax,
      abdomen,
    };
  }

  /**
   * 选择最佳部件（成本最高的）
   */
  private selectBestPart<T extends string>(
    variants: T[],
    configs: Record<string, { cost: number; stats: { damage: number; hp: number; speed: number; attackSpeed: number } }>
  ): T {
    if (variants.length === 0) {
      throw new Error('No variants available');
    }
    if (variants.length === 1) {
      return variants[0];
    }

    // 按综合价值排序：成本 + 属性加成
    const sorted = [...variants].sort((a, b) => {
      const configA = configs[a];
      const configB = configs[b];
      const valueA = configA.cost + (configA.stats.damage + configA.stats.hp / 2) * 2;
      const valueB = configB.cost + (configB.stats.damage + configB.stats.hp / 2) * 2;
      return valueB - valueA; // 从高到低排序
    });

    // 80%概率选最高价值的，20%概率随机（增加多样性）
    if (Math.random() < 0.8) {
      return sorted[0];
    }
    return this.randomChoice(variants);
  }

  private pickBuildPosition(positions: GridPosition[]): GridPosition {
    const sorted = [...positions].sort((a, b) => {
      const aMidDist = Math.abs(a.row - 2);
      const bMidDist = Math.abs(b.row - 2);
      return aMidDist - bMidDist;
    });
    return sorted[0];
  }

  private randomChoice<T>(options: T[]): T {
    return options[Math.floor(Math.random() * options.length)];
  }
}

export class AISystem {
  private aiDecisionMaker: AIDecisionMaker = new DefaultAIDecisionMaker();

  constructor() { }

  /**
   * 更新 AI 系统
   */
  update(_deltaTime: number): void {
    // AI 决策由 Game 类在固定间隔调用
  }

  /**
   * 重置系统
   */
  reset(): void {
    if (this.aiDecisionMaker instanceof DefaultAIDecisionMaker) {
      this.aiDecisionMaker.mode = 'iterate'; // 重置为迭代模式
      this.aiDecisionMaker.preferredTemplate = null;
    }
  }

  /**
   * 销毁系统
   */
  destroy(): void { }

  /**
   * 执行 AI 决策
   */
  makeDecision(): void {
    const context = this.getBattleContext();
    const decision = this.aiDecisionMaker.makeDecision(context);
    this.executeDecision(decision);
  }

  /**
   * 获取战场态势
   */
  getBattleContext(): AIBattleContext {
    const state = useGameStore.getState();

    const availableBuildPositions: GridPosition[] = [];
    for (let col = 0; col < state.config.gridCols; col++) {
      for (let row = 0; row < state.config.gridRows; row++) {
        if (state.canBuildAt('enemy', { col, row })) {
          availableBuildPositions.push({ col, row });
        }
      }
    }

    const enemyHatcheries = state.hatcheries.filter(h => h.side === 'enemy');
    const playerHatcheries = state.hatcheries.filter(h => h.side === 'player');

    const upgradableHatcheries = enemyHatcheries.filter(h =>
      h.level < state.config.maxHatcheryLevel &&
      state.enemyFood >= h.cost
    );

    return {
      enemyFood: state.enemyFood,
      playerFood: state.playerFood,
      enemyQueenHp: state.enemyQueen.hp,
      enemyQueenMaxHp: state.enemyQueen.maxHp,
      playerQueenHp: state.playerQueen.hp,
      playerQueenMaxHp: state.playerQueen.maxHp,
      enemyHatcheries,
      playerHatcheries,
      enemyAntsCount: state.ants.filter(a => a.side === 'enemy' && a.state !== 'dead').length,
      playerAntsCount: state.ants.filter(a => a.side === 'player' && a.state !== 'dead').length,
      availableBuildPositions,
      upgradableHatcheries,
      gameTime: state.stats.gameTime,
      availableHeads: state.enemyUnlockedParts.heads,
      availableThoraxes: state.enemyUnlockedParts.thoraxes,
      availableAbdomens: state.enemyUnlockedParts.abdomens,
    };
  }

  /**
   * 执行决策
   */
  private executeDecision(decision: AIDecision): void {
    const state = useGameStore.getState();

    switch (decision.action) {
      case 'build':
        if (decision.buildPosition && decision.buildTemplate) {
          if (state.canBuildAt('enemy', decision.buildPosition)) {
            const cost = calculateHatcheryCost(decision.buildTemplate);
            if (state.enemyFood >= cost) {
              const hatchery = state.buildHatchery('enemy', decision.buildPosition, decision.buildTemplate);
              if (hatchery) {
                console.log(`[AI] 建造孵化室 @ (${decision.buildPosition.col}, ${decision.buildPosition.row}) - ${decision.reason}`);
                GameEvents.emitAIDecision('build', decision.reason);
              }
            }
          }
        }
        break;

      case 'upgrade':
        if (decision.targetHatcheryId) {
          const hatchery = state.hatcheries.find(h => h.id === decision.targetHatcheryId);
          if (hatchery && hatchery.level < state.config.maxHatcheryLevel && state.enemyFood >= hatchery.cost) {
            const success = state.upgradeHatchery(decision.targetHatcheryId);
            if (success) {
              console.log(`[AI] 升级孵化室 - ${decision.reason}`);
              GameEvents.emitAIDecision('upgrade', decision.reason);
            }
          }
        }
        break;

      case 'demolish':
        if (decision.targetHatcheryId) {
          const refund = state.demolishHatchery(decision.targetHatcheryId);
          if (refund > 0) {
            console.log(`[AI] 拆除孵化室 - ${decision.reason}`);
            GameEvents.emitAIDecision('demolish', decision.reason);
          }
        }
        break;

      case 'wait':
        break;
    }
  }
}
