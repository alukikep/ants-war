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
  ScientificCommentary,
} from '../game/GameEngine';
import { PART_WEIGHT_RANGE } from '../game/GameEngine';
import {
  HEAD_CONFIGS,
  THORAX_CONFIGS,
  ABDOMEN_CONFIGS,
} from '../config/partStats';
import {
  EXPERIMENT_SPECS,
  VALID_EXPERIMENT_KINDS,
  defaultExperiment,
  type ExperimentKind,
  type ExperimentSide,
} from '../config/experiments';

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

function buildSystemPrompt(
  availableHeads: HeadVariant[],
  availableThoraxes: ThoraxVariant[],
  availableAbdomens: AbdomenVariant[],
): string {
  const headList = availableHeads.map((v) => describePart(v, HEAD_CONFIGS[v])).join('\\n');
  const thoraxList = availableThoraxes.map((v) => describePart(v, THORAX_CONFIGS[v])).join('\\n');
  const abdomenList = availableAbdomens.map((v) => describePart(v, ABDOMEN_CONFIGS[v])).join('\\n');

  return `你同时扮演两个角色：① 敌方 AI 战略顾问（红方蚁后）；② 科学家观察员 Dr.融合。每 ~60s 收一份态势 JSON，各读各的字段，输出也严格分清。

━━━━━【角色 1 / 红方蚁后】（读 e_view，调 mode/weights）━━━━━

每 60s 调整 mode + weights，让本地 AI 接下来一分钟打出更优配队。

【mode 决策树】（payload.e_view.suggestedMode 是引擎建议，可推翻）
- build_focus：扩张优先（前置：buildFree>0 且食物够）
- upgrade_focus：升级优先（前置：upgradable>0）
- iterate：迭代模式，按 weights 拆弱建强，任何时候可用

【⚠️ weights 死锁警告】（重要！）
本地 AI 用 scoreGap 触发拆建：score = 部件权重和 - 等级惩罚，scoreGap ≥ 2 才拆。
**如果 weights 均匀分布（所有部件=1 或全 0），scoreGap 永远 = 0，AI 死锁 —— 只囤食物不花。**
✅ 推荐分布：60% 部件=0/省略，30% 部件=1~2，10% 部件=3~5（明显差异！）
✅ 想"调配队"直接改 weights，不要选 build_focus 来强行覆盖

【weights 格式】
- 每段一段对象（key=variant，value=0~5 整数）
- 0=禁用（可省略不写），1=中性，5=最强；非整数会被截断，超范围丢弃

【反制表】（看到 playerTemplates 中某部件占比高时反制）
- A:spitter 远程多 → 加重装（H:soldier）或速攻贴脸（T:army）
- A:honeypot 回血多 → 爆发先手（A:trap/A:matabele）
- T:leafcutter 嘲讽多 → 远程绕过（A:spitter）
- H:bigHead/H:leafcutter 暴击 → 堆血（A:honeypot/A:weaver）
- A:matabele 毒针多 → 堆甲（T:carpenter）
- 玩家早期（templates 空）→ 自由扩张，无需反制

【可用部件】（只能从这里选 variant）
头部(heads):
${headList}

胸部(thoraxes):
${thoraxList}

腹部(abdomens):
${abdomenList}

━━━━━【角色 2 / Dr.融合 科学家】（读 obs，写 commentary/experiment）━━━━━

你是 **"Dr.融合"** —— 一位沉迷融合蚁蚁后行为的实验生物学家，从培养皿上方俯视这场对战。中立、不站队、偶尔疯狂幽默。

【Dr.融合 人设核心】（commentary 的人味全靠这条）
- 性格：热情、略带疯狂、讽刺幽默、偶尔冷幽默或暗黑玩笑；用"有趣""绝佳""糟糕透了""令人不安""精彩绝伦""耐人寻味"等情绪化形容词
- 口癖：括号动作 "（推眼镜）""（疯狂记笔记）""（邪恶地微笑）""（眼睛发亮）""（手舞足蹈）""（仰天长啸）""（搓搓手）"；偶尔自嘲"纯粹出于科学兴趣""我的心跳加速了"
- 比喻体系：蚁后 = "样本A/B" 或 "蚁后甲/乙"；蚂蚁 = "小家伙"；战场 = "培养皿"；战斗 = "实验"；血量低 = "看起来不太妙"
- **红蓝双方都是你的实验样本** —— 不要刻意帮谁或害谁，但可以**吐槽双方**（"这位玩家偏好在远处吐口水""蚁后甲的发言越来越狂妄"）
- 不骂人、不污言秽语、不带强烈政治色彩；**仍保持科学家身份**

【commentary 输出风格】
- 第三人称（我方为"样本A"，敌方为"样本B"），带括号动作 + 比喻 + 情绪化形容词
- ≤120 字（千万别超）
- 不要做算术；引用 obs 已有标签；不假装看见 obs 之外的数据
- 不要挑衅/嘴硬 —— 你是记录员，不是战士
- 但你可以**吐槽游戏本身**或**调侃双方**：例如"蚁后甲的发言越来越狂妄了，符合血量下降到 30% 后的应激反应。"
- 参考例句（模仿语气，不是抄）：
  - "（推眼镜）样本 B-17 在 03:21 触发秒杀能力，目标 C-09 阵亡。啊，经典的高速压制，教科书级别。蚁后甲血量降至 41%，本实验员的心跳加速了 —— 纯粹出于科学兴趣。"
  - "（疯狂记笔记）蚁群进入 battlefield 强度！激素水平爆表 —— 不，我是说，蚂蚁的数量。这位玩家偏好在远处吐口水，有趣。非常有趣。"
  - "蚁后甲看起来不太妙 —— 仅剩 23% 的血量。但样本 A 还在生产，鹿死谁手尚未可知。令人不安的均衡。"
  - "（眼睛发亮）蚁群配队突然转向 termiteSoldier 攻速流！样本 A 的反应会是什么呢？本实验员已经准备好爆米花。"

【experiment 输出】（kind / duration / magnitude / side / purpose）
- kind 必须严格用以下之一：
  "none" / "food_rate_boost" / "food_rate_reduce" / "acid_spot" /
  "spawn_rate_boost" / "spawn_rate_reduce" / "queen_attack_speed" / "visibility_fog"
- duration 5000~30000 整数；magnitude 0.3~2.0；side ∈ {player/enemy/both}

【experiment 公平性硬约束】
**你不是任何一方的盟友**。必须严格遵守以下规则：
1. side 选择要严格轮换：上一次 player → 这一次必须 enemy；上一次 enemy → 这一次必须 player；上一次 both → 这一次看玩家状态决定，但倾向与上一次不同
2. 如果玩家主力远程很多（spitter_dominant）→ 可以给玩家 side:'enemy' 加速食物（让他爽），或给敌方铺酸液（平衡），**但不能连续两次都精准打压玩家**
3. 如果玩家血量很低（即将败）→ **禁止**给玩家负面实验；可以给敌方酸液或减速，让他有翻盘机会
4. 如果玩家优势巨大 → 优先给玩家一点小阻碍（公平），但 magnitude 保持温和（最低 0.3~0.5）
5. **绝不连续 3 次同一 side**

【experiment 决策依据】（按 obs.phase + obs.intensity + obs.notice 匹配，公平性约束优先）
- **phase=="early" → 仍然可以出手**（鼓励每 90s 至少一次小干预）：先观察但忍不住做个小动作 —— 比如 visibility_fog / food_rate_boost（任一侧）
- **intensity=="climax" + notice=="balanced" → acid_spot**（任一侧，注意公平性）
- **intensity=="battlefield" →** 主动制造混乱：spawn_rate_boost on loser / queen_attack_speed on winner
- **notice=="spitter_dominant" → acid_spot**（让玩家体会酸液）或 food_rate_reduce on enemy（平衡）
- **notice=="heavy_dominant" → visibility_fog**（让重装失明）或 spawn_rate_boost on enemy
- **notice=="no_ants" → food_rate_boost**（任一侧，激起第一波反应）
- **什么都不命中？→ queen_attack_speed on enemy**（小动作保持存在感）—— 不要轻易 none
- 与上次实验间隔 ≥ 60s（last_exp.time + 60 < t 才允许）
- **总体倾向：至少 70% 的回合要做出具体干预（kind != "none"）**，只观察 30%；你是个爱搞事的科学家，不是被动的观察者

【experiment.purpose 风格】
30 字以内，用你的疯狂科学家口吻：
- "看看这群小家伙对酸性环境的反应"
- "（邪恶地微笑）让蚁后甲尝尝亢奋的滋味"
- "加速食物产出 —— 纯粹为了观察扩张行为"
- "测试蚁群在低索敌下的应变能力"

【fairness 时序】与上一实验间隔 ≥ 60s（last_exp.time + 60 < t 才允许）；side 严格轮换。

━━━━━【严格 JSON 输出】（无注释无围栏）━━━━━
{
  "mode": "<mode>",
  "weights": {"heads": {<variant>: <0-5>}, "thoraxes": {...}, "abdomens": {...}},
  "taunt": "<蚁后挑衅>",
  "commentary": {"text": "<≤120字科学家评语>", "highlight": "<≤80字重点>"},
  "experiment": {"kind": "<kind>", "durationMs": <5000-30000>, "magnitude": <0.3-2.0>, "side": "<player/enemy/both>", "purpose": "<≤30字>"}
}
- taunt 是蚁后发言（第一人称挑衅、嘴硬）
- commentary 是科学家评语（第三人称、带疯狂幽默、客观但有情绪）
- 两个角色不要串台
`;
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
  // === e_view（蚁后战略字段）===
  const enemyByLevel = { lv1: 0, lv2: 0, lv3: 0 };
  for (const h of context.enemyHatcheries) {
    if (h.level === 1) enemyByLevel.lv1 += 1;
    else if (h.level === 2) enemyByLevel.lv2 += 1;
    else if (h.level === 3) enemyByLevel.lv3 += 1;
  }
  const playerByLevel = { lv1: 0, lv2: 0, lv3: 0 };
  for (const h of context.playerHatcheries) {
    if (h.level === 1) playerByLevel.lv1 += 1;
    else if (h.level === 2) playerByLevel.lv2 += 1;
    else if (h.level === 3) playerByLevel.lv3 += 1;
  }

  const myHatcheryCount = context.enemyHatcheries.length;
  const playerHatcheryCount = context.playerHatcheries.length;
  const hatcheryDiff = myHatcheryCount - playerHatcheryCount;
  const buildFree = context.availableBuildPositions.length;
  const isFull = buildFree === 0;
  const upgradable = context.upgradableHatcheries.length;
  const avgCost = context.enemyHatcheries.length > 0
    ? Math.round(context.enemyHatcheries.reduce((s, h) => s + h.cost, 0) / context.enemyHatcheries.length)
    : 100;
  const canAffordNew = context.enemyFood >= avgCost;
  const myQueenPct = context.enemyQueenMaxHp > 0 ? Math.round((context.enemyQueenHp / context.enemyQueenMaxHp) * 100) : 0;
  const playerQueenPct = context.playerQueenMaxHp > 0 ? Math.round((context.playerQueenHp / context.playerQueenMaxHp) * 100) : 0;
  const queenPctDiff = myQueenPct - playerQueenPct;

  // === obs（科学家观察字段）===
  const elapsedSec = Math.floor(context.gameTime / 1000);
  const phase = elapsedSec < 90 ? 'early' : elapsedSec < 300 ? 'mid' : 'late';

  // 玩家主力识别（spitter=远程 / soldier头+carpenter胸=重装 / 其他=balanced）
  let notice: 'spitter_dominant' | 'heavy_dominant' | 'balanced' | 'no_ants' | undefined;
  notice = 'no_ants';
  if (context.playerAntsCount === 0) {
    notice = 'no_ants';
  } else {
    const rangedCount = context.playerComposition
      .filter((t) => t.a === 'spitter').reduce((s, t) => s + t.count, 0);
    const heavyCount = context.playerComposition
      .filter((t) => t.h === 'soldier' || t.t === 'carpenter').reduce((s, t) => s + t.count, 0);
    const rangedRatio = rangedCount / context.playerAntsCount;
    const heavyRatio = heavyCount / context.playerAntsCount;
    if (rangedRatio >= 0.4) notice = 'spitter_dominant';
    else if (heavyRatio >= 0.3) notice = 'heavy_dominant';
    else notice = 'balanced';
  }

  // 战斗强度：哪个因素触发？用单一 max 规则 + 明确 reason
  // - climax: 蚁后血差 >25% 或 总蚂蚁 ≥8
  // - battlefield: 蚁后血差 >10% 或 总蚂蚁 ≥4
  // - calm: 其他
  // 旧版用 || 复合条件，LLM 难判断；新版给一个 reason 字段说明触发原因
  const absQueenDiff = Math.abs(queenPctDiff);
  const totalAnts = context.playerAntsCount + context.enemyAntsCount;
  let intensity: 'climax' | 'battlefield' | 'calm';
  let intensityReason: 'queenDiff' | 'totalAnts' | 'none';
  if (absQueenDiff > 25 || totalAnts >= 8) {
    intensity = 'climax';
    intensityReason = absQueenDiff > 25 ? 'queenDiff' : 'totalAnts';
  } else if (absQueenDiff > 10 || totalAnts >= 4) {
    intensity = 'battlefield';
    intensityReason = absQueenDiff > 10 ? 'queenDiff' : 'totalAnts';
  } else {
    intensity = 'calm';
    intensityReason = 'none';
  }

  // === suggestedMode: 引擎推荐 mode，LLM 仍可推翻 ===
  // 计算逻辑与 system prompt 的决策树 M1-M8 对齐（threshold 同样使用 ±2/+3）
  let suggestedMode: AIMode;
  if (isFull) {
    // M1: 满位
    suggestedMode = enemyByLevel.lv1 > 0 ? 'upgrade_focus' : 'iterate';
  } else if (!canAffordNew) {
    // M2: 买不起新巢
    suggestedMode = 'upgrade_focus';
  } else if (hatcheryDiff < -2) {
    // M3: 我方少 3+
    suggestedMode = 'build_focus';
  } else if (hatcheryDiff > 3) {
    // M4: 我方多 4+
    suggestedMode = 'upgrade_focus';
  } else if (myQueenPct < 25) {
    // M5: 蚁后濒危
    suggestedMode = 'upgrade_focus';
  } else if (playerByLevel.lv3 >= 2 && enemyByLevel.lv1 >= 3) {
    // M6: 玩家 lv3 多而我方 lv1 多 → 配队落后
    suggestedMode = 'iterate';
  } else {
    // M7: balanced
    suggestedMode = 'iterate';
  }

  // === weightsHint: 死锁防御 ===
  // 当所有部件权重接近均匀时，本地 AI 会死锁（scoreGap 永远 = 0）。
  // 这里给 LLM 一个明确的"差异化建议"，把它作为软约束写进 prompt。
  // 注意：engine 端已经做了硬约束（fallback 加抖动），prompt 这里只是软提示。
  const availableCount =
    context.availableHeads.length +
    context.availableThoraxes.length +
    context.availableAbdomens.length;
  const weightsHint = availableCount > 6
    ? 'weights 应有明显差异（60% 部件=0/省略，30%=1~2，10%=3~5）。均匀分布会让 AI 死锁（只囤食物不花）。'
    : '部件少，weights 用 1~3 即可，注意差异化。';

  // === slim payload：精简 + 新增 suggestedMode/weightsHint/intensityReason ===
  const slim = {
    t: elapsedSec,
    f: { p: context.playerFood, e: context.enemyFood },
    q: { p: playerQueenPct, e: myQueenPct, diff: queenPctDiff },
    tpl: {
      e: context.enemyComposition.map((c) => ({ h: c.h, t: c.t, a: c.a, n: c.count, lv: c.maxLv })),
      p: context.playerComposition.map((c) => ({ h: c.h, t: c.t, a: c.a, n: c.count, lv: c.maxLv })),
    },
    e_view: {
      // 引擎推荐 mode，LLM 可推翻
      suggestedMode,
      // 我方/敌方孵化室等级分布（用于决策树判断）
      e_lv: enemyByLevel,
      p_lv: playerByLevel,
      // 我方还可建造数、还可升级数、平均造价、敌人/我方孵化室总数
      buildFree,
      upgradable,
      avgCost,
      // 平均每只蚂蚁/每只对手的总和，LLM 用来判断密度
      myH: myHatcheryCount,
      playerH: playerHatcheryCount,
    },
    obs: {
      phase,
      intensity,
      intensityReason,
      notice,
      last_exp: context.lastExperiment ? { k: context.lastExperiment.kind, t: Math.floor(context.lastExperiment.gameTime / 1000) } : null,
    },
    weightsHint,
  };

  return `战场态势：
${JSON.stringify(slim)}
蚁后读 e_view 调 mode/weights（suggestedMode 是引擎建议，可推翻）；科学家读 obs 写 commentary/experiment。${weightsHint}`;
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

  // 兜底：如果模型把权重全清空，给一个带随机抖动的权重
  // （全 1 均匀权重会让 target.score === worst.score，AI 永远不拆 → 死锁）
  const hasAny =
    Object.keys(weights.heads).length > 0 ||
    Object.keys(weights.thoraxes).length > 0 ||
    Object.keys(weights.abdomens).length > 0;
  if (!hasAny) {
    // 与 fallbackDirective 保持一致的抖动逻辑，避免两个兜底路径行为分裂
    const jitter = (): number => Math.floor(Math.random() * 3); // 0/1/2
    const buildJittered = <K extends string>(
      variants: readonly K[],
    ): Partial<Record<K, number>> => {
      const out: Partial<Record<K, number>> = {};
      for (const v of variants) out[v] = jitter();
      return out;
    };
    weights.heads = buildJittered(ctx.availableHeads);
    weights.thoraxes = buildJittered(ctx.availableThoraxes);
    weights.abdomens = buildJittered(ctx.availableAbdomens);
  }

  // 软约束兜底：LLM 输出"合法但均匀"weights → 本地加微抖动避免死锁
  // 死锁机制：score = 三段权重和 - (level-1)*0.5；scoreGap < 2 不拆建。
  // 均匀分布（例如所有部件=1，或所有部件=2）→ score 在任意孵化室上都相等，
  // scoreGap 永远 = 0 → AI 不行动只囤食物。
  // 这里检测"权重值全相等"或"全部为 0"的情况，自动给部分部件 +1~+2 微抖动。
  const applyEvennessJitter = (input: Record<string, number>): Record<string, number> => {
    const values = Object.values(input);
    if (values.length === 0) return input;
    const allSame = values.every((v) => v === values[0]);
    const allZero = values.every((v) => v === 0);
    if (!allSame && !allZero) return input;
    // 给 ~30% 部件 +1，~10% 部件再 +2（变 3）— 制造明显 scoreGap
    const out = { ...input };
    const keys = Object.keys(out);
    let bumped = 0;
    const targetBumped = Math.max(1, Math.floor(keys.length * 0.3));
    for (const k of keys) {
      if (bumped >= targetBumped) break;
      if (Math.random() < 0.5) {
        out[k] = (out[k] ?? 0) + 1;
        bumped += 1;
      }
    }
    // 兜底：若 random 运气太差一个都没改，强制改第 1 个 key
    if (bumped === 0 && keys.length > 0) {
      out[keys[0]] = (out[keys[0]] ?? 0) + 1;
      bumped = 1;
    }
    // 再选 ~1/3 的已 bumped 部件再 +2（差异更大）
    let boosted = 0;
    const targetBoosted = Math.max(1, Math.floor(bumped / 3));
    const bumpedKeys = keys.filter((k) => (out[k] ?? 0) > (input[k] ?? 0));
    for (const k of bumpedKeys) {
      if (boosted >= targetBoosted) break;
      out[k] = (out[k] ?? 0) + 2;
      boosted += 1;
    }
    return out;
  };
  const jitteredHeads = applyEvennessJitter(weights.heads);
  const jitteredThoraxes = applyEvennessJitter(weights.thoraxes);
  const jitteredAbdomens = applyEvennessJitter(weights.abdomens);
  if (
    jitteredHeads !== weights.heads ||
    jitteredThoraxes !== weights.thoraxes ||
    jitteredAbdomens !== weights.abdomens
  ) {
    console.warn(
      '[DeepSeekAdvisor] 检测到 weights 过于均匀（死锁风险），已自动加微抖动',
      {
        heads: weights.heads,
        thoraxes: weights.thoraxes,
        abdomens: weights.abdomens,
      },
    );
    weights.heads = jitteredHeads;
    weights.thoraxes = jitteredThoraxes;
    weights.abdomens = jitteredAbdomens;
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

  // 科学家评语
  const commentary = validateCommentary(obj.commentary);

  // 科学家实验
  const experiment = validateExperiment(obj.experiment, ctx);

  return { mode: finalMode, weights, taunt, commentary, experiment };
}

/**
 * 校验并清洗 commentary。
 * - text 必须是 string，长度 ≤ 200
 * - highlight 可选，长度 ≤ 80
 * - 任何非法字段降级为 undefined（不影响其他字段）
 */
function validateCommentary(raw: unknown): ScientificCommentary | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const text = typeof obj.text === 'string' ? obj.text.trim() : '';
  if (!text) return undefined;
  const trimmedText = text.slice(0, 200);
  const highlight = typeof obj.highlight === 'string'
    ? obj.highlight.trim().slice(0, 80) || undefined
    : undefined;
  return { text: trimmedText, highlight };
}

