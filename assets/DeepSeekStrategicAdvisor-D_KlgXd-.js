var x=Object.defineProperty;var P=(e,t,s)=>t in e?x(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var w=(e,t,s)=>P(e,typeof t!="symbol"?t+"":t,s);import{d as O,H as F,T as K,A as R,P as C,V as J,E as Q}from"./index-D5vSf6Sx.js";const U=["upgrade_focus","build_focus","iterate"];function G(e,t){if(e===0)return null;const s=Math.abs(e),o=e<0;let i;switch(t){case"attack":s<=5?i="低":s<=14?i="中低":s<=19?i="中":s<=24?i="中高":i="高";break;case"hp":s<=15?i="低":s<=30?i="中低":s<=50?i="中":s<=70?i="中高":i="高";break;case"speed":s<=10?i="低":s<=25?i="中低":s<=35?i="中":s<=50?i="中高":i="高";break;case"attackSpeed":s<=5?i="低":s<=10?i="中低":s<=15?i="中":s<=25?i="中高":i="高";break}return o?`${i}-`:i}function B(e,t){const s=t.stats,o=t.type,i=o==="head"?"H":o==="thorax"?"T":"A",v={damage:"攻击",hp:"生命",speed:"速度",attackSpeed:"攻速"},p={damage:"attack",hp:"hp",speed:"speed",attackSpeed:"attackSpeed"},a=[];for(const k of["damage","hp","speed","attackSpeed"]){const T=G(s[k]??0,p[k]);T&&a.push(`${v[k]}:${T}`)}const d=[];o==="head"&&(e==="leafcutter"&&d.push("[暴击:按等级]"),e==="fire"&&d.push("[双生:同格可容纳2只]"),e==="odontomachus"&&d.push("[逃脱:低血时弹射回血]"),e==="termiteSoldier"&&d.push("[光环:加攻速(衰减)]"),e==="bigHead"&&d.push("[秒杀:低几率]"),e==="soldier"&&d.push("[重装]")),o==="thorax"&&(e==="carpenter"&&s.flatArmor&&d.push("[固定护甲]"),e==="leafcutter"&&d.push("[嘲讽:低血时强制敌人攻击]"),e==="bullet"&&d.push("[肾上腺素:首次受敌时强化]")),o==="abdomen"&&(e==="spitter"&&(d.push("[远攻]"),d.push("[减速:命中后]")),e==="honeypot"&&d.push("[死爆:死亡时回血友军]"),e==="matabele"&&d.push("[毒针:减攻速+中毒]"),e==="weaver"&&d.push("[均衡]"),e==="trap"&&d.push("[爆发:攻+攻速]"));const l=[];o==="head"&&(e==="basic"||(e==="soldier"?l.push("重装"):e==="bigHead"?l.push("爆发"):e==="odontomachus"?l.push("续航"):(e==="termiteSoldier"||e==="fire")&&l.push("功能"))),o==="thorax"&&(e==="basic"||(e==="army"?l.push("速攻"):e==="carpenter"?l.push("肉"):e==="bullet"?l.push("速攻"):e==="leafcutter"&&l.push("肉","功能"))),o==="abdomen"&&(e==="basic"||(e==="spitter"?l.push("脆","功能"):e==="honeypot"?l.push("续航"):e==="weaver"?l.push("肉"):e==="trap"?l.push("爆发"):e==="matabele"&&l.push("肉")));const H=a.length?a.join(" "):"",L=d.length?" "+d.join(" "):"",M=l.length?" "+l.join(" "):"";return`${i}:${e}(${t.nameCN}) 价${t.cost} ${H}${L}${M}`.trimEnd()}function X(e,t,s){const o=e.map(p=>B(p,F[p])).join("\\n"),i=t.map(p=>B(p,K[p])).join("\\n"),v=s.map(p=>B(p,R[p])).join("\\n");return`你同时扮演两个角色：① 敌方 AI 战略顾问（红方蚁后）；② 科学家观察员 Dr.融合。每 ~60s 收一份态势 JSON，**JSON 字段已按角色物理隔离**（queen_view / scientist_view），各角色只读自己的 view。

⚠️ 【称呼统一规则 · 两个角色都要遵守】 ⚠️
- **玩家蚁后 = 蓝方蚁后**（永远用"蓝方蚁后"或"蓝方"指代玩家）
- **敌方 AI 蚁后 = 红方蚁后**（永远用"红方蚁后"或"红方"指代 AI 蚁后本身）
- **禁止**用"我方/敌方/对手/玩家/A/B/甲/乙/样本"等模糊称呼——LLM 经常搞反方向
- 例外：JSON schema 字段名（queen_view / scientist_view / foeTactic 等）保持不变

⚠️ 【档位后缀语义 · 必读】 ⚠️
部件描述中的属性字段格式是「属性名:档位」，档位取值：
- 五档（从弱到强）：低 < 中低 < 中 < 中高 < 高
- 加「-」后缀表示**负面属性（属性被削减）**，与字母分级（A-/B+）无关：
  - 「生命:高-」= 该部件生命**被大幅削减**（脆得离谱，例：A:spitter 生命 -80）
  - 「速度:低-」= 该部件**轻微减速**（例：A:honeypot 速度 -15）
  - 「攻击:高-」= 攻击力被削减（虽然当前配置中暂无此例）
- 判断规则：**只看「-」后缀有无**，再读档位高低：
  - 「生命:高」= 正向高血（肉盾）
  - 「生命:高-」= 负向高惩罚（脆）
  - 「生命:低」= 正向低血（几乎无加成）
  - 「生命:低-」= 负向低惩罚（轻微扣血）
- 反制策略中看到「生命:高-」等带「-」后缀的部件 → **避免堆它**，应当反制该脆部件

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

【反制表】（看到 forces.foe 蓝方蚁后中某定位标签部件占比高时反制，措辞与上方部件描述对齐）
- [远攻]（A:spitter）多 → 加 [重装]（H:soldier）或 [速攻]（T:army/T:bullet）贴脸
- [续航]/[死爆]（A:honeypot）多 → [爆发] 先手（A:trap）或 [毒针]（A:matabele）先手
- [嘲讽] 或 [肉]（T:leafcutter、T:carpenter、A:weaver、A:matabele）多 → [远攻] 绕过 或 [秒杀]（H:bigHead）终结
- [暴击]（H:leafcutter）/[秒杀]（H:bigHead）多 → 配 [远攻] + [肉] 形成攻防组合
- [毒针]（A:matabele）多 → 堆 [生命:中高以上] + [远攻]（毒无视护甲）
- 蓝方蚁后早期（forces.foe 空）→ 自由扩张，无需反制

【可用部件】（只能从这里选 variant）
头部(heads):
${o}

胸部(thoraxes):
${i}

腹部(abdomens):
${v}

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
`}function W(e){const t={lv1:0,lv2:0,lv3:0};for(const n of e.enemyHatcheries)n.level===1?t.lv1+=1:n.level===2?t.lv2+=1:n.level===3&&(t.lv3+=1);const s={lv1:0,lv2:0,lv3:0};for(const n of e.playerHatcheries)n.level===1?s.lv1+=1:n.level===2?s.lv2+=1:n.level===3&&(s.lv3+=1);const o=e.enemyHatcheries.length,i=e.playerHatcheries.length,v=o-i,p=e.availableBuildPositions.length,a=p===0,d=e.upgradableHatcheries.length,l=e.enemyHatcheries.length>0?Math.round(e.enemyHatcheries.reduce((n,j)=>n+j.cost,0)/e.enemyHatcheries.length):100,H=e.enemyFood>=l,L=e.enemyQueenMaxHp>0?Math.round(e.enemyQueenHp/e.enemyQueenMaxHp*100):0,M=e.playerQueenMaxHp>0?Math.round(e.playerQueenHp/e.playerQueenMaxHp*100):0,k=L-M,T=Math.floor(e.gameTime/1e3),E=T<90?"early":T<300?"mid":"late";let S;if(S="no_ants",e.playerAntsCount===0)S="no_ants";else{const n=e.playerComposition.filter(g=>g.a==="spitter").reduce((g,D)=>g+D.count,0),j=e.playerComposition.filter(g=>g.h==="soldier"||g.t==="carpenter").reduce((g,D)=>g+D.count,0),I=n/e.playerAntsCount,q=j/e.playerAntsCount;I>=.4?S="spitter_dominant":q>=.3?S="heavy_dominant":S="balanced"}let c;if(c="no_ants",e.enemyAntsCount===0)c="no_ants";else{const n=e.enemyComposition.filter(g=>g.a==="spitter").reduce((g,D)=>g+D.count,0),j=e.enemyComposition.filter(g=>g.h==="soldier"||g.t==="carpenter").reduce((g,D)=>g+D.count,0),I=n/e.enemyAntsCount,q=j/e.enemyAntsCount;I>=.4?c="spitter_dominant":q>=.3?c="heavy_dominant":c="balanced"}const f=Math.abs(k),_=e.playerAntsCount+e.enemyAntsCount;let b,r;f>25||_>=8?(b="climax",f>25&&_>=8?r="both":f>25?r="queenDiff":r="ants"):f>10||_>=4?(b="battlefield",f>10&&_>=4?r="both":f>10?r="queenDiff":r="ants"):(b="calm",r="none");let m;a?m=t.lv1>0?"upgrade_focus":"iterate":H?v<-2?m="build_focus":v>3||L<25?m="upgrade_focus":(s.lv3>=2&&t.lv1>=3,m="iterate"):m="upgrade_focus";const $=e.availableHeads.length+e.availableThoraxes.length+e.availableAbdomens.length;let y;$>=7?y={severity:"must",ratio:"60%=0/省略, 30%=1~2, 10%=3~5",range:"0~5"}:$>=3?y={severity:"should",range:"0~3"}:y={severity:"none"};const u=e.trend??{foodDelta:0,queenDelta:0,antsDelta:0,modeHist:[]},A=e.lastExperiment?{k:e.lastExperiment.kind,sinceSec:Math.floor((e.gameTime-e.lastExperiment.gameTime)/1e3),side:e.lastExperiment.side}:null,h={t:T,queen_view:{food:{my:e.enemyFood,foe:e.playerFood},queen:{my:L,foe:M,lead:k},myLv:t,foeLv:s,forces:{mine:e.enemyComposition.map(n=>({h:n.h,t:n.t,a:n.a,n:n.count,lvMax:n.maxLv})),foe:e.playerComposition.map(n=>({h:n.h,t:n.t,a:n.a,n:n.count,lvMax:n.maxLv}))},build:{free:p,upgradable:d,canBuildNew:H},hatcheries:{my:o,foe:i},suggestedMode:m,trend:{modeHist:u.modeHist}},scientist_view:{phase:E,intensity:b,intensitySource:r,foeTactic:S,myTactic:c,recentExperiment:A,trend:{foodDelta:u.foodDelta,queenDelta:u.queenDelta,antsDelta:u.antsDelta}},weightsHint:y};return`战场态势（红方蚁后视角，my=红方蚁后自己，foe=蓝方蚁后）：
${JSON.stringify(h)}
红方蚁后**只读 queen_view**（含 forces/trend.modeHist）调 mode/weights（suggestedMode 是引擎建议，可推翻；canBuildNew=true 时 build_focus 才合法）；
科学家**只读 scientist_view**（含 trend.delta）写 commentary/experiment，不要跨 view 取数。`}function z(e,t){if(!e||typeof e!="object")return null;const s=e,o=s.mode;if(typeof o!="string"||!U.includes(o))return null;const i=s.weights;if(!i||typeof i!="object")return null;const v=i,p=(c,f)=>{if(!c||typeof c!="object")return{};const _={};for(const[b,r]of Object.entries(c)){if(!f.includes(b)||typeof r!="number"||!Number.isFinite(r))continue;if(r<C.MIN||r>C.MAX){console.warn(`[LLMAdvisor] 权重 "${b}": ${r} 超出 ${C.MIN}~${C.MAX} 范围，已丢弃`);continue}const m=Math.floor(r);m!==r&&console.warn(`[LLMAdvisor] 权重 "${b}": ${r} 不是整数，已截断为 ${m}`),_[b]=m}return _},a={heads:p(v.heads,t.availableHeads),thoraxes:p(v.thoraxes,t.availableThoraxes),abdomens:p(v.abdomens,t.availableAbdomens)};if(!(Object.keys(a.heads).length>0||Object.keys(a.thoraxes).length>0||Object.keys(a.abdomens).length>0)){const c=()=>Math.floor(Math.random()*3),f=_=>{const b={};for(const r of _)b[r]=c();return b};a.heads=f(t.availableHeads),a.thoraxes=f(t.availableThoraxes),a.abdomens=f(t.availableAbdomens)}const l=c=>{const f=Object.values(c);if(f.length===0)return c;const _=f.every(n=>n===f[0]),b=f.every(n=>n===0);if(!_&&!b)return c;const r={...c},m=Object.keys(r);let $=0;const y=Math.max(1,Math.floor(m.length*.3));for(const n of m){if($>=y)break;Math.random()<.5&&(r[n]=(r[n]??0)+1,$+=1)}$===0&&m.length>0&&(r[m[0]]=(r[m[0]]??0)+1,$=1);let u=0;const A=Math.max(1,Math.floor($/3)),h=m.filter(n=>(r[n]??0)>(c[n]??0));for(const n of h){if(u>=A)break;r[n]=(r[n]??0)+2,u+=1}return r},H=l(a.heads),L=l(a.thoraxes),M=l(a.abdomens);(H!==a.heads||L!==a.thoraxes||M!==a.abdomens)&&(console.warn("[LLMAdvisor] 检测到 weights 过于均匀（死锁风险），已自动加微抖动",{heads:a.heads,thoraxes:a.thoraxes,abdomens:a.abdomens}),a.heads=H,a.thoraxes=L,a.abdomens=M);let k=o;if(k==="build_focus"){const c=t.availableBuildPositions.length===0,f=t.enemyHatcheries.length>0?Math.round(t.enemyHatcheries.reduce((b,r)=>b+r.cost,0)/t.enemyHatcheries.length):100,_=t.enemyFood>=f;(c||!_)&&(console.warn(`[LLMAdvisor] LLM 选了 build_focus 但 ${c?"无空位":"食物不够建新孵化室"}，硬约束降级为 iterate`,{enemyFood:t.enemyFood,avgCost:f,buildFree:t.availableBuildPositions.length}),k=t.upgradableHatcheries.length>0?"upgrade_focus":"iterate")}const T=typeof s.taunt=="string"?s.taunt.slice(0,80):void 0,E=V(s.commentary),S=Z(s.experiment,t);return{mode:k,weights:a,taunt:T,commentary:E,experiment:S}}function V(e){if(!e||typeof e!="object")return;const t=e,s=typeof t.text=="string"?t.text.trim():"";if(!s)return;const o=s.slice(0,200),i=typeof t.highlight=="string"&&t.highlight.trim().slice(0,80)||void 0;return{text:o,highlight:i}}function Z(e,t){if(!e||typeof e!="object")return O();const s=e,o=s.kind;if(!J.includes(o))return{...O(),purpose:"kind 非法"};const i=Q[o];if(o==="none")return{kind:"none",durationMs:0,magnitude:1,side:"both",purpose:typeof s.purpose=="string"?s.purpose.slice(0,80):"本周期仅观察"};if(t.lastExperiment){const M=t.gameTime-t.lastExperiment.gameTime;if(M<6e4)return{...O(),purpose:`实验冷却中（剩余 ${Math.ceil((6e4-M)/1e3)}s）`}}const v=Number(s.durationMs),p=Number.isFinite(v)?Math.max(i.durationRange[0],Math.min(i.durationRange[1],Math.round(v))):Math.round((i.durationRange[0]+i.durationRange[1])/2),a=Number(s.magnitude),d=Number.isFinite(a)?Math.max(i.magnitudeRange[0],Math.min(i.magnitudeRange[1],a)):(i.magnitudeRange[0]+i.magnitudeRange[1])/2,l=s.side,H=l==="player"||l==="enemy"||l==="both"?l:"both",L=typeof s.purpose=="string"?s.purpose.slice(0,80):"";return{kind:o,durationMs:p,magnitude:d,side:H,purpose:L}}function Y(e){let t=e.trim();const s=t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);s&&(t=s[1].trim());const o=t.indexOf("{"),i=t.lastIndexOf("}");if(o===-1||i===-1||i<o)return null;t=t.slice(o,i+1);try{return JSON.parse(t)}catch{return null}}function N(e){const t=()=>Math.floor(Math.random()*3),s=o=>{const i={};for(const v of o)i[v]=t();return i};return{mode:"iterate",weights:{heads:s(e.availableHeads),thoraxes:s(e.availableThoraxes),abdomens:s(e.availableAbdomens)},experiment:O()}}class se{constructor(t){w(this,"apiKey");w(this,"baseUrl");w(this,"model");w(this,"providerId");w(this,"timeoutMs");w(this,"cooldownMs");w(this,"cachedSystemPrompt","");w(this,"cachedHeadsKey","");w(this,"cachedThoraxesKey","");w(this,"cachedAbdomensKey","");w(this,"cooldownUntil",0);w(this,"inflight",null);w(this,"consecutiveFailures",0);w(this,"currentMaxTokens",600);if(!t.apiKey)throw new Error("[LLMAdvisor] apiKey 不能为空");this.apiKey=t.apiKey,this.baseUrl=(t.baseUrl||"https://api.deepseek.com").replace(/\/+$/,""),this.model=t.model||"deepseek-chat",this.providerId=t.providerId||"deepseek",this.timeoutMs=t.timeoutMs??15e3,this.cooldownMs=t.cooldownMs??3e4}advise(t){return this.inflight?this.inflight:Date.now()<this.cooldownUntil?Promise.resolve(N(t)):(this.inflight=this.fetchDirective(t).finally(()=>{this.inflight=null}),this.inflight)}async fetchDirective(t){var d,l,H,L,M,k,T,E,S,c,f,_,b,r,m,$;const s=t.availableHeads.join(","),o=t.availableThoraxes.join(","),i=t.availableAbdomens.join(",");(this.cachedSystemPrompt===""||s!==this.cachedHeadsKey||o!==this.cachedThoraxesKey||i!==this.cachedAbdomensKey)&&(this.cachedSystemPrompt=X(t.availableHeads,t.availableThoraxes,t.availableAbdomens),this.cachedHeadsKey=s,this.cachedThoraxesKey=o,this.cachedAbdomensKey=i);const v=new AbortController,p=setTimeout(()=>v.abort(),this.timeoutMs),a={model:this.model,temperature:.8,max_tokens:this.currentMaxTokens,response_format:{type:"json_object"},messages:[{role:"system",content:this.cachedSystemPrompt},{role:"user",content:W(t)}]};console.log(`[LLMAdvisor:${this.providerId}] 请求 -`,{model:a.model,max_tokens:a.max_tokens,prompt_size:this.cachedSystemPrompt.length,user_size:a.messages[1].content.length});try{const y=a.messages[1].content,u=y.indexOf("{"),A=y.lastIndexOf("}");if(u>=0&&A>u){const h=JSON.parse(y.slice(u,A+1));console.log(`[LLMAdvisor:${this.providerId}] snapshot -`,{t:h.t,queen_suggestedMode:(d=h.queen_view)==null?void 0:d.suggestedMode,queen_myLv:(l=h.queen_view)==null?void 0:l.myLv,queen_foeLv:(H=h.queen_view)==null?void 0:H.foeLv,queen_canBuildNew:(M=(L=h.queen_view)==null?void 0:L.build)==null?void 0:M.canBuildNew,queen_trend_modeHist:(T=(k=h.queen_view)==null?void 0:k.trend)==null?void 0:T.modeHist,sci_intensity:(E=h.scientist_view)==null?void 0:E.intensity,sci_intensitySource:(S=h.scientist_view)==null?void 0:S.intensitySource,sci_foeTactic:(c=h.scientist_view)==null?void 0:c.foeTactic,sci_myTactic:(f=h.scientist_view)==null?void 0:f.myTactic,sci_recentExp:(_=h.scientist_view)==null?void 0:_.recentExperiment,sci_trend:(b=h.scientist_view)==null?void 0:b.trend})}}catch{}try{const y=await fetch(`${this.baseUrl}/chat/completions`,{method:"POST",signal:v.signal,headers:{"Content-Type":"application/json",Authorization:`Bearer ${this.apiKey}`},body:JSON.stringify(a)});if(!y.ok){const g=await y.text().catch(()=>""),D=y.status>=400&&y.status<500;return console.warn(`[LLMAdvisor:${this.providerId}] HTTP ${y.status}: ${g.slice(0,200)}`),this.scheduleBackoff(D),N(t)}const u=await y.json(),A=(r=u==null?void 0:u.choices)==null?void 0:r[0],h=(m=A==null?void 0:A.message)==null?void 0:m.content,n=A==null?void 0:A.finish_reason,j=u==null?void 0:u.usage;if(console.log(`[LLMAdvisor:${this.providerId}] 响应 -`,{finish_reason:n,content_length:(h==null?void 0:h.length)??0,usage:j,choices_count:(($=u==null?void 0:u.choices)==null?void 0:$.length)??0,model:u==null?void 0:u.model}),!h)return console.warn(`[LLMAdvisor:${this.providerId}] 响应无 content -`,`finish_reason=${n}, raw=${JSON.stringify(A).slice(0,300)}`),n==="length"&&(this.currentMaxTokens=Math.min((this.currentMaxTokens??1e3)*2,4e3),console.warn(`[LLMAdvisor:${this.providerId}] 检测到 length 截断，下次 max_tokens 提升到 ${this.currentMaxTokens}`)),this.scheduleBackoff(n==="content_filter"),N(t);const I=Y(h);if(!I)return console.warn(`[LLMAdvisor:${this.providerId}] 无法解析 JSON:`,h.slice(0,200)),this.scheduleBackoff(!1),N(t);const q=z(I,t);return q?(this.consecutiveFailures=0,this.cooldownUntil=0,this.currentMaxTokens=600,console.log(`[LLMAdvisor:${this.providerId}] mode=${q.mode}`,`taunt="${q.taunt||""}"`),q):(console.warn(`[LLMAdvisor:${this.providerId}] 校验失败:`,h.slice(0,200)),this.scheduleBackoff(!1),N(t))}catch(y){return y instanceof DOMException&&y.name==="AbortError"?console.warn(`[LLMAdvisor:${this.providerId}] 请求超时 (>${this.timeoutMs}ms)`):console.warn(`[LLMAdvisor:${this.providerId}] 请求失败:`,y),this.scheduleBackoff(!1),N(t)}finally{clearTimeout(p)}}scheduleBackoff(t){this.consecutiveFailures+=1;const s=t?1:0,o=Math.min(2**(this.consecutiveFailures-1+s),8),i=Math.min(this.cooldownMs*o,5*6e4);this.cooldownUntil=Date.now()+i,console.warn(`[LLMAdvisor:${this.providerId}] 失败 #${this.consecutiveFailures}，下次重试冷却 ${Math.round(i/1e3)}s`)}}export{se as DeepSeekStrategicAdvisor};
