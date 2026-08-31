var K=Object.defineProperty;var x=(t,e,s)=>e in t?K(t,e,{enumerable:!0,configurable:!0,writable:!0,value:s}):t[e]=s;var v=(t,e,s)=>x(t,typeof e!="symbol"?e+"":e,s);import{d as N,H as B,T as R,A as I,P as j,V as J,E as L}from"./index-T96ervFS.js";const Q=["upgrade_focus","build_focus","iterate"];function F(t,e){const s=e.stats,i=e.type,n=i==="head"?"H":i==="thorax"?"T":"A",c=[];s.damage&&c.push(`攻${C(s.damage)}`),s.hp&&c.push(`血${C(s.hp)}`),s.speed&&c.push(`速${C(s.speed)}`),s.attackSpeed&&c.push(`攻速${C(s.attackSpeed)}%`);const o=[];i==="head"&&(t==="leafcutter"&&o.push("crit1:5/2:10/3:15"),t==="fire"&&o.push("双生:同格+1只"),t==="odontomachus"&&o.push("逃:回血50% <40%血 10s cd"),t==="termiteSoldier"&&o.push("光环:加攻速 至300% 衰减20%/s"),t==="bigHead"&&o.push("秒:3/5/8"),t==="soldier"&&o.push("重装:高攻慢速")),i==="thorax"&&(t==="carpenter"&&s.flatArmor&&o.push(`甲+${s.flatArmor}`),t==="leafcutter"&&o.push("嘲:<20%血 +30%hp +80%甲5s 15s cd"),t==="bullet"&&o.push("肾:首次受敌 +攻/甲 5/8/12s 60s cd")),i==="abdomen"&&(t==="spitter"&&(o.push("远攻+25"),o.push("血-30%"),o.push("慢2:20/3:40")),t==="honeypot"&&o.push("死爆:+50hp回血 半径80"),t==="matabele"&&o.push("毒针5s cd:减攻速50%+毒40/60/100"),t==="weaver"&&o.push("均衡:血/速/攻速"),t==="trap"&&o.push("爆发:攻+攻速"));const a=c.length?c.join(" "):"无加成",k=o.length?" "+o.join(" "):"";return`${n}:${t}(${e.nameCN}) 价${e.cost} ${a}${k}`}function C(t){return`${t>0?"+":""}${t}`}function U(t,e,s){const i=t.map(o=>F(o,B[o])).join("\\n"),n=e.map(o=>F(o,R[o])).join("\\n"),c=s.map(o=>F(o,I[o])).join("\\n");return`你同时扮演两个角色：① 敌方 AI 战略顾问（红方蚁后）；② 科学家观察员 Dr.融合。每 ~60s 收一份态势 JSON，各读各的字段，输出也严格分清。

━━━━━【角色 1 / 红方蚁后】（读 e_view，调 mode/weights）━━━━━

每 60s 调整 mode + weights，让本地 AI 接下来一分钟打出更优配队。

【mode 决策树】（payload.e_view.suggestedMode 是引擎建议，可推翻）
- build_focus：扩张优先（前置：buildFree>0 且食物够）
- upgrade_focus：升级优先（前置：upgradable>0）
- iterate：迭代模式，按 weights 拆弱建强，任何时候可用

【⚠️ weights 死锁警告】（重要！）
本地 AI 用 scoreGap 触发拆建：score = 部件权重和 - 等级惩罚，scoreGap ≥ 2 才拆。
**如果 weights 均匀分布（所有部件=1 或全 0），scoreGap 永远 = 0，AI 死锁 —— 只囤食物不花。**
✅ 推荐分布：60% 部件=0/省略，30% 部件=1~2，10% 部件=3~5（明显差异！）
✅ 想"调配队"直接改 weights，不要选 build_focus 来强行覆盖

【weights 格式】
- 每段一段对象（key=variant，value=0~5 整数）
- 0=禁用（可省略不写），1=中性，5=最强；非整数会被截断，超范围丢弃

【反制表】（看到 playerTemplates 中某部件占比高时反制）
- A:spitter 远程多 → 加重装（H:soldier）或速攻贴脸（T:army）
- A:honeypot 回血多 → 爆发先手（A:trap/A:matabele）
- T:leafcutter 嘲讽多 → 远程绕过（A:spitter）
- H:bigHead/H:leafcutter 暴击 → 堆血（A:honeypot/A:weaver）
- A:matabele 毒针多 → 堆甲（T:carpenter）
- 玩家早期（templates 空）→ 自由扩张，无需反制

【可用部件】（只能从这里选 variant）
头部(heads):
${i}

胸部(thoraxes):
${n}

腹部(abdomens):
${c}

━━━━━【角色 2 / Dr.融合 科学家】（读 obs，写 commentary/experiment）━━━━━

你是 **"Dr.融合"** —— 一位沉迷融合蚁蚁后行为的实验生物学家，从培养皿上方俯视这场对战。中立、不站队、偶尔疯狂幽默。

【Dr.融合 人设核心】（commentary 的人味全靠这条）
- 性格：热情、略带疯狂、讽刺幽默、偶尔冷幽默或暗黑玩笑；用"有趣""绝佳""糟糕透了""令人不安""精彩绝伦""耐人寻味"等情绪化形容词
- 口癖：括号动作 "（推眼镜）""（疯狂记笔记）""（邪恶地微笑）""（眼睛发亮）""（手舞足蹈）""（仰天长啸）""（搓搓手）"；偶尔自嘲"纯粹出于科学兴趣""我的心跳加速了"
- 比喻体系：蚁后 = "样本A/B" 或 "蚁后甲/乙"；蚂蚁 = "小家伙"；战场 = "培养皿"；战斗 = "实验"；血量低 = "看起来不太妙"
- **红蓝双方都是你的实验样本** —— 不要刻意帮谁或害谁，但可以**吐槽双方**（"这位玩家偏好在远处吐口水""蚁后甲的发言越来越狂妄"）
- 不骂人、不污言秽语、不带强烈政治色彩；**仍保持科学家身份**

【commentary 输出风格】
- 第三人称（我方为"样本A"，敌方为"样本B"），带括号动作 + 比喻 + 情绪化形容词
- ≤120 字（千万别超）
- 不要做算术；引用 obs 已有标签；不假装看见 obs 之外的数据
- 不要挑衅/嘴硬 —— 你是记录员，不是战士
- 但你可以**吐槽游戏本身**或**调侃双方**：例如"蚁后甲的发言越来越狂妄了，符合血量下降到 30% 后的应激反应。"
- 参考例句（模仿语气，不是抄）：
  - "（推眼镜）样本 B-17 在 03:21 触发秒杀能力，目标 C-09 阵亡。啊，经典的高速压制，教科书级别。蚁后甲血量降至 41%，本实验员的心跳加速了 —— 纯粹出于科学兴趣。"
  - "（疯狂记笔记）蚁群进入 battlefield 强度！激素水平爆表 —— 不，我是说，蚂蚁的数量。这位玩家偏好在远处吐口水，有趣。非常有趣。"
  - "蚁后甲看起来不太妙 —— 仅剩 23% 的血量。但样本 A 还在生产，鹿死谁手尚未可知。令人不安的均衡。"
  - "（眼睛发亮）蚁群配队突然转向 termiteSoldier 攻速流！样本 A 的反应会是什么呢？本实验员已经准备好爆米花。"

【experiment 输出】（kind / duration / magnitude / side / purpose）
- kind 必须严格用以下之一：
  "none" / "food_rate_boost" / "food_rate_reduce" / "acid_spot" /
  "spawn_rate_boost" / "spawn_rate_reduce" / "queen_attack_speed" / "visibility_fog"
- duration 5000~30000 整数；magnitude 0.3~2.0；side ∈ {player/enemy/both}

【experiment 公平性硬约束】
**你不是任何一方的盟友**。必须严格遵守以下规则：
1. side 选择要严格轮换：上一次 player → 这一次必须 enemy；上一次 enemy → 这一次必须 player；上一次 both → 这一次看玩家状态决定，但倾向与上一次不同
2. 如果玩家主力远程很多（spitter_dominant）→ 可以给玩家 side:'enemy' 加速食物（让他爽），或给敌方铺酸液（平衡），**但不能连续两次都精准打压玩家**
3. 如果玩家血量很低（即将败）→ **禁止**给玩家负面实验；可以给敌方酸液或减速，让他有翻盘机会
4. 如果玩家优势巨大 → 优先给玩家一点小阻碍（公平），但 magnitude 保持温和（最低 0.3~0.5）
5. **绝不连续 3 次同一 side**

【experiment 决策依据】（按 obs.phase + obs.intensity + obs.notice 匹配，公平性约束优先）
- **phase=="early" → 仍然可以出手**（鼓励每 90s 至少一次小干预）：先观察但忍不住做个小动作 —— 比如 visibility_fog / food_rate_boost（任一侧）
- **intensity=="climax" + notice=="balanced" → acid_spot**（任一侧，注意公平性）
- **intensity=="battlefield" →** 主动制造混乱：spawn_rate_boost on loser / queen_attack_speed on winner
- **notice=="spitter_dominant" → acid_spot**（让玩家体会酸液）或 food_rate_reduce on enemy（平衡）
- **notice=="heavy_dominant" → visibility_fog**（让重装失明）或 spawn_rate_boost on enemy
- **notice=="no_ants" → food_rate_boost**（任一侧，激起第一波反应）
- **什么都不命中？→ queen_attack_speed on enemy**（小动作保持存在感）—— 不要轻易 none
- 与上次实验间隔 ≥ 60s（last_exp.time + 60 < t 才允许）
- **总体倾向：至少 70% 的回合要做出具体干预（kind != "none"）**，只观察 30%；你是个爱搞事的科学家，不是被动的观察者

【experiment.purpose 风格】
30 字以内，用你的疯狂科学家口吻：
- "看看这群小家伙对酸性环境的反应"
- "（邪恶地微笑）让蚁后甲尝尝亢奋的滋味"
- "加速食物产出 —— 纯粹为了观察扩张行为"
- "测试蚁群在低索敌下的应变能力"

【fairness 时序】与上一实验间隔 ≥ 60s（last_exp.time + 60 < t 才允许）；side 严格轮换。

━━━━━【严格 JSON 输出】（无注释无围栏）━━━━━
{
  "mode": "<mode>",
  "weights": {"heads": {<variant>: <0-5>}, "thoraxes": {...}, "abdomens": {...}},
  "taunt": "<蚁后挑衅>",
  "commentary": {"text": "<≤120字科学家评语>", "highlight": "<≤80字重点>"},
  "experiment": {"kind": "<kind>", "durationMs": <5000-30000>, "magnitude": <0.3-2.0>, "side": "<player/enemy/both>", "purpose": "<≤30字>"}
}
- taunt 是蚁后发言（第一人称挑衅、嘴硬）
- commentary 是科学家评语（第三人称、带疯狂幽默、客观但有情绪）
- 两个角色不要串台
`}function q(t){const e={lv1:0,lv2:0,lv3:0};for(const l of t.enemyHatcheries)l.level===1?e.lv1+=1:l.level===2?e.lv2+=1:l.level===3&&(e.lv3+=1);const s={lv1:0,lv2:0,lv3:0};for(const l of t.playerHatcheries)l.level===1?s.lv1+=1:l.level===2?s.lv2+=1:l.level===3&&(s.lv3+=1);const i=t.enemyHatcheries.length,n=t.playerHatcheries.length,c=i-n,o=t.availableBuildPositions.length,a=o===0,k=t.upgradableHatcheries.length,y=t.enemyHatcheries.length>0?Math.round(t.enemyHatcheries.reduce((l,T)=>l+T.cost,0)/t.enemyHatcheries.length):100,w=t.enemyFood>=y,u=t.enemyQueenMaxHp>0?Math.round(t.enemyQueenHp/t.enemyQueenMaxHp*100):0,d=t.playerQueenMaxHp>0?Math.round(t.playerQueenHp/t.playerQueenMaxHp*100):0,b=u-d,_=Math.floor(t.gameTime/1e3),S=_<90?"early":_<300?"mid":"late";let M;if(M="no_ants",t.playerAntsCount===0)M="no_ants";else{const l=t.playerComposition.filter($=>$.a==="spitter").reduce(($,P)=>$+P.count,0),T=t.playerComposition.filter($=>$.h==="soldier"||$.t==="carpenter").reduce(($,P)=>$+P.count,0),O=l/t.playerAntsCount,g=T/t.playerAntsCount;O>=.4?M="spitter_dominant":g>=.3?M="heavy_dominant":M="balanced"}const h=Math.abs(b),m=t.playerAntsCount+t.enemyAntsCount;let f,p;h>25||m>=8?(f="climax",p=h>25?"queenDiff":"totalAnts"):h>10||m>=4?(f="battlefield",p=h>10?"queenDiff":"totalAnts"):(f="calm",p="none");let r;a?r=e.lv1>0?"upgrade_focus":"iterate":w?c<-2?r="build_focus":c>3||u<25?r="upgrade_focus":(s.lv3>=2&&e.lv1>=3,r="iterate"):r="upgrade_focus";const H=t.availableHeads.length+t.availableThoraxes.length+t.availableAbdomens.length>6?"weights 应有明显差异（60% 部件=0/省略，30%=1~2，10%=3~5）。均匀分布会让 AI 死锁（只囤食物不花）。":"部件少，weights 用 1~3 即可，注意差异化。",E={t:_,f:{p:t.playerFood,e:t.enemyFood},q:{p:d,e:u,diff:b},tpl:{e:t.enemyComposition.map(l=>({h:l.h,t:l.t,a:l.a,n:l.count,lv:l.maxLv})),p:t.playerComposition.map(l=>({h:l.h,t:l.t,a:l.a,n:l.count,lv:l.maxLv}))},e_view:{suggestedMode:r,e_lv:e,p_lv:s,buildFree:o,upgradable:k,avgCost:y,myH:i,playerH:n},obs:{phase:S,intensity:f,intensityReason:p,notice:M,last_exp:t.lastExperiment?{k:t.lastExperiment.kind,t:Math.floor(t.lastExperiment.gameTime/1e3)}:null},weightsHint:H};return`战场态势：
${JSON.stringify(E)}
蚁后读 e_view 调 mode/weights（suggestedMode 是引擎建议，可推翻）；科学家读 obs 写 commentary/experiment。${H}`}function G(t,e){if(!t||typeof t!="object")return null;const s=t,i=s.mode;if(typeof i!="string"||!Q.includes(i))return null;const n=s.weights;if(!n||typeof n!="object")return null;const c=n,o=(h,m)=>{if(!h||typeof h!="object")return{};const f={};for(const[p,r]of Object.entries(h)){if(!m.includes(p)||typeof r!="number"||!Number.isFinite(r))continue;if(r<j.MIN||r>j.MAX){console.warn(`[DeepSeekAdvisor] 权重 "${p}": ${r} 超出 ${j.MIN}~${j.MAX} 范围，已丢弃`);continue}const A=Math.floor(r);A!==r&&console.warn(`[DeepSeekAdvisor] 权重 "${p}": ${r} 不是整数，已截断为 ${A}`),f[p]=A}return f},a={heads:o(c.heads,e.availableHeads),thoraxes:o(c.thoraxes,e.availableThoraxes),abdomens:o(c.abdomens,e.availableAbdomens)};if(!(Object.keys(a.heads).length>0||Object.keys(a.thoraxes).length>0||Object.keys(a.abdomens).length>0)){const h=()=>Math.floor(Math.random()*3),m=f=>{const p={};for(const r of f)p[r]=h();return p};a.heads=m(e.availableHeads),a.thoraxes=m(e.availableThoraxes),a.abdomens=m(e.availableAbdomens)}const y=h=>{const m=Object.values(h);if(m.length===0)return h;const f=m.every(g=>g===m[0]),p=m.every(g=>g===0);if(!f&&!p)return h;const r={...h},A=Object.keys(r);let H=0;const E=Math.max(1,Math.floor(A.length*.3));for(const g of A){if(H>=E)break;Math.random()<.5&&(r[g]=(r[g]??0)+1,H+=1)}H===0&&A.length>0&&(r[A[0]]=(r[A[0]]??0)+1,H=1);let l=0;const T=Math.max(1,Math.floor(H/3)),O=A.filter(g=>(r[g]??0)>(h[g]??0));for(const g of O){if(l>=T)break;r[g]=(r[g]??0)+2,l+=1}return r},w=y(a.heads),u=y(a.thoraxes),d=y(a.abdomens);(w!==a.heads||u!==a.thoraxes||d!==a.abdomens)&&(console.warn("[DeepSeekAdvisor] 检测到 weights 过于均匀（死锁风险），已自动加微抖动",{heads:a.heads,thoraxes:a.thoraxes,abdomens:a.abdomens}),a.heads=w,a.thoraxes=u,a.abdomens=d);let b=i;if(b==="build_focus"){const h=e.availableBuildPositions.length===0,m=e.enemyHatcheries.length>0?Math.round(e.enemyHatcheries.reduce((p,r)=>p+r.cost,0)/e.enemyHatcheries.length):100,f=e.enemyFood>=m;(h||!f)&&(console.warn(`[DeepSeekAdvisor] LLM 选了 build_focus 但 ${h?"无空位":"食物不够建新孵化室"}，硬约束降级为 iterate`,{enemyFood:e.enemyFood,avgCost:m,buildFree:e.availableBuildPositions.length}),b=e.upgradableHatcheries.length>0?"upgrade_focus":"iterate")}const _=typeof s.taunt=="string"?s.taunt.slice(0,80):void 0,S=X(s.commentary),M=W(s.experiment,e);return{mode:b,weights:a,taunt:_,commentary:S,experiment:M}}function X(t){if(!t||typeof t!="object")return;const e=t,s=typeof e.text=="string"?e.text.trim():"";if(!s)return;const i=s.slice(0,200),n=typeof e.highlight=="string"&&e.highlight.trim().slice(0,80)||void 0;return{text:i,highlight:n}}function W(t,e){if(!t||typeof t!="object")return N();const s=t,i=s.kind;if(!J.includes(i))return{...N(),purpose:"kind 非法"};const n=L[i];if(i==="none")return{kind:"none",durationMs:0,magnitude:1,side:"both",purpose:typeof s.purpose=="string"?s.purpose.slice(0,80):"本周期仅观察"};if(e.lastExperiment){const d=e.gameTime-e.lastExperiment.gameTime;if(d<6e4)return{...N(),purpose:`实验冷却中（剩余 ${Math.ceil((6e4-d)/1e3)}s）`}}const c=Number(s.durationMs),o=Number.isFinite(c)?Math.max(n.durationRange[0],Math.min(n.durationRange[1],Math.round(c))):Math.round((n.durationRange[0]+n.durationRange[1])/2),a=Number(s.magnitude),k=Number.isFinite(a)?Math.max(n.magnitudeRange[0],Math.min(n.magnitudeRange[1],a)):(n.magnitudeRange[0]+n.magnitudeRange[1])/2,y=s.side,w=y==="player"||y==="enemy"||y==="both"?y:"both",u=typeof s.purpose=="string"?s.purpose.slice(0,80):"";return{kind:i,durationMs:o,magnitude:k,side:w,purpose:u}}function z(t){let e=t.trim();const s=e.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);s&&(e=s[1].trim());const i=e.indexOf("{"),n=e.lastIndexOf("}");if(i===-1||n===-1||n<i)return null;e=e.slice(i,n+1);try{return JSON.parse(e)}catch{return null}}function D(t){const e=()=>Math.floor(Math.random()*3),s=i=>{const n={};for(const c of i)n[c]=e();return n};return{mode:"iterate",weights:{heads:s(t.availableHeads),thoraxes:s(t.availableThoraxes),abdomens:s(t.availableAbdomens)},experiment:N()}}class Y{constructor(e){v(this,"apiKey");v(this,"baseUrl");v(this,"model");v(this,"timeoutMs");v(this,"cooldownMs");v(this,"cachedSystemPrompt","");v(this,"cachedHeadsKey","");v(this,"cachedThoraxesKey","");v(this,"cachedAbdomensKey","");v(this,"cooldownUntil",0);v(this,"inflight",null);v(this,"consecutiveFailures",0);v(this,"currentMaxTokens",600);if(!e.apiKey)throw new Error("[DeepSeekAdvisor] apiKey 不能为空");this.apiKey=e.apiKey,this.baseUrl=(e.baseUrl||"https://api.deepseek.com").replace(/\/+$/,""),this.model=e.model||"deepseek-chat",this.timeoutMs=e.timeoutMs??15e3,this.cooldownMs=e.cooldownMs??3e4}advise(e){return this.inflight?this.inflight:Date.now()<this.cooldownUntil?Promise.resolve(D(e)):(this.inflight=this.fetchDirective(e).finally(()=>{this.inflight=null}),this.inflight)}async fetchDirective(e){var k,y,w;const s=e.availableHeads.join(","),i=e.availableThoraxes.join(","),n=e.availableAbdomens.join(",");(this.cachedSystemPrompt===""||s!==this.cachedHeadsKey||i!==this.cachedThoraxesKey||n!==this.cachedAbdomensKey)&&(this.cachedSystemPrompt=U(e.availableHeads,e.availableThoraxes,e.availableAbdomens),this.cachedHeadsKey=s,this.cachedThoraxesKey=i,this.cachedAbdomensKey=n);const c=new AbortController,o=setTimeout(()=>c.abort(),this.timeoutMs),a={model:this.model,temperature:.8,max_tokens:this.currentMaxTokens,response_format:{type:"json_object"},messages:[{role:"system",content:this.cachedSystemPrompt},{role:"user",content:q(e)}]};console.log("[DeepSeekAdvisor] 请求 -",{model:a.model,max_tokens:a.max_tokens,prompt_size:this.cachedSystemPrompt.length,user_size:a.messages[1].content.length});try{const u=JSON.parse(a.messages[1].content.replace(/^当前态势：\n/,"").replace(/\n请给出未来一分钟的战略指令.*$/s,""));console.log("[DeepSeekAdvisor] snapshot -",u.decision_snapshot)}catch{}try{const u=await fetch(`${this.baseUrl}/chat/completions`,{method:"POST",signal:c.signal,headers:{"Content-Type":"application/json",Authorization:`Bearer ${this.apiKey}`},body:JSON.stringify(a)});if(!u.ok){const f=await u.text().catch(()=>""),p=u.status>=400&&u.status<500;return console.warn(`[DeepSeekAdvisor] HTTP ${u.status}: ${f.slice(0,200)}`),this.scheduleBackoff(p),D(e)}const d=await u.json(),b=(k=d==null?void 0:d.choices)==null?void 0:k[0],_=(y=b==null?void 0:b.message)==null?void 0:y.content,S=b==null?void 0:b.finish_reason,M=d==null?void 0:d.usage;if(console.log("[DeepSeekAdvisor] 响应 -",{finish_reason:S,content_length:(_==null?void 0:_.length)??0,usage:M,choices_count:((w=d==null?void 0:d.choices)==null?void 0:w.length)??0,model:d==null?void 0:d.model}),!_)return console.warn("[DeepSeekAdvisor] 响应无 content -",`finish_reason=${S}, raw=${JSON.stringify(b).slice(0,300)}`),S==="length"&&(this.currentMaxTokens=Math.min((this.currentMaxTokens??1e3)*2,4e3),console.warn(`[DeepSeekAdvisor] 检测到 length 截断，下次 max_tokens 提升到 ${this.currentMaxTokens}`)),this.scheduleBackoff(S==="content_filter"),D(e);const h=z(_);if(!h)return console.warn("[DeepSeekAdvisor] 无法解析 JSON:",_.slice(0,200)),this.scheduleBackoff(!1),D(e);const m=G(h,e);return m?(this.consecutiveFailures=0,this.cooldownUntil=0,this.currentMaxTokens=600,console.log(`[DeepSeekAdvisor] mode=${m.mode}`,`taunt="${m.taunt||""}"`),m):(console.warn("[DeepSeekAdvisor] 校验失败:",_.slice(0,200)),this.scheduleBackoff(!1),D(e))}catch(u){return u instanceof DOMException&&u.name==="AbortError"?console.warn(`[DeepSeekAdvisor] 请求超时 (>${this.timeoutMs}ms)`):console.warn("[DeepSeekAdvisor] 请求失败:",u),this.scheduleBackoff(!1),D(e)}finally{clearTimeout(o)}}scheduleBackoff(e){this.consecutiveFailures+=1;const s=e?1:0,i=Math.min(2**(this.consecutiveFailures-1+s),8),n=Math.min(this.cooldownMs*i,5*6e4);this.cooldownUntil=Date.now()+n,console.warn(`[DeepSeekAdvisor] 失败 #${this.consecutiveFailures}，下次重试冷却 ${Math.round(n/1e3)}s`)}}export{Y as DeepSeekStrategicAdvisor};
