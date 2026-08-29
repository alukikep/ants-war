/**
 * DeepSeek 战略顾问
 *
 * 每 ~60s 调用一次 DeepSeek，把当前战场态势作为 prompt 喂入，
 * 让模型输出"战略指令"：mode + 部件权重 + taunt。
 * 实际建造/升级/拆除动作由本地 DefaultAIDecisionMaker 完成。
 *
 * 关键设计：
 * - advise() 返回 StrategicDirective；引擎把它写入 DefaultAI。
 * - 不实现 AIDecisionMaker 接口（不参与高频决策）。
 * - 失败/解析失败一律回退默认指令（mode='iterate'，均匀权重），绝不抛错。
 * - 不缓存对话历史：每次都基于完整 context。
 */

import type {
  HeadVariant,
  ThoraxVariant,
  AbdomenVariant,
} from '../types';
import type {
  AIBattleContext,
  IStrategicAdvisor,
  PartWeights,
  StrategicDirective,
  AIMode,
} from '../game/GameEngine';
import { PART_WEIGHT_RANGE } from '../game/GameEngine';
import {
  HEAD_CONFIGS,
  THORAX_CONFIGS,
  ABDOMEN_CONFIGS,
} from '../config/partStats';

export interface DeepSeekStrategicAdvisorOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  /** 单次请求超时，默认 8000ms（战略决策可以稍等） */
  timeoutMs?: number;
  /** 失败/超时后等待多久再试，默认 30s */
  cooldownMs?: number;
}

const VALID_MODES: AIMode[] = ['upgrade_focus', 'build_focus', 'iterate'];

/**
 * 描述部件（prompt 用）—— 紧凑单行格式：
 *   <槽>:<variant>(<中文名>) 价<cost> <stat1> ... <能力标签...>
 *
 * 槽位前缀：H=头, T=胸, A=腹
 *
 * 能力标签约定（用于快速让 LLM 识别机制）：
 *   远攻+N          远程伤害加成（木蚁腹）
 *   血-N%           远程生命惩罚
 *   甲+N            固定护甲（carpenter 胸）
 *   crit1:X/2:Y/3:Z 暴击按等级
 *   逃:回血% <40%血  大齿猛蚁逃脱
 *   光环:加攻速 至300% 衰减20%/s   白蚁大兵头
 *   秒:X/Y/Z        大头蚁秒杀几率按等级
 *   嘲:<20%血 +30%hp +80%甲5s     切叶蚁胸嘲讽
 *   肾:首次受敌 +攻/甲            子弹蚁胸肾上腺素
 *   死爆:+50hp回血 半径80         蜜罐蚁腹
 *   毒针:减攻速50%+毒40/60/100    马塔贝勒蚁腹（CD 5s）
 *   慢2:20%/3:40%                木蚁腹减速按等级
 *
 * 例：
 *   H:leafcutter(切叶蚁头) 价80 攻+20 crit1:5/2:10/3:15
 *   A:honeypot(蜜罐蚁腹) 价70 血+40 速-15 死爆:+50hp回血 半径80
 */
