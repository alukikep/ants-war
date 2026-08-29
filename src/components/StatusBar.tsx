/**
 * 顶部状态栏
 * 显示双方资源和蚁后血量
 */

import React, { useMemo } from 'react';
import { useGameStore } from '../store/gameStore';

export const StatusBar: React.FC = () => {
  const {
    playerFood,
    enemyFood,
    playerQueen,
    enemyQueen,
    stats,
    status,
    ants,
    config,
  } = useGameStore();

  // 检测拔河优势
  const { playerHasAdvantage, enemyHasAdvantage } = useMemo(() => {
    const midLineX = config.mapWidth / 2;
    const aliveAnts = ants.filter(a => a.state !== 'dead');
    return {
      playerHasAdvantage: aliveAnts.some(a => a.side === 'player' && a.position.x > midLineX),
      enemyHasAdvantage: aliveAnts.some(a => a.side === 'enemy' && a.position.x < midLineX),
    };
  }, [ants, config.mapWidth]);

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const playerHpPercent = (playerQueen.hp / playerQueen.maxHp) * 100;
  const enemyHpPercent = (enemyQueen.hp / enemyQueen.maxHp) * 100;

  return (
    <div className="w-full bg-bio-dark/90 backdrop-blur-sm border-b border-bio-primary/30 p-4">
      <div className="max-w-6xl mx-auto">
        {/* 主状态栏 */}
        <div className="flex items-center justify-between">
          {/* 玩家状态 */}
          <div className="flex-1">
            <div className="flex items-center gap-4">
              <div className="text-player-blue font-game font-bold text-lg">
                玩家
              </div>
              <div className="flex-1 max-w-xs">
                <div className="flex justify-between text-sm text-gray-400 mb-1">
                  <span>蚁后血量</span>
                  <span>{playerQueen.hp} / {playerQueen.maxHp}</span>
                </div>
                <div className="h-4 bg-gray-800 rounded-full overflow-hidden border border-player-blue/30">
                  <div
                    className="h-full bg-gradient-to-r from-player-blue to-blue-400 transition-all duration-300"
                    style={{ width: `${playerHpPercent}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 text-yellow-400">
                <span className="text-xl">🍯</span>
                <span className="font-game">{playerFood}</span>
                {playerHasAdvantage && (
                  <span className="text-xs text-green-400 font-game animate-pulse" title="拔河优势：有单位越过中线，每次食物+5">
                    +{config.tugOfWarFoodBonus}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 中间信息 */}
          <div className="px-8 text-center">
            <div className="text-bio-primary font-game text-2xl font-bold">
              {status === 'idle' && '准备就绪'}
              {status === 'playing' && formatTime(stats.gameTime)}
              {status === 'paused' && '已暂停'}
              {status === 'victory' && '胜利!'}
              {status === 'defeat' && '失败'}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              融合蚁大战
            </div>
          </div>

          {/* 敌方状态 */}
          <div className="flex-1">
            <div className="flex items-center justify-end gap-4">
              <div className="flex items-center gap-2 text-yellow-400">
                {enemyHasAdvantage && (
                  <span className="text-xs text-green-400 font-game animate-pulse" title="拔河优势：有单位越过中线，每次食物+5">
                    +{config.tugOfWarFoodBonus}
                  </span>
                )}
                <span className="font-game">{enemyFood}</span>
                <span className="text-xl">🍯</span>
              </div>
              <div className="flex-1 max-w-xs">
                <div className="flex justify-between text-sm text-gray-400 mb-1">
                  <span>蚁后血量</span>
                  <span>{enemyQueen.hp} / {enemyQueen.maxHp}</span>
                </div>
                <div className="h-4 bg-gray-800 rounded-full overflow-hidden border border-enemy-red/30">
                  <div
                    className="h-full bg-gradient-to-r from-red-400 to-enemy-red transition-all duration-300"
                    style={{ width: `${enemyHpPercent}%` }}
                  />
                </div>
              </div>
              <div className="text-enemy-red font-game font-bold text-lg">
                AI
              </div>
            </div>
          </div>
        </div>

        {/* 统计信息 */}
        <div className="flex justify-center gap-6 mt-3 text-xs text-gray-500">
          <span>玩家孵化室: {stats.playerHatcheriesBuilt}</span>
          <span>蚂蚁: {stats.playerAntsSpawned} (损失: {stats.playerAntsKilled})</span>
          <span className="text-bio-primary">|</span>
          <span>敌方孵化室: {stats.enemyHatcheriesBuilt}</span>
          <span>蚂蚁: {stats.enemyAntsSpawned} (损失: {stats.enemyAntsKilled})</span>
        </div>
      </div>
    </div>
  );
};
