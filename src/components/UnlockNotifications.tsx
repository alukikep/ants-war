/**
 * 部件解锁通知组件
 * 显示最近解锁的部件浮动通知
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import type { UnlockNotification } from '../types';

interface DisplayNotification extends UnlockNotification {
  visible: boolean;
  fadeOut: boolean;
}

const PART_TYPE_LABELS: Record<string, string> = {
  head: '头部',
  thorax: '胸部',
  abdomen: '腹部',
};

export const UnlockNotifications: React.FC = () => {
  const { unlockNotifications, clearUnlockNotifications } = useGameStore();
  const [displayQueue, setDisplayQueue] = useState<DisplayNotification[]>([]);
  // 追踪已经展示过的通知 id，防止 React 18 StrictMode 双调用或在 unlockPart/clearUnlockNotifications
  // 之间的微妙时序窗口中把同一条通知重复加入 displayQueue 导致 duplicate key 警告。
  const displayedIdsRef = useRef<Set<string>>(new Set());

  // 处理新通知
  useEffect(() => {
    if (unlockNotifications.length === 0) return;

    // 只展示玩家的解锁通知，并跳过已经展示过的（避免重复 key）
    const playerNotifications = unlockNotifications.filter(
      n => n.side === 'player' && !displayedIdsRef.current.has(n.id),
    );

    if (playerNotifications.length > 0) {
      const newDisplay: DisplayNotification[] = playerNotifications.map(n => ({
        ...n,
        visible: true,
        fadeOut: false,
      }));

      // 先登记再入队，保证即使 effect 在同帧重入也不会重复
      newDisplay.forEach(n => displayedIdsRef.current.add(n.id));

      setDisplayQueue(prev => [...prev, ...newDisplay]);
    }

    // 消费完通知后清除
    clearUnlockNotifications();
  }, [unlockNotifications, clearUnlockNotifications]);

  // 自动移除通知
  const removeNotification = useCallback((id: string) => {
    displayedIdsRef.current.delete(id);
    setDisplayQueue(prev => prev.filter(n => n.id !== id));
  }, []);

  useEffect(() => {
    if (displayQueue.length === 0) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    
    for (const notification of displayQueue) {
      if (!notification.fadeOut) {
        // 3秒后开始淡出
        const fadeTimer = setTimeout(() => {
          setDisplayQueue(prev =>
            prev.map(n => n.id === notification.id ? { ...n, fadeOut: true } : n)
          );
        }, 3000);
        timers.push(fadeTimer);

        // 3.5秒后移除
        const removeTimer = setTimeout(() => {
          removeNotification(notification.id);
        }, 3500);
        timers.push(removeTimer);
      }
    }

    return () => {
      timers.forEach(t => clearTimeout(t));
    };
  }, [displayQueue, removeNotification]);

  if (displayQueue.length === 0) return null;

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
      {displayQueue.map(notification => (
        <div
          key={`${notification.id}-${notification.gameTime}`}
          className={`
            px-6 py-3 rounded-lg border backdrop-blur-sm
            bg-gradient-to-r from-yellow-900/80 to-amber-900/80
            border-yellow-500/50
            text-center
            transition-all duration-500
            ${notification.fadeOut ? 'opacity-0 translate-y-[-20px]' : 'opacity-100 translate-y-0'}
            animate-bounce-in
          `}
        >
          <div className="text-yellow-400 font-game text-sm font-bold">
            🔓 解锁新部件
          </div>
          <div className="text-white font-game text-base mt-1">
            <span className="text-yellow-300">{notification.nameCN}</span>
            <span className="text-gray-400 text-xs ml-2">
              ({PART_TYPE_LABELS[notification.partType]})
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};
