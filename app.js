/* Altervenator — App (V2.2) con assets centralizados y skins de color sólidas */

/* ====== Config rutas de imágenes ====== */
const ASSETS = 'assets/'; // <-- si tus PNGs están en otra carpeta, cambia esto
const I = {
  logo: ASSETS+'logo.png',
  logofondo: ASSETS+'logofondo.png',
  llave: ASSETS+'llave.png',
  ok: ASSETS+'ok.png',
  cancel: ASSETS+'cancel.png',
  save: ASSETS+'save.png',
  load: ASSETS+'load.png',
  focus: ASSETS+'focus.png',
  clase: ASSETS+'clase.png',
  consumibles: ASSETS+'consumibles.png',
  cosmeticos: ASSETS+'cosmeticos.png',
  pocionTiempo: ASSETS+'pociontiempo.png',
  pocionFuerza: ASSETS+'pocionfuerza.png',
  pocionExp: ASSETS+'pocionexp.png',
  curas: ASSETS+'curas.png',
  dagas: ASSETS+'dagas.png',
  arco: ASSETS+'arco.png',
  gafas: ASSETS+'gafas.png',
  ropa: ASSETS+'ropa.png',
  castigador: ASSETS+'castigador.png',
  objetoEspecial: ASSETS+'objetoespecial.png',
  // Clases
  clasePNG: (c)=>({
    'Guerrero': ASSETS+'guerrero.png',
    'Asesino': ASSETS+'asesino.png',
    'Mago': ASSETS+'mago.png',
    'Arquero': ASSETS+'arquero.png',
    'Espía': ASSETS+'espia.png',
    'Maratón': ASSETS+'maraton.png',
    'Amigo del dragón': ASSETS+'amigodeldragon.png',
    'Saltamontes': ASSETS+'saltamontes.png'
  }[c] || I.logo)
};

/* ====== Core / State / Utils (igual de robusto que V2.1) ====== */
const Core=(()=>{const l=new Map();const on=(e,f)=>{if(!l.has(e))l.set(e,new Set());l.get(e).add(f);return()=>l.get(e)?.delete(f)};const emit=(e,p)=>l.get(e)?.forEach(f=>f(p));
const KEY='altervenator:v2';const save=p=>{const c=JSON.parse(localStorage.getItem(KEY)||'{}');localStorage.setItem(KEY,JSON.stringify({...c,...p}))};const load=()=>JSON.parse(localStorage.getItem(KEY)||'{}');
let t=null;const startTick=()=>{if(t)return;t=setInterval(()=>emit('tick:1s'),1000)};const Config={XP_BASE:200,XP_CLASS_BASE:200,XP_GROWTH:1.10,NERF_EXP_STEP:0.20,NERF_MAX_STACKS:3,BUFF_EXP_BONUS:0.20,BUFF_TIME_MIN:30,FOCUS_TIMER_H:8,CLASS_TIMER_H:12,RAID_TIMER_H:7,HARD_VERSION_H:6,DAILY_GENERATE_HOUR:0,DAILY_DEADLINE_HOUR:23,MAX_FOCUS_PER_DAY:2,MAX_CLASS_PER_DAY:2};
const dateKey=(d=new Date())=>d.toISOString().slice(0,10);const isoWeekKey=(d=new Date())=>{const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const day=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-day);const y0=new Date(Date.UTC(t.getUTCFullYear(),0,1));const wk=Math.ceil((((t-y0)/86400000)+1)/7);return `${t.getUTCFullYear()}-W${String(wk).padStart(2,'0')}`};
return {on,emit,save,load,startTick,Config,dateKey,isoWeekKey};})();

const State=(()=>{let state={profile:{name:'Jugador',class:'Guerrero',zone:'Abdomen'},economy:{level:1,xp:0,coins:150,classLevel:1,classXp:0,nerfStacks:0,buffUntilTs:0},missions:{list:[],history:[],counts:{dayKey:null,weekKey:null,focusToday:0,classToday:0,urgentsThisWeek:0},pityWeekPercent:10,dailyOfDayKey:null},inventory:{keys:0,rare:[],consumables:{exp:0,curas:0,time:0,fuerza:0},equipment:{}},profileSlots:[]};
const subs=new Set();const get=()=>structuredClone(state);const set=p=>{const d=structuredClone(state);p(d);state=d;subs.forEach(f=>f(get()));Core.save({state})};const subscribe=f=>{subs.add(f);return()=>subs.delete(f)};
const hydrate=()=>{const s=Core.load();if(s?.state)state=s.state};const ensureResets=()=>{const today=Core.dateKey(),wk=Core.isoWeekKey();if(state.missions.counts.dayKey!==today){state.missions.counts.dayKey=today;state.missions.counts.focusToday=0;state.missions.counts.classToday=0;state.missions.dailyOfDayKey=null;const now=Date.now();const expired=state.missions.list.filter(m=>m.type==='Diaria'&&m.endsAt<now);if(expired.length){expired.forEach(m=>{state.economy.coins-=6;state.economy.nerfStacks=Math.min(state.economy.nerfStacks+1,Core.Config.NERF_MAX_STACKS);state.missions.history.unshift({ts:now,id:m.id,name:m.name,type:m.type,status:'failed-auto',penalty:{coins:6,nerf:true}})});state.missions.list=state.missions.list.filter(m=>!(m.type==='Diaria'&&m.endsAt<now));}}if(state.missions.counts.weekKey!==wk){state.missions.counts.weekKey=wk;state.missions.counts.urgentsThisWeek=0;state.missions.pityWeekPercent=Math.min(30,(state.missions.pityWeekPercent||10)+5);}};
return {get,set,subscribe,hydrate,ensureResets};})();

