# 融合蚁大战：架构与接口参考

> 本文面向后续功能开发、联调和代码审查，依据当前 `README.md` 与 `src/` 实际源码整理。
>
> **约定**：文中“当前生效”指 `src/main.tsx` → `App` → `GameCanvas` → `usePixiApp` → `GameEngine` 这条运行链；标为“旧实现/兼容入口”的代码仍保留在仓库中，但不应被误认为新的主入口。

## 0. 先看结论

### 0.1 当前真实运行入口

```mermaid
flowchart LR
    A[src/main.tsx\nReactDOM.createRoot] --> B[src/App.tsx]
    B --> C[GameCanvas.tsx]
    C --> D[hooks/usePixiApp.ts]
    D --> E[game/GameEngine.ts\ngetGameEngine()]
    D --> F[game/PixiRenderer.ts]
    E --> G[store/gameStore.ts\nZustand]
    F --> G
    B --> H[StatusBar / AssemblyPanel / BuildPanel]
    H --> G
    G --> I[config/gameConfig.ts\nconfig/partStats.ts]
```

- **UI 入口**：`src/main.tsx` 挂载 `App`。
- **游戏入口**：`src/hooks/usePixiApp.ts` 创建 `PixiApplication`、`PixiRenderer`，并通过 `getGameEngine()` 控制游戏生命周期。
- **逻辑主循环**：`src/game/GameEngine.ts` 自己维护 `requestAnimationFrame` 主循环，并通过 `useGameStore.getState()` 读写 Zustand。
- **单一状态源**：`src/store/gameStore.ts` 保存蚂蚁、投射物、孵化室、资源、蚁后、解锁状态和统计信息。
- **渲染层**：`src/game/PixiRenderer.ts` 从 Store 同步 Pixi 精灵，不直接修改游戏规则状态。

### 0.2 容易误判的旧架构

1. `src/core/Game.ts` 是完整的“系统编排器”，但当前 `App`、`GameCanvas`、`usePixiApp` 都没有调用 `getGame()`，因此它不是当前运行入口。
2. `src/core/GameLoop.ts` 只被 `src/core/Game.ts` 使用；当前 `GameEngine` 使用自己的循环。
3. `src/systems/` 中有独立系统类，但 `GameEngine.ts` 当前没有直接实例化这些类；它在引擎文件内实现了同构逻辑。修改规则时优先检查 `GameEngine.ts`，不要只改 `systems/` 后期待当前运行链自动生效。
4. `src/ai/AISystem.ts` 与 `GameEngine.ts` 都声明了 AI 类型和决策器。外部集成应优先从 `src/game` 导出 `AIDecisionMaker` 等类型，避免直接依赖 `AISystem` 的内部副本。
5. 仓库中**已不再有** Gemini 相关代码：`.env` 中已重命名为 `VITE_DEEPSEEK_*`，`src/ai/DeepSeekAIDecisionMaker.ts` 已被重写为 `src/ai/DeepSeekStrategicAdvisor.ts`（仅负责战略，不下指令）。如再发现有人引用"Gemini"，应立即纠正为"DeepSeek"。

### 0.3 AI 架构一句话总结

游戏使用**双层 AI**：

- **本地决策层**：`DefaultAIDecisionMaker`（在 `GameEngine.ts` 内），每 ~2 真实秒按当前 `mode` + 部件权重决定 build/upgrade/demolish/wait。
- **战略层**：`DeepSeekStrategicAdvisor`（在 `src/ai/`），每 60 **游戏秒**调用一次 DeepSeek，返回 `{ mode, weights, taunt }`，写入 `DefaultAIDecisionMaker`。

LLM 不直接控制任何动作——它只调整权重和模式，本地 AI 持续不间断地决策。详细见第 6 节。

## 1. 技术栈与工程配置

| 领域 | 技术/配置 | 主要文件 |
| --- | --- | --- |
| 构建 | Vite 5、ES Modules | `package.json`、`vite.config.ts` |
| UI | React 18、ReactDOM | `src/main.tsx`、`src/App.tsx`、`src/components/` |
| 类型 | TypeScript strict 模式 | `tsconfig.json`、`tsconfig.node.json` |
| 渲染 | PixiJS 7 | `src/hooks/usePixiApp.ts`、`src/game/PixiRenderer.ts` |
| 状态 | Zustand 4 | `src/store/gameStore.ts` |
| 样式 | Tailwind CSS 3、PostCSS | `tailwind.config.js`、`postcss.config.js`、`src/styles/index.css` |
| 音效 | Howler.js | `src/config/sounds.ts`、`src/utils/SoundManager.ts` |
| 桌面端 | Electron 28、electron-builder | `electron/main.js`、`package.json` |

常用命令：

```bash
npm run dev          # 启动 Vite 开发服务器，默认端口 3000
npm run build        # 构建 dist
npm run preview      # 预览 dist
npm run electron:dev
npm run electron:build
```

Vite 使用 `base: './'`，因此打包后资源路径可适配 Electron 或静态部署；`@` 别名解析到 `/src`。

## 2. 目录职责

```text
src/
├── App.tsx                    # 应用组合根
├── main.tsx                   # React 挂载入口
├── types/index.ts             # 核心领域类型
├── store/gameStore.ts         # Zustand 全局游戏状态与 action
├── config/
│   ├── gameConfig.ts          # 地图、难度、资源、解锁、蚁后配置
│   ├── partStats.ts            # 部件配置、属性计算、技能参数
│   └── sounds.ts              # 音效路径和音量
├── game/
│   ├── GameEngine.ts          # 当前生效的游戏逻辑主循环、AI 调度
│   ├── PixiRenderer.ts        # 当前生效的 Pixi 场景与实体渲染
│   └── index.ts               # 游戏模块公共导出
├── ai/AISystem.ts             # 旧/独立 AI 系统实现
├── core/
│   ├── Game.ts                # 旧的游戏总控器
│   ├── GameLoop.ts            # 旧的固定步长循环
│   ├── Events.ts              # 事件类型与事件总线
│   └── index.ts               # core 公共导出
├── systems/                   # 可复用的系统类（部分被旧总控器使用）
│   ├── CombatSystem.ts
│   ├── MovementSystem.ts
│   ├── BuffSystem.ts
│   ├── SpawnSystem.ts
│   ├── ProjectileSystem.ts
│   ├── QueenSystem.ts
│   └── UnlockSystem.ts
├── hooks/usePixiApp.ts        # Pixi 生命周期和游戏控制桥接
├── components/                # React UI 面板和状态层
├── utils/SoundManager.ts      # 音效单例
└── styles/index.css            # Tailwind 指令与全局样式

electron/main.js               # Electron 主进程和窗口加载逻辑
plans/                          # 旧版设计/计划文档；本文件是新的接口参考文档
```

### 2.1 目录原则

- **规则计算**：修改 `GameEngine.ts` 中的实际执行路径，或修改配置/Store 提供的纯计算函数。
- **状态变化**：通过 `useGameStore` 的 action 或 `setState` 提交；不要在渲染器中修改 `ant`、`hatchery` 等领域对象。
- **表现效果**：放在 `PixiRenderer` 的绘制、精灵同步、粒子和动画方法中。
- **UI 展示**：React 组件订阅 Zustand 的最小 selector，不要把逻辑复制到组件中。
- **跨模块通知**：优先使用 `GameEvents`；只有确需读取事件总线的底层能力时再使用 `gameEvents`。


## 3. 领域模型

所有主要领域类型定义在 `src/types/index.ts`。开发时应优先 import 这些类型，而不是在业务文件里重新声明近似结构。

