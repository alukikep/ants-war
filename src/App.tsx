/**
 * 蚁巢争霸 - 主应用组件
 */

import React from 'react';
import { StatusBar } from './components/StatusBar';
import { GameCanvas } from './components/GameCanvas';
import { AssemblyPanel } from './components/AssemblyPanel';
import { UnlockNotifications } from './components/UnlockNotifications';
import { AITrashTalk } from './components/AITrashTalk';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-bio-dark flex flex-col">
      {/* 顶部状态栏 */}
      <StatusBar />

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
