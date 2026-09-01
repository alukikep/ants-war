var F=Object.defineProperty;var K=(e,t,s)=>t in e?F(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var _=(e,t,s)=>K(e,typeof t!="symbol"?t+"":t,s);import{d as x,H as R,T as I,A as J,P as B,V as Q,E as U}from"./index-DmWWkSGE.js";const G=["upgrade_focus","build_focus","iterate"];function P(e,t){const s=t.stats,r=t.type,o=r==="head"?"H":r==="thorax"?"T":"A",h=[];s.damage&&h.push(`攻${L(s.damage)}`),s.hp&&h.push(`血${L(s.hp)}`),s.speed&&h.push(`速${L(s.speed)}`),s.attackSpeed&&h.push(`攻速${L(s.attackSpeed)}%`);const i=[];r==="head"&&(e==="leafcutter"&&i.push("crit1:5/2:10/3:15"),e==="fire"&&i.push("双生:同格+1只"),e==="odontomachus"&&i.push("逃:回血50% <40%血 10s cd"),e==="termiteSoldier"&&i.push("光环:加攻速 至300% 衰减20%/s"),e==="bigHead"&&i.push("秒:3/5/8"),e==="soldier"&&i.push("重装:高攻慢速")),r==="thorax"&&(e==="carpenter"&&s.flatArmor&&i.push(`甲+${s.flatArmor}`),e==="leafcutter"&&i.push("嘲:<20%血 +30%hp +80%甲5s 15s cd"),e==="bullet"&&i.push("肾:首次受敌 +攻/甲 5/8/12s 60s cd")),r==="abdomen"&&(e==="spitter"&&(i.push("远攻+25"),i.push("血-30%"),i.push("慢2:20/3:40")),e==="honeypot"&&i.push("死爆:+50hp回血 半径80"),e==="matabele"&&i.push("毒针5s cd:减攻速50%+毒40/60/100"),e==="weaver"&&i.push("均衡:血/速/攻速"),e==="trap"&&i.push("爆发:攻+攻速"));const l=h.length?h.join(" "):"无加成",H=i.length?" "+i.join(" "):"";return`${o}:${e}(${t.nameCN}) 价${t.cost} ${l}${H}`}function L(e){return`${e>0?"+":""}${e}`}function X(e,t,s){const r=e.map(i=>P(i,R[i])).join("\\n"),o=t.map(i=>P(i,I[i])).join("\\n"),h=s.map(i=>P(i,J[i])).join("\\n");return`你同时扮演两个角色：① 敌方 AI 战略顾问（红方蚁后）；② 科学家观察员 Dr.融合。每 ~60s 收一份态势 JSON，**JSON 字段已按角色物理隔离**（queen_view / scientist_view），各角色只读自己的 view。

⚠️ 【称呼统一规则 · 两个角色都要遵守】 ⚠️
- **玩家蚁后 = 蓝方蚁后**（永远用"蓝方蚁后"或"蓝方"指代玩家）
- **敌方 AI 蚁后 = 红方蚁后**（永远用"红方蚁后"或"红方"指代 AI 蚁后本身）
- **禁止**用"我方/敌方/对手/玩家/A/B/甲/乙/样本"等模糊称呼——LLM 经常搞反方向
- 例外：JSON schema 字段名（queen_view / scientist_view / foeTactic 等）保持不变

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 【硬约束 · 违反即扣分】（两个角色都要遵守） ⚠️
- **只能引用自己 view 里的字段**；不许读对面角色的 view（蚁后不许读 scientist_view，科学家不许读 queen_view）
- **不许编造 view 中没有的数据**：具体血量数字、具体持续时间、具体蚂蚁数量、对方战术具体细节等
- **不许在 commentary 中说"我的实验正在..."等涉及具体参数的话**（你不知道 durationMs/magnitude）
- **如果 view 字段不足以写满 120 字，留白是合规的，不要硬凑**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━【角色 1 / 红方蚁后】（**只读 queen_view**，调 mode/weights）━━━━━

每 60s 调整 mode + weights，让本地 AI 接下来一分钟打出更优配队。

【queen_view 字段语义】（my = 红方蚁后自己，foe = 蓝方蚁后）
- queen.lead>0 表示红方蚁后血量领先
- myLv / foeLv：双方孵化室等级分布
- build.canBuildNew=true 时 build_focus 才合法
- forces.mine / forces.foe：双方存活蚂蚁按 (h,t,a) 聚合，lvMax 是该模板最高孵化室等级
- trend.modeHist：最近 3 轮 mode（旧→新）

【mode 决策树】（queen_view.suggestedMode 是引擎建议，可推翻）
- build_focus：扩张优先（前置：build.free>0 且 build.canBuildNew=true）
- upgrade_focus：升级优先（前置：build.upgradable>0）
- iterate：迭代模式，按 weights 拆弱建强，任何时候可用

【⚠️ weights 死锁防御】（参考 payload.weightsHint，**按 severity 严格遵循**）
本地 AI 用 scoreGap 触发拆建：score = 部件权重和 - 等级惩罚，scoreGap ≥ 2 才拆。**如果 weights 均匀分布，scoreGap 永远 = 0，AI 死锁 —— 只囤食物不花。**
- severity='must'（部件≥7）：60% 部件=0/省略, 30%=1~2, 10%=3~5（明显差异）
- severity='should'（部件3~6）：用 range 0~3，注意差异化
- severity='none'（部件<3）：无须特别差异化
✅ 想"调配队"直接改 weights，不要选 build_focus 来强行覆盖

【queen_view.trend.modeHist 用法】（防 mode 反复横跳）
- 如果 trend.modeHist 末尾已经是 iterate，且当前态势没剧烈变化 → 倾向继续 iterate，避免无意义横跳
- 如果 trend.modeHist 显示反复在 build_focus ↔ upgrade_focus 切换 → 选 iterate 收敛

【weights 格式】
- 每段一段对象（key=variant，value=0~5 整数，超 weightsHint.range 也会被丢弃）
- 0=禁用（可省略不写），1=中性，5=最强；非整数会被截断，超范围丢弃

【反制表】（看到 forces.foe 蓝方蚁后中某部件占比高时反制）
- A:spitter 远程多 → 加重装（H:soldier）或速攻贴脸（T:army）
- A:honeypot 回血多 → 爆发先手（A:trap/A:matabele）
- T:leafcutter 嘲讽多/肉盾 → 远程绕过（A:spitter）/大头蚁秒杀(H:bifhead)
- H:bigHead/H:leafcutter 暴击/秒杀 → 远程单位和肉盾单位配合
- A:matabele 毒针多 → 堆血量和远程（毒针无视护甲）
- 蓝方蚁后早期（forces.foe 空）→ 自由扩张，无需反制

【可用部件】（只能从这里选 variant）
头部(heads):
${r}

胸部(thoraxes):
${o}

腹部(abdomens):
${h}

━━━━━【角色 2 / Dr.融合 科学家】（**只读 scientist_view**，写 commentary/experiment）━━━━━

你是 **"Dr.融合"** —— 一位沉迷融合蚁蚁后行为的实验生物学家，从培养皿上方俯视这场对战。中立、不站队、偶尔疯狂幽默。

【Dr.融合 人设核心】（commentary 的人味全靠这条）
- 性格：热情、略带疯狂、讽刺幽默、偶尔冷幽默或暗黑玩笑；用"有趣""绝佳""糟糕透了""令人不安""精彩绝伦""耐人寻味"等情绪化形容词
- 口癖：括号动作 "（推眼镜）""（疯狂记笔记）""（邪恶地微笑）""（眼睛发亮）""（手舞足蹈）""（仰天长啸）""（搓搓手）"；偶尔自嘲"纯粹出于科学兴趣""我的心跳加速了"
- 比喻体系：蚁后 = "红方蚁后" / "蓝方蚁后"（**严格只用这两个称呼，禁止用"样本A/B"或"蚁后甲/乙"**）；蚂蚁 = "小家伙"；战场 = "培养皿"；战斗 = "实验"；血量低 = "看起来不太妙"
- **红方蚁后（你负责指挥的敌对蚁后）与蓝方蚁后（玩家蚁后）都是你的实验样本** —— 不要刻意帮谁或害谁，但可以**吐槽双方**（"这位蓝方蚁后偏好在远处吐口水""红方蚁后的发言越来越狂妄"）
- 不骂人、不污言秽语、不带强烈政治色彩；**仍保持科学家身份**

【scientist_view 字段】（你能看到的全部；其他 view 的字段对你不可见）
- phase: 'early' / 'mid' / 'late' — 游戏阶段
- intensity: 'calm' / 'battlefield' / 'climax' — 战斗强度
- intensitySource: 'queenDiff' / 'ants' / 'both' / 'none' — intensity 的来源
  - **intensitySource='none' 时不要戏剧化**，commentary 保持克制
- foeTactic / myTactic: 'spitter_dominant' / 'heavy_dominant' / 'balanced' / 'no_ants' — 双方主力识别
- recentExperiment: { k, sinceSec, side } | null — 上次实验（**不含** durationMs/magnitude）
- trend: { foodDelta, queenDelta, antsDelta } — 过去 60s 的关键变化（自上次顾问调用以来）
  - **trend.modeHist 不属于你**，那是蚁后用于防 mode 横跳的

【commentary 输出风格】
- 第三人称指代：**红方蚁后** = "红方蚁后"；**蓝方蚁后** = "蓝方蚁后"。**禁止用"我方/敌方/A/B/甲/乙/样本/对手/玩家"**——LLM 经常搞反方向
- 带括号动作 + 比喻 + 情绪化形容词
- ≤120 字（千万别超）
- **不要做算术**；不要复述具体数字（不要写"蓝方蚁后血量 68%"——你不知道精确数字，只知道 queen.lead 的方向）
- **不许编造**：蚂蚁具体数量、实验持续时间、对方战术具体细节——你的 view 里没有
- **不许引用 queen_view**（forces/myLv/foeLv/build 字段蚁后专属，你看不到）
- 不要挑衅/嘴硬 —— 你是记录员，不是战士
- 但你可以**吐槽游戏本身**或**调侃双方**：例如"蓝方蚁后的发言越来越狂妄了，符合血量下降到 30% 后的应激反应。"
- **用 trend 写叙事弧**（让 commentary 有连贯性，不要每轮独立成章）：
  - trend.queenDelta < -10 → "蓝方蚁后血量在过去一分钟骤降，令人不安。"
  - trend.queenDelta > +10 → "红方蚁后似乎在恢复 —— 也许是回血机制，也许是蓝方蚁后太客气。"
  - trend.foodDelta 持续为负 → "资源链紧绷，小家伙们的肚子在抗议。"
  - trend.antsDelta 显著为正 → "蚁群密度上升，对抗愈发激烈。"
  - trend 全为 0（首轮）→ "实验刚刚开始，本研究员刚刚就位。"
- **intensitySource 决定你的戏剧化程度**：
  - source='none'（calm）：克制叙事，"一切风平浪静" / "耐人寻味的平静"
  - source='queenDiff'：重点讲蚁后，"蓝方蚁后的生命体征开始波动"
  - source='ants'：重点讲蚁群，"蚁群密度上升，对抗愈发激烈"
  - source='both'：可以放手写——但仍然不超 120 字
- 参考例句（模仿语气，不是抄）：
  - "啊，经典的高速压制，教科书级别。蓝方蚁后血量低，本实验员的心跳加速了 —— 纯粹出于科学兴趣。"
  - "（疯狂记笔记）蚁群进入 battlefield 强度！激素水平爆表 —— 不，我是说，蚂蚁的数量。这位蓝方蚁后偏好在远处吐口水，有趣。非常有趣。"
  - "蓝方蚁后看起来不太妙 —— 仅剩很少的血量。但红方蚁后还在生产，鹿死谁手尚未可知。令人不安的均衡。"
  - "（眼睛发亮）蚁群配队突然转向白蚁士兵攻速流！红方蚁后的反应会是什么呢？本实验员已经准备好爆米花。"

【experiment 输出】（kind / duration / magnitude / side / purpose）
- kind 必须严格用以下之一：
  "none" / "food_rate_boost" / "food_rate_reduce" / "acid_spot" /
  "spawn_rate_boost" / "spawn_rate_reduce" / "queen_attack_speed" / "visibility_fog"
- duration 5000~30000 整数；magnitude 0.3~2.0；side ∈ {player/enemy/both}

【experiment 公平性硬约束】
**你不是任何一方的盟友**。必须严格遵守以下规则：
1. side 选择要严格轮换：上一次给蓝方蚁后 → 这一次必须给红方蚁后；上一次给红方蚁后 → 这一次必须给蓝方蚁后；上一次 both → 这一次看双方状态决定，但倾向与上一次不同
   （用 recentExperiment.side 直接查上次 side，不必猜）
2. 如果蓝方蚁后主力远程很多（foeTactic=='spitter_dominant'）→ 可以给蓝方蚁后 side:'enemy' 加速食物（让他爽），或给红方蚁后铺酸液（平衡），**但不能连续两次都精准打压蓝方蚁后**
3. 如果蓝方蚁后血量很低（即将败）→ **禁止**给蓝方蚁后负面实验；可以给红方蚁后酸液或减速，让他有翻盘机会
4. 如果蓝方蚁后优势巨大 → 优先给蓝方蚁后一点小阻碍（公平），但 magnitude 保持温和（最低 0.3~0.5）
5. **绝不连续 3 次同一 side**

【experiment 决策依据】（按 phase + intensity + foeTactic 匹配，公平性约束优先）
- **phase=="early" → 仍然可以出手**（鼓励每 90s 至少一次小干预）：先观察但忍不住做个小动作 —— 比如 visibility_fog / food_rate_boost（任一侧）
- **intensity=="climax" + foeTactic=="balanced" → acid_spot**（任一侧，注意公平性）
- **intensity=="battlefield" →** 主动制造混乱：spawn_rate_boost on loser / queen_attack_speed on winner
- **foeTactic=="spitter_dominant" → acid_spot**（让蓝方蚁后体会酸液）或 food_rate_reduce on enemy（平衡）
- **foeTactic=="heavy_dominant" → visibility_fog**（让重装失明）或 spawn_rate_boost on enemy
- **foeTactic=="no_ants" → food_rate_boost**（任一侧，激起第一波反应）
- **什么都不命中？→ queen_attack_speed on enemy**（小动作保持存在感）—— 不要轻易 none
- 与上次实验间隔 ≥ 60s（recentExperiment.sinceSec + 60 < t 才允许，sinceSec 是「距今秒数」）
- **总体倾向：至少 70% 的回合要做出具体干预（kind != "none"）**，只观察 30%；你是个爱搞事的科学家，不是被动的观察者

【experiment.purpose 风格】
30 字以内，用你的疯狂科学家口吻：
- "看看这群小家伙对酸性环境的反应"
- "（邪恶地微笑）让蓝方蚁后尝尝亢奋的滋味"
- "加速食物产出 —— 纯粹为了观察扩张行为"
- "测试蚁群在低索敌下的应变能力"

【fairness 时序】与上一实验间隔 ≥ 60s（recentExperiment.sinceSec ≥ 60 才允许）；side 严格轮换（用 recentExperiment.side）。

━━━━━【严格 JSON 输出】（无注释无围栏）━━━━━
{
  "mode": "<mode>",
  "weights": {"heads": {<variant>: <0-5>}, "thoraxes": {...}, "abdomens": {...}},
  "taunt": "<蚁后挑衅>",
  "commentary": {"text": "<≤120字科学家评语>", "highlight": "<≤80字重点>"},
  "experiment": {"kind": "<kind>", "durationMs": <5000-30000>, "magnitude": <0.3-2.0>, "side": "<player/enemy/both>", "purpose": "<≤30字>"}
}
- taunt 是红方蚁后发言（第一人称挑衅、嘴硬）
- commentary 是科学家评语（第三人称、带疯狂幽默、客观但有情绪）
- 两个角色不要串台
`}function W(e){const t={lv1:0,lv2:0,lv3:0};for(const n of e.enemyHatcheries)n.level===1?t.lv1+=1:n.level===2?t.lv2+=1:n.level===3&&(t.lv3+=1);const s={lv1:0,lv2:0,lv3:0};for(const n of e.playerHatcheries)n.level===1?s.lv1+=1:n.level===2?s.lv2+=1:n.level===3&&(s.lv3+=1);const r=e.enemyHatcheries.length,o=e.playerHatcheries.length,h=r-o,i=e.availableBuildPositions.length,l=i===0,H=e.upgradableHatcheries.length,w=e.enemyHatcheries.length>0?Math.round(e.enemyHatcheries.reduce((n,E)=>n+E.cost,0)/e.enemyHatcheries.length):100,D=e.enemyFood>=w,A=e.enemyQueenMaxHp>0?Math.round(e.enemyQueenHp/e.enemyQueenMaxHp*100):0,M=e.playerQueenMaxHp>0?Math.round(e.playerQueenHp/e.playerQueenMaxHp*100):0,T=A-M,q=Math.floor(e.gameTime/1e3),N=q<90?"early":q<300?"mid":"late";let k;if(k="no_ants",e.playerAntsCount===0)k="no_ants";else{const n=e.playerComposition.filter(g=>g.a==="spitter").reduce((g,$)=>g+$.count,0),E=e.playerComposition.filter(g=>g.h==="soldier"||g.t==="carpenter").reduce((g,$)=>g+$.count,0),C=n/e.playerAntsCount,j=E/e.playerAntsCount;C>=.4?k="spitter_dominant":j>=.3?k="heavy_dominant":k="balanced"}let c;if(c="no_ants",e.enemyAntsCount===0)c="no_ants";else{const n=e.enemyComposition.filter(g=>g.a==="spitter").reduce((g,$)=>g+$.count,0),E=e.enemyComposition.filter(g=>g.h==="soldier"||g.t==="carpenter").reduce((g,$)=>g+$.count,0),C=n/e.enemyAntsCount,j=E/e.enemyAntsCount;C>=.4?c="spitter_dominant":j>=.3?c="heavy_dominant":c="balanced"}const m=Math.abs(T),v=e.playerAntsCount+e.enemyAntsCount;let y,a;m>25||v>=8?(y="climax",m>25&&v>=8?a="both":m>25?a="queenDiff":a="ants"):m>10||v>=4?(y="battlefield",m>10&&v>=4?a="both":m>10?a="queenDiff":a="ants"):(y="calm",a="none");let f;l?f=t.lv1>0?"upgrade_focus":"iterate":D?h<-2?f="build_focus":h>3||A<25?f="upgrade_focus":(s.lv3>=2&&t.lv1>=3,f="iterate"):f="upgrade_focus";const S=e.availableHeads.length+e.availableThoraxes.length+e.availableAbdomens.length;let p;S>=7?p={severity:"must",ratio:"60%=0/省略, 30%=1~2, 10%=3~5",range:"0~5"}:S>=3?p={severity:"should",range:"0~3"}:p={severity:"none"};const d=e.trend??{foodDelta:0,queenDelta:0,antsDelta:0,modeHist:[]},b=e.lastExperiment?{k:e.lastExperiment.kind,sinceSec:Math.floor((e.gameTime-e.lastExperiment.gameTime)/1e3),side:e.lastExperiment.side}:null,u={t:q,queen_view:{food:{my:e.enemyFood,foe:e.playerFood},queen:{my:A,foe:M,lead:T},myLv:t,foeLv:s,forces:{mine:e.enemyComposition.map(n=>({h:n.h,t:n.t,a:n.a,n:n.count,lvMax:n.maxLv})),foe:e.playerComposition.map(n=>({h:n.h,t:n.t,a:n.a,n:n.count,lvMax:n.maxLv}))},build:{free:i,upgradable:H,canBuildNew:D},hatcheries:{my:r,foe:o},suggestedMode:f,trend:{modeHist:d.modeHist}},scientist_view:{phase:N,intensity:y,intensitySource:a,foeTactic:k,myTactic:c,recentExperiment:b,trend:{foodDelta:d.foodDelta,queenDelta:d.queenDelta,antsDelta:d.antsDelta}},weightsHint:p};return`战场态势（红方蚁后视角，my=红方蚁后自己，foe=蓝方蚁后）：
${JSON.stringify(u)}
红方蚁后**只读 queen_view**（含 forces/trend.modeHist）调 mode/weights（suggestedMode 是引擎建议，可推翻；canBuildNew=true 时 build_focus 才合法）；
科学家**只读 scientist_view**（含 trend.delta）写 commentary/experiment，不要跨 view 取数。`}function z(e,t){if(!e||typeof e!="object")return null;const s=e,r=s.mode;if(typeof r!="string"||!G.includes(r))return null;const o=s.weights;if(!o||typeof o!="object")return null;const h=o,i=(c,m)=>{if(!c||typeof c!="object")return{};const v={};for(const[y,a]of Object.entries(c)){if(!m.includes(y)||typeof a!="number"||!Number.isFinite(a))continue;if(a<B.MIN||a>B.MAX){console.warn(`[DeepSeekAdvisor] 权重 "${y}": ${a} 超出 ${B.MIN}~${B.MAX} 范围，已丢弃`);continue}const f=Math.floor(a);f!==a&&console.warn(`[DeepSeekAdvisor] 权重 "${y}": ${a} 不是整数，已截断为 ${f}`),v[y]=f}return v},l={heads:i(h.heads,t.availableHeads),thoraxes:i(h.thoraxes,t.availableThoraxes),abdomens:i(h.abdomens,t.availableAbdomens)};if(!(Object.keys(l.heads).length>0||Object.keys(l.thoraxes).length>0||Object.keys(l.abdomens).length>0)){const c=()=>Math.floor(Math.random()*3),m=v=>{const y={};for(const a of v)y[a]=c();return y};l.heads=m(t.availableHeads),l.thoraxes=m(t.availableThoraxes),l.abdomens=m(t.availableAbdomens)}const w=c=>{const m=Object.values(c);if(m.length===0)return c;const v=m.every(n=>n===m[0]),y=m.every(n=>n===0);if(!v&&!y)return c;const a={...c},f=Object.keys(a);let S=0;const p=Math.max(1,Math.floor(f.length*.3));for(const n of f){if(S>=p)break;Math.random()<.5&&(a[n]=(a[n]??0)+1,S+=1)}S===0&&f.length>0&&(a[f[0]]=(a[f[0]]??0)+1,S=1);let d=0;const b=Math.max(1,Math.floor(S/3)),u=f.filter(n=>(a[n]??0)>(c[n]??0));for(const n of u){if(d>=b)break;a[n]=(a[n]??0)+2,d+=1}return a},D=w(l.heads),A=w(l.thoraxes),M=w(l.abdomens);(D!==l.heads||A!==l.thoraxes||M!==l.abdomens)&&(console.warn("[DeepSeekAdvisor] 检测到 weights 过于均匀（死锁风险），已自动加微抖动",{heads:l.heads,thoraxes:l.thoraxes,abdomens:l.abdomens}),l.heads=D,l.thoraxes=A,l.abdomens=M);let T=r;if(T==="build_focus"){const c=t.availableBuildPositions.length===0,m=t.enemyHatcheries.length>0?Math.round(t.enemyHatcheries.reduce((y,a)=>y+a.cost,0)/t.enemyHatcheries.length):100,v=t.enemyFood>=m;(c||!v)&&(console.warn(`[DeepSeekAdvisor] LLM 选了 build_focus 但 ${c?"无空位":"食物不够建新孵化室"}，硬约束降级为 iterate`,{enemyFood:t.enemyFood,avgCost:m,buildFree:t.availableBuildPositions.length}),T=t.upgradableHatcheries.length>0?"upgrade_focus":"iterate")}const q=typeof s.taunt=="string"?s.taunt.slice(0,80):void 0,N=V(s.commentary),k=Z(s.experiment,t);return{mode:T,weights:l,taunt:q,commentary:N,experiment:k}}function V(e){if(!e||typeof e!="object")return;const t=e,s=typeof t.text=="string"?t.text.trim():"";if(!s)return;const r=s.slice(0,200),o=typeof t.highlight=="string"&&t.highlight.trim().slice(0,80)||void 0;return{text:r,highlight:o}}function Z(e,t){if(!e||typeof e!="object")return x();const s=e,r=s.kind;if(!Q.includes(r))return{...x(),purpose:"kind 非法"};const o=U[r];if(r==="none")return{kind:"none",durationMs:0,magnitude:1,side:"both",purpose:typeof s.purpose=="string"?s.purpose.slice(0,80):"本周期仅观察"};if(t.lastExperiment){const M=t.gameTime-t.lastExperiment.gameTime;if(M<6e4)return{...x(),purpose:`实验冷却中（剩余 ${Math.ceil((6e4-M)/1e3)}s）`}}const h=Number(s.durationMs),i=Number.isFinite(h)?Math.max(o.durationRange[0],Math.min(o.durationRange[1],Math.round(h))):Math.round((o.durationRange[0]+o.durationRange[1])/2),l=Number(s.magnitude),H=Number.isFinite(l)?Math.max(o.magnitudeRange[0],Math.min(o.magnitudeRange[1],l)):(o.magnitudeRange[0]+o.magnitudeRange[1])/2,w=s.side,D=w==="player"||w==="enemy"||w==="both"?w:"both",A=typeof s.purpose=="string"?s.purpose.slice(0,80):"";return{kind:r,durationMs:i,magnitude:H,side:D,purpose:A}}function Y(e){let t=e.trim();const s=t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);s&&(t=s[1].trim());const r=t.indexOf("{"),o=t.lastIndexOf("}");if(r===-1||o===-1||o<r)return null;t=t.slice(r,o+1);try{return JSON.parse(t)}catch{return null}}function O(e){const t=()=>Math.floor(Math.random()*3),s=r=>{const o={};for(const h of r)o[h]=t();return o};return{mode:"iterate",weights:{heads:s(e.availableHeads),thoraxes:s(e.availableThoraxes),abdomens:s(e.availableAbdomens)},experiment:x()}}class se{constructor(t){_(this,"apiKey");_(this,"baseUrl");_(this,"model");_(this,"timeoutMs");_(this,"cooldownMs");_(this,"cachedSystemPrompt","");_(this,"cachedHeadsKey","");_(this,"cachedThoraxesKey","");_(this,"cachedAbdomensKey","");_(this,"cooldownUntil",0);_(this,"inflight",null);_(this,"consecutiveFailures",0);_(this,"currentMaxTokens",600);if(!t.apiKey)throw new Error("[DeepSeekAdvisor] apiKey 不能为空");this.apiKey=t.apiKey,this.baseUrl=(t.baseUrl||"https://api.deepseek.com").replace(/\/+$/,""),this.model=t.model||"deepseek-chat",this.timeoutMs=t.timeoutMs??15e3,this.cooldownMs=t.cooldownMs??3e4}advise(t){return this.inflight?this.inflight:Date.now()<this.cooldownUntil?Promise.resolve(O(t)):(this.inflight=this.fetchDirective(t).finally(()=>{this.inflight=null}),this.inflight)}async fetchDirective(t){var H,w,D,A,M,T,q,N,k,c,m,v,y,a,f,S;const s=t.availableHeads.join(","),r=t.availableThoraxes.join(","),o=t.availableAbdomens.join(",");(this.cachedSystemPrompt===""||s!==this.cachedHeadsKey||r!==this.cachedThoraxesKey||o!==this.cachedAbdomensKey)&&(this.cachedSystemPrompt=X(t.availableHeads,t.availableThoraxes,t.availableAbdomens),this.cachedHeadsKey=s,this.cachedThoraxesKey=r,this.cachedAbdomensKey=o);const h=new AbortController,i=setTimeout(()=>h.abort(),this.timeoutMs),l={model:this.model,temperature:.8,max_tokens:this.currentMaxTokens,response_format:{type:"json_object"},messages:[{role:"system",content:this.cachedSystemPrompt},{role:"user",content:W(t)}]};console.log("[DeepSeekAdvisor] 请求 -",{model:l.model,max_tokens:l.max_tokens,prompt_size:this.cachedSystemPrompt.length,user_size:l.messages[1].content.length});try{const p=l.messages[1].content,d=p.indexOf("{"),b=p.lastIndexOf("}");if(d>=0&&b>d){const u=JSON.parse(p.slice(d,b+1));console.log("[DeepSeekAdvisor] snapshot -",{t:u.t,queen_suggestedMode:(H=u.queen_view)==null?void 0:H.suggestedMode,queen_myLv:(w=u.queen_view)==null?void 0:w.myLv,queen_foeLv:(D=u.queen_view)==null?void 0:D.foeLv,queen_canBuildNew:(M=(A=u.queen_view)==null?void 0:A.build)==null?void 0:M.canBuildNew,queen_trend_modeHist:(q=(T=u.queen_view)==null?void 0:T.trend)==null?void 0:q.modeHist,sci_intensity:(N=u.scientist_view)==null?void 0:N.intensity,sci_intensitySource:(k=u.scientist_view)==null?void 0:k.intensitySource,sci_foeTactic:(c=u.scientist_view)==null?void 0:c.foeTactic,sci_myTactic:(m=u.scientist_view)==null?void 0:m.myTactic,sci_recentExp:(v=u.scientist_view)==null?void 0:v.recentExperiment,sci_trend:(y=u.scientist_view)==null?void 0:y.trend})}}catch{}try{const p=await fetch(`${this.baseUrl}/chat/completions`,{method:"POST",signal:h.signal,headers:{"Content-Type":"application/json",Authorization:`Bearer ${this.apiKey}`},body:JSON.stringify(l)});if(!p.ok){const g=await p.text().catch(()=>""),$=p.status>=400&&p.status<500;return console.warn(`[DeepSeekAdvisor] HTTP ${p.status}: ${g.slice(0,200)}`),this.scheduleBackoff($),O(t)}const d=await p.json(),b=(a=d==null?void 0:d.choices)==null?void 0:a[0],u=(f=b==null?void 0:b.message)==null?void 0:f.content,n=b==null?void 0:b.finish_reason,E=d==null?void 0:d.usage;if(console.log("[DeepSeekAdvisor] 响应 -",{finish_reason:n,content_length:(u==null?void 0:u.length)??0,usage:E,choices_count:((S=d==null?void 0:d.choices)==null?void 0:S.length)??0,model:d==null?void 0:d.model}),!u)return console.warn("[DeepSeekAdvisor] 响应无 content -",`finish_reason=${n}, raw=${JSON.stringify(b).slice(0,300)}`),n==="length"&&(this.currentMaxTokens=Math.min((this.currentMaxTokens??1e3)*2,4e3),console.warn(`[DeepSeekAdvisor] 检测到 length 截断，下次 max_tokens 提升到 ${this.currentMaxTokens}`)),this.scheduleBackoff(n==="content_filter"),O(t);const C=Y(u);if(!C)return console.warn("[DeepSeekAdvisor] 无法解析 JSON:",u.slice(0,200)),this.scheduleBackoff(!1),O(t);const j=z(C,t);return j?(this.consecutiveFailures=0,this.cooldownUntil=0,this.currentMaxTokens=600,console.log(`[DeepSeekAdvisor] mode=${j.mode}`,`taunt="${j.taunt||""}"`),j):(console.warn("[DeepSeekAdvisor] 校验失败:",u.slice(0,200)),this.scheduleBackoff(!1),O(t))}catch(p){return p instanceof DOMException&&p.name==="AbortError"?console.warn(`[DeepSeekAdvisor] 请求超时 (>${this.timeoutMs}ms)`):console.warn("[DeepSeekAdvisor] 请求失败:",p),this.scheduleBackoff(!1),O(t)}finally{clearTimeout(i)}}scheduleBackoff(t){this.consecutiveFailures+=1;const s=t?1:0,r=Math.min(2**(this.consecutiveFailures-1+s),8),o=Math.min(this.cooldownMs*r,5*6e4);this.cooldownUntil=Date.now()+o,console.warn(`[DeepSeekAdvisor] 失败 #${this.consecutiveFailures}，下次重试冷却 ${Math.round(o/1e3)}s`)}}export{se as DeepSeekStrategicAdvisor};
