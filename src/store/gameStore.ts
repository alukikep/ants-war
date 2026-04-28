/**
 * 游戏状态管理 - Zustand Store
 * 管理所有游戏状态，支持 LLM API 数据导出
 */

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type {
  GameState,
  Ant,
  Side,
  AntTemplate,
  HeadVariant,
  ThoraxVariant,
  AbdomenVariant,
  Hatchery,
  GridPosition,
  Projectile,
  UnlockNotification,
  UnlockablePartDef,
} from '../types';
import { GAME_CONFIG, QUEEN_CONFIG, BUILD_ZONE, UNLOCK_CONFIG, DIFFICULTY_CONFIG, type Difficulty } from '../config/gameConfig';
import {
  getHeadConfig,
  getThoraxConfig,
  getAbdomenConfig,
  calculateAntStats,
  HEAD_CONFIGS,
  THORAX_CONFIGS,
  ABDOMEN_CONFIGS,
} from '../config/partStats';

// 计算格子的像素位置
function gridToPixel(gridPos: GridPosition, side: Side): { x: number; y: number } {
  const zone = side === 'player' ? BUILD_ZONE.player : BUILD_ZONE.enemy;
  return {
    x: zone.startX + gridPos.col * GAME_CONFIG.gridSize + GAME_CONFIG.gridSize / 2,
    y: zone.startY + gridPos.row * GAME_CONFIG.gridSize + GAME_CONFIG.gridSize / 2,
  };
}

// 计算孵化室建造成本
export function calculateHatcheryCost(template: AntTemplate): number {
  const stats = calculateAntStats(template.head, template.thorax, template.abdomen);
  return GAME_CONFIG.baseHatcheryCost + stats.cost;
}

// 获取部件中文名
function getPartNameCN(partDef: UnlockablePartDef): string {
  switch (partDef.type) {
    case 'head': return HEAD_CONFIGS[partDef.variant].nameCN;
    case 'thorax': return THORAX_CONFIGS[partDef.variant].nameCN;
    case 'abdomen': return ABDOMEN_CONFIGS[partDef.variant].nameCN;
  }
}

// 将部件加入已解锁列表
function addPartToUnlocked(
  parts: { heads: HeadVariant[]; thoraxes: ThoraxVariant[]; abdomens: AbdomenVariant[] },
  partDef: UnlockablePartDef,
) {
  switch (partDef.type) {
    case 'head': parts.heads.push(partDef.variant); break;
    case 'thorax': parts.thoraxes.push(partDef.variant); break;
    case 'abdomen': parts.abdomens.push(partDef.variant); break;
  }
}

// 初始状态
const createInitialState = (): GameState => {
  // 随机给予双方各1个阶段一部件（独立随机，提高差异性）
  const phase1Parts = UNLOCK_CONFIG.parts.filter(p => p.phase === 1);
  const playerInitialPart = phase1Parts[Math.floor(Math.random() * phase1Parts.length)];
  const enemyInitialPart = phase1Parts[Math.floor(Math.random() * phase1Parts.length)];

  const playerUnlockedParts = {
    heads: ['basic'] as HeadVariant[],
    thoraxes: ['basic'] as ThoraxVariant[],
    abdomens: ['basic'] as AbdomenVariant[],
  };
  const enemyUnlockedParts = {
    heads: ['basic'] as HeadVariant[],
    thoraxes: ['basic'] as ThoraxVariant[],
    abdomens: ['basic'] as AbdomenVariant[],
  };

  addPartToUnlocked(playerUnlockedParts, playerInitialPart);
  addPartToUnlocked(enemyUnlockedParts, enemyInitialPart);

  // 为玩家生成初始解锁通知
  const initialNotification: UnlockNotification = {
    id: uuidv4(),
    side: 'player',
    partType: playerInitialPart.type,
    variant: playerInitialPart.variant,
    nameCN: getPartNameCN(playerInitialPart),
    gameTime: 0,
  };

  return {
    status: 'idle',
    difficulty: 'normal',
    playerFood: 0,
    enemyFood: 0,
    playerQueen: {
      side: 'player',
      hp: QUEEN_CONFIG.maxHp,
      maxHp: QUEEN_CONFIG.maxHp,
      position: { ...QUEEN_CONFIG.playerPosition },
    },
    enemyQueen: {
      side: 'enemy',
      hp: QUEEN_CONFIG.maxHp,
      maxHp: QUEEN_CONFIG.maxHp,
      position: { ...QUEEN_CONFIG.enemyPosition },
    },
    ants: [],
    projectiles: [],
    hatcheries: [],
    playerTemplate: {
      head: 'basic',
      thorax: 'basic',
      abdomen: 'basic',
    },
    enemyTemplate: {
      head: 'basic',
      thorax: 'basic',
      abdomen: 'basic',
    },
    config: GAME_CONFIG,
    stats: {
      playerAntsSpawned: 0,
      enemyAntsSpawned: 0,
      playerAntsKilled: 0,
      enemyAntsKilled: 0,
      playerHatcheriesBuilt: 0,
      enemyHatcheriesBuilt: 0,
      gameTime: 0,
    },
    playerUnlockedParts,
    enemyUnlockedParts,
    unlockNotifications: [initialNotification],
    // AI 垃圾话
    aiTrashTalk: '',
    aiTrashTalkTime: 0,
  };
};