const U=(()=>{const secondsLeft=ts=>Math.max(0,Math.floor((ts-Date.now())/1000));const hms=s=>`${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;const roundMult=(n,m=5)=>Math.round(n/m)*m;return {secondsLeft,hms,roundMult};})();

/* ====== Progression ====== */
const Features={};
Features.Progression=(()=>{const R=Core.Config;const reqXp=l=>Math.round(R.XP_BASE*Math.pow(R.XP_GROWTH,Math.max(0,l-1)));const reqCXp=l=>Math.round(R.XP_CLASS_BASE*Math.pow(R.XP_GROWTH,Math.max(0,l-1)));
const mod=()=>{const s=State.get();let m=1;m*=(1-(s.economy.nerfStacks*R.NERF_EXP_STEP));if(s.economy.buffUntilTs>Date.now())m*=(1+R.BUFF_EXP_BONUS);return Math.max(0,m)};
const addXp=x=>State.set(s=>{s.economy.xp+=Math.round(x*mod());let up=true;while(up){up=false;const need=reqXp(s.economy.level);if(s.economy.xp>=need){s.economy.xp-=need;s.economy.level++;up=true}}});
const addCXp=x=>State.set(s=>{s.economy.classXp+=Math.round(x*mod());let up=true;while(up){up=false;const need=reqCXp(s.economy.classLevel);if(s.economy.classXp>=need){s.economy.classXp-=need;s.economy.classLevel++;up=true}}});
const coins=n=>State.set(s=>{s.economy.coins+=n});const nerf=()=>State.set(s=>{s.economy.nerfStacks=Math.min(s.economy.nerfStacks+1,R.NERF_MAX_STACKS)});const clear=()=>State.set(s=>{s.economy.nerfStacks=0});const buff=(m=R.BUFF_TIME_MIN)=>State.set(s=>{s.economy.buffUntilTs=Date.now()+m*60*1000});
return {reqXp,reqCXp,addXp,addCXp,coins,nerf,clear,buff};})();

/* ====== Data (abreviado para espacio — igual que tu documento) ====== */
const Data=(()=>{const daily={1:[{name:'Flexiones',reps:5,rounds:2,type:'reps'},{name:'Sentadillas',reps:10,rounds:2,type:'reps'},{name:'Abdominales',reps:20,rounds:2,type:'reps'}],2:[{name:'Dominadas',reps:[5,3],rounds:1,type:'reps-2r'},{name:'Zancadas',reps:'4/4',rounds:1,type:'alt'},{name:'Puente de glúteo',reps:7,rounds:1,type:'reps'}],3:[{name:'Fondos tríceps',reps:5,rounds:1,type:'reps'},{name:'Patada lateral desde cuadrupedia',reps:3,rounds:2,type:'reps'},{name:'Plancha',secs:10,rounds:1,type:'secs'}],4:null,5:null,6:null,0:[{name:'Elevación de piernas',reps:5,rounds:2,type:'reps'},{name:'Combo patadas variadas',reps:'pack',rounds:1,type:'pack'},{name:'Sombra intensa',secs:30,rounds:1,type:'secs'}]};daily[4]=daily[1];daily[5]=daily[2];daily[6]=daily[3];
const focus={'Abdomen':['Crunches','Elevación de piernas','Criss cross','Plancha'],'Brazos':['Fondos de tríceps','Curl de bíceps con peso','Flexiones de tríceps','Dominadas supinas'],'Piernas':['Sentadillas','Zancadas','Puente de glúteos','Sentadillas con salto'],'Pecho':['Flexiones','Press pecho con peso','Aperturas','Rebotes de flexiones/press'],'Espalda':['Dominadas','Remo en plancha','Remo en banco','Cargadas'],'Hombros':['Elevaciones laterales','Flexiones en pica','Press militar','Elevaciones frontales']};
const classPools={'Guerrero':['Repite misión diaria','Repite misión focus','3 golpes espada pesada ×10','Combo 5 golpes espada pesada','Combo 1 min espada (lvl10+)','Inventa golpe (lvl10+)','Fabrica arma pesada (lvl10+)']/* resto igual al PDF */};
return {daily,focus,classPools};})();

/* ====== Missions ====== */
Features.Missions=(()=>{const TYPES={DAILY:'Diaria',FOCUS:'Focus',CLASS:'Clase',URGENT:'Urgente',RAID:'Asalto'};
const _hist=e=>State.set(s=>{s.missions.history.unshift({ts:Date.now(),...e})});const _add=m=>State.set(s=>{s.missions.list.push(m)});const _rm=id=>State.set(s=>{const i=s.missions.list.findIndex(x=>x.id===id);if(i>=0)s.missions.list.splice(i,1)});
const _new=({type,name,secs,reward,penalty,meta={}})=>({id:crypto.randomUUID(),type,name,createdAt:Date.now(),endsAt:Date.now()+secs*1000,reward,penalty,meta});

const createDaily=()=>{const today=new Date();const dow=today.getDay();const base=Data.daily[dow]||Data.daily[1];
const s=State.get();const lvl=s.economy.level;const mult=Math.pow(Core.Config.XP_GROWTH,Math.max(0,lvl-1));const plus=Math.floor((lvl-1)/3);
const ex=base.map(x=>{const e={...x};if(e.type==='reps')e.reps=U.roundMult(e.reps*mult,1);if(e.type==='secs')e.secs=Math.round(e.secs*mult);if(e.type==='reps-2r'&&Array.isArray(e.reps))e.reps=e.reps.map(r=>U.roundMult(r*mult,1));e.rounds=(e.rounds||1)+plus;return e});
const end=new Date(today);end.setHours(Core.Config.DAILY_DEADLINE_HOUR,59,59,0);const secs=Math.max(1,Math.floor((end.getTime()-Date.now())/1000));
const reward={xp:40+(lvl-1)*5,coins:6+(lvl-1),classXp:0};const m=_new({type:TYPES.DAILY,name:'Misión Diaria',secs:secs,reward,penalty:{coins:6,nerf:true,hard:true,hardMult:2.0},meta:{exercises:ex,reqMult:1,uses:{}}});
_add(m);State.set(st=>{st.missions.dailyOfDayKey=Core.dateKey()});UI.Notif.ask('Tienes una misión diaria. ¿Aceptas?','blue',{ok:'Aceptar',cancel:'Rechazar',icon:I.logo}).then(ok=>{if(!ok){_rm(m.id);_hist({id:m.id,name:m.name,type:m.type,status:'rejected'})}UI.render()})};

const createFocus=(zone)=>{const c=State.get().missions.counts;if(c.focusToday>=Core.Config.MAX_FOCUS_PER_DAY){UI.Notif.ask('Límite diario de Focus alcanzado (2).','yellow',{ok:'Entendido',icon:I.objetoEspecial});return;}
const lvl=State.get().economy.level;let reps=10;if(lvl>=5&&lvl<=9)reps=18;else if(lvl>=10&&lvl<=20)reps=25;else if(lvl>=21)reps=30;const ex=(Data.focus[zone]||Data.focus['Abdomen']).map(n=>({name:n,reps,rounds:1,type:'reps'}));
const m=_new({type:TYPES.FOCUS,name:`Focus: ${zone}`,secs:Core.Config.FOCUS_TIMER_H*3600,reward:{xp:80,coins:10,classXp:0},penalty:{coins:8,nerf:true,hard:true,hardMult:1.5},meta:{exercises:ex,reqMult:1,uses:{}}});
UI.Notif.ask(`Nueva misión Focus de ${zone}. ¿Aceptas?`,'blue',{ok:'Aceptar',cancel:'Rechazar',icon:I.logo}).then(ok=>{if(ok){_add(m);State.set(s=>{s.missions.counts.focusToday++});UI.Notif.toast('Focus creada','info')}else{_hist({id:m.id,name:m.name,type:m.type,status:'rejected'})}UI.render()})};

const createClass=()=>{const c=State.get().missions.counts;if(c.classToday>=Core.Config.MAX_CLASS_PER_DAY){UI.Notif.ask('Límite diario de misiones de clase alcanzado (2).','yellow',{ok:'Entendido',icon:I.objetoEspecial});return;}
const s=State.get();const pool=(Data.classPools[s.profile.class]||[]).slice();const choices=pool.sort(()=>Math.random()-0.5).slice(0,2);
const lvl=s.economy.classLevel;const reward={xp:0,classXp:70+(lvl-1)*5,coins:9+(lvl-1)};const m=_new({type:TYPES.CLASS,name:`Misión de Clase (${s.profile.class})`,secs:Core.Config.CLASS_TIMER_H*3600,reward,penalty:{none:true},meta:{exercises:choices.map(text=>({name:text})),reqMult:1,uses:{}}});
UI.Notif.ask('Tienes una misión de clase disponible. ¿Aceptas?','purple',{ok:'Aceptar',cancel:'Rechazar',icon:I.clasePNG(s.profile.class)}).then(ok=>{if(ok){_add(m);State.set(st=>{st.missions.counts.classToday++});UI.Notif.toast('Misión de clase creada','info')}else{_hist({id:m.id,name:m.name,type:m.type,status:'rejected'})}UI.render()})};

const createRaid=()=>{const s=State.get();if(s.inventory.keys<=0){UI.Notif.ask('Te falta una llave de mazmorra.','yellow',{ok:'Entendido',icon:I.llave});return;}State.set(st=>{st.inventory.keys-=1});
const m=_new({type:TYPES.RAID,name:'Asalto a Mazmorra',secs:Core.Config.RAID_TIMER_H*3600,reward:{xp:200,coins:80,classXp:170},penalty:{coins:120,xp:150,classXp:50},meta:{exercises:[],reqMult:1,uses:{}}});
_add(m);UI.Notif.toast('Asalto iniciado','info');UI.render()};

const complete=(id)=>{const m=State.get().missions.list.find(x=>x.id===id);if(!m)return;if(m.reward.xp)Features.Progression.addXp(m.reward.xp);if(m.reward.classXp)Features.Progression.addCXp(m.reward.classXp);if(m.reward.coins)Features.Progression.coins(m.reward.coins);_rm(id);_hist({id,name:m.name,type:m.type,status:'completed',reward:m.reward});UI.Notif.ask(`Has completado "${m.name}". Recompensa: ${m.reward.xp||0} XP, ${m.reward.classXp||0} XP Clase, ${m.reward.coins||0} 🪙`,'green',{ok:'Aceptar',icon:I.objetoEspecial});UI.render();};

const fail=(id,opts={})=>{const m=State.get().missions.list.find(x=>x.id===id);if(!m)return;_rm(id);
if(m.type==='Clase'){_hist({id,name:m.name,type:m.type,status:'failed',penalty:{none:true}});UI.Notif.ask(`"${m.name}" fallida (sin penalización).`,'purple',{ok:'Aceptar',icon:I.castigador});UI.render();return;}
if(!opts.noPenalty){if(m.penalty?.coins)Features.Progression.coins(-m.penalty.coins);if(m.penalty?.xp)Features.Progression.addXp(-m.penalty.xp);if(m.penalty?.classXp)Features.Progression.addCXp(-m.penalty.classXp);if(m.penalty?.nerf)Features.Progression.nerf();
if(m.penalty?.hard && !opts.skipHardOffer){const hard=_new({type:m.type,name:`${m.name} — Versión dura`,secs:Core.Config.HARD_VERSION_H*3600,reward:m.reward,penalty:{none:true},meta:{...(m.meta||{}),reqMult:(m.meta?.reqMult||1)*(m.penalty.hardMult||1.5),hard:true}});_add(hard);UI.Notif.ask(`Se ha creado "${hard.name}" (6h). Sin penalización si falla.`,'red',{ok:'Aceptar',icon:I.castigador})}}
_hist({id,name:m.name,type:m.type,status:'failed',penalty:m.penalty});UI.render();};

Core.on('tick:1s',()=>{const s=State.get();const now=Date.now();let changed=false;s.missions.list.forEach(m=>{if(m.endsAt<=now){changed=true;if(m.type==='Clase'){_hist({id:m.id,name:m.name,type:m.type,status:'timeout'})}else{if(m.penalty?.coins)Features.Progression.coins(-m.penalty.coins);if(m.penalty?.xp)Features.Progression.addXp(-m.penalty.xp);if(m.penalty?.classXp)Features.Progression.addCXp(-m.penalty.classXp);if(m.penalty?.nerf)Features.Progression.nerf();_hist({id:m.id,name:m.name,type:m.type,status:'timeout-penalized',penalty:m.penalty})}}});if(changed){State.set(st=>{st.missions.list=st.missions.list.filter(m=>m.endsAt>now)});UI.render();}});
return {TYPES,createDaily,createFocus,createClass,createRaid,complete,fail};})();

/* ====== Inventory / Shop ====== */
Features.Inventory=(()=>{const addKey=(n=1)=>State.set(s=>{s.inventory.keys+=n});const addCons=(k,n=1)=>State.set(s=>{s.inventory.consumables[k]=(s.inventory.consumables[k]||0)+n});
const use=(k,id)=>{const s=State.get();const m=s.missions.list.find(x=>x.id===id);if(!m){UI.Notif.toast('Misión no encontrada','err');return;}if((s.inventory.consumables[k]||0)<=0){UI.Notif.toast('No tienes ese consumible','warn');return;}
if(k==='time'){State.set(st=>{st.missions.list=st.missions.list.map(x=>x.id===id?{...x,endsAt:x.endsAt+2*3600*1000}:x);st.inventory.consumables.time-=1});UI.Notif.toast('+2h aplicadas','ok')}
if(k==='fuerza'){State.set(st=>{const i=st.missions.list.findIndex(x=>x.id===id);if(i>=0){const mm={...st.missions.list[i]};mm.meta=mm.meta||{};mm.meta.reqMult=(mm.meta.reqMult||1)*0.5;mm.meta.uses={...(mm.meta.uses||{}),fuerza:true};st.missions.list[i]=mm;}st.inventory.consumables.fuerza-=1});UI.Notif.toast('Fuerza aplicada (½ req)','ok')}
if(k==='exp'){Features.Progression.buff(30);State.set(st=>{st.inventory.consumables.exp-=1});UI.Notif.toast('Buff EXP +20% (30m)','ok')}
if(k==='curas'){Features.Progression.clear();State.set(st=>{st.inventory.consumables.curas-=1});UI.Notif.toast('Nerf limpiado','ok')}
UI.render();};
return {addKey,addCons,use};})();

Features.Shop=(()=>{const prices={exp:50,curas:20,time:30,fuerza:40,key:100,equip_dagas:60,equip_arco_rojo:80,equip_gafas:40,equip_ropa_negra:70};
const buy=item=>{const s=State.get();const price=prices[item];if(price==null)return;if(s.economy.coins<price){UI.Notif.ask('Faltan monedas.','yellow',{ok:'Entendido',icon:I.objetoEspecial});return;}
State.set(st=>{st.economy.coins-=price});if(item==='key')Features.Inventory.addKey(1);else if(['exp','curas','time','fuerza'].includes(item))Features.Inventory.addCons(item,1);else State.set(st=>{st.inventory.equipment[item]=true});
UI.Notif.toast('Compra realizada','ok');UI.render();};
return {prices,buy};})();

/* ====== UI ====== */
const UI=(()=>{const modalRoot=()=>document.getElementById('modalRoot');const toastRoot=()=>document.getElementById('toastRoot');
const ask=(text,color='blue',{ok='Aceptar',cancel,icon}={})=>new Promise(res=>{const root=modalRoot();root.classList.add('is-open');root.classList.remove('modal--blue','modal--purple','modal--red','modal--yellow','modal--green');const skin=color==='purple'?'modal--purple':color==='red'?'modal--red':color==='yellow'?'modal--yellow':color==='green'?'modal--green':'modal--blue';root.classList.add(skin);
const tag=color==='blue'?'tag--blue':color==='purple'?'tag--purple':color==='red'?'tag--red':color==='yellow'?'tag--yellow':'tag--green';
root.innerHTML=`<div class="modal">
  <div class="kv"><span class="tag ${tag}">${color.toUpperCase()}</span></div>
  <div class="flex" style="justify-content:flex-start;gap:10px">
    ${icon?`<img src="${icon}" alt="" style="width:40px;height:40px;object-fit:contain" onerror="this.style.display='none'">`:''}
    <h3 class="modal__title" style="margin:0">${text}</h3>
  </div>
  <div class="modal__actions">
    ${cancel?`<button class="btn btn--ghost" id="mCancel">`+(cancel||'Cancelar')+`</button>`:''}
    <button class="btn" id="mOk">${ok}</button>
  </div>
</div>`;
const close=v=>{root.classList.remove('is-open');root.innerHTML='';res(v)};root.querySelector('#mOk').onclick=()=>close(true);const c=root.querySelector('#mCancel');if(c)c.onclick=()=>close(false);
try{new Audio('notif-open.mp3').play().catch(()=>{})}catch{}});
const toast=(text,level='info')=>{const el=document.createElement('div');el.className=`toast toast--${level==='ok'?'ok':level==='warn'?'warn':level==='err'?'err':'info'}`;el.textContent=text;toastRoot().appendChild(el);setTimeout(()=>el.remove(),2500)};

/* HUD */
const byId=id=>document.getElementById(id);
const renderHUD=()=>{const s=State.get();byId('playerName').textContent=s.profile.name;byId('playerLevel').textContent=`Lvl ${s.economy.level}`;byId('playerCoins').textContent=`🪙 ${s.economy.coins}`;
const xpN=Features.Progression.reqXp(s.economy.level), cxpN=Features.Progression.reqCXp(s.economy.classLevel);const xpPct=Math.round((s.economy.xp/xpN)*100), cxpPct=Math.round((s.economy.classXp/cxpN)*100);
byId('xpBar').style.width=`${Math.max(0,Math.min(100,xpPct))}%`;byId('classXpBar').style.width=`${Math.max(0,Math.min(100,cxpPct))}%`;byId('xpText').textContent=`${s.economy.xp} / ${xpN}`;byId('classXpText').textContent=`${s.economy.classXp} / ${cxpN}`;};

/* Router */
const routes={'#/misiones':renderMissions,'#/tienda':renderShop,'#/inventario':renderInventory,'#/clases':renderClasses,'#/perfil':renderProfile};
const setActive=hash=>document.querySelectorAll('.tab').forEach(b=>{if(b.dataset.route===hash)b.classList.add('is-active');else b.classList.remove('is-active')});
const navigate=hash=>{if(!routes[hash])hash='#/misiones';routes[hash]();setActive(hash);renderHUD()};const initTabs=()=>document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{window.location.hash=b.dataset.route});

/* Screens */
function renderMissions(){const s=State.get();const v=byId('view');
const cards=s.missions.list.map(m=>`
  <div class="card mission">
    <div class="mission__head">
      <strong>${m.name} <small>(${m.type}${m.meta?.hard?' · Versión dura':''})</small></strong>
      <span class="mission__timer" data-id="${m.id}">${U.hms(U.secondsLeft(m.endsAt))}</span>
    </div>
    ${m.meta?.exercises?.length?`<div class="kv">${m.meta.exercises.map(e=>{
      if(e.type==='reps')return `<span>${e.name}: ${Math.ceil((e.reps||0)*(m.meta.reqMult||1))} × ${e.rounds||1}</span>`;
      if(e.type==='secs')return `<span>${e.name}: ${Math.ceil((e.secs||0)*(m.meta.reqMult||1))}s × ${e.rounds||1}</span>`;
      if(e.type==='reps-2r'&&Array.isArray(e.reps))return `<span>${e.name}: ${e.reps.map(r=>Math.ceil(r*(m.meta.reqMult||1))).join(' / ')} (2 rondas)</span>`;
      if(e.type==='alt')return `<span>${e.name}: ${e.reps} (alterno)</span>`;
      if(e.type==='pack')return `<span>Pack sombra/golpeo</span>`;
      return `<span>${e.name}</span>`;}).join('')}</div>`:''}
    <div class="kv">
      ${m.reward?.xp?`<span>+${m.reward.xp} XP</span>`:''}
      ${m.reward?.classXp?`<span>+${m.reward.classXp} XP Clase</span>`:''}
      ${m.reward?.coins?`<span>+${m.reward.coins} 🪙</span>`:''}
    </div>
    <div class="flex">
      <button class="btn btn--ok" data-action="complete" data-id="${m.id}"><img src="${I.ok}" onerror="this.style.display='none'"> Marcar completada</button>
      ${m.type!=='Clase'?`<button class="btn btn--err" data-action="fail" data-id="${m.id}"><img src="${I.cancel}" onerror="this.style.display='none'"> Fallar</button>`:''}
    </div>
    <div class="kv" style="margin-top:8px">
      <span>Consumibles:</span>
      <button class="btn btn--ghost" data-use="time" data-id="${m.id}"><img src="${I.pocionTiempo}" onerror="this.style.display='none'"> +2h</button>
      <button class="btn btn--ghost" data-use="fuerza" data-id="${m.id}"><img src="${I.pocionFuerza}" onerror="this.style.display='none'"> ½ req</button>
      <button class="btn btn--ghost" data-use="exp" data-id="${m.id}"><img src="${I.pocionExp}" onerror="this.style.display='none'"> EXP +20% (30m)</button>
      <button class="btn btn--ghost" data-use="curas" data-id="${m.id}"><img src="${I.curas}" onerror="this.style.display='none'"> Curas</button>
    </div>
  </div>`).join('');
v.innerHTML=`
  <section class="section grid cols-2">
    <div class="card">
      <h3>Acciones</h3>
      <div class="flex">
        <button class="btn" id="btnFocus"><img src="${I.focus}" onerror="this.style.display='none'"> + Focus</button>
        <button class="btn btn--class" id="btnClass"><img src="${I.clase}" onerror="this.style.display='none'"> + Clase</button>
        <button class="btn btn--urgent" id="btnRaid"><img src="${I.llave}" onerror="this.style.display='none'"> Asalto (llave)</button>
      </div>
      <div class="kv" style="margin-top:8px">
        <span>Focus hoy: ${s.missions.counts.focusToday}/2</span>
        <span>Clase hoy: ${s.missions.counts.classToday}/2</span>
      </div>
    </div>
    <div class="card">
      <h3>Historial</h3>
      <div style="max-height:220px;overflow:auto">
        ${s.missions.history.map(h=>`<div class="kv"><span>${new Date(h.ts).toLocaleString()}</span><span>${h.type}</span><span>${h.status}</span><span>${h.name}</span></div>`).join('')}
      </div>
    </div>
  </section>
  <section class="section"><h3>Misiones activas</h3>${cards||'<div class="kv"><span>Sin misiones</span></div>'}</section>
`;
byId('btnFocus').onclick=()=>Features.Missions.createFocus(State.get().profile.zone);
byId('btnClass').onclick=()=>Features.Missions.createClass();
byId('btnRaid').onclick=()=>Features.Missions.createRaid();
v.querySelectorAll('[data-action="complete"]').forEach(b=>b.onclick=()=>Features.Missions.complete(b.dataset.id));
v.querySelectorAll('[data-action="fail"]').forEach(b=>b.onclick=()=>Features.Missions.fail(b.dataset.id));
v.querySelectorAll('[data-use]').forEach(b=>b.onclick=()=>Features.Inventory.use(b.dataset.use,b.dataset.id));
}

function renderShop(){const v=byId('view');const eq=State.get().inventory.equipment||{};const tab=v.dataset.shopTab||'consumibles';
v.innerHTML=`<section class="section">
  <h3>Tienda</h3>
  <div class="kv">
    <button class="btn ${tab==='consumibles'?'':'btn--ghost'}" data-tab="consumibles"><img src="${I.consumibles}" onerror="this.style.display='none'"> Consumibles</button>
    <button class="btn ${tab==='cosmeticos'?'':'btn--ghost'}" data-tab="cosmeticos"><img src="${I.cosmeticos}" onerror="this.style.display='none'"> Cosméticos</button>
  </div>
  ${tab==='consumibles'?`
  <div class="grid cols-2" style="margin-top:8px">
    <div class="card"><h4>Consumibles</h4><div class="flex">
      <button class="btn" data-buy="time"><img src="${I.pocionTiempo}" onerror="this.style.display='none'"> +2h — 30</button>
      <button class="btn" data-buy="fuerza"><img src="${I.pocionFuerza}" onerror="this.style.display='none'"> ½ req — 40</button>
      <button class="btn" data-buy="exp"><img src="${I.pocionExp}" onerror="this.style.display='none'"> EXP +20% (30m) — 50</button>
      <button class="btn" data-buy="curas"><img src="${I.curas}" onerror="this.style.display='none'"> Curas — 20</button>
      <button class="btn" data-buy="key"><img src="${I.llave}" onerror="this.style.display='none'"> Llave — 100</button>
    </div></div>
    <div class="card"><h4>Creador</h4>
      <div class="kv">
        <span>Crear clase personalizada — 200 🪙</span>
        <span>Crear prueba normal — 10 🪙 (60 XP, 8 🪙)</span>
        <span>Crear prueba élite — 50 🪙 (80 XP, 10 🪙, 20% objeto raro)</span>
      </div>
    </div>
  </div>`:`
  <div class="grid cols-2" style="margin-top:8px">
    <div class="card"><h4>Cosméticos</h4>
      <div class="kv">
        ${['equip_dagas','equip_arco_rojo','equip_gafas','equip_ropa_negra'].map(k=>{
          const label=k==='equip_dagas'?'Dagas dobles (60)':k==='equip_arco_rojo'?'Arco rojo (80)':k==='equip_gafas'?'Gafas de combate (40)':'Ropa negra (70)';
          return `<span>${label} ${eq[k]?'✓':''}</span>`;
        }).join('')}
      </div>
      <div class="flex" style="margin-top:8px">
        <button class="btn" data-buy="equip_dagas"><img src="${I.dagas}" onerror="this.style.display='none'"> Dagas</button>
        <button class="btn" data-buy="equip_arco_rojo"><img src="${I.arco}" onerror="this.style.display='none'"> Arco</button>
        <button class="btn" data-buy="equip_gafas"><img src="${I.gafas}" onerror="this.style.display='none'"> Gafas</button>
        <button class="btn" data-buy="equip_ropa_negra"><img src="${I.ropa}" onerror="this.style.display='none'"> Ropa</button>
      </div>
    </div>
  </div>`}
</section>`;
v.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{v.dataset.shopTab=b.dataset.tab;renderShop()});
v.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>Features.Shop.buy(b.dataset.buy));
}

function renderInventory(){const s=State.get();const v=byId('view');const c=s.inventory.consumables;const eq=s.inventory.equipment||{};
v.innerHTML=`<section class="section grid cols-2">
  <div class="card"><h3>Inventario</h3>
    <div class="kv">
      <span><img class="icon-inline" src="${I.llave}" onerror="this.style.display='none'"> Llaves: ${s.inventory.keys}</span>
      <span><img class="icon-inline" src="${I.pocionExp}" onerror="this.style.display='none'"> EXP: ${c.exp||0}</span>
      <span><img class="icon-inline" src="${I.curas}" onerror="this.style.display='none'"> Curas: ${c.curas||0}</span>
      <span><img class="icon-inline" src="${I.pocionTiempo}" onerror="this.style.display='none'"> Tiempo: ${c.time||0}</span>
      <span><img class="icon-inline" src="${I.pocionFuerza}" onerror="this.style.display='none'"> Fuerza: ${c.fuerza||0}</span>
    </div>
    <h4 style="margin-top:8px">Objetos raros</h4>
    <div class="kv">${(s.inventory.rare||[]).map(r=>`<span><img class="icon-inline" src="${r.png||I.objetoEspecial}" onerror="this.style.display='none'"> ${r.name} ${r.used?'(Usado)':''}</span>`).join('')||'<span>Ninguno</span>'}</div>
  </div>
  <div class="card"><h3>Personaje</h3>
    <img src="${I.logofondo}" alt="" style="width:100%;opacity:.15" onerror="this.style.display='none'">
    <div class="kv"><span>Clase: ${s.profile.class}</span></div>
    <h4 style="margin-top:8px">Equipo</h4>
    <div class="kv">${Object.keys(eq).length?Object.keys(eq).map(k=>`<span>${k.replace('equip_','')} ✓</span>`).join(''):'<span>Sin equipo</span>'}</div>
  </div>
</section>`;
}

function renderClasses(){const v=byId('view');const classes=['Guerrero','Asesino','Mago','Arquero','Espía','Maratón','Amigo del dragón','Saltamontes'];
v.innerHTML=`<section class="section"><h3>Clases</h3>
<div class="grid cols-2">
  ${classes.map(c=>`<div class="card flex" style="justify-content:space-between;align-items:center">
    <div><strong>${c}</strong><div class="kv"><span>Coste cambio: 10 🪙</span></div></div>
    <img src="${I.clasePNG(c)}" alt="" style="height:64px" onerror="this.style.display='none'">
    <button class="btn btn--class" data-class="${c}"><img src="${I.clase}" onerror="this.style.display='none'"> Elegir</button>
  </div>`).join('')}
</div></section>`;
v.querySelectorAll('[data-class]').forEach(b=>b.onclick=()=>Features.Profile.setClass(b.dataset.class));
}

function renderProfile(){const s=State.get();const v=byId('view');
v.innerHTML=`<section class="section grid cols-2">
  <div class="card">
    <h3>Perfil</h3>
    <div class="flex">
      <input id="inpName" class="btn--ghost" style="flex:1;padding:10px;border-radius:10px;border:1px solid var(--line);background:#0a1226;color:var(--text)" value="${s.profile.name}">
      <button class="btn" id="btnRename"><img src="${I.ok}" onerror="this.style.display='none'"> Guardar nombre</button>
    </div>
    <div class="kv" style="margin-top:8px">
      <span>Zona de suerte (Focus):</span>
      ${['Abdomen','Brazos','Piernas','Pecho','Espalda','Hombros'].map(z=>`<button class="btn btn--ghost" data-zone="${z}">${z}</button>`).join('')}
    </div>
    <div class="kv" style="margin-top:8px">
      <span>Nivel: ${s.economy.level} (${s.economy.xp}/${Features.Progression.reqXp(s.economy.level)})</span>
      <span>Monedas: ${s.economy.coins}</span>
      <span>Nerf: ${s.economy.nerfStacks} stacks</span>
      <span>Nivel Clase: ${s.economy.classLevel} (${s.economy.classXp}/${Features.Progression.reqCXp(s.economy.classLevel)})</span>
    </div>
    <div class="flex" style="margin-top:8px">
      <button class="btn btn--ok" id="btnSave"><img src="${I.save}" onerror="this.style.display='none'"> Guardar perfil</button>
    </div>
  </div>
  <div class="card">
    <h3>Perfiles guardados</h3>
    <div id="slots">${s.profileSlots.map((p,i)=>`<div class="flex" style="justify-content:space-between"><span>${p.name}</span><button class="btn" data-load="${i}"><img src="${I.load}" onerror="this.style.display='none'"> Cargar</button></div>`).join('')||'<div class="kv"><span>Sin perfiles</span></div>'}</div>
  </div>
</section>`;
byId('btnRename').onclick=()=>{const val=byId('inpName').value.trim();Features.Profile.setName(val);renderHUD();toast('Nombre actualizado','ok')};
byId('btnSave').onclick=()=>Features.Profile.save(`Perfil ${new Date().toLocaleString()}`);
v.querySelectorAll('[data-load]').forEach(b=>b.onclick=()=>Features.Profile.load(parseInt(b.dataset.load,10)));
v.querySelectorAll('[data-zone]').forEach(b=>b.onclick=()=>{Features.Profile.setZone(b.dataset.zone);toast('Zona de suerte: '+b.dataset.zone,'ok')});
}

/* Helpers render */
function render(){renderHUD();const hash=window.location.hash||'#/misiones';(routes[hash]||renderMissions)();setActive(hash);
document.querySelectorAll('.mission__timer').forEach(el=>{const id=el.dataset.id;const m=State.get().missions.list.find(x=>x.id===id);if(m)el.textContent=U.hms(U.secondsLeft(m.endsAt))});}

return {render,Notif:{ask,toast},navigate,initTabs};})();

/* ====== Profile ====== */
Features.Profile=(()=>{const save=name=>{const snap=State.get();State.set(s=>{s.profileSlots.unshift({name,snapshot:snap})});UI.Notif.toast('Perfil guardado','ok')};
const load=idx=>{const slot=State.get().profileSlots[idx];if(!slot)return;State.set(_=>slot.snapshot);UI.Notif.toast('Perfil cargado','ok');UI.render()};
const setName=name=>State.set(s=>{s.profile.name=name||'Jugador'});const setClass=cls=>{const coins=State.get().economy.coins;if(coins<10){UI.Notif.toast('Faltan monedas (10)','warn');return;}State.set(s=>{s.economy.coins-=10;s.profile.class=cls});UI.Notif.toast(`Clase cambiada a ${cls}`,'ok');UI.render()};
const setZone=z=>State.set(s=>{s.profile.zone=z});return {save,load,setName,setClass,setZone};})();

/* ====== Bootstrap ====== */
(function(){State.hydrate();State.ensureResets();document.addEventListener('DOMContentLoaded',()=>{
  UI.initTabs();
  const s=State.get();if(s.missions.dailyOfDayKey!==Core.dateKey())Features.Missions.createDaily();if(!s.missions.list.some(m=>m.type==='Clase'))Features.Missions.createClass();
  window.addEventListener('hashchange',()=>UI.render());if(!window.location.hash)window.location.hash='#/misiones';
  Core.startTick();Core.on('tick:1s',()=>{document.querySelectorAll('.mission__timer').forEach(el=>{const id=el.dataset.id;const m=State.get().missions.list.find(x=>x.id===id);if(m)el.textContent=U.hms(U.secondsLeft(m.endsAt))})});
  if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').catch(()=>{})}
  UI.render();
})(); 
