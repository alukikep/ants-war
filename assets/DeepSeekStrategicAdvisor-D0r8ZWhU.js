var A=Object.defineProperty;var S=(s,e,a)=>e in s?A(s,e,{enumerable:!0,configurable:!0,writable:!0,value:a}):s[e]=a;var r=(s,e,a)=>S(s,typeof e!="symbol"?e+"":e,a);import{H as k,T as w,A as O}from"./index-BHpqGUcd.js";const H=["upgrade_focus","build_focus","iterate"];function y(s,e){const a=e.stats,t=[];a.damage&&t.push(`攻${a.damage>0?"+":""}${a.damage}`),a.hp&&t.push(`血${a.hp>0?"+":""}${a.hp}`),a.speed&&t.push(`速${a.speed>0?"+":""}${a.speed}`),a.attackSpeed&&t.push(`攻速${a.attackSpeed>0?"+":""}${a.attackSpeed}%`);const i=t.length?t.join("/"):"无加成";return`- ${s}(${e.nameCN}) 价${e.cost} ${i}`}function j(s,e,a){const t=s.map(n=>y(n,k[n])).join(`
`),i=e.map(n=>y(n,w[n])).join(`
`),h=a.map(n=>y(n,O[n])).join(`
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
${t}

胸部(thoraxes):
${i}

腹部(abdomens):
${h}

记住：你只输出 JSON，不要 Markdown 围栏或解释文字。`}function $(s){const e={enemyFood:s.enemyFood,playerFood:s.playerFood,enemyQueen:{hp:s.enemyQueenHp,max:s.enemyQueenMaxHp,pct:s.enemyQueenMaxHp>0?Math.round(s.enemyQueenHp/s.enemyQueenMaxHp*100):0},playerQueen:{hp:s.playerQueenHp,max:s.playerQueenMaxHp,pct:s.playerQueenMaxHp>0?Math.round(s.playerQueenHp/s.playerQueenMaxHp*100):0},enemyHatcheryCount:s.enemyHatcheries.length,enemyHatcheries:s.enemyHatcheries.map(a=>({id:a.id,level:a.level,template:a.template})),enemyAntsCount:s.enemyAntsCount,playerAntsCount:s.playerAntsCount,availableBuildPositions:s.availableBuildPositions.length,upgradableHatcheryCount:s.upgradableHatcheries.length,gameTimeSec:Math.floor(s.gameTime/1e3)};return`当前态势：
${JSON.stringify(e,null,2)}
请给出未来一分钟的战略指令（仅返回 JSON）。`}function M(s,e){if(!s||typeof s!="object")return null;const a=s,t=a.mode;if(typeof t!="string"||!H.includes(t))return null;const i=a.weights;if(!i||typeof i!="object")return null;const h=i,n=(o,m)=>{if(!o||typeof o!="object")return{};const d={};for(const[p,c]of Object.entries(o))m.includes(p)&&typeof c=="number"&&c>=0&&Number.isFinite(c)&&(d[p]=c);return d},l={heads:n(h.heads,e.availableHeads),thoraxes:n(h.thoraxes,e.availableThoraxes),abdomens:n(h.abdomens,e.availableAbdomens)};Object.keys(l.heads).length>0||Object.keys(l.thoraxes).length>0||Object.keys(l.abdomens).length>0||(l.heads=Object.fromEntries(e.availableHeads.map(o=>[o,1])),l.thoraxes=Object.fromEntries(e.availableThoraxes.map(o=>[o,1])),l.abdomens=Object.fromEntries(e.availableAbdomens.map(o=>[o,1])));const f=typeof a.taunt=="string"?a.taunt.slice(0,80):void 0;return{mode:t,weights:l,taunt:f}}function D(s){let e=s.trim();const a=e.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);a&&(e=a[1].trim());const t=e.indexOf("{"),i=e.lastIndexOf("}");if(t===-1||i===-1||i<t)return null;e=e.slice(t,i+1);try{return JSON.parse(e)}catch{return null}}function u(s){return{mode:"iterate",weights:{heads:Object.fromEntries(s.availableHeads.map(e=>[e,1])),thoraxes:Object.fromEntries(s.availableThoraxes.map(e=>[e,1])),abdomens:Object.fromEntries(s.availableAbdomens.map(e=>[e,1]))}}}class _{constructor(e){r(this,"apiKey");r(this,"baseUrl");r(this,"model");r(this,"timeoutMs");r(this,"cooldownMs");r(this,"cachedSystemPrompt","");r(this,"cachedHeadsKey","");r(this,"cachedThoraxesKey","");r(this,"cachedAbdomensKey","");r(this,"cooldownUntil",0);r(this,"inflight",null);r(this,"consecutiveFailures",0);if(!e.apiKey)throw new Error("[DeepSeekAdvisor] apiKey 不能为空");this.apiKey=e.apiKey,this.baseUrl=(e.baseUrl||"https://api.deepseek.com").replace(/\/+$/,""),this.model=e.model||"deepseek-chat",this.timeoutMs=e.timeoutMs??15e3,this.cooldownMs=e.cooldownMs??3e4}advise(e){return this.inflight?this.inflight:Date.now()<this.cooldownUntil?Promise.resolve(u(e)):(this.inflight=this.fetchDirective(e).finally(()=>{this.inflight=null}),this.inflight)}async fetchDirective(e){var l,b,f;const a=e.availableHeads.join(","),t=e.availableThoraxes.join(","),i=e.availableAbdomens.join(",");(this.cachedSystemPrompt===""||a!==this.cachedHeadsKey||t!==this.cachedThoraxesKey||i!==this.cachedAbdomensKey)&&(this.cachedSystemPrompt=j(e.availableHeads,e.availableThoraxes,e.availableAbdomens),this.cachedHeadsKey=a,this.cachedThoraxesKey=t,this.cachedAbdomensKey=i);const h=new AbortController,n=setTimeout(()=>h.abort(),this.timeoutMs);try{const o=await fetch(`${this.baseUrl}/chat/completions`,{method:"POST",signal:h.signal,headers:{"Content-Type":"application/json",Authorization:`Bearer ${this.apiKey}`},body:JSON.stringify({model:this.model,temperature:.8,max_tokens:400,response_format:{type:"json_object"},messages:[{role:"system",content:this.cachedSystemPrompt},{role:"user",content:$(e)}]})});if(!o.ok){const v=await o.text().catch(()=>""),g=o.status>=400&&o.status<500;return console.warn(`[DeepSeekAdvisor] HTTP ${o.status}: ${v.slice(0,200)}`),this.scheduleBackoff(g),u(e)}const m=await o.json(),d=(f=(b=(l=m==null?void 0:m.choices)==null?void 0:l[0])==null?void 0:b.message)==null?void 0:f.content;if(!d)return console.warn("[DeepSeekAdvisor] 响应无 content"),this.scheduleBackoff(!1),u(e);const p=D(d);if(!p)return console.warn("[DeepSeekAdvisor] 无法解析 JSON:",d.slice(0,200)),this.scheduleBackoff(!1),u(e);const c=M(p,e);return c?(this.consecutiveFailures=0,this.cooldownUntil=0,console.log(`[DeepSeekAdvisor] mode=${c.mode}`,`taunt="${c.taunt||""}"`),c):(console.warn("[DeepSeekAdvisor] 校验失败:",d.slice(0,200)),this.scheduleBackoff(!1),u(e))}catch(o){return o instanceof DOMException&&o.name==="AbortError"?console.warn(`[DeepSeekAdvisor] 请求超时 (>${this.timeoutMs}ms)`):console.warn("[DeepSeekAdvisor] 请求失败:",o),this.scheduleBackoff(!1),u(e)}finally{clearTimeout(n)}}scheduleBackoff(e){this.consecutiveFailures+=1;const a=e?1:0,t=Math.min(2**(this.consecutiveFailures-1+a),8),i=Math.min(this.cooldownMs*t,5*6e4);this.cooldownUntil=Date.now()+i,console.warn(`[DeepSeekAdvisor] 失败 #${this.consecutiveFailures}，下次重试冷却 ${Math.round(i/1e3)}s`)}}export{_ as DeepSeekStrategicAdvisor};
