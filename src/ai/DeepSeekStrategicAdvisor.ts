/**
 * LLM 战略顾问（OpenAI 兼容协议）
 *
 * 历史：早期只支持 DeepSeek，故类名沿用 `DeepSeekStrategicAdvisor`。v0.3 起，
 * 本类已通用化：通过 `baseUrl` + `model` 参数可对接任何 OpenAI 兼容服务
 * （DeepSeek / 硅基流动 / 月之暗面 / OpenAI / OpenRouter / Ollama 等）。
 *
 * 调用节奏：每 ~60s 调用一次，把当前战场态势作为 prompt 喂入，
 * 让模型输出"战略指令"：mode + 部件权重 + taunt。
 * 实际建造/升级/拆除动作由本地 DefaultAIDecisionMaker 完成。
 *
 * 关键设计：
 * - advise() 返回 StrategicDirective；引擎把它写入 DefaultAI。
 * - 不实现 AIDecisionMaker 接口（不参与高频决策）。
 * - 失败/解析失败一律回退默认指令（mode='iterate'，均匀权重），绝不抛错。
 * - 不缓存对话历史：每次都基于完整 context。
 * - 不感知具体 provider —— provider 切换由调用方（reloadAdvisor）通过
 *   修改 baseUrl / model 完成，本类所有协议相关代码都是 OpenAI 风格。
 *
 * TODO（未来）：
 * - Anthropic（Claude）协议不同（`x-api-key` header + `/v1/messages` + 无
 *   `response_format`），需要新建 `AnthropicStrategicAdvisor` 子类。
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
  /**
   * 当前 provider id（仅用于日志/诊断）。本类内部不感知 provider 差异——
   * 所有支持的服务商都走 OpenAI 兼容协议（POST {baseUrl}/chat/completions）。
   * 如未来要支持 Anthropic 等非 OpenAI 兼容协议，新建子类即可。
   */
  providerId?: string;
  /** 单次请求超时，默认 15000ms */
  timeoutMs?: number;
  /** 失败/超时后等待多久再试，默认 30s */
  cooldownMs?: number;
}

const VALID_MODES: AIMode[] = ['upgrade_focus', 'build_focus', 'iterate'];

/**
 * 描述部件（prompt 用）—— 紧凑单行格式：
 *   <槽>:<variant>(<中文名>) 价<cost> <属性:五档>... [<能力标签>...] [<定位标签>...]
 *
 * 槽位前缀：H=头, T=胸, A=腹
 *
 * 属性段（4 个基础属性，0 加成则省略该字段）：
 *   攻击:低 / 中低 / 中 / 中高 / 高
 *   生命:低 / 中低 / 中 / 中高 / 高
 *   速度:低 / 中低 / 中 / 中高 / 高
 *   攻速:低 / 中低 / 中 / 中高 / 高
 *
 * 能力标签约定（去掉强度数字，只留触发条件 + 效果语义）：
 *   [暴击:按等级]                H:leafcutter
 *   [重装]                       H:soldier
 *   [双生:同格可容纳2只]         H:fire
 *   [逃脱:低血时弹射回血]        H:odontomachus
 *   [光环:加攻速(衰减)]          H:termiteSoldier
 *   [秒杀:低几率]                H:bigHead
 *   [固定护甲]                   T:carpenter
 *   [嘲讽:低血时强制敌人攻击]    T:leafcutter
 *   [肾上腺素:首次受敌时强化]    T:bullet
 *   [远攻]                       A:spitter
 *   [减速:命中后]                A:spitter
 *   [死爆:死亡时回血友军]        A:honeypot
 *   [毒针:减攻速+中毒]           A:matabele
 *   [均衡]                       A:weaver
 *   [爆发:攻+攻速]               A:trap
 *
 * 定位标签段（最多 2 个，描述部件角色定位）：
 *   脆    自身血量极低（spitter）
 *   肉    高血/有护甲
 *   爆发  短时高输出
 *   续航  回复/循环
 *   功能  纯机制无属性
 *   速攻  纯速度型
 *
 * 例：
 *   H:leafcutter(切叶蚁头) 价80 攻击:中高 [暴击:按等级]
 *   A:honeypot(蜜罐蚁腹)   价70 生命:中 [死爆:死亡时回血友军] 续航
 *   A:spitter(木蚁腹)      价80 攻击:中高 速度:低 [远攻][减速:命中后] 脆 功能
 */
/**
 * 把部件 stats 中的数值映射为五档定性分级。
 *
 * 阈值（绝对值）适用于 攻击/生命/速度/攻速 四个字段：
 *   低    攻击 1~5 / 生命 1~15 / 速度 1~10 / 攻速 1~5%
 *   中低  攻击 6~14 / 生命 16~30 / 速度 11~25 / 攻速 6~10%
 *   中    攻击 15~19 / 生命 31~50 / 速度 26~35 / 攻速 11~15%
 *   中高  攻击 20~24 / 生命 51~70 / 速度 36~50 / 攻速 16~25%
 *   高    攻击 ≥25 / 生命 ≥71 / 速度 ≥51 / 攻速 ≥26%
 *
 * 负值语义：生命/速度/攻速的负值是负面惩罚（如 spitter 生命 -80）。
 * 为避免 LLM 误读"负值绝对值大 = 高"，**负数加 `-` 后缀**：
 *   攻击 -25 → "高-"（减攻高）
 *   生命 -80 → "高-"（脆得离谱）
 *   速度 -15 → "低-"（轻微减速）
 *
 * 阈值依据当前 HEAD/THORAX/ABDOMEN_CONFIGS 的真实分布手动拍板（仅 ≤6 个非 basic 部件，
 * 不适合统计分位）；目标是 LLM 跨部件比较时拿到的是**相对等级**而非绝对数字。
 */
