/**
 * 蚂蚁部件配置表
 * 设计思路：每个部件专注于某项属性加成，便于策略组合
 */

import type { PartConfig, HeadVariant, ThoraxVariant, AbdomenVariant } from '../types';

// 头部配置 - 主要影响攻击力和攻速
export const HEAD_CONFIGS: Record<HeadVariant, PartConfig> = {
  basic: {
    id: 'head_basic',
    name: 'Basic Head',
    nameCN: '基础头部',
    type: 'head',
    variant: 'basic',
    stats: {
      damage: 0,
      hp: 0,
      speed: 0,
      attackSpeed: 0,
    },
    description: '标准的蚂蚁头部，无特殊加成',
    cost: 0,
  },
  leafcutter: {
    id: 'head_leafcutter',
    name: 'Leafcutter Head',
    nameCN: '切叶蚁头',
    type: 'head',
    variant: 'leafcutter',
    stats: {
      damage: 20,
      hp: 0,
      speed: 0,
      attackSpeed: 0,
    },
    description: '锋利的大颚，增加攻击力和暴击率（1级5%，2级10%，3级15%，暴击3倍伤害）',
    cost: 80,
  },
  soldier: {
    id: 'head_soldier',
    name: 'Soldier Head',
    nameCN: '兵蚁头',
    type: 'head',
    variant: 'soldier',
    stats: {
      damage: 25,
      hp: 10,
      speed: -5,
      attackSpeed: 0,
    },
    description: '重型战斗头部，高攻击但略慢',
    cost: 70,
  },
  fire: {
    id: 'head_fire',
    name: 'Fire Ant Head',
    nameCN: '火蚁头',
    type: 'head',
    variant: 'fire',
    stats: {
      damage: 0,
      hp: 0,
      speed: 0,
      attackSpeed: 10,
    },
    description: '毒牙攻击，攻速+10%，同网格可容纳两只',
    cost: 60,
  },
  odontomachus: {
    id: 'head_odontomachus',
    name: 'Trap-jaw Ant Head',
    nameCN: '大齿猛蚁头',
    type: 'head',
    variant: 'odontomachus',
    stats: {
      damage: 10,
      hp: 0,
      speed: 0,
      attackSpeed: 0,
    },
    description: '强力大颚，生命低于40%时弹射脱离战场并恢复50%生命（首次无冷却，后续10秒冷却）',
    cost: 70,
  },
  termiteSoldier: {
    id: 'head_termite_soldier',
    name: 'Termite Soldier Head',
    nameCN: '白蚁大兵头',
    type: 'head',
    variant: 'termiteSoldier',
    stats: {
      damage: 15,         // 原+5，提升至+15
      hp: 30,             // 原+0，新增+30生命
      speed: 0,
      attackSpeed: 0,
    },
    description: '白蚁大兵的巨颚，+15攻击+30生命，每次攻击为周围队友提供攻速加成（上限300%，每秒衰减20%）',
    cost: 100,
  },
  bigHead: {
    id: 'head_big_head',
    name: 'Big-headed Ant Head',
    nameCN: '大头蚁头',
    type: 'head',
    variant: 'bigHead',
    stats: {
      damage: 5,          // 攻击+5（已回退到原值）
      hp: 40,             // +40生命（从+30提升至+40）
      speed: 0,
      attackSpeed: 100,   // +100%攻速（攻击间隔减半）
    },
    description: '超大颚部，+5攻击+40生命+100%攻速，每次攻击按孵化室等级3%/5%/8%几率秒杀敌人（举起甩飞！）',
    cost: 110,
  },
};

