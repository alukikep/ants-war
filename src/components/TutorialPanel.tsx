/**
 * 新手教学面板
 *
 * 包含两部分：
 * - TutorialButton：触发按钮，与"开始游戏"按钮并列展示在 idle 覆盖层和暂停覆盖层中
 * - TutorialModal：全屏模态，完整展示 README「游戏玩法」章节的内容（含部件数值表格）
 *
 * 内容章节（按 README 顺序，已删除与玩法无关的"战斗系统"）：
 * §1 核心机制 / §2 资源系统 / §3 部件解锁 / §4 孵化室 / §5 蚂蚁部件
 *
 * 视觉风格沿用既有约定：font-game + bio-primary / bio-secondary / bio-accent，
 * 模态层参考 SettingsPanel.SettingsModal 的遮罩 + 弹窗结构。
 */

import React from 'react';

// ===== 数据（取自 README.md「游戏玩法」章节）=====

interface UnlockStage {
  key: 'stage1' | 'stage2' | 'stage3';
  label: string;
  openTime: string;
  badgeClass: string;
  parts: string[];
}

const UNLOCK_STAGES: UnlockStage[] = [
  {
    key: 'stage1',
    label: '阶段一',
    openTime: '开局起',
    badgeClass: 'bg-bio-primary/20 text-bio-primary border-bio-primary/50',
    parts: ['火蚁头', '木蚁胸', '陷阱蚁腹', '木蚁腹'],
  },
  {
    key: 'stage2',
    label: '阶段二',
    openTime: '5 分钟后',
    badgeClass: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
    parts: ['切叶蚁头', '兵蚁头', '行军蚁胸', '子弹蚁胸', '蜜罐蚁腹', '织叶蚁腹'],
  },
  {
    key: 'stage3',
    label: '阶段三',
    openTime: '10 分钟后',
    badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/50',
    parts: ['大齿猛蚁头', '白蚁大兵头', '大头蚁头', '切叶蚁胸', '马塔贝勒蚁腹'],
  },
];

interface PartRow {
  name: string;
  attack: string;
  hp: string;
  speed: string;
  attackSpeed: string;
  cost: number;
  desc: string;
  highlight?: boolean;
}

const HEAD_PARTS: PartRow[] = [
  { name: '基础头部', attack: '+0', hp: '+0', speed: '+0', attackSpeed: '+0%', cost: 0, desc: '标准头部' },
  { name: '切叶蚁头', attack: '+20', hp: '+0', speed: '+0', attackSpeed: '+0%', cost: 80, desc: '锋利大颚', highlight: true },
  { name: '兵蚁头', attack: '+25', hp: '+10', speed: '-5', attackSpeed: '+0%', cost: 70, desc: '重型战斗头部' },
  { name: '火蚁头', attack: '+0', hp: '+0', speed: '+0', attackSpeed: '+10%', cost: 60, desc: '毒牙攻击' },
  { name: '大齿猛蚁头', attack: '+10', hp: '+0', speed: '+0', attackSpeed: '+0%', cost: 70, desc: '弹射逃脱', highlight: true },
  { name: '白蚁大兵头', attack: '+15', hp: '+30', speed: '+0', attackSpeed: '+0%', cost: 100, desc: '攻速光环', highlight: true },
  { name: '大头蚁头', attack: '+5', hp: '+40', speed: '+0', attackSpeed: '+100%', cost: 110, desc: '秒杀', highlight: true },
];

const THORAX_PARTS: PartRow[] = [
  { name: '基础胸部', attack: '+0', hp: '+0', speed: '+0', attackSpeed: '+0%', cost: 0, desc: '标准胸部' },
  { name: '行军蚁胸', attack: '+0', hp: '+0', speed: '+30', attackSpeed: '+0%', cost: 50, desc: '高速移动' },
  { name: '木蚁胸', attack: '+0', hp: '+15', speed: '+10', attackSpeed: '+0%', cost: 60, desc: '护甲分等级', highlight: true },
  { name: '子弹蚁胸', attack: '+0', hp: '-30', speed: '+50', attackSpeed: '+10%', cost: 80, desc: '极速突击', highlight: true },
  { name: '切叶蚁胸', attack: '+0', hp: '+40', speed: '+0', attackSpeed: '+0%', cost: 90, desc: '嘲讽+护甲', highlight: true },
];

