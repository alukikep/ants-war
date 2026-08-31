/**
 * 离线（无 LLM）实验器
 *
 * 用途：玩家没配 API key 时，引擎仍按节奏产出"实验性干预"，
 * 让科学家始终保持"在暗中观察"的氛围。但因为没有 LLM，
 * 不输出 commentary / taunt（科学家沉默），UI 顶部只显示
 * 实验横幅，并附带"未配置 LLM"的提示让玩家知道可以激活。
 *
 * 设计原则：
 * - 概率表 + 加权抽样（不均权）——根据 player 特征选择倾向
 * - 与上次实验间隔 ≥ 90s（比 LLM 的 60s 稍宽，避免刷屏）
 * - side 强制轮换（player → enemy → player）
 * - 数值取区间中点附近随机
 * - 绝不影响 mode / weights（仍然交给本地 DefaultAIDecisionMaker 决定）
 */

import { EXPERIMENT_SPECS, defaultExperiment, type ExperimentKind, type ExperimentSide } from '../config/experiments';
import type { AIBattleContext } from '../game/GameEngine';

interface ExperimentDirective {
  kind: ExperimentKind;
  durationMs: number;
  magnitude: number;
  side: ExperimentSide;
  purpose: string;
}

interface KindWeight {
  kind: ExperimentKind;
  w: number;
}

