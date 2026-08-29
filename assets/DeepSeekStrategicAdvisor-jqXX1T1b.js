var v=Object.defineProperty;var M=(s,e,t)=>e in s?v(s,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):s[e]=t;var c=(s,e,t)=>M(s,typeof e!="symbol"?e+"":e,t);import{H as $,T as O,A as j}from"./index-Co8zyKVi.js";const _=["upgrade_focus","build_focus","iterate"];function S(s,e){const t=e.stats,a=e.type,i=a==="head"?"H":a==="thorax"?"T":"A",n=[];t.damage&&n.push(`攻${A(t.damage)}`),t.hp&&n.push(`血${A(t.hp)}`),t.speed&&n.push(`速${A(t.speed)}`),t.attackSpeed&&n.push(`攻速${A(t.attackSpeed)}%`);const o=[];a==="head"&&(s==="leafcutter"&&o.push("crit1:5/2:10/3:15"),s==="fire"&&o.push("双生:同格+1只"),s==="odontomachus"&&o.push("逃:回血50% <40%血 10s cd"),s==="termiteSoldier"&&o.push("光环:加攻速 至300% 衰减20%/s"),s==="bigHead"&&o.push("秒:3/5/8"),s==="soldier"&&o.push("重装:高攻慢速")),a==="thorax"&&(s==="carpenter"&&t.flatArmor&&o.push(`甲+${t.flatArmor}`),s==="leafcutter"&&o.push("嘲:<20%血 +30%hp +80%甲5s 15s cd"),s==="bullet"&&o.push("肾:首次受敌 +攻/甲 5/8/12s 60s cd")),a==="abdomen"&&(s==="spitter"&&(o.push("远攻+25"),o.push("血-30%"),o.push("慢2:20/3:40")),s==="honeypot"&&o.push("死爆:+50hp回血 半径80"),s==="matabele"&&o.push("毒针5s cd:减攻速50%+毒40/60/100"),s==="weaver"&&o.push("均衡:血/速/攻速"),s==="trap"&&o.push("爆发:攻+攻速"));const l=n.length?n.join(" "):"无加成",f=o.length?" "+o.join(" "):"";return`${i}:${s}(${e.nameCN}) 价${e.cost} ${l}${f}`}function A(s){return`${s>0?"+":""}${s}`}function D(s,e,t){const a=s.map(o=>S(o,$[o])).join(`
`),i=e.map(o=>S(o,O[o])).join(`
`),n=t.map(o=>S(o,j[o])).join(`
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

【mode 含义】
- upgrade_focus: 升级优先，AI 会优先升级现有孵化室
- build_focus:   扩张优先，AI 会优先多造孵化室
- iterate:       迭代模式，AI 会拆弱建强

【weights 含义】
- 每类部件（head/thorax/abdomen）一个权重对象，key 是变体字符串
- 数值 ≥ 0，越大越常被选中；权重为 0 或缺失表示"禁用该部件"
- 所有权重都设为 1 → 均匀随机；想突出某部件就给大权重
- 示例：当前期需要输出"血量高的前排"，可以 abdomen.honeypot=5, abdomen.matabele=4

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
- 看到大量 H:termiteSoldier → 玩家群攻速光环；反制：分散阵型 或 速战速决(build_focus)
- 看到大量 H:odontomachus → 玩家多逃脱；反制：堆爆发速杀，不让其触发逃脱
- 看到大量 H:soldier+T:carpenter → 玩家重装；反制：远程 + 减速(spitter) 风筝
- 看到大量 T:bullet → 玩家多反爆发；反制：避免先手集中攻击，分散接触
- 看到 playerTemplates 中 maxLv 高 → 玩家主力成型，优先反制该模板（提高克制部件权重）
- 若 playerTemplates 为空（早期/无蚂蚁）→ 自由扩张，不需反制

【分析步骤】
1. 读 playerTemplates 识别玩家主力战术 → 决定要堆什么克制部件
2. 看蚁后血量比：危险（<30%）→ 侧重防御/反攻
3. 看蚂蚁数量：劣势（少于对方）→ build_focus 扩张
4. 看蚂蚁数量：优势但孵化室都低等级 → upgrade_focus
5. 中后期有空间 → iterate + 提高高级部件权重
6. 综合 1+4+5 输出 weights；克制部件的权重 ≥ 主要战术部件

【你的可用部件】（只能从这里选）

头部(heads):
${a}

胸部(thoraxes):
${i}

腹部(abdomens):
${n}

记住：你只输出 JSON，不要 Markdown 围栏或解释文字。`}function K(s){const e={enemyFood:s.enemyFood,playerFood:s.playerFood,enemyQueen:{hp:s.enemyQueenHp,max:s.enemyQueenMaxHp,pct:s.enemyQueenMaxHp>0?Math.round(s.enemyQueenHp/s.enemyQueenMaxHp*100):0},playerQueen:{hp:s.playerQueenHp,max:s.playerQueenMaxHp,pct:s.playerQueenMaxHp>0?Math.round(s.playerQueenHp/s.playerQueenMaxHp*100):0},enemyHatcheryCount:s.enemyHatcheries.length,enemyHatcheries:s.enemyHatcheries.map(t=>({id:t.id,level:t.level,template:t.template})),enemyAntsCount:s.enemyAntsCount,playerAntsCount:s.playerAntsCount,playerTemplates:s.playerComposition,enemyTemplates:s.enemyComposition,availableBuildPositions:s.availableBuildPositions.length,upgradableHatcheryCount:s.upgradableHatcheries.length,gameTimeSec:Math.floor(s.gameTime/1e3)};return`当前态势：
${JSON.stringify(e,null,2)}
请给出未来一分钟的战略指令（仅返回 JSON）。`}function N(s,e){if(!s||typeof s!="object")return null;const t=s,a=t.mode;if(typeof a!="string"||!_.includes(a))return null;const i=t.weights;if(!i||typeof i!="object")return null;const n=i,o=(h,u)=>{if(!h||typeof h!="object")return{};const r={};for(const[m,d]of Object.entries(h))u.includes(m)&&typeof d=="number"&&d>=0&&Number.isFinite(d)&&(r[m]=d);return r},l={heads:o(n.heads,e.availableHeads),thoraxes:o(n.thoraxes,e.availableThoraxes),abdomens:o(n.abdomens,e.availableAbdomens)};Object.keys(l.heads).length>0||Object.keys(l.thoraxes).length>0||Object.keys(l.abdomens).length>0||(l.heads=Object.fromEntries(e.availableHeads.map(h=>[h,1])),l.thoraxes=Object.fromEntries(e.availableThoraxes.map(h=>[h,1])),l.abdomens=Object.fromEntries(e.availableAbdomens.map(h=>[h,1])));const y=typeof t.taunt=="string"?t.taunt.slice(0,80):void 0;return{mode:a,weights:l,taunt:y}}function C(s){let e=s.trim();const t=e.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);t&&(e=t[1].trim());const a=e.indexOf("{"),i=e.lastIndexOf("}");if(a===-1||i===-1||i<a)return null;e=e.slice(a,i+1);try{return JSON.parse(e)}catch{return null}}function p(s){return{mode:"iterate",weights:{heads:Object.fromEntries(s.availableHeads.map(e=>[e,1])),thoraxes:Object.fromEntries(s.availableThoraxes.map(e=>[e,1])),abdomens:Object.fromEntries(s.availableAbdomens.map(e=>[e,1]))}}}class F{constructor(e){c(this,"apiKey");c(this,"baseUrl");c(this,"model");c(this,"timeoutMs");c(this,"cooldownMs");c(this,"cachedSystemPrompt","");c(this,"cachedHeadsKey","");c(this,"cachedThoraxesKey","");c(this,"cachedAbdomensKey","");c(this,"cooldownUntil",0);c(this,"inflight",null);c(this,"consecutiveFailures",0);c(this,"currentMaxTokens",800);if(!e.apiKey)throw new Error("[DeepSeekAdvisor] apiKey 不能为空");this.apiKey=e.apiKey,this.baseUrl=(e.baseUrl||"https://api.deepseek.com").replace(/\/+$/,""),this.model=e.model||"deepseek-chat",this.timeoutMs=e.timeoutMs??15e3,this.cooldownMs=e.cooldownMs??3e4}advise(e){return this.inflight?this.inflight:Date.now()<this.cooldownUntil?Promise.resolve(p(e)):(this.inflight=this.fetchDirective(e).finally(()=>{this.inflight=null}),this.inflight)}async fetchDirective(e){var f,y,h;const t=e.availableHeads.join(","),a=e.availableThoraxes.join(","),i=e.availableAbdomens.join(",");(this.cachedSystemPrompt===""||t!==this.cachedHeadsKey||a!==this.cachedThoraxesKey||i!==this.cachedAbdomensKey)&&(this.cachedSystemPrompt=D(e.availableHeads,e.availableThoraxes,e.availableAbdomens),this.cachedHeadsKey=t,this.cachedThoraxesKey=a,this.cachedAbdomensKey=i);const n=new AbortController,o=setTimeout(()=>n.abort(),this.timeoutMs),l={model:this.model,temperature:.8,max_tokens:this.currentMaxTokens,response_format:{type:"json_object"},messages:[{role:"system",content:this.cachedSystemPrompt},{role:"user",content:K(e)}]};console.log("[DeepSeekAdvisor] 请求 -",{model:l.model,max_tokens:l.max_tokens,prompt_size:this.cachedSystemPrompt.length,user_size:l.messages[1].content.length});try{const u=await fetch(`${this.baseUrl}/chat/completions`,{method:"POST",signal:n.signal,headers:{"Content-Type":"application/json",Authorization:`Bearer ${this.apiKey}`},body:JSON.stringify(l)});if(!u.ok){const w=await u.text().catch(()=>""),T=u.status>=400&&u.status<500;return console.warn(`[DeepSeekAdvisor] HTTP ${u.status}: ${w.slice(0,200)}`),this.scheduleBackoff(T),p(e)}const r=await u.json(),m=(f=r==null?void 0:r.choices)==null?void 0:f[0],d=(y=m==null?void 0:m.message)==null?void 0:y.content,b=m==null?void 0:m.finish_reason,H=r==null?void 0:r.usage;if(console.log("[DeepSeekAdvisor] 响应 -",{finish_reason:b,content_length:(d==null?void 0:d.length)??0,usage:H,choices_count:((h=r==null?void 0:r.choices)==null?void 0:h.length)??0,model:r==null?void 0:r.model}),!d)return console.warn("[DeepSeekAdvisor] 响应无 content -",`finish_reason=${b}, raw=${JSON.stringify(m).slice(0,300)}`),b==="length"&&(this.currentMaxTokens=Math.min((this.currentMaxTokens??1e3)*2,4e3),console.warn(`[DeepSeekAdvisor] 检测到 length 截断，下次 max_tokens 提升到 ${this.currentMaxTokens}`)),this.scheduleBackoff(b==="content_filter"),p(e);const k=C(d);if(!k)return console.warn("[DeepSeekAdvisor] 无法解析 JSON:",d.slice(0,200)),this.scheduleBackoff(!1),p(e);const g=N(k,e);return g?(this.consecutiveFailures=0,this.cooldownUntil=0,this.currentMaxTokens=800,console.log(`[DeepSeekAdvisor] mode=${g.mode}`,`taunt="${g.taunt||""}"`),g):(console.warn("[DeepSeekAdvisor] 校验失败:",d.slice(0,200)),this.scheduleBackoff(!1),p(e))}catch(u){return u instanceof DOMException&&u.name==="AbortError"?console.warn(`[DeepSeekAdvisor] 请求超时 (>${this.timeoutMs}ms)`):console.warn("[DeepSeekAdvisor] 请求失败:",u),this.scheduleBackoff(!1),p(e)}finally{clearTimeout(o)}}scheduleBackoff(e){this.consecutiveFailures+=1;const t=e?1:0,a=Math.min(2**(this.consecutiveFailures-1+t),8),i=Math.min(this.cooldownMs*a,5*6e4);this.cooldownUntil=Date.now()+i,console.warn(`[DeepSeekAdvisor] 失败 #${this.consecutiveFailures}，下次重试冷却 ${Math.round(i/1e3)}s`)}}export{F as DeepSeekStrategicAdvisor};
