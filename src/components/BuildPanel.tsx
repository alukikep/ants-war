/**
 * 建造面板组件
 * 提供"建造 / 升级 / 拆除"模式切换与建造成本预览。
 * 实际点击建造现在由 PixiRenderer 中的战场基地格子处理（共享 store.buildMode）。
 */

import React from 'react';
import { useGameStore, calculateHatcheryCost } from '../store/gameStore';
import { calculateAntStats, HEAD_CONFIGS, THORAX_CONFIGS, ABDOMEN_CONFIGS } from '../config/partStats';

type BuildMode = 'build' | 'upgrade' | 'demolish';

export const BuildPanel: React.FC = () => {
  const {
    playerFood,
    playerTemplate,
    hatcheries,
    status,
    config,
    buildMode,
    setBuildMode,
  } = useGameStore();

  const cost = calculateHatcheryCost(playerTemplate);
  const stats = calculateAntStats(playerTemplate.head, playerTemplate.thorax, playerTemplate.abdomen);
  const canAfford = playerFood >= cost;

  const playerHatcheries = hatcheries.filter(h => h.side === 'player');

  const handleModeChange = (next: BuildMode) => {
    if (status !== 'playing') return;
    setBuildMode(next);
  };

  return (
    <div className="bg-gray-800/50 rounded-lg p-4 border border-player-blue/30">
      {/* 模式切换按钮 */}
      <div className="flex gap-1 mb-3">
        <button
          onClick={() => handleModeChange('build')}
          className={`flex-1 px-2 py-1 text-xs font-game rounded transition-all ${buildMode === 'build'
            ? 'bg-bio-primary text-bio-dark'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
        >
          🏗️ 建造
        </button>
        <button
          onClick={() => handleModeChange('upgrade')}
          className={`flex-1 px-2 py-1 text-xs font-game rounded transition-all ${buildMode === 'upgrade'
            ? 'bg-green-500 text-white'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
        >
          ⬆️ 升级
        </button>
        <button
          onClick={() => handleModeChange('demolish')}
          className={`flex-1 px-2 py-1 text-xs font-game rounded transition-all ${buildMode === 'demolish'
            ? 'bg-red-500 text-white'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
        >
          🗑️ 拆除
        </button>
      </div>

      {/* 模式说明 */}
      <div className="text-xs text-gray-400 mb-2">
        {buildMode === 'build' && '点击战场左侧基地空格建造孵化室'}
        {buildMode === 'upgrade' && '点击战场孵化室升级 (+30%属性)'}
        {buildMode === 'demolish' && '点击战场孵化室拆除 (返还50%资源)'}
      </div>

      {/* 建造成本信息卡 */}
      <div className="border-t border-gray-700 pt-3">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-gray-400">当前配置</span>
          <span className="text-xs text-player-blue font-game">
            {HEAD_CONFIGS[playerTemplate.head].nameCN}/{THORAX_CONFIGS[playerTemplate.thorax].nameCN}/{ABDOMEN_CONFIGS[playerTemplate.abdomen].nameCN}
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
      </div>

      {/* 已建造数量 */}
      <div className="mt-2 text-xs text-gray-500 text-center">
        已建造: {playerHatcheries.length} / {config.gridCols * config.gridRows}
      </div>
    </div>
  );
};
