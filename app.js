/* Altervenator — App (V2.1) con PNGs+colores en notifs y tabs fijas */

const Core = (() => {
  const listeners = new Map();
  const on = (e,f)=>{ if(!listeners.has(e)) listeners.set(e,new Set()); listeners.get(e).add(f); return ()=>listeners.get(e)?.delete(f); };
  const emit = (e,p)=>listeners.get(e)?.forEach(f=>f(p));
  const STORAGE_KEY='altervenator:v2';
  const save=(partial)=>{ const cur=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'); localStorage.setItem(STORAGE_KEY, JSON.stringify({...cur,...partial})); };
  const load=()=>JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
  let tick=null; const startTick=()=>{ if(tick) return; tick=setInterval(()=>emit('tick:1s'),1000); };
  const Config={XP_BASE:200,XP_CLASS_BASE:200,XP_GROWTH:1.10,NERF_EXP_STEP:0.20,NERF_MISSIONS_PER_STACK:3,NERF_MAX_STACKS:3,BUFF_EXP_BONUS:0.20,BUFF_TIME_MIN:30,FOCUS_TIMER_H:8,CLASS_TIMER_H:12,RAID_TIMER_H:7,HARD_VERSION_H:6,DAILY_GENERATE_HOUR:0,DAILY_DEADLINE_HOUR:23,MAX_FOCUS_PER_DAY:2,MAX_CLASS_PER_DAY:2};
  const dateKey=(d=new Date())=>d.toISOString().slice(0,10);
  const isoWeekKey=(d=new Date())=>{
    const t=new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day=t.getUTCDay()||7; t.setUTCDate(t.getUTCDate()+4-day);
    const y0=new Date(Date.UTC(t.getUTCFullYear(),0,1));
    const wk=Math.ceil((((t - y0)/86400000)+1)/7);
    return `${t.getUTCFullYear()}-W${String(wk).padStart(2,'0')}`;
  };
  return {on,emit,save,load,startTick,Config,dateKey,isoWeekKey};
})();

const State = (() => {
  let state = {
    profile:{name:'Jugador',class:'Guerrero',zone:'Abdomen'},
    economy:{level:1,xp:0,coins:150,classLevel:1,classXp:0,nerfStacks:0,buffUntilTs:0},
    missions:{list:[],history:[],counts:{dayKey:null,weekKey:null,focusToday:0,classToday:0,urgentsThisWeek:0},pityWeekPercent:10,dailyOfDayKey:null},
    inventory:{keys:0,rare:[],consumables:{exp:0,curas:0,time:0,fuerza:0},equipment:{}},
    profileSlots:[]
  };
  const subscribers=new Set();
  const get = ()=>structuredClone(state);
  const set = (producer)=>{ const d=structuredClone(state); producer(d); state=d; subscribers.forEach(fn=>fn(get())); Core.save({state}); };
  const subscribe=(fn)=>{ subscribers.add(fn); return ()=>subscribers.delete(fn); };
  const hydrate=()=>{ const s=Core.load(); if(s?.state) state=s.state; };
  const ensureResets=()=>{
    const today=Core.dateKey(), week=Core.isoWeekKey();
    if (state.missions.counts.dayKey!==today){
      state.missions.counts.dayKey=today; state.missions.counts.focusToday=0; state.missions.counts.classToday=0; state.missions.dailyOfDayKey=null;
      const now=Date.now();
      const expired=state.missions.list.filter(m=>m.type==='Diaria' && m.endsAt<now);
      if (expired.length){
        expired.forEach(m=>{
          state.economy.coins-=6;
          state.economy.nerfStacks=Math.min(state.economy.nerfStacks+1, Core.Config.NERF_MAX_STACKS);
          state.missions.history.unshift({ts:now,id:m.id,name:m.name,type:m.type,status:'failed-auto',penalty:{coins:6,nerf:true}});
        });
        state.missions.list = state.missions.list.filter(m=>!(m.type==='Diaria' && m.endsAt<now));
      }
    }
    if (state.missions.counts.weekKey!==week){
      state.missions.counts.weekKey=week; state.missions.counts.urgentsThisWeek=0;
      state.missions.pityWeekPercent = Math.min(30, (state.missions.pityWeekPercent||10)+5);
    }
  };
  return {get,set,subscribe,hydrate,ensureResets};
})();

const U = (()=>{ const now=()=>Date.now(); const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const secondsLeft=(ts)=>Math.max(0, Math.floor((ts-Date.now())/1000));
  const hms=(s)=>`${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const pick=arr=>arr[Math.floor(Math.random()*arr.length)];
  const roundMult=(n,m=5)=>Math.round(n/m)*m;
  return {now,clamp,secondsLeft,hms,pick,roundMult};
})();

/* ====== Progression ====== */
const Features = {};
Features.Progression = (()=>{
  const R=Core.Config;
  const requiredXp = lvl=>Math.round(R.XP_BASE*Math.pow(R.XP_GROWTH, Math.max(0,lvl-1)));
  const requiredClassXp = lvl=>Math.round(R.XP_CLASS_BASE*Math.pow(R.XP_GROWTH, Math.max(0,lvl-1)));
  const expModifier=()=>{ const s=State.get(); let m=1; m*=(1-(s.economy.nerfStacks*R.NERF_EXP_STEP)); if (s.economy.buffUntilTs>Date.now()) m*=(1+R.BUFF_EXP_BONUS); return Math.max(0,m); };
  const addXp = xp=>State.set(s=>{ s.economy.xp+=Math.round(xp*expModifier()); let up=true; while(up){ up=false; const need=requiredXp(s.economy.level); if(s.economy.xp>=need){ s.economy.xp-=need; s.economy.level++; up=true; } } });
  const addClassXp = xp=>State.set(s=>{ s.economy.classXp+=Math.round(xp*expModifier()); let up=true; while(up){ up=false; const need=requiredClassXp(s.economy.classLevel); if(s.economy.classXp>=need){ s.economy.classXp-=need; s.economy.classLevel++; up=true; } } });
  const addCoins=n=>State.set(s=>{ s.economy.coins+=n; });
  const applyNerf=()=>State.set(s=>{ s.economy.nerfStacks = U.clamp(s.economy.nerfStacks+1,0,Core.Config.NERF_MAX_STACKS); });
  const clearNerf=()=>State.set(s=>{ s.economy.nerfStacks=0; });
  const applyBuff=(min=Core.Config.BUFF_TIME_MIN)=>State.set(s=>{ s.economy.buffUntilTs=Date.now()+min*60*1000; });
  return {requiredXp,requiredClassXp,addXp,addClassXp,addCoins,applyNerf,clearNerf,applyBuff};
})();

/* ====== Data (igual V2) ====== */
const Data = (()=>{
  const dailyCalendar={1:[{name:'Flexiones',reps:5,rounds:2,type:'reps'},{name:'Sentadillas',reps:10,rounds:2,type:'reps'},{name:'Abdominales',reps:20,rounds:2,type:'reps'}],2:[{name:'Dominadas',reps:[5,3],rounds:1,type:'reps-2r'},{name:'Zancadas',reps:'4/4',rounds:1,type:'alt'},{name:'Puente de glúteo',reps:7,rounds:1,type:'reps'}],3:[{name:'Fondos tríceps',reps:5,rounds:1,type:'reps'},{name:'Patada lateral desde cuadrupedia',reps:3,rounds:2,type:'reps'},{name:'Plancha',secs:10,rounds:1,type:'secs'}],4:null,5:null,6:null,0:[{name:'Elevación de piernas',reps:5,rounds:2,type:'reps'},{name:'Combo patadas variadas',reps:'pack',rounds:1,type:'pack'},{name:'Sombra intensa',secs:30,rounds:1,type:'secs'}]};
  dailyCalendar[4]=dailyCalendar[1]; dailyCalendar[5]=dailyCalendar[2]; dailyCalendar[6]=dailyCalendar[3];
  const focusByZone={'Abdomen':['Crunches','Elevación de piernas','Criss cross','Plancha'],'Brazos':['Fondos de tríceps','Curl de bíceps con peso','Flexiones de tríceps','Dominadas supinas'],'Piernas':['Sentadillas','Zancadas','Puente de glúteos','Sentadillas con salto'],'Pecho':['Flexiones','Press pecho con peso','Aperturas','Rebotes de flexiones/press'],'Espalda':['Dominadas','Remo en plancha','Remo en banco','Cargadas'],'Hombros':['Elevaciones laterales','Flexiones en pica','Press militar','Elevaciones frontales']};
  const classPools={/* (igual que V2, abreviado por espacio) */};
  return {dailyCalendar,focusByZone,classPools};
})();

/* ====== Missions ====== */
Features.Missions = (()=>{
  const TYPES={DAILY:'Diaria',FOCUS:'Focus',CLASS:'Clase',URGENT:'Urgente',RAID:'Asalto'};
  const _pushHistory=e=>State.set(s=>{ s.missions.history.unshift({ts:Date.now(),...e}); });
  const _add=m=>State.set(s=>{ s.missions.list.push(m); });
  const _remove=id=>State.set(s=>{ const i=s.missions.list.findIndex(m=>m.id===id); if(i>=0) s.missions.list.splice(i,1); });
  const _new=({type,name,secs,reward,penalty,meta={}})=>({id:crypto.randomUUID(),type,name,createdAt:Date.now(),endsAt:Date.now()+secs*1000,reward,penalty,meta});

  const createDailyForToday=()=>{
    const today=new Date(); const dow=today.getDay(); const base=Data.dailyCalendar[dow]||Data.dailyCalendar[1];
    const s=State.get(); const lvl=s.economy.level; const mult=Math.pow(Core.Config.XP_GROWTH, Math.max(0,lvl-1)); const plusRounds=Math.floor((lvl-1)/3);
    const exercises=base.map(x=>{ const e={...x}; if(e.type==='reps') e.reps=U.roundMult(e.reps*mult,1); if(e.type==='secs') e.secs=Math.round(e.secs*mult); if(e.type==='reps-2r' && Array.isArray(e.reps)) e.reps=e.reps.map(r=>U.roundMult(r*mult,1)); e.rounds=(e.rounds||1)+plusRounds; return e; });
    const end=new Date(today); end.setHours(Core.Config.DAILY_DEADLINE_HOUR,59,59,0); const secs=Math.max(1, Math.floor((end.getTime()-Date.now())/1000));
    const reward={xp:40+(lvl-1)*5,coins:6+(lvl-1),classXp:0};
    const m=_new({type:TYPES.DAILY,name:'Misión Diaria',secs,reward,penalty:{coins:6,nerf:true,hard:true,hardMult:2.0},meta:{exercises,reqMult:1,uses:{}}});
    _add(m); State.set(st=>{ st.missions.dailyOfDayKey=Core.dateKey(); });
    UI.Notif.ask('Tienes una misión diaria. ¿Aceptas?','blue',{ok:'Aceptar',cancel:'Rechazar',icon:'logo.png'}).then(ok=>{ if(!ok){ _remove(m.id); _pushHistory({id:m.id,name:m.name,type:m.type,status:'rejected'}); } UI.render(); });
  };

  const createFocus=(zone)=>{
    const c=State.get().missions.counts; if(c.focusToday>=Core.Config.MAX_FOCUS_PER_DAY){ UI.Notif.ask('Límite diario de Focus alcanzado (2).','yellow',{ok:'Entendido',icon:'objetoespecial.png'}); return; }
    const lvl=State.get().economy.level; let reps=10; if(lvl>=5&&lvl<=9) reps=18; else if(lvl>=10&&lvl<=20) reps=25; else if(lvl>=21) reps=30;
    const ex=(Data.focusByZone[zone]||Data.focusByZone['Abdomen']).map(name=>({name,reps,rounds:1,type:'reps'}));
    const m=_new({type:TYPES.FOCUS,name:`Focus: ${zone}`,secs:Core.Config.FOCUS_TIMER_H*3600,reward:{xp:80,coins:10,classXp:0},penalty:{coins:8,nerf:true,hard:true,hardMult:1.5},meta:{exercises:ex,reqMult:1,uses:{}}});
    UI.Notif.ask(`Nueva misión Focus de ${zone}. ¿Aceptas?`,'blue',{ok:'Aceptar',cancel:'Rechazar',icon:'logo.png'}).then(ok=>{ if(ok){ _add(m); State.set(s=>{ s.missions.counts.focusToday++; }); UI.Notif.toast('Focus creada','info'); } else { _pushHistory({id:m.id,name:m.name,type:m.type,status:'rejected'}); } UI.render(); });
  };

  const pngForClass=(cls)=>({Guerrero:'guerrero.png',Asesino:'asesino.png',Mago:'mago.png',Arquero:'arquero.png',Espía:'espia.png',Maratón:'maraton.png','Amigo del dragón':'amigodeldragon.png',Saltamontes:'saltamontes.png'}[cls]||'logo.png');

  const createClass=()=>{
    const c=State.get().missions.counts; if(c.classToday>=Core.Config.MAX_CLASS_PER_DAY){ UI.Notif.ask('Límite diario de misiones de clase alcanzado (2).','yellow',{ok:'Entendido',icon:'objetoespecial.png'}); return; }
    const s=State.get(); const pool=(Data.classPools[s.profile.class]||[]).slice(0); const choices=pool.sort(()=>Math.random()-0.5).slice(0,2);
    const lvl=s.economy.classLevel; const reward={xp:0,classXp:70+(lvl-1)*5,coins:9+(lvl-1)};
    const m=_new({type:TYPES.CLASS,name:`Misión de Clase (${s.profile.class})`,secs:Core.Config.CLASS_TIMER_H*3600,reward,penalty:{none:true},meta:{exercises:choices.map(text=>({name:text})),reqMult:1,uses:{}}});
    UI.Notif.ask('Tienes una misión de clase disponible. ¿Aceptas?','purple',{ok:'Aceptar',cancel:'Rechazar',icon:pngForClass(s.profile.class)}).then(ok=>{ if(ok){ _add(m); State.set(st=>{ st.missions.counts.classToday++; }); UI.Notif.toast('Misión de clase creada','info'); } else { _pushHistory({id:m.id,name:m.name,type:m.type,status:'rejected'}); } UI.render(); });
  };

  const createRaid=()=>{
    const s=State.get(); if(s.inventory.keys<=0){ UI.Notif.ask('Te falta una llave de mazmorra.','yellow',{ok:'Entendido',icon:'llave.png'}); return; }
    State.set(st=>{ st.inventory.keys-=1; });
    const m=_new({type:TYPES.RAID,name:'Asalto a Mazmorra',secs:Core.Config.RAID_TIMER_H*3600,reward:{xp:200,coins:80,classXp:170},penalty:{coins:120,xp:150,classXp:50},meta:{exercises:[],reqMult:1,uses:{}}});
    _add(m); UI.Notif.toast('Asalto iniciado','info'); UI.render();
  };

  const complete=(id)=>{
    const m=State.get().missions.list.find(x=>x.id===id); if(!m) return;
    if (m.reward.xp) Features.Progression.addXp(m.reward.xp);
    if (m.reward.classXp) Features.Progression.addClassXp(m.reward.classXp);
    if (m.reward.coins) Features.Progression.addCoins(m.reward.coins);
    _remove(id); _pushHistory({id,name:m.name,type:m.type,status:'completed',reward:m.reward});
    UI.Notif.ask(`Has completado "${m.name}". Recompensa: ${m.reward.xp||0} XP, ${m.reward.classXp||0} XP Clase, ${m.reward.coins||0} 🪙`,'green',{ok:'Aceptar',icon:'objetoespecial.png'}); UI.render();
  };

  const fail=(id,opts={})=>{
    const m=State.get().missions.list.find(x=>x.id===id); if(!m) return;
    _remove(id);
    if (m.type==='Clase'){ _pushHistory({id,name:m.name,type:m.type,status:'failed',penalty:{none:true}}); UI.Notif.ask(`"${m.name}" fallida (sin penalización).`,'purple',{ok:'Aceptar',icon:'castigador.png'}); UI.render(); return; }
    if (!opts.noPenalty){
      if (m.penalty?.coins) Features.Progression.addCoins(-m.penalty.coins);
      if (m.penalty?.xp) Features.Progression.addXp(-m.penalty.xp);
      if (m.penalty?.classXp) Features.Progression.addClassXp(-m.penalty.classXp);
      if (m.penalty?.nerf) Features.Progression.applyNerf();
      if (m.penalty?.hard && !opts.skipHardOffer){
        const hard=_new({type:m.type,name:`${m.name} — Versión dura`,secs:Core.Config.HARD_VERSION_H*3600,reward:m.reward,penalty:{none:true},meta:{...(m.meta||{}),reqMult:(m.meta?.reqMult||1)*(m.penalty.hardMult||1.5),hard:true}});
        _add(hard);
        UI.Notif.ask(`Se ha creado "${hard.name}" (6h). Sin penalización si falla.`,'red',{ok:'Aceptar',icon:'castigador.png'});
      }
    }
    _pushHistory({id,name:m.name,type:m.type,status:'failed',penalty:m.penalty}); UI.render();
  };

  Core.on('tick:1s',()=>{
    const s=State.get(); const now=Date.now(); let changed=false;
    s.missions.list.forEach(m=>{
      if (m.endsAt<=now){
        changed=true;
        if (m.type==='Clase') { _pushHistory({id:m.id,name:m.name,type:m.type,status:'timeout'}); }
        else {
          if (m.penalty?.coins) Features.Progression.addCoins(-m.penalty.coins);
          if (m.penalty?.xp) Features.Progression.addXp(-m.penalty.xp);
          if (m.penalty?.classXp) Features.Progression.addClassXp(-m.penalty.classXp);
          if (m.penalty?.nerf) Features.Progression.applyNerf();
          _pushHistory({id:m.id,name:m.name,type:m.type,status:'timeout-penalized',penalty:m.penalty});
        }
      }
    });
    if (changed){ State.set(st=>{ st.missions.list=st.missions.list.filter(m=>m.endsAt>now); }); UI.render(); }
  });

  return {TYPES,createDailyForToday,createFocus,createClass,createRaid,complete,fail};
})();

/* ====== Inventory / Shop ====== */
Features.Inventory = (()=>{
  const addKey=(n=1)=>State.set(s=>{ s.inventory.keys+=n; });
  const addConsumable=(k,n=1)=>State.set(s=>{ s.inventory.consumables[k]=(s.inventory.consumables[k]||0)+n; });
  const useOnMission=(k,id)=>{
    const s=State.get(); const m=s.missions.list.find(x=>x.id===id); if(!m){ UI.Notif.toast('Misión no encontrada','err'); return; }
    if ((s.inventory.consumables[k]||0)<=0){ UI.Notif.toast('No tienes ese consumible','warn'); return; }
    if (k==='time'){ State.set(st=>{ st.missions.list = st.missions.list.map(x=>x.id===id?{...x,endsAt:x.endsAt+2*3600*1000}:x); st.inventory.consumables.time-=1; }); UI.Notif.toast('+2h aplicadas','ok'); }
    if (k==='fuerza'){ State.set(st=>{ const i=st.missions.list.findIndex(x=>x.id===id); if(i>=0){ const mm={...st.missions.list[i]}; mm.meta=mm.meta||{}; mm.meta.reqMult=(mm.meta.reqMult||1)*0.5; mm.meta.uses={...(mm.meta.uses||{}),fuerza:true}; st.missions.list[i]=mm; } st.inventory.consumables.fuerza-=1; }); UI.Notif.toast('Fuerza aplicada (½ req)','ok'); }
    if (k==='exp'){ Features.Progression.applyBuff(30); State.set(st=>{ st.inventory.consumables.exp-=1; }); UI.Notif.toast('Buff EXP +20% (30m)','ok'); }
    if (k==='curas'){ Features.Progression.clearNerf(); State.set(st=>{ st.inventory.consumables.curas-=1; }); UI.Notif.toast('Nerf limpiado','ok'); }
    UI.render();
  };
  return {addKey,addConsumable,useOnMission};
})();

Features.Shop = (()=>{
  const prices={exp:50,curas:20,time:30,fuerza:40,key:100,equip_dagas:60,equip_arco_rojo:80,equip_gafas:40,equip_ropa_negra:70};
  const buy=(item)=>{
    const s=State.get(); const price=prices[item]; if (price==null) return;
    if (s.economy.coins<price){ UI.Notif.ask('Faltan monedas.','yellow',{ok:'Entendido',icon:'objetoespecial.png'}); return; }
    State.set(st=>{ st.economy.coins-=price; });
    if (item==='key') Features.Inventory.addKey(1);
    else if (['exp','curas','time','fuerza'].includes(item)) Features.Inventory.addConsumable(item,1);
    else State.set(st=>{ st.inventory.equipment[item]=true; });
    UI.Notif.toast('Compra realizada','ok'); UI.render();
  };
  return {prices,buy};
})();

/* ====== UI ====== */
const UI = (()=>{
  const modalRoot=()=>document.getElementById('modalRoot');
  const toastRoot=()=>document.getElementById('toastRoot');

  // Modal con skin por color + icono PNG
  const ask=(text,color='blue',{ok='Aceptar',cancel,icon}={})=>new Promise(res=>{
    const root=modalRoot();
    root.classList.add('is-open');
    root.classList.remove('modal--blue','modal--purple','modal--red','modal--yellow','modal--green');
    const skin = color==='purple'?'modal--purple':color==='red'?'modal--red':color==='yellow'?'modal--yellow':color==='green'?'modal--green':'modal--blue';
    root.classList.add(skin);
    const tagClass=color==='blue'?'tag--blue':color==='purple'?'tag--purple':color==='red'?'tag--red':color==='yellow'?'tag--yellow':'tag--green';
    root.innerHTML=`
      <div class="modal">
        <div class="kv"><span class="tag ${tagClass}">${color.toUpperCase()}</span></div>
        <div class="flex" style="justify-content:flex-start;gap:10px">
          ${icon?`<img src="${icon}" alt="" style="width:40px;height:40px;object-fit:contain" onerror="this.style.display='none'">`:''}
          <h3 class="modal__title" style="margin:0">${text}</h3>
        </div>
        <div class="modal__actions">
          ${cancel?`<button class="btn btn--ghost" id="mCancel">${cancel}</button>`:''}
          <button class="btn" id="mOk">${ok}</button>
        </div>
      </div>`;
    const close=v=>{ root.classList.remove('is-open'); root.innerHTML=''; res(v); };
    root.querySelector('#mOk').onclick=()=>close(true);
    const cEl=root.querySelector('#mCancel'); if (cEl) cEl.onclick=()=>close(false);
    try{ new Audio('notif-open.mp3').play().catch(()=>{});}catch{}
  });

  const toast=(text,level='info')=>{
    const el=document.createElement('div');
    el.className=`toast toast--${level==='ok'?'ok':level==='warn'?'warn':level==='err'?'err':'info'}`;
    el.textContent=text; toastRoot().appendChild(el); setTimeout(()=>el.remove(),2500);
  };

  /* HUD */
  const renderHUD=()=>{
    const s=State.get();
    byId('playerName').textContent=s.profile.name;
    byId('playerLevel').textContent=`Lvl ${s.economy.level}`;
    byId('playerCoins').textContent=`🪙 ${s.economy.coins}`;
    const xpNeed=Features.Progression.requiredXp(s.economy.level);
    const classNeed=Features.Progression.requiredClassXp(s.economy.classLevel);
    const xpPct=Math.round((s.economy.xp/xpNeed)*100);
    const cxpPct=Math.round((s.economy.classXp/classNeed)*100);
    byId('xpBar').style.width=`${Math.max(0,Math.min(100,xpPct))}%`;
    byId('classXpBar').style.width=`${Math.max(0,Math.min(100,cxpPct))}%`;
    byId('xpText').textContent=`${s.economy.xp} / ${xpNeed}`;
    byId('classXpText').textContent=`${s.economy.classXp} / ${classNeed}`;
  };

  /* Router */
  const routes={'#/misiones':renderMissions,'#/tienda':renderShop,'#/inventario':renderInventory,'#/clases':renderClasses,'#/perfil':renderProfile};
  const setActiveTab=hash=>document.querySelectorAll('.tab').forEach(b=>{ if(b.dataset.route===hash) b.classList.add('is-active'); else b.classList.remove('is-active'); });
  const navigate=hash=>{ if(!routes[hash]) hash='#/misiones'; routes[hash](); setActiveTab(hash); renderHUD(); };
  const initTabs=()=>document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{ window.location.hash=b.dataset.route; });

  /* Screens */
  function renderMissions(){
    const s=State.get(); const v=byId('view');
    const missionsHtml = s.missions.list.map(m=>{
      return `
      <div class="card mission">
        <div class="mission__head">
          <strong>${m.name} <small>(${m.type}${m.meta?.hard?' · Versión dura':''})</small></strong>
          <span class="mission__timer" data-id="${m.id}">${U.hms(U.secondsLeft(m.endsAt))}</span>
        </div>
        ${m.meta?.exercises?.length ? `<div class="kv">${m.meta.exercises.map(e=>{
            if (e.type==='reps') return `<span>${e.name}: ${Math.ceil((e.reps||0)*(m.meta.reqMult||1))} × ${e.rounds||1}</span>`;
            if (e.type==='secs') return `<span>${e.name}: ${Math.ceil((e.secs||0)*(m.meta.reqMult||1))}s × ${e.rounds||1}</span>`;
            if (e.type==='reps-2r' && Array.isArray(e.reps)) return `<span>${e.name}: ${e.reps.map(r=>Math.ceil(r*(m.meta.reqMult||1))).join(' / ')} (2 rondas)</span>`;
            if (e.type==='alt') return `<span>${e.name}: ${e.reps} (alterno)</span>`;
            if (e.type==='pack') return `<span>Pack sombra/golpeo</span>`;
            return `<span>${e.name}</span>`;
        }).join('')}</div>`:''}
        <div class="kv">
          ${m.reward?.xp?`<span>+${m.reward.xp} XP</span>`:''}
          ${m.reward?.classXp?`<span>+${m.reward.classXp} XP Clase</span>`:''}
          ${m.reward?.coins?`<span>+${m.reward.coins} 🪙</span>`:''}
        </div>
        <div class="flex">
          <button class="btn btn--ok" data-action="complete" data-id="${m.id}"><img src="ok.png" onerror="this.style.display='none'"> Marcar completada</button>
          ${m.type!=='Clase'?`<button class="btn btn--err" data-action="fail" data-id="${m.id}"><img src="cancel.png" onerror="this.style.display='none'"> Fallar</button>`:''}
        </div>
        <div class="kv" style="margin-top:8px">
          <span>Consumibles:</span>
          <button class="btn btn--ghost" data-use="time" data-id="${m.id}"><img src="pociontiempo.png" onerror="this.style.display='none'"> +2h</button>
          <button class="btn btn--ghost" data-use="fuerza" data-id="${m.id}"><img src="pocionfuerza.png" onerror="this.style.display='none'"> ½ req</button>
          <button class="btn btn--ghost" data-use="exp" data-id="${m.id}"><img src="pocionexp.png" onerror="this.style.display='none'"> EXP +20% (30m)</button>
          <button class="btn btn--ghost" data-use="curas" data-id="${m.id}"><img src="curas.png" onerror="this.style.display='none'"> Curas</button>
        </div>
      </div>`;
    }).join('');
    v.innerHTML = `
      <section class="section grid cols-2">
        <div class="card">
          <h3>Acciones</h3>
          <div class="flex">
            <button class="btn" id="btnFocus"><img src="focus.png" onerror="this.style.display='none'"> + Focus</button>
            <button class="btn btn--class" id="btnClass"><img src="clase.png" onerror="this.style.display='none'"> + Clase</button>
            <button class="btn btn--urgent" id="btnRaid"><img src="llave.png" onerror="this.style.display='none'"> Asalto (llave)</button>
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
      <section class="section">
        <h3>Misiones activas</h3>
        ${missionsHtml || '<div class="kv"><span>Sin misiones</span></div>'}
      </section>
    `;
    byId('btnFocus').onclick=()=>Features.Missions.createFocus(State.get().profile.zone);
    byId('btnClass').onclick=()=>Features.Missions.createClass();
    byId('btnRaid').onclick=()=>Features.Missions.createRaid();
    v.querySelectorAll('[data-action="complete"]').forEach(b=>b.onclick=()=>Features.Missions.complete(b.dataset.id));
    v.querySelectorAll('[data-action="fail"]').forEach(b=>b.onclick=()=>Features.Missions.fail(b.dataset.id));
    v.querySelectorAll('[data-use]').forEach(b=>b.onclick=()=>Features.Inventory.useOnMission(b.dataset.use, b.dataset.id));
  }

  function renderShop(){
    const v=byId('view'); const eq=State.get().inventory.equipment||{}; const tab=v.dataset.shopTab||'consumibles';
    v.innerHTML = `
      <section class="section">
        <h3>Tienda</h3>
        <div class="kv">
          <button class="btn ${tab==='consumibles'?'':'btn--ghost'}" data-tab="consumibles"><img src="consumibles.png" onerror="this.style.display='none'"> Consumibles</button>
          <button class="btn ${tab==='cosmeticos'?'':'btn--ghost'}" data-tab="cosmeticos"><img src="cosmeticos.png" onerror="this.style.display='none'"> Cosméticos</button>
        </div>
        ${tab==='consumibles' ? `
          <div class="grid cols-2" style="margin-top:8px">
            <div class="card">
              <h4>Consumibles</h4>
              <div class="flex">
                <button class="btn" data-buy="time"><img src="pociontiempo.png" onerror="this.style.display='none'"> +2h — 30</button>
                <button class="btn" data-buy="fuerza"><img src="pocionfuerza.png" onerror="this.style.display='none'"> ½ req — 40</button>
                <button class="btn" data-buy="exp"><img src="pocionexp.png" onerror="this.style.display='none'"> EXP +20% (30m) — 50</button>
                <button class="btn" data-buy="curas"><img src="curas.png" onerror="this.style.display='none'"> Curas — 20</button>
                <button class="btn" data-buy="key"><img src="llave.png" onerror="this.style.display='none'"> Llave — 100</button>
              </div>
            </div>
            <div class="card">
              <h4>Creador</h4>
              <div class="kv">
                <span>Crear clase personalizada — 200 🪙</span>
                <span>Crear prueba normal — 10 🪙 (60 XP, 8 🪙)</span>
                <span>Crear prueba élite — 50 🪙 (80 XP, 10 🪙, 20% objeto raro)</span>
              </div>
            </div>
          </div>
        ` : `
          <div class="grid cols-2" style="margin-top:8px">
            <div class="card">
              <h4>Cosméticos</h4>
              <div class="kv">
                ${['equip_dagas','equip_arco_rojo','equip_gafas','equip_ropa_negra'].map(k=>{
                  const label = k==='equip_dagas'?'Dagas dobles (60)':k==='equip_arco_rojo'?'Arco rojo (80)':k==='equip_gafas'?'Gafas de combate (40)':'Ropa negra (70)';
                  return `<span>${label} ${eq[k]?'✓':''}</span>`;
                }).join('')}
              </div>
              <div class="flex" style="margin-top:8px">
                <button class="btn" data-buy="equip_dagas"><img src="dagas.png" onerror="this.style.display='none'"> Dagas</button>
                <button class="btn" data-buy="equip_arco_rojo"><img src="arco.png" onerror="this.style.display='none'"> Arco</button>
                <button class="btn" data-buy="equip_gafas"><img src="gafas.png" onerror="this.style.display='none'"> Gafas</button>
                <button class="btn" data-buy="equip_ropa_negra"><img src="ropa.png" onerror="this.style.display='none'"> Ropa</button>
              </div>
            </div>
          </div>
        `}
      </section>
    `;
    v.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{ v.dataset.shopTab=b.dataset.tab; renderShop(); });
    v.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>Features.Shop.buy(b.dataset.buy));
  }

  function renderInventory(){
    const s=State.get(); const v=byId('view'); const cons=s.inventory.consumables; const eq=s.inventory.equipment||{};
    v.innerHTML = `
      <section class="section grid cols-2">
        <div class="card"><h3>Inventario</h3>
          <div class="kv">
            <span><img class="icon-inline" src="llave.png" onerror="this.style.display='none'"> Llaves: ${s.inventory.keys}</span>
            <span><img class="icon-inline" src="pocionexp.png" onerror="this.style.display='none'"> EXP: ${cons.exp||0}</span>
            <span><img class="icon-inline" src="curas.png" onerror="this.style.display='none'"> Curas: ${cons.curas||0}</span>
            <span><img class="icon-inline" src="pociontiempo.png" onerror="this.style.display='none'"> Tiempo: ${cons.time||0}</span>
            <span><img class="icon-inline" src="pocionfuerza.png" onerror="this.style.display='none'"> Fuerza: ${cons.fuerza||0}</span>
          </div>
          <h4 style="margin-top:8px">Objetos raros</h4>
          <div class="kv">${(s.inventory.rare||[]).map(r=>`<span><img class="icon-inline" src="${r.png||'objetoespecial.png'}" onerror="this.style.display='none'"> ${r.name} ${r.used?'(Usado)':''}</span>`).join('')||'<span>Ninguno</span>'}</div>
        </div>
        <div class="card"><h3>Personaje</h3>
          <img src="logofondo.png" alt="" style="width:100%;opacity:.15" onerror="this.style.display='none'">
          <div class="kv"><span>Clase: ${s.profile.class}</span></div>
          <h4 style="margin-top:8px">Equipo</h4>
          <div class="kv">
            ${Object.keys(eq).length? Object.keys(eq).map(k=>`<span>${k.replace('equip_','')} ✓</span>`).join(''):'<span>Sin equipo</span>'}
          </div>
        </div>
      </section>
    `;
  }

  function renderClasses(){
    const v=byId('view'); const classes=['Guerrero','Asesino','Mago','Arquero','Espía','Maratón','Amigo del dragón','Saltamontes'];
    const png=(c)=>({Guerrero:'guerrero.png',Asesino:'asesino.png',Mago:'mago.png',Arquero:'arquero.png',Espía:'espia.png',Maratón:'maraton.png','Amigo del dragón':'amigodeldragon.png',Saltamontes:'saltamontes.png'}[c]||'logo.png');
    v.innerHTML = `
      <section class="section">
        <h3>Clases</h3>
        <div class="grid cols-2">
          ${classes.map(c=>`<div class="card flex" style="justify-content:space-between;align-items:center">
            <div><strong>${c}</strong><div class="kv"><span>Coste cambio: 10 🪙</span></div></div>
            <img src="${png(c)}" alt="" style="height:64px" onerror="this.style.display='none'">
            <button class="btn btn--class" data-class="${c}"><img src="clase.png" onerror="this.style.display='none'"> Elegir</button>
          </div>`).join('')}
        </div>
      </section>
    `;
    v.querySelectorAll('[data-class]').forEach(b=>b.onclick=()=>Features.Profile.setClass(b.dataset.class));
  }

  function renderProfile(){
    const s=State.get(); const v=byId('view');
    v.innerHTML = `
      <section class="section grid cols-2">
        <div class="card">
          <h3>Perfil</h3>
          <div class="flex">
            <input id="inpName" class="btn--ghost" style="flex:1;padding:10px;border-radius:10px;border:1px solid var(--line);background:#0a1226;color:var(--text)" value="${s.profile.name}">
            <button class="btn" id="btnRename"><img src="ok.png" onerror="this.style.display='none'"> Guardar nombre</button>
          </div>
          <div class="kv" style="margin-top:8px">
            <span>Zona de suerte (Focus):</span>
            ${['Abdomen','Brazos','Piernas','Pecho','Espalda','Hombros'].map(z=>`<button class="btn btn--ghost" data-zone="${z}">${z}</button>`).join('')}
          </div>
          <div class="kv" style="margin-top:8px">
            <span>Nivel: ${s.economy.level} (${s.economy.xp}/${Features.Progression.requiredXp(s.economy.level)})</span>
            <span>Monedas: ${s.economy.coins}</span>
            <span>Nerf: ${s.economy.nerfStacks} stacks</span>
            <span>Nivel Clase: ${s.economy.classLevel} (${s.economy.classXp}/${Features.Progression.requiredClassXp(s.economy.classLevel)})</span>
          </div>
          <div class="flex" style="margin-top:8px">
            <button class="btn btn--ok" id="btnSave"><img src="save.png" onerror="this.style.display='none'"> Guardar perfil</button>
          </div>
        </div>
        <div class="card">
          <h3>Perfiles guardados</h3>
          <div id="slots">${s.profileSlots.map((p,i)=>`<div class="flex" style="justify-content:space-between"><span>${p.name}</span><button class="btn" data-load="${i}"><img src="load.png" onerror="this.style.display='none'"> Cargar</button></div>`).join('')||'<div class="kv"><span>Sin perfiles</span></div>'}</div>
        </div>
      </section>
    `;
    byId('btnRename').onclick=()=>{ const val=byId('inpName').value.trim(); Features.Profile.setName(val); renderHUD(); toast('Nombre actualizado','ok'); };
    byId('btnSave').onclick=()=>Features.Profile.save(`Perfil ${new Date().toLocaleString()}`);
    v.querySelectorAll('[data-load]').forEach(b=>b.onclick=()=>Features.Profile.load(parseInt(b.dataset.load,10)));
    v.querySelectorAll('[data-zone]').forEach(b=>b.onclick=()=>{ Features.Profile.setZone(b.dataset.zone); toast('Zona de suerte: '+b.dataset.zone,'ok'); });
  }

  const byId=id=>document.getElementById(id);

  function render(){
    renderHUD();
    const hash=window.location.hash||'#/misiones';
    if (routes[hash]) routes[hash](); else routes['#/misiones']();
    document.querySelectorAll('.mission__timer').forEach(el=>{ const id=el.dataset.id; const m=State.get().missions.list.find(x=>x.id===id); if(m) el.textContent=U.hms(U.secondsLeft(m.endsAt)); });
  }

  return {render,Notif:{ask,toast},navigate,initTabs};
})();

/* ====== Profile ====== */
Features.Profile = (()=>{
  const save=name=>{ const snap=State.get(); State.set(s=>{ s.profileSlots.unshift({name,snapshot:snap}); }); UI.Notif.toast('Perfil guardado','ok'); };
  const load=idx=>{ const slot=State.get().profileSlots[idx]; if(!slot) return; State.set(_=>slot.snapshot); UI.Notif.toast('Perfil cargado','ok'); UI.render(); };
  const setName=name=>State.set(s=>{ s.profile.name=name||'Jugador'; });
  const setClass=cls=>{ const coins=State.get().economy.coins; if(coins<10){ UI.Notif.toast('Faltan monedas (10)','warn'); return; } State.set(s=>{ s.economy.coins-=10; s.profile.class=cls; }); UI.Notif.toast(`Clase cambiada a ${cls}`,'ok'); UI.render(); };
  const setZone=z=>State.set(s=>{ s.profile.zone=z; });
  return {save,load,setName,setClass,setZone};
})();

/* ====== Bootstrap ====== */
(function bootstrap(){
  State.hydrate(); State.ensureResets();
  document.addEventListener('DOMContentLoaded', ()=>{
    UI.initTabs();
    const s=State.get();
    if (s.missions.dailyOfDayKey!==Core.dateKey()) Features.Missions.createDailyForToday();
    if (!s.missions.list.some(m=>m.type==='Clase')) Features.Missions.createClass();

    window.addEventListener('hashchange', ()=>UI.render());
    if (!window.location.hash) window.location.hash='#/misiones';

    Core.startTick();
    Core.on('tick:1s',()=>{ document.querySelectorAll('.mission__timer').forEach(el=>{ const id=el.dataset.id; const m=State.get().missions.list.find(x=>x.id===id); if(m) el.textContent=U.hms(U.secondsLeft(m.endsAt)); }); });

    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});

    UI.render();
  });
})();
