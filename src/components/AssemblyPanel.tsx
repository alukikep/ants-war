/**
 * 蚂蚁拼装面板
 * 显示和配置蚂蚁的头/胸/腹组件
 */

import React from 'react';
import { useGameStore, calculateHatcheryCost } from '../store/gameStore';
import { 
  HEAD_CONFIGS, 
  THORAX_CONFIGS, 
  ABDOMEN_CONFIGS,
  calculateAntStats,
} from '../config/partStats';
import type { HeadVariant, ThoraxVariant, AbdomenVariant, PartConfig } from '../types';
import { BuildPanel } from './BuildPanel';

// 属性标签配置
const STAT_TAGS = [
  { key: 'damage', label: '攻', color: 'text-orange-400', bgColor: 'bg-orange-400/10 border-orange-400/30' },
  { key: 'hp', label: '生命', color: 'text-red-400', bgColor: 'bg-red-400/10 border-red-400/30' },
  { key: 'speed', label: '速', color: 'text-green-400', bgColor: 'bg-green-400/10 border-green-400/30' },
  { key: 'attackSpeed', label: '攻速', color: 'text-blue-400', bgColor: 'bg-blue-400/10 border-blue-400/30' },
] as const;

// 特殊能力标签映射
// key 格式: "type:variant" 或 "variant"（匹配任意部位）
const SPECIAL_TAGS: Record<string, { label: string; color: string }> = {
  'head:odontomachus': { label: '弹射逃脱', color: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400' },
  'head:termiteSoldier': { label: '攻速光环', color: 'bg-purple-500/20 border-purple-500/40 text-purple-400' },
  'abdomen:spitter': { label: '远程攻击', color: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400' },
  'abdomen:matabele': { label: '尾针技能', color: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' },
  'thorax:leafcutter': { label: '嘲讽+护甲', color: 'bg-amber-500/20 border-amber-500/40 text-amber-400' },
  'head:bigHead': { label: '秒杀', color: 'bg-red-500/20 border-red-500/40 text-red-400' },
  'abdomen:honeypot': { label: '死亡回复', color: 'bg-orange-500/20 border-orange-500/40 text-orange-400' },
};

/** 渲染属性标签条 */
const StatTags: React.FC<{ config: PartConfig }> = ({ config }) => {
  const stats = config.stats;
  const variant = config.variant as string;
  const partType = config.type as string;
  const specialTag = SPECIAL_TAGS[`${partType}:${variant}`];

  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {STAT_TAGS.map(({ key, label, color, bgColor }) => {
        const value = stats[key];
        if (value === 0) return null;
        
        // 木蚁腹的hp是-30，但实际是百分比惩罚
        const displayValue = variant === 'spitter' && key === 'hp' 
          ? '-30%' 
          : (key === 'attackSpeed' 
            ? `${value > 0 ? '+' : ''}${value}%` 
            : `${value > 0 ? '+' : ''}${value}`);
        
        return (
          <span 
            key={key} 
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-game border ${bgColor} ${color}`}
          >
            {label}{displayValue}
          </span>
        );
      })}
      {config.cost > 0 && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-game border bg-yellow-500/10 border-yellow-500/30 text-yellow-400">
          {config.cost}
        </span>
      )}
      {specialTag && (
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-game border ${specialTag.color}`}>
          {specialTag.label}
        </span>
      )}
    </div>
  );
};

export const AssemblyPanel: React.FC = () => {
  const { 
    playerTemplate, 
    setPlayerHead, 
    setPlayerThorax, 
    setPlayerAbdomen,
    playerFood,
    playerUnlockedParts,
  } = useGameStore();

  const currentStats = calculateAntStats(
    playerTemplate.head,
    playerTemplate.thorax,
    playerTemplate.abdomen
  );

  const hatcheryCost = calculateHatcheryCost(playerTemplate);

  // 只展示已解锁的部件
  const headOptions = (Object.entries(HEAD_CONFIGS) as [HeadVariant, typeof HEAD_CONFIGS.basic][])
    .filter(([key]) => playerUnlockedParts.heads.includes(key));
  const thoraxOptions = (Object.entries(THORAX_CONFIGS) as [ThoraxVariant, typeof THORAX_CONFIGS.basic][])
    .filter(([key]) => playerUnlockedParts.thoraxes.includes(key));
  const abdomenOptions = (Object.entries(ABDOMEN_CONFIGS) as [AbdomenVariant, typeof ABDOMEN_CONFIGS.basic][])
    .filter(([key]) => playerUnlockedParts.abdomens.includes(key));

  const selectedHead = HEAD_CONFIGS[playerTemplate.head];
  const selectedThorax = THORAX_CONFIGS[playerTemplate.thorax];
  const selectedAbdomen = ABDOMEN_CONFIGS[playerTemplate.abdomen];

  return (
    <div className="w-full bg-bio-dark/90 backdrop-blur-sm border-t border-bio-primary/30 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-bio-primary font-game font-bold text-lg">
            蚂蚁拼装车间
          </h3>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">
              孵化室成本: 
              <span className={`ml-2 font-game ${playerFood >= hatcheryCost ? 'text-yellow-400' : 'text-red-400'}`}>
                {hatcheryCost}
              </span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-3">
          {/* 头部选择 */}
          <div className="space-y-1">
            <label className="block text-xs text-gray-500 font-game">
              头部
            </label>
            <select
              value={playerTemplate.head}
              onChange={(e) => setPlayerHead(e.target.value as HeadVariant)}
              className="w-full bg-gray-800 border border-bio-primary/30 rounded-lg px-3 py-2 
                         text-white font-game text-sm focus:outline-none focus:border-bio-primary"
            >
              {headOptions.map(([key, config]) => (
                <option key={key} value={key}>
                  {config.nameCN} ({config.cost > 0 ? `${config.cost}` : '免费'})
                </option>
              ))}
            </select>
            <StatTags config={selectedHead} />
            <p className="text-xs text-gray-500 leading-relaxed mt-1">
              {selectedHead.description}
            </p>
          </div>

          {/* 胸部选择 */}
          <div className="space-y-1">
            <label className="block text-xs text-gray-500 font-game">
              胸部
            </label>
            <select
              value={playerTemplate.thorax}
              onChange={(e) => setPlayerThorax(e.target.value as ThoraxVariant)}
              className="w-full bg-gray-800 border border-bio-primary/30 rounded-lg px-3 py-2 
                         text-white font-game text-sm focus:outline-none focus:border-bio-primary"
            >
              {thoraxOptions.map(([key, config]) => (
                <option key={key} value={key}>
                  {config.nameCN} ({config.cost > 0 ? `${config.cost}` : '免费'})
                </option>
              ))}
            </select>
            <StatTags config={selectedThorax} />
            <p className="text-xs text-gray-500 leading-relaxed mt-1">
              {selectedThorax.description}
            </p>
          </div>

          {/* 腹部选择 */}
          <div className="space-y-1">
            <label className="block text-xs text-gray-500 font-game">
              腹部
            </label>
            <select
              value={playerTemplate.abdomen}
              onChange={(e) => setPlayerAbdomen(e.target.value as AbdomenVariant)}
              className="w-full bg-gray-800 border border-bio-primary/30 rounded-lg px-3 py-2 
                         text-white font-game text-sm focus:outline-none focus:border-bio-primary"
            >
              {abdomenOptions.map(([key, config]) => (
                <option key={key} value={key}>
                  {config.nameCN} ({config.cost > 0 ? `${config.cost}` : '免费'})
                </option>
              ))}
            </select>
            <StatTags config={selectedAbdomen} />
            <p className="text-xs text-gray-500 leading-relaxed mt-1">
              {selectedAbdomen.description}
            </p>
          </div>

          {/* 当前属性预览 */}
          <div className="bg-gray-800/50 rounded-lg p-3 border border-bio-primary/20">
            <h4 className="text-bio-secondary font-game text-xs mb-2">总属性</h4>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">生命</span>
                <span className="text-red-400 font-game font-bold">{currentStats.hp}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">攻击</span>
                <span className="text-orange-400 font-game font-bold">{currentStats.damage}</span>
              </div>
              {currentStats.isRanged && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">远程</span>
                  <span className="text-cyan-400 font-game font-bold">{currentStats.rangedDamage}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-gray-400">速度</span>
                <span className="text-green-400 font-game font-bold">{currentStats.speed}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">攻速</span>
                <span className="text-blue-400 font-game font-bold">{currentStats.attackSpeed}ms</span>
              </div>
            </div>
            {/* 蚂蚁预览 */}
            <div className="mt-2 pt-2 border-t border-gray-700 flex items-center justify-center gap-1">
              <div className="w-5 h-3 rounded-full bg-player-blue" />
              <div className="w-4 h-3 rounded-full bg-blue-700" />
              <div className="w-6 h-4 rounded-full bg-player-blue" />
            </div>
          </div>

          {/* 建造面板 */}
          <BuildPanel />
        </div>
      </div>
    </div>
  );
};
