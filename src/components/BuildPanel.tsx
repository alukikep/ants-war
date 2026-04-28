/**
 * 建造面板组件
 * 显示建造格子，允许玩家建造、升级、拆除孵化室
 */

import React, { useState } from 'react';
import { useGameStore, calculateHatcheryCost } from '../store/gameStore';
import { GAME_CONFIG } from '../config/gameConfig';
import { calculateAntStats } from '../config/partStats';
import type { GridPosition, Hatchery } from '../types';

type BuildMode = 'build' | 'upgrade' | 'demolish';

export const BuildPanel: React.FC = () => {
  const {
    playerFood,
    playerTemplate,
    hatcheries,
    status,
    buildHatchery,
    canBuildAt,
    upgradeHatchery,
    demolishHatchery,
    getHatcheryAt,
    canUpgradeHatchery,
    getUpgradeCost,
    config,
  } = useGameStore();

  const [mode, setMode] = useState<BuildMode>('build');
  const [selectedHatchery, setSelectedHatchery] = useState<Hatchery | null>(null);

  const cost = calculateHatcheryCost(playerTemplate);
  const stats = calculateAntStats(playerTemplate.head, playerTemplate.thorax, playerTemplate.abdomen);
  const canAfford = playerFood >= cost;

  const playerHatcheries = hatcheries.filter(h => h.side === 'player');

  const handleGridClick = (col: number, row: number) => {
    if (status !== 'playing') return;
    
    const gridPos = { col, row };
    const existingHatchery = getHatcheryAt('player', gridPos);

    switch (mode) {
      case 'build':
        if (existingHatchery) {
          // 如果已有建筑，选中它显示信息
          setSelectedHatchery(existingHatchery);
          return;
        }
        if (!canAfford) return;
        buildHatchery('player', gridPos, playerTemplate);
        break;
        
      case 'upgrade':
        if (!existingHatchery) return;
        if (canUpgradeHatchery(existingHatchery.id)) {
          upgradeHatchery(existingHatchery.id);
          // 刷新选中状态
          const updated = useGameStore.getState().getHatcheryAt('player', gridPos);
          setSelectedHatchery(updated || null);
        }
        break;
        
      case 'demolish':
        if (!existingHatchery) return;
        const refund = demolishHatchery(existingHatchery.id);
        setSelectedHatchery(null);
        break;
    }
  };

  const getGridStatus = (col: number, row: number) => {
    const hatchery = playerHatcheries.find(h => 
      h.gridPos.col === col && h.gridPos.row === row
    );
    return {
      hasBuilding: !!hatchery,
      hatchery,
      isSelected: selectedHatchery?.gridPos.col === col && selectedHatchery?.gridPos.row === row,
    };
  };

  const getLevelStars = (level: number) => {
    return '★'.repeat(level) + '☆'.repeat(config.maxHatcheryLevel - level);
  };

  const getGridClassName = (col: number, row: number) => {
    const { hasBuilding, hatchery, isSelected } = getGridStatus(col, row);
    
    const baseClasses = 'w-10 h-10 rounded border-2 transition-all duration-200 relative flex items-center justify-center';
    
    if (hasBuilding && hatchery) {
      // 根据等级显示不同颜色
      const levelColors = [
        'bg-player-blue/30 border-player-blue',      // 1级
        'bg-yellow-500/30 border-yellow-500',        // 2级
        'bg-purple-500/30 border-purple-500',        // 3级
      ];
      const colorClass = levelColors[hatchery.level - 1] || levelColors[0];
      
      if (mode === 'upgrade' && hatchery.level < config.maxHatcheryLevel) {
        return `${baseClasses} ${colorClass} cursor-pointer hover:border-green-400 hover:bg-green-400/20`;
      } else if (mode === 'demolish') {
        return `${baseClasses} ${colorClass} cursor-pointer hover:border-red-500 hover:bg-red-500/20`;
      } else if (isSelected) {
        return `${baseClasses} ${colorClass} ring-2 ring-white`;
      }
      return `${baseClasses} ${colorClass} cursor-pointer`;
    }
    
    // 空格子
    if (mode === 'build' && canAfford && status === 'playing') {
      return `${baseClasses} bg-gray-700/50 border-gray-600 hover:border-bio-primary hover:bg-bio-primary/10 cursor-pointer`;
    }
    return `${baseClasses} bg-gray-800/50 border-gray-700 cursor-not-allowed opacity-50`;
  };

  return (
    <div className="bg-gray-800/50 rounded-lg p-4 border border-player-blue/30">
      {/* 模式切换按钮 */}
      <div className="flex gap-1 mb-3">
        <button
          onClick={() => { setMode('build'); setSelectedHatchery(null); }}
          className={`flex-1 px-2 py-1 text-xs font-game rounded transition-all ${
            mode === 'build' 
              ? 'bg-bio-primary text-bio-dark' 
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          🏗️ 建造
        </button>
        <button
          onClick={() => { setMode('upgrade'); setSelectedHatchery(null); }}
          className={`flex-1 px-2 py-1 text-xs font-game rounded transition-all ${
            mode === 'upgrade' 
              ? 'bg-green-500 text-white' 
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          ⬆️ 升级
        </button>
        <button
          onClick={() => { setMode('demolish'); setSelectedHatchery(null); }}
          className={`flex-1 px-2 py-1 text-xs font-game rounded transition-all ${
            mode === 'demolish' 
              ? 'bg-red-500 text-white' 
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          🗑️ 拆除
        </button>
      </div>

      {/* 模式说明 */}
      <div className="text-xs text-gray-400 mb-2">
        {mode === 'build' && '点击空格建造孵化室'}
        {mode === 'upgrade' && '点击孵化室升级 (+50%属性)'}
        {mode === 'demolish' && '点击孵化室拆除 (返还50%资源)'}
      </div>

      {/* 建造格子 */}
      <div className="mb-3">
        <div 
          className="grid gap-1"
          style={{ 
            gridTemplateColumns: `repeat(${GAME_CONFIG.gridCols}, 1fr)`,
          }}
        >
          {Array.from({ length: GAME_CONFIG.gridRows }).map((_, row) => (
            Array.from({ length: GAME_CONFIG.gridCols }).map((_, col) => {
              const { hasBuilding, hatchery } = getGridStatus(col, row);
              
              return (
                <button
                  key={`${col}-${row}`}
                  onClick={() => handleGridClick(col, row)}
                  disabled={status !== 'playing'}
                  className={getGridClassName(col, row)}
                  title={hatchery 
                    ? `Lv.${hatchery.level} ${hatchery.template.head}/${hatchery.template.thorax}/${hatchery.template.abdomen}`
                    : '空格'
                  }
                >
                  {hasBuilding && hatchery && (
                    <div className="flex flex-col items-center">
                      <span className="text-xs leading-none">{hatchery.level}</span>
                      <span className="text-[10px] leading-none">🐜</span>
                    </div>
                  )}
                  {!hasBuilding && mode === 'build' && canAfford && status === 'playing' && (
                    <span className="text-gray-500 text-lg">+</span>
                  )}
                </button>
              );
            })
          ))}
        </div>
      </div>

      {/* 选中孵化室信息 或 建造成本 */}
      <div className="border-t border-gray-700 pt-3">
        {selectedHatchery && mode !== 'build' ? (
          // 显示选中孵化室信息
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-400">选中孵化室</span>
              <span className="text-xs text-yellow-400">{getLevelStars(selectedHatchery.level)}</span>
            </div>
            <div className="text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">等级</span>
                <span className="text-white">{selectedHatchery.level} / {config.maxHatcheryLevel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">已投资</span>
                <span className="text-yellow-400">🍯 {selectedHatchery.totalInvested}</span>
              </div>
              {mode === 'upgrade' && selectedHatchery.level < config.maxHatcheryLevel && (
                <div className="flex justify-between mt-1 pt-1 border-t border-gray-600">
                  <span className="text-green-400">升级费用</span>
                  <span className="text-yellow-400">🍯 {selectedHatchery.cost}</span>
                </div>
              )}
              {mode === 'demolish' && (
                <div className="flex justify-between mt-1 pt-1 border-t border-gray-600">
                  <span className="text-red-400">拆除返还</span>
                  <span className="text-yellow-400">🍯 {Math.floor(selectedHatchery.totalInvested * config.demolishRefundRate)}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          // 显示建造成本
          <>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-gray-400">当前配置</span>
              <span className="text-xs text-player-blue font-game">
                {playerTemplate.head}/{playerTemplate.thorax}/{playerTemplate.abdomen}
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-1 text-xs mb-2">
              <div className="flex justify-between">
                <span className="text-gray-500">攻击</span>
                <span className="text-orange-400">{stats.damage}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">生命</span>
                <span className="text-red-400">{stats.hp}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">速度</span>
                <span className="text-green-400">{stats.speed}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">攻速</span>
                <span className="text-blue-400">{stats.attackSpeed}ms</span>
              </div>
            </div>

            <div className={`
              flex justify-between items-center p-2 rounded text-sm
              ${canAfford ? 'bg-bio-primary/10' : 'bg-red-500/10'}
            `}>
              <span className="text-gray-300">建造成本</span>
              <span className={`font-game ${canAfford ? 'text-yellow-400' : 'text-red-400'}`}>
                🍯 {cost}
              </span>
            </div>
          </>
        )}
      </div>

      {/* 已建造数量 */}
      <div className="mt-2 text-xs text-gray-500 text-center">
        已建造: {playerHatcheries.length} / {GAME_CONFIG.gridCols * GAME_CONFIG.gridRows}
      </div>
    </div>
  );
};