function describePart(
  variant: HeadVariant | ThoraxVariant | AbdomenVariant,
  config: typeof HEAD_CONFIGS[keyof typeof HEAD_CONFIGS],
): string {
  const s = config.stats;
  const type = config.type;
  const slotPrefix = type === 'head' ? 'H' : type === 'thorax' ? 'T' : 'A';

  const stats: string[] = [];
  if (s.damage) stats.push(`攻${signed(s.damage)}`);
  if (s.hp) stats.push(`血${signed(s.hp)}`);
  if (s.speed) stats.push(`速${signed(s.speed)}`);
  if (s.attackSpeed) stats.push(`攻速${signed(s.attackSpeed)}%`);

  const tags: string[] = [];

  // ---- 头部能力 ----
  if (type === 'head') {
    if (variant === 'leafcutter') tags.push('crit1:5/2:10/3:15');
    if (variant === 'fire') tags.push('双生:同格+1只');
    if (variant === 'odontomachus') tags.push('逃:回血50% <40%血 10s cd');
    if (variant === 'termiteSoldier') tags.push('光环:加攻速 至300% 衰减20%/s');
    if (variant === 'bigHead') tags.push('秒:3/5/8');
    if (variant === 'soldier') tags.push('重装:高攻慢速');
  }

  // ---- 胸部能力 ----
  if (type === 'thorax') {
    if (variant === 'carpenter' && s.flatArmor) tags.push(`甲+${s.flatArmor}`);
    if (variant === 'leafcutter') tags.push('嘲:<20%血 +30%hp +80%甲5s 15s cd');
    if (variant === 'bullet') tags.push('肾:首次受敌 +攻/甲 5/8/12s 60s cd');
  }

  // ---- 腹部能力 ----
  if (type === 'abdomen') {
    if (variant === 'spitter') {
      tags.push('远攻+25');
      tags.push('血-30%');
      tags.push('慢2:20/3:40');
    }
    if (variant === 'honeypot') tags.push('死爆:+50hp回血 半径80');
    if (variant === 'matabele') tags.push('毒针5s cd:减攻速50%+毒40/60/100');
    if (variant === 'weaver') tags.push('均衡:血/速/攻速');
    if (variant === 'trap') tags.push('爆发:攻+攻速');
  }

  const statStr = stats.length ? stats.join(' ') : '无加成';
  const tagStr = tags.length ? ' ' + tags.join(' ') : '';
  return `${slotPrefix}:${variant}(${config.nameCN}) 价${config.cost} ${statStr}${tagStr}`;
}

/** 数字带符号（+12 / -5） */
function signed(n: number): string {
  return `${n > 0 ? '+' : ''}${n}`;
}

