/**
 * 游戏引擎 - 核心逻辑处理
 * 负责游戏循环、索敌、追击、战斗、AI控制
 */

import type { Ant, Side, AntTemplate, HeadVariant, ThoraxVariant, AbdomenVariant, Hatchery, GridPosition, Projectile, Buff } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { useGameStore, calculateHatcheryCost } from '../store/gameStore';
import { GAME_CONFIG, QUEEN_CONFIG, UNLOCK_CONFIG, QUEEN_ATTACK_CONFIG, DIFFICULTY_CONFIG } from '../config/gameConfig';
import { RANGED_CONFIG, ESCAPE_ABILITY_CONFIG, SPITTER_SLOW_CONFIG, ATTACK_SPEED_AURA_CONFIG, STINGER_ABILITY_CONFIG, TAUNT_ABILITY_CONFIG, INSTANT_KILL_CONFIG, HONEYPOT_EXPLOSION_CONFIG, HEAD_CONFIGS, THORAX_CONFIGS, ABDOMEN_CONFIGS, calculateAntStats } from '../config/partStats';
import { OfflineScientist } from '../ai/OfflineScientist';
import { playSound } from '../components/SoundControl';
import { GameEvents } from '../core/Events';
import type { ExperimentKind } from '../config/experiments';

/**
 * 模块级 helper：根据 side 和"关心的实验 kind"列表取出 magnitude。
 *
 * - 若 activeExperiment.kind 不在 kindFilter 中 → 返回 1（无影响）
 * - 若 activeExperiment 已过期（endsAt <= gameTime）→ 自动清理并返回 1
 * - 若 activeExperiment.side 不影响该 side → 返回 1（'both' 同时影响两侧）
 * - 否则返回 magnitude
 *
 * 调用方按"magnitude 是直接乘数"使用即可（与 food_rate_* 语义一致）：
 *   spawn_rate_*:  间隔 × magnitude
 *   visibility_fog: detectionRange × magnitude
 *   queen_attack_speed: 攻击间隔 / magnitude
 */
function getExperimentMagnitudeForSide(
  side: 'player' | 'enemy',
  ...kindFilter: ExperimentKind[]
): number {
  const state = useGameStore.getState();
  const exp = state.activeExperiment;
  if (!exp) return 1;
  if (kindFilter.length > 0 && !kindFilter.includes(exp.kind)) return 1;
  if (state.stats.gameTime >= exp.endsAt) {
    // 过期自动清理
    state.clearActiveExperiment();
    return 1;
  }
  if (exp.side !== 'both' && exp.side !== side) return 1;
  return exp.magnitude;
}

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
  // 当前存活蚂蚁按部件组合的兵种构成（供战略层识别战术）
  // 按 (head, thorax, abdomen) 三元组聚合，每条 = {h, t, a, count, maxLv}
  enemyComposition: AntCompositionEntry[];
  playerComposition: AntCompositionEntry[];
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

  // 上一次已结束的科学家实验（避免重复同样的干预；source: types.ExperimentRecord）
  lastExperiment?: {
    kind: import('../config/experiments').ExperimentKind;
    gameTime: number;
    purpose: string;
    side: import('../config/experiments').ExperimentSide;
  };
}

/**
 * 兵种构成条目：按 (head, thorax, abdomen) 聚合的存活蚂蚁统计
 */
export interface AntCompositionEntry {
  /** 头部变体 ID */
  h: HeadVariant;
  /** 胸部变体 ID */
  t: ThoraxVariant;
  /** 腹部变体 ID */
  a: AbdomenVariant;
  /** 该模板存活蚂蚁数量 */
  count: number;
  /** 该模板所对应的最高孵化室等级（决定能力按等级加成的强度） */
  maxLv: number;
}

/**
 * AI 决策器接口
 */
export interface AIDecisionMaker {
  makeDecision(context: AIBattleContext): AIDecision;
}

/**
 * AI 部件权重：每个变体一个非负数权重，0 表示禁用。
 * LLM 战略顾问通过调整权重数组影响本地 AI 出虫倾向。
 */
export interface PartWeights {
  heads: Partial<Record<HeadVariant, number>>;
  thoraxes: Partial<Record<ThoraxVariant, number>>;
  abdomens: Partial<Record<AbdomenVariant, number>>;
}

/**
 * 部件权重取值范围：必须是 0~MAX 之间的整数。
 * 0 = 禁用该部件，MAX = 最强偏好。
 * 校验逻辑见 DeepSeekStrategicAdvisor.filterWeights 与 DefaultAIDecisionMaker.setWeights。
 */
export const PART_WEIGHT_RANGE = {
  MIN: 0,
  MAX: 5,
} as const;

/**
 * LLM 战略顾问的输出：长期策略 + 部件权重调整 + 嘲讽语 + 科学家评语/实验
 */
export interface StrategicDirective {
  /** AI 战略模式 */
  mode: AIMode;
  /** 部件权重（会写入 DefaultAIDecisionMaker） */
  weights: PartWeights;
  /** 战术评语，会推给 AITrashTalk UI */
  taunt?: string;
  /** 科学家客观评语（与蚁后 taunt 对照） */
  commentary?: ScientificCommentary;
  /** 科学家"实验性干预"指令 */
  experiment?: {
    kind: import('../config/experiments').ExperimentKind;
    durationMs: number;
    magnitude: number;
    side: import('../config/experiments').ExperimentSide;
    purpose: string;
  };
}

/**
 * 科学家客观评语（与蚁后 taunt 共用同一个 LLM 调用，但视角不同）
 */
export interface ScientificCommentary {
  /** ≤200 字中文，第三人称、实验记录腔 */
  text: string;
  /** 可选：玩家应关注的事件（≤80 字） */
  highlight?: string;
}

/**
 * LLM 战略顾问接口（不是决策器）：每 ~60s 调用一次，返回战略指令
 */
export interface IStrategicAdvisor {
  /**
   * 异步方法，返回当前推荐的战略指令。
   * 实现类应自行处理超时、节流、回退到默认指令。
   */
  advise(context: AIBattleContext): Promise<StrategicDirective>;
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