### 3.1 阵营与部件

```typescript
type Side = 'player' | 'enemy';
type PartType = 'head' | 'thorax' | 'abdomen';

type HeadVariant =
  | 'basic' | 'leafcutter' | 'soldier' | 'fire'
  | 'odontomachus' | 'termiteSoldier' | 'bigHead';
type ThoraxVariant =
  | 'basic' | 'army' | 'carpenter' | 'bullet' | 'leafcutter';
type AbdomenVariant =
  | 'basic' | 'honeypot' | 'weaver' | 'trap' | 'spitter' | 'matabele';

interface AntTemplate {
  head: HeadVariant;
  thorax: ThoraxVariant;
  abdomen: AbdomenVariant;
}
```

`AntParts` 保存实际 `PartConfig`；`AntTemplate` 保存 variant 字符串。新建蚂蚁时，Store 将模板转换成 `PartConfig` 并填入 `Ant.parts`。

### 3.2 Ant：运行时实体

```typescript
type AntState = 'moving' | 'chasing' | 'fighting' | 'dead' | 'shooting';

interface Ant {
  id: string;
  side: Side;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  attackSpeed: number;       // 攻击间隔，ms
  attackCooldown: number;    // 剩余冷却，ms
  isRanged: boolean;
  rangedDamage: number;
  attackRange: number;
  position: { x: number; y: number };
  state: AntState;
  targetId: string | null;
  hatcheryId: string;
  rotation: number;          // 弧度
  parts: AntParts;
  metadata?: {
    spawnTime: number;
    killCount: number;
    damageDealt: number;
    damageTaken: number;
  };
  buffs: Buff[];
  sourceLevel: number;
  hasEscapeAbility: boolean;
  escapeAbilityCooldown: number;
  hasUsedEscapeAbility: boolean;
  hasAttackSpeedAura: boolean;
  attackSpeedBonus: number;
  hasStingerAbility: boolean;
  stingerCooldown: number;
  hasTauntAbility: boolean;
  tauntCooldown: number;
  baseArmor: number;
  flatArmor: number;
  hasHoneypotExplosion: boolean;
  hasInstantKill: boolean;
  isBeingExecuted?: boolean;
  executedBy?: string;
  isExecuting?: boolean;
  allowsStacked?: boolean;
  critChance: number;
  hasAdrenaline: boolean;
  adrenalineCooldown: number;
  hasUsedAdrenaline: boolean;
}
```

`state` 只是行为状态；攻击冷却、Buff、技能冷却和秒杀动画都是独立字段，不能只靠 `state` 表达。

### 3.3 Buff：效果实例

```typescript
type BuffType =
  | 'slow' | 'poison' | 'attackSpeedUp' | 'attackSpeedDown'
  | 'damageUp' | 'damageDown' | 'speedUp' | 'armor';

interface Buff {
  id: string;
  type: BuffType;
  value: number;           // 百分比，0.2 = 20%
  duration: number;        // 剩余时间，ms
  maxDuration: number;
  sourceId?: string;
  stackable: boolean;
  tickDamage?: number;     // 中毒等每秒伤害
}
```
### 3.4 Hatchery、Queen、Projectile

```typescript
interface GridPosition { col: number; row: number; }

interface Hatchery {
  id: string;
  side: Side;
  gridPos: GridPosition;
  position: { x: number; y: number };
  template: AntTemplate;
  spawnCooldown: number;
  cost: number;
  level: number;           // 1 ~ 3
  totalInvested: number;
}

interface Queen {
  side: Side;
  hp: number;
  maxHp: number;
  position: { x: number; y: number };
}

interface Projectile {
  id: string;
  side: Side;
  ownerId: string;
  targetId: string;
  damage: number;
  speed: number;
  position: { x: number; y: number };
  rotation: number;
  slowEffect?: { value: number; duration: number };
  isQueenProjectile?: boolean;
}
```

`Hatchery.cost` 是模板的建造成本，也是升级成本。升级后 `level` 和 `totalInvested` 增加；拆除按 `totalInvested × 50%` 向下取整返还。

### 3.5 GameState 与统计

`GameState` 是 Zustand 中的领域快照：

```typescript
interface GameState {
  status: 'idle' | 'playing' | 'paused' | 'victory' | 'defeat';
  difficulty: 'normal' | 'hard' | 'extreme';
  playerFood: number;
  enemyFood: number;
  playerQueen: Queen;
  enemyQueen: Queen;
  ants: Ant[];
  projectiles: Projectile[];
  hatcheries: Hatchery[];
  playerTemplate: AntTemplate;
  enemyTemplate: AntTemplate;
  config: GameConfig;
  stats: {
    playerAntsSpawned: number;
    enemyAntsSpawned: number;
    playerAntsKilled: number;
    enemyAntsKilled: number;
    playerHatcheriesBuilt: number;
    enemyHatcheriesBuilt: number;
    gameTime: number;       // 游戏时间，ms
  };
  playerUnlockedParts: UnlockedParts;
  enemyUnlockedParts: UnlockedParts;
  unlockNotifications: UnlockNotification[];
  aiTrashTalk: string;
  aiTrashTalkTime: number;
}
```

源码没有独立的 `GameStats` 类型；不要继续使用旧版 `stats: GameStats` 写法。

## 4. 状态与数据流

### 4.1 Zustand Store 架构

`useGameStore` 是全局单例。React 组件使用 hook；非 React 逻辑使用 `useGameStore.getState()` 或 `useGameStore.setState()`。

```text
GameEngine 读取状态快照
    ↓ 计算本帧更新
    ↓ useGameStore.getState().updateAnt/updateAnts(...)
    ↓ Zustand 通知订阅者
    ↓ React 组件和 PixiRenderer 重新同步
```

### 4.2 Store 状态字段分类

| 分类 | 字段 |
| --- | --- |
| 生命周期 | `status`、`difficulty`、`gameSpeed` |
| 资源 | `playerFood`、`enemyFood` |
| 实体 | `ants`、`projectiles`、`hatcheries`、`playerQueen`、`enemyQueen` |
| 配置 | `playerTemplate`、`enemyTemplate`、`config` |
| 进度 | `stats.gameTime`、双方出生/死亡/孵化室统计 |
| 解锁 | `playerUnlockedParts`、`enemyUnlockedParts`、`unlockNotifications` |
| UI 状态 | `aiTrashTalk`、`aiTrashTalkTime`、`buildMode` |

### 4.3 Store action 接口

`GameStore` 在 `src/store/gameStore.ts:149` 附近定义，interface 本身没有单独导出，但通过 `useGameStore` 的类型对外可见。