// Store 接口
interface GameStore extends GameState {
  // 游戏速度 (1 = 正常, 2 = 2倍速, 3 = 3倍速)
  gameSpeed: number;

  // 游戏控制
  startGame: () => void;
  pauseGame: () => void;
  resumeGame: () => void;
  resetGame: () => void;
  toggleSpeed: () => void;
  setDifficulty: (difficulty: Difficulty) => void;

  // 蚂蚁管理
  spawnAntFromHatchery: (hatchery: Hatchery) => Ant | null;
  removeAnt: (id: string) => void;
  updateAnt: (id: string, updates: Partial<Ant>) => void;
  updateAnts: (updates: { id: string; changes: Partial<Ant> }[]) => void;

  // 子弹管理
  addProjectile: (projectile: Projectile) => void;
  removeProjectile: (id: string) => void;
  updateProjectiles: (updates: { id: string; changes: Partial<Projectile> }[]) => void;
  clearProjectiles: () => void;

  // 孵化室管理
  buildHatchery: (side: Side, gridPos: GridPosition, template: AntTemplate) => Hatchery | null;
  canBuildAt: (side: Side, gridPos: GridPosition) => boolean;
  getHatcheryCost: (template: AntTemplate) => number;
  updateHatcheryCooldowns: (deltaTime: number) => void;
  upgradeHatchery: (hatcheryId: string) => boolean;
  demolishHatchery: (hatcheryId: string) => number; // 返回退还的资源
  getHatcheryAt: (side: Side, gridPos: GridPosition) => Hatchery | undefined;
  canUpgradeHatchery: (hatcheryId: string) => boolean;
  getUpgradeCost: (hatcheryId: string) => number;

  // 蚁后管理
  damageQueen: (side: Side, damage: number) => void;

  // 模板配置
  setPlayerTemplate: (template: Partial<AntTemplate>) => void;
  setPlayerHead: (head: HeadVariant) => void;
  setPlayerThorax: (thorax: ThoraxVariant) => void;
  setPlayerAbdomen: (abdomen: AbdomenVariant) => void;

  // 资源管理
  addFood: (side: Side, amount: number) => void;
  spendFood: (side: Side, amount: number) => boolean;

  // 统计更新
  updateStats: (updates: Partial<GameState['stats']>) => void;
  incrementGameTime: (delta: number) => void;

  // 部件解锁
  unlockPart: (side: Side, partDef: UnlockablePartDef, nameCN: string) => void;
  clearUnlockNotifications: () => void;

  // AI 垃圾话
  setAITrashTalk: (message: string) => void;

  // LLM 数据导出
  exportForAnalysis: () => object;
}

