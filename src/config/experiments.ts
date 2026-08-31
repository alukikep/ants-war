/**
 * 科学家"实验性干预"白名单
 *
 * 设计原则：
 * - kind 必须严格枚举，防止 LLM 编造
 * - durationMs / magnitude 都有上下限，超出范围在 validateDirective 里强制夹紧
 * - side 表示影响哪一方；'both' 表示全场
 * - 数值参考意义而非硬约束：engine 实际 clamp 到 [min, max]
 *
 * UI 颜色 tone：
 *   info   — 中性增益（食物注入、孵化加速）
 *   warn   — 中性干扰（孵化抑制、信号干扰、食物短缺）
 *   danger — 危险场（酸液场地、蚁后亢奋）
 *
 * 注意：科学家可以介入双方，但保持公平（engine 用 lastExperimentSide 轮换）
 */

export type ExperimentKind =
  | 'food_rate_boost'      // 食物产出倍率提升
  | 'food_rate_reduce'     // 食物产出倍率降低
  | 'acid_spot'            // 在指定一侧的基地前方制造一片临时酸液毒场
  | 'spawn_rate_boost'     // 孵化室冷却时间缩短
  | 'spawn_rate_reduce'    // 孵化室冷却时间延长
  | 'queen_attack_speed'   // 指定蚁后攻击频率提升
  | 'visibility_fog'       // 双方索敌范围临时缩小
  | 'none';                // 明确选择不干预（仅观察）

export type ExperimentSide = 'player' | 'enemy' | 'both';

export type ExperimentTone = 'info' | 'warn' | 'danger';

export interface ExperimentSpec {
  kind: ExperimentKind;
  labelCN: string;
  icon: string;
  tone: ExperimentTone;
  /** 持续时间范围 (ms) — validateDirective 强制夹紧 */
  durationRange: readonly [number, number];
  /** 强度范围 — validateDirective 强制夹紧（语义随 kind 而变，详见 description） */
  magnitudeRange: readonly [number, number];
  /** 描述，给 LLM / UI 面板用 */
  description: string;
}

/**
 * 严格白名单。所有 validate 流程只接受这里的 kind。
 */
export const EXPERIMENT_SPECS: Record<ExperimentKind, ExperimentSpec> = {
  food_rate_boost: {
    kind: 'food_rate_boost',
    labelCN: '食物注入',
    icon: '🍯',
    tone: 'info',
    durationRange: [10_000, 25_000],
    magnitudeRange: [1.3, 1.8],   // 倍率：1.3 = +30%
    description: '指定一侧食物产出倍率提升（观察蚁群扩张反应）',
  },
  food_rate_reduce: {
    kind: 'food_rate_reduce',
    labelCN: '食物短缺',
    icon: '🥀',
    tone: 'warn',
    durationRange: [10_000, 20_000],
    magnitudeRange: [0.5, 0.8],   // 倍率：0.5 = -50%
    description: '指定一侧食物产出倍率降低（观察蚁群资源压力下的行为变化）',
  },
  acid_spot: {
    kind: 'acid_spot',
    labelCN: '酸液场地',
    icon: '🧪',
    tone: 'danger',
    durationRange: [8_000, 15_000],
    magnitudeRange: [0.3, 0.7],   // 单次伤害倍率（与现有中毒伤害同等级，按孵化室等级缩放）
    description: '在指定一侧的基地前方制造一片临时酸液毒场',
  },
  spawn_rate_boost: {
    kind: 'spawn_rate_boost',
    labelCN: '孵化加速',
    icon: '🥚',
    tone: 'info',
    durationRange: [10_000, 20_000],
    magnitudeRange: [1.5, 2.0],   // 倍率：孵化冷却 / magnitude
    description: '指定一侧孵化室冷却时间缩短',
  },
  spawn_rate_reduce: {
    kind: 'spawn_rate_reduce',
    labelCN: '孵化抑制',
    icon: '🧊',
    tone: 'warn',
    durationRange: [10_000, 20_000],
    magnitudeRange: [0.5, 0.7],   // 倍率：孵化冷却 * magnitude
    description: '指定一侧孵化室冷却时间延长',
  },
  queen_attack_speed: {
    kind: 'queen_attack_speed',
    labelCN: '蚁后亢奋',
    icon: '👑',
    tone: 'danger',
    durationRange: [8_000, 15_000],
    magnitudeRange: [1.3, 1.8],   // 倍率：攻击冷却 / magnitude
    description: '指定蚁后攻击频率提升（更激进的远程反击）',
  },
  visibility_fog: {
    kind: 'visibility_fog',
    labelCN: '信号干扰',
    icon: '🌫️',
    tone: 'warn',
    durationRange: [5_000, 12_000],
    magnitudeRange: [0.4, 0.7],   // 倍率：索敌范围 * magnitude
    description: '双方索敌范围临时缩小（蚂蚁更难发现敌人）',
  },
  none: {
    kind: 'none',
    labelCN: '观察',
    icon: '🔬',
    tone: 'info',
    durationRange: [0, 0],
    magnitudeRange: [1, 1],
    description: '本周期不干预，仅观察记录',
  },
};

/**
 * 全部 kind 的合法列表（用于 validate 时判断）
 */
export const VALID_EXPERIMENT_KINDS: readonly ExperimentKind[] = Object.keys(
  EXPERIMENT_SPECS,
) as ExperimentKind[];

/**
 * 默认实验：仅观察，不干预
 */
export function defaultExperiment(): {
  kind: ExperimentKind;
  durationMs: number;
  magnitude: number;
  side: ExperimentSide;
  purpose: string;
} {
  return {
    kind: 'none',
    durationMs: 0,
    magnitude: 1,
    side: 'both',
    purpose: '本周期仅观察，无干预',
  };
}