// 疯狂的 purpose 候选池（按 kind 分组）
const PURPOSES: Record<ExperimentKind, string[]> = {
  food_rate_boost: [
    '看看这群小家伙资源充足时的扩张反应',
    '（疯狂记笔记）加速食物产出 —— 纯粹为了观察蚁群经济行为',
    '蚁后甲最近吃得有点少，给她加餐',
    '食物注入实验 —— 我赌这会让蚁群扩张速度翻倍',
  ],
  food_rate_reduce: [
    '制造饥荒 —— 看蚁群在资源压力下如何行为',
    '食物短缺实验，观察蚁群的资源管理能力',
    '（邪恶地微笑）让某方尝尝饥饿的滋味',
    '测试蚁群在低资源状态下的应激反应',
  ],
  acid_spot: [
    '看看这群小家伙对酸性环境的反应',
    '在战场上铺一片酸液 —— 纯粹为了观察化学刺激下的行为',
    '（邪恶地微笑）酸液场地实验 —— 蚂蚁们会绕路吗？',
    '注入酸性干扰 —— 这是我最喜欢的一类实验',
  ],
  spawn_rate_boost: [
    '加速孵化 —— 看蚁群产能爆发后的战术变化',
    '（疯狂记笔记）让孵化室进入超频模式',
    '测试蚁群在高速孵化下的编制策略',
  ],
  spawn_rate_reduce: [
    '抑制孵化 —— 看蚁群产能受限时的经济博弈',
    '给孵化室降温 —— 纯粹为了观察慢节奏下的决策',
    '（邪恶地微笑）让某方的"婴儿工厂"暂时停工',
  ],
  queen_attack_speed: [
    '让蚁后进入亢奋状态 —— 看看高速攻击对战场的影响',
    '（推眼镜）蚁后亢奋实验 —— 我赌这会显著改变战场节奏',
    '给某位蚁后打一针肾上腺素',
    '测试蚁后亢奋时的反击效率',
  ],
  visibility_fog: [
    '信号干扰实验 —— 看蚁群在低索敌下的应变',
    '让战场蒙上迷雾 —— 纯粹为了观察信息不对称下的决策',
    '（邪恶地微笑）让某方的蚂蚁变成"近视眼"',
  ],
  none: ['本周期不干预 —— 继续观察'],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class OfflineScientist {
  private lastKind: ExperimentKind | null = null;
  private lastSide: 'player' | 'enemy' | 'both' | null = null;
  private lastGameTime = -Infinity;
  /** 连续同一 side 计数器（≥3 时强制切换） */
  private sameSideStreak = 0;
  /** 历史 side 队列（最近 4 次） */
  private sideHistory: ('player' | 'enemy' | 'both')[] = [];

  /**
   * 返回一个 experiment 指令（kind:'none' 即本周期不行动）。
   * 由引擎在 strategicAdvisor 不可用 / 失败时调用。
   */
  decide(ctx: AIBattleContext): ExperimentDirective {
    // 与上次实验间隔 < 90s → 沉默
    if (ctx.gameTime - this.lastGameTime < 90_000) {
      return { ...defaultExperiment(), purpose: '实验冷却中（离线模式）' };
    }
    // phase < 90s（开局静默期）→ 沉默
    if (ctx.gameTime < 90_000) {
      return { ...defaultExperiment(), purpose: '本地启发式实验器：开局静默观察' };
    }

    // === 公平性硬约束 ===
    const playerQueenPct = ctx.playerQueenMaxHp > 0
      ? Math.round((ctx.playerQueenHp / ctx.playerQueenMaxHp) * 100)
      : 0;
    const enemyQueenPct = ctx.enemyQueenMaxHp > 0
      ? Math.round((ctx.enemyQueenHp / ctx.enemyQueenMaxHp) * 100)
      : 0;
    const playerInDanger = playerQueenPct < 25;
    const playerDominating = playerQueenPct - enemyQueenPct > 30;

    // === 加权候选池 ===
    const weights: KindWeight[] = [];

    const playerHasRanged = ctx.playerComposition.some((t) => t.a === 'spitter');
    if (playerHasRanged && !playerInDanger) {
      // 公平版本：50% 给玩家铺酸液，50% 给敌方 food_reduce 平衡
      if (Math.random() < 0.5) {
        weights.push({ kind: 'acid_spot', w: 0.4 });
      } else {
        weights.push({ kind: 'food_rate_reduce', w: 0.4 });
      }
    }

    const playerHasHeavy = ctx.playerComposition.some(
      (t) => t.h === 'soldier' || t.t === 'carpenter',
    );
    if (playerHasHeavy && !playerInDanger) {
      // visibility_fog 是 both 性质，天然公平
      weights.push({ kind: 'visibility_fog', w: 0.25 });
    }

    if (ctx.playerAntsCount >= 3 && ctx.enemyAntsCount >= 3) {
      weights.push({ kind: 'queen_attack_speed', w: 0.25 });
    }

    if (Math.random() < 0.5) {
      weights.push({ kind: 'food_rate_boost', w: 0.2 });
    } else {
      weights.push({ kind: 'spawn_rate_boost', w: 0.2 });
    }

    if (weights.length === 0) {
      return { ...defaultExperiment(), purpose: 'Dr.融合：当前无适合实验' };
    }

    // 加权抽样
    const total = weights.reduce((s, e) => s + e.w, 0);
    let r = Math.random() * total;
    let pick: ExperimentKind = weights[0].kind;
    for (const e of weights) {
      r -= e.w;
      if (r <= 0) {
        pick = e.kind;
        break;
      }
    }

    // === 公平 side 选择（硬约束）===
    let side: 'player' | 'enemy' | 'both' = 'both';

    if (pick === 'visibility_fog') {
      side = 'both';
    } else {
      if (this.sameSideStreak >= 3 && this.lastSide && this.lastSide !== 'both') {
        // 强制切换
        side = this.lastSide === 'player' ? 'enemy' : 'player';
        this.sameSideStreak = 1;
      } else {
        side = Math.random() < 0.5 ? 'player' : 'enemy';
        if (this.lastSide === side) {
          this.sameSideStreak += 1;
        } else {
          this.sameSideStreak = 1;
        }
      }

      // 玩家血低 → 禁止 player side 接受负面实验
      if (playerInDanger && side === 'player') {
        const isPositive = pick === 'food_rate_boost' || pick === 'spawn_rate_boost' || pick === 'queen_attack_speed';
        if (!isPositive) {
          side = 'enemy';
        }
      }
      // 玩家优势巨大 → 优先把负面实验给玩家（公平），但 magnitude 温和
      if (playerDominating && side === 'player') {
        const isNegative = pick === 'food_rate_reduce' || pick === 'spawn_rate_reduce' || pick === 'acid_spot';
        if (!isNegative) {
          side = 'enemy';
        }
      }
    }

    // === 数值：玩家优势时 magnitude 压低 ===
    const spec = EXPERIMENT_SPECS[pick];
    let magMin = spec.magnitudeRange[0];
    let magMax = spec.magnitudeRange[1];
    if (playerDominating && side === 'player') {
      // 玩家优势时给玩家负面 → 用范围下三分之一（温和）
      const range = magMax - magMin;
      magMax = magMin + range / 3;
    }

    const durationMs = Math.round(
      spec.durationRange[0] +
        Math.random() * (spec.durationRange[1] - spec.durationRange[0]),
    );
    const magnitude = magMin + Math.random() * (magMax - magMin);

    // === purpose 随机抽取（疯狂科学家口吻）===
    const purposePool = PURPOSES[pick] || ['本周期不干预'];
    const purpose = pickRandom(purposePool);

    // 记录
    this.lastKind = pick;
    this.lastSide = side;
    this.lastGameTime = ctx.gameTime;
    this.sideHistory.push(side);
    if (this.sideHistory.length > 4) this.sideHistory.shift();

    return {
      kind: pick,
      durationMs,
      magnitude,
      side,
      purpose,
    };
  }

  /** 重置（每局开始时调用，避免跨局污染） */
  reset(): void {
    this.lastKind = null;
    this.lastSide = null;
    this.lastGameTime = -Infinity;
    this.sameSideStreak = 0;
    this.sideHistory = [];
  }
}