| 分组 | action | 参数 / 返回值 | 行为 |
| --- | --- | --- | --- |
| 生命周期 | `startGame()` | `void` | `status = 'playing'` |
|  | `pauseGame()` | `void` | `status = 'paused'` |
|  | `resumeGame()` | `void` | `status = 'playing'` |
|  | `resetGame()` | `void` | 用 `createInitialState()` 重建状态并重置速度 |
|  | `toggleSpeed()` | `void` | `1 → 2 → 3 → 1` |
|  | `setDifficulty(difficulty)` | `Difficulty` | 设置难度 |
| 蚂蚁 | `spawnAntFromHatchery(hatchery)` | `Hatchery -> Ant|null` | 计算属性并追加实体 |
|  | `removeAnt(id)` | `string -> void` | 移除并增加该阵营击杀统计 |
|  | `updateAnt(id, updates)` | `(string, Partial<Ant>) -> void` | 更新单个实体 |
|  | `updateAnts(updates)` | `{id, changes}[] -> void` | 批量更新实体 |
| 投射物 | `addProjectile(projectile)` | `Projectile -> void` | 追加投射物 |
|  | `removeProjectile(id)` | `string -> void` | 移除投射物 |
|  | `updateProjectiles(updates)` | `{id, changes}[] -> void` | 批量更新投射物 |
|  | `clearProjectiles()` | `void` | 清空投射物 |
| 孵化室 | `buildHatchery(side, gridPos, template)` | `(Side, GridPosition, AntTemplate) -> Hatchery|null` | 校验格子、扣资源、创建孵化室 |
|  | `canBuildAt(side, gridPos)` | `(Side, GridPosition) -> boolean` | 检查边界和重复格子 |
|  | `getHatcheryCost(template)` | `AntTemplate -> number` | 返回基础成本加部件成本 |
|  | `updateHatcheryCooldowns(deltaTime)` | `ms -> void` | 减少所有孵化室冷却 |
|  | `upgradeHatchery(id)` | `string -> boolean` | 等级未满且资源足够时升级 |
|  | `demolishHatchery(id)` | `string -> number` | 删除并返回按 50% 计算的返还量 |
|  | `getHatcheryAt(side, gridPos)` | `(Side, GridPosition) -> Hatchery|undefined` | 查询格子 |
|  | `canUpgradeHatchery(id)` | `string -> boolean` | 等级和资源预检查 |
|  | `getUpgradeCost(id)` | `string -> number` | 返回 `hatchery.cost`，不存在时为 0 |
| 蚁后 | `damageQueen(side, damage)` | `(Side, number) -> void` | 扣血；归零时设置 `defeat` 或 `victory` |
| 玩家模板 | `setPlayerTemplate(template)` | `Partial<AntTemplate> -> void` | 合并更新模板 |
|  | `setPlayerHead(head)` | `HeadVariant -> void` | 只改头部 |
|  | `setPlayerThorax(thorax)` | `ThoraxVariant -> void` | 只改胸部 |
|  | `setPlayerAbdomen(abdomen)` | `AbdomenVariant -> void` | 只改腹部 |
| 资源 | `addFood(side, amount)` | `(Side, number) -> void` | 累加资源 |
|  | `spendFood(side, amount)` | `(Side, number) -> boolean` | 不足返回 `false`，成功扣减并返回 `true` |
| 统计/时间 | `updateStats(updates)` | `Partial<GameState['stats']> -> void` | 合并统计字段 |
|  | `incrementGameTime(delta)` | `ms -> void` | 增加游戏时间 |
| 解锁 | `unlockPart(side, partDef, nameCN)` | `(Side, UnlockablePartDef, string) -> void` | 加入解锁列表并追加通知 |
|  | `clearUnlockNotifications()` | `void` | 清空通知队列 |
| 建造模式 | `buildMode` | `'build' \| 'upgrade' \| 'demolish'` | 当前模式（由 `BuildPanel` 写入，`PixiRenderer` 读取以决定格子交互行为） |
|  | `setBuildMode(mode)` | `('build' \| 'upgrade' \| 'demolish') -> void` | 切换模式 |
| UI | `setAITrashTalk(message)` | `string -> void` | 设置内容和时间戳 |
| 分析 | `exportForAnalysis()` | `object` | 返回适合 LLM 的快照 |

#### Store 纯函数

```typescript
calculateHatcheryCost(template: AntTemplate): number
```

等价于：

```text
GAME_CONFIG.baseHatcheryCost + calculateAntStats(...).cost
```

不要在 AI 或 UI 中重复写成本公式，调用这个函数，避免基础成本变化时产生分叉。

### 4.4 读取和修改状态

```typescript
const state = useGameStore.getState();
const canBuild = state.canBuildAt('player', { col: 0, row: 1 });
const cost = calculateHatcheryCost(state.playerTemplate);
```

React 订阅：

```tsx
const status = useGameStore((state) => state.status);
const playerFood = useGameStore((state) => state.playerFood);
```

批量更新示例：

```typescript
const state = useGameStore.getState();
state.updateAnts([
  { id, changes: { state: 'moving', targetId: null } },
]);
```

推荐使用现有 action。只有新增跨模块操作或现有 action 不适合时，才使用 `useGameStore.setState((state) => ...)`；替换数组时必须保证实体 ID 唯一性。

## 5. 当前主引擎接口

### 5.1 GameEngine 对外接口

`src/game/GameEngine.ts:406` 定义的 `GameEngine` 是当前实际运行的游戏服务，导出单例 `getGameEngine()`。

| 方法 | 返回值 | 说明 |
| --- | --- | --- |
| `setAIDecisionMaker(decisionMaker)` | `void` | 替换 AI 决策器；`GameEngine` 内默认是 `DefaultAIDecisionMaker` |
| `setAIDecisionInterval(intervalMs)` | `void` | 设置决策间隔，源码会限制最小 500ms |
| `setStrategicAdvisor(advisor \| null)` | `void` | 注入/卸载战略顾问（LLM）；引擎按游戏时间每 60s 调一次 `advise()` |
| `getDefaultAIDecisionMaker()` | `DefaultAIDecisionMaker \| null` | 获取当前默认 AI 决策器（用于外部更新 mode/weights） |
| `markAdvisorCalled()` | `void` | 外部告知"顾问刚被调过"，把 `lastAdvisorGameTime` 推到当前游戏时间，避免与引擎自带首次触发撞车 |
| `getBattleContext()` | `AIBattleContext` | 从当前 Store 快照生成 AI 输入 |
| `aiBuildHatchery(gridPos, template)` | `{success, reason}` | 只允许敌方建造，供外部 AI/测试调用 |
| `aiUpgradeHatchery(id)` | `{success, reason}` | 只允许升级敌方孵化室 |
| `aiDemolishHatchery(id)` | `{success, refund, reason}` | 只允许拆除敌方孵化室 |
| `start()` | `void` | 开始引擎主循环并把 Store 状态设为 `playing` |
| `stop()` | `void` | 停止 RAF，但不会改 Store 状态 |
| `pause()` | `void` | 停止 RAF，并把 Store 状态设为 `paused` |
| `resume()` | `void` | 恢复 RAF，并把 Store 状态设为 `playing` |
| `reset()` | `void` | 停止、重置 Store 和引擎计时器/冷却/AI 模式/部件权重/战略顾问计时 |

```typescript
import { getGameEngine } from './game';

const engine = getGameEngine();
const context = engine.getBattleContext();
engine.setAIDecisionMaker(new MyDecisionMaker());
engine.start();
```

`GameEngine` 暴露两个渲染器消费的事件数组：

- `stingerStrikeEvents: StingerStrikeEvent[]`
- `honeypotExplosions: HoneypotExplosionEvent[]`

事件带 `performance.now()` 时间。`PixiRenderer.update()` 会消费并清空它们；引擎业务代码不要把数组当持久状态。

### 5.2 主循环逐帧顺序

当前 `GameEngine.gameLoop()` 在 `status === 'playing'` 时按以下顺序执行：

