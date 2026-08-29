var w=Object.defineProperty;var O=(s,e,t)=>e in s?w(s,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):s[e]=t;var r=(s,e,t)=>O(s,typeof e!="symbol"?e+"":e,t);import{H as $,T as H,A as j}from"./index-DevJUN_b.js";const _=["upgrade_focus","build_focus","iterate"];function v(s,e){const t=e.stats,a=[];t.damage&&a.push(`攻${t.damage>0?"+":""}${t.damage}`),t.hp&&a.push(`血${t.hp>0?"+":""}${t.hp}`),t.speed&&a.push(`速${t.speed>0?"+":""}${t.speed}`),t.attackSpeed&&a.push(`攻速${t.attackSpeed>0?"+":""}${t.attackSpeed}%`);const o=a.length?a.join("/"):"无加成";return`- ${s}(${e.nameCN}) 价${e.cost} ${o}`}function D(s,e,t){const a=s.map(i=>v(i,$[i])).join(`
`),o=e.map(i=>v(i,H[i])).join(`
`),m=t.map(i=>v(i,j[i])).join(`
`);return`你是融合蚁大战的敌方 AI 战略顾问（只负责战略，不下指令）。

【背景】拔河策略游戏：你代表敌方（红方）。每 ~60s 你收到一次战场态势 JSON，请根据当前局势，**调整 AI 的战略模式和部件权重**，让本地 AI 接下来一分钟打出更好的蚂蚁组合。

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

【分析步骤】
1. 看蚁后血量比：危险（<30%）→ 侧重防御/反攻
2. 看蚂蚁数量：劣势（少于对方）→ build_focus 扩张
3. 看蚂蚁数量：优势但孵化室都低等级 → upgrade_focus
4. 中后期有空间 → iterate + 提高高级部件权重

【你的可用部件】（只能从这里选）

头部(heads):
${a}

胸部(thoraxes):
${o}

腹部(abdomens):
${m}

记住：你只输出 JSON，不要 Markdown 围栏或解释文字。`}function T(s){const e={enemyFood:s.enemyFood,playerFood:s.playerFood,enemyQueen:{hp:s.enemyQueenHp,max:s.enemyQueenMaxHp,pct:s.enemyQueenMaxHp>0?Math.round(s.enemyQueenHp/s.enemyQueenMaxHp*100):0},playerQueen:{hp:s.playerQueenHp,max:s.playerQueenMaxHp,pct:s.playerQueenMaxHp>0?Math.round(s.playerQueenHp/s.playerQueenMaxHp*100):0},enemyHatcheryCount:s.enemyHatcheries.length,enemyHatcheries:s.enemyHatcheries.map(t=>({id:t.id,level:t.level,template:t.template})),enemyAntsCount:s.enemyAntsCount,playerAntsCount:s.playerAntsCount,availableBuildPositions:s.availableBuildPositions.length,upgradableHatcheryCount:s.upgradableHatcheries.length,gameTimeSec:Math.floor(s.gameTime/1e3)};return`当前态势：
${JSON.stringify(e,null,2)}
请给出未来一分钟的战略指令（仅返回 JSON）。`}function K(s,e){if(!s||typeof s!="object")return null;const t=s,a=t.mode;if(typeof a!="string"||!_.includes(a))return null;const o=t.weights;if(!o||typeof o!="object")return null;const m=o,i=(c,h)=>{if(!c||typeof c!="object")return{};const n={};for(const[u,d]of Object.entries(c))h.includes(u)&&typeof d=="number"&&d>=0&&Number.isFinite(d)&&(n[u]=d);return n},l={heads:i(m.heads,e.availableHeads),thoraxes:i(m.thoraxes,e.availableThoraxes),abdomens:i(m.abdomens,e.availableAbdomens)};Object.keys(l.heads).length>0||Object.keys(l.thoraxes).length>0||Object.keys(l.abdomens).length>0||(l.heads=Object.fromEntries(e.availableHeads.map(c=>[c,1])),l.thoraxes=Object.fromEntries(e.availableThoraxes.map(c=>[c,1])),l.abdomens=Object.fromEntries(e.availableAbdomens.map(c=>[c,1])));const f=typeof t.taunt=="string"?t.taunt.slice(0,80):void 0;return{mode:a,weights:l,taunt:f}}function N(s){let e=s.trim();const t=e.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);t&&(e=t[1].trim());const a=e.indexOf("{"),o=e.lastIndexOf("}");if(a===-1||o===-1||o<a)return null;e=e.slice(a,o+1);try{return JSON.parse(e)}catch{return null}}function p(s){return{mode:"iterate",weights:{heads:Object.fromEntries(s.availableHeads.map(e=>[e,1])),thoraxes:Object.fromEntries(s.availableThoraxes.map(e=>[e,1])),abdomens:Object.fromEntries(s.availableAbdomens.map(e=>[e,1]))}}}class F{constructor(e){r(this,"apiKey");r(this,"baseUrl");r(this,"model");r(this,"timeoutMs");r(this,"cooldownMs");r(this,"cachedSystemPrompt","");r(this,"cachedHeadsKey","");r(this,"cachedThoraxesKey","");r(this,"cachedAbdomensKey","");r(this,"cooldownUntil",0);r(this,"inflight",null);r(this,"consecutiveFailures",0);r(this,"currentMaxTokens",800);if(!e.apiKey)throw new Error("[DeepSeekAdvisor] apiKey 不能为空");this.apiKey=e.apiKey,this.baseUrl=(e.baseUrl||"https://api.deepseek.com").replace(/\/+$/,""),this.model=e.model||"deepseek-chat",this.timeoutMs=e.timeoutMs??15e3,this.cooldownMs=e.cooldownMs??3e4}advise(e){return this.inflight?this.inflight:Date.now()<this.cooldownUntil?Promise.resolve(p(e)):(this.inflight=this.fetchDirective(e).finally(()=>{this.inflight=null}),this.inflight)}async fetchDirective(e){var g,f,c;const t=e.availableHeads.join(","),a=e.availableThoraxes.join(","),o=e.availableAbdomens.join(",");(this.cachedSystemPrompt===""||t!==this.cachedHeadsKey||a!==this.cachedThoraxesKey||o!==this.cachedAbdomensKey)&&(this.cachedSystemPrompt=D(e.availableHeads,e.availableThoraxes,e.availableAbdomens),this.cachedHeadsKey=t,this.cachedThoraxesKey=a,this.cachedAbdomensKey=o);const m=new AbortController,i=setTimeout(()=>m.abort(),this.timeoutMs),l={model:this.model,temperature:.8,max_tokens:this.currentMaxTokens,response_format:{type:"json_object"},messages:[{role:"system",content:this.cachedSystemPrompt},{role:"user",content:T(e)}]};console.log("[DeepSeekAdvisor] 请求 -",{model:l.model,max_tokens:l.max_tokens,prompt_size:this.cachedSystemPrompt.length,user_size:l.messages[1].content.length});try{const h=await fetch(`${this.baseUrl}/chat/completions`,{method:"POST",signal:m.signal,headers:{"Content-Type":"application/json",Authorization:`Bearer ${this.apiKey}`},body:JSON.stringify(l)});if(!h.ok){const S=await h.text().catch(()=>""),M=h.status>=400&&h.status<500;return console.warn(`[DeepSeekAdvisor] HTTP ${h.status}: ${S.slice(0,200)}`),this.scheduleBackoff(M),p(e)}const n=await h.json(),u=(g=n==null?void 0:n.choices)==null?void 0:g[0],d=(f=u==null?void 0:u.message)==null?void 0:f.content,b=u==null?void 0:u.finish_reason,A=n==null?void 0:n.usage;if(console.log("[DeepSeekAdvisor] 响应 -",{finish_reason:b,content_length:(d==null?void 0:d.length)??0,usage:A,choices_count:((c=n==null?void 0:n.choices)==null?void 0:c.length)??0,model:n==null?void 0:n.model}),!d)return console.warn("[DeepSeekAdvisor] 响应无 content -",`finish_reason=${b}, raw=${JSON.stringify(u).slice(0,300)}`),b==="length"&&(this.currentMaxTokens=Math.min((this.currentMaxTokens??1e3)*2,4e3),console.warn(`[DeepSeekAdvisor] 检测到 length 截断，下次 max_tokens 提升到 ${this.currentMaxTokens}`)),this.scheduleBackoff(b==="content_filter"),p(e);const k=N(d);if(!k)return console.warn("[DeepSeekAdvisor] 无法解析 JSON:",d.slice(0,200)),this.scheduleBackoff(!1),p(e);const y=K(k,e);return y?(this.consecutiveFailures=0,this.cooldownUntil=0,this.currentMaxTokens=800,console.log(`[DeepSeekAdvisor] mode=${y.mode}`,`taunt="${y.taunt||""}"`),y):(console.warn("[DeepSeekAdvisor] 校验失败:",d.slice(0,200)),this.scheduleBackoff(!1),p(e))}catch(h){return h instanceof DOMException&&h.name==="AbortError"?console.warn(`[DeepSeekAdvisor] 请求超时 (>${this.timeoutMs}ms)`):console.warn("[DeepSeekAdvisor] 请求失败:",h),this.scheduleBackoff(!1),p(e)}finally{clearTimeout(i)}}scheduleBackoff(e){this.consecutiveFailures+=1;const t=e?1:0,a=Math.min(2**(this.consecutiveFailures-1+t),8),o=Math.min(this.cooldownMs*a,5*6e4);this.cooldownUntil=Date.now()+o,console.warn(`[DeepSeekAdvisor] 失败 #${this.consecutiveFailures}，下次重试冷却 ${Math.round(o/1e3)}s`)}}export{F as DeepSeekStrategicAdvisor};
