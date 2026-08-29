/**
 * 融合蚁大战 - 主应用组件
 */

import React, { useEffect, useRef } from 'react';
import { StatusBar } from './components/StatusBar';
import { GameCanvas } from './components/GameCanvas';
import { AssemblyPanel } from './components/AssemblyPanel';
import { UnlockNotifications } from './components/UnlockNotifications';
import { AITrashTalk } from './components/AITrashTalk';
import { SoundControl } from './components/SoundControl';
import { SettingsPanel, APIKeyHint } from './components/SettingsPanel';
import { soundManager } from './utils/SoundManager';

const App: React.FC = () => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // 初始化音效系统
  useEffect(() => {
    soundManager.init();
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

      {/* AI 垃圾话气泡 */}
      <AITrashTalk />

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