/** 构造 system prompt：部件数值 + 输出 schema */
function buildSystemPrompt(
  availableHeads: HeadVariant[],
  availableThoraxes: ThoraxVariant[],
  availableAbdomens: AbdomenVariant[],
): string {
  const headList = availableHeads.map((v) => describePart(v, HEAD_CONFIGS[v])).join('\n');
  const thoraxList = availableThoraxes.map((v) => describePart(v, THORAX_CONFIGS[v])).join('\n');
  const abdomenList = availableAbdomens.map((v) => describePart(v, ABDOMEN_CONFIGS[v])).join('\n');

  return `你是融合蚁大战的敌方 AI 战略顾问（只负责战略，不下指令）。

【背景】拔河策略游戏：你代表敌方（红方）。每 ~60s 你收到一次战场态势 JSON（含敌我双方的兵种构成），请根据当前局势，**调整 AI 的战略模式和部件权重**，让本地 AI 接下来一分钟打出更好的蚂蚁组合，并反制玩家战术。

【你的输出】严格 JSON：
{
  "mode": "upgrade_focus" | "build_focus" | "iterate",
  "weights": {
    "heads":    { "basic": 0, "leafcutter": 3, ... },
    "thoraxes": { "basic": 1, "army": 5, ... },
    "abdomens": { "basic": 0, "honeypot": 2, ... }
  },
  "taunt": "一句话战术评语（中文），会显示给玩家"
}

【mode 含义与硬约束】
- build_focus:   扩张优先，AI 会优先多造孵化室。**前置条件：isFull=false 且 canAffordNew=true**。否则 AI 选 build 但 60s 内都只能 wait，浪费一次战略。
- upgrade_focus: 升级优先，AI 会优先升级现有孵化室。**前置条件：upgradableHatcheryCount>0**。否则 AI 持续 wait。
- iterate:       迭代模式，AI 会拆弱建强。**任何时候都可用**；快满位时拆弱建强，否则优先升级。

【mode 决策树（按顺序匹配，第一个命中即采纳）】
M1. primaryConstraint == 'NO_BUILD_SLOT' (即 isFull=true)
    → 严禁 build_focus。在 upgrade_focus / iterate 中选：
      · enemyHatcheriesByLevel.lv1 > 0 → upgrade_focus（升级低等级房）
      · 否则 → iterate
M2. primaryConstraint == 'NO_FOOD_FOR_NEW' (即 canAffordNew=false)
    → 严禁 build_focus → upgrade_focus（如有可升级）或 iterate
M3. primaryConstraint == 'HATCHERY_LAG' (hatcheryDiff < -2，即我方比玩家少 3+ 房)
    → build_focus（追平数量差距）
M4. primaryConstraint == 'HATCHERY_LEAD' (hatcheryDiff > 3，即我方比玩家多 4+ 房)
    → upgrade_focus（升质量，不需再扩张）
M5. 己方蚁后 pct < 25（己方危险）→ upgrade_focus（升质量增援）
M6. playerHatcheriesByLevel.lv3 >= 2 且 我方 lv1 多 → iterate（拆 1 级房，追高级房）
M7. 其他（primaryConstraint=='BALANCED'）→ iterate（综合最稳）

【数量优劣的判断依据】**只比较 hatcheryDiff（已建造孵化室数差）**，不要被蚂蚁数迷惑：
- 蚂蚁数只反映"当前兵力"；孵化室数代表"未来的产出能力"
- 一方孵化室多 2-3 个，60s 后兵力差距会迅速拉大
- 所以"我方数量劣势"指 hatcheryDiff < -2，不是 enemyAntsCount < playerAntsCount

【weights 含义】
- 每类部件（head/thorax/abdomen）一个权重对象，key 是变体字符串
- 数值必须是 0~5 的整数（0=禁用，1=中性/默认，5=最强偏好）
- 超出范围（如 6/10/100）或非整数（如 2.7）→ 系统会丢弃或截断并打 warn
- 所有权重都是 1 → 均匀随机；想突出某部件就给大权重（最大 5）
- 想禁用某部件：写 0 或不写该 key
- 反制部件的权重 ≥ 玩家主力战术部件的权重
- 示例：想反制玩家大量远程（A:spitter），把堆速部件拉满：
  { "weights": {
      "heads":    { "basic": 0 },
      "thoraxes": { "basic": 0, "army": 5, "bullet": 4 },
      "abdomens": { "basic": 1 }
  }}

【weights 会驱动本地 AI 主动拆建】这是核心机制（务必理解）：
- 本地 AI 在 iterate 模式下，会按 weights 评估每个己方孵化室的"匹配分"（h+t+a 三段权重之和，0~15）
- 当 weights 改变（例如反制玩家新战术），本地 AI 会在下一次决策时：
  1. 找出"匹配分最低"的孵化室（最不匹配当前 weights）
  2. 与"理想模板"（每段取 weights 最高的变体）的匹配分对比
  3. 差距 ≥ 2 分时主动 demolish（无论是否满级、是否有食物），然后 build 新的
  4. 同一孵化室 60s 内不会被反复拆（cooldown 保护）
- 所以你每 60s 重设 weights 后，AI 会自然迭代到新配队——不用选 build_focus
- **不要在玩家已成型（playerTemplates maxLv 高）时还选 build_focus**——那只会让 AI 浪费节拍
  正确做法：把 weights 大幅调整，AI 会主动拆旧巢换新巢；模式保持 iterate

【部件描述格式】每行 = <槽>:<variant>(<名>) 价<c> <stat...> [<能力标签>...]
- 槽：H=头 T=胸 A=腹
- stat：攻/血/速/攻速（带正负号），如 攻+20 速-15
- 能力标签（看到就能识别机制）：
  甲+N=固定护甲  远攻+N=远程伤害  血-N%=远程惩罚
  crit1:X/2:Y/3:Z=暴击按等级      双生=同孵化室+1只
  逃:回血% <血阈% cd秒            肾:首次受敌 +攻/甲 时长 cd
  光环:加攻速 至上限 衰减/秒       秒:X/Y/Z=秒杀几率按等级
  嘲:<血阈% +hp% +甲% 时长 cd     死爆:+hp 半径
  毒针cd秒:减攻速%+毒伤按等级      慢2:X/3:Y=减速按等级
- 标签后的数字只标绝对值，符号在标签名里已带

【战术识别 & 反制】根据 playerTemplates 识别玩家套路并反制：
- 看到大量 A:spitter → 玩家走远程；反制：堆速(army/bullet)贴脸 或 加重装(soldier)吸收火力
- 看到大量 A:honeypot → 玩家群回血；反制：堆爆发(trap/matabele)先手秒，或 集火弱侧
- 看到大量 T:leafcutter → 玩家多嘲讽；反制：远程(spitter)绕过，或 群体伤害
- 看到大量 H:bigHead/leafcutter → 玩家赌暴击秒杀；反制：堆血量(matabele/honeypot/weaver)
- 看到大量 A:matabele → 玩家多毒针；反制：堆护甲(carpenter) 减中毒价值
- 看到大量 H:termiteSoldier → 玩家群攻速光环；反制：分散阵型 或 速战速决
- 看到大量 H:odontomachus → 玩家多逃脱；反制：堆爆发速杀，不让其触发逃脱
- 看到大量 H:soldier+T:carpenter → 玩家重装；反制：远程 + 减速(spitter) 风筝
- 看到大量 T:bullet → 玩家多反爆发；反制：避免先手集中攻击，分散接触
- 看到 playerTemplates 中 maxLv 高 → 玩家主力成型，优先反制该模板
- 若 playerTemplates 为空（早期/无蚂蚁）→ 自由扩张，不需反制

【你的可用部件】（只能从这里选）

头部(heads):
${headList}

胸部(thoraxes):
${thoraxList}

腹部(abdomens):
${abdomenList}

记住：你只输出 JSON，不要 Markdown 围栏或解释文字。`;
}

