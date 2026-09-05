/**
 * 音效配置
 * 定义游戏中的各种音效
 *
 * 注意：音乐路径 `music.battle` 默认指向 `public/music/battle.mp3`。
 * 由开发者/用户自行将 .mp3 / .ogg / .wav 文件放入该目录。
 * 如果想支持多格式兜底，可以将路径改为数组形式：
 *   battle: ['/music/battle.mp3', '/music/battle.ogg']
 */

export const SOUNDS = {
    // 背景音乐（战斗时循环播放）
    music: {
        battle: '/music/battle.mp3',
    },
    // 攻击音效
    attack: {
        melee: '/sounds/attack_melee.wav',      // 近战攻击
        ranged: '/sounds/attack_ranged.wav',    // 远程攻击
    },
    // 蚂蚁死亡
    antDeath: {
        player: '/sounds/death_player.wav',
        enemy: '/sounds/death_enemy.wav',
    },
    // 孵化室建造/升级
    hatchery: {
        build: '/sounds/hatchery_build.wav',
        upgrade: '/sounds/hatchery_upgrade.wav',
        demolish: '/sounds/hatchery_demolish.wav',
    },
    // 孵化
    spawn: {
        player: '/sounds/spawn_player.wav',
        enemy: '/sounds/spawn_enemy.wav',
    },
    // 蚁后
    queen: {
        damage: '/sounds/queen_damage.wav',
        death: '/sounds/queen_death.wav',
    },
    // 技能触发
    ability: {
        taunt: '/sounds/ability_taunt.wav',           // 嘲讽
        escape: '/sounds/ability_escape.wav',        // 逃脱
        stinger: '/sounds/ability_stinger.wav',      // 尾针
        honeypot: '/sounds/ability_honeypot.wav',    // 蜜罐爆炸
        execution: '/sounds/ability_execution.wav',  // 秒杀
    },
    // UI 音效
    ui: {
        click: '/sounds/ui_click.wav',
        unlock: '/sounds/ui_unlock.wav',
        victory: '/sounds/victory.wav',
        defeat: '/sounds/defeat.wav',
    },
} as const;

// 音效音量配置
export const SOUND_VOLUMES = {
    master: 1.0,        // 主音量
    music: 0.5,         // 音乐音量
    sfx: 0.8,           // 音效音量
    attack: 0.6,
    antDeath: 0.4,
    hatchery: 0.7,
    spawn: 0.5,
    queen: 0.8,
    ability: 0.7,
    ui: 0.5,
} as const;

export type SoundKey = keyof typeof SOUNDS;
export type SoundCategory = keyof typeof SOUND_VOLUMES;