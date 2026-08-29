/**
 * 音效管理器
 * 使用 Howler.js 管理游戏音效
 */

import { Howl, Howler } from 'howler';
import { SOUNDS, SOUND_VOLUMES } from '../config/sounds';

interface SoundInstance {
    sound: Howl;
    lastPlayed: number;
    cooldown: number;
}

class SoundManager {
    private sounds: Map<string, SoundInstance> = new Map();
    private enabled: boolean = true;
    private initialized: boolean = false;

    constructor() {
        // 设置主音量
        Howler.volume(SOUND_VOLUMES.master);
    }

    /**
     * 初始化所有音效（预加载）
     */
    init() {
        if (this.initialized) return;

        this.loadSound('attack_melee', SOUNDS.attack.melee, SOUND_VOLUMES.attack);
        this.loadSound('attack_ranged', SOUNDS.attack.ranged, SOUND_VOLUMES.attack);
        this.loadSound('death_player', SOUNDS.antDeath.player, SOUND_VOLUMES.antDeath);
        this.loadSound('death_enemy', SOUNDS.antDeath.enemy, SOUND_VOLUMES.antDeath);
        this.loadSound('hatchery_build', SOUNDS.hatchery.build, SOUND_VOLUMES.hatchery);
        this.loadSound('hatchery_upgrade', SOUNDS.hatchery.upgrade, SOUND_VOLUMES.hatchery);
        this.loadSound('hatchery_demolish', SOUNDS.hatchery.demolish, SOUND_VOLUMES.hatchery);
        this.loadSound('spawn_player', SOUNDS.spawn.player, SOUND_VOLUMES.spawn);
        this.loadSound('spawn_enemy', SOUNDS.spawn.enemy, SOUND_VOLUMES.spawn);
        this.loadSound('queen_damage', SOUNDS.queen.damage, SOUND_VOLUMES.queen);
        this.loadSound('queen_death', SOUNDS.queen.death, SOUND_VOLUMES.queen);
        this.loadSound('ability_taunt', SOUNDS.ability.taunt, SOUND_VOLUMES.ability);
        this.loadSound('ability_escape', SOUNDS.ability.escape, SOUND_VOLUMES.ability);
        this.loadSound('ability_stinger', SOUNDS.ability.stinger, SOUND_VOLUMES.ability);
        this.loadSound('ability_honeypot', SOUNDS.ability.honeypot, SOUND_VOLUMES.ability);
        this.loadSound('ability_execution', SOUNDS.ability.execution, SOUND_VOLUMES.ability);
        this.loadSound('ui_click', SOUNDS.ui.click, SOUND_VOLUMES.ui);
        this.loadSound('ui_unlock', SOUNDS.ui.unlock, SOUND_VOLUMES.ui);
        this.loadSound('victory', SOUNDS.ui.victory, SOUND_VOLUMES.ui);
        this.loadSound('defeat', SOUNDS.ui.defeat, SOUND_VOLUMES.ui);

        this.initialized = true;
        console.log('[SoundManager] 音效系统初始化完成');
    }

    /**
     * 加载单个音效
     */
    private loadSound(key: string, src: string, volume: number, cooldown: number = 100) {
        const sound = new Howl({
            src: [src],
            volume: volume,
            preload: true,
            onloaderror: (_sprite, error) => {
                console.warn(`[SoundManager] 加载音效失败: ${key}`, error);
            },
        });

        this.sounds.set(key, {
            sound,
            lastPlayed: 0,
            cooldown,
        });
    }

    /**
     * 播放音效
     * @param key 音效键名
     * @param force 强制播放（忽略冷却）
     */
    play(key: string, force: boolean = false) {
        if (!this.enabled) return;

        const instance = this.sounds.get(key);
        if (!instance) {
            console.warn(`[SoundManager] 音效不存在: ${key}`);
            return;
        }

        // 检查冷却时间
        if (!force) {
            const now = Date.now();
            if (now - instance.lastPlayed < instance.cooldown) {
                return;
            }
        }

        instance.lastPlayed = Date.now();
        instance.sound.play();
    }

    /**
     * 播放攻击音效
     */
    playAttack(isRanged: boolean) {
        this.play(isRanged ? 'attack_ranged' : 'attack_melee');
    }

    /**
     * 播放死亡音效
     */
    playDeath(side: 'player' | 'enemy') {
        this.play(side === 'player' ? 'death_player' : 'death_enemy');
    }

    /**
     * 播放孵化室音效
     */
    playHatchery(action: 'build' | 'upgrade' | 'demolish') {
        this.play(`hatchery_${action}`);
    }

    /**
     * 播放孵化音效
     */
    playSpawn(side: 'player' | 'enemy') {
        this.play(side === 'player' ? 'spawn_player' : 'spawn_enemy');
    }

    /**
     * 播放蚁后音效
     */
    playQueen(action: 'damage' | 'death') {
        this.play(`queen_${action}`);
    }

    /**
     * 播放技能音效
     */
    playAbility(ability: 'taunt' | 'escape' | 'stinger' | 'honeypot' | 'execution') {
        this.play(`ability_${ability}`);
    }

    /**
     * 播放 UI 音效
     */
    playUI(action: 'click' | 'unlock' | 'victory' | 'defeat') {
        this.play(`ui_${action}`, true); // UI 音效不使用冷却
    }

    /**
     * 设置音效开关
     */
    setEnabled(enabled: boolean) {
        this.enabled = enabled;
        console.log(`[SoundManager] 音效${enabled ? '开启' : '关闭'}`);
    }

    /**
     * 设置主音量
     */
    setMasterVolume(volume: number) {
        Howler.volume(Math.max(0, Math.min(1, volume)));
    }

    /**
     * 设置音效类别音量
     */
    setCategoryVolume(category: string, volume: number) {
        // 注意：Howler.js 的 volume 是全局的，这里简化处理
        // 如果需要细分音量控制，需要为每个类别创建独立的 Howl 实例
        console.log(`[SoundManager] 设置 ${String(category)} 音量为 ${volume}`);
    }

    /**
     * 是否启用
     */
    isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * 销毁音效管理器
     */
    destroy() {
        for (const instance of this.sounds.values()) {
            instance.sound.unload();
        }
        this.sounds.clear();
        this.initialized = false;
        console.log('[SoundManager] 音效系统已销毁');
    }
}

// 单例实例
export const soundManager = new SoundManager();