const ABDOMEN_PARTS: PartRow[] = [
  { name: '基础腹部', attack: '+0', hp: '+0', speed: '+0', attackSpeed: '+0%', cost: 0, desc: '标准腹部' },
  { name: '蜜罐蚁腹', attack: '+0', hp: '+40', speed: '-15', attackSpeed: '+0%', cost: 70, desc: '死亡回复', highlight: true },
  { name: '织叶蚁腹', attack: '+0', hp: '+60', speed: '+10', attackSpeed: '+10%', cost: 60, desc: '灵活均衡' },
  { name: '陷阱蚁腹', attack: '+15', hp: '+30', speed: '+0', attackSpeed: '+15%', cost: 70, desc: '爆发输出' },
  { name: '木蚁腹', attack: '+5', hp: '-80%', speed: '+5', attackSpeed: '+0%', cost: 80, desc: '远程喷酸', highlight: true },
  { name: '马塔贝勒蚁腹', attack: '+0', hp: '+80', speed: '+0', attackSpeed: '+0%', cost: 110, desc: '尾针技能', highlight: true },
];

// ===== 部件表格（带颜色高亮的属性单元格）=====

const attrClass = (val: string) => {
  if (val === '+0' || val === '+0%') return 'text-gray-500';
  if (val.startsWith('-')) return 'text-red-400';
  if (val.includes('%')) return 'text-yellow-300';
  return 'text-bio-primary';
};

interface PartTableProps {
  title: string;
  subtitle: string;
  rows: PartRow[];
  thClass: string;
}

