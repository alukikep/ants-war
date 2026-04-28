/**
 * 游戏全局配置
 */

import type { GameConfig, UnlockablePartDef } from '../types';

export const GAME_CONFIG: GameConfig = {
  mapWidth: 1800,
  mapHeight: 600,
  spawnInterval: 10000,     // 初始孵化间隔10秒，每过1分钟+1秒
  collisionDistance: 25,    // 攻击距离（进入战斗的距离）
  detectionRange: 120,      // 索敌范围（检测到敌人开始追击）
  queenDamage: 20,          // 蚂蚁对蚁后造成的伤害
  baseAttackInterval: 1000, // 基础攻击间隔 1秒
  foodInterval: 2000,       // 每2秒生成食物
  foodPerInterval: 5,       // 初始每次生成5食物，每过1分钟+1
  gridSize: 50,             // 每个格子50像素
  gridCols: 5,              // 建造区域5列
  gridRows: 5,              // 建造区域5行
  baseHatcheryCost: 60,     // 基础孵化室成本
  maxAntsPerHatchery: 1,    // 每个孵化室最多1只存活蚂蚁，死亡后才能孵化下一只
  maxHatcheryLevel: 3,      // 孵化室最高3级
  upgradeStatBonus: 0.3,    // 每级提升30%属性（速度和攻速不受等级影响）
  demolishRefundRate: 0.5,  // 拆除返还50%资源
  tugOfWarFoodBonus: 3,     // 拔河优势：有单位越过中线时额外+3食物
  antCollisionRadius: 10,   // 蚂蚁碰撞半径10px（两蚂蚁最小间距20px）
};

// 蚁后初始配置
export const QUEEN_CONFIG = {
  maxHp: 500,
  playerPosition: { x: 310, y: 300 },
  enemyPosition: { x: 1490, y: 300 },
};

// 难度配置
export type Difficulty = 'normal' | 'hard' | 'extreme';

export const DIFFICULTY_CONFIG: Record<Difficulty, { enemyFoodBonus: number; label: string; description: string }> = {
  normal: {
    enemyFoodBonus: 0,    // 普通难度：双方食物加成相同
    label: '普通',
    description: '公平对战',
  },
  hard: {
    enemyFoodBonus: 6,    // 困难难度：敌方比我方多6
    label: '困难',
    description: '敌方食物+6',
  },
  extreme: {
    enemyFoodBonus: 12,    // 极限难度：敌方比我方多12
    label: '极限',
    description: '敌方食物+12',
  },
};

// 建造区域配置（孵化室在蚁后后方，远离战场）
export const BUILD_ZONE = {
  player: {
    // 玩家建造区在蚁后左侧（后方）
    startX: 20,
    startY: 175,
  },
  enemy: {
    // 敌方建造区在蚁后右侧（后方）
    startX: GAME_CONFIG.mapWidth - 20 - GAME_CONFIG.gridSize * GAME_CONFIG.gridCols,
    startY: 175,
  },
};

// 蚂蚁生成位置（从蚁后前方出发，朝向战场）
export const SPAWN_OFFSET = {
  player: { x: QUEEN_CONFIG.playerPosition.x + 50, y: 300 },
  enemy: { x: QUEEN_CONFIG.enemyPosition.x - 50, y: 300 },
};

// ============================================
// 部件解锁阶段配置
// ============================================
export const UNLOCK_CONFIG = {
  unlockInterval: 60000,   // 每1分钟解锁一个部件（游戏时间 ms）
  // 各阶段时间要求：阶段1从0分钟开始，阶段2从5分钟开始，阶段3从10分钟开始
  phaseTimeRequirements: [0, 300000, 600000] as number[],
  parts: [
    // 阶段一（从开头就能开始解锁）
    { type: 'head', variant: 'fire', phase: 1 },
    { type: 'thorax', variant: 'carpenter', phase: 1 },
    { type: 'abdomen', variant: 'trap', phase: 1 },
    { type: 'abdomen', variant: 'spitter', phase: 1 },
    // 阶段二（游戏开始5分钟后才能开始解锁）
    { type: 'head', variant: 'leafcutter', phase: 2 },
    { type: 'head', variant: 'soldier', phase: 2 },
    { type: 'thorax', variant: 'army', phase: 2 },
    { type: 'thorax', variant: 'bullet', phase: 2 },
    { type: 'abdomen', variant: 'honeypot', phase: 2 },
    { type: 'abdomen', variant: 'weaver', phase: 2 },
    // 阶段三（游戏开始10分钟后才能开始解锁）
    { type: 'head', variant: 'odontomachus', phase: 3 },
    { type: 'head', variant: 'termiteSoldier', phase: 3 },
    { type: 'head', variant: 'bigHead', phase: 3 },
    { type: 'thorax', variant: 'leafcutter', phase: 3 },
    { type: 'abdomen', variant: 'matabele', phase: 3 },
  ] as UnlockablePartDef[],
};

// 蚁后远程攻击配置
export const QUEEN_ATTACK_CONFIG = {
  attackInterval: 500,       // 攻击间隔 0.5秒 (ms)
  damage: 50,                // 子弹伤害
  range: 350,                // 攻击范围 350px
  projectileSpeed: 300,      // 子弹飞行速度 (px/s)
};

// 颜色配置
export const COLORS = {
  player: {
    primary: 0x3b82f6,    // 蓝色
    secondary: 0x1d4ed8,
    glow: 0x60a5fa,
  },
  enemy: {
    primary: 0xef4444,    // 红色
    secondary: 0xb91c1c,
    glow: 0xf87171,
  },
  background: 0x0a0f1a,
  ground: 0x1a2332,
  accent: 0x00ff88,
  grid: 0x2a3a4a,
  gridHover: 0x3a4a5a,
  hatchery: 0x4a5568,
  // 蚁穴隧道颜色（两侧深色区域）
  antHill: {
    dark: 0x1a0f0a,       // 深褐色/黑色
    medium: 0x2d1810,     // 中等深色
    accent: 0x3d2518,     // 浅一点的红褐色
    texture: 0x0d0805,     // 纹理细节
  },
  // 草坪颜色（中间绿色区域）
  grass: {
    light: 0x2d5a27,      // 浅绿
    medium: 0x1e4620,    // 中绿
    dark: 0x153515,      // 深绿
    accent: 0x3d7a35,    // 亮绿点缀
  },
  // 远程子弹颜色（酸液）
  projectile: {
    fill: 0x7cfc00,      // 亮绿色（酸液）
    glow: 0xadff2f,      // 发光效果
  },
  // 蚁后子弹颜色（能量弹）
  queenProjectile: {
    player: { fill: 0x60a5fa, glow: 0x93c5fd },   // 蓝色
    enemy: { fill: 0xf87171, glow: 0xfca5a5 },     // 红色
  },
};