1. 计算真实帧间隔 `rawDeltaTime`，应用 `gameSpeed` 得到 `deltaTime`。
2. `incrementGameTime(deltaTime * 1000)`，更新游戏时间。
3. 生成双方食物，包含拔河优势和难度加成。
4. 检查游戏时间是否到解锁点。
5. 按 `aiDecisionInterval / gameSpeed` 调 AI 决策器（**本地决策层**，每 ~2 真实秒一次，受 `gameSpeed` 缩放）。
6. **战略顾问调度**：每帧检查 `gameTime - lastAdvisorGameTime >= 60_000ms` 时调一次 `strategicAdvisor.advise()`（**战略层**，每 60 **游戏秒**一次；暂停时不走、3x 速约 20 真实秒一次）。
7. 更新孵化室冷却，条件满足时从空闲格子生成蚂蚁。
8. 更新 Buff 持续时间、攻速光环衰减、技能冷却。
9. 索敌并更新 `moving/chasing/fighting/shooting` 状态。
10. 更新位置、旋转、碰撞分离。
11. 处理近战和远程攻击、Buff/技能、逃脱能力。
12. 蚁后寻找目标并发射子弹；更新投射物命中和减速。
13. 检查蚂蚁到蚁后的碰撞、蜜罐爆炸、清理死亡实体。

这是一个有明确顺序的帧管线。添加新规则时，应决定它属于哪个阶段；不要在渲染器 `update()` 中修改战斗数值，否则会出现逻辑与显示不同步。

### 5.3 蚂蚁行为状态

```text
moving --发现敌人--> chasing --进入有效攻击距离--> fighting (近战)
moving --远程目标进入射程--> shooting (远程)
chasing --目标死亡/丢失--> moving
fighting/shooting --目标死亡/丢失--> moving
```

远程单位使用 `attackRange`；近战使用配置 `collisionDistance`。追击目标失效、死亡或超过范围时清除 `targetId` 并回到 `moving`。

### 5.4 渲染器事件接口

```typescript
export interface StingerStrikeEvent {
  antId: string;
  time: number; // performance.now()
}

export interface HoneypotExplosionEvent {
  position: { x: number; y: number };
  side: Side;
  time: number; // performance.now()
  healedAntIds: string[];
}
```

`PixiRenderer` 自身的主要接口是：

```typescript
class PixiRenderer {
  constructor(app: PIXI.Application);
  update(): void;     // 从 Store 同步场景、实体、动画和粒子
  destroy(): void;    // 清理内部精灵/粒子/提示层
}
```

`update()` 不直接调用 `useGameStore.setState()` 修改领域实体，只消费 Store 当前快照。`destroy()` 由 `usePixiApp` 的 effect cleanup 调用；随后 hook 还会销毁 `PIXI.Application`。

### 5.5 PixiRenderer 内部机制：基地建造区

游戏的核心交互入口是战场上的 5×5 基地建造格子（双方各 25 格，分布在蚁后两侧）。所有"建造 / 升级 / 拆除"操作都通过 Pixi 上的这些格子触发，而不是 React 端的 UI 网格。

#### 5.5.1 架构概览

```text
React 侧（BuildPanel）
  └─ setBuildMode(mode) ──→ Store.buildMode ──┐
                                              ↓
                                          共享状态
                                              ↓
Pixi 侧（PixiRenderer）                       ↓
  ├─ setupBuildZoneCells() 创建格子 sprite     ↓
  ├─ createHatcherySprite() 创建孵化室 sprite  ↓
  ├─ refreshBuildZoneCells() 根据 buildMode   ↓
  │   调整格子边框/中央符号                    ↓
  ├─ handleGridClick() 根据 buildMode ────────┘
  │   派发到 buildHatchery / upgradeHatchery / demolishHatchery
  ├─ handleGridHover() 0.5s 延迟后显示 tooltip
  └─ showGridTooltip() 显示完整孵化室信息
```

**关键设计**：React 端的 `BuildPanel` 不再渲染格子 UI，只负责三件事：
1. 模式切换（写入 `buildMode`）
2. 当前配置展示（中文部件名 + 攻击/生命/速度/攻速）
3. 建造成本预览

实际"格子点击"由 Pixi 端统一处理，规则与模式完全对齐。

#### 5.5.2 格子 sprite 与孵化室 sprite 的双层结构

每个格子有一个独立的 `PIXI.Container`（`gridSprites: Map<string, PIXI.Container>`，key 为 `${side}-${col}-${row}`）；每个孵化室则有自己的 sprite（`hatcherySprites`）。

```text
stage
  ├─ gridCell (key=player-0-0)
  │    ├─ bg (格子背景，根据 buildMode 切换颜色/边框/脉冲)
  │    └─ hint (中央符号：+ ↑ ✕ MAX 等)
  ├─ gridCell (key=player-0-1)
  │    └─ ...
  ├─ hatcherySprite (已建孵化室，在 stage 上 zOrder 更高)
  │    ├─ body (背景 + 等级星星 + 蚂蚁图标 + 边缘光晕)
  │    └─ progressBar
  └─ ...
```

事件处理：
- 玩家侧格子：`eventMode='static'` + `hitArea = Rectangle(0,0,gridSize,gridSize)`；监听 `pointerover` / `pointerout` / `pointertap`。
- 玩家侧孵化室 sprite：同样 `eventMode='static'`；**手动转发** `pointerover` / `pointerout` 到对应格子 key，避免被其更高 zOrder 阻断格子事件；同时监听 `pointertap` 直接调用 `handleGridClick`。
- 敌方格子/孵化室：`eventMode='none'`，纯展示。

#### 5.5.3 格子视觉状态

`refreshBuildZoneCells()` 每帧调用，根据 `buildMode`、`playerFood`、是否已建孵化室决定格子外观。

| 格子类型 | buildMode | 视觉 | 中央符号 |
|---|---|---|---|
| 空格 | build | 蓝边框 + 亮填充 | `+`（食物够时） |
| 空格 | build | 暗灰边框（食物不够或暂停） | 无 |
| 空格 | upgrade | 淡绿边框 | 无 |
| 空格 | demolish | 淡红边框 | 无 |
| 已建 + 可升级 | upgrade | **金色脉冲边框**（alpha 0.5~0.85） | **↑箭头**（同步脉冲） |
| 已建 + 缺资源 | upgrade | 灰色边框（alpha 0.6） | **✕** |
| 已建 + 满级 | upgrade | 紫色边框（alpha 0.7） | **MAX 标签 + 白色 +** |
| 已建 | demolish | **红色脉冲边框** | **✕**（同步脉冲） |
| 已建 | build | 暗灰背景（让玩家看清孵化室本体） | 无 |

脉冲公式：`alpha = 0.5 + Math.sin(performance.now() / 333) * 0.35`，周期约 2.1 秒。

#### 5.5.4 格子点击处理

```typescript
private handleGridClick(side: Side, gridPos: GridPosition) {
  const state = useGameStore.getState();
  if (state.status !== 'playing') return;
  const existing = state.hatcheries.find(
    h => h.side === side && h.gridPos.col === gridPos.col && h.gridPos.row === gridPos.row,
  );
  switch (state.buildMode) {
    case 'build':     if (existing) return; state.buildHatchery(side, gridPos, state.playerTemplate); break;
    case 'upgrade':   if (!existing) return; state.upgradeHatchery(existing.id); break;
    case 'demolish':  if (!existing) return; state.demolishHatchery(existing.id); break;
  }
}
```

注意：
- 只在 `status === 'playing'` 时响应，暂停/胜负覆盖层不响应点击。
- `build` 模式对已建格子直接 return（不会"重新建造"）。
- `upgrade` / `demolish` 模式对空格直接 return。
- 升级条件由 Store action 内部再次校验（等级 < maxHatcheryLevel、食物够用）。

#### 5.5.5 格子悬浮提示（统一 tooltip）

鼠标悬停格子或孵化室 sprite 0.5s 后，调用 `showGridTooltip(key, cell)` 显示统一信息。

