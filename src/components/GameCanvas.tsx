/**
 * 游戏画布组件
 * 包装 PixiJS 渲染
 */

import React from 'react';
import { usePixiApp } from '../hooks/usePixiApp';
import { useGameStore } from '../store/gameStore';
import { DIFFICULTY_CONFIG, type Difficulty } from '../config/gameConfig';

/** 速度切换按钮 */
const SpeedButton: React.FC = () => {
  const gameSpeed = useGameStore((state) => state.gameSpeed);
  const toggleSpeed = useGameStore((state) => state.toggleSpeed);

  const getSpeedClass = () => {
    if (gameSpeed === 3) {
      return 'bg-red-500/30 text-red-300 border-red-500/50 hover:bg-red-500/40';
    }
    if (gameSpeed === 2) {
      return 'bg-yellow-500/30 text-yellow-300 border-yellow-500/50 hover:bg-yellow-500/40';
    }
    return 'bg-black/50 text-white border-bio-primary/30 hover:bg-black/70';
  };

  return (
    <button
      onClick={toggleSpeed}
      className={`px-4 py-2 font-game font-bold rounded transition-all duration-300 border ${getSpeedClass()}`}
    >
      {gameSpeed === 1 ? '1x' : gameSpeed === 2 ? '2x' : '3x'}
    </button>
  );
};

/** 难度选择按钮 */
const DifficultySelector: React.FC = () => {
  const currentDifficulty = useGameStore((state) => state.difficulty);
  const setDifficulty = useGameStore((state) => state.setDifficulty);
  const status = useGameStore((state) => state.status);

  // 游戏进行中不显示难度选择
  if (status !== 'idle') return null;

  const difficulties: Difficulty[] = ['normal', 'hard', 'extreme'];

  const getDifficultyClass = (diff: Difficulty) => {
    if (currentDifficulty === diff) {
      switch (diff) {
        case 'normal':
          return 'bg-bio-primary/30 text-bio-primary border-bio-primary/50';
        case 'hard':
          return 'bg-yellow-500/30 text-yellow-300 border-yellow-500/50';
        case 'extreme':
          return 'bg-red-500/30 text-red-300 border-red-500/50';
      }
    }
    return 'bg-black/50 text-gray-400 border-gray-600/30 hover:bg-black/70';
  };

  return (
    <div className="flex flex-col items-center gap-2 mb-4">
      <div className="text-sm text-gray-400 font-game">选择难度</div>
      <div className="flex gap-2">
        {difficulties.map((diff) => (
          <button
            key={diff}
            onClick={() => setDifficulty(diff)}
            className={`px-3 py-1.5 text-sm font-game rounded transition-all duration-300 border ${getDifficultyClass(diff)}`}
          >
            {DIFFICULTY_CONFIG[diff].label}
          </button>
        ))}
      </div>
      <div className="text-xs text-gray-500">
        {DIFFICULTY_CONFIG[currentDifficulty].description}
      </div>
    </div>
  );
};

interface GameCanvasProps {
  onStart?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onReset?: () => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  onStart,
  onPause,
  onResume,
  onReset,
}) => {
  const { containerRef, startGame, pauseGame, resumeGame, resetGame } = usePixiApp();
  const status = useGameStore((state) => state.status);

  const handleStart = () => {
    startGame();
    onStart?.();
  };

  const handlePause = () => {
    pauseGame();
    onPause?.();
  };

  const handleResume = () => {
    resumeGame();
    onResume?.();
  };

  const handleReset = () => {
    resetGame();
    onReset?.();
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black overflow-auto">
      {/* PixiJS 画布容器 - 固定游戏尺寸，允许滚动 */}
      <div
        ref={containerRef}
        className="rounded-lg overflow-auto border-2 border-bio-primary/30 shadow-neon-green"
        style={{ width: 1800, height: 600 }}
      />

      {/* 游戏控制覆盖层 */}
      {status === 'idle' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm rounded-lg">
          <DifficultySelector />
          <button
            onClick={handleStart}
            className="px-8 py-4 bg-bio-primary text-bio-dark font-game font-bold text-xl rounded-lg 
                       hover:bg-bio-secondary transition-all duration-300 
                       shadow-neon-green hover:scale-105"
          >
            开始游戏
          </button>
        </div>
      )}

      {status === 'paused' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-lg">
          <div className="flex gap-4">
            <button
              onClick={handleResume}
              className="px-6 py-3 bg-bio-primary text-bio-dark font-game font-bold rounded-lg 
                         hover:bg-bio-secondary transition-all duration-300"
            >
              继续
            </button>
            <button
              onClick={handleReset}
              className="px-6 py-3 bg-gray-600 text-white font-game font-bold rounded-lg 
                         hover:bg-gray-500 transition-all duration-300"
            >
              重新开始
            </button>
          </div>
        </div>
      )}

      {status === 'victory' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm rounded-lg">
          <h2 className="text-4xl font-game font-bold text-bio-primary mb-4 animate-pulse">
            胜利！
          </h2>
          <p className="text-bio-secondary mb-6">敌方蚁后已被击败</p>
          <button
            onClick={handleReset}
            className="px-8 py-4 bg-bio-primary text-bio-dark font-game font-bold text-xl rounded-lg 
                       hover:bg-bio-secondary transition-all duration-300"
          >
            再来一局
          </button>
        </div>
      )}

      {status === 'defeat' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm rounded-lg">
          <h2 className="text-4xl font-game font-bold text-enemy-red mb-4 animate-pulse">
            失败...
          </h2>
          <p className="text-gray-400 mb-6">你的蚁后已被击败</p>
          <button
            onClick={handleReset}
            className="px-8 py-4 bg-enemy-red text-white font-game font-bold text-xl rounded-lg 
                       hover:bg-red-600 transition-all duration-300"
          >
            重新挑战
          </button>
        </div>
      )}

      {/* 游戏控制按钮 (游戏进行中显示) */}
      {status === 'playing' && (
        <div className="absolute top-4 right-4 flex gap-2">
          <SpeedButton />
          <button
            onClick={handlePause}
            className="px-4 py-2 bg-black/50 text-white font-game rounded 
                       hover:bg-black/70 transition-all duration-300 border border-bio-primary/30"
          >
            暂停
          </button>
        </div>
      )}
    </div>
  );
};
