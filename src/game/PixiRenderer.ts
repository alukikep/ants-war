/**
 * PixiJS 渲染管理器
 * 负责所有游戏画面的渲染
 */

import * as PIXI from 'pixi.js';
import type { Ant, Side, Hatchery, Projectile, HeadVariant, ThoraxVariant, AbdomenVariant } from '../types';
import { useGameStore } from '../store/gameStore';
import { GAME_CONFIG, QUEEN_CONFIG, COLORS, BUILD_ZONE } from '../config/gameConfig';
import { HONEYPOT_EXPLOSION_CONFIG, STINGER_ANIM_CONFIG, getHeadConfig, getThoraxConfig, getAbdomenConfig } from '../config/partStats';
import { getGameEngine, type HoneypotExplosionEvent, type StingerStrikeEvent } from './GameEngine';

// 部件颜色配置 - 根据部件类型使用不同的色系
// 头部：暖色系（影响攻击力）
const HEAD_COLORS: Record<HeadVariant, { primary: number; secondary: number }> = {
  basic: { primary: 0x666666, secondary: 0x888888 },
  leafcutter: { primary: 0x22c55e, secondary: 0x16a34a },    // 绿色
  soldier: { primary: 0xdc2626, secondary: 0xb91c1c },       // 深红
  fire: { primary: 0xf97316, secondary: 0xea580c },          // 橙红
  odontomachus: { primary: 0x8b5cf6, secondary: 0x7c3aed },  // 紫色
  termiteSoldier: { primary: 0xe5e5e5, secondary: 0xd4d4d4 }, // 白色
  bigHead: { primary: 0xc084fc, secondary: 0xa855f7 },       // 浅紫
};

// 胸部：冷色系（影响移速）
const THORAX_COLORS: Record<ThoraxVariant, { primary: number; secondary: number }> = {
  basic: { primary: 0x555555, secondary: 0x777777 },
  army: { primary: 0x2563eb, secondary: 0x1d4ed8 },           // 深蓝
  carpenter: { primary: 0x92400e, secondary: 0x78350f },       // 棕色
  bullet: { primary: 0xfbbf24, secondary: 0xf59e0b },         // 金黄
  leafcutter: { primary: 0x166534, secondary: 0x14532d },     // 深绿
};

// 腹部：自然色系（影响生命值）
const ABDOMEN_COLORS: Record<AbdomenVariant, { primary: number; secondary: number }> = {
  basic: { primary: 0x444444, secondary: 0x666666 },
  honeypot: { primary: 0xf59e0b, secondary: 0xd97706 },       // 金黄
  weaver: { primary: 0x84cc16, secondary: 0x65a30d },         // 浅绿
  trap: { primary: 0xea580c, secondary: 0xdc2626 },           // 橙色
  spitter: { primary: 0x15803d, secondary: 0x166534 },        // 深绿（喷酸）
  matabele: { primary: 0xb91c1c, secondary: 0x991b1b },       // 深红（尾针）
};

// 秒杀动画配置
const EXECUTION_ANIM_CONFIG = {
  duration: 1200,            // 总持续时间 (ms)
  shakeCount: 4,             // 上下摇晃次数（2次完整来回）
  shakeDuration: 700,        // 摇晃阶段持续时间 (ms)
  shakeAmplitudeY: 18,       // 上下摇晃幅度 (px)
  shakeAmplitudeX: 6,        // 水平轻微晃动幅度 (px)
  fadeOutDuration: 500,      // 飞出淡出持续时间 (ms)
  flingDistance: 80,         // 最终甩出距离 (px)
  flingAngle: -0.6,          // 甩出角度（弧度，斜上方）
};

// 秒杀动画数据
interface ExecutionAnimation {
  startTime: number;
  originalY: number;
  phase: 'shake' | 'fling'; // 上下摇晃 -> 飞出淡出
}

// 中毒粒子配置
const POISON_PARTICLE_CONFIG = {
  count: 6,              // 粒子数量
  color: 0x22c55e,       // 绿色
  minSize: 2,
  maxSize: 4,
  speed: 15,             // 上升速度
  lifespan: 800,         // 生命周期(ms)
  spawnRadius: 12,       // 生成半径
};

// 单个粒子数据
interface PoisonParticle {
  x: number;
  y: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
}

// 蜜液滩动画数据
interface HoneyPuddleAnim {
  x: number;
  y: number;
  startTime: number;
  duration: number;
  radius: number;
  sprite: PIXI.Graphics;
}

// 回复粒子数据
interface HealParticle {
  x: number;
  y: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  vy: number;
  vx: number;
}

// 回复粒子组（关联到某个蚂蚁）
interface HealParticleGroup {
  antId: string;
  particles: HealParticle[];
  startTime: number;
}

// 尾针甩尾动画数据
interface StingerAnimation {
  startTime: number;
  baseRotation: number;    // 动画开始时的原始朝向
}

export class PixiRenderer {
  private app: PIXI.Application;
  private antSprites: Map<string, PIXI.Container> = new Map();
  private hatcherySprites: Map<string, PIXI.Container> = new Map();
  private projectileSprites: Map<string, PIXI.Container> = new Map();
  private playerQueenSprite: PIXI.Container | null = null;
  private enemyQueenSprite: PIXI.Container | null = null;
  private groundGraphics: PIXI.Graphics | null = null;
  private battleLine: PIXI.Graphics | null = null;
  private buildZoneGraphics: PIXI.Graphics | null = null;

  // 中毒粒子系统
  private poisonParticles: Map<string, PoisonParticle[]> = new Map();
  private lastParticleTime: number = 0;

  // 秒杀动画系统
  private executionAnimations: Map<string, ExecutionAnimation> = new Map();

  // 尾针甩尾动画系统
  private stingerAnimations: Map<string, StingerAnimation> = new Map();

  // 蜜罐爆炸动画系统
  private honeyPuddles: HoneyPuddleAnim[] = [];
  private healParticleGroups: HealParticleGroup[] = [];
  private healParticleGraphics: PIXI.Graphics | null = null;

  // 孵化室悬浮提示
  private tooltipContainer: PIXI.Container | null = null;
  private tooltipBg: PIXI.Graphics | null = null;
  private tooltipText: PIXI.Text | null = null;
  private hoveredHatcheryId: string | null = null;

  constructor(app: PIXI.Application) {
    this.app = app;
    this.lastParticleTime = performance.now();
    this.setupScene();
  }

  private setupScene() {
    // 创建背景
    const background = new PIXI.Graphics();
    background.beginFill(COLORS.background);
    background.drawRect(0, 0, GAME_CONFIG.mapWidth, GAME_CONFIG.mapHeight);
    background.endFill();
    this.app.stage.addChild(background);

    // 创建地面
    this.groundGraphics = new PIXI.Graphics();
    this.drawGround();
    this.app.stage.addChild(this.groundGraphics);

    // 创建建造区域
    this.buildZoneGraphics = new PIXI.Graphics();
    this.drawBuildZones();
    this.app.stage.addChild(this.buildZoneGraphics);

    // 创建战线标记
    this.battleLine = new PIXI.Graphics();
    this.drawBattleLine();
    this.app.stage.addChild(this.battleLine);

    // 创建蚁后
    this.playerQueenSprite = this.createQueenSprite('player');
    this.playerQueenSprite.position.set(
      QUEEN_CONFIG.playerPosition.x,
      QUEEN_CONFIG.playerPosition.y
    );
    this.app.stage.addChild(this.playerQueenSprite);

    this.enemyQueenSprite = this.createQueenSprite('enemy');
    this.enemyQueenSprite.position.set(
      QUEEN_CONFIG.enemyPosition.x,
      QUEEN_CONFIG.enemyPosition.y
    );
    this.app.stage.addChild(this.enemyQueenSprite);

    // 创建回复粒子图层（在最上层）
    this.healParticleGraphics = new PIXI.Graphics();
    this.app.stage.addChild(this.healParticleGraphics);

    // 创建孵化室悬浮提示
    this.setupTooltip();
  }