**空格**：
```
空格 (col,row)
建造成本: 🍯X
[点击可建造 | 食物不足]
```

**已建孵化室**（满级判断按 `state.config.maxHatcheryLevel`）：
```
我方孵化室 Lv.X
头: 兵蚁头
胸: 木蚁胸
腹: 陷阱蚁腹
已投资: 🍯Y
升级费用: 🍯Z   ← 满级时改为"升级: 已满级"
拆除返还: 🍯R
```

**实现要点**：
- 共用一个 `tooltipContainer`（PIXI.Container，含 `tooltipBg` 背景和 `tooltipText` 文本）。
- 悬停时记录 `sourceKey`，`handleGridHoverEnd` 仅在 `sourceKey` 匹配时隐藏，避免误关。
- `update()` 每帧检查 `tooltipContainer.sourceKey` 对应的格子是否还存在；若不存在则隐藏（覆盖"拆除后旧 tooltip 残留"的情况）。
- `tooltipContainer` 始终保持 `stage` 最上层。

**为什么是 0.5s 延迟**：避免鼠标快速掠过战场时频繁弹出 tooltip；保持安静的游戏体验。

### 5.6 旧总控器兼容接口

如果需要调试或迁移旧架构，`src/core/Game.ts` 提供：

```typescript
interface IGameSystem {
  init(): void;
  update(deltaTime: number): void;
  reset(): void;
  destroy(): void;
}

class Game {
  init(): void;
  start(): void;
  pause(): void;
  resume(): void;
  reset(): void;
  destroy(): void;
  getSystems(): {
    combatSystem: CombatSystem;
    movementSystem: MovementSystem;
    buffSystem: BuffSystem;
    spawnSystem: SpawnSystem;
    projectileSystem: ProjectileSystem;
    queenSystem: QueenSystem;
    unlockSystem: UnlockSystem;
    aiSystem: AISystem;
  };
}

getGame(): Game;
```

这条接口会创建并驱动 `CombatSystem`、`MovementSystem` 等类，但它目前没有 UI 调用者。新代码不应为了“模块化”重新接入这套双总控结构；如未来切换，应先明确迁移计划并删除/替换旧入口。

### 5.7 GameLoop 兼容接口

```typescript
interface GameLoopCallbacks {
  onUpdate: (deltaTime: number) => void;
  onFixedUpdate?: (fixedDeltaTime: number) => void;
}

class GameLoop {
  registerCallback(callbacks): () => void;
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  reset(): void;
  getFps(): number;
  getIsRunning(): boolean;
  getFixedTimestep(): number; // 1 / 60
}
```

它使用固定步长 accumulator 和最多 0.1 秒的可变帧间隔；与 `GameEngine` 的 RAF 循环是两条不同的调度路径。

## 6. AI 决策接口

### 6.1 类型

```typescript
type AIMode = 'upgrade_focus' | 'build_focus' | 'iterate';
type AIActionType = 'build' | 'upgrade' | 'demolish' | 'wait';

interface AIDecision {
  action: AIActionType;
  buildPosition?: GridPosition;      // build
  buildTemplate?: AntTemplate;        // build
  targetHatcheryId?: string;         // upgrade / demolish
  reason?: string;
}

interface AIDecisionMaker {
  makeDecision(context: AIBattleContext): AIDecision;
}
```

`AIMode`、`AIActionType`、`AIDecision`、`AIBattleContext` 和 `AIDecisionMaker` 在 `GameEngine.ts` 中声明；当前 `src/game/index.ts` 转出 `AIActionType`、`AIDecision`、`AIBattleContext`、`AIDecisionMaker`，以及 `DefaultAIDecisionMaker`、`CustomAIDecisionMaker`、`GameEngine`、`PixiRenderer`。`AIMode` 当前未从 `src/game/index.ts` 转出，如外部使用需直接从 `GameEngine.ts` import。

### 6.2 战场态势上下文

```typescript
interface AIBattleContext {
  enemyFood: number;
  playerFood: number;
  enemyQueenHp: number;
  enemyQueenMaxHp: number;
  playerQueenHp: number;
  playerQueenMaxHp: number;
  enemyHatcheries: Hatchery[];
  playerHatcheries: Hatchery[];
  enemyAntsCount: number;
  playerAntsCount: number;
  availableBuildPositions: GridPosition[];
  upgradableHatcheries: Hatchery[];
  gameTime: number;
  availableHeads: HeadVariant[];
  availableThoraxes: ThoraxVariant[];
  availableAbdomens: AbdomenVariant[];
}
```

`getBattleContext()` 当前固定观察 AI/敌人视角：`availableHeads`、`availableThoraxes`、`availableAbdomens` 来自 `enemyUnlockedParts`，数量也按阵营过滤。`upgradableHatcheries` 已包含等级和食物预算检查。

### 6.3 默认策略

- `upgrade_focus`：低等级孵化室先升级，再考虑空位建造。
- `build_focus`：有空位先扩张，满位再升级。
- `iterate`：接近满位时评估拆弱建强，否则在有空位时建造，满位后升级。

`GameEngine.reset()` 会把默认 AI 的 `mode` 恢复为 `iterate`、清空 `preferredTemplate`。持久化 AI 模式应由外层配置保存，再显式设置。

### 6.4 战略层类型（IStrategicAdvisor）

```typescript
interface PartWeights {
  heads:    Partial<Record<HeadVariant,   number>>;
  thoraxes: Partial<Record<ThoraxVariant,  number>>;
  abdomens: Partial<Record<AbdomenVariant, number>>;
}

interface StrategicDirective {
  mode: AIMode;           // 模式
  weights: PartWeights;   // 部件权重
  taunt?: string;         // 战术评语（推给 AITrashTalk UI）
}

interface IStrategicAdvisor {
  advise(context: AIBattleContext): Promise<StrategicDirective>;
}
```

`IStrategicAdvisor` **不是** `AIDecisionMaker`——它不出具体动作，只给战略方向。

### 6.5 战略顾问调度逻辑

`GameEngine.maybeAdvise()` 在 `gameLoop` 每帧被调用（独立于 `handleAIDecision` 的 2s 节流）：

```typescript
private maybeAdvise(): void {
  if (!this.strategicAdvisor) return;
  const state = useGameStore.getState();
  const gameTime = state.stats.gameTime;
  if (gameTime - this.lastAdvisorGameTime < 60_000) return;
  this.lastAdvisorGameTime = gameTime;
  // 调 advise()，把 directive 写入 DefaultAIDecisionMaker
}
```

关键设计：
- **基于 `gameTime` 而非真实时间**：暂停时 gameTime 冻结，战略顾问自然不调用
- **每 60 游戏秒**：1x 速约 60 真实秒；3x 速约 20 真实秒
- **每帧检查**：节流在内部（不像 `handleAIDecision` 那样受外部 2s 节流影响）
- **不影响本地 AI**：失败回退到当前 mode/weights，本地 AI 继续工作

### 6.6 DeepSeekStrategicAdvisor 接入示例

实际接入在 `src/hooks/usePixiApp.ts`：

```typescript
const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY;
if (apiKey) {
  const { DeepSeekStrategicAdvisor } = await import('../ai/DeepSeekStrategicAdvisor');
  const advisor = new DeepSeekStrategicAdvisor({ apiKey, baseUrl, model, timeoutMs });
  getGameEngine().setStrategicAdvisor(advisor);

  // 首次启动立即拉一次（不等60s）
  const ctx = getGameEngine().getBattleContext();
  const defaultAI = getGameEngine().getDefaultAIDecisionMaker();
  if (defaultAI) {
    const directive = await advisor.advise(ctx);
    defaultAI.mode = directive.mode;
    defaultAI.setWeights(directive.weights);
    getGameEngine().markAdvisorCalled(); // 同步计时器，避免引擎立即再调
  }
}
```