export const useGameStore = create<GameStore>((set, get) => ({
  ...createInitialState(),

  // 游戏速度
  gameSpeed: 1,

  // 游戏控制
  startGame: () => set({ status: 'playing' }),

  pauseGame: () => set({ status: 'paused' }),

  resumeGame: () => set({ status: 'playing' }),

  resetGame: () => set({ ...createInitialState(), gameSpeed: 1 }),

  toggleSpeed: () => set((state) => ({ gameSpeed: state.gameSpeed === 1 ? 2 : state.gameSpeed === 2 ? 3 : 1 })),

  setDifficulty: (difficulty: Difficulty) => set({ difficulty }),

  // 从孵化室生成蚂蚁
  spawnAntFromHatchery: (hatchery: Hatchery) => {
    const state = get();
    const template = hatchery.template;
    const side = hatchery.side;

    // 计算基础属性（包含远程属性）
    const baseStats = calculateAntStats(template.head, template.thorax, template.abdomen);

    // 根据孵化室等级计算加成 (等级1无加成，等级2加30%，等级3加60%)
    const levelBonus = 1 + (hatchery.level - 1) * state.config.upgradeStatBonus;

    // 应用等级加成（速度和攻速不受等级影响）
    const stats = {
      hp: Math.floor(baseStats.hp * levelBonus),
      damage: Math.floor(baseStats.damage * levelBonus),
      speed: baseStats.speed,                    // 速度不随等级变化
      attackSpeed: baseStats.attackSpeed,         // 攻速不随等级变化
      cost: baseStats.cost,
      // 远程属性
      isRanged: baseStats.isRanged,
      rangedDamage: Math.floor(baseStats.rangedDamage * levelBonus),
      attackRange: baseStats.attackRange,
    };

    // 蚂蚁从蚁后前方出发，向战场移动（孵化室在蚁后后方）
    const spawnX = side === 'player'
      ? QUEEN_CONFIG.playerPosition.x + 50
      : QUEEN_CONFIG.enemyPosition.x - 50;

    // 创建蚂蚁
    // 初始朝向：玩家蚂蚁朝右(0度)，敌方蚂蚁朝左(π)
    const initialRotation = side === 'player' ? 0 : Math.PI;

    // 检查是否拥有大齿猛蚁头部的特殊能力
    const hasEscapeAbility = template.head === 'odontomachus';
    // 检查是否拥有白蚁大兵头部的攻速光环能力
    const hasAttackSpeedAura = template.head === 'termiteSoldier';
    // 检查是否拥有马塔贝勒蚁腹的尾针技能
    const hasStingerAbility = template.abdomen === 'matabele';
    // 检查是否拥有切叶蚁胸的嘲讽技能
    const hasTauntAbility = template.thorax === 'leafcutter';
    // 检查是否拥有大头蚁头部的秒杀能力
    const hasInstantKill = template.head === 'bigHead';
    // 检查是否拥有蜜罐蚁腹的死亡爆炸回复能力
    const hasHoneypotExplosion = template.abdomen === 'honeypot';

    const ant: Ant = {
      id: uuidv4(),
      side,
      hp: stats.hp,
      maxHp: stats.hp,
      damage: stats.damage,
      speed: stats.speed,
      attackSpeed: stats.attackSpeed,
      attackCooldown: 0,
      // 远程属性
      isRanged: stats.isRanged,
      rangedDamage: stats.rangedDamage,
      attackRange: stats.attackRange,
      position: {
        x: spawnX,
        y: hatchery.position.y + (Math.random() - 0.5) * 30,
      },
      state: 'moving',
      targetId: null,
      hatcheryId: hatchery.id,
      rotation: initialRotation,
      parts: {
        head: getHeadConfig(template.head),
        thorax: getThoraxConfig(template.thorax),
        abdomen: getAbdomenConfig(template.abdomen),
      },
      metadata: {
        spawnTime: Date.now(),
        killCount: 0,
        damageDealt: 0,
        damageTaken: 0,
      },
      // 大齿猛蚁头部特殊能力
      hasEscapeAbility,
      escapeAbilityCooldown: 0,
      hasUsedEscapeAbility: false,
      // Buff 系统
      buffs: [],
      // 来源孵化室等级（用于计算特殊效果如减速）
      sourceLevel: hatchery.level,
      // 白蚁大兵头部攻速光环
      hasAttackSpeedAura,
      attackSpeedBonus: 0,
      // 马塔贝勒蚁腹尾针技能
      hasStingerAbility,
      stingerCooldown: 0,
      // 切叶蚁胸嘲讽技能
      hasTauntAbility,
      tauntCooldown: 0,
      baseArmor: hasTauntAbility ? 0.2 : 0, // 20%基础护甲
      // 蜜罐蚁腹死亡爆炸回复
      hasHoneypotExplosion,
      // 大头蚁头部秒杀能力
      hasInstantKill,
      isBeingExecuted: false,
      executedBy: undefined,
      isExecuting: false,
    };

    set((state) => ({
      ants: [...state.ants, ant],
      stats: {
        ...state.stats,
        playerAntsSpawned: side === 'player'
          ? state.stats.playerAntsSpawned + 1
          : state.stats.playerAntsSpawned,
        enemyAntsSpawned: side === 'enemy'
          ? state.stats.enemyAntsSpawned + 1
          : state.stats.enemyAntsSpawned,
      },
    }));

    return ant;
  },

  // 移除蚂蚁
  removeAnt: (id: string) => {
    set((state) => {
      const ant = state.ants.find(a => a.id === id);
      if (!ant) return state;

      return {
        ants: state.ants.filter(a => a.id !== id),
        stats: {
          ...state.stats,
          playerAntsKilled: ant.side === 'player'
            ? state.stats.playerAntsKilled + 1
            : state.stats.playerAntsKilled,
          enemyAntsKilled: ant.side === 'enemy'
            ? state.stats.enemyAntsKilled + 1
            : state.stats.enemyAntsKilled,
        },
      };
    });
  },

  // 更新单个蚂蚁
  updateAnt: (id: string, updates: Partial<Ant>) => {
    set((state) => ({
      ants: state.ants.map(ant =>
        ant.id === id ? { ...ant, ...updates } : ant
      ),
    }));
  },

  // 批量更新蚂蚁 (性能优化)
  updateAnts: (updates: { id: string; changes: Partial<Ant> }[]) => {
    set((state) => {
      const updateMap = new Map(updates.map(u => [u.id, u.changes]));
      return {
        ants: state.ants.map(ant => {
          const changes = updateMap.get(ant.id);
          return changes ? { ...ant, ...changes } : ant;
        }),
      };
    });
  },

  // 添加子弹
  addProjectile: (projectile: Projectile) => {
    set((state) => ({
      projectiles: [...state.projectiles, projectile],
    }));
  },

  // 移除子弹
  removeProjectile: (id: string) => {
    set((state) => ({
      projectiles: state.projectiles.filter(p => p.id !== id),
    }));
  },

  // 批量更新子弹
  updateProjectiles: (updates: { id: string; changes: Partial<Projectile> }[]) => {
    set((state) => {
      const updateMap = new Map(updates.map(u => [u.id, u.changes]));
      return {
        projectiles: state.projectiles.map(p => {
          const changes = updateMap.get(p.id);
          return changes ? { ...p, ...changes } : p;
        }),
      };
    });
  },

  // 清空所有子弹
  clearProjectiles: () => {
    set({ projectiles: [] });
  },

  // 检查是否可以在指定位置建造
  canBuildAt: (side: Side, gridPos: GridPosition) => {
    const state = get();
    const { gridCols, gridRows } = state.config;

    // 检查边界
    if (gridPos.col < 0 || gridPos.col >= gridCols ||
      gridPos.row < 0 || gridPos.row >= gridRows) {
      return false;
    }

    // 检查是否已有建筑
    const hasBuilding = state.hatcheries.some(h =>
      h.side === side &&
      h.gridPos.col === gridPos.col &&
      h.gridPos.row === gridPos.row
    );

    return !hasBuilding;
  },

  // 获取孵化室成本
  getHatcheryCost: (template: AntTemplate) => {
    return calculateHatcheryCost(template);
  },

  // 建造孵化室
  buildHatchery: (side: Side, gridPos: GridPosition, template: AntTemplate) => {
    const state = get();

    // 检查是否可以建造
    if (!state.canBuildAt(side, gridPos)) {
      return null;
    }

    // 计算成本
    const cost = calculateHatcheryCost(template);
    const currentFood = side === 'player' ? state.playerFood : state.enemyFood;

    if (currentFood < cost) {
      return null;
    }

    // 创建孵化室
    const hatchery: Hatchery = {
      id: uuidv4(),
      side,
      gridPos,
      position: gridToPixel(gridPos, side),
      template: { ...template },
      spawnCooldown: state.config.spawnInterval, // 刚建好需要等待
      cost,
      level: 1,
      totalInvested: cost,
    };

    set((prevState) => ({
      hatcheries: [...prevState.hatcheries, hatchery],
      playerFood: side === 'player' ? prevState.playerFood - cost : prevState.playerFood,
      enemyFood: side === 'enemy' ? prevState.enemyFood - cost : prevState.enemyFood,
      stats: {
        ...prevState.stats,
        playerHatcheriesBuilt: side === 'player'
          ? prevState.stats.playerHatcheriesBuilt + 1
          : prevState.stats.playerHatcheriesBuilt,
        enemyHatcheriesBuilt: side === 'enemy'
          ? prevState.stats.enemyHatcheriesBuilt + 1
          : prevState.stats.enemyHatcheriesBuilt,
      },
    }));

    return hatchery;
  },

  // 更新孵化室冷却时间
  updateHatcheryCooldowns: (deltaTime: number) => {
    set((state) => ({
      hatcheries: state.hatcheries.map(h => ({
        ...h,
        spawnCooldown: Math.max(0, h.spawnCooldown - deltaTime),
      })),
    }));
  },

  // 获取指定位置的孵化室
  getHatcheryAt: (side: Side, gridPos: GridPosition) => {
    const state = get();
    return state.hatcheries.find(h =>
      h.side === side &&
      h.gridPos.col === gridPos.col &&
      h.gridPos.row === gridPos.row
    );
  },

  // 检查是否可以升级孵化室
  canUpgradeHatchery: (hatcheryId: string) => {
    const state = get();
    const hatchery = state.hatcheries.find(h => h.id === hatcheryId);
    if (!hatchery) return false;

    // 检查等级上限
    if (hatchery.level >= state.config.maxHatcheryLevel) return false;

    // 检查资源
    const upgradeCost = hatchery.cost; // 升级费用等于建造费用
    const currentFood = hatchery.side === 'player' ? state.playerFood : state.enemyFood;
    return currentFood >= upgradeCost;
  },

  // 获取升级成本
  getUpgradeCost: (hatcheryId: string) => {
    const state = get();
    const hatchery = state.hatcheries.find(h => h.id === hatcheryId);
    if (!hatchery) return 0;
    return hatchery.cost; // 升级费用等于建造费用
  },

  // 升级孵化室
  upgradeHatchery: (hatcheryId: string) => {
    const state = get();
    const hatchery = state.hatcheries.find(h => h.id === hatcheryId);

    if (!hatchery) return false;
    if (hatchery.level >= state.config.maxHatcheryLevel) return false;

    const upgradeCost = hatchery.cost;
    const currentFood = hatchery.side === 'player' ? state.playerFood : state.enemyFood;

    if (currentFood < upgradeCost) return false;

    set((prevState) => ({
      hatcheries: prevState.hatcheries.map(h =>
        h.id === hatcheryId
          ? {
            ...h,
            level: h.level + 1,
            totalInvested: h.totalInvested + upgradeCost,
          }
          : h
      ),
      playerFood: hatchery.side === 'player'
        ? prevState.playerFood - upgradeCost
        : prevState.playerFood,
      enemyFood: hatchery.side === 'enemy'
        ? prevState.enemyFood - upgradeCost
        : prevState.enemyFood,
    }));

    return true;
  },

  // 拆除孵化室（返还资源）
  demolishHatchery: (hatcheryId: string) => {
    const state = get();
    const hatchery = state.hatcheries.find(h => h.id === hatcheryId);

    if (!hatchery) return 0;

    // 计算返还资源
    const refund = Math.floor(hatchery.totalInvested * state.config.demolishRefundRate);

    set((prevState) => ({
      hatcheries: prevState.hatcheries.filter(h => h.id !== hatcheryId),
      playerFood: hatchery.side === 'player'
        ? prevState.playerFood + refund
        : prevState.playerFood,
      enemyFood: hatchery.side === 'enemy'
        ? prevState.enemyFood + refund
        : prevState.enemyFood,
    }));

    return refund;
  },

  // 对蚁后造成伤害
  damageQueen: (side: Side, damage: number) => {
    set((state) => {
      if (side === 'player') {
        const newHp = Math.max(0, state.playerQueen.hp - damage);
        return {
          playerQueen: { ...state.playerQueen, hp: newHp },
          status: newHp <= 0 ? 'defeat' : state.status,
        };
      } else {
        const newHp = Math.max(0, state.enemyQueen.hp - damage);
        return {
          enemyQueen: { ...state.enemyQueen, hp: newHp },
          status: newHp <= 0 ? 'victory' : state.status,
        };
      }
    });
  },

  // 设置玩家模板
  setPlayerTemplate: (template: Partial<AntTemplate>) => {
    set((state) => ({
      playerTemplate: { ...state.playerTemplate, ...template },
    }));
  },

  setPlayerHead: (head: HeadVariant) => {
    set((state) => ({
      playerTemplate: { ...state.playerTemplate, head },
    }));
  },

  setPlayerThorax: (thorax: ThoraxVariant) => {
    set((state) => ({
      playerTemplate: { ...state.playerTemplate, thorax },
    }));
  },

  setPlayerAbdomen: (abdomen: AbdomenVariant) => {
    set((state) => ({
      playerTemplate: { ...state.playerTemplate, abdomen },
    }));
  },

  // 资源管理
  addFood: (side: Side, amount: number) => {
    set((state) => ({
      playerFood: side === 'player'
        ? state.playerFood + amount
        : state.playerFood,
      enemyFood: side === 'enemy'
        ? state.enemyFood + amount
        : state.enemyFood,
    }));
  },

  spendFood: (side: Side, amount: number) => {
    const state = get();
    const currentFood = side === 'player' ? state.playerFood : state.enemyFood;

    if (currentFood < amount) {
      return false;
    }

    set((prevState) => ({
      playerFood: side === 'player' ? prevState.playerFood - amount : prevState.playerFood,
      enemyFood: side === 'enemy' ? prevState.enemyFood - amount : prevState.enemyFood,
    }));

    return true;
  },

  // 统计更新
  updateStats: (updates: Partial<GameState['stats']>) => {
    set((state) => ({
      stats: { ...state.stats, ...updates },
    }));
  },

  incrementGameTime: (delta: number) => {
    set((state) => ({
      stats: { ...state.stats, gameTime: state.stats.gameTime + delta },
    }));
  },

  // 部件解锁
  unlockPart: (side: Side, partDef: UnlockablePartDef, nameCN: string) => {
    const state = get();
    const key = side === 'player' ? 'playerUnlockedParts' : 'enemyUnlockedParts';
    const current = state[key];

    const notification: UnlockNotification = {
      id: uuidv4(),
      side,
      partType: partDef.type,
      variant: partDef.variant,
      nameCN,
      gameTime: state.stats.gameTime,
    };

    if (partDef.type === 'head') {
      set({
        [key]: { ...current, heads: [...current.heads, partDef.variant] },
        unlockNotifications: [...state.unlockNotifications, notification],
      });
    } else if (partDef.type === 'thorax') {
      set({
        [key]: { ...current, thoraxes: [...current.thoraxes, partDef.variant] },
        unlockNotifications: [...state.unlockNotifications, notification],
      });
    } else {
      set({
        [key]: { ...current, abdomens: [...current.abdomens, partDef.variant] },
        unlockNotifications: [...state.unlockNotifications, notification],
      });
    }
  },

  clearUnlockNotifications: () => {
    set({ unlockNotifications: [] });
  },

  // AI 垃圾话
  setAITrashTalk: (message: string) => {
    set({ aiTrashTalk: message, aiTrashTalkTime: Date.now() });
  },

  // 导出分析数据 (用于 LLM API)
  exportForAnalysis: () => {
    const state = get();
    return {
      status: state.status,
      gameTime: state.stats.gameTime,
      resources: {
        playerFood: state.playerFood,
        enemyFood: state.enemyFood,
      },
      playerQueen: {
        hp: state.playerQueen.hp,
        maxHp: state.playerQueen.maxHp,
        hpPercent: (state.playerQueen.hp / state.playerQueen.maxHp * 100).toFixed(1),
      },
      enemyQueen: {
        hp: state.enemyQueen.hp,
        maxHp: state.enemyQueen.maxHp,
        hpPercent: (state.enemyQueen.hp / state.enemyQueen.maxHp * 100).toFixed(1),
      },
      hatcheries: {
        player: state.hatcheries.filter(h => h.side === 'player').map(h => ({
          template: h.template,
          position: h.gridPos,
        })),
        enemy: state.hatcheries.filter(h => h.side === 'enemy').map(h => ({
          template: h.template,
          position: h.gridPos,
        })),
      },
      activeAnts: {
        player: state.ants.filter(a => a.side === 'player').length,
        enemy: state.ants.filter(a => a.side === 'enemy').length,
      },
      stats: state.stats,
    };
  },
}));