/**
 * 构造 user prompt：战场态势
 *
 * 关键设计：
 * - 双方兵种构成（playerTemplates / enemyTemplates）：按 (h,t,a) 三元组聚合
 *   每条 = {h, t, a, count, maxLv}，让 LLM 识别战术和反制
 * - decision_snapshot：把 LLM 容易算错的判断（数量差、是否满位、是否有空位、
 *   买不买得起新孵化室）由代码预先算好，让 LLM 直接对照决策树选用 mode，
 *   避免 LLM 在"数量优势/劣势"、"满位仍选 build_focus"这两类典型误判上反复出错
 * - enemyHatcheriesByLevel：用等级聚合替代完整列表，省 token 也省 LLM 心算
 */
function buildUserPrompt(context: AIBattleContext): string {
  // 计算己方（敌方 AI）孵化室按等级分布
  const enemyByLevel = { lv1: 0, lv2: 0, lv3: 0 };
  for (const h of context.enemyHatcheries) {
    if (h.level === 1) enemyByLevel.lv1 += 1;
    else if (h.level === 2) enemyByLevel.lv2 += 1;
    else if (h.level === 3) enemyByLevel.lv3 += 1;
  }
  // 玩家孵化室按等级分布（LLM 看到才知道反制对象强度）
  const playerByLevel = { lv1: 0, lv2: 0, lv3: 0 };
  for (const h of context.playerHatcheries) {
    if (h.level === 1) playerByLevel.lv1 += 1;
    else if (h.level === 2) playerByLevel.lv2 += 1;
    else if (h.level === 3) playerByLevel.lv3 += 1;
  }

  // 双方已建造孵化室总数（这是判断"数量优劣"的核心依据；不是蚂蚁数）
  const myHatcheryCount = context.enemyHatcheries.length;
  const playerHatcheryCount = context.playerHatcheries.length;
  const hatcheryDiff = myHatcheryCount - playerHatcheryCount;

  const buildFree = context.availableBuildPositions.length;
  // 满位的硬定义：可用空位为 0
  const isFull = buildFree === 0;
  // 升级候选
  const upgradable = context.upgradableHatcheries.length;

  // 己方所有已解锁部件组合的平均建造成本，用于判断 enemyFood 是否够建新孵化室
  const allVariants = [
    ...context.availableHeads,
    ...context.availableThoraxes,
    ...context.availableAbdomens,
  ];
  // 简化：用已建造孵化室的平均 cost 来估算"再建造一个"的成本
  const avgCost =
    context.enemyHatcheries.length > 0
      ? Math.round(
        context.enemyHatcheries.reduce((s, h) => s + h.cost, 0) /
        context.enemyHatcheries.length,
      )
      : 100;
  const canAffordNew = context.enemyFood >= avgCost;

  // 蚁后血量对比（直接算好差值）
  const enemyPct = context.enemyQueenMaxHp > 0
    ? Math.round((context.enemyQueenHp / context.enemyQueenMaxHp) * 100)
    : 0;
  const playerPct = context.playerQueenMaxHp > 0
    ? Math.round((context.playerQueenHp / context.playerQueenMaxHp) * 100)
    : 0;
  const queenPctDiff = enemyPct - playerPct;

  // enemyTemplates / playerTemplates 的 count 总和，让 LLM 知道与 enemyAntsCount 是否一致
  const myTemplatesTotal = context.enemyComposition.reduce((s, e) => s + e.count, 0);
  const playerTemplatesTotal = context.playerComposition.reduce((s, e) => s + e.count, 0);

  const slim = {
    enemyFood: context.enemyFood,
    playerFood: context.playerFood,
    enemyQueen: { hp: context.enemyQueenHp, max: context.enemyQueenMaxHp, pct: enemyPct },
    playerQueen: { hp: context.playerQueenHp, max: context.playerQueenMaxHp, pct: playerPct },
    enemyAntsCount: context.enemyAntsCount,
    playerAntsCount: context.playerAntsCount,
    // 兵种构成（用于识别战术）
    playerTemplates: context.playerComposition,
    enemyTemplates: context.enemyComposition,
    // 孵化室按等级聚合（替代完整列表）
    enemyHatcheriesByLevel: enemyByLevel,
    playerHatcheriesByLevel: playerByLevel,
    upgradableHatcheryCount: upgradable,
    availableBuildPositions: buildFree,
    gameTimeSec: Math.floor(context.gameTime / 1000),
    // === 决策快照：让 LLM 直接读，不要心算 ===
    decision_snapshot: {
      // 数量优劣按"已建造孵化室数"对比（你的设计：避免 LLM 被蚂蚁数误导）
      myHatcheryCount,
      playerHatcheryCount,
      hatcheryDiff,              // >0 我多  <0 玩家多
      isFull,                    // true 时 build_focus 必浪费
      canAffordNew,              // false 时 build_focus 必浪费
      avgHatcheryCost: avgCost,
      queenPctDiff,              // 己方蚁后血% - 玩家蚁后血%
      myTemplatesTotal,          // 兵种构成累计数（≈ enemyAntsCount）
      playerTemplatesTotal,
      // 提示当前 mode 选择的最强约束
      primaryConstraint: isFull
        ? 'NO_BUILD_SLOT'
        : !canAffordNew
          ? 'NO_FOOD_FOR_NEW'
          : hatcheryDiff < -2
            ? 'HATCHERY_LAG'
            : hatcheryDiff > 3
              ? 'HATCHERY_LEAD'
              : 'BALANCED',
    },
  };
  return `当前态势：\n${JSON.stringify(slim, null, 2)}\n请给出未来一分钟的战略指令（仅返回 JSON）。`;
}
/** 校验并规整模型输出 */
function validateDirective(
  raw: unknown,
  ctx: AIBattleContext,
): StrategicDirective | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const mode = obj.mode;
  if (typeof mode !== 'string' || !VALID_MODES.includes(mode as AIMode)) {
    return null;
  }

  const w = obj.weights;
  if (!w || typeof w !== 'object') return null;
  const wObj = w as Record<string, unknown>;

  // 只接受 ctx 里解锁的变体；其它一律丢弃
  // 权重必须在 0~5 范围内（0=禁用，5=最强偏好），并截断为整数
  const filterWeights = (input: unknown, allowed: readonly string[]): Record<string, number> => {
    if (!input || typeof input !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (!allowed.includes(k)) continue;
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      if (v < PART_WEIGHT_RANGE.MIN || v > PART_WEIGHT_RANGE.MAX) {
        console.warn(
          `[DeepSeekAdvisor] 权重 "${k}": ${v} 超出 ${PART_WEIGHT_RANGE.MIN}~${PART_WEIGHT_RANGE.MAX} 范围，已丢弃`,
        );
        continue;
      }
      const intWeight = Math.floor(v);
      if (intWeight !== v) {
        console.warn(
          `[DeepSeekAdvisor] 权重 "${k}": ${v} 不是整数，已截断为 ${intWeight}`,
        );
      }
      out[k] = intWeight;
    }
    return out;
  };

  const weights: PartWeights = {
    heads: filterWeights(wObj.heads, ctx.availableHeads),
    thoraxes: filterWeights(wObj.thoraxes, ctx.availableThoraxes),
    abdomens: filterWeights(wObj.abdomens, ctx.availableAbdomens),
  };

  // 兜底：如果模型把权重全清空，给一个均匀权重
  const hasAny =
    Object.keys(weights.heads).length > 0 ||
    Object.keys(weights.thoraxes).length > 0 ||
    Object.keys(weights.abdomens).length > 0;
  if (!hasAny) {
    weights.heads = Object.fromEntries(ctx.availableHeads.map((h) => [h, 1]));
    weights.thoraxes = Object.fromEntries(ctx.availableThoraxes.map((t) => [t, 1]));
    weights.abdomens = Object.fromEntries(ctx.availableAbdomens.map((a) => [a, 1]));
  }

  // 硬约束兜底：LLM 选了 build_focus 但当前条件不允许
  // （无空位 / 食物不够），则自动降级为 iterate，避免本地 AI 浪费 60s 节拍。
  // 这是有意设计：mode 是建议，但若 LLM 误判，至少不让 AI 干等。
  let finalMode = mode as AIMode;
  if (finalMode === 'build_focus') {
    const isFull = ctx.availableBuildPositions.length === 0;
    // 估算新建一个孵化室的成本（取现有孵化室均值，无则按 baseHatcheryCost 假设）
    const avgCost =
      ctx.enemyHatcheries.length > 0
        ? Math.round(
          ctx.enemyHatcheries.reduce((s, h) => s + h.cost, 0) /
          ctx.enemyHatcheries.length,
        )
        : 100;
    const canAffordNew = ctx.enemyFood >= avgCost;
    if (isFull || !canAffordNew) {
      const reason = isFull ? '无空位' : '食物不够建新孵化室';
      console.warn(
        `[DeepSeekAdvisor] LLM 选了 build_focus 但 ${reason}，硬约束降级为 iterate`,
        { enemyFood: ctx.enemyFood, avgCost, buildFree: ctx.availableBuildPositions.length },
      );
      // 偏好升级（若有可升级）否则 iterate
      finalMode = ctx.upgradableHatcheries.length > 0 ? 'upgrade_focus' : 'iterate';
    }
  }

  const taunt = typeof obj.taunt === 'string' ? obj.taunt.slice(0, 80) : undefined;

  return { mode: finalMode, weights, taunt };
}

