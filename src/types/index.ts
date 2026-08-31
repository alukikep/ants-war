/**
 * 融合蚁大战 - 核心类型定义
 * 设计为可扩展架构，便于后续接入 LLM API 分析
 */

// 阵营类型
export type Side = 'player' | 'enemy';

// ============================================
// Buff 系统
// ============================================

// Buff 类型
export type BuffType =
  | 'slow'           // 减速
  | 'poison'         // 中毒（持续伤害）
  | 'attackSpeedUp'  // 攻速提升
  | 'attackSpeedDown'// 攻速降低
  | 'damageUp'       // 伤害提升
  | 'damageDown'     // 伤害降低
  | 'speedUp'        // 加速
  | 'armor';         // 护甲（减少受到的伤害百分比）

// Buff 实例
export interface Buff {
  id: string;              // 唯一标识
  type: BuffType;          // Buff 类型
  value: number;           // 效果值（百分比，如 0.2 = 20%）
  duration: number;        // 剩余持续时间 (ms)
  maxDuration: number;     // 最大持续时间 (ms)
  sourceId?: string;       // 来源蚂蚁ID（可选）
  stackable: boolean;      // 是否可叠加
  tickDamage?: number;     // 每秒伤害（用于中毒等）
}

// 蚂蚁部位类型
export type PartType = 'head' | 'thorax' | 'abdomen';

// 蚂蚁部位变种
export type HeadVariant = 'basic' | 'leafcutter' | 'soldier' | 'fire' | 'odontomachus' | 'termiteSoldier' | 'bigHead';
export type ThoraxVariant = 'basic' | 'army' | 'carpenter' | 'bullet' | 'leafcutter';
export type AbdomenVariant = 'basic' | 'honeypot' | 'weaver' | 'trap' | 'spitter' | 'matabele';  // spitter = 木蚁腹（喷酸），matabele = 马塔贝勒蚁腹（尾针）

// 部位配置
export interface PartConfig {
  id: string;
  name: string;
  nameCN: string;
  type: PartType;
  variant: HeadVariant | ThoraxVariant | AbdomenVariant;
  // 基础属性加成
  stats: {
    damage: number;      // 攻击力加成
    hp: number;          // 生命值加成
    speed: number;       // 移速加成
    attackSpeed: number; // 攻速加成 (攻击间隔减少比例)
    flatArmor?: number;  // 固定护甲（受到的伤害减去此值，最小为1）
  };
  // 描述，用于 LLM 分析
  description: string;
  // 解锁需要的资源
  cost: number;
}

// 蚂蚁部件组合
export interface AntParts {
  head: PartConfig;
  thorax: PartConfig;
  abdomen: PartConfig;
}

// 蚂蚁实体
export interface Ant {
  id: string;
  side: Side;

  // 战斗属性
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  attackSpeed: number;
  attackCooldown: number; // 当前攻击冷却

  // 远程攻击属性
  isRanged: boolean;          // 是否为远程单位（木蚁腹部）
  rangedDamage: number;       // 远程伤害（头部攻击力30%加成）
  attackRange: number;        // 攻击范围（远程时为射程）

  // 位置信息
  position: {
    x: number;
    y: number;
  };

  // 状态: moving=向敌方基地前进, chasing=追击目标, fighting=战斗中, dead=死亡, shooting=远程射击中
  state: 'moving' | 'chasing' | 'fighting' | 'dead' | 'shooting';
  targetId: string | null;

  // 来源孵化室ID（用于追踪孵化室的蚂蚁数量）
  hatcheryId: string;

  // 朝向角度 (弧度，用于渲染)
  rotation: number;

  // 组成部件 (用于 LLM 分析和视觉渲染)
  parts: AntParts;

  // 元数据 (用于 AI 分析)
  metadata?: {
    spawnTime: number;
    killCount: number;
    damageDealt: number;
    damageTaken: number;
  };

  // 特殊能力相关属性（大齿猛蚁头部）
  hasEscapeAbility: boolean;        // 是否拥有弹射逃脱能力
  escapeAbilityCooldown: number;    // 逃脱能力冷却时间 (ms)
  hasUsedEscapeAbility: boolean;    // 是否已使用过逃脱能力（第一次无冷却）

  // Buff 系统
  buffs: Buff[];                    // 当前生效的 Buff 列表

  // 来源孵化室等级（用于计算特殊效果）
  sourceLevel: number;              // 1-3级

  // 白蚁大兵头部攻速光环
  hasAttackSpeedAura: boolean;      // 是否拥有攻速光环能力
  attackSpeedBonus: number;         // 当前攻速加成（百分比，如 1.5 = 150%加速）