  /**
   * 部件权重。LLM 战略顾问通过 setWeights() 更新。
   * 默认全 0 → selectTemplate 退化为均匀随机（因为没有任何项有权重）。
   * LLM 第一次给出指令后会写入具体权重。
   */
  weights: PartWeights = {
    heads: {},
    thoraxes: {},
    abdomens: {},
  };

  /**
   * 上次执行 demolish 的游戏时间（ms）
   *
   * 全局冷却：任何 demolish 之后 10 游戏秒内，禁止再次 demolish（可以 build/upgrade/wait）。
   * 用单一时间戳代替 Map<gridPos, time>，避免按格子 key 失效导致绕开 cooldown。
   * - 暂停时 gameTime 不走，cooldown 同步冻结
   * - 3x 速下 10 游戏秒 ≈ 3.3 真实秒
   */
  private lastDemolishGameTime: number = -Infinity;

  /**
   * 拆除冷却时间（10 游戏秒）
   */
  private static readonly HATCHERY_DEMOLISH_COOLDOWN_MS = 10_000;

  /**
   * 权重匹配分差距阈值：差距 ≥ 此值才触发"拆弱建强"
   * weights 范围是 0~5，每段部件最大 5 分，三段总和最大 15 分。
   * 阈值 2 意味着要至少差出"一段部件的强偏好 vs 不存在/极低"的差距才算值得拆。
   */
  private static readonly SCORE_GAP_THRESHOLD = 2;

  /**
   * 扩张期阈值：己方孵化室 < 此值时进入"扩张期守卫"，跳过 demolish。
   *
   * 设计意图：5x5 = 25 格满员；阈值 20 = 80% 满员前都算扩张期。
   * 在扩张期内即使 scoreGap 满足拆建条件，也优先 build/upgrade/wait，
   * 避免 AI 在早期空位充足时反复拆巢浪费 tick，导致人口停滞。
   *
   * 阈值选择 20 的理由：
   * - 留出 5 个空位（20%）的迭代空间，让 25 格满员前就开始拆弱配队
   * - 但在前 20 格（80%）保证 AI 始终在扩张，不会被 demolish 打断
   * - 这是设计权衡：要"扩张优先"还是"迭代优先"的边界
   */
  private static readonly EXPANSION_PHASE_THRESHOLD = 20;