// 胸部配置 - 主要影响移速
export const THORAX_CONFIGS: Record<ThoraxVariant, PartConfig> = {
  basic: {
    id: 'thorax_basic',
    name: 'Basic Thorax',
    nameCN: '基础胸部',
    type: 'thorax',
    variant: 'basic',
    stats: {
      damage: 0,
      hp: 0,
      speed: 0,
      attackSpeed: 0,
    },
    description: '标准的蚂蚁胸部，无特殊加成',
    cost: 0,
  },
  army: {
    id: 'thorax_army',
    name: 'Army Ant Thorax',
    nameCN: '行军蚁胸',
    type: 'thorax',
    variant: 'army',
    stats: {
      damage: 0,
      hp: 0,
      speed: 30,
      attackSpeed: 0,
    },
    description: '发达的腿部肌肉，大幅提升移动速度',
    cost: 50,
  },
  carpenter: {
    id: 'thorax_carpenter',
    name: 'Carpenter Thorax',
    nameCN: '木蚁胸',
    type: 'thorax',
    variant: 'carpenter',
    stats: {
      damage: 0,
      hp: 15,
      speed: 10,
      attackSpeed: 0,
      flatArmor: 5,             // 基础1级护甲5；按孵化室等级在 gameStore 中升级为 8/12
    },
    description: '强健的胸部，固定护甲按孵化室等级：1级+5 / 2级+8 / 3级+12（受到X伤害实际只受max(1, X-护甲)伤害）',
    cost: 60,
  },
  bullet: {
    id: 'thorax_bullet',
    name: 'Bullet Ant Thorax',
    nameCN: '子弹蚁胸',
    type: 'thorax',
    variant: 'bullet',
    stats: {
      damage: 0,
      hp: -30,
      speed: 50,
      attackSpeed: 10,
    },
    description: '极速突击型，肾上腺素技能：首次受敌时+50%攻击力(2级75%，3级100%)和护甲(2级60%，3级80%)，持续5/8/12秒，冷却60秒',
    cost: 80,
  },
  leafcutter: {
    id: 'thorax_leafcutter',
    name: 'Leafcutter Ant Thorax',
    nameCN: '切叶蚁胸',
    type: 'thorax',
    variant: 'leafcutter',
    stats: {
      damage: 0,
      hp: 40,
      speed: 0,
      attackSpeed: 0,
    },
    description: '坚甲坦克，生命低于20%时触发嘲讽，迫使敌人攻击自身，回复30%血量并获得80%护甲5秒（15秒冷却）',
    cost: 90,
  },
};

// 腹部配置 - 主要影响生命值
export const ABDOMEN_CONFIGS: Record<AbdomenVariant, PartConfig> = {
  basic: {
    id: 'abdomen_basic',
    name: 'Basic Abdomen',
    nameCN: '基础腹部',
    type: 'abdomen',
    variant: 'basic',
    stats: {
      damage: 0,
      hp: 0,
      speed: 0,
      attackSpeed: 0,
    },
    description: '标准的蚂蚁腹部，无特殊加成',
    cost: 0,
  },
  honeypot: {
    id: 'abdomen_honeypot',
    name: 'Honeypot Abdomen',
    nameCN: '蜜罐蚁腹',
    type: 'abdomen',
    variant: 'honeypot',
    stats: {
      damage: 0,
      hp: 40,
      speed: -15,
      attackSpeed: 0,
    },
    description: '蜜腺储存能量，死亡时爆炸回复范围内友军50生命值',
    cost: 70,
  },
  weaver: {
    id: 'abdomen_weaver',
    name: 'Weaver Abdomen',
    nameCN: '织叶蚁腹',
    type: 'abdomen',
    variant: 'weaver',
    stats: {
      damage: 0,
      hp: 60,          // 20 → 60 (翻三倍)
      speed: 10,
      attackSpeed: 10,
    },
    description: '灵活的腹部，均衡提升',
    cost: 60,
  },
  trap: {
    id: 'abdomen_trap',
    name: 'Trap-jaw Abdomen',
    nameCN: '陷阱蚁腹',
    type: 'abdomen',
    variant: 'trap',
    stats: {
      damage: 15,
      hp: 30,          // 10 → 30 (翻三倍)
      speed: 0,
      attackSpeed: 15,
    },
    description: '爆发型腹部，增加伤害和攻速',
    cost: 70,
  },
  spitter: {
    id: 'abdomen_spitter',
    name: 'Wood Ant Abdomen',
    nameCN: '木蚁腹',
    type: 'abdomen',
    variant: 'spitter',
    stats: {
      damage: 5,          // 基础远程伤害5（原25，削弱为+5）
      hp: -80,           // -80% 最大生命值
      speed: 5,
      attackSpeed: 0,     // 无攻击速度加成
    },
    description: '喷酸腺体，远程攻击+5，享受完整头部攻击力加成（-80%生命值）',
    cost: 80,
  },
  matabele: {
    id: 'abdomen_matabele',
    name: 'Matabele Ant Abdomen',
    nameCN: '马塔贝勒蚁腹',
    type: 'abdomen',
    variant: 'matabele',
    stats: {
      damage: 0,
      hp: 80,            // +80 生命值
      speed: 0,
      attackSpeed: 0,
    },
    description: '强力尾针，5秒冷却，命中减50%攻速并附加中毒（1级40/2级60/3级100伤害）',
    cost: 110,           // 高价格
  },
};

// 获取部件配置的辅助函数
export function getHeadConfig(variant: HeadVariant): PartConfig {
  return HEAD_CONFIGS[variant];
}

export function getThoraxConfig(variant: ThoraxVariant): PartConfig {
  return THORAX_CONFIGS[variant];
}