  // 马塔贝勒蚁腹尾针技能
  hasStingerAbility: boolean;       // 是否拥有尾针技能
  stingerCooldown: number;          // 尾针技能冷却时间 (ms)

  // 切叶蚁胸嘲讽技能
  hasTauntAbility: boolean;         // 是否拥有嘲讽技能
  tauntCooldown: number;            // 嘲讽技能冷却时间 (ms)
  baseArmor: number;                // 基础护甲（百分比，0.2 = 20%）
  flatArmor: number;               // 固定护甲（受到的伤害减去此值，最小为1）

  // 蜜罐蚁腹死亡爆炸回复
  hasHoneypotExplosion: boolean;    // 是否拥有死亡爆炸回复能力

  // 大头蚁头部秒杀技能
  hasInstantKill: boolean;          // 是否拥有秒杀能力
  isBeingExecuted?: boolean;        // 是否正在被秒杀（用于动画）
  executedBy?: string;              // 被哪只蚂蚁秒杀（执行者ID）
  isExecuting?: boolean;            // 是否正在执行秒杀动画（执行者无敌）

  // 火蚁头部特殊能力：允许同网格多容纳一只
  allowsStacked?: boolean;         // 是否允许同网格多容纳一只

  // 切叶蚁头部暴击能力
  critChance: number;              // 暴击率 (0-1之间，如0.15=15%暴击率)

  // 子弹蚁胸肾上腺素技能
  hasAdrenaline: boolean;          // 是否拥有肾上腺素技能
  adrenalineCooldown: number;      // 肾上腺素冷却时间 (ms)
  hasUsedAdrenaline: boolean;      // 是否已使用过肾上腺素（第一次触发后进入冷却）
}

// 远程子弹/投射物
export interface Projectile {
  id: string;
  side: Side;
  ownerId: string;            // 发射者蚂蚁ID
  targetId: string;           // 目标蚂蚁ID
  damage: number;             // 伤害值
  speed: number;              // 飞行速度
  position: { x: number; y: number };
  rotation: number;           // 飞行方向（弧度）
  // Buff 附加效果
  slowEffect?: {              // 减速效果（木蚁腹）
    value: number;            // 减速百分比 (0.2 = 20%)
    duration: number;         // 持续时间 (ms)
  };
  // 蚁后子弹标记（用于渲染区分）
  isQueenProjectile?: boolean;
}

// 蚁后/基地
export interface Queen {
  side: Side;
  hp: number;
  maxHp: number;
  position: {
    x: number;
    y: number;
  };
}

// 游戏配置
export interface GameConfig {
  mapWidth: number;
  mapHeight: number;
  spawnInterval: number;      // 孵化室生产间隔 (ms)
  collisionDistance: number;  // 攻击距离（开始战斗的距离）
  detectionRange: number;     // 索敌范围（检测到敌人的距离）
  queenDamage: number;        // 蚂蚁对蚁后的伤害
  baseAttackInterval: number; // 基础攻击间隔 (ms)
  foodInterval: number;       // 食物生成间隔 (ms)
  foodPerInterval: number;    // 每次生成的食物数量
  gridSize: number;           // 建造格子大小
  gridCols: number;           // 建造区域列数
  gridRows: number;           // 建造区域行数
  baseHatcheryCost: number;   // 基础孵化室建造成本
  maxAntsPerHatchery: number; // 每个孵化室最大存活蚂蚁数
  maxHatcheryLevel: number;   // 孵化室最高等级
  upgradeStatBonus: number;   // 每级属性加成比例 (0.5 = 50%)
  demolishRefundRate: number; // 拆除返还比例 (0.5 = 50%)
  tugOfWarFoodBonus: number;  // 拔河优势额外食物加成
  antCollisionRadius: number; // 蚂蚁碰撞半径 (px)
}

// 建造格子位置
export interface GridPosition {
  col: number;
  row: number;
}

// 孵化室
export interface Hatchery {
  id: string;
  side: Side;
  gridPos: GridPosition;      // 格子位置
  position: { x: number; y: number }; // 实际像素位置
  template: AntTemplate;      // 该孵化室生产的蚂蚁模板
  spawnCooldown: number;      // 当前生产冷却
  cost: number;               // 建造该孵化室花费的资源（基础成本）
  level: number;              // 当前等级 (1-3)
  totalInvested: number;      // 总投入资源（用于计算返还）
}

// 玩家配置的当前蚂蚁模板
export interface AntTemplate {
  head: HeadVariant;
  thorax: ThoraxVariant;
  abdomen: AbdomenVariant;
}