### 6.7 DeepSeekStrategicAdvisor 关键行为

| 行为 | 说明 |
| --- | --- |
| **请求** | `POST {baseUrl}/chat/completions`（OpenAI 兼容格式），`response_format: json_object` |
| **默认超时** | 15 秒（LLM 实际响应需要 3-10s） |
| **默认 max_tokens** | 800（`deepseek-chat` 战略指令通常 200-300 token） |
| **length 截断自愈** | `finish_reason='length'` 时下次自动翻倍 max_tokens（800→1600→3200，上限 4000），成功后复位 800 |
| **inflight 单飞** | 同一时刻多次 `advise()` 复用同一 Promise，避免重复请求 |
| **指数退避冷却** | 失败后冷却 `30s → 60s → 120s → 240s → 300s`；HTTP 4xx 多加 1 级；成功后清零 |
| **失败回退** | 任何错误（HTTP/超时/JSON 解析/校验）返回 `{ mode: 'iterate', 均匀权重 }`，不抛错 |
| **诊断日志** | 请求/响应都打日志（含 `finish_reason`、`content_length`、`usage`），方便排查 |

`.env` 配置：

```bash
VITE_DEEPSEEK_API_KEY=sk-...        # 留空时禁用 LLM，回退到本地纯启发式
VITE_DEEPSEEK_BASE_URL=https://api.deepseek.com
VITE_DEEPSEEK_MODEL=deepseek-chat   # 必须 V3 系列（V4-flash/reasoner 带推理，会 length 截断）
VITE_DEEPSEEK_TIMEOUT_MS=15000      # 单位 ms
```

### 6.8 接入新 LLM 服务的原则

1. **不直接控制任何动作**：只通过 `StrategicDirective` 调整 mode/weights，让 `DefaultAIDecisionMaker` 接管执行。
2. **失败安全**：任何错误必须 fallback 到默认指令；不应让 LLM 故障阻塞本地 AI。
3. **超时合理**：timeoutMs 应 ≥ 15000（LLM 跨太平洋 RTT 就要数百毫秒）。
4. **避开 reasoning 模型**（如 `deepseek-reasoner`、`deepseek-v4-flash`）：带推理链的模型会把 token 预算花在 `reasoning_content`，导致 `content` 长度为零、`finish_reason='length'`。如果一定要用，需要额外兜底解析 `reasoning_content`。
5. **markAdvisorCalled()**：如果外部主动调了 `advise()`，记得通知引擎同步计时器。
6. **使用 `getDefaultAIDecisionMaker()` 写入**：确保 mode/weights 写到对的位置；如果返回 `null`（说明当前 AI 不是 `DefaultAIDecisionMaker`），战略指令被丢弃。

### 6.9 自定义本地决策器（高级用例）

如果想**完全替换**本地 AI（不通过战略顾问路径），仍然支持：

```typescript
import { getGameEngine, type AIDecisionMaker } from './game';

class MyDecisionMaker implements AIDecisionMaker {
  makeDecision(context: AIBattleContext): AIDecision {
    return { action: 'wait' };
  }
}

getGameEngine().setAIDecisionMaker(new MyDecisionMaker());
// 注意：如果不是 DefaultAIDecisionMaker，setStrategicAdvisor() 的指令会被丢弃
```

`CustomAIDecisionMaker` 仍是占位类，当前 `makeDecision()` 回退默认策略。

接入原则：
- 不在自定义 AI 中直接修改 `useGameStore`；由 `GameEngine` 执行。
- 必须按 action 提供正确字段：建造需要位置和模板，升级/拆除需要目标 ID。
- 位置、食物、等级和阵营归属由执行层再次校验。

`CustomAIDecisionMaker` 仍是占位类，当前 `makeDecision()` 回退默认策略。

接入原则：

- 不在自定义 AI 中直接修改 `useGameStore`；由 `GameEngine` 执行。
- 必须按 action 提供正确字段：建造需要位置和模板，升级/拆除需要目标 ID。
- 位置、食物、等级和阵营归属由执行层再次校验。


## 7. 事件总线接口

### 7.1 EventEmitter

`src/core/Events.ts` 提供同步、单进程内的事件总线：

```typescript
gameEvents.on<T extends GameEvent>(
  eventType: T['type'],
  callback: (event: T) => void,
): () => void;

gameEvents.off<T extends GameEvent>(
  eventType: T['type'],
  callback: (event: T) => void,
): void;

gameEvents.emit<T extends GameEvent>(event: T): void;
gameEvents.clear(): void;
gameEvents.listenerCount(eventType: string): number;
```

`on()` 返回取消订阅函数，优先使用它。事件回调异常会被捕获并输出到控制台，不影响其他监听器。

### 7.2 事件类型

`GameEvent` 联合类型当前包含：

- 实体：`ant_spawn`、`ant_death`、`ant_state_change`、`ant_damaged`
- 孵化室：`hatchery_built`、`hatchery_upgraded`、`hatchery_demolished`
- 战斗：`combat`、`projectile_fire`、`projectile_hit`
- Buff：`buff_applied`、`buff_expired`
- 技能：`ability_triggered`、`stinger_strike`、`honeypot_explosion`、`taunt_triggered`、`escape_ability`
- 蚁后：`queen_damaged`、`queen_defeated`、`queen_attack`
- AI/资源/解锁：`ai_decision`、`food_changed`、`part_unlocked`
- 生命周期：`game_start`、`game_pause`、`game_resume`、`game_end`

### 7.3 便捷发布器与订阅示例

`GameEvents` 是类型化发布方法集合，例如：

```typescript
GameEvents.emitAntSpawn(ant, hatchery);
GameEvents.emitQueenDamaged('enemy', damage, remainingHp);
GameEvents.emitGameStart();
```

订阅统一使用底层 `gameEvents`：

```typescript
import { gameEvents } from './core/Events';

const unsubscribe = gameEvents.on('part_unlocked', (event) => {
  if (event.side === 'player') {
    // 更新通知或 UI
  }
});

unsubscribe();
```

注意：当前 `GameEngine` 自身不通过事件总线发布游戏开始/结束；`game_start`、`game_pause` 等生命周期事件由旧 `GameLoop` 使用。`GameEngine` 与 `GameLoop` 的事件语义不能直接混用。

## 8. 配置接口

### 8.1 `gameConfig.ts`

| 导出 | 用途 |
| --- | --- |
| `GAME_CONFIG: GameConfig` | 地图、孵化、战斗、建造、拆除、碰撞和拔河参数 |
| `QUEEN_CONFIG` | 蚁后最大生命和双方位置 |
| `DIFFICULTY_CONFIG: Record<Difficulty, ...>` | 敌方食物加成和 UI 文案 |
| `BUILD_ZONE` | 双方 5×5 建造区像素起点 |
| `SPAWN_OFFSET` | 蚂蚁从蚁后前方生成的位置 |
| `UNLOCK_CONFIG` | 解锁间隔、阶段时间、阶段部件 |
| `QUEEN_ATTACK_CONFIG` | 蚁后攻击冷却、伤害、射程、子弹速度 |
| `COLORS` | Pixi 阵营、场景、投射物和特效颜色 |

当前 `GAME_CONFIG` 关键值：