  /**
   * 替换全部权重。LLM 战略顾问每 ~60s 调一次。
   * 自动忽略超出 0~5 范围、非数字、非整数；未列出的变体视为权重 0。
   * 范围与整数限制与 DeepSeekStrategicAdvisor.filterWeights 保持一致。
   */
  setWeights(weights: PartWeights): void {
    const clean = (input: Record<string, unknown> | undefined): Record<string, number> => {
      const out: Record<string, number> = {};
      if (!input) return out;
      for (const [k, v] of Object.entries(input)) {
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        if (v < PART_WEIGHT_RANGE.MIN || v > PART_WEIGHT_RANGE.MAX) continue;
        out[k] = Math.floor(v);
      }
      return out;
    };
    this.weights = {
      heads: clean(weights.heads as Record<string, unknown>),
      thoraxes: clean(weights.thoraxes as Record<string, unknown>),
      abdomens: clean(weights.abdomens as Record<string, unknown>),
    };
  }

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
   * 模式3: 迭代替换（按权重判断）
   * - 拆除"与当前 weights 最不匹配"的孵化室（不再用硬编码战力公式）
   * - 建造"最符合 weights"的理想模板（不再用采样，改用确定性 top1）
   * - 满级场景也会主动拆建（不再死循环在 upgrade）
   * - 同一孵化室在 HATCHERY_DEMOLISH_COOLDOWN_MS 内不会被反复拆除（避免震荡）
   * - **扩张期守卫**：己方孵化室 < EXPANSION_PHASE_THRESHOLD 时跳过 demolish，
   *   强制走 build/upgrade/wait，避免早期空位充足时优先拆巢导致人口停滞
   */
  private decideIterate(context: AIBattleContext): AIDecision {
    const {
      enemyFood,
      enemyHatcheries,
      availableBuildPositions,
      upgradableHatcheries,
      availableHeads,
      availableThoraxes,
      availableAbdomens,
    } = context;

    // === 扩张期守卫 ===
    // 满员 25 格（5x5）；阈值 20 = 80% 满员前都算扩张期。
    // 这段时间内严禁 demolish —— 即使 scoreGap 够也只 build/upgrade/wait，
    // 避免 AI 在有空位时反复拆巢浪费 tick。
    const isExpansionPhase = enemyHatcheries.length < DefaultAIDecisionMaker.EXPANSION_PHASE_THRESHOLD;
    if (isExpansionPhase) {
      // 扩张期优先 build
      const targetTemplate = this.pickBestTemplateByWeights(
        availableHeads,
        availableThoraxes,
        availableAbdomens,
      );
      const targetCost = calculateHatcheryCost(targetTemplate);

      if (availableBuildPositions.length > 0 && enemyFood >= targetCost) {
        const buildTemplate = this.selectTemplate(
          availableHeads,
          availableThoraxes,
          availableAbdomens,
        );
        return {
          action: 'build',
          buildPosition: this.pickBuildPosition(availableBuildPositions),
          buildTemplate,
          reason: `[迭代][扩张期] 优先扩张，建造新孵化室(score=${this.scoreTemplateByWeights(buildTemplate)})`,
        };
      }

      // 食物不够 build → 升级现有孵化室（按 score 升序，最差的先升）
      if (upgradableHatcheries.length > 0) {
        const sorted = [...upgradableHatcheries].sort(
          (a, b) => this.scoreHatcheryByWeights(a) - this.scoreHatcheryByWeights(b),
        );
        for (const hatchery of sorted) {
          if (enemyFood >= hatchery.cost) {
            return {
              action: 'upgrade',
              targetHatcheryId: hatchery.id,
              reason: `[迭代][扩张期] 攒力量，升级现有孵化室(score=${this.scoreHatcheryByWeights(hatchery)})`,
            };
          }
        }
      }

      return { action: 'wait', reason: '[迭代][扩张期] 资源不足，攒食物等 build' };
    }

    // === 扩张期之后才进入完整迭代逻辑 ===

    // 清理过期的 demolish cooldown 条目（避免 Map 无限增长）
    // （全局时间戳方案无需清理）

    // ① 计算"最符合 weights"的理想模板（确定性 top1，便于对比 score）
    const targetTemplate = this.pickBestTemplateByWeights(
      availableHeads,
      availableThoraxes,
      availableAbdomens,
    );
    const targetCost = calculateHatcheryCost(targetTemplate);
    const targetScore = this.scoreTemplateByWeights(targetTemplate);

    // ② 计算每个己方孵化室与 weights 的匹配分，找出最不匹配
    const scored = enemyHatcheries.map((h) => ({
      hatchery: h,
      score: this.scoreHatcheryByWeights(h),
    }));
    const worst =
      scored.length > 0
        ? scored.reduce((min, curr) => (curr.score < min.score ? curr : min))
        : null;

    // ③ 满级场景也主动迭代（不再因等级已满跳过拆建）
    // 使用 gameTime 而不是 performance.now()：
    // - 暂停时 gameTime 不走，cooldown 同步冻结
    // - 3x 速下 10 游戏秒 ≈ 3.3 真实秒
    const now = context.gameTime;

    // 拆建触发条件：
    //  - 有己方孵化室（要拆的候选）
    //  - 差距 ≥ 阈值
    //  - 全局 demolish 冷却已过（10 游戏秒）
    if (worst) {
      const scoreGap = targetScore - worst.score;
      const weakest = worst.hatchery;
      const isDemolishOnCooldown =
        now - this.lastDemolishGameTime <
        DefaultAIDecisionMaker.HATCHERY_DEMOLISH_COOLDOWN_MS;

      if (scoreGap >= DefaultAIDecisionMaker.SCORE_GAP_THRESHOLD) {
        if (isDemolishOnCooldown) {
          // 冷却期内：跳过 demolish，但不动 cooldown。
          // 函数会继续往下走，可能执行 build / upgrade / wait。
          const remainingMs = DefaultAIDecisionMaker.HATCHERY_DEMOLISH_COOLDOWN_MS
            - (now - this.lastDemolishGameTime);
          console.log(
            `[AI][demolish] cooldown, ${(remainingMs / 1000).toFixed(1)}s remaining (gameTime=${now})`,
          );
        } else {
          // 写入全局 cooldown，然后执行 demolish
          this.lastDemolishGameTime = now;
          console.log(
            `[AI][demolish] gameTime=${now} scoreGap=${scoreGap} worst.score=${worst.score} targetScore=${targetScore}`,
          );
          return {
            action: 'demolish',
            targetHatcheryId: weakest.id,
            reason: `[迭代] 拆除权重不匹配巢(score=${worst.score})→目标(score=${targetScore})差${scoreGap}`,
          };
        }
      }
    }

    // ④ 有空位且食物够 → 按权重采样建造（用 selectTemplate 保持多样性）
    if (availableBuildPositions.length > 0 && enemyFood >= targetCost) {
      const buildTemplate = this.selectTemplate(
        availableHeads,
        availableThoraxes,
        availableAbdomens,
      );
      return {
        action: 'build',
        buildPosition: this.pickBuildPosition(availableBuildPositions),
        buildTemplate,
        reason: `[迭代] 有空位，建造新孵化室(score=${this.scoreTemplateByWeights(buildTemplate)})`,
      };
    }

    // ⑤ 实在没得拆也没得建 → 升级"最不匹配 weights"的孵化室
    // 旧实现：按 cost 倒序升级（纯数值堆叠，与 weights 无关）
    // 新实现：按 score 升序升级（优先升级"最该被重做但暂时没钱拆"的孵化室，
    //         升级会提升 levelMultiplier 间接影响后续迭代判断）
    if (upgradableHatcheries.length > 0) {
      const sorted = [...upgradableHatcheries].sort(
        (a, b) => this.scoreHatcheryByWeights(a) - this.scoreHatcheryByWeights(b),
      );
      for (const hatchery of sorted) {
        if (enemyFood >= hatchery.cost) {
          return {
            action: 'upgrade',
            targetHatcheryId: hatchery.id,
            reason: `[迭代] 升级低权重匹配的孵化室(score=${this.scoreHatcheryByWeights(hatchery)})`,
          };
        }
      }
    }

    return { action: 'wait', reason: '[迭代] 资源不足或无可操作孵化室' };
  }

  /**
   * 评估一个孵化室与当前 weights 的匹配度
   * = 部件权重分 - 等级惩罚
   *
   * 设计要点：
   * - 部件权重之和范围：0 ~ 15（每段 max=5，三段共 max=15）
   * - 等级惩罚：每升一级扣 0.5（lv1→0, lv2→0.5, lv3→1）
   *   用意：已升级的孵化室是"沉没成本"，部件配置不算特别差就别拆；
   *   否则满级+满员场景下，target 永远是"理想模板"(score ≈ 部件权重满分)，
   *   而 worst 永远只能是"现存最高分"，两者 scoreGap 容易 < 阈值，
   *   导致 AI 死锁在 wait、只囤食物不花。
   * - score 越低代表越不匹配 → 应优先拆除
   */
  private scoreHatcheryByWeights(h: Hatchery): number {
    const w = this.weights;
    const partScore =
      (w.heads[h.template.head] ?? 0) +
      (w.thoraxes[h.template.thorax] ?? 0) +
      (w.abdomens[h.template.abdomen] ?? 0);
    const levelPenalty = (h.level - 1) * 0.5;
    return partScore - levelPenalty;
  }

  /**
   * 评估一个模板与当前 weights 的匹配度（同上但参数是 AntTemplate）
   */
  private scoreTemplateByWeights(t: AntTemplate): number {
    const w = this.weights;
    return (
      (w.heads[t.head] ?? 0) +
      (w.thoraxes[t.thorax] ?? 0) +
      (w.abdomens[t.abdomen] ?? 0)
    );
  }