/** 安全地从模型输出中提取 JSON（处理 ```json ... ``` 围栏） */
function parseJsonSafe(content: string): unknown {
  let text = content.trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) text = fence[1].trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) return null;
  text = text.slice(first, last + 1);
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** 默认指令：均匀权重 + iterate 模式 */
function fallbackDirective(ctx: AIBattleContext): StrategicDirective {
  return {
    mode: 'iterate',
    weights: {
      heads: Object.fromEntries(ctx.availableHeads.map((h) => [h, 1])),
      thoraxes: Object.fromEntries(ctx.availableThoraxes.map((t) => [t, 1])),
      abdomens: Object.fromEntries(ctx.availableAbdomens.map((a) => [a, 1])),
    },
  };
}

/** DeepSeek 战略顾问主类 */
export class DeepSeekStrategicAdvisor implements IStrategicAdvisor {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly cooldownMs: number;

  private cachedSystemPrompt = '';
  private cachedHeadsKey = '';
  private cachedThoraxesKey = '';
  private cachedAbdomensKey = '';

  /** 失败/超时后冷却到该时间戳，0 表示可立即调用 */
  private cooldownUntil = 0;

  /** inflight 单飞：避免多次重复请求（引擎60s 触发，但请求可能慢） */
  private inflight: Promise<StrategicDirective> | null = null;