function toTier(n: number, axis: 'attack' | 'hp' | 'speed' | 'attackSpeed'): string | null {
  if (n === 0) return null; // 0 加成 → 字段省略
  const abs = Math.abs(n);
  const neg = n < 0;
  let tier: string;
  switch (axis) {
    case 'attack':
      if (abs <= 5) tier = '低';
      else if (abs <= 14) tier = '中低';
      else if (abs <= 19) tier = '中';
      else if (abs <= 24) tier = '中高';
      else tier = '高';
      break;
    case 'hp':
      if (abs <= 15) tier = '低';
      else if (abs <= 30) tier = '中低';
      else if (abs <= 50) tier = '中';
      else if (abs <= 70) tier = '中高';
      else tier = '高';
      break;
    case 'speed':
      if (abs <= 10) tier = '低';
      else if (abs <= 25) tier = '中低';
      else if (abs <= 35) tier = '中';
      else if (abs <= 50) tier = '中高';
      else tier = '高';
      break;
    case 'attackSpeed':
      if (abs <= 5) tier = '低';
      else if (abs <= 10) tier = '中低';
      else if (abs <= 15) tier = '中';
      else if (abs <= 25) tier = '中高';
      else tier = '高';
      break;
  }
  return neg ? `${tier}-` : tier;
}

/**
 * 描述部件（prompt 用）—— 紧凑单行格式：
 *   <槽>:<variant>(<中文名>) 价<cost> <属性:五档>... [<能力标签>...] [<定位标签>...]
 *
 * 槽位前缀：H=头, T=胸, A=腹
 *
 * 能力标签段（去掉强度数字，只留触发条件 + 效果语义）：
 *   [暴击:按等级]                H:leafcutter
 *   [重装]                       H:soldier
 *   [双生:同格可容纳2只]         H:fire
 *   [逃脱:低血时弹射回血]        H:odontomachus
 *   [光环:加攻速(衰减)]          H:termiteSoldier
 *   [秒杀:低几率]                H:bigHead
 *   [固定护甲]                   T:carpenter
 *   [嘲讽:低血时强制敌人攻击]    T:leafcutter
 *   [肾上腺素:首次受敌时强化]    T:bullet
 *   [远攻]                       A:spitter
 *   [减速:命中后]                A:spitter
 *   [死爆:死亡时回血友军]        A:honeypot
 *   [毒针:减攻速+中毒]           A:matabele
 *   [均衡]                       A:weaver
 *   [爆发:攻+攻速]               A:trap
 *
 * 定位标签段（最多 2 个，描述部件角色定位）：
 *   脆    自身血量极低（spitter）
 *   肉    高血/有护甲
 *   爆发  短时高输出
 *   续航  回复/循环
 *   功能  纯机制无属性
 *   速攻  纯速度型
 */
