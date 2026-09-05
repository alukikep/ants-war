/**
 * 融合蚁大战 - 主应用组件
 */

import React, { useEffect, useRef } from 'react';
import { StatusBar } from './components/StatusBar';
import { GameCanvas } from './components/GameCanvas';
import { AssemblyPanel } from './components/AssemblyPanel';
import { UnlockNotifications } from './components/UnlockNotifications';
import { AITrashTalk } from './components/AITrashTalk';
import { ScientificCommentary } from './components/ScientificCommentary';
import { ExperimentBanner } from './components/ExperimentBanner';
import { SoundControl } from './components/SoundControl';
import { SettingsPanel, APIKeyHint } from './components/SettingsPanel';
import { soundManager } from './utils/SoundManager';
import { useGameStore } from './store/gameStore';

/**
 * 背景音乐状态联动组件（不渲染任何 UI）。
 *
 * 监听 gameStore.status 的变化：
 *   - 'playing' → 播放/恢复背景音乐
 *   - 'paused'  → 暂停背景音乐（断点保留，恢复游戏可继续播放）
 *   - 其他状态（idle / victory / defeat） → 停止音乐
 *
 * 为什么不放在 usePixiApp 里：usePixiApp 生命周期较长且依赖 PixiApplication；
 * 独立组件可避免与游戏画布渲染耦合，也方便后续替换状态机。
 */
const MusicController: React.FC = () => {
  const status = useGameStore((state) => state.status);

  useEffect(() => {
    if (status === 'playing') {
      soundManager.playMusic();
    } else if (status === 'paused') {
      soundManager.pauseMusic();
    } else {
      // idle / victory / defeat：彻底停止
      soundManager.stopMusic();
    }
  }, [status]);

  return null;
};

const App: React.FC = () => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 初始化音效系统（SFX + BGM）
  useEffect(() => {
    soundManager.init();
    soundManager.initMusic();
    return () => {
      soundManager.destroy();
    };
  }, []);

  // 处理鼠标滚轮滚动
  const handleWheel = (e: WheelEvent) => {
    if (scrollContainerRef.current) {
      e.preventDefault();
      const container = scrollContainerRef.current;
      const scrollAmount = e.deltaY || e.detail * 100;
      container.scrollTop += scrollAmount;
    }
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => {
        container.removeEventListener('wheel', handleWheel);
      };
    }
  }, []);

  return (
    <div
      ref={scrollContainerRef}
      className="h-screen bg-bio-dark flex flex-col relative overflow-y-auto"
      style={{ scrollBehavior: 'smooth' }}
    >
      {/* 背景音乐状态联动（无渲染输出） */}
      <MusicController />

      {/* 音效控制 - 绝对定位在左上角 */}
      <div className="absolute top-16 left-4 z-50 flex items-center gap-2">
        <SoundControl />
        <SettingsPanel />
      </div>

      {/* 顶部状态栏 */}
      <StatusBar />

      {/* AI 战略顾问提示横幅（未配置时醒目 CTA，已配置时绿色徽章）*/}
      <APIKeyHint />

      {/* 解锁通知浮层 */}
      <UnlockNotifications />

      {/* AI 垃圾话气泡（右下角：敌方蚁后） */}
      <AITrashTalk />

      {/* 科学家观察员评语（左下角：客观实验记录） */}
      <ScientificCommentary />

      {/* 科学家实验性干预横幅（顶部居中） */}
      <ExperimentBanner />

      {/* 游戏主区域 */}
      <main className="flex-1 flex items-center justify-center p-6">
        <GameCanvas />
      </main>

      {/* 底部拼装面板 */}
      <AssemblyPanel />
    </div>
  );
};

export default App;
