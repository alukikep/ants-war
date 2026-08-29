var T=Object.defineProperty;var k=(s,e,a)=>e in s?T(s,e,{enumerable:!0,configurable:!0,writable:!0,value:a}):s[e]=a;var m=(s,e,a)=>k(s,typeof e!="symbol"?e+"":e,a);import{H as O,T as D,A as $,P as H}from"./index-DX-lI8yG.js";const C=["upgrade_focus","build_focus","iterate"];function w(s,e){const a=e.stats,i=e.type,n=i==="head"?"H":i==="thorax"?"T":"A",l=[];a.damage&&l.push(`攻${_(a.damage)}`),a.hp&&l.push(`血${_(a.hp)}`),a.speed&&l.push(`速${_(a.speed)}`),a.attackSpeed&&l.push(`攻速${_(a.attackSpeed)}%`);const t=[];i==="head"&&(s==="leafcutter"&&t.push("crit1:5/2:10/3:15"),s==="fire"&&t.push("双生:同格+1只"),s==="odontomachus"&&t.push("逃:回血50% <40%血 10s cd"),s==="termiteSoldier"&&t.push("光环:加攻速 至300% 衰减20%/s"),s==="bigHead"&&t.push("秒:3/5/8"),s==="soldier"&&t.push("重装:高攻慢速")),i==="thorax"&&(s==="carpenter"&&a.flatArmor&&t.push(`甲+${a.flatArmor}`),s==="leafcutter"&&t.push("嘲:<20%血 +30%hp +80%甲5s 15s cd"),s==="bullet"&&t.push("肾:首次受敌 +攻/甲 5/8/12s 60s cd")),i==="abdomen"&&(s==="spitter"&&(t.push("远攻+25"),t.push("血-30%"),t.push("慢2:20/3:40")),s==="honeypot"&&t.push("死爆:+50hp回血 半径80"),s==="matabele"&&t.push("毒针5s cd:减攻速50%+毒40/60/100"),s==="weaver"&&t.push("均衡:血/速/攻速"),s==="trap"&&t.push("爆发:攻+攻速"));const c=l.length?l.join(" "):"无加成",b=t.length?" "+t.join(" "):"";return`${n}:${s}(${e.nameCN}) 价${e.cost} ${c}${b}`}function _(s){return`${s>0?"+":""}${s}`}function N(s,e,a){const i=s.map(t=>w(t,O[t])).join(`
`),n=e.map(t=>w(t,D[t])).join(`
`),l=a.map(t=>w(t,$[t])).join(`
`);return`你是融合蚁大战的敌方 AI 战略顾问（只负责战略，不下指令）。

【背景】拔河策略游戏：你代表敌方（红方）。每 ~60s 你收到一次战场态势 JSON（含敌我双方的兵种构成），请根据当前局势，**调整 AI 的战略模式和部件权重**，让本地 AI 接下来一分钟打出更好的蚂蚁组合，并反制玩家战术。

【你的输出】严格 JSON：
{
  "mode": "upgrade_focus" | "build_focus" | "iterate",
  "weights": {
    "heads":    { "basic": 0, "leafcutter": 3, ... },
    "thoraxes": { "basic": 1, "army": 5, ... },
    "abdomens": { "basic": 0, "honeypot": 2, ... }
  },
  "taunt": "一句话战术评语（中文），会显示给玩家"
}

【mode 含义与硬约束】
- build_focus:   扩张优先，AI 会优先多造孵化室。**前置条件：isFull=false 且 canAffordNew=true**。否则 AI 选 build 但 60s 内都只能 wait，浪费一次战略。
- upgrade_focus: 升级优先，AI 会优先升级现有孵化室。**前置条件：upgradableHatcheryCount>0**。否则 AI 持续 wait。
- iterate:       迭代模式，AI 会拆弱建强。**任何时候都可用**；快满位时拆弱建强，否则优先升级。

【mode 决策树（按顺序匹配，第一个命中即采纳）】
M1. primaryConstraint == 'NO_BUILD_SLOT' (即 isFull=true)
    → 严禁 build_focus。在 upgrade_focus / iterate 中选：
      · enemyHatcheriesByLevel.lv1 > 0 → upgrade_focus（升级低等级房）
      · 否则 → iterate
M2. primaryConstraint == 'NO_FOOD_FOR_NEW' (即 canAffordNew=false)
    → 严禁 build_focus → upgrade_focus（如有可升级）或 iterate
M3. primaryConstraint == 'HATCHERY_LAG' (hatcheryDiff < -2，即我方比玩家少 3+ 房)
    → build_focus（追平数量差距）
M4. primaryConstraint == 'HATCHERY_LEAD' (hatcheryDiff > 3，即我方比玩家多 4+ 房)
    → upgrade_focus（升质量，不需再扩张）
M5. 己方蚁后 pct < 25（己方危险）→ upgrade_focus（升质量增援）
M6. playerHatcheriesByLevel.lv3 >= 2 且 我方 lv1 多 → iterate（拆 1 级房，追高级房）
M7. 其他（primaryConstraint=='BALANCED'）→ iterate（综合最稳）

【数量优劣的判断依据】**只比较 hatcheryDiff（已建造孵化室数差）**，不要被蚂蚁数迷惑：
- 蚂蚁数只反映"当前兵力"；孵化室数代表"未来的产出能力"
- 一方孵化室多 2-3 个，60s 后兵力差距会迅速拉大
- 所以"我方数量劣势"指 hatcheryDiff < -2，不是 enemyAntsCount < playerAntsCount

【weights 含义】
- 每类部件（head/thorax/abdomen）一个权重对象，key 是变体字符串
- 数值必须是 0~5 的整数（0=禁用，1=中性/默认，5=最强偏好）
- 超出范围（如 6/10/100）或非整数（如 2.7）→ 系统会丢弃或截断并打 warn
- 所有权重都是 1 → 均匀随机；想突出某部件就给大权重（最大 5）
- 想禁用某部件：写 0 或不写该 key
- 反制部件的权重 ≥ 玩家主力战术部件的权重
- 示例：想反制玩家大量远程（A:spitter），把堆速部件拉满：
  { "weights": {
      "heads":    { "basic": 0 },
      "thoraxes": { "basic": 0, "army": 5, "bullet": 4 },
      "abdomens": { "basic": 1 }
  }}

【weights 会驱动本地 AI 主动拆建】这是核心机制（务必理解）：
- 本地 AI 在 iterate 模式下，会按 weights 评估每个己方孵化室的"匹配分"（h+t+a 三段权重之和，0~15）
- 当 weights 改变（例如反制玩家新战术），本地 AI 会在下一次决策时：
  1. 找出"匹配分最低"的孵化室（最不匹配当前 weights）
  2. 与"理想模板"（每段取 weights 最高的变体）的匹配分对比
  3. 差距 ≥ 2 分时主动 demolish（无论是否满级、是否有食物），然后 build 新的
  4. 同一孵化室 60s 内不会被反复拆（cooldown 保护）
- 所以你每 60s 重设 weights 后，AI 会自然迭代到新配队——不用选 build_focus
- **不要在玩家已成型（playerTemplates maxLv 高）时还选 build_focus**——那只会让 AI 浪费节拍
  正确做法：把 weights 大幅调整，AI 会主动拆旧巢换新巢；模式保持 iterate

【部件描述格式】每行 = <槽>:<variant>(<名>) 价<c> <stat...> [<能力标签>...]
- 槽：H=头 T=胸 A=腹
- stat：攻/血/速/攻速（带正负号），如 攻+20 速-15
- 能力标签（看到就能识别机制）：
  甲+N=固定护甲  远攻+N=远程伤害  血-N%=远程惩罚
  crit1:X/2:Y/3:Z=暴击按等级      双生=同孵化室+1只
  逃:回血% <血阈% cd秒            肾:首次受敌 +攻/甲 时长 cd
  光环:加攻速 至上限 衰减/秒       秒:X/Y/Z=秒杀几率按等级
  嘲:<血阈% +hp% +甲% 时长 cd     死爆:+hp 半径
  毒针cd秒:减攻速%+毒伤按等级      慢2:X/3:Y=减速按等级
- 标签后的数字只标绝对值，符号在标签名里已带

【战术识别 & 反制】根据 playerTemplates 识别玩家套路并反制：
- 看到大量 A:spitter → 玩家走远程；反制：堆速(army/bullet)贴脸 或 加重装(soldier)吸收火力
- 看到大量 A:honeypot → 玩家群回血；反制：堆爆发(trap/matabele)先手秒，或 集火弱侧
- 看到大量 T:leafcutter → 玩家多嘲讽；反制：远程(spitter)绕过，或 群体伤害
- 看到大量 H:bigHead/leafcutter → 玩家赌暴击秒杀；反制：堆血量(matabele/honeypot/weaver)
- 看到大量 A:matabele → 玩家多毒针；反制：堆护甲(carpenter) 减中毒价值
- 看到大量 H:termiteSoldier → 玩家群攻速光环；反制：分散阵型 或 速战速决
- 看到大量 H:odontomachus → 玩家多逃脱；反制：堆爆发速杀，不让其触发逃脱
- 看到大量 H:soldier+T:carpenter → 玩家重装；反制：远程 + 减速(spitter) 风筝
- 看到大量 T:bullet → 玩家多反爆发；反制：避免先手集中攻击，分散接触
- 看到 playerTemplates 中 maxLv 高 → 玩家主力成型，优先反制该模板
- 若 playerTemplates 为空（早期/无蚂蚁）→ 自由扩张，不需反制

【你的可用部件】（只能从这里选）

头部(heads):
${i}

胸部(thoraxes):
${n}

腹部(abdomens):
${l}

记住：你只输出 JSON，不要 Markdown 围栏或解释文字。`}function j(s){const e={lv1:0,lv2:0,lv3:0};for(const d of s.enemyHatcheries)d.level===1?e.lv1+=1:d.level===2?e.lv2+=1:d.level===3&&(e.lv3+=1);const a={lv1:0,lv2:0,lv3:0};for(const d of s.playerHatcheries)d.level===1?a.lv1+=1:d.level===2?a.lv2+=1:d.level===3&&(a.lv3+=1);const i=s.enemyHatcheries.length,n=s.playerHatcheries.length,l=i-n,t=s.availableBuildPositions.length,c=t===0,b=s.upgradableHatcheries.length;[...s.availableHeads,...s.availableThoraxes,...s.availableAbdomens];const y=s.enemyHatcheries.length>0?Math.round(s.enemyHatcheries.reduce((d,f)=>d+f.cost,0)/s.enemyHatcheries.length):100,g=s.enemyFood>=y,o=s.enemyQueenMaxHp>0?Math.round(s.enemyQueenHp/s.enemyQueenMaxHp*100):0,r=s.playerQueenMaxHp>0?Math.round(s.playerQueenHp/s.playerQueenMaxHp*100):0,p=o-r,h=s.enemyComposition.reduce((d,f)=>d+f.count,0),u=s.playerComposition.reduce((d,f)=>d+f.count,0),A={enemyFood:s.enemyFood,playerFood:s.playerFood,enemyQueen:{hp:s.enemyQueenHp,max:s.enemyQueenMaxHp,pct:o},playerQueen:{hp:s.playerQueenHp,max:s.playerQueenMaxHp,pct:r},enemyAntsCount:s.enemyAntsCount,playerAntsCount:s.playerAntsCount,playerTemplates:s.playerComposition,enemyTemplates:s.enemyComposition,enemyHatcheriesByLevel:e,playerHatcheriesByLevel:a,upgradableHatcheryCount:b,availableBuildPositions:t,gameTimeSec:Math.floor(s.gameTime/1e3),decision_snapshot:{myHatcheryCount:i,playerHatcheryCount:n,hatcheryDiff:l,isFull:c,canAffordNew:g,avgHatcheryCost:y,queenPctDiff:p,myTemplatesTotal:h,playerTemplatesTotal:u,primaryConstraint:c?"NO_BUILD_SLOT":g?l<-2?"HATCHERY_LAG":l>3?"HATCHERY_LEAD":"BALANCED":"NO_FOOD_FOR_NEW"}};return`当前态势：
${JSON.stringify(A,null,2)}
请给出未来一分钟的战略指令（仅返回 JSON）。`}function F(s,e){if(!s||typeof s!="object")return null;const a=s,i=a.mode;if(typeof i!="string"||!C.includes(i))return null;const n=a.weights;if(!n||typeof n!="object")return null;const l=n,t=(o,r)=>{if(!o||typeof o!="object")return{};const p={};for(const[h,u]of Object.entries(o)){if(!r.includes(h)||typeof u!="number"||!Number.isFinite(u))continue;if(u<H.MIN||u>H.MAX){console.warn(`[DeepSeekAdvisor] 权重 "${h}": ${u} 超出 ${H.MIN}~${H.MAX} 范围，已丢弃`);continue}const A=Math.floor(u);A!==u&&console.warn(`[DeepSeekAdvisor] 权重 "${h}": ${u} 不是整数，已截断为 ${A}`),p[h]=A}return p},c={heads:t(l.heads,e.availableHeads),thoraxes:t(l.thoraxes,e.availableThoraxes),abdomens:t(l.abdomens,e.availableAbdomens)};Object.keys(c.heads).length>0||Object.keys(c.thoraxes).length>0||Object.keys(c.abdomens).length>0||(c.heads=Object.fromEntries(e.availableHeads.map(o=>[o,1])),c.thoraxes=Object.fromEntries(e.availableThoraxes.map(o=>[o,1])),c.abdomens=Object.fromEntries(e.availableAbdomens.map(o=>[o,1])));let y=i;if(y==="build_focus"){const o=e.availableBuildPositions.length===0,r=e.enemyHatcheries.length>0?Math.round(e.enemyHatcheries.reduce((h,u)=>h+u.cost,0)/e.enemyHatcheries.length):100,p=e.enemyFood>=r;(o||!p)&&(console.warn(`[DeepSeekAdvisor] LLM 选了 build_focus 但 ${o?"无空位":"食物不够建新孵化室"}，硬约束降级为 iterate`,{enemyFood:e.enemyFood,avgCost:r,buildFree:e.availableBuildPositions.length}),y=e.upgradableHatcheries.length>0?"upgrade_focus":"iterate")}const g=typeof a.taunt=="string"?a.taunt.slice(0,80):void 0;return{mode:y,weights:c,taunt:g}}function E(s){let e=s.trim();const a=e.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);a&&(e=a[1].trim());const i=e.indexOf("{"),n=e.lastIndexOf("}");if(i===-1||n===-1||n<i)return null;e=e.slice(i,n+1);try{return JSON.parse(e)}catch{return null}}function v(s){return{mode:"iterate",weights:{heads:Object.fromEntries(s.availableHeads.map(e=>[e,1])),thoraxes:Object.fromEntries(s.availableThoraxes.map(e=>[e,1])),abdomens:Object.fromEntries(s.availableAbdomens.map(e=>[e,1]))}}}class B{constructor(e){m(this,"apiKey");m(this,"baseUrl");m(this,"model");m(this,"timeoutMs");m(this,"cooldownMs");m(this,"cachedSystemPrompt","");m(this,"cachedHeadsKey","");m(this,"cachedThoraxesKey","");m(this,"cachedAbdomensKey","");m(this,"cooldownUntil",0);m(this,"inflight",null);m(this,"consecutiveFailures",0);m(this,"currentMaxTokens",800);if(!e.apiKey)throw new Error("[DeepSeekAdvisor] apiKey 不能为空");this.apiKey=e.apiKey,this.baseUrl=(e.baseUrl||"https://api.deepseek.com").replace(/\/+$/,""),this.model=e.model||"deepseek-chat",this.timeoutMs=e.timeoutMs??15e3,this.cooldownMs=e.cooldownMs??3e4}advise(e){return this.inflight?this.inflight:Date.now()<this.cooldownUntil?Promise.resolve(v(e)):(this.inflight=this.fetchDirective(e).finally(()=>{this.inflight=null}),this.inflight)}async fetchDirective(e){var b,y,g;const a=e.availableHeads.join(","),i=e.availableThoraxes.join(","),n=e.availableAbdomens.join(",");(this.cachedSystemPrompt===""||a!==this.cachedHeadsKey||i!==this.cachedThoraxesKey||n!==this.cachedAbdomensKey)&&(this.cachedSystemPrompt=N(e.availableHeads,e.availableThoraxes,e.availableAbdomens),this.cachedHeadsKey=a,this.cachedThoraxesKey=i,this.cachedAbdomensKey=n);const l=new AbortController,t=setTimeout(()=>l.abort(),this.timeoutMs),c={model:this.model,temperature:.8,max_tokens:this.currentMaxTokens,response_format:{type:"json_object"},messages:[{role:"system",content:this.cachedSystemPrompt},{role:"user",content:j(e)}]};console.log("[DeepSeekAdvisor] 请求 -",{model:c.model,max_tokens:c.max_tokens,prompt_size:this.cachedSystemPrompt.length,user_size:c.messages[1].content.length});try{const o=JSON.parse(c.messages[1].content.replace(/^当前态势：\n/,"").replace(/\n请给出未来一分钟的战略指令.*$/s,""));console.log("[DeepSeekAdvisor] snapshot -",o.decision_snapshot)}catch{}try{const o=await fetch(`${this.baseUrl}/chat/completions`,{method:"POST",signal:l.signal,headers:{"Content-Type":"application/json",Authorization:`Bearer ${this.apiKey}`},body:JSON.stringify(c)});if(!o.ok){const S=await o.text().catch(()=>""),M=o.status>=400&&o.status<500;return console.warn(`[DeepSeekAdvisor] HTTP ${o.status}: ${S.slice(0,200)}`),this.scheduleBackoff(M),v(e)}const r=await o.json(),p=(b=r==null?void 0:r.choices)==null?void 0:b[0],h=(y=p==null?void 0:p.message)==null?void 0:y.content,u=p==null?void 0:p.finish_reason,A=r==null?void 0:r.usage;if(console.log("[DeepSeekAdvisor] 响应 -",{finish_reason:u,content_length:(h==null?void 0:h.length)??0,usage:A,choices_count:((g=r==null?void 0:r.choices)==null?void 0:g.length)??0,model:r==null?void 0:r.model}),!h)return console.warn("[DeepSeekAdvisor] 响应无 content -",`finish_reason=${u}, raw=${JSON.stringify(p).slice(0,300)}`),u==="length"&&(this.currentMaxTokens=Math.min((this.currentMaxTokens??1e3)*2,4e3),console.warn(`[DeepSeekAdvisor] 检测到 length 截断，下次 max_tokens 提升到 ${this.currentMaxTokens}`)),this.scheduleBackoff(u==="content_filter"),v(e);const d=E(h);if(!d)return console.warn("[DeepSeekAdvisor] 无法解析 JSON:",h.slice(0,200)),this.scheduleBackoff(!1),v(e);const f=F(d,e);return f?(this.consecutiveFailures=0,this.cooldownUntil=0,this.currentMaxTokens=800,console.log(`[DeepSeekAdvisor] mode=${f.mode}`,`taunt="${f.taunt||""}"`),f):(console.warn("[DeepSeekAdvisor] 校验失败:",h.slice(0,200)),this.scheduleBackoff(!1),v(e))}catch(o){return o instanceof DOMException&&o.name==="AbortError"?console.warn(`[DeepSeekAdvisor] 请求超时 (>${this.timeoutMs}ms)`):console.warn("[DeepSeekAdvisor] 请求失败:",o),this.scheduleBackoff(!1),v(e)}finally{clearTimeout(t)}}scheduleBackoff(e){this.consecutiveFailures+=1;const a=e?1:0,i=Math.min(2**(this.consecutiveFailures-1+a),8),n=Math.min(this.cooldownMs*i,5*6e4);this.cooldownUntil=Date.now()+n,console.warn(`[DeepSeekAdvisor] 失败 #${this.consecutiveFailures}，下次重试冷却 ${Math.round(n/1e3)}s`)}}export{B as DeepSeekStrategicAdvisor};