export function getAbdomenConfig(variant: AbdomenVariant): PartConfig {
  return ABDOMEN_CONFIGS[variant];
}

// 远程攻击配置
export const RANGED_CONFIG = {
  attackRange: 150,           // 远程攻击射程
  projectileSpeed: 250,       // 子弹飞行速度
  headDamageBonus: 1.0,       // 头部攻击力对远程伤害的加成比例 (100%)
  hpPenalty: 0.8,             // 生命值惩罚 (80%)
};

// 大齿猛蚁头部特殊能力配置
export const ESCAPE_ABILITY_CONFIG = {
  hpThreshold: 0.4,           // 触发阈值：40% 生命值
  healPercent: 0.5,           // 恢复 50% 最大生命值
  cooldown: 10000,            // 冷却时间 10秒 (ms)
  escapeDistance: 150,        // 弹射距离 (px)
  escapeSpeed: 400,           // 弹射速度 (px/s) - 用于动画
};

// 木蚁腹减速效果配置（根据孵化室等级）
export const SPITTER_SLOW_CONFIG = {
  // 各等级减速效果：[1级, 2级, 3级]
  slowByLevel: [0, 0.2, 0.4],   // 1级无效果，2级20%，3级40%
  duration: 3000,               // 减速持续时间 3秒
};

// Buff 通用配置
export const BUFF_CONFIG = {
  maxStacksPerType: 3,          // 同类型 Buff 最大叠加层数
  poisonTickInterval: 1000,     // 中毒伤害间隔 1秒
};

// 白蚁大兵头部攻速光环配置
export const ATTACK_SPEED_AURA_CONFIG = {
  // 各等级攻击时增加的攻速：[1级, 2级, 3级]
  bonusByLevel: [0.05, 0.10, 0.15],  // 5%, 10%, 15%
  maxBonus: 3.0,                      // 最大攻速加成 300%
  decayPerSecond: 0.20,               // 每秒衰减 20%
  auraRadius: 100,                    // 光环半径 100px
};

// 马塔贝勒蚁腹尾针技能配置
export const STINGER_ABILITY_CONFIG = {
  cooldown: 5000,                     // 冷却时间 5秒
  attackSpeedReduction: 0.5,          // 减少50%攻速
  attackSpeedDebuffDuration: 4000,    // 攻速减益持续4秒
  // 中毒总伤害（根据孵化室等级）：[1级, 2级, 3级]
  poisonDamageByLevel: [40, 60, 100],
  poisonDuration: 4000,               // 中毒持续时间 4秒
  // 攻速限制范围
  minAttackSpeedMultiplier: 0.2,      // 最低 20%
  maxAttackSpeedMultiplier: 3.0,      // 最高 300%
};

// 马塔贝勒蚁腹尾针甩尾动画配置
export const STINGER_ANIM_CONFIG = {
  totalDuration: 300,                 // 动画总时长 (ms)
  turnDuration: 120,                  // 转身180°耗时 (ms)
  holdDuration: 60,                   // 在180°位置停留（扎针瞬间）(ms)
  returnDuration: 120,                // 转回正面耗时 (ms)
};

// 蜜罐蚁腹死亡爆炸配置
export const HONEYPOT_EXPLOSION_CONFIG = {
  healAmount: 50,                     // 回复友军生命值
  healRadius: 80,                     // 回复范围 (px)
  honeyPuddleDuration: 1000,         // 蜜液动画持续时间 (ms)
  honeyPuddleRadius: 25,             // 蜜液滩半径 (px)
  healParticleCount: 8,              // 回复粒子数量
  healParticleSpeed: 30,             // 粒子上升速度
  healParticleLifespan: 600,         // 粒子生命周期 (ms)
};

// 大头蚁头部秒杀能力配置
export const INSTANT_KILL_CONFIG = {
  // 各等级秒杀几率：[1级, 2级, 3级]
  chanceByLevel: [0.03, 0.05, 0.08],  // 3%, 5%, 8%
  executionDuration: 1200,            // 秒杀动画持续时间 (ms)
};

// 切叶蚁胸嘲讽技能配置
export const TAUNT_ABILITY_CONFIG = {
  cooldown: 15000,                    // 冷却时间 15秒
  tauntRadius: 100,                   // 嘲讽范围 100px
  healPercent: 0.3,                   // 恢复 30% 最大生命值
  armorBuffValue: 0.8,                // 嘲讽后护甲提升到 80%
  armorBuffDuration: 5000,            // 护甲buff持续 5秒
  triggerThreshold: 0.2,              // 生命值低于 20% 时触发
};