```typescript
mapWidth: 1800;
mapHeight: 600;
spawnInterval: 10000;       // 初始孵化间隔
foodInterval: 2000;
foodPerInterval: 5;
gridSize: 50;
gridCols: 5;
gridRows: 5;
baseHatcheryCost: 60;       // 源码当前值
maxAntsPerHatchery: 1;
maxHatcheryLevel: 3;
upgradeStatBonus: 0.3;
demolishRefundRate: 0.5;
tugOfWarFoodBonus: 3;
antCollisionRadius: 10;
```

重要源码差异：

1. `baseHatcheryCost` 源码是 `60`，README 和旧文档写 `30`；以后以 `gameConfig.ts` 为准。
2. `GameConfig` 与 `GAME_CONFIG` 当前使用 `demolishRefundRate`，Store 的拆除逻辑也读取该字段。

### 8.2 `partStats.ts`

| 导出 | 说明 |
| --- | --- |
| `HEAD_CONFIGS` | `Record<HeadVariant, PartConfig>` |
| `THORAX_CONFIGS` | `Record<ThoraxVariant, PartConfig>` |
| `ABDOMEN_CONFIGS` | `Record<AbdomenVariant, PartConfig>` |
| `getHeadConfig/getThoraxConfig/getAbdomenConfig` | variant 到 `PartConfig` 的查询函数 |
| `calculateAntStats(head, thorax, abdomen)` | 计算总属性、成本、远程标记、射程、固定护甲、战略价值 |
| `getAllParts()` | 返回三类配置数组 |

`calculateAntStats()` 的推断返回类型核心字段：

```typescript
{
  hp: number;
  damage: number;
  speed: number;
  attackSpeed: number; // 攻击间隔，ms
  cost: number;
  isRanged: boolean;
  rangedDamage: number;
  attackRange: number;
  strategicValue: number;
  flatArmor: number;
}
```

`RANGED_CONFIG`、`ESCAPE_ABILITY_CONFIG`、`ATTACK_SPEED_AURA_CONFIG`、`STINGER_ABILITY_CONFIG`、`TAUNT_ABILITY_CONFIG`、`INSTANT_KILL_CONFIG`、`HONEYPOT_EXPLOSION_CONFIG` 等技能参数也从该文件导出。

## 9. 渲染、UI、音效与桌面端

### 9.1 React UI

`App` 组合的顶层界面：

| 组件 | 作用 | 主要数据/动作 |
| --- | --- | --- |
| `StatusBar` | 双方资源、蚁后血量、游戏时间、拔河优势、统计 | `playerFood`、`enemyFood`、双方 Queen、`stats` |
| `GameCanvas` | Pixi 画布容器和开始/暂停/继续/重开覆盖层 | `usePixiApp`、`status` |
| `AssemblyPanel` | 头部/胸部/腹部选择（属性预览已并入 `BuildPanel`，避免重复） | `playerTemplate`、解锁列表 |
| `BuildPanel` | `build/upgrade/demolish` 模式切换 + 当前配置预览 + 建造成本卡 | `setBuildMode`、`playerTemplate`、`playerFood` |
| `UnlockNotifications` | 玩家部件解锁浮层 | `unlockNotifications` |
| `AITrashTalk` | 敌方蚁后消息气泡和淡出动画 | `aiTrashTalk`、`aiTrashTalkTime` |
| `SoundControl` | 音效开关和主音量 | `soundManager` |

`AssemblyPanel` 只显示 `playerUnlockedParts` 中的 variant。新增部件后，UI 会从 `HEAD_CONFIGS`、`THORAX_CONFIGS`、`ABDOMEN_CONFIGS` 查找到配置，但玩家是否能选仍由解锁列表决定。

### 9.2 `usePixiApp`

```typescript
interface UsePixiAppOptions {
  backgroundColor?: number; // 默认 0x0a0f1a
}

function usePixiApp(options?: UsePixiAppOptions): {
  containerRef: RefObject<HTMLDivElement>;
  startGame: () => void;
  pauseGame: () => void;
  resumeGame: () => void;
  resetGame: () => void;
};
```

生命周期：

1. `useEffect` 创建 `PIXI.Application`，宽高使用 `GAME_CONFIG.mapWidth/mapHeight`。
2. 将 canvas append 到 `containerRef.current`，创建 `PixiRenderer`。
3. 独立启动渲染 RAF，调用 `renderer.update()`。
4. 卸载时取消 RAF、调用 `renderer.destroy()`、销毁 PIXI app。

它只负责 Pixi 生命周期和 `GameEngine` 生命周期命令，不持有游戏领域状态。

### 9.3 音效接口

`src/utils/SoundManager.ts` 导出单例 `soundManager`：

```typescript
interface SoundManager {
  init(): void;
  play(key: string, force?: boolean): void;
  playAttack(isRanged: boolean): void;
  playDeath(side: Side): void;
  playHatchery(action: 'build' | 'upgrade' | 'demolish'): void;
  playSpawn(side: Side): void;
  playQueen(action: 'damage' | 'death'): void;
  playAbility(ability: 'taunt' | 'escape' | 'stinger' | 'honeypot' | 'execution'): void;
  playUI(action: 'click' | 'unlock' | 'victory' | 'defeat'): void;
  setEnabled(enabled: boolean): void;
  setMasterVolume(volume: number): void;
  setCategoryVolume(category: string, volume: number): void;
  isEnabled(): boolean;
  destroy(): void;
}
```

`SoundControl` 还导出 `playSound` 便捷对象，规则代码通常使用它而不是直接操作 `Howler`。当前音效文件位于 `public/sounds/`，路径由 `src/config/sounds.ts` 统一配置；缺失资源时 `Howl` 会记录加载错误，但不会阻止游戏逻辑运行。

### 9.4 Electron

`electron/main.js`：

- 开发环境加载 `http://localhost:5173` 并打开 DevTools。
- 生产环境从 `app.getAppPath()/dist/index.html` 加载文件。
- `BrowserWindow` 最小尺寸 1000×700，开发尺寸 1200×800。
- 启用 `contextIsolation`，关闭 `nodeIntegration`。
- macOS `activate` 时可重建窗口；其他平台窗口关闭后退出应用。

前端事件接口没有 preload bridge；当前渲染进程不直接调用 Node/Electron API。

## 10. 扩展开发清单

### 10.1 添加新部件

1. 在 `src/types/index.ts` 扩展 `HeadVariant`、`ThoraxVariant` 或 `AbdomenVariant`。
2. 在 `src/config/partStats.ts` 对应配置表添加 `PartConfig`。
3. 在 `UNLOCK_CONFIG.parts` 决定它属于哪个阶段，或让初始解锁/特殊规则加入。
4. 若有新能力，在 `GameEngine.ts` 的对应战斗阶段增加触发条件。
5. 在 `PixiRenderer.ts` 增加 variant 绘制分支。
6. 在 UI 文案、部件配置和 README 中同步描述；`AssemblyPanel` 会按配置自动列出已解锁项。

### 10.2 添加新 Buff

1. 在 `BuffType` 增加新字符串。
2. 定义 `value` 的百分比/单位含义和 `duration`。
3. 在 `GameEngine` 的属性计算/效果触发位置使用 `addBuffToAnt()`。
4. 在 `PixiRenderer` 决定是否需要粒子、光环或提示。
5. 明确 `stackable`；非叠加类型使用源码当前的“取最大 value/duration”策略。

### 10.3 添加新系统

如果规则可以纳入当前帧管线：