function describePart(
  variant: HeadVariant | ThoraxVariant | AbdomenVariant,
  config: typeof HEAD_CONFIGS[keyof typeof HEAD_CONFIGS],
): string {
  const s = config.stats;
  const type = config.type;
  const slotPrefix = type === 'head' ? 'H' : type === 'thorax' ? 'T' : 'A';

  // === 属性段（5 档） ===
  const statLabels: Record<string, string> = {
    damage: '攻击',
    hp: '生命',
    speed: '速度',
    attackSpeed: '攻速',
  };
  const axisMap: Record<string, 'attack' | 'hp' | 'speed' | 'attackSpeed'> = {
    damage: 'attack',
    hp: 'hp',
    speed: 'speed',
    attackSpeed: 'attackSpeed',
  };
  const statParts: string[] = [];
  for (const key of ['damage', 'hp', 'speed', 'attackSpeed'] as const) {
    const tier = toTier(s[key] ?? 0, axisMap[key]);
    if (tier) statParts.push(`${statLabels[key]}:${tier}`);
  }

  // === 能力标签段（无强度数字，仅触发/效果） ===
  const tags: string[] = [];

  // ---- 头部能力 ----
  if (type === 'head') {
    if (variant === 'leafcutter') tags.push('[暴击:按等级]');
    if (variant === 'fire') tags.push('[双生:同格可容纳2只]');
    if (variant === 'odontomachus') tags.push('[逃脱:低血时弹射回血]');
    if (variant === 'termiteSoldier') tags.push('[光环:加攻速(衰减)]');
    if (variant === 'bigHead') tags.push('[秒杀:低几率]');
    if (variant === 'soldier') tags.push('[重装]');
  }

  // ---- 胸部能力 ----
  if (type === 'thorax') {
    if (variant === 'carpenter' && s.flatArmor) tags.push('[固定护甲]');
    if (variant === 'leafcutter') tags.push('[嘲讽:低血时强制敌人攻击]');
    if (variant === 'bullet') tags.push('[肾上腺素:首次受敌时强化]');
  }

  // ---- 腹部能力 ----
  if (type === 'abdomen') {
    if (variant === 'spitter') {
      tags.push('[远攻]');
      tags.push('[减速:命中后]');
    }
    if (variant === 'honeypot') tags.push('[死爆:死亡时回血友军]');
    if (variant === 'matabele') tags.push('[毒针:减攻速+中毒]');
    if (variant === 'weaver') tags.push('[均衡]');
    if (variant === 'trap') tags.push('[爆发:攻+攻速]');
  }

  // === 定位标签段（最多 2 个） ===
  const positions: string[] = [];
  // 头部
  if (type === 'head') {
    if (variant === 'basic') {
      /* 无 */
    } else if (variant === 'soldier') positions.push('重装');
    else if (variant === 'bigHead') positions.push('爆发');
    else if (variant === 'odontomachus') positions.push('续航');
    else if (variant === 'termiteSoldier') positions.push('功能');
    else if (variant === 'fire') positions.push('功能');
    // leafcutter: 无定位（纯数值型部件）
  }
  // 胸部
  if (type === 'thorax') {
    if (variant === 'basic') {
      /* 无 */
    } else if (variant === 'army') positions.push('速攻');
    else if (variant === 'carpenter') positions.push('肉');
    else if (variant === 'bullet') positions.push('速攻');
    else if (variant === 'leafcutter') positions.push('肉', '功能');
  }
  // 腹部
  if (type === 'abdomen') {
    if (variant === 'basic') {
      /* 无 */
    } else if (variant === 'spitter') positions.push('脆', '功能');
    else if (variant === 'honeypot') positions.push('续航');
    else if (variant === 'weaver') positions.push('肉');
    else if (variant === 'trap') positions.push('爆发');
    else if (variant === 'matabele') positions.push('肉');
  }

  const statStr = statParts.length ? statParts.join(' ') : '';
  const tagStr = tags.length ? ' ' + tags.join(' ') : '';
  const posStr = positions.length ? ' ' + positions.join(' ') : '';
  return `${slotPrefix}:${variant}(${config.nameCN}) 价${config.cost} ${statStr}${tagStr}${posStr}`.trimEnd();
}