const PartTable: React.FC<PartTableProps> = ({ title, subtitle, rows, thClass }) => (
  <div className="mb-5">
    <div className="flex items-baseline gap-2 mb-2">
      <span className={`font-game font-bold text-sm ${thClass}`}>{title}</span>
      <span className="text-xs text-gray-500">{subtitle}</span>
    </div>
    <div className="overflow-x-auto rounded border border-gray-700/60">
      <table className="w-full text-xs">
        <thead className="bg-gray-800/70 text-gray-400">
          <tr>
            <th className="px-2 py-1.5 text-left font-game">部件</th>
            <th className="px-2 py-1.5 text-right font-game">攻击</th>
            <th className="px-2 py-1.5 text-right font-game">生命</th>
            <th className="px-2 py-1.5 text-right font-game">速度</th>
            <th className="px-2 py-1.5 text-right font-game">攻速</th>
            <th className="px-2 py-1.5 text-right font-game">成本</th>
            <th className="px-2 py-1.5 text-left font-game">描述</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={row.name}
              className={`${idx % 2 === 0 ? 'bg-gray-900/40' : 'bg-gray-900/20'} ${
                row.highlight ? 'text-gray-100' : 'text-gray-300'
              }`}
            >
              <td className="px-2 py-1.5 font-game">
                {row.name}
                {row.highlight && <span className="ml-1 text-bio-accent text-[10px]">★</span>}
              </td>
              <td className={`px-2 py-1.5 text-right font-game ${attrClass(row.attack)}`}>{row.attack}</td>
              <td className={`px-2 py-1.5 text-right font-game ${attrClass(row.hp)}`}>{row.hp}</td>
              <td className={`px-2 py-1.5 text-right font-game ${attrClass(row.speed)}`}>{row.speed}</td>
              <td className={`px-2 py-1.5 text-right font-game ${attrClass(row.attackSpeed)}`}>{row.attackSpeed}</td>
              <td className="px-2 py-1.5 text-right font-game text-yellow-300">{row.cost}</td>
              <td className={`px-2 py-1.5 ${row.highlight ? 'text-bio-accent' : 'text-gray-400'}`}>{row.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ===== 触发按钮 =====

interface TutorialButtonProps {
  onClick: () => void;
  /** 紧凑样式：用于暂停覆盖层这种横向布局 */
  compact?: boolean;
}

export const TutorialButton: React.FC<TutorialButtonProps> = ({ onClick, compact = false }) => {
  if (compact) {
    return (
      <button
        onClick={onClick}
        className="px-6 py-3 bg-gray-700/80 text-white font-game font-bold rounded-lg
                   hover:bg-gray-600 transition-all duration-300 border border-gray-500/60"
        title="查看游戏玩法说明"
      >
        📖 新手教学
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className="px-8 py-4 bg-gray-700/80 text-white font-game font-bold text-xl rounded-lg
                 hover:bg-gray-600 transition-all duration-300
                 border border-gray-500/60 shadow-lg hover:scale-105"
    >
      📖 新手教学
    </button>
  );
};

// ===== 模态弹窗 =====

interface TutorialModalProps {
  open: boolean;
  onClose: () => void;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="新手教学"
    >
      <div
        className="bg-gray-900 border border-bio-primary/40 rounded-lg shadow-2xl
                   w-full max-w-3xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-bio-primary/30 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📖</span>
            <div>
              <h2 className="text-bio-primary font-game text-xl font-bold">新手教学</h2>
              <p className="text-xs text-gray-500 mt-0.5">融合蚁大战 · 玩法完整说明</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center rounded hover:bg-gray-800"
            title="关闭"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        {/* 内容区（可滚动） */}
        <div className="overflow-y-auto px-6 py-5 text-sm text-gray-300 space-y-6 leading-relaxed">
          {/* §1 核心机制 */}
          <section>
            <h3 className="text-bio-primary font-game font-bold text-base mb-3 flex items-center gap-2">
              <span className="text-gray-500">§1</span> 核心机制
            </h3>
            <ul className="space-y-1.5 list-none">
              <li>• <b className="text-player-blue">玩家（蓝方）</b>在左侧，<b className="text-enemy-red">AI（红方）</b>在右侧，各有一个蚁后基地</li>
              <li>• 在蚁后后方的建造区域放置<b>孵化室</b>，消耗食物</li>
              <li>• 每个孵化室定期孵化蚂蚁（初始 10 秒，每过 1 分钟 +1 秒，每室同时存活 1 只）</li>
              <li>• 蚂蚁自动向敌方基地前进，遭遇敌人时进入战斗</li>
              <li>• 有己方单位越过中线时，每次食物生成额外 <span className="text-yellow-300">+3</span></li>
              <li>• <b className="text-bio-secondary">胜负条件</b>：攻击对方蚁后使其血量归零即可获胜</li>
            </ul>
          </section>

          {/* §2 资源系统 */}
          <section>
            <h3 className="text-bio-primary font-game font-bold text-base mb-3 flex items-center gap-2">
              <span className="text-gray-500">§2</span> 资源系统
            </h3>
            <ul className="space-y-1.5 list-none">
              <li>• 初始食物：<span className="text-yellow-300">0</span>（从零开始积攒）</li>
              <li>• 食物生成：每 <b>2 秒</b>双方各获得食物，初始 <b>5</b>，每过 1 分钟 +1</li>
              <li>• 拔河优势：有己方单位越过中线时，每次食物额外 <span className="text-yellow-300">+3</span></li>
              <li>• 建造成本：基础 60 食物 + 部件成本（参见下文章节）</li>
              <li>• 升级成本：等同于建造成本</li>
              <li>• 拆除返还：<span className="text-bio-primary">50%</span> 已投资资源</li>
            </ul>
          </section>

          {/* §3 部件解锁系统 */}
          <section>
            <h3 className="text-bio-primary font-game font-bold text-base mb-3 flex items-center gap-2">
              <span className="text-gray-500">§3</span> 部件解锁系统
            </h3>
            <p className="text-gray-400 text-xs mb-3">
              双方各拥有基础三件套 + 随机 1 个阶段一部件；每过 1 分钟双方各随机解锁一个新部件。
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {UNLOCK_STAGES.map((stage) => (
                <div
                  key={stage.key}
                  className={`rounded-lg border p-3 ${stage.badgeClass}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-game font-bold text-sm">{stage.label}</span>
                    <span className="text-[10px] text-gray-400">{stage.openTime}</span>
                  </div>
                  <ul className="space-y-1 text-xs">
                    {stage.parts.map((p) => (
                      <li key={p} className="text-gray-300">• {p}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* §4 孵化室系统 */}
          <section>
            <h3 className="text-bio-primary font-game font-bold text-base mb-3 flex items-center gap-2">
              <span className="text-gray-500">§4</span> 孵化室系统
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <div className="rounded-lg border border-player-blue/50 bg-player-blue/10 p-3">
                <div className="text-player-blue font-game font-bold text-sm mb-1">1 级 · 蓝框</div>
                <div className="text-xs text-gray-400">基础属性（1× 成本）</div>
              </div>
              <div className="rounded-lg border border-yellow-400/60 bg-yellow-500/10 p-3">
                <div className="text-yellow-300 font-game font-bold text-sm mb-1">2 级 · ★★</div>
                <div className="text-xs text-gray-400">+30% 攻击/生命（2× 成本）</div>
              </div>
              <div className="rounded-lg border border-purple-400/60 bg-purple-500/10 p-3">
                <div className="text-purple-300 font-game font-bold text-sm mb-1">3 级 · ★★★</div>
                <div className="text-xs text-gray-400">+60% 攻击/生命（3× 成本）</div>
              </div>
            </div>
            <p className="text-xs text-gray-400">
              点击空格建造；点击已有孵化室升级或拆除。速度与攻速不受等级加成影响。每室最多同时存活 1 只蚂蚁，蚂蚁死亡后恢复孵化。
            </p>
          </section>

          {/* §5 蚂蚁部件系统 */}
          <section>
            <h3 className="text-bio-primary font-game font-bold text-base mb-1 flex items-center gap-2">
              <span className="text-gray-500">§5</span> 蚂蚁部件系统
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              每只蚂蚁由 <b>头部（主攻击）</b>、<b>胸部（主移速）</b>、<b>腹部（主生命）</b> 三个部件组成。带 <span className="text-bio-accent">★</span> 表示拥有特殊技能。
            </p>

            <PartTable
              title="头部 (主攻击)"
              subtitle="加成倾向：攻击力"
              rows={HEAD_PARTS}
              thClass="text-enemy-red"
            />
            <PartTable
              title="胸部 (主移速)"
              subtitle="加成倾向：移动速度"
              rows={THORAX_PARTS}
              thClass="text-bio-secondary"
            />
            <PartTable
              title="腹部 (主生命)"
              subtitle="加成倾向：生命值 / 特殊功能"
              rows={ABDOMEN_PARTS}
              thClass="text-bio-primary"
            />

            <div className="mt-3 p-3 rounded border border-yellow-500/40 bg-yellow-500/10 text-xs space-y-1">
              <div className="text-yellow-300 font-game font-bold mb-1">🌟 特殊技能一览</div>
              <div className="text-gray-300">• <b>暴击</b>（切叶蚁头）：攻击按孵化室等级 5%/10%/15% 触发，3 倍伤害</div>
              <div className="text-gray-300">• <b>固定护甲</b>（木蚁胸）：按孵化室等级 +5/+8/+12 固定护甲（实际伤害 = max(1, 基础伤害 − 护甲)）</div>
              <div className="text-gray-300">• <b>肾上腺素</b>（子弹蚁胸）：首次受敌触发，+50/75/100% 攻击 + 50/60/80% 护甲，持续 5/8/12 秒，60 秒冷却</div>
              <div className="text-gray-300">• <b>弹射逃脱</b>（大齿猛蚁头）：生命 &lt; 40% 时触发，弹射 150px 恢复 50% 生命（10 秒冷却）</div>
              <div className="text-gray-300">• <b>攻速光环</b>（白蚁大兵头）：攻击时为 100px 内队友增加攻速（1/2/3 级 +5/10/15%，上限 300%，每秒衰减 20%）</div>
              <div className="text-gray-300">• <b>秒杀</b>（大头蚁头）：+5 攻击/+40 生命/+100% 攻速；根据孵化室等级 3%/5%/8% 几率秒杀</div>
              <div className="text-gray-300">• <b>嘲讽+护甲</b>（切叶蚁胸）：生命 &lt; 20% 触发，100px 范围嘲讽敌人，回复 30% 生命并获得 80% 护甲 5 秒（15 秒冷却）</div>
              <div className="text-gray-300">• <b>死亡回复</b>（蜜罐蚁腹）：死亡时在 80px 范围内为友军各回复 50 HP</div>
              <div className="text-gray-300">• <b>远程喷酸</b>（木蚁腹）：唯一远程攻击部件，发射酸液子弹，享受完整头部攻击力加成（-80% 生命值）</div>
              <div className="text-gray-300">• <b>尾针技能</b>（马塔贝勒蚁腹）：5 秒冷却，减 50% 攻速 4 秒 + 中毒（1/2/3 级 40/60/100 伤害，持续 4 秒）</div>
            </div>
          </section>
        </div>

        {/* 底部按钮 */}
        <div className="px-6 py-4 border-t border-bio-primary/30 flex justify-center shrink-0">
          <button
            onClick={onClose}
            className="px-8 py-2.5 bg-bio-primary text-bio-dark font-game font-bold rounded-lg
                       hover:bg-bio-secondary transition-all duration-300 shadow-neon-green"
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  );
};