// 计算战略价值（考虑特殊机制）
function calculateStrategicValue(
  headVariant: HeadVariant,
  thoraxVariant: ThoraxVariant,
  abdomenVariant: AbdomenVariant,
  hp: number,
  _damage: number,
  isRanged: boolean
): number {
  let value = 0;

  // 头部特殊能力加成
  switch (headVariant) {
    case 'odontomachus': // 大齿猛蚁：逃脱+吸血
      value += 80;
      break;
    case 'termiteSoldier': // 白蚁大兵：攻速光环
      value += 100;
      break;
    case 'bigHead': // 大头蚁：秒杀
      value += 70;
      break;
    case 'soldier': // 兵蚁：高攻击
      value += 40;
      break;
    case 'fire': // 火蚁：攻速
      value += 30;
      break;
  }

  // 胸部特殊能力加成
  switch (thoraxVariant) {
    case 'leafcutter': // 切叶蚁：嘲讽+护甲
      value += 90;
      break;
    case 'army': // 行军蚁：移速加成
      value += 30;
      break;
    case 'bullet': // 子弹蚁：移速
      value += 25;
      break;
    case 'carpenter': // 木蚁：护甲
      value += 35;
      break;
  }

  // 腹部特殊能力加成
  switch (abdomenVariant) {
    case 'honeypot': // 蜜罐蚁：死亡后回血
      value += hp * 0.5; // 额外生命值价值
      break;
    case 'weaver': // 织叶蚁：附近友军加速
      value += 40;
      break;
    case 'trap': // 陷阱蚁：夹伤敌人
      value += 35;
      break;
    case 'spitter': // 吐丝蚁：远程攻击
      value += isRanged ? 60 : 0;
      break;
    case 'matabele': // 马塔贝勒蚁：尾针+中毒
      value += 75;
      break;
  }

  return value;
}

// 计算蚂蚁总属性
export function calculateAntStats(
  headVariant: HeadVariant,
  thoraxVariant: ThoraxVariant,
  abdomenVariant: AbdomenVariant
) {
  const head = HEAD_CONFIGS[headVariant];
  const thorax = THORAX_CONFIGS[thoraxVariant];
  const abdomen = ABDOMEN_CONFIGS[abdomenVariant];

  // 基础属性
  const BASE_STATS = {
    hp: 100,
    damage: 10,
    speed: 60,
    attackSpeed: 1000, // 基础攻击间隔 1000ms
  };

  // 检查是否为远程单位（木蚁腹）
  const isRanged = abdomenVariant === 'spitter';

  // 计算基础伤害（近战用）
  let baseDamage = Math.max(1, BASE_STATS.damage + head.stats.damage + thorax.stats.damage + abdomen.stats.damage);

  // 计算基础生命值
  let baseHp = BASE_STATS.hp + head.stats.hp + thorax.stats.hp;

  // 远程单位特殊处理
  if (isRanged) {
    // 木蚁腹的 hp stats 是 -30，但我们用百分比惩罚代替
    // 所以不加腹部的hp，而是应用30%惩罚
    baseHp = Math.floor(baseHp * (1 - RANGED_CONFIG.hpPenalty));
  } else {
    baseHp += abdomen.stats.hp;
  }

  // 计算远程伤害：享受完整的头部攻击力加成（不再是30%）
  const headDamageBonus = head.stats.damage;
  const rangedDamage = isRanged
    ? Math.max(1, abdomen.stats.damage + headDamageBonus + thorax.stats.damage) // 完整头部+胸部伤害
    : 0;

  return {
    hp: Math.max(10, baseHp),
    damage: baseDamage,
    speed: Math.max(10, BASE_STATS.speed + head.stats.speed + thorax.stats.speed + abdomen.stats.speed),
    // 攻速加成为百分比减少攻击间隔
    attackSpeed: Math.max(200, BASE_STATS.attackSpeed * (1 - (head.stats.attackSpeed + thorax.stats.attackSpeed + abdomen.stats.attackSpeed) / 100)),
    cost: head.cost + thorax.cost + abdomen.cost,
    // 远程属性
    isRanged,
    rangedDamage,
    attackRange: isRanged ? RANGED_CONFIG.attackRange : 25, // 远程150px，近战25px
    // 战略价值：考虑特殊机制的加成
    strategicValue: calculateStrategicValue(headVariant, thoraxVariant, abdomenVariant, baseHp, baseDamage, isRanged),
    // 固定护甲（木蚁胸）
    flatArmor: thorax.stats.flatArmor || 0,
  };
}

// 获取所有部件列表 (用于 UI 展示)
export function getAllParts() {
  return {
    heads: Object.values(HEAD_CONFIGS),
    thoraxes: Object.values(THORAX_CONFIGS),
    abdomens: Object.values(ABDOMEN_CONFIGS),
  };
}
