/**
 * 音效管理器
 * 使用 Howler.js 管理游戏音效
 *
 * 包含两部分：
 *  - SFX：通过 `sounds` Map 管理，每个音效独立冷却
 *  - BGM：单实例循环（loop=true），独立音量，独立开关
 *    走 `pause()` / `play()` 实现暂停游戏时断点继续
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

    // === BGM（背景音乐）独立状态 ===
    // 注意：音量/开关独立于 SFX，避免主音量滑块影响音乐（详见 README/架构说明）
    private music: Howl | null = null;
    private musicEnabled: boolean = true;
    private musicVolume: number = SOUND_VOLUMES.music; // 默认 0.5
    private musicInitialized: boolean = false;
    // 标记是否处于"暂停态"（howl.pause 后用 play() 即可从断点继续）
    private musicPaused: boolean = false;

    constructor() {
        // 设置主音量（仅作用于 SFX，详见 setMasterVolume / setMusicVolume）
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
     * 初始化背景音乐（仅创建 Howl 实例，不自动播放）
     * 必须在用户有过交互（点过"开始游戏"）后才能成功 play()
     */
    initMusic() {
        if (this.musicInitialized) return;
        if (!SOUNDS.music || !SOUNDS.music.battle) {
            console.warn('[SoundManager] 未配置音乐路径，跳过音乐初始化');
            return;
        }

        this.music = new Howl({
            src: [SOUNDS.music.battle],
            loop: true,
            volume: this.musicVolume,
            html5: false, // Web Audio：低延迟，适合 BGM
            preload: true,
            onloaderror: (_sprite, error) => {
                // 文件不存在（用户尚未放入 battle.mp3）时不要让控制台刷屏
                console.warn(
                    `[SoundManager] 加载背景音乐失败: ${SOUNDS.music.battle}（请将 .mp3 文件放入 public/music/ 目录）`,
                    error,
                );
            },
            onplayerror: (_sprite, error) => {
                console.warn('[SoundManager] 背景音乐播放错误:', error);
            },
        });

        this.musicInitialized = true;
        console.log('[SoundManager] 背景音乐初始化完成');
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

    // ===========================================================
    //                    背景音乐（BGM）控制
    // ===========================================================
    // 设计要点：
    //  - 音乐音量/开关独立于 SFX，避免被主音量滑块污染
    //  - pause() / play() 组合实现"暂停游戏时断点继续"
    //  - stop() 才会真正停止（用于重置 / 结束游戏 / 关闭音乐开关）
    //  - playMusic() 自带幂等保护：已在播放就不再调用 play()
    // ===========================================================

    /**
     * 播放/重新开始背景音乐。
     * - 若处于 paused 状态，会调用 play() 从断点继续
     * - 若已停止或刚创建，从头开始播放
     * - 当音乐开关关闭时不会播放
     */
    playMusic() {
        if (!this.music || !this.musicEnabled) return;

        try {
            // 当前已经在播放中（含"暂停后恢复"场景）：howl.play() 是幂等的
            // 直接调用即可，不要 stop()，否则会从头开始
            if (this.musicPaused) {
                this.music.play();
                this.musicPaused = false;
            } else if (!this.music.playing()) {
                this.music.play();
                this.musicPaused = false;
            }
        } catch (err) {
            // 浏览器自动播放策略可能拒绝（用户首次进入页面还没点击过任何按钮时）
            console.warn('[SoundManager] 播放背景音乐被浏览器拒绝（需要用户交互后才能播放）:', err);
        }
    }

    /**
     * 暂停背景音乐（断点处暂停，resumeMusic() 可继续）
     */
    pauseMusic() {
        if (!this.music) return;
        if (this.music.playing()) {
            this.music.pause();
            this.musicPaused = true;
        }
    }

    /**
     * 从断点继续播放背景音乐
     */
    resumeMusic() {
        if (!this.music || !this.musicEnabled) return;
        if (this.musicPaused) {
            this.music.play();
            this.musicPaused = false;
        }
    }

    /**
     * 彻底停止背景音乐（用于重置 / 胜负结束 / 用户手动关闭音乐开关）
     */
    stopMusic() {
        if (!this.music) return;
        if (this.music.playing() || this.musicPaused) {
            this.music.stop();
        }
        this.musicPaused = false;
    }

    /**
     * 设置音乐开关
     */
    setMusicEnabled(enabled: boolean) {
        this.musicEnabled = enabled;
        if (!enabled) {
            this.stopMusic();
        }
        console.log(`[SoundManager] 背景音乐${enabled ? '开启' : '关闭'}`);
    }

    /**
     * 设置音乐音量（0-1，独立于 SFX 主音量）
     */
    setMusicVolume(volume: number) {
        const v = Math.max(0, Math.min(1, volume));
        this.musicVolume = v;
        if (this.music) {
            this.music.volume(v);
        }
    }

    /**
     * 音乐是否启用
     */
    isMusicEnabled(): boolean {
        return this.musicEnabled;
    }

    /**
     * 获取当前音乐音量
     */
    getMusicVolume(): number {
        return this.musicVolume;
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

        // 清理背景音乐
        if (this.music) {
            this.music.stop();
            this.music.unload();
            this.music = null;
        }
        this.musicInitialized = false;
        this.musicPaused = false;

        console.log('[SoundManager] 音效系统已销毁');
    }
}

// 单例实例
export const soundManager = new SoundManager();