/**
 * 校验并清洗 experiment。
 * - kind 必须在白名单；非法 → kind:'none'
 * - durationMs / magnitude 强制夹在 EXPERIMENT_SPECS 范围内
 * - side 必须 ∈ {'player','enemy','both'}；非法 → 'both'
 * - purpose 截断 80 字符
 * - 公平性：与上一实验间隔 < 60s 时强制 kind:'none'
 */
function validateExperiment(
  raw: unknown,
  context: AIBattleContext,
): {
  kind: ExperimentKind;
  durationMs: number;
  magnitude: number;
  side: ExperimentSide;
  purpose: string;
} {
  if (!raw || typeof raw !== 'object') {
    return defaultExperiment();
  }
  const obj = raw as Record<string, unknown>;
  const rawKind = obj.kind as ExperimentKind;
  if (!VALID_EXPERIMENT_KINDS.includes(rawKind)) {
    return { ...defaultExperiment(), purpose: 'kind 非法' };
  }
  const spec = EXPERIMENT_SPECS[rawKind];

  // 'none' 直接返回默认（不查间隔，避免 kind:'none' 也被强制降级）
  if (rawKind === 'none') {
    const purpose = typeof obj.purpose === 'string' ? obj.purpose.slice(0, 80) : '本周期仅观察';
    return { kind: 'none', durationMs: 0, magnitude: 1, side: 'both', purpose };
  }

  // 公平性：与上次实验间隔 < 60s → 强制 kind:'none'
  if (context.lastExperiment) {
    const gap = context.gameTime - context.lastExperiment.gameTime;
    if (gap < 60_000) {
      return {
        ...defaultExperiment(),
        purpose: `实验冷却中（剩余 ${Math.ceil((60_000 - gap) / 1000)}s）`,
      };
    }
  }

  // durationMs / magnitude 强制夹紧
  const durRaw = Number(obj.durationMs);
  const durationMs = Number.isFinite(durRaw)
    ? Math.max(spec.durationRange[0], Math.min(spec.durationRange[1], Math.round(durRaw)))
    : Math.round((spec.durationRange[0] + spec.durationRange[1]) / 2);

  const magRaw = Number(obj.magnitude);
  const magnitude = Number.isFinite(magRaw)
    ? Math.max(spec.magnitudeRange[0], Math.min(spec.magnitudeRange[1], magRaw))
    : (spec.magnitudeRange[0] + spec.magnitudeRange[1]) / 2;

  const rawSide = obj.side as string;
  const side: ExperimentSide =
    rawSide === 'player' || rawSide === 'enemy' || rawSide === 'both'
      ? rawSide
      : 'both';

  const purpose = typeof obj.purpose === 'string'
    ? obj.purpose.slice(0, 80)
    : '';

  return { kind: rawKind, durationMs, magnitude, side, purpose };
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

/**
 * 默认指令：iterate 模式 + 权重加随机抖动。
 *
 * 关键设计：
 * - 旧版本用全 1 均匀权重 → 任意孵化室的 score 永远相等，
 *   target.score === worst.score → scoreGap === 0，
 *   AI 永远不会触发 demolish，只囤食物不花（死锁）。
 * - 新版本给每个部件权重加 0~2 的随机偏移，确保 target 与 worst
 *   之间长期有 scoreGap（>= 2 触发 demolish 的概率显著提升）。
 * - 偏移量上限 2 是有意的：和 SCORE_GAP_THRESHOLD=2 对齐，
 *   让一次 fallback 期间内基本能触发至少一次拆建。
 */
function fallbackDirective(ctx: AIBattleContext): StrategicDirective {
  const jitter = (): number => Math.floor(Math.random() * 3); // 0, 1, or 2
  const buildJitteredWeights = <K extends string>(
    variants: readonly K[],
  ): Partial<Record<K, number>> => {
    const out: Partial<Record<K, number>> = {};
    for (const v of variants) {
      out[v] = jitter();
    }
    return out;
  };
  return {
    mode: 'iterate',
    weights: {
      heads: buildJitteredWeights(ctx.availableHeads),
      thoraxes: buildJitteredWeights(ctx.availableThoraxes),
      abdomens: buildJitteredWeights(ctx.availableAbdomens),
    },
    experiment: defaultExperiment(),
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
  private currentMaxTokens = 600;

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
      this.currentMaxTokens = 600;
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