1. 在 `GameEngine` 中实现纯计算方法或私有方法。
2. 放入 `gameLoop` 的正确阶段。
3. 通过 `useGameStore` action 提交状态。
4. 通过事件通知外部订阅者，或通过引擎公开的动画事件数组驱动渲染。
5. 添加/更新单元测试，验证状态转移和返回值。

如果只是旧 `Game.ts` 的系统接口，先确认是否要迁移到当前 `GameEngine`；不要在未切换运行入口的情况下宣称新系统已生效。

### 10.4 接入外部 AI

1. 只把“决策”交给外部模块，不要让外部模块直接操作 Pixi 或 Store 实体。
2. 将 `AIBattleContext` 序列化为模型输入。
3. 严格解析为 `AIDecision`，并校验 action 字段。
4. 通过 `getGameEngine().setAIDecisionMaker()` 安装。
5. 给决策器加超时、缓存和错误回退；网络请求不能在 RAF 中无界阻塞。
6. 联调时同时检查 `engine.getBattleContext()` 返回的数据是否足够，避免模型重复读取 Store。

### 10.5 新增 UI

- 从 `useGameStore` 订阅所需字段。
- 逻辑操作调用已有 Store action 或公开引擎方法。
- 不要在组件中重新实现 `calculateAntStats`、`calculateHatcheryCost` 或战斗判定。
- React StrictMode 下音效/资源类单例要注意重复初始化；`App` 当前通过 effect 初始化并在 cleanup 销毁。

## 11. 测试与构建检查

### 11.1 当前脚本

`package.json` 没有单独列出测试脚本或测试依赖。当前可用的最小验证流程是：

```bash
npm run build
```

如果新增测试框架，再补充对应命令到 `package.json`，并确保至少覆盖：

- `calculateHatcheryCost`
- `calculateAntStats`
- `canBuildAt` / `buildHatchery` / `upgradeHatchery` / `demolishHatchery`
- `damageQueen` 胜负状态转换
- AI context 字段和默认决策 action
- `DefaultAIDecisionMaker` 部件加权采样（均匀权重 / 单项权重 / 全 0 退化为均匀随机）
- `DefaultAIDecisionMaker.setWeights()` 输入清洗（负数/非数字/未解锁过滤）
- `GameEngine.maybeAdvise()` 60 游戏秒节奏 + 暂停不调用 + reset 重置
- `DeepSeekStrategicAdvisor` 失败回退、inflight 单飞、length 自愈、指数退避
- 事件订阅/取消订阅
- `GameEngine` 生命周期和 AI 手动操作边界

### 11.2 手工运行检查

```bash
npm run dev
```

打开后检查：开始/暂停/继续/重置、建造和升级、双方战斗、食物增加、解锁通知、AI 建造/升级/拆除、暂停后不再更新、胜负覆盖层和音效开关。

## 12. 已知不一致与技术债

以下内容不是本次文档引入的问题，而是源码现状，后续开发应明确处理：

1. **双总控**：当前 `GameEngine` 与旧 `Game.ts/GameLoop` 并存，规则在 `GameEngine` 和 `systems/` 各有一份。
2. **配置文档过期**：README 和旧 `plans/architecture.md` 的基础孵化室成本写成 30，当前源码为 60。
3. **配置文档与源码曾不一致**：`README.md` 和旧 `plans/architecture.md` 仍写基础成本为 30，而源码当前为 60；开发时以 `gameConfig.ts` 和类型定义为准。
4. **AI 双份声明（仍存在）**：`AISystem.ts`（旧实现）和 `GameEngine.ts`（当前实现）都定义 `AIDecisionMaker` 等类型；外部集成应优先从 `src/game` 导入。`AISystem.ts` 当前未被运行链使用，保留仅作历史参考。
5. **LLM 已从 Gemini 迁到 DeepSeek**（`.env` 变量已重命名为 `VITE_DEEPSEEK_*`）。如再发现任何代码或文档引用 "Gemini"，应立即纠正为 "DeepSeek"。`DeepSeekStrategicAdvisor` 跑在 OpenAI 兼容接口上，未来要切换其他 LLM 服务商只需改 `baseUrl`。
6. **战略层与决策层时间度量不一致**：本地 AI（`handleAIDecision`）按真实时间 / gameSpeed 节奏；战略层（`maybeAdvise`）按 gameTime 节奏。这是**有意设计**——本地决策跟随游戏速度；战略评估按游戏内进度（暂停时不调）。
7. **事件覆盖不完整**：许多事件类型和发布方法已定义，但当前主循环主要直接读写 Store；不要假设每个类型都有对应运行时发射点。
8. **生命周期事件来源不同**：旧 `GameLoop` 发送 `game_start/pause/resume`，当前 `GameEngine` 走 Store 状态。
9. **AudioManager 生命周期**：React StrictMode 下需确认音效 singleton 在初始化/清理后仍保持正确状态。
10. **旧文档不可作为接口真相**：README 偏玩法说明，架构文档存在过期字段和不存在文件；开发前以源码和本文为准。
11. **Electron 开发端口不一致**：`vite.config.ts` 默认端口是 3000，而 `electron/main.js` 的开发加载地址仍是 5173；启动 `npm run electron:dev` 前需统一端口或显式配置。

## 13. 快速定位表

| 需求 | 优先查看 |
| --- | --- |
| 了解当前运行链 | `src/main.tsx`、`src/App.tsx`、`src/hooks/usePixiApp.ts` |
| 修改游戏规则 | `src/game/GameEngine.ts` 帧管线 |
| 增加/修改实体字段 | `src/types/index.ts`、Store、引擎、渲染器同步更新 |
| 修改资源/部件数值 | `src/config/gameConfig.ts`、`src/config/partStats.ts` |
| 增加 UI 面板 | `src/components/`，从 `useGameStore` 取状态 |
| 修改 Pixi 视觉 | `src/game/PixiRenderer.ts` |
| 修改基地格子交互/视觉 | `src/game/PixiRenderer.ts`：`setupBuildZoneCells` / `refreshBuildZoneCells` / `handleGridClick` / `handleGridHover` / `showGridTooltip`（详见 5.5 节） |
| 替换本地 AI 决策 | `AIDecisionMaker`、`getGameEngine().setAIDecisionMaker()` |
| 调整部件加权采样 | `DefaultAIDecisionMaker.setWeights()`、`PartWeights` |
| 替换/接入 LLM 战略 | `IStrategicAdvisor`、`getGameEngine().setStrategicAdvisor()`、`src/ai/DeepSeekStrategicAdvisor.ts` |
| 调试战略层调度节奏 | `GameEngine.maybeAdvise()`、`ADVISOR_INTERVAL_MS=60_000`（60 游戏秒） |
| 调试事件 | `src/core/Events.ts` |
| 修改音效 | `src/config/sounds.ts`、`src/utils/SoundManager.ts`、`src/components/SoundControl.tsx` |
| 打包桌面应用 | `electron/main.js`、`package.json` build 配置 |

## 14. 维护规则

当代码结构或公共接口变化时，至少同步：

1. 本文件中的入口、类型、action、事件和配置说明。
2. `README.md` 中的玩法和扩展示例（如果公共示例受源码影响）。
3. 实际导出文件 `src/game/index.ts`、`src/core/index.ts`、组件 index（如有）。
4. `npm run build` 和手工运行验证结果。
5. 迁移记录：哪些模块废弃、哪些接口是兼容层、当前生效入口是什么。

> 本文档不是对旧 `plans/architecture.md` 的简单复制，而是按当前源码重新建立开发参考。旧文档可用于追溯设计意图，但不能覆盖本文对当前实现接口的描述。
