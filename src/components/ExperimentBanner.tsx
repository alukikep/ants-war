/**
 * 科学家"实验性干预"状态横幅
 *
 * - 当 activeExperiment 为 null 或 kind === 'none' 时不显示
 * - 显示在游戏画布上方居中（顶部），不阻挡游戏内容
 * - 进度条显示剩余时间
 * - 配色按 experiment.tone 切换：info / warn / danger
 *
 * 倒计时基于 stats.gameTime（游戏时间）：
 * - 暂停时 gameTime 不走，剩余时间自动冻结
 * - 3x 速下 gameTime 推进 3 倍，剩余时间按游戏时间消耗（真实耗时 1/3）
 * - 每 100ms 从 store 拉一次新值（无需 RAF，避免与游戏主循环抢资源）
 */

import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { EXPERIMENT_SPECS } from '../config/experiments';

const TONE_STYLES = {
  info: {
    bg: 'from-cyan-900/80 to-blue-900/80',
    border: 'border-cyan-400/60',
    text: 'text-cyan-100',
    accent: 'bg-cyan-400',
    label: 'text-cyan-200',
  },
  warn: {
    bg: 'from-amber-900/80 to-yellow-900/80',
    border: 'border-amber-400/60',
    text: 'text-amber-100',
    accent: 'bg-amber-400',
    label: 'text-amber-200',
  },
  danger: {
    bg: 'from-red-900/80 to-rose-900/80',
    border: 'border-red-400/60',
    text: 'text-red-100',
    accent: 'bg-red-400',
    label: 'text-red-200',
  },
} as const;

const SIDE_LABEL: Record<'player' | 'enemy' | 'both', string> = {
  player: '蓝方',
  enemy: '红方',
  both: '双方',
};

export const ExperimentBanner: React.FC = () => {
  const activeExperiment = useGameStore((state) => state.activeExperiment);
  // 仅订阅 gameTime，避免每次 stats 变化都触发重渲染
  const gameTime = useGameStore((state) => state.stats.gameTime);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!!activeExperiment);
  }, [activeExperiment]);

  if (!activeExperiment || !visible) return null;

  const spec = EXPERIMENT_SPECS[activeExperiment.kind];
  const style = TONE_STYLES[spec.tone];

  // endsAt 是游戏时间戳 (gameTime)，所以剩余时长 = endsAt - gameTime
  const remainingMs = Math.max(0, activeExperiment.endsAt - gameTime);
  // 总时长近似：endsAt - (gameTime - 1000)，首帧也能给出合理进度
  const totalMs = Math.max(1000, activeExperiment.endsAt - (gameTime - 1000));
  // 进度从 1 → 0（剩余比例）
  const progress = Math.max(0, Math.min(1, remainingMs / totalMs));

  // 简单地把 remaining 格式化
  const remainingSec = Math.ceil(remainingMs / 1000);

  return (
    <div className="fixed top-32 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <div
        className={`
          flex flex-col gap-1
          px-5 py-2.5 rounded-lg border backdrop-blur-md
          bg-gradient-to-r ${style.bg} ${style.border}
          shadow-lg min-w-[320px] max-w-[480px]
          animate-bounce-in
        `}
      >
        {/* 主行：icon + 标题 + 剩余时间 */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{spec.icon}</span>
            <div className="flex flex-col items-start">
              <span className={`text-sm font-game font-bold ${style.label}`}>
                实验性干预 · {spec.labelCN}
                {activeExperiment.magnitude !== 1 && (
                  <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${style.accent} text-black`}>
                    ×{activeExperiment.magnitude.toFixed(2)}
                  </span>
                )}
              </span>
              <span className={`text-[11px] ${style.text} opacity-80`}>
                影响：{SIDE_LABEL[activeExperiment.side]}
              </span>
            </div>
          </div>
          <span className={`text-xs font-bold font-game ${style.text} tabular-nums`}>
            {remainingSec}s
          </span>
        </div>

        {/* 实验目的 */}
        {activeExperiment.purpose && (
          <div className={`text-xs ${style.text} opacity-90 italic pl-9`}>
            "观察 {activeExperiment.purpose}"
          </div>
        )}

        {/* 进度条 */}
        <div className="h-1 mt-1 rounded-full bg-black/30 overflow-hidden">
          <div
            className={`h-full ${style.accent} transition-all duration-100 ease-linear`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
};