  /**
   * 创建孵化室悬浮提示容器
   */
  private setupTooltip() {
    this.tooltipContainer = new PIXI.Container();
    this.tooltipContainer.visible = false;

    this.tooltipBg = new PIXI.Graphics();
    this.tooltipContainer.addChild(this.tooltipBg);

    this.tooltipText = new PIXI.Text('', new PIXI.TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 12,
      fill: '#ffffff',
      lineHeight: 18,
    }));
    this.tooltipText.position.set(8, 6);
    this.tooltipContainer.addChild(this.tooltipText);

    this.app.stage.addChild(this.tooltipContainer);
  }

  /**
   * 显示孵化室悬浮提示（鼠标悬停时）
   */
  private showHatcheryTooltip(hatcheryId: string, sprite: PIXI.Container) {
    if (!this.tooltipContainer || !this.tooltipText || !this.tooltipBg) return;

    const state = useGameStore.getState();
    const hatchery = state.hatcheries.find(h => h.id === hatcheryId);
    if (!hatchery) return;

    // 查找部件中文名称
    const headName = getHeadConfig(hatchery.template.head).nameCN;
    const thoraxName = getThoraxConfig(hatchery.template.thorax).nameCN;
    const abdomenName = getAbdomenConfig(hatchery.template.abdomen).nameCN;

    const sideLabel = hatchery.side === 'player' ? '我方' : '敌方';
    this.tooltipText.text = `${sideLabel}孵化室 Lv.${hatchery.level}\n头: ${headName}\n胸: ${thoraxName}\n腹: ${abdomenName}`;

    // 重新绘制背景
    const padding = 8;
    const bgWidth = this.tooltipText.width + padding * 2;
    const bgHeight = this.tooltipText.height + padding * 2;

    this.tooltipBg.clear();
    this.tooltipBg.beginFill(0x1a1a2e, 0.92);
    this.tooltipBg.lineStyle(1, 0x888888, 0.6);
    this.tooltipBg.drawRoundedRect(0, 0, bgWidth, bgHeight, 6);
    this.tooltipBg.endFill();

    this.tooltipText.position.set(padding, padding);

    // 定位到孵化室上方
    const halfGrid = GAME_CONFIG.gridSize / 2;
    let x = sprite.position.x - bgWidth / 2;
    let y = sprite.position.y - halfGrid - bgHeight - 5;

    // 限制水平边界
    x = Math.max(5, Math.min(GAME_CONFIG.mapWidth - bgWidth - 5, x));
    // 如果上方空间不够，显示在下方
    if (y < 5) {
      y = sprite.position.y + halfGrid + 5;
    }

    this.tooltipContainer.position.set(x, y);
    this.tooltipContainer.visible = true;
    this.hoveredHatcheryId = hatcheryId;
  }

  /**
   * 隐藏孵化室悬浮提示
   */
  private hideHatcheryTooltip() {
    if (this.tooltipContainer) {
      this.tooltipContainer.visible = false;
    }
    this.hoveredHatcheryId = null;
  }

  private drawGround() {
    if (!this.groundGraphics) return;

    this.groundGraphics.clear();

    const mapWidth = GAME_CONFIG.mapWidth;
    const mapHeight = GAME_CONFIG.mapHeight;
    const hillWidth = mapWidth * 0.3; // 两侧蚁穴各占30%宽度
    const grassStart = hillWidth;
    const grassEnd = mapWidth - hillWidth;

    // ========== 绘制蚁穴区域（两侧） ==========
    // 玩家侧蚁穴（左侧）
    this.drawAntHill(0, 0, hillWidth, mapHeight, 'player');

    // 敌方侧蚁穴（右侧）
    this.drawAntHill(grassEnd, 0, hillWidth, mapHeight, 'enemy');

    // ========== 绘制草坪区域（中间） ==========
    // 基础草坪
    this.groundGraphics.beginFill(COLORS.grass.medium, 1);
    this.groundGraphics.drawRect(grassStart, 0, grassEnd - grassStart, mapHeight);
    this.groundGraphics.endFill();

    // 草地纹理 - 随机草丛斑块
    this.drawGrassTexture(grassStart, 0, grassEnd - grassStart, mapHeight);

    // 蚁穴与草坪的过渡区域（边缘模糊效果）
    this.drawTransitionZone(grassStart - 30, 0, 60, mapHeight, 'left');
    this.drawTransitionZone(grassEnd - 30, 0, 60, mapHeight, 'right');

    // 地面上的草地线条（模拟草地纹理）
    this.groundGraphics.lineStyle(2, COLORS.grass.dark, 0.4);
    for (let y = 20; y < mapHeight; y += 30) {
      // 左侧蚁穴区域
      this.groundGraphics.moveTo(20, y + Math.random() * 10);
      this.groundGraphics.lineTo(60 + Math.random() * 20, y + Math.random() * 10);
      // 右侧蚁穴区域
      this.groundGraphics.moveTo(grassEnd + 20 + Math.random() * 20, y + Math.random() * 10);
      this.groundGraphics.lineTo(grassEnd + 60 + Math.random() * 20, y + Math.random() * 10);
    }
  }

  /**
   * 绘制蚁穴区域
   */
  private drawAntHill(x: number, y: number, width: number, height: number, side: 'player' | 'enemy') {
    if (!this.groundGraphics) return;

    const colors = COLORS.antHill;
    const accentColor = side === 'player' ? 0x4a3020 : 0x3a2520;

    // 基础深色地面
    this.groundGraphics.beginFill(colors.dark, 1);
    this.groundGraphics.drawRect(x, y, width, height);
    this.groundGraphics.endFill();

    // 蚁穴纹理 - 泥土层
    this.groundGraphics.beginFill(colors.medium, 0.6);
    for (let i = 0; i < 8; i++) {
      const layerY = 50 + i * 70;
      const layerWidth = width * (0.7 + Math.random() * 0.3);
      const layerX = x + (width - layerWidth) / 2;
      this.groundGraphics.drawEllipse(layerX + layerWidth / 2, layerY, layerWidth / 2, 15 + Math.random() * 10);
    }
    this.groundGraphics.endFill();

    // 岩石/泥土块点缀
    this.groundGraphics.beginFill(colors.texture, 0.8);
    for (let i = 0; i < 15; i++) {
      const dotX = x + Math.random() * width;
      const dotY = 30 + Math.random() * (height - 60);
      const dotSize = 3 + Math.random() * 8;
      this.groundGraphics.drawCircle(dotX, dotY, dotSize);
    }
    this.groundGraphics.endFill();

    // 浅色高光点（模拟光照）
    this.groundGraphics.beginFill(colors.accent, 0.3);
    for (let i = 0; i < 10; i++) {
      const highlightX = x + 20 + Math.random() * (width - 40);
      const highlightY = 20 + Math.random() * (height - 40);
      this.groundGraphics.drawCircle(highlightX, highlightY, 1 + Math.random() * 2);
    }
    this.groundGraphics.endFill();
  }

  /**
   * 绘制草地纹理
   */
  private drawGrassTexture(x: number, y: number, width: number, height: number) {
    if (!this.groundGraphics) return;

    // 草地深浅斑块
    for (let i = 0; i < 20; i++) {
      const patchX = x + Math.random() * width;
      const patchY = Math.random() * height;
      const patchWidth = 30 + Math.random() * 80;
      const patchHeight = 20 + Math.random() * 40;
      const isDark = Math.random() > 0.5;

      this.groundGraphics.beginFill(isDark ? COLORS.grass.dark : COLORS.grass.light, 0.4);
      this.groundGraphics.drawEllipse(patchX, patchY, patchWidth / 2, patchHeight / 2);
      this.groundGraphics.endFill();
    }

    // 草地边缘虚化
    this.groundGraphics.lineStyle(3, COLORS.grass.dark, 0.2);
    for (let i = 0; i < 5; i++) {
      const lineY = 100 + i * 100;
      this.groundGraphics.moveTo(x, lineY);
      for (let lineX = x; lineX < x + width; lineX += 20) {
        this.groundGraphics.lineTo(lineX + 10, lineY + (Math.random() - 0.5) * 10);
      }
    }
  }

  /**
   * 绘制过渡区域（蚁穴到草坪的渐变）
   */
  private drawTransitionZone(x: number, y: number, width: number, height: number, direction: 'left' | 'right') {
    if (!this.groundGraphics) return;

    const gradientSteps = 5;
    const stepWidth = width / gradientSteps;

    for (let i = 0; i < gradientSteps; i++) {
      const alpha = 0.3 - i * 0.06;
      const gradientColor = COLORS.grass.medium;

      this.groundGraphics.beginFill(gradientColor, alpha);
      this.groundGraphics.drawRect(x + i * stepWidth, y, stepWidth + 1, height);
      this.groundGraphics.endFill();
    }
  }

  private drawBuildZones() {
    if (!this.buildZoneGraphics) return;

    this.buildZoneGraphics.clear();

    const { gridSize, gridCols, gridRows } = GAME_CONFIG;

    // 绘制玩家建造区
    this.drawBuildZone(BUILD_ZONE.player.startX, BUILD_ZONE.player.startY, COLORS.player.primary);

    // 绘制敌方建造区
    this.drawBuildZone(BUILD_ZONE.enemy.startX, BUILD_ZONE.enemy.startY, COLORS.enemy.primary);
  }

  private drawBuildZone(startX: number, startY: number, color: number) {
    if (!this.buildZoneGraphics) return;

    const { gridSize, gridCols, gridRows } = GAME_CONFIG;

    // 绘制格子
    for (let col = 0; col < gridCols; col++) {
      for (let row = 0; row < gridRows; row++) {
        const x = startX + col * gridSize;
        const y = startY + row * gridSize;

        // 格子背景
        this.buildZoneGraphics.beginFill(COLORS.grid, 0.3);
        this.buildZoneGraphics.lineStyle(1, color, 0.3);
        this.buildZoneGraphics.drawRect(x, y, gridSize - 2, gridSize - 2);
        this.buildZoneGraphics.endFill();
      }
    }
  }

  private drawBattleLine() {
    if (!this.battleLine) return;

    this.battleLine.clear();

    const centerX = GAME_CONFIG.mapWidth / 2;

    // 中线
    this.battleLine.lineStyle(2, COLORS.accent, 0.3);
    this.battleLine.moveTo(centerX, 100);
    this.battleLine.lineTo(centerX, 500);

    // 脉冲效果
    const time = Date.now() / 1000;
    const pulse = Math.sin(time * 2) * 0.2 + 0.3;
    this.battleLine.lineStyle(4, COLORS.accent, pulse);
    this.battleLine.moveTo(centerX, 200);
    this.battleLine.lineTo(centerX, 400);
  }

  private createQueenSprite(side: Side): PIXI.Container {
    const container = new PIXI.Container();
    const colors = side === 'player' ? COLORS.player : COLORS.enemy;

    // 蚁后主体 - 六边形建筑风格
    const body = new PIXI.Graphics();

    // 外发光
    body.beginFill(colors.glow, 0.2);
    body.drawPolygon([
      0, -55,
      48, -27,
      48, 27,
      0, 55,
      -48, 27,
      -48, -27,
    ]);
    body.endFill();

    // 主体
    body.beginFill(colors.primary);
    body.lineStyle(3, colors.secondary);
    body.drawPolygon([
      0, -45,
      39, -22,
      39, 22,
      0, 45,
      -39, 22,
      -39, -22,
    ]);
    body.endFill();

    // 内部装饰
    body.beginFill(colors.glow, 0.5);
    body.drawCircle(0, 0, 20);
    body.endFill();

    // 皇冠标记
    body.lineStyle(2, 0xffd700);
    body.moveTo(-15, -15);
    body.lineTo(-10, -25);
    body.lineTo(0, -15);
    body.lineTo(10, -25);
    body.lineTo(15, -15);

    container.addChild(body);

    // 血条背景
    const hpBarBg = new PIXI.Graphics();
    hpBarBg.beginFill(0x000000, 0.7);
    hpBarBg.drawRoundedRect(-40, -70, 80, 10, 3);
    hpBarBg.endFill();
    hpBarBg.name = 'hpBarBg';
    container.addChild(hpBarBg);

    // 血条
    const hpBar = new PIXI.Graphics();
    hpBar.beginFill(colors.primary);
    hpBar.drawRoundedRect(-38, -68, 76, 6, 2);
    hpBar.endFill();
    hpBar.name = 'hpBar';
    container.addChild(hpBar);

    return container;
  }

  private createHatcherySprite(hatchery: Hatchery): PIXI.Container {
    const container = new PIXI.Container();
    const colors = hatchery.side === 'player' ? COLORS.player : COLORS.enemy;
    const size = GAME_CONFIG.gridSize - 4;

    // 根据等级选择颜色
    const levelColors = [
      { border: colors.primary, fill: COLORS.hatchery },     // 1级
      { border: 0xf59e0b, fill: 0x78350f },                  // 2级 - 金色
      { border: 0xa855f7, fill: 0x581c87 },                  // 3级 - 紫色
    ];
    const levelColor = levelColors[Math.min(hatchery.level - 1, 2)];

    const body = new PIXI.Graphics();
    body.name = 'body';

    // 孵化室背景
    body.beginFill(levelColor.fill, 0.8);
    body.lineStyle(2 + hatchery.level, levelColor.border);
    body.drawRoundedRect(-size / 2, -size / 2, size, size, 6);
    body.endFill();

    // 内部圆形（代表孵化中的蚂蚁）- 大小随等级增加
    const innerRadius = size / 4 + (hatchery.level - 1) * 2;
    body.beginFill(colors.primary, 0.6 + hatchery.level * 0.1);
    body.drawCircle(0, 0, innerRadius);
    body.endFill();

    // 发光边框 - 等级越高越亮
    body.lineStyle(1, colors.glow, 0.3 + hatchery.level * 0.2);
    body.drawRoundedRect(-size / 2 + 3, -size / 2 + 3, size - 6, size - 6, 4);

    // 等级标识（星星）
    if (hatchery.level > 1) {
      body.lineStyle(0);
      body.beginFill(0xffd700);
      for (let i = 0; i < hatchery.level; i++) {
        const starX = -size / 2 + 8 + i * 10;
        const starY = -size / 2 + 8;
        body.drawCircle(starX, starY, 3);
      }
      body.endFill();
    }

    container.addChild(body);

    // 进度条背景
    const progressBg = new PIXI.Graphics();
    progressBg.beginFill(0x000000, 0.5);
    progressBg.drawRect(-size / 2 + 2, size / 2 - 6, size - 4, 4);
    progressBg.endFill();
    container.addChild(progressBg);

    // 进度条
    const progressBar = new PIXI.Graphics();
    progressBar.name = 'progressBar';
    container.addChild(progressBar);

    // 保存等级用于检测变化
    (container as any).hatcheryLevel = hatchery.level;

    // 添加鼠标悬浮交互（显示蚂蚁组成提示）
    container.eventMode = 'static';
    container.hitArea = new PIXI.Rectangle(-size / 2, -size / 2, size, size);
    (container as any).hatcheryId = hatchery.id;
    container.on('pointerover', () => {
      this.showHatcheryTooltip(hatchery.id, container);
    });
    container.on('pointerout', () => {
      this.hideHatcheryTooltip();
    });

    return container;
  }

  private createAntSprite(ant: Ant): PIXI.Container {
    const container = new PIXI.Container();
    const sideColors = ant.side === 'player' ? COLORS.player : COLORS.enemy;
    const sideGlow = sideColors.glow;

    // 获取各部件颜色（使用类型断言）
    const headVariant = ant.parts.head.variant as HeadVariant;
    const thoraxVariant = ant.parts.thorax.variant as ThoraxVariant;
    const abdomenVariant = ant.parts.abdomen.variant as AbdomenVariant;

    const headColor = HEAD_COLORS[headVariant];
    const thoraxColor = THORAX_COLORS[thoraxVariant];
    const abdomenColor = ABDOMEN_COLORS[abdomenVariant];

    // 蚂蚁身体容器（用于旋转）
    const bodyContainer = new PIXI.Container();
    bodyContainer.name = 'bodyContainer';

    // 蚂蚁由三部分组成：头(前)、胸(中)、腹(后)
    // 默认头朝右（正X方向，0度）

    // ========== 腹部 (最后面) ==========
    const abdomen = new PIXI.Graphics();

    // 绘制不同类型的腹部
    this.drawAbdomen(abdomen, abdomenVariant, abdomenColor, sideGlow);
    bodyContainer.addChild(abdomen);

    // ========== 胸部 (中间) ==========
    const thorax = new PIXI.Graphics();

    // 绘制不同类型的胸部
    this.drawThorax(thorax, thoraxVariant, thoraxColor, sideGlow);
    bodyContainer.addChild(thorax);

    // ========== 头部 (最前面) ==========
    const head = new PIXI.Graphics();

    // 绘制不同类型的头部
    this.drawHead(head, headVariant, headColor, sideGlow);
    bodyContainer.addChild(head);

    // 腿部（统一绘制，在胸部下方）
    const legs = new PIXI.Graphics();
    legs.lineStyle(1.5, sideColors.secondary);
    for (let i = -1; i <= 1; i++) {
      const legX = i * 6;
      legs.moveTo(legX, -6);
      legs.lineTo(legX + 4, -14);
      legs.moveTo(legX, 6);
      legs.lineTo(legX + 4, 14);
    }
    bodyContainer.addChildAt(legs, 0); // 放在最底层

    container.addChild(bodyContainer);

    // 血条
    const hpBarBg = new PIXI.Graphics();
    hpBarBg.beginFill(0x000000, 0.7);
    hpBarBg.drawRoundedRect(-15, -22, 30, 5, 2);
    hpBarBg.endFill();
    container.addChild(hpBarBg);

    const hpBar = new PIXI.Graphics();
    hpBar.beginFill(0x00ff00);
    hpBar.drawRoundedRect(-14, -21, 28, 3, 1);
    hpBar.endFill();
    hpBar.name = 'hpBar';
    container.addChild(hpBar);

    // 中毒粒子效果容器
    const poisonContainer = new PIXI.Graphics();
    poisonContainer.name = 'poisonParticles';
    poisonContainer.visible = false;
    container.addChild(poisonContainer);

    // 护甲光环效果容器
    const armorGlow = new PIXI.Graphics();
    armorGlow.name = 'armorGlow';
    armorGlow.visible = false;
    container.addChildAt(armorGlow, 0); // 放在最底层

    container.name = ant.id;

    return container;
  }

  /**
   * 绘制不同类型的前部（影响攻击力）
   */
  private drawHead(graphics: PIXI.Graphics, variant: HeadVariant, color: { primary: number; secondary: number }, glow: number) {
    const { primary, secondary } = color;

    switch (variant) {
      case 'basic':
        // 标准头部 - 椭圆形
        graphics.beginFill(primary);
        graphics.drawEllipse(12, 0, 7, 5);
        graphics.endFill();
        // 眼睛
        graphics.beginFill(0xffffff);
        graphics.drawCircle(14, -2, 1.5);
        graphics.drawCircle(14, 2, 1.5);
        graphics.endFill();
        break;

      case 'leafcutter':
        // 切叶蚁头 - 较大，有锋利大颚
        graphics.beginFill(primary);
        graphics.drawEllipse(12, 0, 8, 6);
        graphics.endFill();
        // 大颚（锋利的剪刀状）
        graphics.lineStyle(2, secondary);
        graphics.moveTo(18, -2);
        graphics.lineTo(24, -6);
        graphics.lineTo(20, 0);
        graphics.lineTo(24, 6);
        graphics.lineTo(18, 2);
        // 眼睛
        graphics.beginFill(0xffffff);
        graphics.drawCircle(14, -3, 1.5);
        graphics.drawCircle(14, 3, 1.5);
        graphics.endFill();
        break;

      case 'soldier':
        // 兵蚁头 - 大型厚重，深红色
        graphics.beginFill(primary);
        graphics.drawEllipse(11, 0, 9, 7);
        graphics.endFill();
        // 厚重的大颚
        graphics.beginFill(secondary);
        graphics.moveTo(18, -4);
        graphics.lineTo(26, -2);
        graphics.lineTo(26, 2);
        graphics.lineTo(18, 4);
        graphics.endFill();
        // 眼睛
        graphics.beginFill(0x000000);
        graphics.drawCircle(13, -3, 1.5);
        graphics.drawCircle(13, 3, 1.5);
        graphics.endFill();
        break;

      case 'fire':
        // 火蚁头 - 橙红色，火焰纹
        graphics.beginFill(primary);
        graphics.drawEllipse(12, 0, 7, 5);
        graphics.endFill();
        // 火焰纹理
        graphics.beginFill(secondary);
        graphics.drawCircle(16, -1, 2);
        graphics.drawCircle(15, 1, 1.5);
        graphics.endFill();
        // 毒牙
        graphics.lineStyle(1.5, 0xffffff);
        graphics.moveTo(17, -2);
        graphics.lineTo(22, -4);
        graphics.moveTo(17, 2);
        graphics.lineTo(22, 4);
        // 眼睛
        graphics.beginFill(0xff0000);
        graphics.drawCircle(14, -2, 1.5);
        graphics.drawCircle(14, 2, 1.5);
        graphics.endFill();
        break;

      case 'odontomachus':
        // 大齿猛蚁头 - 紫蓝色，弹射大颚
        graphics.beginFill(primary);
        graphics.drawEllipse(12, 0, 8, 6);
        graphics.endFill();
        // 弹射大颚（张开状态）
        graphics.lineStyle(2.5, secondary);
        graphics.moveTo(18, -3);
        graphics.lineTo(26, -8);
        graphics.moveTo(18, 3);
        graphics.lineTo(26, 8);
        // 眼睛
        graphics.beginFill(0x000000);
        graphics.drawCircle(14, -2, 2);
        graphics.drawCircle(14, 2, 2);
        graphics.endFill();
        break;

      case 'termiteSoldier':
        // 白蚁大兵头 - 白色/米色，大型头部
        graphics.beginFill(primary);
        graphics.drawEllipse(11, 0, 10, 7);
        graphics.endFill();
        // 巨颚
        graphics.beginFill(secondary);
        graphics.moveTo(18, -5);
        graphics.lineTo(24, -3);
        graphics.lineTo(24, 3);
        graphics.lineTo(18, 5);
        graphics.endFill();
        // 眼睛（小）
        graphics.beginFill(0x000000);
        graphics.drawCircle(13, -2, 1);
        graphics.drawCircle(13, 2, 1);
        graphics.endFill();
        break;

      case 'bigHead':
        // 大头蚁头 - 紫色，超大头部
        graphics.beginFill(primary);
        graphics.drawEllipse(10, 0, 11, 9);
        graphics.endFill();
        // 发光效果
        graphics.beginFill(glow, 0.3);
        graphics.drawEllipse(10, 0, 13, 11);
        graphics.endFill();
        // 眼睛
        graphics.beginFill(0x000000);
        graphics.drawCircle(13, -4, 2);
        graphics.drawCircle(13, 4, 2);
        graphics.endFill();
        // 高光
        graphics.beginFill(0xffffff, 0.5);
        graphics.drawCircle(7, -3, 2);
        graphics.endFill();
        break;
    }

    // 触角（统一）
    graphics.lineStyle(1.5, glow);
    graphics.moveTo(16, -4);
    graphics.lineTo(22, -10);
    graphics.moveTo(16, 4);
    graphics.lineTo(22, 10);
  }

  /**
   * 绘制不同类型的胸部（影响移速）
   */
  private drawThorax(graphics: PIXI.Graphics, variant: ThoraxVariant, color: { primary: number; secondary: number }, glow: number) {
    const { primary, secondary } = color;

    switch (variant) {
      case 'basic':
        // 标准胸部 - 椭圆形
        graphics.beginFill(primary);
        graphics.drawEllipse(0, 0, 6, 5);
        graphics.endFill();
        break;

      case 'army':
        // 行军蚁胸 - 深蓝色，流线型（适合高速移动）
        graphics.beginFill(primary);
        graphics.drawEllipse(0, 0, 7, 4);
        graphics.endFill();
        // 速度线
        graphics.lineStyle(1, secondary);
        graphics.moveTo(-4, -3);
        graphics.lineTo(-8, -3);
        graphics.moveTo(-4, 0);
        graphics.lineTo(-9, 0);
        graphics.moveTo(-4, 3);
        graphics.lineTo(-8, 3);
        break;

      case 'carpenter':
        // 木蚁胸 - 棕色，强健
        graphics.beginFill(primary);
        graphics.drawEllipse(0, 0, 7, 6);
        graphics.endFill();
        // 木纹质感
        graphics.beginFill(secondary, 0.5);
        graphics.drawEllipse(-1, -2, 3, 2);
        graphics.drawEllipse(1, 2, 2, 1.5);
        graphics.endFill();
        break;

      case 'bullet':
        // 子弹蚁胸 - 金黄色，极速型，纺锤形
        graphics.beginFill(primary);
        graphics.drawEllipse(0, 0, 8, 4);
        graphics.endFill();
        // 光泽效果
        graphics.beginFill(0xffffff, 0.4);
        graphics.drawEllipse(-2, -1, 3, 1.5);
        graphics.endFill();
        // 速度箭头
        graphics.lineStyle(1.5, secondary);
        graphics.moveTo(-5, 0);
        graphics.lineTo(-10, 0);
        graphics.lineTo(-8, -2);
        graphics.moveTo(-10, 0);
        graphics.lineTo(-8, 2);
        break;

      case 'leafcutter':
        // 切叶蚁胸 - 深绿色，坚甲坦克
        graphics.beginFill(primary);
        graphics.drawEllipse(0, 0, 8, 7);
        graphics.endFill();
        // 甲壳纹理
        graphics.lineStyle(1, secondary);
        graphics.drawEllipse(0, 0, 6, 5);
        // 护甲条纹
        graphics.lineStyle(2, secondary, 0.6);
        graphics.moveTo(-3, -5);
        graphics.lineTo(-3, 5);
        graphics.moveTo(3, -5);
        graphics.lineTo(3, 5);
        break;
    }
  }

  /**
   * 绘制不同类型的腹部（影响生命值）
   */
  private drawAbdomen(graphics: PIXI.Graphics, variant: AbdomenVariant, color: { primary: number; secondary: number }, glow: number) {
    const { primary, secondary } = color;

    switch (variant) {
      case 'basic':
        // 标准腹部 - 椭圆形
        graphics.beginFill(primary);
        graphics.drawEllipse(-12, 0, 10, 7);
        graphics.endFill();
        break;

      case 'honeypot':
        // 蜜罐蚁腹 - 金黄色，膨胀的蜜罐形状
        graphics.beginFill(primary);
        graphics.drawEllipse(-10, 0, 12, 10);
        graphics.endFill();
        // 蜜液光泽
        graphics.beginFill(0xffffff, 0.3);
        graphics.drawEllipse(-12, -3, 5, 4);
        graphics.endFill();
        // 高光点
        graphics.beginFill(0xffffff, 0.6);
        graphics.drawCircle(-14, -4, 2);
        graphics.endFill();
        break;

      case 'weaver':
        // 织叶蚁腹 - 浅绿色，灵活
        graphics.beginFill(primary);
        graphics.drawEllipse(-11, 0, 10, 6);
        graphics.endFill();
        // 灵活环纹
        graphics.lineStyle(1.5, secondary);
        graphics.drawEllipse(-11, 0, 8, 4);
        break;

      case 'trap':
        // 陷阱蚁腹 - 橙色，爆发型
        graphics.beginFill(primary);
        graphics.drawEllipse(-11, 0, 11, 8);
        graphics.endFill();
        // 条纹
        graphics.lineStyle(2, secondary);
        graphics.moveTo(-16, -4);
        graphics.lineTo(-8, -4);
        graphics.moveTo(-17, 0);
        graphics.lineTo(-7, 0);
        graphics.moveTo(-16, 4);
        graphics.lineTo(-8, 4);
        break;

      case 'spitter':
        // 木蚁腹 - 深绿色，喷酸型
        graphics.beginFill(primary);
        graphics.drawEllipse(-11, 0, 10, 7);
        graphics.endFill();
        // 喷酸腺标记
        graphics.beginFill(secondary);
        graphics.drawCircle(-16, 0, 3);
        graphics.endFill();
        // 酸液滴
        graphics.beginFill(glow, 0.5);
        graphics.drawEllipse(-19, 0, 2, 3);
        graphics.endFill();
        break;

      case 'matabele':
        // 马塔贝勒蚁腹 - 深红色，尾针型
        graphics.beginFill(primary);
        graphics.drawEllipse(-11, 0, 11, 8);
        graphics.endFill();
        // 尾针
        graphics.lineStyle(2.5, secondary);
        graphics.moveTo(-20, 0);
        graphics.lineTo(-28, 0);
        // 尾针上的毒滴
        graphics.beginFill(0x00ff00, 0.7);
        graphics.drawCircle(-27, 0, 2);
        graphics.endFill();
        // 环纹
        graphics.lineStyle(1, secondary, 0.5);
        graphics.drawEllipse(-11, 0, 9, 6);
        break;
    }
  }

  /**
   * 创建中毒粒子
   */
  private createPoisonParticle(antId: string): PoisonParticle {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * POISON_PARTICLE_CONFIG.spawnRadius;

    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      size: POISON_PARTICLE_CONFIG.minSize + Math.random() * (POISON_PARTICLE_CONFIG.maxSize - POISON_PARTICLE_CONFIG.minSize),
      alpha: 0.7 + Math.random() * 0.3,
      life: POISON_PARTICLE_CONFIG.lifespan,
      maxLife: POISON_PARTICLE_CONFIG.lifespan,
      vx: (Math.random() - 0.5) * 8,
      vy: -POISON_PARTICLE_CONFIG.speed - Math.random() * 10,
    };
  }

  /**
   * 更新中毒粒子效果
   */
  private updatePoisonParticles(ant: Ant, sprite: PIXI.Container, deltaTime: number) {
    const poisonContainer = sprite.getChildByName('poisonParticles') as PIXI.Graphics;
    if (!poisonContainer) return;

    // 检查是否有中毒 buff
    const hasPoisonBuff = ant.buffs.some(buff => buff.type === 'poison');

    if (!hasPoisonBuff) {
      // 没有中毒，隐藏粒子并清除数据
      poisonContainer.visible = false;
      this.poisonParticles.delete(ant.id);
      return;
    }

    // 有中毒效果，显示粒子
    poisonContainer.visible = true;

    // 获取或创建粒子数组
    let particles = this.poisonParticles.get(ant.id);
    if (!particles) {
      particles = [];
      this.poisonParticles.set(ant.id, particles);
    }

    const deltaMs = deltaTime * 1000;

    // 生成新粒子
    const spawnInterval = 100; // 每100ms生成一个粒子
    if (particles.length < POISON_PARTICLE_CONFIG.count) {
      particles.push(this.createPoisonParticle(ant.id));
    }

    // 更新粒子
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      // 更新位置
      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;

      // 更新生命
      p.life -= deltaMs;

      // 淡出效果
      p.alpha = (p.life / p.maxLife) * 0.8;

      // 移除死亡粒子
      if (p.life <= 0) {
        particles.splice(i, 1);
        // 立即补充新粒子
        particles.push(this.createPoisonParticle(ant.id));
      }
    }

    // 绘制粒子
    poisonContainer.clear();
    for (const p of particles) {
      // 外发光
      poisonContainer.beginFill(POISON_PARTICLE_CONFIG.color, p.alpha * 0.3);
      poisonContainer.drawCircle(p.x, p.y, p.size * 1.5);
      poisonContainer.endFill();

      // 主体
      poisonContainer.beginFill(POISON_PARTICLE_CONFIG.color, p.alpha);
      poisonContainer.drawCircle(p.x, p.y, p.size);
      poisonContainer.endFill();
    }
  }

  update() {
    const state = useGameStore.getState();

    // 计算 deltaTime
    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastParticleTime) / 1000;
    this.lastParticleTime = currentTime;

    // 更新战线动画
    this.drawBattleLine();

    // 更新蚁后血条
    this.updateQueenHpBar('player', state.playerQueen.hp, state.playerQueen.maxHp);
    this.updateQueenHpBar('enemy', state.enemyQueen.hp, state.enemyQueen.maxHp);

    // 同步孵化室精灵
    this.updateHatcheries(state.hatcheries);

    // 同步蚂蚁精灵
    const currentAntIds = new Set(state.ants.map(a => a.id));

    // 移除已不存在的蚂蚁
    for (const [id, sprite] of this.antSprites) {
      if (!currentAntIds.has(id)) {
        this.app.stage.removeChild(sprite);
        this.antSprites.delete(id);
        // 清理对应的粒子数据和动画数据
        this.poisonParticles.delete(id);
        this.stingerAnimations.delete(id);
      }
    }

    // 更新或创建蚂蚁精灵
    for (const ant of state.ants) {
      let sprite = this.antSprites.get(ant.id);

      if (!sprite) {
        sprite = this.createAntSprite(ant);
        this.app.stage.addChild(sprite);
        this.antSprites.set(ant.id, sprite);
      }

      // 更新位置
      sprite.position.set(ant.position.x, ant.position.y);

      // 更新身体旋转
      const bodyContainer = sprite.getChildByName('bodyContainer') as PIXI.Container;
      if (bodyContainer) {
        bodyContainer.rotation = ant.rotation;
      }

      // 更新尾针甩尾动画（覆盖身体旋转）
      this.updateStingerAnimation(ant, sprite);

      // 更新血条
      this.updateAntHpBar(sprite, ant.hp, ant.maxHp);

      // 战斗状态时添加抖动效果
      if (ant.state === 'fighting') {
        sprite.position.x += (Math.random() - 0.5) * 4;
        sprite.position.y += (Math.random() - 0.5) * 3;
      }

      // 追击状态时添加轻微抖动表示激动
      if (ant.state === 'chasing') {
        sprite.position.x += (Math.random() - 0.5) * 1;
        sprite.position.y += (Math.random() - 0.5) * 1;
      }

      // 远程射击状态时添加后座力抖动
      if (ant.state === 'shooting') {
        const recoilX = -Math.cos(ant.rotation) * (Math.random() * 2);
        const recoilY = -Math.sin(ant.rotation) * (Math.random() * 2);
        sprite.position.x += recoilX;
        sprite.position.y += recoilY;
      }

      // 更新秒杀动画
      this.updateExecutionAnimation(ant, sprite);

      // 更新中毒粒子效果
      this.updatePoisonParticles(ant, sprite, deltaTime);

      // 更新护甲光环效果
      this.updateArmorGlow(ant, sprite);
    }

    // 处理尾针甩尾动画事件
    this.processStingerStrikeEvents();

    // 处理蜜罐爆炸动画事件
    this.processHoneypotExplosions();

    // 更新蜜液滩动画
    this.updateHoneyPuddles();

    // 更新回复粒子效果
    this.updateHealParticles(deltaTime);

    // 同步子弹精灵
    this.updateProjectiles(state.projectiles);

    // 孵化室提示：如果当前悬停的孵化室已不存在，隐藏提示
    if (this.hoveredHatcheryId && this.tooltipContainer?.visible) {
      const hatcheryExists = state.hatcheries.some(h => h.id === this.hoveredHatcheryId);
      if (!hatcheryExists) {
        this.hideHatcheryTooltip();
      }
    }

    // 确保提示框始终在最上层
    if (this.tooltipContainer?.visible && this.tooltipContainer.parent) {
      this.tooltipContainer.parent.setChildIndex(
        this.tooltipContainer,
        this.tooltipContainer.parent.children.length - 1
      );
    }
  }

  /**
   * 更新子弹渲染
   */
  private updateProjectiles(projectiles: Projectile[]) {
    const currentIds = new Set(projectiles.map(p => p.id));

    // 移除已不存在的子弹
    for (const [id, sprite] of this.projectileSprites) {
      if (!currentIds.has(id)) {
        this.app.stage.removeChild(sprite);
        this.projectileSprites.delete(id);
      }
    }

    // 更新或创建子弹精灵
    for (const projectile of projectiles) {
      let sprite = this.projectileSprites.get(projectile.id);

      if (!sprite) {
        sprite = this.createProjectileSprite(projectile);
        this.app.stage.addChild(sprite);
        this.projectileSprites.set(projectile.id, sprite);
      }

      // 更新位置和旋转
      sprite.position.set(projectile.position.x, projectile.position.y);
      sprite.rotation = projectile.rotation;
    }
  }

  /**
   * 创建子弹精灵（椭圆形酸液子弹 / 蚁后能量弹）
   */
  private createProjectileSprite(projectile: Projectile): PIXI.Container {
    const container = new PIXI.Container();

    const bullet = new PIXI.Graphics();

    if (projectile.isQueenProjectile) {
      // 蚁后能量弹 - 更大、使用阵营颜色
      const queenColors = projectile.side === 'player'
        ? COLORS.queenProjectile.player
        : COLORS.queenProjectile.enemy;

      // 外发光效果
      bullet.beginFill(queenColors.glow, 0.25);
      bullet.drawCircle(0, 0, 10);
      bullet.endFill();

      // 主体 - 圆形能量弹
      bullet.beginFill(queenColors.fill);
      bullet.drawCircle(0, 0, 6);
      bullet.endFill();

      // 内核高光
      bullet.beginFill(0xffffff, 0.7);
      bullet.drawCircle(-1, -1, 2.5);
      bullet.endFill();
    } else {
      // 普通蚂蚁酸液子弹
      // 外发光效果
      bullet.beginFill(COLORS.projectile.glow, 0.3);
      bullet.drawEllipse(0, 0, 10, 5);
      bullet.endFill();

      // 主体 - 椭圆形酸液
      bullet.beginFill(COLORS.projectile.fill);
      bullet.drawEllipse(0, 0, 7, 3);
      bullet.endFill();

      // 高光
      bullet.beginFill(0xffffff, 0.6);
      bullet.drawEllipse(-2, -1, 2, 1);
      bullet.endFill();
    }

    container.addChild(bullet);

    return container;
  }

  private updateHatcheries(hatcheries: Hatchery[]) {
    const currentIds = new Set(hatcheries.map(h => h.id));

    // 移除已不存在的孵化室
    for (const [id, sprite] of this.hatcherySprites) {
      if (!currentIds.has(id)) {
        this.app.stage.removeChild(sprite);
        this.hatcherySprites.delete(id);
      }
    }

    // 更新或创建孵化室精灵
    for (const hatchery of hatcheries) {
      let sprite = this.hatcherySprites.get(hatchery.id);

      // 检查等级是否变化，如果变化则重新创建精灵
      if (sprite && (sprite as any).hatcheryLevel !== hatchery.level) {
        this.app.stage.removeChild(sprite);
        this.hatcherySprites.delete(hatchery.id);
        sprite = undefined;
      }

      if (!sprite) {
        sprite = this.createHatcherySprite(hatchery);
        sprite.position.set(hatchery.position.x, hatchery.position.y);
        this.app.stage.addChild(sprite);
        this.hatcherySprites.set(hatchery.id, sprite);
      }

      // 更新进度条
      this.updateHatcheryProgress(sprite, hatchery);
    }
  }

  private updateHatcheryProgress(sprite: PIXI.Container, hatchery: Hatchery) {
    const progressBar = sprite.getChildByName('progressBar') as PIXI.Graphics;
    if (!progressBar) return;

    const size = GAME_CONFIG.gridSize - 4;
    // 动态孵化间隔：初始4秒，每过1分钟+1秒
    const state = useGameStore.getState();
    const minutesElapsed = Math.floor(state.stats.gameTime / 60000);
    const currentSpawnInterval = GAME_CONFIG.spawnInterval + minutesElapsed * 1000;
    const progress = 1 - (hatchery.spawnCooldown / currentSpawnInterval);
    const colors = hatchery.side === 'player' ? COLORS.player : COLORS.enemy;

    progressBar.clear();
    progressBar.beginFill(colors.primary);
    progressBar.drawRect(-size / 2 + 2, size / 2 - 6, (size - 4) * progress, 4);
    progressBar.endFill();
  }

  private updateQueenHpBar(side: Side, hp: number, maxHp: number) {
    const queenSprite = side === 'player' ? this.playerQueenSprite : this.enemyQueenSprite;
    if (!queenSprite) return;

    const hpBar = queenSprite.getChildByName('hpBar') as PIXI.Graphics;
    if (!hpBar) return;

    const hpPercent = hp / maxHp;
    const colors = side === 'player' ? COLORS.player : COLORS.enemy;

    hpBar.clear();
    hpBar.beginFill(colors.primary);
    hpBar.drawRoundedRect(-38, -68, 76 * hpPercent, 6, 2);
    hpBar.endFill();
  }

  private updateAntHpBar(sprite: PIXI.Container, hp: number, maxHp: number) {
    const hpBar = sprite.getChildByName('hpBar') as PIXI.Graphics;
    if (!hpBar) return;

    const hpPercent = hp / maxHp;

    // 根据血量改变颜色
    let color = 0x00ff00; // 绿色
    if (hpPercent < 0.5) color = 0xffff00; // 黄色
    if (hpPercent < 0.25) color = 0xff0000; // 红色

    hpBar.clear();
    hpBar.beginFill(color);
    hpBar.drawRoundedRect(-14, -19, 28 * hpPercent, 3, 1);
    hpBar.endFill();
  }

  /**
   * 更新护甲光环视觉效果
   */
  private updateArmorGlow(ant: Ant, sprite: PIXI.Container) {
    const armorGlow = sprite.getChildByName('armorGlow') as PIXI.Graphics;
    if (!armorGlow) return;

    // 检查是否有护甲（基础护甲或 armor buff）
    const hasArmorBuff = ant.buffs.some(buff => buff.type === 'armor');
    const hasArmor = ant.baseArmor > 0 || hasArmorBuff;

    if (!hasArmor) {
      armorGlow.visible = false;
      return;
    }

    armorGlow.visible = true;
    armorGlow.clear();

    const time = performance.now() / 1000;

    if (hasArmorBuff) {
      // 高护甲状态（80%）- 明亮的金色盾牌光环 + 脉冲效果
      const pulse = Math.sin(time * 4) * 0.15 + 0.55;
      armorGlow.lineStyle(2.5, 0xffd700, pulse);
      armorGlow.drawCircle(0, 0, 18);
      armorGlow.lineStyle(1.5, 0xffa500, pulse * 0.6);
      armorGlow.drawCircle(0, 0, 22);
    } else {
      // 基础护甲状态（20%）- 淡灰色光环
      const pulse = Math.sin(time * 2) * 0.08 + 0.25;
      armorGlow.lineStyle(1.5, 0xaaaaaa, pulse);
      armorGlow.drawCircle(0, 0, 17);
    }
  }

  /**
   * 消费 GameEngine 的尾针甩尾事件，创建动画
   */
  private processStingerStrikeEvents() {
    const engine = getGameEngine();
    if (engine.stingerStrikeEvents.length === 0) return;

    const state = useGameStore.getState();

    for (const event of engine.stingerStrikeEvents) {
      const ant = state.ants.find(a => a.id === event.antId);
      if (!ant || ant.state === 'dead') continue;

      // 如果已在动画中，跳过
      if (this.stingerAnimations.has(ant.id)) continue;

      this.stingerAnimations.set(ant.id, {
        startTime: event.time,
        baseRotation: ant.rotation,
      });
    }

    // 清空已消费的事件
    engine.stingerStrikeEvents.length = 0;
  }

  /**
   * 更新尾针甩尾动画（马塔贝勒蚁腹）
   * 蚂蚁快速180°转身（露出尾针扎向敌人），然后立即转回正面
   */
  private updateStingerAnimation(ant: Ant, sprite: PIXI.Container) {
    const anim = this.stingerAnimations.get(ant.id);
    if (!anim) return;

    const bodyContainer = sprite.getChildByName('bodyContainer') as PIXI.Container;
    if (!bodyContainer) return;

    const elapsed = performance.now() - anim.startTime;
    const { totalDuration, turnDuration, holdDuration, returnDuration } = STINGER_ANIM_CONFIG;

    if (elapsed >= totalDuration) {
      // 动画结束，清理并恢复正常朝向
      this.stingerAnimations.delete(ant.id);
      bodyContainer.rotation = ant.rotation;
      return;
    }

    // 计算旋转偏移量
    let rotationOffset = 0;

    if (elapsed < turnDuration) {
      // 阶段1: 快速转身180° —— 使用缓入缓出让动作更自然
      const progress = elapsed / turnDuration;
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      rotationOffset = Math.PI * eased;
    } else if (elapsed < turnDuration + holdDuration) {
      // 阶段2: 停留在180°（尾针扎入的瞬间）
      rotationOffset = Math.PI;
    } else {
      // 阶段3: 快速转回正面
      const returnElapsed = elapsed - turnDuration - holdDuration;
      const progress = returnElapsed / returnDuration;
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      rotationOffset = Math.PI * (1 - eased);
    }

    bodyContainer.rotation = anim.baseRotation + rotationOffset;
  }

  /**
   * 更新秒杀动画效果（大头蚁）
   * 动画分3个阶段：举起 -> 甩动 -> 甩飞消失
   */
  private updateExecutionAnimation(ant: Ant, sprite: PIXI.Container) {
    if (!ant.isBeingExecuted) {
      // 如果动画数据还在但状态已取消，清理
      if (this.executionAnimations.has(ant.id)) {
        this.executionAnimations.delete(ant.id);
        sprite.alpha = 1;
        sprite.scale.set(1, 1);
      }
      return;
    }

    // 初始化动画
    if (!this.executionAnimations.has(ant.id)) {
      this.executionAnimations.set(ant.id, {
        startTime: performance.now(),
        originalY: ant.position.y,
        phase: 'shake',
      });
    }

    const anim = this.executionAnimations.get(ant.id)!;
    const elapsed = performance.now() - anim.startTime;
    const { shakeDuration, fadeOutDuration, shakeAmplitudeY, shakeAmplitudeX, shakeCount, flingDistance, flingAngle } = EXECUTION_ANIM_CONFIG;
    const totalDuration = shakeDuration + fadeOutDuration;

    if (elapsed < shakeDuration) {
      // 阶段1: 原地上下摇晃 - 被大头蚁叼住猛甩
      anim.phase = 'shake';
      const shakeProgress = elapsed / shakeDuration;

      // 上下摇晃使用正弦波
      const shakeY = Math.sin(shakeProgress * Math.PI * 2 * shakeCount) * shakeAmplitudeY;
      // 水平方向轻微晃动，频率是上下的一半，增加自然感
      const shakeX = Math.sin(shakeProgress * Math.PI * 2 * shakeCount * 0.5) * shakeAmplitudeX;

      sprite.position.y = anim.originalY + shakeY;
      sprite.position.x = ant.position.x + shakeX;

      // 摇晃时身体跟随旋转，表现被甩的感觉
      const bodyContainer = sprite.getChildByName('bodyContainer') as PIXI.Container;
      if (bodyContainer) {
        bodyContainer.rotation = ant.rotation + shakeY * 0.03;
      }

      // 轻微缩放表现挣扎
      const squash = 1 + Math.sin(shakeProgress * Math.PI * 2 * shakeCount) * 0.08;
      sprite.scale.set(squash, 2 - squash); // X轴和Y轴反向缩放，形成挤压效果

      // 摇晃过程中逐渐变暗
      sprite.alpha = 0.8 + 0.2 * (1 - shakeProgress);

    } else if (elapsed < totalDuration) {
      // 阶段2: 飞出淡出 - 从原位置向斜上方飞出并消失
      anim.phase = 'fling';
      const flingElapsed = elapsed - shakeDuration;
      const flingProgress = flingElapsed / fadeOutDuration;

      // 缓动：先慢后快加速飞出
      const eased = Math.pow(flingProgress, 2);

      // 飞出方向（斜上方）
      const flingX = Math.cos(flingAngle) * flingDistance * eased;
      const flingY = Math.sin(flingAngle) * flingDistance * eased;

      sprite.position.x = ant.position.x + flingX;
      sprite.position.y = anim.originalY + flingY;

      // 旋转飞出
      const bodyContainer = sprite.getChildByName('bodyContainer') as PIXI.Container;
      if (bodyContainer) {
        bodyContainer.rotation = ant.rotation + flingProgress * Math.PI * 3;
      }

      // 缩小 + 淡出
      const scale = 1 - eased * 0.8;
      sprite.scale.set(scale, scale);
      sprite.alpha = 0.8 * (1 - eased);

    } else {
      // 动画结束，恢复默认并清理
      this.executionAnimations.delete(ant.id);
      sprite.alpha = 0;
      sprite.scale.set(0, 0);
    }
  }

  /**
   * 从 GameEngine 消费蜜罐爆炸事件，创建蜜液动画和回复粒子
   */
  private processHoneypotExplosions() {
    const engine = getGameEngine();
    if (engine.honeypotExplosions.length === 0) return;

    const state = useGameStore.getState();

    for (const event of engine.honeypotExplosions) {
      // 创建蜜液滩动画
      const puddle = new PIXI.Graphics();
      this.app.stage.addChild(puddle);

      this.honeyPuddles.push({
        x: event.position.x,
        y: event.position.y,
        startTime: performance.now(),
        duration: HONEYPOT_EXPLOSION_CONFIG.honeyPuddleDuration,
        radius: HONEYPOT_EXPLOSION_CONFIG.honeyPuddleRadius,
        sprite: puddle,
      });

      // 为每个被回复的蚂蚁创建回复粒子
      for (const antId of event.healedAntIds) {
        const ant = state.ants.find(a => a.id === antId);
        if (!ant || ant.state === 'dead') continue;

        const particles: HealParticle[] = [];
        for (let i = 0; i < HONEYPOT_EXPLOSION_CONFIG.healParticleCount; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spawnRadius = Math.random() * 10;
          particles.push({
            x: Math.cos(angle) * spawnRadius,
            y: Math.sin(angle) * spawnRadius,
            size: 2 + Math.random() * 2.5,
            alpha: 0.8 + Math.random() * 0.2,
            life: HONEYPOT_EXPLOSION_CONFIG.healParticleLifespan,
            maxLife: HONEYPOT_EXPLOSION_CONFIG.healParticleLifespan,
            vy: -(HONEYPOT_EXPLOSION_CONFIG.healParticleSpeed + Math.random() * 15),
            vx: (Math.random() - 0.5) * 10,
          });
        }

        this.healParticleGroups.push({
          antId,
          particles,
          startTime: performance.now(),
        });
      }
    }

    // 清空已消费的事件
    engine.honeypotExplosions.length = 0;
  }

  /**
   * 更新蜜液滩动画（扩散→淡出）
   */
  private updateHoneyPuddles() {
    const now = performance.now();

    for (let i = this.honeyPuddles.length - 1; i >= 0; i--) {
      const puddle = this.honeyPuddles[i];
      const elapsed = now - puddle.startTime;
      const progress = elapsed / puddle.duration;

      if (progress >= 1) {
        // 动画结束，移除
        this.app.stage.removeChild(puddle.sprite);
        puddle.sprite.destroy();
        this.honeyPuddles.splice(i, 1);
        continue;
      }

      puddle.sprite.clear();

      // 蜜液扩散效果：快速扩大后保持
      const expandProgress = Math.min(1, progress * 3); // 前1/3时间扩散
      const eased = 1 - Math.pow(1 - expandProgress, 3);
      const currentRadius = puddle.radius * eased;

      // 整体淡出
      const fadeAlpha = progress < 0.5 ? 0.6 : 0.6 * (1 - (progress - 0.5) * 2);

      // 蜜液主体 - 金黄色椭圆
      puddle.sprite.beginFill(0xf59e0b, fadeAlpha * 0.7);
      puddle.sprite.drawEllipse(puddle.x, puddle.y, currentRadius * 1.3, currentRadius * 0.7);
      puddle.sprite.endFill();

      // 蜜液高光
      puddle.sprite.beginFill(0xfbbf24, fadeAlpha * 0.5);
      puddle.sprite.drawEllipse(puddle.x - currentRadius * 0.2, puddle.y - currentRadius * 0.1, currentRadius * 0.6, currentRadius * 0.35);
      puddle.sprite.endFill();

      // 外圈发光
      puddle.sprite.beginFill(0xfcd34d, fadeAlpha * 0.2);
      puddle.sprite.drawEllipse(puddle.x, puddle.y, currentRadius * 1.6, currentRadius * 0.9);
      puddle.sprite.endFill();
    }
  }

  /**
   * 更新回复粒子效果（金色粒子上升淡出）
   */
  private updateHealParticles(deltaTime: number) {
    if (!this.healParticleGraphics) return;

    this.healParticleGraphics.clear();
    const state = useGameStore.getState();
    const deltaMs = deltaTime * 1000;

    for (let g = this.healParticleGroups.length - 1; g >= 0; g--) {
      const group = this.healParticleGroups[g];

      // 获取蚂蚁当前位置（粒子跟随蚂蚁）
      const ant = state.ants.find(a => a.id === group.antId);
      const baseX = ant ? ant.position.x : 0;
      const baseY = ant ? ant.position.y : 0;

      let allDead = true;

      for (let i = group.particles.length - 1; i >= 0; i--) {
        const p = group.particles[i];

        // 更新位置
        p.x += p.vx * deltaTime;
        p.y += p.vy * deltaTime;

        // 更新生命
        p.life -= deltaMs;

        if (p.life <= 0) {
          group.particles.splice(i, 1);
          continue;
        }

        allDead = false;

        // 淡出
        const lifeRatio = p.life / p.maxLife;
        const alpha = lifeRatio * p.alpha;

        // 绘制粒子 - 金色十字/星形
        const drawX = baseX + p.x;
        const drawY = baseY + p.y;

        // 外发光
        this.healParticleGraphics.beginFill(0xfbbf24, alpha * 0.3);
        this.healParticleGraphics.drawCircle(drawX, drawY, p.size * 1.8);
        this.healParticleGraphics.endFill();

        // 主体
        this.healParticleGraphics.beginFill(0xfcd34d, alpha);
        this.healParticleGraphics.drawCircle(drawX, drawY, p.size);
        this.healParticleGraphics.endFill();

        // 中心高光
        this.healParticleGraphics.beginFill(0xffffff, alpha * 0.6);
        this.healParticleGraphics.drawCircle(drawX, drawY, p.size * 0.4);
        this.healParticleGraphics.endFill();
      }

      if (allDead || group.particles.length === 0) {
        this.healParticleGroups.splice(g, 1);
      }
    }
  }

  destroy() {
    this.antSprites.clear();
    this.hatcherySprites.clear();
    this.projectileSprites.clear();
    this.poisonParticles.clear();
    this.executionAnimations.clear();
    this.stingerAnimations.clear();
    // 清理蜜液动画
    for (const puddle of this.honeyPuddles) {
      this.app.stage.removeChild(puddle.sprite);
      puddle.sprite.destroy();
    }
    this.honeyPuddles.length = 0;
    this.healParticleGroups.length = 0;
    // 清理悬浮提示
    if (this.tooltipContainer) {
      this.tooltipContainer.destroy({ children: true });
      this.tooltipContainer = null;
      this.tooltipBg = null;
      this.tooltipText = null;
    }
    this.hoveredHatcheryId = null;
    // PIXI app 的销毁由外部 hook 处理
  }
}
