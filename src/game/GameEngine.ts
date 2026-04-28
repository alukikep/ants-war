/**
 * 游戏引擎 - 核心逻辑处理
 * 负责游戏循环、索敌、追击、战斗、AI控制
 */

import type { Ant, Side, AntTemplate, HeadVariant, ThoraxVariant, AbdomenVariant, Hatchery, GridPosition, Projectile, Buff } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { useGameStore, calculateHatcheryCost } from '../store/gameStore';
import { GAME_CONFIG, QUEEN_CONFIG, UNLOCK_CONFIG, QUEEN_ATTACK_CONFIG, DIFFICULTY_CONFIG } from '../config/gameConfig';
import { RANGED_CONFIG, ESCAPE_ABILITY_CONFIG, SPITTER_SLOW_CONFIG, ATTACK_SPEED_AURA_CONFIG, STINGER_ABILITY_CONFIG, TAUNT_ABILITY_CONFIG, INSTANT_KILL_CONFIG, HONEYPOT_EXPLOSION_CONFIG, HEAD_CONFIGS, THORAX_CONFIGS, ABDOMEN_CONFIGS, calculateAntStats } from '../config/partStats';

// ============================================
// AI 决策接口
// ============================================

/**
 * AI 运行模式
 * - upgrade_focus: 升级优先，先升级现有孵化室，有空位再建造
 * - build_focus: 扩张优先，先铺满孵化室，满了再升级
 * - iterate: 迭代替换，拆除弱的/不需要的孵化室，建造更强的，满了再升级
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
  // 建造时使用
  buildPosition?: GridPosition;
  buildTemplate?: AntTemplate;
  // 升级/拆除时使用
  targetHatcheryId?: string;
  // 决策原因（用于调试和分析）
  reason?: string;
}

/**
 * AI 战场态势分析数据
 */
export interface AIBattleContext {
  // 资源状态
  enemyFood: number;
  playerFood: number;
  // 蚁后血量
  enemyQueenHp: number;
  enemyQueenMaxHp: number;
  playerQueenHp: number;
  playerQueenMaxHp: number;
  // 孵化室状态
  enemyHatcheries: Hatchery[];
  playerHatcheries: Hatchery[];
  // 蚂蚁数量
  enemyAntsCount: number;
  playerAntsCount: number;
  // 可用建造位置
  availableBuildPositions: GridPosition[];
  // 可升级的孵化室
  upgradableHatcheries: Hatchery[];
  // 游戏时间
  gameTime: number;
  // AI 已解锁部件
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
 * 默认 AI 决策器 - 支持多种运行模式
 * - upgrade_focus: 升级优先（先升级再建造）
 * - build_focus: 扩张优先（先铺满再升级）
 * - iterate: 迭代替换（拆弱建强，满了再升级）
 */
export class DefaultAIDecisionMaker implements AIDecisionMaker {
  /** 当前运行模式 */
  mode: AIMode = 'iterate';

  /** AI 首选模板 */
  preferredTemplate: AntTemplate | null = null;