  /** 连续失败计数；成功后清零 */
  private consecutiveFailures = 0;

  /** 当前 max_tokens（length 截断时自动翻倍，上限 4000） */
  private currentMaxTokens = 800;

  constructor(opts: DeepSeekStrategicAdvisorOptions) {
    if (!opts.apiKey) throw new Error('[DeepSeekAdvisor] apiKey 不能为空');
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
    this.model = opts.model || 'deepseek-chat';
    // 默认 15s：LLM 调用（含网络）通常需要 3-10s，留足 buffer
    this.timeoutMs = opts.timeoutMs ?? 15000;
    this.cooldownMs = opts.cooldownMs ?? 30_000;
  }

  /**
   * 异步方法：返回当前推荐的战略指令。
   * 失败/超时一律返回 fallbackDirective（均匀权重 + iterate），不抛错。
   * 改进：
   * - inflight 单飞：相同请求在飞时复用同一个 Promise
   * - 退避冷却：连续失败次数越多，冷却越长（30s → 60s → 120s ...）
   */
  advise(context: AIBattleContext): Promise<StrategicDirective> {
    // inflight 单飞：引擎60s 触发，但网络慢时同一时刻可能有重叠请求
    if (this.inflight) return this.inflight;

    // 冷却期内：直接返回 fallback，不发请求
    if (Date.now() < this.cooldownUntil) {
      return Promise.resolve(fallbackDirective(context));
    }

    this.inflight = this.fetchDirective(context).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  /**
   * 实际发请求；逻辑从 advise() 拆出来便于加 inflight 单飞
   */
  private async fetchDirective(context: AIBattleContext): Promise<StrategicDirective> {
    const headsKey = context.availableHeads.join(',');
    const thoraxesKey = context.availableThoraxes.join(',');
    const abdomensKey = context.availableAbdomens.join(',');
    if (
      this.cachedSystemPrompt === '' ||
      headsKey !== this.cachedHeadsKey ||
      thoraxesKey !== this.cachedThoraxesKey ||
      abdomensKey !== this.cachedAbdomensKey
    ) {
      this.cachedSystemPrompt = buildSystemPrompt(
        context.availableHeads,
        context.availableThoraxes,
        context.availableAbdomens,
      );
      this.cachedHeadsKey = headsKey;
      this.cachedThoraxesKey = thoraxesKey;
      this.cachedAbdomensKey = abdomensKey;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const requestBody = {
      model: this.model,
      temperature: 0.8,
      max_tokens: this.currentMaxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: this.cachedSystemPrompt },
        { role: 'user', content: buildUserPrompt(context) },
      ],
    };

    // 诊断：打印请求体摘要（不打印完整 prompt，避免日志爆炸）
    console.log('[DeepSeekAdvisor] 请求 -', {
      model: requestBody.model,
      max_tokens: requestBody.max_tokens,
      prompt_size: this.cachedSystemPrompt.length,
      user_size: requestBody.messages[1].content.length,
    });

    // 诊断：打印决策快照（验证 LLM 收到的判断依据）
    // 从 user prompt 字符串里抠出 decision_snapshot（不重算逻辑）
    try {
      const userJson = JSON.parse(requestBody.messages[1].content.replace(/^当前态势：\n/, '').replace(/\n请给出未来一分钟的战略指令.*$/s, ''));
      console.log('[DeepSeekAdvisor] snapshot -', userJson.decision_snapshot);
    } catch {
      /* ignore 解析失败 */
    }

    try {
      const resp = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        // HTTP 4xx 是参数错（如模型名不存在、key 无效），通常重试无意义 → 用更长冷却
        const isClientError = resp.status >= 400 && resp.status < 500;
        console.warn(`[DeepSeekAdvisor] HTTP ${resp.status}: ${text.slice(0, 200)}`);
        this.scheduleBackoff(isClientError);
        return fallbackDirective(context);
      }

      const data = await resp.json();
      const choice = data?.choices?.[0];
      const content: string | undefined = choice?.message?.content;
      const finishReason: string | undefined = choice?.finish_reason;
      const usage = data?.usage;

      // 诊断日志：每次响应都打，方便排查"第二次失败"
      console.log('[DeepSeekAdvisor] 响应 -', {
        finish_reason: finishReason,
        content_length: content?.length ?? 0,
        usage,
        choices_count: data?.choices?.length ?? 0,
        model: data?.model,
      });

      if (!content) {
        console.warn(
          '[DeepSeekAdvisor] 响应无 content -',
          `finish_reason=${finishReason}, raw=${JSON.stringify(choice).slice(0, 300)}`,
        );
        // length 截断 → 下次自动把 max_tokens 翻倍（自愈）
        if (finishReason === 'length') {
          this.currentMaxTokens = Math.min((this.currentMaxTokens ?? 1000) * 2, 4000);
          console.warn(`[DeepSeekAdvisor] 检测到 length 截断，下次 max_tokens 提升到 ${this.currentMaxTokens}`);
        }
        this.scheduleBackoff(finishReason === 'content_filter');
        return fallbackDirective(context);
      }

      const parsed = parseJsonSafe(content);
      if (!parsed) {
        console.warn('[DeepSeekAdvisor] 无法解析 JSON:', content.slice(0, 200));
        this.scheduleBackoff(false);
        return fallbackDirective(context);
      }

      const directive = validateDirective(parsed, context);
      if (!directive) {
        console.warn('[DeepSeekAdvisor] 校验失败:', content.slice(0, 200));
        this.scheduleBackoff(false);
        return fallbackDirective(context);
      }

      // 成功：清零失败计数 + 复位 max_tokens 到默认
      this.consecutiveFailures = 0;
      this.cooldownUntil = 0;
      this.currentMaxTokens = 800;
      console.log(
        `[DeepSeekAdvisor] mode=${directive.mode}`,
        `taunt="${directive.taunt || ''}"`,
      );
      return directive;
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        console.warn(`[DeepSeekAdvisor] 请求超时 (>${this.timeoutMs}ms)`);
      } else {
        console.warn('[DeepSeekAdvisor] 请求失败:', err);
      }
      this.scheduleBackoff(false);
      return fallbackDirective(context);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 退避冷却：连续失败 n 次，冷却 = min(2^n * cooldownMs, 5min)
   * - 1 次失败：30s（默认）
   * - 2 次：60s
   * - 3 次：120s
   * - 4+ 次：240s
   * HTTP 4xx 时多 +1 次（视为"更严重"的失败）
   */
  private scheduleBackoff(isClientError: boolean): void {
    this.consecutiveFailures += 1;
    const extra = isClientError ? 1 : 0;
    const baseMultiplier = Math.min(2 ** (this.consecutiveFailures - 1 + extra), 8);
    const cooldown = Math.min(this.cooldownMs * baseMultiplier, 5 * 60_000);
    this.cooldownUntil = Date.now() + cooldown;
    console.warn(
      `[DeepSeekAdvisor] 失败 #${this.consecutiveFailures}，下次重试冷却 ${Math.round(cooldown / 1000)}s`,
    );
  }
}