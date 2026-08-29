/**
 * 敌方蚁后发言组件
 * 显示本地AI（红方蚁后）的冷峻评价，以对话气泡形式展示在画面底部居中
 * —— 不遮挡游戏画布，视觉更醒目。
 * 自动在 10 秒后淡出，可手动关闭。
 */

import React, { useEffect, useState, useRef } from 'react';
import { useGameStore } from '../store/gameStore';

const DISPLAY_DURATION = 10000;  // 显示持续时间 10秒（更醒目）
const FADE_DURATION = 800;      // 淡出动画 0.8秒

export const AITrashTalk: React.FC = () => {
  const { aiTrashTalk, aiTrashTalkTime } = useGameStore();
  const [visible, setVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [currentMessage, setCurrentMessage] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // 清理定时器
  const clearTimers = () => {
    timerRef.current.forEach(t => clearTimeout(t));
    timerRef.current = [];
  };

  useEffect(() => {
    if (!aiTrashTalk || aiTrashTalkTime === 0) return;

    // 清除之前的定时器
    clearTimers();

    // 显示新的消息
    setCurrentMessage(aiTrashTalk);
    setFadeOut(false);
    setVisible(true);

    // 设置淡出定时器
    const fadeTimer = setTimeout(() => {
      setFadeOut(true);
    }, DISPLAY_DURATION);
    timerRef.current.push(fadeTimer);

    // 设置隐藏定时器
    const hideTimer = setTimeout(() => {
      setVisible(false);
      setFadeOut(false);
    }, DISPLAY_DURATION + FADE_DURATION);
    timerRef.current.push(hideTimer);

    return () => {
      clearTimers();
    };
  }, [aiTrashTalk, aiTrashTalkTime]);

  /**
   * 手动立刻关闭（× 按钮）
   * - 立即清掉所有 timer
   * - 立即进入淡出
   */
  const handleDismiss = () => {
    clearTimers();
    setFadeOut(true);
    const t = setTimeout(() => {
      setVisible(false);
      setFadeOut(false);
    }, FADE_DURATION);
    timerRef.current.push(t);
  };

  if (!visible || !currentMessage) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`
        fixed bottom-32 right-6 z-40
        w-[400px] max-w-[calc(100vw-3rem)]
        transition-all duration-700 ease-out
        ${fadeOut
          ? 'opacity-0 translate-y-3 scale-95'
          : 'opacity-100 translate-y-0 scale-100'}
      `}
    >
      {/* 对话面板：纵向布局——头像在上，气泡在下 */}
      <div className="flex flex-col items-end gap-2">
        {/* 蚁后头像（上方锚定） */}
        <div
          className="
            shrink-0
            w-14 h-14 rounded-full
            bg-gradient-to-br from-red-700 via-red-800 to-red-950
            border-2 border-red-400/80
            shadow-lg shadow-red-500/50
            flex items-center justify-center
            text-3xl
            ring-2 ring-red-500/30 ring-offset-2 ring-offset-transparent
          "
          aria-hidden="true"
        >
          👑
        </div>

        {/* 气泡 */}
        <div className="relative w-full">
          {/* 气泡尾巴（指向上方头像，旋转使角朝上） */}
          <div
            className="
              absolute -top-1.5 right-6
              w-3 h-3
              bg-gradient-to-br from-gray-950 to-red-950
              border-t-2 border-l-2 border-red-500/60
              transform rotate-45
            "
            aria-hidden="true"
          />
          {/* 气泡主体 */}
          <div
            className="
              relative
              px-5 py-4
              rounded-2xl rounded-tr-sm
              bg-gradient-to-br from-gray-950/95 to-red-950/95
              border-2 border-red-500/60
              backdrop-blur-md
              shadow-2xl shadow-red-500/40
            "
          >
            {/* 头部：标签 + 关闭按钮 */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-red-300 text-sm font-bold tracking-wide font-game">
                  敌方蚁后
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider text-red-200 bg-red-900/60 border border-red-700/50">
                  红方战略
                </span>
                <span className="inline-block w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              </div>
              <button
                onClick={handleDismiss}
                className="
                  -mr-1 -mt-1 w-6 h-6 rounded
                  flex items-center justify-center
                  text-red-300/60 hover:text-red-100 hover:bg-red-900/40
                  transition-colors
                  text-sm leading-none
                "
                aria-label="关闭蚁后发言"
                title="关闭"
              >
                ×
              </button>
            </div>

            {/* 发言内容 */}
            <p className="
              text-gray-100 text-base leading-7 font-game italic
              pl-1 pr-2
            ">
              "{currentMessage}"
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