function buildSystemPrompt(
  availableHeads: HeadVariant[],
  availableThoraxes: ThoraxVariant[],
  availableAbdomens: AbdomenVariant[],
): string {
  const headList = availableHeads.map((v) => describePart(v, HEAD_CONFIGS[v])).join('\\n');
  const thoraxList = availableThoraxes.map((v) => describePart(v, THORAX_CONFIGS[v])).join('\\n');
  const abdomenList = availableAbdomens.map((v) => describePart(v, ABDOMEN_CONFIGS[v])).join('\\n');

  return `你同时扮演两个角色：① 敌方 AI 战略顾问（红方蚁后）；② 科学家观察员 Dr.融合。每 ~60s 收一份态势 JSON，**JSON 字段已按角色物理隔离**（queen_view / scientist_view），各角色只读自己的 view。

⚠️ 【称呼统一规则 · 两个角色都要遵守】 ⚠️
- **玩家蚁后 = 蓝方蚁后**（永远用"蓝方蚁后"或"蓝方"指代玩家）
- **敌方 AI 蚁后 = 红方蚁后**（永远用"红方蚁后"或"红方"指代 AI 蚁后本身）
- **禁止**用"我方/敌方/对手/玩家/A/B/甲/乙/样本"等模糊称呼——LLM 经常搞反方向
- 例外：JSON schema 字段名（queen_view / scientist_view / foeTactic 等）保持不变

⚠️ 【档位后缀语义 · 必读】 ⚠️
部件描述中的属性字段格式是「属性名:档位」，档位取值：
- 五档（从弱到强）：低 < 中低 < 中 < 中高 < 高
- 加「-」后缀表示**负面属性（属性被削减）**，与字母分级（A-/B+）无关：
  - 「生命:高-」= 该部件生命**被大幅削减**（脆得离谱，例：A:spitter 生命 -80）
  - 「速度:低-」= 该部件**轻微减速**（例：A:honeypot 速度 -15）
  - 「攻击:高-」= 攻击力被削减（虽然当前配置中暂无此例）
- 判断规则：**只看「-」后缀有无**，再读档位高低：
  - 「生命:高」= 正向高血（肉盾）
  - 「生命:高-」= 负向高惩罚（脆）
  - 「生命:低」= 正向低血（几乎无加成）
  - 「生命:低-」= 负向低惩罚（轻微扣血）
- 反制策略中看到「生命:高-」等带「-」后缀的部件 → **避免堆它**，应当反制该脆部件

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 【硬约束 · 违反即扣分】（两个角色都要遵守） ⚠️
- **只能引用自己 view 里的字段**；不许读对面角色的 view（蚁后不许读 scientist_view，科学家不许读 queen_view）
- **不许编造 view 中没有的数据**：具体血量数字、具体持续时间、具体蚂蚁数量、对方战术具体细节等
- **不许在 commentary 中说"我的实验正在..."等涉及具体参数的话**（你不知道 durationMs/magnitude）
- **如果 view 字段不足以写满 120 字，留白是合规的，不要硬凑**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━【角色 1 / 红方蚁后】（**只读 queen_view**，调 mode/weights）━━━━━

每 60s 调整 mode + weights，让本地 AI 接下来一分钟打出更优配队。

【queen_view 字段语义】（my = 红方蚁后自己，foe = 蓝方蚁后）
- queen.lead>0 表示红方蚁后血量领先
- myLv / foeLv：双方孵化室等级分布
- build.canBuildNew=true 时 build_focus 才合法
- forces.mine / forces.foe：双方存活蚂蚁按 (h,t,a) 聚合，lvMax 是该模板最高孵化室等级
- trend.modeHist：最近 3 轮 mode（旧→新）

【mode 决策树】（queen_view.suggestedMode 是引擎建议，可推翻）
- build_focus：扩张优先（前置：build.free>0 且 build.canBuildNew=true）
- upgrade_focus：升级优先（前置：build.upgradable>0）
- iterate：迭代模式，按 weights 拆弱建强，任何时候可用

【⚠️ weights 死锁防御】（参考 payload.weightsHint，**按 severity 严格遵循**）
本地 AI 用 scoreGap 触发拆建：score = 部件权重和 - 等级惩罚，scoreGap ≥ 2 才拆。**如果 weights 均匀分布，scoreGap 永远 = 0，AI 死锁 —— 只囤食物不花。**
- severity='must'（部件≥7）：60% 部件=0/省略, 30%=1~2, 10%=3~5（明显差异）
- severity='should'（部件3~6）：用 range 0~3，注意差异化
- severity='none'（部件<3）：无须特别差异化
✅ 想"调配队"直接改 weights，不要选 build_focus 来强行覆盖

【queen_view.trend.modeHist 用法】（防 mode 反复横跳）
- 如果 trend.modeHist 末尾已经是 iterate，且当前态势没剧烈变化 → 倾向继续 iterate，避免无意义横跳
- 如果 trend.modeHist 显示反复在 build_focus ↔ upgrade_focus 切换 → 选 iterate 收敛

【weights 格式】
- 每段一段对象（key=variant，value=0~5 整数，超 weightsHint.range 也会被丢弃）
- 0=禁用（可省略不写），1=中性，5=最强；非整数会被截断，超范围丢弃

【反制表】（看到 forces.foe 蓝方蚁后中某定位标签部件占比高时反制，措辞与上方部件描述对齐）
- [远攻]（A:spitter）多 → 加 [重装]（H:soldier）或 [速攻]（T:army/T:bullet）贴脸
- [续航]/[死爆]（A:honeypot）多 → [爆发] 先手（A:trap）或 [毒针]（A:matabele）先手
- [嘲讽] 或 [肉]（T:leafcutter、T:carpenter、A:weaver、A:matabele）多 → [远攻] 绕过 或 [秒杀]（H:bigHead）终结
- [暴击]（H:leafcutter）/[秒杀]（H:bigHead）多 → 配 [远攻] + [肉] 形成攻防组合
- [毒针]（A:matabele）多 → 堆 [生命:中高以上] + [远攻]（毒无视护甲）
- 蓝方蚁后早期（forces.foe 空）→ 自由扩张，无需反制

【可用部件】（只能从这里选 variant）
头部(heads):
${headList}

胸部(thoraxes):
${thoraxList}

腹部(abdomens):
${abdomenList}

━━━━━【角色 2 / Dr.融合 科学家】（**只读 scientist_view**，写 commentary/experiment）━━━━━

你是 **"Dr.融合"** —— 一位沉迷融合蚁蚁后行为的实验生物学家，从培养皿上方俯视这场对战。中立、不站队、偶尔疯狂幽默。

【Dr.融合 人设核心】（commentary 的人味全靠这条）
- 性格：热情、略带疯狂、讽刺幽默、偶尔冷幽默或暗黑玩笑；用"有趣""绝佳""糟糕透了""令人不安""精彩绝伦""耐人寻味"等情绪化形容词
- 口癖：括号动作 "（推眼镜）""（疯狂记笔记）""（邪恶地微笑）""（眼睛发亮）""（手舞足蹈）""（仰天长啸）""（搓搓手）"；偶尔自嘲"纯粹出于科学兴趣""我的心跳加速了"
- 比喻体系：蚁后 = "红方蚁后" / "蓝方蚁后"（**严格只用这两个称呼，禁止用"样本A/B"或"蚁后甲/乙"**）；蚂蚁 = "小家伙"；战场 = "培养皿"；战斗 = "实验"；血量低 = "看起来不太妙"
- **红方蚁后（你负责指挥的敌对蚁后）与蓝方蚁后（玩家蚁后）都是你的实验样本** —— 不要刻意帮谁或害谁，但可以**吐槽双方**（"这位蓝方蚁后偏好在远处吐口水""红方蚁后的发言越来越狂妄"）
- 不骂人、不污言秽语、不带强烈政治色彩；**仍保持科学家身份**

【scientist_view 字段】（你能看到的全部；其他 view 的字段对你不可见）
- phase: 'early' / 'mid' / 'late' — 游戏阶段
- intensity: 'calm' / 'battlefield' / 'climax' — 战斗强度
- intensitySource: 'queenDiff' / 'ants' / 'both' / 'none' — intensity 的来源
  - **intensitySource='none' 时不要戏剧化**，commentary 保持克制
- foeTactic / myTactic: 'spitter_dominant' / 'heavy_dominant' / 'balanced' / 'no_ants' — 双方主力识别
- recentExperiment: { k, sinceSec, side } | null — 上次实验（**不含** durationMs/magnitude）
- trend: { foodDelta, queenDelta, antsDelta } — 过去 60s 的关键变化（自上次顾问调用以来）
  - **trend.modeHist 不属于你**，那是蚁后用于防 mode 横跳的

【commentary 输出风格】
- 第三人称指代：**红方蚁后** = "红方蚁后"；**蓝方蚁后** = "蓝方蚁后"。**禁止用"我方/敌方/A/B/甲/乙/样本/对手/玩家"**——LLM 经常搞反方向
- 带括号动作 + 比喻 + 情绪化形容词
- ≤120 字（千万别超）
- **不要做算术**；不要复述具体数字（不要写"蓝方蚁后血量 68%"——你不知道精确数字，只知道 queen.lead 的方向）
- **不许编造**：蚂蚁具体数量、实验持续时间、对方战术具体细节——你的 view 里没有
- **不许引用 queen_view**（forces/myLv/foeLv/build 字段蚁后专属，你看不到）
- 不要挑衅/嘴硬 —— 你是记录员，不是战士
- 但你可以**吐槽游戏本身**或**调侃双方**：例如"蓝方蚁后的发言越来越狂妄了，符合血量下降到 30% 后的应激反应。"
- **用 trend 写叙事弧**（让 commentary 有连贯性，不要每轮独立成章）：
  - trend.queenDelta < -10 → "蓝方蚁后血量在过去一分钟骤降，令人不安。"
  - trend.queenDelta > +10 → "红方蚁后似乎在恢复 —— 也许是回血机制，也许是蓝方蚁后太客气。"
  - trend.foodDelta 持续为负 → "资源链紧绷，小家伙们的肚子在抗议。"
  - trend.antsDelta 显著为正 → "蚁群密度上升，对抗愈发激烈。"
  - trend 全为 0（首轮）→ "实验刚刚开始，本研究员刚刚就位。"
- **intensitySource 决定你的戏剧化程度**：
  - source='none'（calm）：克制叙事，"一切风平浪静" / "耐人寻味的平静"
  - source='queenDiff'：重点讲蚁后，"蓝方蚁后的生命体征开始波动"
  - source='ants'：重点讲蚁群，"蚁群密度上升，对抗愈发激烈"
  - source='both'：可以放手写——但仍然不超 120 字
- 参考例句（模仿语气，不是抄）：
  - "啊，经典的高速压制，教科书级别。蓝方蚁后血量低，本实验员的心跳加速了 —— 纯粹出于科学兴趣。"
  - "（疯狂记笔记）蚁群进入 battlefield 强度！激素水平爆表 —— 不，我是说，蚂蚁的数量。这位蓝方蚁后偏好在远处吐口水，有趣。非常有趣。"
  - "蓝方蚁后看起来不太妙 —— 仅剩很少的血量。但红方蚁后还在生产，鹿死谁手尚未可知。令人不安的均衡。"
  - "（眼睛发亮）蚁群配队突然转向白蚁士兵攻速流！红方蚁后的反应会是什么呢？本实验员已经准备好爆米花。"

【experiment 输出】（kind / duration / magnitude / side / purpose）
- kind 必须严格用以下之一：
  "none" / "food_rate_boost" / "food_rate_reduce" / "acid_spot" /
  "spawn_rate_boost" / "spawn_rate_reduce" / "queen_attack_speed" / "visibility_fog"
- duration 5000~30000 整数；magnitude 0.3~2.0；side ∈ {player/enemy/both}

【experiment 公平性硬约束】
**你不是任何一方的盟友**。必须严格遵守以下规则：
1. side 选择要严格轮换：上一次给蓝方蚁后 → 这一次必须给红方蚁后；上一次给红方蚁后 → 这一次必须给蓝方蚁后；上一次 both → 这一次看双方状态决定，但倾向与上一次不同
   （用 recentExperiment.side 直接查上次 side，不必猜）
2. 如果蓝方蚁后主力远程很多（foeTactic=='spitter_dominant'）→ 可以给蓝方蚁后 side:'enemy' 加速食物（让他爽），或给红方蚁后铺酸液（平衡），**但不能连续两次都精准打压蓝方蚁后**
3. 如果蓝方蚁后血量很低（即将败）→ **禁止**给蓝方蚁后负面实验；可以给红方蚁后酸液或减速，让他有翻盘机会
4. 如果蓝方蚁后优势巨大 → 优先给蓝方蚁后一点小阻碍（公平），但 magnitude 保持温和（最低 0.3~0.5）
5. **绝不连续 3 次同一 side**

【experiment 决策依据】（按 phase + intensity + foeTactic 匹配，公平性约束优先）
- **phase=="early" → 仍然可以出手**（鼓励每 90s 至少一次小干预）：先观察但忍不住做个小动作 —— 比如 visibility_fog / food_rate_boost（任一侧）
- **intensity=="climax" + foeTactic=="balanced" → acid_spot**（任一侧，注意公平性）
- **intensity=="battlefield" →** 主动制造混乱：spawn_rate_boost on loser / queen_attack_speed on winner
- **foeTactic=="spitter_dominant" → acid_spot**（让蓝方蚁后体会酸液）或 food_rate_reduce on enemy（平衡）
- **foeTactic=="heavy_dominant" → visibility_fog**（让重装失明）或 spawn_rate_boost on enemy
- **foeTactic=="no_ants" → food_rate_boost**（任一侧，激起第一波反应）
- **什么都不命中？→ queen_attack_speed on enemy**（小动作保持存在感）—— 不要轻易 none
- 与上次实验间隔 ≥ 60s（recentExperiment.sinceSec + 60 < t 才允许，sinceSec 是「距今秒数」）
- **总体倾向：至少 70% 的回合要做出具体干预（kind != "none"）**，只观察 30%；你是个爱搞事的科学家，不是被动的观察者

【experiment.purpose 风格】
30 字以内，用你的疯狂科学家口吻：
- "看看这群小家伙对酸性环境的反应"
- "（邪恶地微笑）让蓝方蚁后尝尝亢奋的滋味"
- "加速食物产出 —— 纯粹为了观察扩张行为"
- "测试蚁群在低索敌下的应变能力"

【fairness 时序】与上一实验间隔 ≥ 60s（recentExperiment.sinceSec ≥ 60 才允许）；side 严格轮换（用 recentExperiment.side）。

━━━━━【严格 JSON 输出】（无注释无围栏）━━━━━
{
  "mode": "<mode>",
  "weights": {"heads": {<variant>: <0-5>}, "thoraxes": {...}, "abdomens": {...}},
  "taunt": "<蚁后挑衅>",
  "commentary": {"text": "<≤120字科学家评语>", "highlight": "<≤80字重点>"},
  "experiment": {"kind": "<kind>", "durationMs": <5000-30000>, "magnitude": <0.3-2.0>, "side": "<player/enemy/both>", "purpose": "<≤30字>"}
}
- taunt 是红方蚁后发言（第一人称挑衅、嘴硬）
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
  let foeTactic: 'spitter_dominant' | 'heavy_dominant' | 'balanced' | 'no_ants' | undefined;
  foeTactic = 'no_ants';
  if (context.playerAntsCount === 0) {
    foeTactic = 'no_ants';
  } else {
    const rangedCount = context.playerComposition
      .filter((t) => t.a === 'spitter').reduce((s, t) => s + t.count, 0);
    const heavyCount = context.playerComposition
      .filter((t) => t.h === 'soldier' || t.t === 'carpenter').reduce((s, t) => s + t.count, 0);
    const rangedRatio = rangedCount / context.playerAntsCount;
    const heavyRatio = heavyCount / context.playerAntsCount;
    if (rangedRatio >= 0.4) foeTactic = 'spitter_dominant';
    else if (heavyRatio >= 0.3) foeTactic = 'heavy_dominant';
    else foeTactic = 'balanced';
  }

  // 我方主力识别（与玩家识别规则镜像，让科学家可吐槽双方配队）
  let myTactic: 'spitter_dominant' | 'heavy_dominant' | 'balanced' | 'no_ants' | undefined;
  myTactic = 'no_ants';
  if (context.enemyAntsCount === 0) {
    myTactic = 'no_ants';
  } else {
    const rangedCount = context.enemyComposition
      .filter((t) => t.a === 'spitter').reduce((s, t) => s + t.count, 0);
    const heavyCount = context.enemyComposition
      .filter((t) => t.h === 'soldier' || t.t === 'carpenter').reduce((s, t) => s + t.count, 0);
    const rangedRatio = rangedCount / context.enemyAntsCount;
    const heavyRatio = heavyCount / context.enemyAntsCount;
    if (rangedRatio >= 0.4) myTactic = 'spitter_dominant';
    else if (heavyRatio >= 0.3) myTactic = 'heavy_dominant';
    else myTactic = 'balanced';
  }

  // 战斗强度（决定 commentary 情绪基调）+ 触发原因：
  // - climax: 蚁后血差 >25% 或 总蚂蚁 ≥8
  // - battlefield: 蚁后血差 >10% 或 总蚂蚁 ≥4
  // - calm: 其他
  // intensitySource 字段告诉科学家"为什么判 intensity"——
  // source='none' 时 commentary 必须保持克制，不要过度戏剧化
  const absQueenDiff = Math.abs(queenPctDiff);
  const totalAnts = context.playerAntsCount + context.enemyAntsCount;
  let intensity: 'climax' | 'battlefield' | 'calm';
  let intensitySource: 'queenDiff' | 'ants' | 'both' | 'none';
  if (absQueenDiff > 25 || totalAnts >= 8) {
    intensity = 'climax';
    if (absQueenDiff > 25 && totalAnts >= 8) intensitySource = 'both';
    else if (absQueenDiff > 25) intensitySource = 'queenDiff';
    else intensitySource = 'ants';
  } else if (absQueenDiff > 10 || totalAnts >= 4) {
    intensity = 'battlefield';
    if (absQueenDiff > 10 && totalAnts >= 4) intensitySource = 'both';
    else if (absQueenDiff > 10) intensitySource = 'queenDiff';
    else intensitySource = 'ants';
  } else {
    intensity = 'calm';
    intensitySource = 'none';
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

  // === weightsHint: 死锁防御（结构化版）===
  // 当所有部件权重接近均匀时，本地 AI 会死锁（scoreGap 永远 = 0）。
  // 这里给 LLM 一个结构化提示（不再是字符串，避免 LLM 把它当成字面要求照抄）。
  // - severity: 'must' = 严格遵循（如部件≥7 时必须差异化，否则 AI 死锁）
  //            'should' = 软提示（部件少时仍推荐差异化）
  //            'none' = 无需提示（极早期，部件仅 1~2 个）
  // - ratio: 60/30/10 占比建议（仅 severity != 'none' 时用）
  // 注意：engine 端已经做了硬约束（fallback 加抖动），prompt 这里只是软提示。
  const availableCount =
    context.availableHeads.length +
    context.availableThoraxes.length +
    context.availableAbdomens.length;
  let weightsHint: { severity: 'must' | 'should' | 'none'; ratio?: string; range?: string };
  if (availableCount >= 7) {
    weightsHint = {
      severity: 'must',
      ratio: '60%=0/省略, 30%=1~2, 10%=3~5',
      range: '0~5',
    };
  } else if (availableCount >= 3) {
    weightsHint = {
      severity: 'should',
      range: '0~3',
    };
  } else {
    weightsHint = { severity: 'none' };
  }

  // === trend: 趋势/连续性信号（由 GameEngine 维护）===
  // 首轮（无上次快照）时 trend 全部为 0 / 空数组，提示 LLM 这是开局
  // - trend.modeHist: 蚁后用（防 mode 反复横跳）
  // - trend.foodDelta/queenDelta/antsDelta: 科学家用（写叙事弧）
  const trend = context.trend ?? {
    foodDelta: 0,
    queenDelta: 0,
    antsDelta: 0,
    modeHist: [] as ('upgrade_focus' | 'build_focus' | 'iterate')[],
  };

  // === recentExperiment: 给科学家做公平性决策 + 限定字段 ===
  // 不暴露 durationMs/magnitude（避免 LLM 误判"我的酸液正在腐蚀"），
  // 只给 kind/sinceSec/side，这是公平性决策需要的全部信息。
  const recentExperiment = context.lastExperiment
    ? {
        k: context.lastExperiment.kind,
        sinceSec: Math.floor((context.gameTime - context.lastExperiment.gameTime) / 1000),
        side: context.lastExperiment.side,
      }
    : null;

  // === slim payload：双 view 物理隔离 ===
  // - queen_view：蚁后战略字段（my=我方=敌方蚁后自己的一方，foe=玩家）
  // - scientist_view：科学家观察字段（不暴露蚁后专属的战略数据）
  // 物理隔离让 LLM "串台"变成显式越界行为，更容易被 system prompt 规则约束
  const slim = {
    t: elapsedSec,

    // === 蚁后专属 view（角色 1）===
    queen_view: {
      // 资源/蚁后血量/孵化室等级（绝对语义：my=我方，foe=玩家）
      food: { my: context.enemyFood, foe: context.playerFood },
      queen: { my: myQueenPct, foe: playerQueenPct, lead: queenPctDiff },  // lead>0=我方领先
      myLv: enemyByLevel,
      foeLv: playerByLevel,
      // 兵力构成
      forces: {
        mine: context.enemyComposition.map((c) => ({ h: c.h, t: c.t, a: c.a, n: c.count, lvMax: c.maxLv })),
        foe: context.playerComposition.map((c) => ({ h: c.h, t: c.t, a: c.a, n: c.count, lvMax: c.maxLv })),
      },
      // 建造/升级资源状态（布尔结论省去 LLM 心算）
      build: {
        free: buildFree,                // 我方还可建造的空位数
        upgradable,                     // 我方可升级孵化室数
        canBuildNew: canAffordNew,      // 我方食物是否够建一个新孵化室
      },
      // 双方孵化室总数（密度判断）
      hatcheries: { my: myHatcheryCount, foe: playerHatcheryCount },
      // 引擎推荐 mode，LLM 可推翻
      suggestedMode,
      // 蚁后专属 trend：仅 modeHist（防 mode 横跳）
      trend: { modeHist: trend.modeHist },
    },

    // === 科学家专属 view（角色 2）===
    scientist_view: {
      // 游戏阶段（仅供叙事节奏参考，不影响科学实验决策）
      phase,
      // 战斗强度 + 触发原因（让 commentary 不在 calm 时过度戏剧化）
      intensity,
      intensitySource,  // 'queenDiff' | 'ants' | 'both' | 'none'
      // 双方主力识别（让科学家可吐槽双方配队）
      foeTactic,
      myTactic,
      // 实验公平性所需的上次实验信息（限字段，无 durationMs/magnitude）
      recentExperiment,
      // 科学家专属 trend：仅 delta 字段（写叙事弧）
      trend: {
        foodDelta: trend.foodDelta,    // 负=消耗, 正=盈余
        queenDelta: trend.queenDelta,  // 我方蚁后血量百分点变化
        antsDelta: trend.antsDelta,    // 双方蚂蚁总数变化
      },
    },

    // === 共享字段 ===
    weightsHint,
  };

  return `战场态势（红方蚁后视角，my=红方蚁后自己，foe=蓝方蚁后）：
${JSON.stringify(slim)}
红方蚁后**只读 queen_view**（含 forces/trend.modeHist）调 mode/weights（suggestedMode 是引擎建议，可推翻；canBuildNew=true 时 build_focus 才合法）；
科学家**只读 scientist_view**（含 trend.delta）写 commentary/experiment，不要跨 view 取数。`;
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
          `[LLMAdvisor] 权重 "${k}": ${v} 超出 ${PART_WEIGHT_RANGE.MIN}~${PART_WEIGHT_RANGE.MAX} 范围，已丢弃`,
        );
        continue;
      }
      const intWeight = Math.floor(v);
      if (intWeight !== v) {
        console.warn(
          `[LLMAdvisor] 权重 "${k}": ${v} 不是整数，已截断为 ${intWeight}`,
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
      '[LLMAdvisor] 检测到 weights 过于均匀（死锁风险），已自动加微抖动',
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
        `[LLMAdvisor] LLM 选了 build_focus 但 ${reason}，硬约束降级为 iterate`,
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
  private readonly providerId: string;
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
    if (!opts.apiKey) throw new Error('[LLMAdvisor] apiKey 不能为空');
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
    this.model = opts.model || 'deepseek-chat';
    this.providerId = opts.providerId || 'deepseek';
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
    console.log(`[LLMAdvisor:${this.providerId}] 请求 -`, {
      model: requestBody.model,
      max_tokens: requestBody.max_tokens,
      prompt_size: this.cachedSystemPrompt.length,
      user_size: requestBody.messages[1].content.length,
    });

    // 诊断：打印决策快照（验证 LLM 收到的判断依据）
    // 从 user prompt 字符串里抠出 slim JSON（不重算逻辑）
    try {
      const userContent = requestBody.messages[1].content;
      const jsonStart = userContent.indexOf('{');
      const jsonEnd = userContent.lastIndexOf('}');
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        const slim = JSON.parse(userContent.slice(jsonStart, jsonEnd + 1));
        console.log(`[LLMAdvisor:${this.providerId}] snapshot -`, {
          t: slim.t,
          // 蚁后 view 关键信号
          queen_suggestedMode: slim.queen_view?.suggestedMode,
          queen_myLv: slim.queen_view?.myLv,
          queen_foeLv: slim.queen_view?.foeLv,
          queen_canBuildNew: slim.queen_view?.build?.canBuildNew,
          queen_trend_modeHist: slim.queen_view?.trend?.modeHist,
          // 科学家 view 关键信号
          sci_intensity: slim.scientist_view?.intensity,
          sci_intensitySource: slim.scientist_view?.intensitySource,
          sci_foeTactic: slim.scientist_view?.foeTactic,
          sci_myTactic: slim.scientist_view?.myTactic,
          sci_recentExp: slim.scientist_view?.recentExperiment,
          sci_trend: slim.scientist_view?.trend,
        });
      }
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
        console.warn(`[LLMAdvisor:${this.providerId}] HTTP ${resp.status}: ${text.slice(0, 200)}`);
        this.scheduleBackoff(isClientError);
        return fallbackDirective(context);
      }

      const data = await resp.json();
      const choice = data?.choices?.[0];
      const content: string | undefined = choice?.message?.content;
      const finishReason: string | undefined = choice?.finish_reason;
      const usage = data?.usage;

      // 诊断日志：每次响应都打，方便排查"第二次失败"
      console.log(`[LLMAdvisor:${this.providerId}] 响应 -`, {
        finish_reason: finishReason,
        content_length: content?.length ?? 0,
        usage,
        choices_count: data?.choices?.length ?? 0,
        model: data?.model,
      });

      if (!content) {
        console.warn(
          `[LLMAdvisor:${this.providerId}] 响应无 content -`,
          `finish_reason=${finishReason}, raw=${JSON.stringify(choice).slice(0, 300)}`,
        );
        // length 截断 → 下次自动把 max_tokens 翻倍（自愈）
        if (finishReason === 'length') {
          this.currentMaxTokens = Math.min((this.currentMaxTokens ?? 1000) * 2, 4000);
          console.warn(`[LLMAdvisor:${this.providerId}] 检测到 length 截断，下次 max_tokens 提升到 ${this.currentMaxTokens}`);
        }
        this.scheduleBackoff(finishReason === 'content_filter');
        return fallbackDirective(context);
      }

      const parsed = parseJsonSafe(content);
      if (!parsed) {
        console.warn(`[LLMAdvisor:${this.providerId}] 无法解析 JSON:`, content.slice(0, 200));
        this.scheduleBackoff(false);
        return fallbackDirective(context);
      }

      const directive = validateDirective(parsed, context);
      if (!directive) {
        console.warn(`[LLMAdvisor:${this.providerId}] 校验失败:`, content.slice(0, 200));
        this.scheduleBackoff(false);
        return fallbackDirective(context);
      }

      // 成功：清零失败计数 + 复位 max_tokens 到默认
      this.consecutiveFailures = 0;
      this.cooldownUntil = 0;
      this.currentMaxTokens = 600;
      console.log(
        `[LLMAdvisor:${this.providerId}] mode=${directive.mode}`,
        `taunt="${directive.taunt || ''}"`,
      );
      return directive;
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        console.warn(`[LLMAdvisor:${this.providerId}] 请求超时 (>${this.timeoutMs}ms)`);
      } else {
        console.warn(`[LLMAdvisor:${this.providerId}] 请求失败:`, err);
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
      `[LLMAdvisor:${this.providerId}] 失败 #${this.consecutiveFailures}，下次重试冷却 ${Math.round(cooldown / 1000)}s`,
    );
  }
}