  makeDecision(context: AIBattleContext): AIDecision {
    const { enemyFood, enemyHatcheries, availableBuildPositions, availableHeads, availableThoraxes, availableAbdomens } = context;

    // 共用: 如果没有孵化室，无论什么模式都优先建造
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

    // 根据模式分发
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

  /**
   * 模式1: 升级优先
   * 优先升级现有孵化室增强质量，有空位且资源富余再建造
   */
  private decideUpgradeFocus(context: AIBattleContext): AIDecision {
    const { enemyFood, upgradableHatcheries, availableBuildPositions, availableHeads, availableThoraxes, availableAbdomens } = context;

    // 优先升级（低等级先升）
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

    // 没有可升级的，再考虑建造
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

  /**
   * 模式2: 扩张优先
   * 先铺满孵化室数量（数量大于质量），满了再升级
   */
  private decideBuildFocus(context: AIBattleContext): AIDecision {
    const { enemyFood, availableBuildPositions, upgradableHatcheries, availableHeads, availableThoraxes, availableAbdomens } = context;

    // 有空位就优先建造
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

    // 没有空位了，开始升级（优先升级高价值的）
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

  /**
   * 模式3: 迭代替换
   * 拆除最弱/最不匹配的孵化室 → 建造更强的 → 满了则升级
   */
  private decideIterate(context: AIBattleContext): AIDecision {
    const { enemyFood, enemyHatcheries, availableBuildPositions, upgradableHatcheries, availableHeads, availableThoraxes, availableAbdomens } = context;

    // 计算当前推荐模板的建造成本
    const targetTemplate = this.selectTemplate(availableHeads, availableThoraxes, availableAbdomens);
    const targetCost = calculateHatcheryCost(targetTemplate);

    // 计算所有敌方孵化室的战力，找出最弱的
    const hatcheryPowers = enemyHatcheries.map(h => ({
      hatchery: h,
      power: this.calculateHatcheryPower(h),
    }));
    const weakestEntry = hatcheryPowers.reduce((min, curr) =>
      curr.power < min.power ? curr : min,
      hatcheryPowers[0]
    );

    // 当接近满员时（剩余<=1个位置），考虑拆建替换
    if (availableBuildPositions.length <= 1 && enemyHatcheries.length > 0 && weakestEntry) {
      const weakest = weakestEntry.hatchery;
      const weakestPower = weakestEntry.power;
      const targetPower = this.calculateTemplatePower(targetTemplate);

      // 计算拆除后能返还多少食物
      const refundEstimate = Math.floor(weakest.totalInvested * GAME_CONFIG.demolishRefundRate);
      const totalFoodAfterDemolish = enemyFood + refundEstimate;

      // 只有当新模板比最弱孵化室强至少10%时才拆建
      // 并且拆建后食物够建新的
      if (weakestPower * 1.1 < targetPower && totalFoodAfterDemolish >= targetCost) {
        return {
          action: 'demolish',
          targetHatcheryId: weakest.id,
          reason: `[迭代] 拆除弱孵化室(战力${weakestPower.toFixed(0)})建造更强(战力${targetPower.toFixed(0)})`,
        };
      }

      // 如果新模板不够强但有位置，直接建造（不要拆除）
      if (availableBuildPositions.length > 0 && enemyFood >= targetCost) {
        return {
          action: 'build',
          buildPosition: this.pickBuildPosition(availableBuildPositions),
          buildTemplate: targetTemplate,
          reason: '[迭代] 有空位，建造新孵化室',
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
          reason: '[迭代] 有空位，建造新孵化室',
        };
      }
    }

    // 找不到需要替换的 → 开始升级
    if (upgradableHatcheries.length > 0) {
      const sorted = [...upgradableHatcheries].sort((a, b) => b.cost - a.cost);
      for (const hatchery of sorted) {
        if (enemyFood >= hatchery.cost) {
          return {
            action: 'upgrade',
            targetHatcheryId: hatchery.id,
            reason: `[迭代] 阵容已优化，升级孵化室(等级${hatchery.level}→${hatchery.level + 1})`,
          };
        }
      }
    }

    return { action: 'wait', reason: '[迭代] 资源不足' };
  }

  /**
   * 计算孵化室的战力（用于AI决策）
   */
  private calculateHatcheryPower(hatchery: Hatchery): number {
    const stats = calculateAntStats(
      hatchery.template.head,
      hatchery.template.thorax,
      hatchery.template.abdomen
    );
    // 综合战力 = 攻击*2 + 生命 + 速度 + (1000 - 攻速)作为攻速加成 + 战略价值
    const basePower = stats.damage * 2 + stats.hp + stats.speed + (1000 - stats.attackSpeed) + stats.strategicValue;
    // 等级加成：每级 +30% 战力
    const levelMultiplier = 1 + (hatchery.level - 1) * 0.3;
    return basePower * levelMultiplier;
  }

  /**
   * 计算模板的战力（不考虑等级）
   */
  private calculateTemplatePower(template: AntTemplate): number {
    const stats = calculateAntStats(
      template.head,
      template.thorax,
      template.abdomen
    );
    return stats.damage * 2 + stats.hp + stats.speed + (1000 - stats.attackSpeed) + stats.strategicValue;
  }

  /**
   * 选择蚂蚁模板
   */
  private selectTemplate(
    heads: HeadVariant[],
    thoraxes: ThoraxVariant[],
    abdomens: AbdomenVariant[],
  ): AntTemplate {
    // 如果有首选模板，直接使用
    if (this.preferredTemplate) {
      return { ...this.preferredTemplate };
    }
    // 否则随机
    return {
      head: this.randomChoice(heads),
      thorax: this.randomChoice(thoraxes),
      abdomen: this.randomChoice(abdomens),
    };
  }

  /**
   * 选择建造位置：优先靠近中间行
   */
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

/**
 * 自定义 AI 决策器占位 - 可扩展实现
 */
export class CustomAIDecisionMaker implements AIDecisionMaker {
  // 预留CustomAI API配置
  // private apiKey: string;
  // private endpoint: string;

  constructor(_config?: { apiKey?: string; endpoint?: string }) {
    // this.apiKey = config?.apiKey || '';
    // this.endpoint = config?.endpoint || '';
  }

  makeDecision(context: AIBattleContext): AIDecision {
    // TODO: 实现 CustomAI API 调用
    // 1. 将 context 转换为 prompt
    // 2. 调用 CustomAI API
    // 3. 解析响应为 AIDecision

    // 当前回退到默认策略
    console.log('[CustomAI AI] 使用默认策略（CustomAI未实现）');
    return new DefaultAIDecisionMaker().makeDecision(context);
  }
}

// 计算两点间距离
function getDistance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

// 计算从点1到点2的角度
function getAngle(x1: number, y1: number, x2: number, y2: number): number {
  return Math.atan2(y2 - y1, x2 - x1);
}

// 平滑旋转角度（避免突然转向）
function lerpAngle(current: number, target: number, t: number): number {
  // 标准化角度差
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * t;
}

// 尾针甩尾事件（用于渲染器播放动画）
export interface StingerStrikeEvent {
  antId: string;             // 触发尾针的蚂蚁ID
  time: number;              // 触发时间 (performance.now)
}

// 蜜罐爆炸事件（用于渲染器播放动画）
export interface HoneypotExplosionEvent {
  position: { x: number; y: number };
  side: Side;
  time: number;          // 触发时间 (performance.now)
  healedAntIds: string[]; // 被回复的蚂蚁ID列表
}

export class GameEngine {
  private isRunning = false;
  private animationFrameId: number | null = null;
  private lastFrameTime = 0;
  private lastFoodTime = 0;
  private lastAIDecisionTime = 0;

  // AI 决策器（可替换为 CustomAI 实现）
  private aiDecisionMaker: AIDecisionMaker = new DefaultAIDecisionMaker();

  // AI 决策间隔（毫秒）
  private aiDecisionInterval = 2000;

  // 尾针甩尾事件列表（渲染器消费后清除）
  public stingerStrikeEvents: StingerStrikeEvent[] = [];

  // 蜜罐爆炸事件列表（渲染器消费后清除）
  public honeypotExplosions: HoneypotExplosionEvent[] = [];

  // 已处理爆炸的蚂蚁ID（防止重复触发）
  private processedHoneypotDeaths: Set<string> = new Set();

  // 部件解锁计时器（基于游戏时间）
  private lastUnlockGameTime = 0;

  // 蚁后远程攻击计时器
  private playerQueenAttackCooldown = 0;     // 玩家蚁后攻击冷却 (ms)
  private enemyQueenAttackCooldown = 0;      // 敌方蚁后攻击冷却 (ms)

  // 赛后总结标记（防止重复调用）
  private postGameSummarized = false;

  constructor() {
    this.lastFoodTime = Date.now();
    this.lastAIDecisionTime = Date.now();
  }

  /**
   * 设置 AI 决策器（用于接入 CustomAI）
   */
  setAIDecisionMaker(decisionMaker: AIDecisionMaker) {
    this.aiDecisionMaker = decisionMaker;
  }

  /**
   * 设置 AI 决策间隔
   */
  setAIDecisionInterval(intervalMs: number) {
    this.aiDecisionInterval = Math.max(500, intervalMs);
  }

  /**
   * 获取当前战场态势（可用于外部分析或 CustomAI 输入）
   */
  getBattleContext(): AIBattleContext {
    const state = useGameStore.getState();

    // 找到可用的建造位置
    const availableBuildPositions: GridPosition[] = [];
    for (let col = 0; col < state.config.gridCols; col++) {
      for (let row = 0; row < state.config.gridRows; row++) {
        if (state.canBuildAt('enemy', { col, row })) {
          availableBuildPositions.push({ col, row });
        }
      }
    }

    // 获取敌方孵化室
    const enemyHatcheries = state.hatcheries.filter(h => h.side === 'enemy');
    const playerHatcheries = state.hatcheries.filter(h => h.side === 'player');

    // 找到可升级的孵化室
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
      // AI 已解锁部件
      availableHeads: state.enemyUnlockedParts.heads,
      availableThoraxes: state.enemyUnlockedParts.thoraxes,
      availableAbdomens: state.enemyUnlockedParts.abdomens,
    };
  }

  /**
   * 手动执行 AI 拆除孵化室（为 CustomAI 预留的接口）
   */
  aiDemolishHatchery(hatcheryId: string): { success: boolean; refund: number; reason: string } {
    const state = useGameStore.getState();
    const hatchery = state.hatcheries.find(h => h.id === hatcheryId && h.side === 'enemy');

    if (!hatchery) {
      return { success: false, refund: 0, reason: '孵化室不存在或不属于AI' };
    }

    const refund = state.demolishHatchery(hatcheryId);
    return {
      success: true,
      refund,
      reason: `成功拆除孵化室，返还 ${refund} 食物`
    };
  }

  /**
   * 手动执行 AI 升级孵化室（为 CustomAI 预留的接口）
   */
  aiUpgradeHatchery(hatcheryId: string): { success: boolean; reason: string } {
    const state = useGameStore.getState();
    const hatchery = state.hatcheries.find(h => h.id === hatcheryId && h.side === 'enemy');

    if (!hatchery) {
      return { success: false, reason: '孵化室不存在或不属于AI' };
    }

    if (hatchery.level >= state.config.maxHatcheryLevel) {
      return { success: false, reason: '孵化室已达最高等级' };
    }

    if (state.enemyFood < hatchery.cost) {
      return { success: false, reason: '资源不足' };
    }

    const success = state.upgradeHatchery(hatcheryId);
    return {
      success,
      reason: success ? `成功升级到 ${hatchery.level + 1} 级` : '升级失败'
    };
  }

  /**
   * 手动执行 AI 建造孵化室（为 CustomAI 预留的接口）
   */
  aiBuildHatchery(gridPos: GridPosition, template: AntTemplate): { success: boolean; reason: string } {
    const state = useGameStore.getState();

    if (!state.canBuildAt('enemy', gridPos)) {
      return { success: false, reason: '该位置无法建造' };
    }

    const cost = calculateHatcheryCost(template);
    if (state.enemyFood < cost) {
      return { success: false, reason: '资源不足' };
    }

    const hatchery = state.buildHatchery('enemy', gridPos, template);
    return {
      success: !!hatchery,
      reason: hatchery ? '建造成功' : '建造失败'
    };
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.lastFoodTime = Date.now();
    this.lastAIDecisionTime = Date.now();
    useGameStore.getState().startGame();
    this.gameLoop();
  }

  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  pause() {
    this.isRunning = false;
    useGameStore.getState().pauseGame();
  }

  resume() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    useGameStore.getState().resumeGame();
    this.gameLoop();
  }

  reset() {
    this.stop();
    useGameStore.getState().resetGame();
    this.lastFoodTime = Date.now();
    this.lastAIDecisionTime = Date.now();
    this.lastUnlockGameTime = 0;
    // 重置蚁后攻击冷却
    this.playerQueenAttackCooldown = 0;
    this.enemyQueenAttackCooldown = 0;
    // 重置赛后总结标记
    this.postGameSummarized = false;
    // 重置常规 AI 的模式和模板
    if (this.aiDecisionMaker instanceof DefaultAIDecisionMaker) {
      this.aiDecisionMaker.mode = 'iterate';
      this.aiDecisionMaker.preferredTemplate = null;
    }
  }

  private gameLoop = () => {
    if (!this.isRunning) return;

    const currentTime = performance.now();
    const rawDeltaTime = (currentTime - this.lastFrameTime) / 1000; // 转换为秒
    this.lastFrameTime = currentTime;

    const state = useGameStore.getState();

    // 检查游戏状态
    if (state.status !== 'playing') {
      // 游戏结束，不做任何操作
      this.animationFrameId = requestAnimationFrame(this.gameLoop);
      return;
    }

    // 应用游戏速度倍率
    const deltaTime = rawDeltaTime * state.gameSpeed;

    // 更新游戏时间
    state.incrementGameTime(deltaTime * 1000);

    // 生成食物
    this.handleFoodGeneration();

    // 部件解锁（每分钟双方各解锁一个）
    this.handlePartUnlocking();

    // AI 决策与执行（建造/升级/拆除）
    this.handleAIDecision();

    // 孵化室生产蚂蚁
    this.handleHatcherySpawning(deltaTime);

    // 更新 Buff 效果（持续时间、移除过期 Buff）
    this.updateBuffs(deltaTime);

    // 更新攻速加成衰减（白蚁大兵头部光环）
    this.updateAttackSpeedBonus(deltaTime);

    // 更新尾针技能冷却（马塔贝勒蚁腹）
    this.updateStingerCooldowns(deltaTime);

    // 更新嘲讽技能冷却（切叶蚁胸）
    this.updateTauntCooldowns(deltaTime);

    // 索敌和追击
    this.handleTargeting();

    // 更新蚂蚁移动
    this.updateAnts(deltaTime);

    // 蚂蚁碰撞分离（防止重叠扎堆）
    this.resolveAntCollisions();

    // 处理战斗（近战和远程）
    this.handleCombat(deltaTime);

    // 处理嘲讽技能（切叶蚁胸）
    this.handleTauntAbility();

    // 处理特殊能力（大齿猛蚁弹射逃脱）
    this.handleEscapeAbility(deltaTime);

    // 蚁后远程攻击
    this.handleQueenAttack(deltaTime);

    // 更新子弹
    this.updateProjectiles(deltaTime);

    // 检查蚁后碰撞
    this.checkQueenCollision();

    // 处理蜜罐蚁死亡爆炸回复
    this.handleHoneypotExplosion();

    // 清理死亡蚂蚁
    this.cleanupDeadAnts();

    this.animationFrameId = requestAnimationFrame(this.gameLoop);
  };

  /**
   * 更新所有蚂蚁的 Buff 效果
   */
  private updateBuffs(deltaTime: number) {
    const state = useGameStore.getState();
    const deltaMs = deltaTime * 1000;
    const updates: { id: string; changes: Partial<Ant> }[] = [];

    for (const ant of state.ants) {
      if (ant.state === 'dead' || ant.buffs.length === 0) continue;

      let newHp = ant.hp;

      // 处理中毒 tick 伤害（正在执行秒杀的蚂蚁免疫中毒伤害）
      for (const buff of ant.buffs) {
        if (buff.type === 'poison' && buff.tickDamage && !ant.isExecuting) {
          // 计算这一帧应该造成的伤害
          const tickDamage = buff.tickDamage * deltaTime;
          newHp -= tickDamage;
        }
      }

      // 更新每个 Buff 的持续时间，移除过期的 Buff
      const updatedBuffs = ant.buffs
        .map(buff => ({
          ...buff,
          duration: buff.duration - deltaMs,
        }))
        .filter(buff => buff.duration > 0);

      // 构建更新
      const changes: Partial<Ant> = {};

      // 如果生命值有变化
      if (newHp !== ant.hp) {
        changes.hp = Math.max(0, newHp);
        if (newHp <= 0) {
          changes.state = 'dead';
        }
      }

      // 如果 Buff 列表有变化
      if (updatedBuffs.length !== ant.buffs.length ||
        ant.buffs.some((buff, i) => buff.duration !== updatedBuffs[i]?.duration)) {
        changes.buffs = updatedBuffs;
      }

      if (Object.keys(changes).length > 0) {
        updates.push({
          id: ant.id,
          changes,
        });
      }
    }

    if (updates.length > 0) {
      state.updateAnts(updates);
    }
  }

  /**
   * 计算蚂蚁的有效移速（考虑 Buff 影响）
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
   * 给蚂蚁添加 Buff
   */
  private addBuffToAnt(antId: string, newBuff: Omit<Buff, 'id'>): void {
    const state = useGameStore.getState();
    const ant = state.ants.find(a => a.id === antId);
    if (!ant || ant.state === 'dead') return;

    const buffWithId: Buff = {
      ...newBuff,
      id: uuidv4(),
    };

    let updatedBuffs: Buff[];

    if (newBuff.stackable) {
      // 可叠加的 Buff 直接添加
      updatedBuffs = [...ant.buffs, buffWithId];
    } else {
      // 不可叠加的 Buff，刷新持续时间（使用更强的效果）
      const existingBuffIndex = ant.buffs.findIndex(b => b.type === newBuff.type);
      if (existingBuffIndex >= 0) {
        const existingBuff = ant.buffs[existingBuffIndex];
        // 使用更强的效果和更长的持续时间
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
  }

  /**
   * 更新所有蚂蚁的攻速加成衰减
   */
  private updateAttackSpeedBonus(deltaTime: number) {
    const state = useGameStore.getState();
    const decayAmount = ATTACK_SPEED_AURA_CONFIG.decayPerSecond * deltaTime;
    const updates: { id: string; changes: Partial<Ant> }[] = [];

    for (const ant of state.ants) {
      if (ant.state === 'dead' || ant.attackSpeedBonus <= 0) continue;

      // 衰减攻速加成
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
  private updateStingerCooldowns(deltaTime: number) {
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
   * 触发尾针技能效果（马塔贝勒蚁腹）
   * 对目标造成攻速减益和中毒效果
   */
  private triggerStingerAbility(attacker: Ant, target: Ant) {
    if (!attacker.hasStingerAbility || attacker.stingerCooldown > 0) return;

    const state = useGameStore.getState();
    const {
      cooldown,
      attackSpeedReduction,
      attackSpeedDebuffDuration,
      poisonDamageByLevel,
      poisonDuration,
    } = STINGER_ABILITY_CONFIG;

    // 计算中毒伤害（根据孵化室等级）
    const poisonTotalDamage = poisonDamageByLevel[attacker.sourceLevel - 1] || poisonDamageByLevel[0];
    const poisonTickDamage = poisonTotalDamage / (poisonDuration / 1000); // 每秒伤害

    // 设置尾针冷却
    state.updateAnt(attacker.id, { stingerCooldown: cooldown });

    // 给目标添加攻速减益 Buff
    this.addBuffToAnt(target.id, {
      type: 'attackSpeedDown',
      value: attackSpeedReduction,
      duration: attackSpeedDebuffDuration,
      maxDuration: attackSpeedDebuffDuration,
      stackable: false,
    });

    // 给目标添加中毒 Buff
    this.addBuffToAnt(target.id, {
      type: 'poison',
      value: 0,  // 中毒不影响属性，只造成伤害
      duration: poisonDuration,
      maxDuration: poisonDuration,
      stackable: false,
      tickDamage: poisonTickDamage,
    });

    // 推送甩尾动画事件
    this.stingerStrikeEvents.push({
      antId: attacker.id,
      time: performance.now(),
    });

    console.log(`[马塔贝勒蚁] ${attacker.side}方蚂蚁尾针命中！减速50%攻速，中毒${poisonTotalDamage}伤害/${poisonDuration / 1000}秒`);
  }

  /**
   * 计算蚂蚁的有效护甲值（基础护甲 + armor Buff）
   * 返回伤害乘数（如 0.8 = 受到80%伤害 = 20%护甲）
   */
  private getArmorMultiplier(ant: Ant): number {
    let armorValue = ant.baseArmor;

    // 叠加 armor buff（取最强效果，不叠加）
    for (const buff of ant.buffs) {
      if (buff.type === 'armor') {
        armorValue = Math.max(armorValue, buff.value);
      }
    }

    // 护甲上限 90%
    armorValue = Math.min(0.9, armorValue);

    return 1 - armorValue;
  }

  /**
   * 更新嘲讽技能冷却时间
   */
  private updateTauntCooldowns(deltaTime: number) {
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
   * 处理嘲讽技能（切叶蚁胸）
   * 在战斗中自动触发，迫使范围内敌人攻击自己，回复生命，获得护甲buff
   */
  private handleTauntAbility() {
    const state = useGameStore.getState();

    for (const ant of state.ants) {
      // 跳过不符合条件的蚂蚁
      if (ant.state === 'dead' || !ant.hasTauntAbility || ant.tauntCooldown > 0) continue;
      // 只在战斗状态触发
      if (ant.state !== 'fighting') continue;

      const { tauntRadius, healPercent, armorBuffValue, armorBuffDuration, cooldown } = TAUNT_ABILITY_CONFIG;

      // 找到范围内的敌方蚂蚁
      const enemiesInRange: Ant[] = [];
      for (const enemy of state.ants) {
        if (enemy.state === 'dead' || enemy.side === ant.side) continue;

        const dx = enemy.position.x - ant.position.x;
        const dy = enemy.position.y - ant.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= tauntRadius) {
          enemiesInRange.push(enemy);
        }
      }

      // 如果范围内没有敌人，不触发
      if (enemiesInRange.length === 0) continue;

      // 触发嘲讽！
      // 1. 设置冷却
      state.updateAnt(ant.id, { tauntCooldown: cooldown });

      // 2. 回复生命值
      const healAmount = Math.floor(ant.maxHp * healPercent);
      const newHp = Math.min(ant.maxHp, ant.hp + healAmount);
      state.updateAnt(ant.id, { hp: newHp });

      // 3. 给自己添加护甲 Buff
      this.addBuffToAnt(ant.id, {
        type: 'armor',
        value: armorBuffValue,
        duration: armorBuffDuration,
        maxDuration: armorBuffDuration,
        stackable: false,
      });

      // 4. 强制范围内敌人以自身为目标
      const tauntUpdates: { id: string; changes: Partial<Ant> }[] = [];
      for (const enemy of enemiesInRange) {
        // 远程敌人变为 shooting 状态（保持远程），近战变为 fighting
        const newState = enemy.isRanged ? 'shooting' as const : 'fighting' as const;
        tauntUpdates.push({
          id: enemy.id,
          changes: {
            state: newState,
            targetId: ant.id,
          },
        });
      }

      if (tauntUpdates.length > 0) {
        state.updateAnts(tauntUpdates);
      }

      console.log(`[切叶蚁] ${ant.side}方蚂蚁嘲讽！吸引${enemiesInRange.length}个敌人，恢复${healAmount}HP，获得80%护甲5秒`);
    }
  }

  /**
   * 计算蚂蚁的有效攻击间隔（考虑攻速加成）
   * 攻速限制在 20%-300% 范围内
   */
  private getEffectiveAttackSpeed(ant: Ant): number {
    // 攻速加成降低攻击间隔
    // 例如 100% 加成意味着攻击间隔减半
    const speedMultiplier = 1 + ant.attackSpeedBonus;

    // 同时考虑攻速类 Buff
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

    // 计算总攻速倍率
    let totalMultiplier = speedMultiplier * buffMultiplier;

    // 限制攻速在 20%-300% 范围内
    const { minAttackSpeedMultiplier, maxAttackSpeedMultiplier } = STINGER_ABILITY_CONFIG;
    totalMultiplier = Math.max(minAttackSpeedMultiplier, Math.min(maxAttackSpeedMultiplier, totalMultiplier));

    // 攻击间隔 = 基础间隔 / 攻速倍率
    return Math.max(100, ant.attackSpeed / totalMultiplier);
  }

  /**
   * 触发攻速光环效果（白蚁大兵头部）
   */
  private triggerAttackSpeedAura(attacker: Ant) {
    if (!attacker.hasAttackSpeedAura) return;

    const state = useGameStore.getState();
    const { bonusByLevel, maxBonus, auraRadius } = ATTACK_SPEED_AURA_CONFIG;

    // 根据来源孵化室等级获取加成值
    const bonusValue = bonusByLevel[attacker.sourceLevel - 1] || bonusByLevel[0];

    const updates: { id: string; changes: Partial<Ant> }[] = [];

    // 找到范围内的所有友方蚂蚁（包括自己）
    for (const ant of state.ants) {
      if (ant.state === 'dead' || ant.side !== attacker.side) continue;

      // 计算距离
      const dx = ant.position.x - attacker.position.x;
      const dy = ant.position.y - attacker.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= auraRadius) {
        // 增加攻速加成，不超过上限
        const newBonus = Math.min(maxBonus, ant.attackSpeedBonus + bonusValue);

        if (newBonus !== ant.attackSpeedBonus) {
          updates.push({
            id: ant.id,
            changes: { attackSpeedBonus: newBonus },
          });
        }
      }
    }

    if (updates.length > 0) {
      state.updateAnts(updates);
    }
  }

  /**
   * 计算当前食物生成量（初始5，每过1分钟+1）
   */
  private getCurrentFoodPerInterval(): number {
    const state = useGameStore.getState();
    const minutesElapsed = Math.floor(state.stats.gameTime / 60000);
    return state.config.foodPerInterval + minutesElapsed;
  }

  private handleFoodGeneration() {
    const now = Date.now();
    const state = useGameStore.getState();

    // 食物生成间隔按游戏速度缩放
    if (now - this.lastFoodTime >= state.config.foodInterval / state.gameSpeed) {
      const midLineX = state.config.mapWidth / 2;
      const { tugOfWarFoodBonus } = state.config;

      // 动态食物生成量（初始5，每分钟+1）
      const currentFood = this.getCurrentFoodPerInterval();

      // 检测拔河优势：是否有存活单位越过中线
      const aliveAnts = state.ants.filter(a => a.state !== 'dead');
      const playerHasAdvantage = aliveAnts.some(a => a.side === 'player' && a.position.x > midLineX);
      const enemyHasAdvantage = aliveAnts.some(a => a.side === 'enemy' && a.position.x < midLineX);

      // 基础食物 + 拔河优势加成
      const playerFoodAmount = currentFood + (playerHasAdvantage ? tugOfWarFoodBonus : 0);
      const enemyFoodBonus = DIFFICULTY_CONFIG[state.difficulty].enemyFoodBonus;
      const enemyFoodAmount = currentFood + enemyFoodBonus + (enemyHasAdvantage ? tugOfWarFoodBonus : 0);

      state.addFood('player', playerFoodAmount);
      state.addFood('enemy', enemyFoodAmount);
      this.lastFoodTime = now;
    }
  }

  /**
   * 部件解锁系统
   * 每1分钟（游戏时间）双方各随机解锁一个部件
   */
  private handlePartUnlocking() {
    const state = useGameStore.getState();
    const gameTime = state.stats.gameTime;
    const { unlockInterval } = UNLOCK_CONFIG;

    // 检查是否到达下一个解锁时间点
    if (gameTime - this.lastUnlockGameTime < unlockInterval) return;
    this.lastUnlockGameTime += unlockInterval;

    // 双方各独立解锁一个部件
    this.unlockRandomPart('player', gameTime);
    this.unlockRandomPart('enemy', gameTime);
  }

  /**
   * 为指定阵营随机解锁一个部件
   */
  private unlockRandomPart(side: Side, gameTime: number) {
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
        case 'head': return !unlockedParts.heads.includes(p.variant);
        case 'thorax': return !unlockedParts.thoraxes.includes(p.variant);
        case 'abdomen': return !unlockedParts.abdomens.includes(p.variant);
      }
    });

    if (available.length === 0) return; // 当前阶段全部解锁完毕，等待下一阶段

    // 随机选取一个部件解锁
    const picked = available[Math.floor(Math.random() * available.length)];

    // 获取部件中文名
    let nameCN = '';
    switch (picked.type) {
      case 'head': nameCN = HEAD_CONFIGS[picked.variant].nameCN; break;
      case 'thorax': nameCN = THORAX_CONFIGS[picked.variant].nameCN; break;
      case 'abdomen': nameCN = ABDOMEN_CONFIGS[picked.variant].nameCN; break;
    }

    state.unlockPart(side, picked, nameCN);

    const sideLabel = side === 'player' ? '玩家' : 'AI';
    console.log(`[解锁] ${sideLabel}解锁了 ${nameCN}（阶段${picked.phase}）`);
  }

  /**
   * AI 决策与执行
   */
  private handleAIDecision() {
    const now = Date.now();
    const state = useGameStore.getState();

    // AI 决策间隔按游戏速度缩放
    if (now - this.lastAIDecisionTime < this.aiDecisionInterval / state.gameSpeed) return;
    this.lastAIDecisionTime = now;

    // 获取战场态势
    const context = this.getBattleContext();

    // 获取 AI 决策（模式和模板已由 Gemini 设定在 DefaultAIDecisionMaker 中）
    const decision = this.aiDecisionMaker.makeDecision(context);

    // 执行决策
    this.executeAIDecision(decision);
  }

  /**
   * 执行 AI 决策
   */
  private executeAIDecision(decision: AIDecision) {
    const state = useGameStore.getState();

    switch (decision.action) {
      case 'build':
        if (decision.buildPosition && decision.buildTemplate) {
          const result = this.aiBuildHatchery(decision.buildPosition, decision.buildTemplate);
          if (result.success) {
            console.log(`[AI] 建造孵化室 @ (${decision.buildPosition.col}, ${decision.buildPosition.row}) - ${decision.reason}`);
          }
        }
        break;

      case 'upgrade':
        if (decision.targetHatcheryId) {
          const result = this.aiUpgradeHatchery(decision.targetHatcheryId);
          if (result.success) {
            console.log(`[AI] 升级孵化室 - ${decision.reason}`);
          }
        }
        break;

      case 'demolish':
        if (decision.targetHatcheryId) {
          const result = this.aiDemolishHatchery(decision.targetHatcheryId);
          if (result.success) {
            console.log(`[AI] 拆除孵化室 - ${decision.reason}`);
          }
        }
        break;

      case 'wait':
        // 不做任何操作
        break;
    }
  }

  /**
   * 计算当前孵化间隔（初始4秒，每过1分钟延长1秒）
   */
  private getCurrentSpawnInterval(): number {
    const state = useGameStore.getState();
    const minutesElapsed = Math.floor(state.stats.gameTime / 60000);
    return state.config.spawnInterval + minutesElapsed * 1000;
  }

  private handleHatcherySpawning(deltaTime: number) {
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

        // 如果存活蚂蚁数量已达上限，跳过生产（但不重置冷却时间）
        if (aliveAntsFromHatchery >= maxAntsPerHatchery) {
          continue;
        }

        // 生产蚂蚁
        updatedState.spawnAntFromHatchery(hatchery);

        // 重置冷却时间（使用动态孵化间隔）
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

  // 索敌逻辑：检测敌人并锁定目标
  private handleTargeting() {
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

  private updateAnts(deltaTime: number) {
    const state = useGameStore.getState();
    const updates: { id: string; changes: Partial<Ant> }[] = [];
    const { collisionDistance } = state.config;

    for (const ant of state.ants) {
      if (ant.state === 'dead') continue;

      // 战斗中的蚂蚁（近战）
      if (ant.state === 'fighting') {
        const target = ant.targetId ? state.ants.find(a => a.id === ant.targetId) : null;

        // 检查目标是否还有效
        if (!target || target.state === 'dead') {
          // 目标丢失，恢复正常移动，但保留攻击冷却（防止连续秒杀）
          updates.push({
            id: ant.id,
            changes: {
              state: 'moving',
              targetId: null,
            },
          });
          continue;
        }

        // 面向目标
        const targetAngle = getAngle(
          ant.position.x, ant.position.y,
          target.position.x, target.position.y
        );

        // 更新攻击冷却
        updates.push({
          id: ant.id,
          changes: {
            attackCooldown: Math.max(0, ant.attackCooldown - deltaTime * 1000),
            rotation: lerpAngle(ant.rotation, targetAngle, deltaTime * 10),
          },
        });
        continue;
      }

      // 远程射击中的蚂蚁
      if (ant.state === 'shooting') {
        const target = ant.targetId ? state.ants.find(a => a.id === ant.targetId) : null;

        // 检查目标是否还有效
        if (!target || target.state === 'dead') {
          // 目标丢失，恢复正常移动，但保留攻击冷却（防止连续秒杀）
          updates.push({
            id: ant.id,
            changes: {
              state: 'moving',
              targetId: null,
            },
          });
          continue;
        }

        // 检查目标是否还在射程内
        const distToTarget = getDistance(
          ant.position.x, ant.position.y,
          target.position.x, target.position.y
        );

        if (distToTarget > ant.attackRange) {
          // 目标超出射程，切换到追击
          updates.push({
            id: ant.id,
            changes: { state: 'chasing', targetId: target.id },
          });
          continue;
        }

        // 面向目标
        const targetAngle = getAngle(
          ant.position.x, ant.position.y,
          target.position.x, target.position.y
        );

        // 更新攻击冷却
        updates.push({
          id: ant.id,
          changes: {
            attackCooldown: Math.max(0, ant.attackCooldown - deltaTime * 1000),
            rotation: lerpAngle(ant.rotation, targetAngle, deltaTime * 10),
          },
        });
        continue;
      }

      // 追击状态：向目标移动
      if (ant.state === 'chasing') {
        const target = ant.targetId ? state.ants.find(a => a.id === ant.targetId) : null;

        if (!target || target.state === 'dead') {
          // 目标丢失，恢复正常移动
          updates.push({
            id: ant.id,
            changes: { state: 'moving', targetId: null },
          });
          continue;
        }

        // 计算朝向目标的方向
        const dx = target.position.x - ant.position.x;
        const dy = target.position.y - ant.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 0) {
          // 归一化方向向量
          const dirX = dx / distance;
          const dirY = dy / distance;

          // 计算目标角度
          const targetAngle = getAngle(
            ant.position.x, ant.position.y,
            target.position.x, target.position.y
          );

          // 移动向目标（考虑 Buff 影响）
          const effectiveSpeed = this.getEffectiveSpeed(ant);
          const moveDistance = effectiveSpeed * deltaTime;
          const newX = ant.position.x + dirX * moveDistance;
          const newY = ant.position.y + dirY * moveDistance;

          // 限制Y轴范围
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

      // 正常移动状态：向敌方基地前进（考虑 Buff 影响）
      const effectiveSpeed = this.getEffectiveSpeed(ant);
      const baseDirection = ant.side === 'player' ? 1 : -1;
      const targetAngle = ant.side === 'player' ? 0 : Math.PI;

      // 前进的同时稍微向中线靠拢
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
   * 蚂蚁碰撞分离 - 防止蚂蚁重叠扎堆
   * 每帧检测重叠的蚂蚁对，将它们沿连线方向推开
   */
  private resolveAntCollisions() {
    const state = useGameStore.getState();
    const { antCollisionRadius } = state.config;
    const minDist = antCollisionRadius * 2; // 两蚂蚁中心最小间距
    const minDistSq = minDist * minDist;

    // 只处理存活且未被秒杀的蚂蚁
    const aliveAnts = state.ants.filter(a => a.state !== 'dead' && !a.isBeingExecuted);
    if (aliveAnts.length < 2) return;

    // 用 Map 收集位置调整（累加多次推挤）
    const positionAdjustments = new Map<string, { dx: number; dy: number }>();

    const getAdj = (id: string) => {
      let adj = positionAdjustments.get(id);
      if (!adj) {
        adj = { dx: 0, dy: 0 };
        positionAdjustments.set(id, adj);
      }
      return adj;
    };

    // O(N²) 碰撞检测，对于游戏规模（最多~100只蚂蚁）完全够用
    for (let i = 0; i < aliveAnts.length; i++) {
      const a = aliveAnts[i];
      for (let j = i + 1; j < aliveAnts.length; j++) {
        const b = aliveAnts[j];

        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;
        const distSq = dx * dx + dy * dy;

        if (distSq >= minDistSq) continue; // 不重叠，跳过

        const dist = Math.sqrt(distSq);
        const overlap = minDist - dist;

        let pushX: number, pushY: number;
        if (dist < 0.01) {
          // 几乎完全重叠，随机方向推开
          const randomAngle = Math.random() * Math.PI * 2;
          pushX = Math.cos(randomAngle);
          pushY = Math.sin(randomAngle);
        } else {
          // 沿连线方向推开
          pushX = dx / dist;
          pushY = dy / dist;
        }

        // 各推一半距离，乘以柔化系数避免抖动
        const pushAmount = overlap * 0.4;
        const adjA = getAdj(a.id);
        const adjB = getAdj(b.id);

        adjA.dx -= pushX * pushAmount;
        adjA.dy -= pushY * pushAmount;
        adjB.dx += pushX * pushAmount;
        adjB.dy += pushY * pushAmount;
      }
    }

    // 应用位置调整
    if (positionAdjustments.size > 0) {
      const updates: { id: string; changes: Partial<Ant> }[] = [];

      for (const ant of aliveAnts) {
        const adj = positionAdjustments.get(ant.id);
        if (!adj || (adj.dx === 0 && adj.dy === 0)) continue;

        const newX = ant.position.x + adj.dx;
        const newY = ant.position.y + adj.dy;

        // 限制在地图和Y轴活动范围内
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

  private handleCombat(deltaTime: number) {
    const state = useGameStore.getState();
    const updates: { id: string; changes: Partial<Ant> }[] = [];
    const auraTriggerers: Ant[] = []; // 记录需要触发光环的蚂蚁
    const stingerTriggerers: { attacker: Ant; target: Ant }[] = []; // 记录需要触发尾针的蚂蚁

    // 处理近战战斗（fighting状态）
    const fightingAnts = state.ants.filter(a => a.state === 'fighting');

    for (const ant of fightingAnts) {
      const target = ant.targetId ? state.ants.find(a => a.id === ant.targetId) : null;

      if (!target || target.state === 'dead') continue;

      // 跳过正在被秒杀动画中的目标
      if (target.isBeingExecuted) continue;

      // 跳过正在执行秒杀的大头蚁目标（无敌状态）
      if (target.isExecuting) continue;

      // 检查攻击冷却
      if (ant.attackCooldown <= 0) {
        // 大头蚁秒杀判定：根据孵化室等级 3%/5%/8% 几率秒杀
        const instantKillChance = INSTANT_KILL_CONFIG.chanceByLevel[ant.sourceLevel - 1] || INSTANT_KILL_CONFIG.chanceByLevel[0];
        if (ant.hasInstantKill && Math.random() < instantKillChance) {
          // 触发秒杀！标记目标为被秒杀状态，标记攻击者为正在执行秒杀（无敌）
          updates.push({
            id: target.id,
            changes: {
              isBeingExecuted: true,
              executedBy: ant.id,
            },
          });

          // 标记攻击者为正在执行秒杀（无敌状态）
          const effectiveAttackSpeed = this.getEffectiveAttackSpeed(ant);
          updates.push({
            id: ant.id,
            changes: {
              attackCooldown: effectiveAttackSpeed,
              isExecuting: true,
            },
          });

          console.log(`[大头蚁] ${ant.side}方蚂蚁触发秒杀！甩飞敌人！`);

          // 保存攻击者ID用于延迟回调
          const attackerId = ant.id;

          // 设置延迟死亡（动画结束后处理）
          setTimeout(() => {
            const currentState = useGameStore.getState();
            // 击杀受害者
            const victim = currentState.ants.find(a => a.id === target.id);
            if (victim && victim.isBeingExecuted) {
              currentState.updateAnt(target.id, { state: 'dead', hp: 0 });
            }
            // 解除攻击者无敌状态
            const attacker = currentState.ants.find(a => a.id === attackerId);
            if (attacker && attacker.isExecuting) {
              currentState.updateAnt(attackerId, { isExecuting: false });
            }
          }, INSTANT_KILL_CONFIG.executionDuration);

          continue; // 秒杀时跳过普通伤害
        }

        // 计算护甲减伤后的实际伤害
        const armorMultiplier = this.getArmorMultiplier(target);
        const actualDamage = Math.max(1, Math.floor(ant.damage * armorMultiplier));
        const newTargetHp = target.hp - actualDamage;

        updates.push({
          id: target.id,
          changes: { hp: newTargetHp },
        });

        // 使用有效攻击间隔（考虑攻速加成）
        const effectiveAttackSpeed = this.getEffectiveAttackSpeed(ant);
        updates.push({
          id: ant.id,
          changes: { attackCooldown: effectiveAttackSpeed },
        });

        // 标记需要触发攻速光环
        if (ant.hasAttackSpeedAura) {
          auraTriggerers.push(ant);
        }

        // 标记需要触发尾针技能（马塔贝勒蚁腹）
        if (ant.hasStingerAbility && ant.stingerCooldown <= 0) {
          stingerTriggerers.push({ attacker: ant, target });
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
        }
      }
    }

    // 处理远程射击（shooting状态）
    const shootingAnts = state.ants.filter(a => a.state === 'shooting');

    for (const ant of shootingAnts) {
      const target = ant.targetId ? state.ants.find(a => a.id === ant.targetId) : null;

      if (!target || target.state === 'dead') continue;

      // 检查攻击冷却
      if (ant.attackCooldown <= 0) {
        // 发射子弹而不是直接造成伤害
        this.fireProjectile(ant, target);

        // 使用有效攻击间隔（考虑攻速加成）
        const effectiveAttackSpeed = this.getEffectiveAttackSpeed(ant);
        updates.push({
          id: ant.id,
          changes: { attackCooldown: effectiveAttackSpeed },
        });

        // 标记需要触发攻速光环（远程也可以触发）
        if (ant.hasAttackSpeedAura) {
          auraTriggerers.push(ant);
        }
      }
    }

    if (updates.length > 0) {
      state.updateAnts(updates);
    }

    // 触发攻速光环效果
    for (const attacker of auraTriggerers) {
      this.triggerAttackSpeedAura(attacker);
    }

    // 触发尾针技能效果（马塔贝勒蚁腹）
    for (const { attacker, target } of stingerTriggerers) {
      this.triggerStingerAbility(attacker, target);
    }
  }

  private checkQueenCollision() {
    const state = useGameStore.getState();
    const ants = state.ants;
    const queenDamage = state.config.queenDamage;

    const toRemove: string[] = [];

    for (const ant of ants) {
      if (ant.state === 'dead') continue;

      // 玩家蚂蚁到达敌方蚁后
      if (ant.side === 'player' && ant.position.x >= QUEEN_CONFIG.enemyPosition.x - 30) {
        state.damageQueen('enemy', queenDamage);
        toRemove.push(ant.id);
      }

      // 敌方蚂蚁到达玩家蚁后
      if (ant.side === 'enemy' && ant.position.x <= QUEEN_CONFIG.playerPosition.x + 30) {
        state.damageQueen('player', queenDamage);
        toRemove.push(ant.id);
      }
    }

    // 移除已经攻击蚁后的蚂蚁
    for (const id of toRemove) {
      state.removeAnt(id);
    }
  }

  /**
   * 处理蜜罐蚁死亡爆炸回复
   * 死亡时在范围内回复友军50生命值
   */
  private handleHoneypotExplosion() {
    const state = useGameStore.getState();
    const deadHoneypots = state.ants.filter(
      a => a.state === 'dead' && a.hasHoneypotExplosion && !this.processedHoneypotDeaths.has(a.id)
    );

    if (deadHoneypots.length === 0) return;

    const { healAmount, healRadius } = HONEYPOT_EXPLOSION_CONFIG;
    const updates: { id: string; changes: Partial<Ant> }[] = [];

    for (const deadAnt of deadHoneypots) {
      this.processedHoneypotDeaths.add(deadAnt.id);

      // 找到范围内的友方存活蚂蚁
      const healedAntIds: string[] = [];
      for (const ally of state.ants) {
        if (ally.state === 'dead' || ally.side !== deadAnt.side || ally.id === deadAnt.id) continue;

        const dx = ally.position.x - deadAnt.position.x;
        const dy = ally.position.y - deadAnt.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= healRadius) {
          const newHp = Math.min(ally.maxHp, ally.hp + healAmount);
          updates.push({
            id: ally.id,
            changes: { hp: newHp },
          });
          healedAntIds.push(ally.id);
        }
      }

      // 记录爆炸事件（供渲染器播放动画）
      this.honeypotExplosions.push({
        position: { ...deadAnt.position },
        side: deadAnt.side,
        time: performance.now(),
        healedAntIds,
      });

      if (healedAntIds.length > 0) {
        console.log(`[蜜罐蚁] ${deadAnt.side}方蚂蚁死亡爆炸！回复${healedAntIds.length}个友军各${healAmount}HP`);
      }
    }

    if (updates.length > 0) {
      state.updateAnts(updates);
    }
  }

  private cleanupDeadAnts() {
    const state = useGameStore.getState();
    const deadAnts = state.ants.filter(a => a.state === 'dead');

    for (const ant of deadAnts) {
      // 清理已处理的蜜罐爆炸记录
      this.processedHoneypotDeaths.delete(ant.id);
      state.removeAnt(ant.id);
    }
  }

  /**
   * 处理大齿猛蚁的弹射逃脱能力
   */
  private handleEscapeAbility(deltaTime: number) {
    const state = useGameStore.getState();
    // 使用 Map 来合并同一只蚂蚁的多个更新
    const updatesMap: Map<string, Partial<Ant>> = new Map();
    const escapedAntIds: string[] = []; // 记录触发逃脱的蚂蚁ID

    // 辅助函数：合并更新
    const addUpdate = (id: string, changes: Partial<Ant>) => {
      const existing = updatesMap.get(id);
      if (existing) {
        updatesMap.set(id, { ...existing, ...changes });
      } else {
        updatesMap.set(id, changes);
      }
    };

    for (const ant of state.ants) {
      // 跳过死亡蚂蚁和没有逃脱能力的蚂蚁
      if (ant.state === 'dead' || !ant.hasEscapeAbility) continue;

      // 更新冷却时间
      if (ant.escapeAbilityCooldown > 0) {
        addUpdate(ant.id, {
          escapeAbilityCooldown: Math.max(0, ant.escapeAbilityCooldown - deltaTime * 1000),
        });
        continue;
      }

      // 检查血量是否低于40%阈值
      const hpPercent = ant.hp / ant.maxHp;
      if (hpPercent >= ESCAPE_ABILITY_CONFIG.hpThreshold) continue;

      // 触发弹射逃脱能力！
      // 计算弹射方向（向己方基地方向弹射）
      const escapeDirection = ant.side === 'player' ? -1 : 1;
      const escapeDistance = ESCAPE_ABILITY_CONFIG.escapeDistance;

      // 计算新位置（向后弹射）
      const newX = ant.position.x + escapeDirection * escapeDistance;

      // 限制边界
      const clampedX = Math.max(100, Math.min(GAME_CONFIG.mapWidth - 100, newX));

      // 恢复50%最大生命值
      const healAmount = Math.floor(ant.maxHp * ESCAPE_ABILITY_CONFIG.healPercent);
      const newHp = Math.min(ant.maxHp, ant.hp + healAmount);

      // 设置冷却时间：触发后设置10秒冷却
      const newCooldown = ESCAPE_ABILITY_CONFIG.cooldown;

      addUpdate(ant.id, {
        position: { x: clampedX, y: ant.position.y },
        hp: newHp,
        escapeAbilityCooldown: newCooldown,
        hasUsedEscapeAbility: true,
        // 弹射后重置状态，脱离战斗
        state: 'moving',
        targetId: null,
      });

      // 记录逃脱的蚂蚁ID
      escapedAntIds.push(ant.id);

      console.log(`[大齿猛蚁] ${ant.side}方蚂蚁触发弹射逃脱！恢复 ${healAmount} HP (${ant.hp} → ${newHp})/${ant.maxHp}`);
    }

    // 清除所有敌人对逃脱蚂蚁的锁定目标
    if (escapedAntIds.length > 0) {
      for (const ant of state.ants) {
        if (ant.state === 'dead') continue;

        // 如果这只蚂蚁正在攻击/追击一个已经逃脱的蚂蚁，清除目标（保留攻击冷却）
        if (ant.targetId && escapedAntIds.includes(ant.targetId)) {
          addUpdate(ant.id, {
            state: 'moving',
            targetId: null,
          });
        }
      }
    }

    // 转换 Map 为数组并更新
    if (updatesMap.size > 0) {
      const updates = Array.from(updatesMap.entries()).map(([id, changes]) => ({ id, changes }));
      state.updateAnts(updates);
    }
  }

  /**
   * 蚁后远程攻击 - 每0.5秒向最近的敌方蚂蚁发射一个伤害为50的子弹
   * 用于初期缓冲，防止被对手直接碾压
   */
  private handleQueenAttack(deltaTime: number) {
    const state = useGameStore.getState();
    const deltaMs = deltaTime * 1000;

    // 更新双方蚁后攻击冷却
    this.playerQueenAttackCooldown = Math.max(0, this.playerQueenAttackCooldown - deltaMs);
    this.enemyQueenAttackCooldown = Math.max(0, this.enemyQueenAttackCooldown - deltaMs);

    // 存活蚂蚁列表
    const aliveAnts = state.ants.filter(a => a.state !== 'dead' && !a.isBeingExecuted);

    // 玩家蚁后攻击
    if (this.playerQueenAttackCooldown <= 0 && state.playerQueen.hp > 0) {
      const target = this.findQueenTarget('player', aliveAnts);
      if (target) {
        this.fireQueenProjectile('player', QUEEN_CONFIG.playerPosition, target);
        this.playerQueenAttackCooldown = QUEEN_ATTACK_CONFIG.attackInterval;
      }
    }

    // 敌方蚁后攻击
    if (this.enemyQueenAttackCooldown <= 0 && state.enemyQueen.hp > 0) {
      const target = this.findQueenTarget('enemy', aliveAnts);
      if (target) {
        this.fireQueenProjectile('enemy', QUEEN_CONFIG.enemyPosition, target);
        this.enemyQueenAttackCooldown = QUEEN_ATTACK_CONFIG.attackInterval;
      }
    }
  }

  /**
   * 为蚁后寻找攻击范围内最近的敌方蚂蚁
   */
  private findQueenTarget(side: Side, aliveAnts: Ant[]): Ant | null {
    const queenPos = side === 'player' ? QUEEN_CONFIG.playerPosition : QUEEN_CONFIG.enemyPosition;
    const { range } = QUEEN_ATTACK_CONFIG;

    let nearest: Ant | null = null;
    let nearestDist = Infinity;

    for (const ant of aliveAnts) {
      if (ant.side === side) continue; // 跳过友方蚂蚁

      const dist = getDistance(queenPos.x, queenPos.y, ant.position.x, ant.position.y);
      if (dist <= range && dist < nearestDist) {
        nearestDist = dist;
        nearest = ant;
      }
    }

    return nearest;
  }

  /**
   * 蚁后发射子弹
   */
  private fireQueenProjectile(side: Side, queenPos: { x: number; y: number }, target: Ant) {
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
        x: queenPos.x + Math.cos(angle) * 40, // 从蚁后边缘发射
        y: queenPos.y + Math.sin(angle) * 40,
      },
      rotation: angle,
      isQueenProjectile: true,
    };

    state.addProjectile(projectile);
  }

  /**
   * 发射远程子弹
   */
  private fireProjectile(shooter: Ant, target: Ant) {
    const state = useGameStore.getState();

    // 计算子弹初始位置（从蚂蚁头部发射）
    const offsetX = Math.cos(shooter.rotation) * 15;
    const offsetY = Math.sin(shooter.rotation) * 15;

    // 计算朝向目标的角度
    const angle = getAngle(
      shooter.position.x, shooter.position.y,
      target.position.x, target.position.y
    );

    // 计算减速效果（根据孵化室等级）
    // 1级无效果，2级20%减速，3级40%减速
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
      // 附加减速效果（如果有）
      slowEffect: slowValue > 0 ? {
        value: slowValue,
        duration: SPITTER_SLOW_CONFIG.duration,
      } : undefined,
    };

    state.addProjectile(projectile);
  }

  /**
   * 更新所有子弹的位置和碰撞检测
   */
  private updateProjectiles(deltaTime: number) {
    const state = useGameStore.getState();
    const projectiles = state.projectiles;

    if (projectiles.length === 0) return;

    const toRemove: string[] = [];
    const antUpdates: { id: string; changes: Partial<Ant> }[] = [];

    for (const projectile of projectiles) {
      // 移动子弹
      const moveX = Math.cos(projectile.rotation) * projectile.speed * deltaTime;
      const moveY = Math.sin(projectile.rotation) * projectile.speed * deltaTime;

      const newX = projectile.position.x + moveX;
      const newY = projectile.position.y + moveY;

      // 检查是否超出地图边界
      if (newX < 0 || newX > GAME_CONFIG.mapWidth || newY < 0 || newY > GAME_CONFIG.mapHeight) {
        toRemove.push(projectile.id);
        continue;
      }

      // 查找目标
      const target = state.ants.find(a => a.id === projectile.targetId);

      // 如果目标已死亡或不存在，子弹继续飞行但检测其他敌人
      let hitTarget: Ant | null = null;

      // 首先检查原目标（跳过正在执行秒杀的无敌蚂蚁和正在被秒杀的蚂蚁）
      if (target && target.state !== 'dead' && !target.isExecuting && !target.isBeingExecuted) {
        const distToTarget = getDistance(newX, newY, target.position.x, target.position.y);
        if (distToTarget <= 15) {
          hitTarget = target;
        }
      }

      // 如果没有命中原目标，检查是否命中其他敌人
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

      // 处理命中
      if (hitTarget) {
        // 计算护甲减伤后的实际伤害
        const armorMultiplier = this.getArmorMultiplier(hitTarget);
        const actualDamage = Math.max(1, Math.floor(projectile.damage * armorMultiplier));
        const newHp = hitTarget.hp - actualDamage;

        antUpdates.push({
          id: hitTarget.id,
          changes: { hp: newHp },
        });

        // 目标死亡
        if (newHp <= 0) {
          antUpdates.push({
            id: hitTarget.id,
            changes: { state: 'dead' },
          });
        } else if (projectile.slowEffect) {
          // 应用减速效果（目标未死亡时）
          this.addBuffToAnt(hitTarget.id, {
            type: 'slow',
            value: projectile.slowEffect.value,
            duration: projectile.slowEffect.duration,
            maxDuration: projectile.slowEffect.duration,
            stackable: false,  // 减速不叠加，刷新持续时间
          });
        }

        toRemove.push(projectile.id);
        continue;
      }

      // 更新子弹位置
      state.updateProjectiles([{
        id: projectile.id,
        changes: { position: { x: newX, y: newY } },
      }]);
    }

    // 应用蚂蚁状态更新
    if (antUpdates.length > 0) {
      state.updateAnts(antUpdates);
    }

    // 移除已命中或出界的子弹
    for (const id of toRemove) {
      state.removeProjectile(id);
    }
  }
}

// 单例模式
let gameEngineInstance: GameEngine | null = null;

export function getGameEngine(): GameEngine {
  if (!gameEngineInstance) {
    gameEngineInstance = new GameEngine();
  }
  return gameEngineInstance;
}
