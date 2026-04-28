/**
 * 敌方蚁后发言组件
 * 显示本地AI（红方蚁后）的冷峻评价，以对话气泡形式展示在画面右上方
 * 自动在8秒后淡出
 */

import React, { useEffect, useState, useRef } from 'react';
import { useGameStore } from '../store/gameStore';

const DISPLAY_DURATION = 8000;   // 显示持续时间 8秒
const FADE_DURATION = 1000;      // 淡出动画 1秒

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

  if (!visible || !currentMessage) return null;

  return (
    <div
      className={`
        fixed top-20 right-6 z-50
        max-w-xs
        transition-all duration-1000
        ${fadeOut ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'}
      `}
      style={{ pointerEvents: 'none' }}
    >
      {/* 蚁后消息气泡 */}
      <div className="flex items-start gap-2">
        {/* 消息气泡 */}
        <div className="relative">
          {/* 气泡主体 - 冷峻暗红 */}
          <div className="
            px-4 py-3 rounded-xl rounded-tr-sm
            bg-gradient-to-br from-gray-900/95 to-red-950/90
            border border-red-800/40
            backdrop-blur-sm
            shadow-lg shadow-red-950/30
          ">
            {/* 蚁后标签 */}
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-red-300/80 text-xs font-bold tracking-wide">
                👑 敌方蚁后
              </span>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400/60 animate-pulse" />
            </div>
            {/* 蚁后发言内容 */}
            <p className="text-gray-200 text-sm leading-relaxed font-game italic">
              "{currentMessage}"
            </p>
          </div>
          {/* 气泡尾巴 */}
          <div className="
            absolute -top-0 right-0
            w-3 h-3
            bg-gradient-to-br from-gray-900/95 to-red-950/90
            border-t border-r border-red-800/40
            transform rotate-45 translate-x-1 -translate-y-1
          " />
        </div>
      </div>
    </div>
  );
};
