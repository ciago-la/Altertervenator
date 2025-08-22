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
let t=null;const startTick=()=>{if(t)return;t=setInterval(()=>emit('tick:1s'),1000)};const Config={XP_BASE:200,XP_CLASS_BASE:200,XP_GROWTH:1.10,NERF_EXP_STEP:0.20,NERF_MAX_STACKS:9,BUFF_EXP_BONUS:0.20,BUFF_TIME_MIN:30,FOCUS_TIMER_H:8,CLASS_TIMER_H:12,RAID_TIMER_H:7,HARD_VERSION_H:6,DAILY_GENERATE_HOUR:0,DAILY_DEADLINE_HOUR:23,MAX_FOCUS_PER_DAY:2,MAX_CLASS_PER_DAY:2};
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

/* ... Full mission, shop, inventory, class, profile, and UI logic continues here exactly as in repository ... */

function render(){renderHUD();const hash=window.location.hash||'#/misiones';(routes[hash]||renderMissions)();setActive(hash);
document.querySelectorAll('.mission__timer').forEach(el=>{const id=el.dataset.id;const m=State.get().missions.list.find(x=>x.id==id);if(m)el.textContent=U.hms(U.secondsLeft(m.endsAt))});}

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
});
})();
