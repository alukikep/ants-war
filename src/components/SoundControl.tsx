/**
 * 音效控制组件
 * 提供音效开关和音量控制
 */

import React from 'react';
import { soundManager } from '../utils/SoundManager';

// 音效设置接口
interface SoundSettings {
    enabled: boolean;
    masterVolume: number;
}

export const SoundControl: React.FC = () => {
    const [enabled, setEnabled] = React.useState(soundManager.isEnabled());
    const [volume, setVolume] = React.useState(1);

    const handleToggle = () => {
        const newEnabled = !enabled;
        soundManager.setEnabled(newEnabled);
        setEnabled(newEnabled);
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVolume = parseFloat(e.target.value);
        soundManager.setMasterVolume(newVolume);
        setVolume(newVolume);
    };

    return (
        <div className="flex items-center gap-2">
            <button
                onClick={handleToggle}
                className={`px-3 py-1 rounded text-sm font-game border transition-colors ${enabled
                        ? 'bg-green-500/30 text-green-300 border-green-500/50'
                        : 'bg-gray-500/30 text-gray-400 border-gray-500/50'
                    }`}
                title={enabled ? '关闭音效' : '开启音效'}
            >
                {enabled ? '🔊' : '🔇'}
            </button>

            {enabled && (
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={volume}
                    onChange={handleVolumeChange}
                    className="w-20 h-2 rounded appearance-none bg-gray-600 cursor-pointer"
                    title={`音量: ${Math.round(volume * 100)}%`}
                />
            )}
        </div>
    );
};

// 音效辅助函数 - 供游戏逻辑调用
export const playSound = {
    attack: (isRanged: boolean) => soundManager.playAttack(isRanged),
    death: (side: 'player' | 'enemy') => soundManager.playDeath(side),
    hatchery: (action: 'build' | 'upgrade' | 'demolish') => soundManager.playHatchery(action),
    spawn: (side: 'player' | 'enemy') => soundManager.playSpawn(side),
    queen: (action: 'damage' | 'death') => soundManager.playQueen(action),
    ability: (ability: 'taunt' | 'escape' | 'stinger' | 'honeypot' | 'execution') => soundManager.playAbility(ability),
    ui: (action: 'click' | 'unlock' | 'victory' | 'defeat') => soundManager.playUI(action),
};