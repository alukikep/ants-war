var A=Object.defineProperty;var S=(a,e,s)=>e in a?A(a,e,{enumerable:!0,configurable:!0,writable:!0,value:s}):a[e]=s;var r=(a,e,s)=>S(a,typeof e!="symbol"?e+"":e,s);import{H as g,T as v,A as O}from"./index-B5OoYC93.js";const H=["upgrade_focus","build_focus","iterate"];function f(a,e){const s=e.stats,o=[];s.damage&&o.push(`攻${s.damage>0?"+":""}${s.damage}`),s.hp&&o.push(`血${s.hp>0?"+":""}${s.hp}`),s.speed&&o.push(`速${s.speed>0?"+":""}${s.speed}`),s.attackSpeed&&o.push(`攻速${s.attackSpeed>0?"+":""}${s.attackSpeed}%`);const n=o.length?o.join("/"):"无加成";return`- ${a}(${e.nameCN}) 价${e.cost} ${n}`}function j(a,e,s){const o=a.map(i=>f(i,g[i])).join(`
`),n=e.map(i=>f(i,v[i])).join(`
`),c=s.map(i=>f(i,O[i])).join(`
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
${o}

胸部(thoraxes):
${n}

腹部(abdomens):
${c}

记住：你只输出 JSON，不要 Markdown 围栏或解释文字。`}function M(a){const e={enemyFood:a.enemyFood,playerFood:a.playerFood,enemyQueen:{hp:a.enemyQueenHp,max:a.enemyQueenMaxHp,pct:a.enemyQueenMaxHp>0?Math.round(a.enemyQueenHp/a.enemyQueenMaxHp*100):0},playerQueen:{hp:a.playerQueenHp,max:a.playerQueenMaxHp,pct:a.playerQueenMaxHp>0?Math.round(a.playerQueenHp/a.playerQueenMaxHp*100):0},enemyHatcheryCount:a.enemyHatcheries.length,enemyHatcheries:a.enemyHatcheries.map(s=>({id:s.id,level:s.level,template:s.template})),enemyAntsCount:a.enemyAntsCount,playerAntsCount:a.playerAntsCount,availableBuildPositions:a.availableBuildPositions.length,upgradableHatcheryCount:a.upgradableHatcheries.length,gameTimeSec:Math.floor(a.gameTime/1e3)};return`当前态势：
${JSON.stringify(e,null,2)}
请给出未来一分钟的战略指令（仅返回 JSON）。`}function $(a,e){if(!a||typeof a!="object")return null;const s=a,o=s.mode;if(typeof o!="string"||!H.includes(o))return null;const n=s.weights;if(!n||typeof n!="object")return null;const c=n,i=(t,u)=>{if(!t||typeof t!="object")return{};const h={};for(const[p,d]of Object.entries(t))u.includes(p)&&typeof d=="number"&&d>=0&&Number.isFinite(d)&&(h[p]=d);return h},l={heads:i(c.heads,e.availableHeads),thoraxes:i(c.thoraxes,e.availableThoraxes),abdomens:i(c.abdomens,e.availableAbdomens)};Object.keys(l.heads).length>0||Object.keys(l.thoraxes).length>0||Object.keys(l.abdomens).length>0||(l.heads=Object.fromEntries(e.availableHeads.map(t=>[t,1])),l.thoraxes=Object.fromEntries(e.availableThoraxes.map(t=>[t,1])),l.abdomens=Object.fromEntries(e.availableAbdomens.map(t=>[t,1])));const b=typeof s.taunt=="string"?s.taunt.slice(0,80):void 0;return{mode:o,weights:l,taunt:b}}function k(a){let e=a.trim();const s=e.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);s&&(e=s[1].trim());const o=e.indexOf("{"),n=e.lastIndexOf("}");if(o===-1||n===-1||n<o)return null;e=e.slice(o,n+1);try{return JSON.parse(e)}catch{return null}}function m(a){return{mode:"iterate",weights:{heads:Object.fromEntries(a.availableHeads.map(e=>[e,1])),thoraxes:Object.fromEntries(a.availableThoraxes.map(e=>[e,1])),abdomens:Object.fromEntries(a.availableAbdomens.map(e=>[e,1]))}}}class T{constructor(e){r(this,"apiKey");r(this,"baseUrl");r(this,"model");r(this,"timeoutMs");r(this,"cooldownMs");r(this,"cachedSystemPrompt","");r(this,"cachedHeadsKey","");r(this,"cachedThoraxesKey","");r(this,"cachedAbdomensKey","");r(this,"cooldownUntil",0);if(!e.apiKey)throw new Error("[DeepSeekAdvisor] apiKey 不能为空");this.apiKey=e.apiKey,this.baseUrl=(e.baseUrl||"https://api.deepseek.com").replace(/\/+$/,""),this.model=e.model||"deepseek-chat",this.timeoutMs=e.timeoutMs??8e3,this.cooldownMs=e.cooldownMs??3e4}async advise(e){var l,y,b;if(Date.now()<this.cooldownUntil)return m(e);const s=e.availableHeads.join(","),o=e.availableThoraxes.join(","),n=e.availableAbdomens.join(",");(this.cachedSystemPrompt===""||s!==this.cachedHeadsKey||o!==this.cachedThoraxesKey||n!==this.cachedAbdomensKey)&&(this.cachedSystemPrompt=j(e.availableHeads,e.availableThoraxes,e.availableAbdomens),this.cachedHeadsKey=s,this.cachedThoraxesKey=o,this.cachedAbdomensKey=n);const c=new AbortController,i=setTimeout(()=>c.abort(),this.timeoutMs);try{const t=await fetch(`${this.baseUrl}/chat/completions`,{method:"POST",signal:c.signal,headers:{"Content-Type":"application/json",Authorization:`Bearer ${this.apiKey}`},body:JSON.stringify({model:this.model,temperature:.8,max_tokens:400,response_format:{type:"json_object"},messages:[{role:"system",content:this.cachedSystemPrompt},{role:"user",content:M(e)}]})});if(!t.ok){const w=await t.text().catch(()=>"");return console.warn(`[DeepSeekAdvisor] HTTP ${t.status}: ${w.slice(0,200)}`),this.cooldownUntil=Date.now()+this.cooldownMs,m(e)}const u=await t.json(),h=(b=(y=(l=u==null?void 0:u.choices)==null?void 0:l[0])==null?void 0:y.message)==null?void 0:b.content;if(!h)return console.warn("[DeepSeekAdvisor] 响应无 content"),this.cooldownUntil=Date.now()+this.cooldownMs,m(e);const p=k(h);if(!p)return console.warn("[DeepSeekAdvisor] 无法解析 JSON:",h.slice(0,200)),this.cooldownUntil=Date.now()+this.cooldownMs,m(e);const d=$(p,e);return d?(console.log(`[DeepSeekAdvisor] mode=${d.mode}`,`taunt="${d.taunt||""}"`),d):(console.warn("[DeepSeekAdvisor] 校验失败:",h.slice(0,200)),this.cooldownUntil=Date.now()+this.cooldownMs,m(e))}catch(t){return t instanceof DOMException&&t.name==="AbortError"?console.warn(`[DeepSeekAdvisor] 请求超时 (>${this.timeoutMs}ms)`):console.warn("[DeepSeekAdvisor] 请求失败:",t),this.cooldownUntil=Date.now()+this.cooldownMs,m(e)}finally{clearTimeout(i)}}}export{T as DeepSeekStrategicAdvisor};