  /**
   * 按 weights 取每段部件的最高权重变体（确定性 top1）
   * 用于"应该往这个方向迭代"的判断；与 selectTemplate 的随机采样职责分离。
   *
   * - 每段独立取 weights 中权重大于 0 的最高权重变体
   * - 全部权重为 0 时退化为均匀随机（与 weightedChoice 一致）
   */
  private pickBestTemplateByWeights(
    heads: HeadVariant[],
    thoraxes: ThoraxVariant[],
    abdomens: AbdomenVariant[],
  ): AntTemplate {
    const pickTop = <T extends string>(
      candidates: T[],
      weightMap: Record<string, number>,
    ): T => {
      const withW = candidates
        .map((c) => ({ c, w: weightMap[c] ?? 0 }))
        .filter((e) => e.w > 0)
        .sort((a, b) => b.w - a.w);
      if (withW.length > 0) return withW[0].c;
      // 兜底：均匀随机
      return candidates[Math.floor(Math.random() * candidates.length)];
    };
    return {
      head: pickTop(heads, this.weights.heads as Record<string, number>),
      thorax: pickTop(thoraxes, this.weights.thoraxes as Record<string, number>),
      abdomen: pickTop(abdomens, this.weights.abdomens as Record<string, number>),
    };
  }

  /**
   * 重置 demolish cooldown（新对局立即允许拆除）
   */
  public resetDemolishCooldown(): void {
    this.lastDemolishGameTime = -Infinity;
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
   * 选择蚂蚁模板：基于 weights 加权采样
   */
  private selectTemplate(
    heads: HeadVariant[],
    thoraxes: ThoraxVariant[],
    abdomens: AbdomenVariant[],
  ): AntTemplate {
    // 1. preferredTemplate 仍然有最高优先级
    if (this.preferredTemplate) {
      return { ...this.preferredTemplate };
    }
    // 2. 否则按权重采样
    return {
      head: this.weightedChoice(heads, this.weights.heads as Record<string, number>),
      thorax: this.weightedChoice(thoraxes, this.weights.thoraxes as Record<string, number>),
      abdomen: this.weightedChoice(abdomens, this.weights.abdomens as Record<string, number>),
    };
  }

  /**
   * 加权随机选择：从 candidates 中按 weightMap 抽样
   * - weightMap 缺失或为 0 → 该项不参与
   * - 所有项权重都是 0 或 weightMap 为空 → 退化为均匀随机
   */
  private weightedChoice<T extends string>(
    candidates: T[],
    weightMap: Record<string, number>,
  ): T {
    const entries: { key: T; weight: number }[] = [];
    let total = 0;
    for (const c of candidates) {
      const w = weightMap[c];
      if (typeof w === 'number' && w > 0) {
        entries.push({ key: c, weight: w });
        total += w;
      }
    }
    if (total <= 0 || entries.length === 0) {
      // 没有有效权重 → 退化为均匀随机
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    let r = Math.random() * total;
    for (const e of entries) {
      r -= e.weight;
      if (r <= 0) return e.key;
    }
    return entries[entries.length - 1].key;
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

/**
 * 按 (head, thorax, abdomen) 三元组聚合指定阵营的存活蚂蚁，
 * 输出兵种构成列表（含数量与对应孵化室最高等级）。
 *
 * 内部辅助函数，用于 getBattleContext() 喂给战略顾问。
 * 仅聚合 state !== 'dead' 的蚂蚁；不在该阵营孵化室里的蚂蚁（理论不应发生）忽略。
 */
function computeComposition(
  ants: Ant[],
  hatcheries: Hatchery[],
  side: Side,
): AntCompositionEntry[] {
  // 孵化室 id -> 等级，用于反查蚂蚁来源孵化室
  const hatchLevel = new Map<string, number>();
  for (const h of hatcheries) {
    if (h.side === side) hatchLevel.set(h.id, h.level);
  }

  // (h|t|a) -> { count, maxLv }
  const map = new Map<string, AntCompositionEntry>();
  for (const ant of ants) {
    if (ant.side !== side || ant.state === 'dead') continue;
    const lv = hatchLevel.get(ant.hatcheryId) ?? 1;
    const h = ant.parts.head.variant as HeadVariant;
    const t = ant.parts.thorax.variant as ThoraxVariant;
    const a = ant.parts.abdomen.variant as AbdomenVariant;
    const key = `${h}|${t}|${a}`;
    const entry = map.get(key);
    if (entry) {
      entry.count += 1;
      if (lv > entry.maxLv) entry.maxLv = lv;
    } else {
      map.set(key, { h, t, a, count: 1, maxLv: lv });
    }
  }

  // 数量降序，最多返回 6 个模板（其余归并为"其他"，避免 LLM 提示过长）
  const entries = Array.from(map.values()).sort((x, y) => y.count - x.count);
  return entries.slice(0, 6);
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

  // LLM 战略顾问（可注入；每 ~60s 调一次，写入 DefaultAIDecisionMaker 的 mode + weights）
  private strategicAdvisor: IStrategicAdvisor | null = null;
  /** 上次调用战略顾问时的游戏时间（ms）。基于 gameTime 而非真实时间，暂停时不走。 */
  private lastAdvisorGameTime = 0;
  /** 顾问触发间隔（游戏时间，ms）。60 游戏秒 = 1x 速 60s，3x 速 20s 真实秒 */
  private static readonly ADVISOR_INTERVAL_MS = 60_000;

  /** 离线实验器（没配 key 或 LLM 失败时兜底；只产出 experiment，不输出 commentary/taunt） */
  private offlineExperimenter: OfflineScientist | null = null;
  /** 上次调用离线实验器时的游戏时间（ms） */
  private lastOfflineExperimentGameTime = 0;
  /** 离线实验器触发间隔（游戏时间，ms）。比 LLM 慢一拍，避免刷屏 */
  private static readonly OFFLINE_EXPERIMENT_INTERVAL_MS = 90_000;

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
  private _postGameSummarized = false;

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
   * 设置战略顾问（如 DeepSeek）。每 ~60s 调 advise()，把 mode + weights 写入默认 AI。
   * 传 null 卸载。
   */
  setStrategicAdvisor(advisor: IStrategicAdvisor | null): void {
    this.strategicAdvisor = advisor;
    // 重置计时器让新顾问能尽快首次执行
    this.lastAdvisorGameTime = 0;
  }

  /**
   * 注入/卸载离线实验器（OfflineScientist）。
   * 当 strategicAdvisor 不可用（没配 key）或失败时，引擎用 offlineExperimenter 兜底生成 experiment。
   * 传 null 卸载。
   */
  setOfflineExperimenter(maker: OfflineScientist | null): void {
    this.offlineExperimenter = maker;
    this.lastOfflineExperimentGameTime = 0;
  }

  /**
   * 外部告知引擎"顾问已经被调用过一次"，请把 lastAdvisorGameTime 推到当前游戏时间。
   * 配合 setStrategicAdvisor() 一起用，避免外部首次拉取和引擎自带首次触发撞车。
   */
  markAdvisorCalled(): void {
    try {
      this.lastAdvisorGameTime = useGameStore.getState().stats.gameTime;
    } catch {
      this.lastAdvisorGameTime = 0;
    }
  }

  /**
   * 获取当前默认 AI 决策器（用于外部更新 mode / weights）
   */
  getDefaultAIDecisionMaker(): DefaultAIDecisionMaker | null {
    if (this.aiDecisionMaker instanceof DefaultAIDecisionMaker) {
      return this.aiDecisionMaker;
    }
    return null;
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

    // 按阵营 + (h,t,a) 三元组聚合存活蚂蚁，附带孵化室等级
    const enemyComposition = computeComposition(state.ants, state.hatcheries, 'enemy');
    const playerComposition = computeComposition(state.ants, state.hatcheries, 'player');

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
      enemyComposition,
      playerComposition,
      availableBuildPositions,
      upgradableHatcheries,
      gameTime: state.stats.gameTime,
      // AI 已解锁部件
      availableHeads: state.enemyUnlockedParts.heads,
      availableThoraxes: state.enemyUnlockedParts.thoraxes,
      availableAbdomens: state.enemyUnlockedParts.abdomens,
      // 上次实验（用于 LLM 避免重复干预）
      lastExperiment: state.lastExperiment ?? undefined,
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
    if (refund > 0) {
      playSound.hatchery('demolish');
    }
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
    if (success) {
      playSound.hatchery('upgrade');
    }
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
    if (hatchery) {
      playSound.hatchery('build');
    }
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
    // 重置战略顾问计时器（新一局让顾问能尽快首次执行）
    this.lastAdvisorGameTime = 0;
    // 重置离线实验器
    this.lastOfflineExperimentGameTime = 0;
    if (this.offlineExperimenter) {
      this.offlineExperimenter.reset();
    }
    // 重置蚁后攻击冷却
    this.playerQueenAttackCooldown = 0;
    this.enemyQueenAttackCooldown = 0;
    // 重置赛后总结标记
    this._postGameSummarized = false;
    // 重置常规 AI 的模式和模板
    if (this.aiDecisionMaker instanceof DefaultAIDecisionMaker) {
      this.aiDecisionMaker.mode = 'iterate';
      this.aiDecisionMaker.preferredTemplate = null;
      // 同时清空权重（新一局从均匀随机开始，等顾问下一轮再调整）
      this.aiDecisionMaker.weights = { heads: {}, thoraxes: {}, abdomens: {} };
      // 重置 demolish cooldown（新一局允许立即拆建）
      this.aiDecisionMaker.resetDemolishCooldown();
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

    // 科学家系统：清理过期实验与酸液场地（每帧开头做一次）
    this.cleanupExperimentsAndAcidSpots();

    // 蚁后远程攻击（应用 queen_attack_speed 实验倍率）
    this.handleQueenAttack(deltaTime);

    // 生成食物
    this.handleFoodGeneration();

    // 部件解锁（每分钟双方各解锁一个）
    this.handlePartUnlocking();

    // AI 决策与执行（建造/升级/拆除）
    this.handleAIDecision();

    // 战略顾问（每 ~60s 调一次 LLM，调整 mode + weights）
    // 独立于 handleAIDecision 的 2s 节流，每帧都检查
    this.maybeAdvise();

    // 离线实验器（每 ~90s，没配 key 或 LLM 失败时兜底；只产出 experiment）
    this.maybeOfflineExperiment();

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

    // 科学家系统：酸液场地对场内蚂蚁的持续伤害
    this.handleAcidSpotDamage(deltaTime);

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

    // 播放尾针音效
    playSound.ability('stinger');

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
   * 生命值低于20%时触发，迫使范围内敌人攻击自己，回复生命，获得护甲buff
   */
  private handleTauntAbility() {
    const state = useGameStore.getState();

    for (const ant of state.ants) {
      // 跳过不符合条件的蚂蚁
      if (ant.state === 'dead' || !ant.hasTauntAbility || ant.tauntCooldown > 0) continue;

      // 触发条件：生命值低于20%
      const { tauntRadius, healPercent, armorBuffValue, armorBuffDuration, cooldown, triggerThreshold } = TAUNT_ABILITY_CONFIG;
      const hpPercent = ant.hp / ant.maxHp;
      if (hpPercent > triggerThreshold) continue;

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

      // 播放嘲讽音效
      playSound.ability('taunt');

      console.log(`[切叶蚁] ${ant.side}方蚂蚁生命低于20%触发嘲讽！吸引${enemiesInRange.length}个敌人，恢复${healAmount}HP，获得80%护甲5秒`);
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

      // 科学家实验：food_rate_boost / food_rate_reduce 注入倍率
      const playerFoodMult = this.getExperimentMagnitude('player');
      const enemyFoodMult = this.getExperimentMagnitude('enemy');

      const finalPlayer = playerFoodMult
        ? Math.max(0, Math.round(playerFoodAmount * playerFoodMult))
        : playerFoodAmount;
      const finalEnemy = enemyFoodMult
        ? Math.max(0, Math.round(enemyFoodAmount * enemyFoodMult))
        : enemyFoodAmount;

      state.addFood('player', finalPlayer);
      state.addFood('enemy', finalEnemy);
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

    // 获取 AI 决策（模式由战略层设定、权重由加权采样部件组合）
    const decision = this.aiDecisionMaker.makeDecision(context);

    // 执行决策
    this.executeAIDecision(decision);
  }

  /**
   * ~60 游戏秒节奏触发战略顾问。顾问输出的 mode + weights 写入 DefaultAI。
   * - 基于 gameTime 而非真实时间，所以暂停时不走、3x 速时约 20 真实秒一次。
   * - 不阻塞主循环；失败回退到当前 DefaultAI 的状态。
   */
  private maybeAdvise(): void {
    if (!this.strategicAdvisor) return;
    const state = useGameStore.getState();
    const gameTime = state.stats.gameTime;
    if (gameTime - this.lastAdvisorGameTime < GameEngine.ADVISOR_INTERVAL_MS) return;
    this.lastAdvisorGameTime = gameTime;

    const ctx = this.getBattleContext();
    const defaultAI = this.getDefaultAIDecisionMaker();
    if (!defaultAI) {
      // 当前 AI 决策器不是 DefaultAIDecisionMaker，战略指令无法落地
      console.warn('[StrategicAdvisor] 当前 AI 不是 DefaultAIDecisionMaker，战略指令被丢弃');
      return;
    }

    this.strategicAdvisor
      .advise(ctx)
      .then((directive) => {
        if (!directive) return;
        defaultAI.mode = directive.mode;
        defaultAI.setWeights(directive.weights);

        const storeApi = useGameStore.getState();

        // 蚁后发言
        if (directive.taunt) {
          try {
            storeApi.setAITrashTalk(directive.taunt);
          } catch {
            /* ignore */
          }
        }

        // 科学家评语
        if (directive.commentary) {
          try {
            storeApi.setScientificCommentary(
              directive.commentary.text,
              directive.commentary.highlight,
            );
          } catch {
            /* ignore */
          }
        }

        // 科学家实验（可能为 kind:'none' 即不干预）
        if (directive.experiment) {
          try {
            storeApi.applyExperiment({
              kind: directive.experiment.kind,
              durationMs: directive.experiment.durationMs,
              magnitude: directive.experiment.magnitude,
              side: directive.experiment.side,
              purpose: directive.experiment.purpose,
            });

            // acid_spot 立即在 store 里创建一片 AcidSpot
            if (directive.experiment.kind === 'acid_spot') {
              this.spawnAcidSpot(directive.experiment);
            }
          } catch {
            /* ignore */
          }
        }

        console.log(
          `[StrategicAdvisor] mode=${directive.mode} taunt="${directive.taunt || ''}" ` +
            `experiment=${directive.experiment?.kind ?? 'none'}`,
        );
      })
      .catch((err) => {
        console.warn('[StrategicAdvisor] advise 失败:', err);
      });
  }

  /**
   * 离线实验器调度：每 OFFLINE_EXPERIMENT_INTERVAL_MS 游戏秒跑一次 OfflineScientist.decide()。
   * 只在以下情况被触发：
   *   1. 没配 strategicAdvisor（reloadAdvisor 没注入）
   *   2. 或上次战略调用 fallback（即上一次 advise 没成功）
   *
   * 产出 experiment → store.applyExperiment（与 LLM 路径完全一致的落地路径）。
   * 不产出 commentary / taunt（科学家沉默）。
   */
  private maybeOfflineExperiment(): void {
    if (!this.offlineExperimenter) return;
    const state = useGameStore.getState();
    const gameTime = state.stats.gameTime;
    if (gameTime - this.lastOfflineExperimentGameTime <
        GameEngine.OFFLINE_EXPERIMENT_INTERVAL_MS) return;
    this.lastOfflineExperimentGameTime = gameTime;

    const ctx = this.getBattleContext();
    const exp = this.offlineExperimenter.decide(ctx);
    if (exp.kind === 'none') return;

    try {
      state.applyExperiment({
        kind: exp.kind,
        durationMs: exp.durationMs,
        magnitude: exp.magnitude,
        side: exp.side,
        purpose: exp.purpose,
      });
      if (exp.kind === 'acid_spot') {
        this.spawnAcidSpot(exp);
      }
      console.log(`[OfflineScientist] experiment=${exp.kind} side=${exp.side} mag=${exp.magnitude.toFixed(2)}`);
    } catch (err) {
      console.warn('[OfflineScientist] 注入失败:', err);
    }
  }

  /**
   * 在指定一侧基地前方生成一片临时酸液毒场（acid_spot 实验）。
   * - 半径 120px
   * - 影响 side 对应的蚂蚁（即己方进入会被毒）
   * - damagePerSec 与现有中毒 buff 同等级，按当前 enemyComposition 中最常见腹的 maxLv 缩放
   */
  private spawnAcidSpot(exp: {
    kind: import('../config/experiments').ExperimentKind;
    magnitude: number;
    side: import('../config/experiments').ExperimentSide;
  }): void {
    const state = useGameStore.getState();

    // 场地位置：在指定侧的"基地前方" 200px
    //   side === 'player' → 玩家蚁后右侧 200px（向敌方方向）
    //   side === 'enemy'  → 敌方蚁后左侧 200px
    //   side === 'both'   → 地图中线
    let pos = { x: 0, y: 300 };
    if (exp.side === 'player') {
      pos = { x: QUEEN_CONFIG.playerPosition.x + 200, y: 300 };
    } else if (exp.side === 'enemy') {
      pos = { x: QUEEN_CONFIG.enemyPosition.x - 200, y: 300 };
    } else {
      pos = { x: GAME_CONFIG.mapWidth / 2, y: 300 };
    }

    const damagePerSec = Math.max(20, Math.round(60 * exp.magnitude));
    const id = `acidspot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 同一类实验（acid_spot）连续触发时，保留已生效时间 —— 按游戏时间戳计算
    const gameTime = state.stats.gameTime;
    const remaining = state.activeExperiment?.kind === 'acid_spot'
      ? Math.max(0, state.activeExperiment.endsAt - gameTime)
      : 10_000;

    const spot = {
      id,
      position: pos,
      radius: 120,
      affectsSide: exp.side,
      damagePerSec,
      endsAt: gameTime + remaining,
    };

    state.addAcidSpot(spot);
  }

  // ============================================
  // 科学家实验系统 helper
  // ============================================

  /**
   * 检查指定一侧是否处于某类实验中。
   * - side: 'player' | 'enemy' —— 仅查询对应侧是否受影响（包含 'both'）
   * - kindFilter?: 不传则只看"是否还有任何实验生效"
   *
   * 注意：会自动清理已过期的 activeExperiment。
   */
  private isExperimentActive(
    side: 'player' | 'enemy',
    kindFilter?: import('../config/experiments').ExperimentKind,
  ): boolean {
    const state = useGameStore.getState();
    const exp = state.activeExperiment;
    if (!exp) return false;
    const now = state.stats.gameTime;
    if (now >= exp.endsAt) {
      // 过期自动清空（避免内存泄漏）
      state.clearActiveExperiment();
      return false;
    }
    if (kindFilter && exp.kind !== kindFilter) return false;
    return exp.side === 'both' || exp.side === side;
  }

  /** 获取当前生效实验的 magnitude（如果实验作用于 side 且未过期）；否则返回 undefined。
   *  不限定 kind —— 返回当前活动实验的 magnitude（若任何实验都在生效）。
   *  注意：现在已被模块级 helper `getExperimentMagnitudeForSide` 取代，仅 food_rate
   *  路径为兼容性保留。 */
  private getExperimentMagnitude(
    side: 'player' | 'enemy',
  ): number | undefined {
    const mult = getExperimentMagnitudeForSide(side);
    return mult === 1 ? undefined : mult;
  }

  /**
   * 每帧清理过期 AcidSpot（与 activeExperiment 同步清理）。
   * 在 gameLoop 顶部调用。
   *
   * endsAt 现在是游戏时间戳（gameTime），暂停时自动冻结。
   */
  private cleanupExperimentsAndAcidSpots(): void {
    const state = useGameStore.getState();
    const now = state.stats.gameTime;
    if (state.activeExperiment && now >= state.activeExperiment.endsAt) {
      state.clearActiveExperiment();
    }
    if (state.acidSpots.length > 0) {
      const alive = state.acidSpots.filter((s) => s.endsAt > now);
      if (alive.length !== state.acidSpots.length) {
        // 差异更新（保留性能，避免全量 set）
        const removed = state.acidSpots.filter((s) => s.endsAt <= now);
        for (const r of removed) state.removeAcidSpot(r.id);
      }
    }
  }

  /**
   * 蚁后远程攻击：应用科学家实验 `queen_attack_speed`。
   * - magnitude ∈ [1.3, 1.8]，是攻速倍率（>1 = 冷却更短 = 攻击更频）
   * - 开火后冷却 = `QUEEN_ATTACK_CONFIG.attackInterval / magnitude`
   * - side ∈ {'player','enemy','both'}：'both' 时两侧蚁后同时获得加成
   * - deltaTime 来自主循环，已应用 gameSpeed 缩放（暂停时为 0 → 自动冻结）
   */
  private handleQueenAttack(deltaTime: number): void {
    const state = useGameStore.getState();
    const deltaMs = deltaTime * 1000;
    const baseInterval = QUEEN_ATTACK_CONFIG.attackInterval;

    this.playerQueenAttackCooldown = Math.max(0, this.playerQueenAttackCooldown - deltaMs);
    this.enemyQueenAttackCooldown = Math.max(0, this.enemyQueenAttackCooldown - deltaMs);

    // 取该侧的实验倍率；无实验 = 1.0（即使用基础间隔）
    const playerMult = getExperimentMagnitudeForSide('player', 'queen_attack_speed');
    const enemyMult = getExperimentMagnitudeForSide('enemy', 'queen_attack_speed');

    const aliveAnts = state.ants.filter(a => a.state !== 'dead' && !a.isBeingExecuted);

    // 玩家蚁后
    if (this.playerQueenAttackCooldown <= 0 && state.playerQueen.hp > 0) {
      const target = this.findNearestQueenTarget('player', aliveAnts);
      if (target) {
        this.fireQueenProjectile('player', QUEEN_CONFIG.playerPosition, target);
        // 实验倍率越大 → 冷却越短
        this.playerQueenAttackCooldown = Math.max(
          80,
          Math.round(baseInterval / (playerMult > 1 ? playerMult : 1)),
        );
        try { GameEvents.emitQueenAttack('player', target.id, QUEEN_ATTACK_CONFIG.damage); } catch { /* ignore */ }
      }
    }

    // 敌方蚁后
    if (this.enemyQueenAttackCooldown <= 0 && state.enemyQueen.hp > 0) {
      const target = this.findNearestQueenTarget('enemy', aliveAnts);
      if (target) {
        this.fireQueenProjectile('enemy', QUEEN_CONFIG.enemyPosition, target);
        this.enemyQueenAttackCooldown = Math.max(
          80,
          Math.round(baseInterval / (enemyMult > 1 ? enemyMult : 1)),
        );
        try { GameEvents.emitQueenAttack('enemy', target.id, QUEEN_ATTACK_CONFIG.damage); } catch { /* ignore */ }
      }
    }
  }

  /** 蚁后索敌：在 attackRange 内找最近的敌方蚂蚁 */
  private findNearestQueenTarget(side: 'player' | 'enemy', aliveAnts: Ant[]): Ant | null {
    const queenPos = side === 'player' ? QUEEN_CONFIG.playerPosition : QUEEN_CONFIG.enemyPosition;
    const { range } = QUEEN_ATTACK_CONFIG;
    let nearest: Ant | null = null;
    let nearestDist = Infinity;
    for (const ant of aliveAnts) {
      if (ant.side === side) continue;
      const dx = ant.position.x - queenPos.x;
      const dy = ant.position.y - queenPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= range && dist < nearestDist) {
        nearestDist = dist;
        nearest = ant;
      }
    }
    return nearest;
  }

  /** 蚁后发射子弹 */
  private fireQueenProjectile(side: 'player' | 'enemy', queenPos: { x: number; y: number }, target: Ant): void {
    const state = useGameStore.getState();
    const dx = target.position.x - queenPos.x;
    const dy = target.position.y - queenPos.y;
    const angle = Math.atan2(dy, dx);
    state.addProjectile({
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
    });
  }

  /**
   * 处理 AcidSpot 对蚂蚁的伤害：每帧检查蚂蚁是否在 spot 半径内，
   * 是则对 spot.affectsSide 影响的蚂蚁施加中毒 tick。
   */
  private handleAcidSpotDamage(deltaTime: number): void {
    const state = useGameStore.getState();
    if (state.acidSpots.length === 0) return;

    const now = performance.now();
    const antUpdates: { id: string; changes: Partial<Ant> }[] = [];

    for (const spot of state.acidSpots) {
      if (now >= spot.endsAt) continue;
      const tickDamage = spot.damagePerSec * deltaTime;
      for (const ant of state.ants) {
        if (ant.state === 'dead') continue;
        // 只影响 spot.affectsSide 对应阵营的蚂蚁
        if (spot.affectsSide !== 'both' && ant.side !== spot.affectsSide) continue;
        const dx = ant.position.x - spot.position.x;
        const dy = ant.position.y - spot.position.y;
        if (dx * dx + dy * dy <= spot.radius * spot.radius) {
          const newHp = Math.max(0, ant.hp - tickDamage);
          if (newHp !== ant.hp) {
            antUpdates.push({
              id: ant.id,
              changes: {
                hp: newHp,
                state: newHp <= 0 ? 'dead' : ant.state,
              },
            });
          }
        }
      }
    }

    if (antUpdates.length > 0) {
      state.updateAnts(antUpdates);
    }
  }

  /**
   * 执行 AI 决策
   */
  private executeAIDecision(decision: AIDecision) {
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
   *
   * 应用科学家实验 `spawn_rate_boost` / `spawn_rate_reduce`：
   * - magnitude > 1 → 间隔变长（孵化抑制）
   * - magnitude < 1 → 间隔变短（孵化加速）
   * - magnitude 是直接乘数，与 food_rate_* 保持一致语义
   */
  private getCurrentSpawnInterval(side?: 'player' | 'enemy'): number {
    const state = useGameStore.getState();
    const minutesElapsed = Math.floor(state.stats.gameTime / 60000);
    const baseInterval = state.config.spawnInterval + minutesElapsed * 1000;
    if (!side) return baseInterval;
    const mult = getExperimentMagnitudeForSide(side, 'spawn_rate_boost', 'spawn_rate_reduce');
    return Math.max(500, baseInterval * mult); // 下限 500ms 防止除零/超快
  }

  private handleHatcherySpawning(deltaTime: number) {
    const state = useGameStore.getState();
    const { maxAntsPerHatchery } = state.config;

    // 更新孵化室冷却
    state.updateHatcheryCooldowns(deltaTime * 1000);

    // 检查每个孵化室是否可以生产
    const updatedState = useGameStore.getState();
    for (const hatchery of updatedState.hatcheries) {
      if (hatchery.spawnCooldown <= 0) {
        // 检查该孵化室的存活蚂蚁数量
        const aliveAntsFromHatchery = updatedState.ants.filter(
          ant => ant.hatcheryId === hatchery.id && ant.state !== 'dead'
        ).length;

        // 火蚁头允许同孵化室多容纳一只（最多2只）
        const hatcheryMax = hatchery.template.head === 'fire' ? 2 : maxAntsPerHatchery;

        // 如果存活蚂蚁数量已达上限，跳过生产（但不重置冷却时间）
        if (aliveAntsFromHatchery >= hatcheryMax) {
          continue;
        }

        // 生产蚂蚁
        updatedState.spawnAntFromHatchery(hatchery);
        // 播放孵化音效
        playSound.spawn(hatchery.side);

        // 重置冷却时间（按 side 应用 spawn_rate 实验倍率）
        const currentSpawnInterval = this.getCurrentSpawnInterval(hatchery.side);
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

      // 应用 visibility_fog 实验：magnitude ∈ [0.4, 0.7] 是直接倍率，索敌范围缩短
      // 仅影响该蚂蚁所属侧的索敌判定（'both' 时两侧都生效）
      const fogMult = getExperimentMagnitudeForSide(ant.side, 'visibility_fog');
      const effectiveDetectionRange = fogMult !== 1 ? detectionRange * fogMult : detectionRange;

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
      else if (nearestDistance <= Math.max(effectiveDetectionRange, effectiveAttackRange)) {
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
          // 播放秒杀音效
          playSound.ability('execution');

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
        // 播放蚁后受伤音效
        playSound.queen('damage');
        toRemove.push(ant.id);
      }

      // 敌方蚂蚁到达玩家蚁后
      if (ant.side === 'enemy' && ant.position.x <= QUEEN_CONFIG.playerPosition.x + 30) {
        state.damageQueen('player', queenDamage);
        // 播放蚁后受伤音效
        playSound.queen('damage');
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
        // 播放蜜罐爆炸音效
        playSound.ability('honeypot');
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
      // 播放死亡音效
      playSound.death(ant.side);
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

      // 播放逃脱音效
      playSound.ability('escape');

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
        // 计算护甲减伤后的实际伤害（先百分比减伤，再固定值减伤）
        const armorMultiplier = this.getArmorMultiplier(hitTarget);
        const percentDamage = Math.floor(projectile.damage * armorMultiplier);
        const actualDamage = Math.max(1, percentDamage - hitTarget.flatArmor);
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