// 游戏状态
export interface GameState {
  // 游戏状态
  status: 'idle' | 'playing' | 'paused' | 'victory' | 'defeat';

  // 难度
  difficulty: 'normal' | 'hard' | 'extreme';

  // 资源
  playerFood: number;
  enemyFood: number;

  // 蚁后
  playerQueen: Queen;
  enemyQueen: Queen;

  // 蚂蚁列表
  ants: Ant[];

  // 远程子弹列表
  projectiles: Projectile[];

  // 孵化室列表
  hatcheries: Hatchery[];

  // 玩家当前配置的蚂蚁模板（用于新建孵化室）
  playerTemplate: AntTemplate;
  enemyTemplate: AntTemplate;

  // 游戏配置
  config: GameConfig;

  // 统计数据 (用于 LLM 分析)
  stats: {
    playerAntsSpawned: number;
    enemyAntsSpawned: number;
    playerAntsKilled: number;
    enemyAntsKilled: number;
    playerHatcheriesBuilt: number;
    enemyHatcheriesBuilt: number;
    gameTime: number;
  };

  // 部件解锁系统
  playerUnlockedParts: UnlockedParts;
  enemyUnlockedParts: UnlockedParts;
  unlockNotifications: UnlockNotification[];

  // AI 垃圾话系统
  aiTrashTalk: string;           // 当前显示的垃圾话内容
  aiTrashTalkTime: number;       // 垃圾话设置时间（用于控制显示/淡出）

  // 科学家观察系统（与蚁后发言共用同一个 LLM 调用，但视角不同）
  scientificCommentary: string;        // 当前显示的科学家评语
  scientificCommentaryTime: number;    // 评语设置时间

  // 科学家"实验性干预"——当前生效中的实验（null = 无）
  activeExperiment: ActiveExperiment | null;
  // 上一次已结束的实验（用于下一轮 LLM 决策时参考，避免重复同样的干预）
  lastExperiment: ExperimentRecord | null;

  // 酸液场地列表（acid_spot 实验产生的临时毒场，可叠加）
  acidSpots: AcidSpot[];
}

// 科学家实验：当前正在生效中的干预
export interface ActiveExperiment {
  kind: import('../config/experiments').ExperimentKind;
  side: import('../config/experiments').ExperimentSide;
  magnitude: number;       // 强度（语义取决于 kind）
  /** 绝对结束时间 — **游戏时间戳**（stats.gameTime，ms），用于引擎判断是否过期
   *  采用游戏时间而非 performance.now()：暂停时自动冻结，3x 速下按真实时间的 1/3 推进。 */
  endsAt: number;
  purpose: string;         // 实验目的（一句话，由 LLM 提供）
  /** 由谁注入（'scientist' | 'system'），方便未来扩展 */
  source: string;
}

// 科学家实验：已结束的历史记录，供下次 advise 时参考
export interface ExperimentRecord {
  kind: import('../config/experiments').ExperimentKind;
  /** 该实验注入时的游戏时间（ms） */
  gameTime: number;
  purpose: string;
  side: import('../config/experiments').ExperimentSide;
}

// 酸液场地：acid_spot 实验产生的临时毒场
export interface AcidSpot {
  id: string;
  /** 场地中心坐标（像素） */
  position: { x: number; y: number };
  /** 影响半径（像素） */
  radius: number;
  /** 影响哪一侧的蚂蚁（进入即受中毒伤害） */
  affectsSide: 'player' | 'enemy' | 'both';
  /** 每秒伤害（中毒 tick） */
  damagePerSec: number;
  /** 绝对结束时间 — **游戏时间戳**（stats.gameTime，ms），与 activeExperiment.endsAt 保持同一基准 */
  endsAt: number;
}

// ============================================
// 部件解锁系统
// ============================================

// 已解锁部件
export interface UnlockedParts {
  heads: HeadVariant[];
  thoraxes: ThoraxVariant[];
  abdomens: AbdomenVariant[];
}

// 解锁通知
export interface UnlockNotification {
  id: string;
  side: Side;
  partType: 'head' | 'thorax' | 'abdomen';
  variant: string;
  nameCN: string;
  gameTime: number;  // 解锁时的游戏时间
}

// 可解锁部件定义
export type UnlockablePartDef =
  | { type: 'head'; variant: HeadVariant; phase: number }
  | { type: 'thorax'; variant: ThoraxVariant; phase: number }
  | { type: 'abdomen'; variant: AbdomenVariant; phase: number };

// LLM 分析数据结构
export interface BattleAnalysis {
  timestamp: number;
  gameState: Partial<GameState>;
  recommendation?: string;
}
