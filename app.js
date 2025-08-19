/* ===========================
   Altervenator — App Single File (namespaces)
   Alineado a tu documento de diseño: XP 200 base (+10%), doble barra, Focus/Clase/Asalto,
   urgentes (stub), tienda/inventario (stubs), notificaciones por color, perfiles.
   =========================== */

/* ---------- Core ---------- */
const Core = (() => {
  // Simple pub/sub
  const listeners = new Map();
  const on = (event, fn) => { if(!listeners.has(event)) listeners.set(event,new Set()); listeners.get(event).add(fn); return () => listeners.get(event)?.delete(fn); };
  const emit = (event, payload) => listeners.get(event)?.forEach(fn => fn(payload));

  // Storage selectivo
  const STORAGE_KEY = 'altervenator:v1';
  const save = (partial) => {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...partial }));
  };
  const load = () => JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

  // Logger básico
  const log = (...a) => console.log('[ALT]', ...a);

  // Ticker 1s (timers misiones)
  let tickTimer = null;
  const startTick = () => {
    if (tickTimer) return;
    tickTimer = setInterval(()=>emit('tick:1s'), 1000);
  };

  // Config (puedes ajustar aquí)
  const Config = {
    XP_BASE: 200,
    XP_CLASS_BASE: 200,
    XP_GROWTH: 1.10,   // +10%
    NERF_EXP_STEP: 0.20, // -20% por aplicación
    NERF_MISSIONS_PER_STACK: 3,
    NERF_MAX_STACKS: 3,  // (3 stacks → 9 misiones)
    BUFF_EXP_BONUS: 0.20,
    BUFF_TIME_MIN: 30, // minutos
    FOCUS_TIMER_H: 8,
    CLASS_TIMER_H: 12,
    RAID_TIMER_H: 7
  };

  return { on, emit, save, load, log, startTick, Config };
})();

/* ---------- State ---------- */
const State = (() => {
  let state = {
    profile: {
      name: 'Jugador',
      class: 'Guerrero',
      zone: 'Abdomen'
    },
    economy: {
      level: 1, xp: 0, coins: 0,
      classLevel: 1, classXp: 0,
      nerfStacks: 0,           // cada stack = 3 misiones con -20% EXP
      buffUntilTs: 0           // timestamp ms
    },
    missions: {
      list: [], history: [], // activos e historial
      weeklyUrgents: 0,      // para límite 3/semana
    },
    inventory: {
      keys: 0, rare: [], consumables: [], equipment: {}
    },
    profileSlots: [] // [{name, snapshot}]
  };

  const subscribers = new Set();
  const get = () => structuredClone(state);
  const set = (producer) => {
    const draft = structuredClone(state);
    producer(draft);
    state = draft;
    subscribers.forEach(fn => fn(get()));
    Core.save({ state });
  };
  const subscribe = (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); };

  // Hydrate
  const hydrate = () => {
    const saved = Core.load();
    if (saved?.state) state = saved.state;
  };

  return { get, set, subscribe, hydrate };
})();

/* ---------- Utils ---------- */
const U = (() => {
  const now = () => Date.now();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = (n) => new Intl.NumberFormat('es-ES').format(n);
  const secondsLeft = (untilTs) => Math.max(0, Math.floor((untilTs - Date.now())/1000));
  const hms = (s) => {
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), ss = s%60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  };
  return { now, clamp, fmt, secondsLeft, hms };
})();

/* ---------- Features: Progression ---------- */
const Features = {};
Features.Progression = (() => {
  const R = Core.Config;

  const requiredXp = (level) => Math.round(R.XP_BASE * Math.pow(R.XP_GROWTH, Math.max(0, level-1)));
  const requiredClassXp = (level) => Math.round(R.XP_CLASS_BASE * Math.pow(R.XP_GROWTH, Math.max(0, level-1)));

  const expModifier = () => {
    const s = State.get();
    let mult = 1;
    // Nerf: -20% por stack activo (cada stack dura 3 misiones)
    mult *= (1 - (s.economy.nerfStacks * R.NERF_EXP_STEP));
    // Buff: +20% si está activo
    if (s.economy.buffUntilTs > Date.now()) mult *= (1 + R.BUFF_EXP_BONUS);
    return Math.max(0, mult);
  };

  const addXp = (xp) => {
    State.set(s => {
      const mod = expModifier();
      const add = Math.round(xp * mod);
      s.economy.xp += add;
      let leveled = true;
      while (leveled) {
        leveled = false;
        const need = requiredXp(s.economy.level);
        if (s.economy.xp >= need) {
          s.economy.xp -= need;
          s.economy.level++;
          leveled = true;
        }
      }
    });
  };

  const addClassXp = (xp) => {
    State.set(s => {
      const mod = expModifier();
      const add = Math.round(xp * mod);
      s.economy.classXp += add;
      let leveled = true;
      while (leveled) {
        leveled = false;
        const need = requiredClassXp(s.economy.classLevel);
        if (s.economy.classXp >= need) {
          s.economy.classXp -= need;
          s.economy.classLevel++;
          leveled = true;
        }
      }
    });
  };

  const addCoins = (n) => State.set(s => { s.economy.coins += n; });

  const applyNerf = () => State.set(s => {
    s.economy.nerfStacks = U.clamp(s.economy.nerfStacks + 1, 0, Core.Config.NERF_MAX_STACKS);
  });

  const clearNerf = () => State.set(s => { s.economy.nerfStacks = 0; });

  const applyBuff = (minutes=Core.Config.BUFF_TIME_MIN) => State.set(s => {
    const until = Date.now() + minutes*60*1000;
    s.economy.buffUntilTs = until;
  });

  return { requiredXp, requiredClassXp, addXp, addClassXp, addCoins, applyNerf, clearNerf, applyBuff };
})();

/* ---------- Features: Missions (stubs funcionales) ---------- */
Features.Missions = (() => {
  const TYPES = { DAILY:'Diaria', FOCUS:'Focus', CLASS:'Clase', URGENT:'Urgente', RAID:'Asalto' };

  const _pushHistory = (entry) => State.set(s => { s.missions.history.unshift({ts:Date.now(), ...entry}); });

  const _add = (mission) => State.set(s => { s.missions.list.push(mission); });

  const _remove = (id) => State.set(s => {
    const i = s.missions.list.findIndex(m=>m.id===id);
    if (i>=0) s.missions.list.splice(i,1);
  });

  const _newMission = ({type,name,secs,reward,penalty,meta={}}) => ({
    id: crypto.randomUUID(), type, name, createdAt: Date.now(),
    endsAt: Date.now() + secs*1000, reward, penalty, meta
  });

  const createDaily = () => {
    const m = _newMission({
      type:TYPES.DAILY,
      name:'Misión Diaria',
      secs: (24*3600)-60, // placeholder hasta 23:59
      reward:{xp:40, coins:6, classXp:0},
      penalty:{coins:6, nerf:true, hard:true}
    });
    _add(m);
    UI.Notif.ask('Tienes una misión diaria. ¿Aceptas?', 'blue', {
      ok:'Aceptar', cancel:'Rechazar'
    }).then(ok=>{
      if(!ok){ fail(m.id, {noPenalty:true}); }
      UI.render();
    });
  };

  const createFocus = (zone) => {
    const m = _newMission({
      type:TYPES.FOCUS,
      name:`Focus: ${zone}`,
      secs: Core.Config.FOCUS_TIMER_H*3600,
      reward:{xp:80, coins:10, classXp:0},
      penalty:{coins:8, nerf:true, hard:true, hardMult:1.5}
    });
    _add(m);
    UI.Notif.toast('Focus creada', 'info');
    UI.render();
  };

  const createClass = () => {
    const m = _newMission({
      type:TYPES.CLASS,
      name:`Misión de Clase`,
      secs: Core.Config.CLASS_TIMER_H*3600,
      reward:{xp:0, coins:9, classXp:70},
      penalty:{none:true} // sin penalización
    });
    _add(m);
    UI.Notif.toast('Misión de clase creada', 'info');
    UI.render();
  };

  const createRaid = () => {
    // Requiere llave; aquí comprobamos inventario
    const s = State.get();
    if (s.inventory.keys <= 0) {
      UI.Notif.ask('Te falta una llave de mazmorra.', 'yellow', { ok:'Entendido' });
      return;
    }
    State.set(st => { st.inventory.keys -= 1; });
    const m = _newMission({
      type:TYPES.RAID,
      name:'Asalto a Mazmorra',
      secs: Core.Config.RAID_TIMER_H*3600,
      reward:{xp:200, coins:80, classXp:170},
      penalty:{coins:120, xp:150, classXp:50}
    });
    _add(m);
    UI.Notif.toast('Asalto iniciado', 'info');
    UI.render();
  };

  const complete = (id) => {
    const m = State.get().missions.list.find(x=>x.id===id);
    if(!m) return;
    // Recompensas
    if (m.reward.xp) Features.Progression.addXp(m.reward.xp);
    if (m.reward.classXp) Features.Progression.addClassXp(m.reward.classXp);
    if (m.reward.coins) Features.Progression.addCoins(m.reward.coins);
    _remove(id);
    _pushHistory({ id, name:m.name, type:m.type, status:'completed', reward:m.reward });
    UI.Notif.ask(
      `Has completado "${m.name}". Recompensa: ${m.reward.xp||0} XP, ${m.reward.classXp||0} XP Clase, ${m.reward.coins||0} 🪙`,
      'green',
      { ok:'Aceptar' }
    );
    UI.render();
  };

  const fail = (id, opts={}) => {
    const m = State.get().missions.list.find(x=>x.id===id);
    if(!m) return;
    _remove(id);
    if (!opts.noPenalty) {
      if (m.penalty?.coins) Features.Progression.addCoins(-m.penalty.coins);
      if (m.type !== 'Clase' && m.penalty?.nerf) Features.Progression.applyNerf();
      // versión dura: aquí solo notificamos; en V2 podemos autogenerarla.
    }
    _pushHistory({ id, name:m.name, type:m.type, status:'failed', penalty:m.penalty });
    UI.Notif.ask(`"${m.name}" fallida. Se aplica penalización.`, 'red', { ok:'Aceptar' });
    UI.render();
  };

  // Ticking
  Core.on('tick:1s', () => {
    const s = State.get();
    const now = Date.now();
    let changed = false;
    s.missions.list.forEach(m => {
      if (m.endsAt <= now && m.type !== 'Clase') { // Clase no falla sola
        changed = true;
        _pushHistory({ id:m.id, name:m.name, type:m.type, status:'timeout' });
      }
    });
    if (changed) {
      State.set(st => { st.missions.list = st.missions.list.filter(m => m.endsAt > now || m.type==='Clase'); });
      UI.render();
    }
  });

  return { TYPES, createDaily, createFocus, createClass, createRaid, complete, fail };
})();

/* ---------- Features: Inventory (mínimo) ---------- */
Features.Inventory = (() => {
  const addKey = (n=1) => State.set(s => { s.inventory.keys += n; });
  return { addKey };
})();

/* ---------- Features: Profile ---------- */
Features.Profile = (() => {
  const save = (slotName) => {
    const snapshot = State.get();
    State.set(s => { s.profileSlots.unshift({ name: slotName, snapshot }); });
    UI.Notif.toast('Perfil guardado', 'ok');
  };
  const load = (idx) => {
    const slot = State.get().profileSlots[idx];
    if (!slot) return;
    State.set(_ => slot.snapshot);
    UI.Notif.toast('Perfil cargado', 'ok');
    UI.render();
  };
  const setName = (name) => State.set(s => { s.profile.name = name || 'Jugador'; });
  const setClass = (cls) => {
    // cambiar clase cuesta 10 🪙 (del doc)
    const coins = State.get().economy.coins;
    if (coins < 10) { UI.Notif.toast('Faltan monedas (10)', 'warn'); return; }
    State.set(s => { s.economy.coins -= 10; s.profile.class = cls; });
    UI.Notif.toast(`Clase cambiada a ${cls}`, 'ok');
    UI.render();
  };
  const setZone = (z) => State.set(s => { s.profile.zone = z; });

  return { save, load, setName, setClass, setZone };
})();

/* ---------- UI (screens, modal, toast) ---------- */
const UI = (() => {
  // ------- Notificaciones -------
  const modalRoot = () => document.getElementById('modalRoot');
  const toastRoot = () => document.getElementById('toastRoot');

  const ask = (text, color='blue', { ok='Aceptar', cancel } = {}) => new Promise(res=>{
    const root = modalRoot();
    root.classList.add('is-open');
    const tagClass = color==='blue'?'tag--blue':color==='purple'?'tag--purple':color==='red'?'tag--red':color==='yellow'?'tag--yellow':'tag--green';
    root.innerHTML = `
      <div class="modal">
        <div class="kv"><span class="tag ${tagClass}">${color.toUpperCase()}</span></div>
        <h3 class="modal__title">${text}</h3>
        <div class="modal__actions">
          ${cancel?`<button class="btn btn--ghost" id="mCancel">${cancel}</button>`:''}
          <button class="btn" id="mOk">${ok}</button>
        </div>
      </div>`;
    root.querySelector('#mOk').onclick = ()=>{ root.classList.remove('is-open'); root.innerHTML=''; res(true); };
    const c = root.querySelector('#mCancel');
    if (c) c.onclick = ()=>{ root.classList.remove('is-open'); root.innerHTML=''; res(false); };
  });

  const toast = (text, level='info') => {
    const root = toastRoot();
    const el = document.createElement('div');
    el.className = `toast toast--${level==='ok'?'ok':level==='warn'?'warn':level==='err'?'err':'info'}`;
    el.textContent = text;
    root.appendChild(el);
    setTimeout(()=>{ el.remove(); }, 2500);
  };

  // ------- HUD -------
  const renderHUD = () => {
    const s = State.get();
    document.getElementById('playerName').textContent = s.profile.name;
    document.getElementById('playerLevel').textContent = `Lvl ${s.economy.level}`;
    document.getElementById('playerCoins').textContent = `🪙 ${s.economy.coins}`;

    const xpNeed = Features.Progression.requiredXp(s.economy.level);
    const classNeed = Features.Progression.requiredClassXp(s.economy.classLevel);
    const xpPct = Math.round((s.economy.xp/xpNeed)*100);
    const cxpPct = Math.round((s.economy.classXp/classNeed)*100);

    const xpBar = document.getElementById('xpBar');
    const cxpBar = document.getElementById('classXpBar');
    xpBar.style.width = `${U.clamp(xpPct,0,100)}%`;
    cxpBar.style.width = `${U.clamp(cxpPct,0,100)}%`;

    document.getElementById('xpText').textContent = `${s.economy.xp} / ${xpNeed}`;
    document.getElementById('classXpText').textContent = `${s.economy.classXp} / ${classNeed}`;
  };

  // ------- Router -------
  const routes = {
    '#/misiones': renderMissions,
    '#/tienda': renderShop,
    '#/inventario': renderInventory,
    '#/clases': renderClasses,
    '#/perfil': renderProfile
  };
  function setActiveTab(hash){
    document.querySelectorAll('.tab').forEach(b=>{
      if (b.dataset.route === hash) b.classList.add('is-active'); else b.classList.remove('is-active');
    });
  }
  function navigate(hash){
    if (!routes[hash]) hash = '#/misiones';
    routes[hash]();
    setActiveTab(hash);
    renderHUD();
  }
  function initTabs(){
    document.querySelectorAll('.tab').forEach(b => b.onclick = ()=>{ window.location.hash = b.dataset.route; });
  }

  // ------- Screens -------
  function renderMissions(){
    const s = State.get();
    const v = document.getElementById('view');
    const missionsHtml = s.missions.list.map(m=>(`
      <div class="card mission">
        <div class="mission__head">
          <strong>${m.name} <small>(${m.type})</small></strong>
          <span class="mission__timer" data-id="${m.id}">${U.hms(U.secondsLeft(m.endsAt))}</span>
        </div>
        <div class="kv">
          ${m.reward?.xp?`<span>+${m.reward.xp} XP</span>`:''}
          ${m.reward?.classXp?`<span>+${m.reward.classXp} XP Clase</span>`:''}
          ${m.reward?.coins?`<span>+${m.reward.coins} 🪙</span>`:''}
        </div>
        <div class="flex">
          <button class="btn btn--ok" data-action="complete" data-id="${m.id}">Marcar completada</button>
          ${m.type!=='Clase'?`<button class="btn btn--err" data-action="fail" data-id="${m.id}">Fallar</button>`:''}
        </div>
      </div>
    `)).join('');
    v.innerHTML = `
      <section class="section grid cols-2">
        <div class="card">
          <h3>Acciones</h3>
          <div class="flex">
            <button class="btn" id="btnFocus">+ Focus</button>
            <button class="btn btn--class" id="btnClass">+ Clase</button>
            <button class="btn btn--urgent" id="btnRaid">Asalto (llave)</button>
          </div>
        </div>
        <div class="card">
          <h3>Historial</h3>
          <div style="max-height:180px;overflow:auto">
            ${s.missions.history.map(h=>`<div class="kv"><span>${new Date(h.ts).toLocaleString()}</span><span>${h.type}</span><span>${h.status}</span><span>${h.name}</span></div>`).join('')}
          </div>
        </div>
      </section>
      <section class="section">
        <h3>Misiones activas</h3>
        ${missionsHtml || '<div class="kv"><span>Sin misiones</span></div>'}
      </section>
    `;

    // wire
    document.getElementById('btnFocus').onclick = ()=>Features.Missions.createFocus(State.get().profile.zone);
    document.getElementById('btnClass').onclick = ()=>Features.Missions.createClass();
    document.getElementById('btnRaid').onclick = ()=>Features.Missions.createRaid();
    v.querySelectorAll('[data-action="complete"]').forEach(b=>b.onclick=()=>Features.Missions.complete(b.dataset.id));
    v.querySelectorAll('[data-action="fail"]').forEach(b=>b.onclick=()=>Features.Missions.fail(b.dataset.id));
  }

  function renderShop(){
    const v = document.getElementById('view');
    v.innerHTML = `
      <section class="section">
        <h3>Tienda</h3>
        <div class="grid cols-2">
          <div class="card">
            <h4>Consumibles</h4>
            <div class="flex">
              <button class="btn" data-buy="buff">Poción EXP (+20% · 30m) — 50</button>
              <button class="btn" data-buy="curas">Curas (limpia Nerf) — 20</button>
              <button class="btn" data-buy="key">Llave de mazmorra — 100</button>
            </div>
          </div>
          <div class="card">
            <h4>Estéticos</h4>
            <div class="kv"><span>Dagas dobles (60)</span><span>Arco rojo (80)</span><span>Gafas (40)</span><span>Ropa negra (70)</span></div>
          </div>
        </div>
      </section>
      <section class="section">
        <h4>Creador</h4>
        <div class="kv">
          <span>Crear clase personalizada — 200 🪙</span>
          <span>Crear prueba normal — 10 🪙 (60 XP, 8 🪙)</span>
          <span>Crear prueba élite — 50 🪙 (80 XP, 10 🪙, 20% objeto raro)</span>
        </div>
      </section>
    `;
    v.querySelectorAll('[data-buy]').forEach(b => b.onclick = ()=>{
      const kind = b.dataset.buy;
      const s = State.get();
      const prices = { buff:50, curas:20, key:100 };
      if (s.economy.coins < prices[kind]) { ask('Faltan monedas.', 'yellow', {ok:'Entendido'}); return; }
      State.set(st => { st.economy.coins -= prices[kind]; });
      if (kind==='buff') Features.Progression.applyBuff(30);
      if (kind==='curas') Features.Progression.clearNerf();
      if (kind==='key') Features.Inventory.addKey(1);
      toast('Compra realizada', 'ok');
      renderHUD();
    });
  }

  function renderInventory(){
    const s = State.get();
    const v = document.getElementById('view');
    v.innerHTML = `
      <section class="section grid cols-2">
        <div class="card"><h3>Inventario</h3>
          <div class="kv"><span>Llaves: ${s.inventory.keys}</span></div>
          <div class="kv"><span>Consumibles: ${s.inventory.consumables?.length||0}</span><span>Objetos raros: ${s.inventory.rare?.length||0}</span></div>
        </div>
        <div class="card"><h3>Personaje</h3>
          <img src="logofondo.png" alt="" style="width:100%;opacity:.15" onerror="this.style.display='none'">
          <div class="kv"><span>Clase: ${s.profile.class}</span></div>
        </div>
      </section>
    `;
  }

  function renderClasses(){
    const v = document.getElementById('view');
    const classes = ['Guerrero','Asesino','Mago','Arquero','Espía','Maratón','Amigo del dragón','Saltamontes'];
    v.innerHTML = `
      <section class="section">
        <h3>Clases</h3>
        <div class="grid cols-2">
          ${classes.map(c=>`<div class="card flex" style="justify-content:space-between">
            <div><strong>${c}</strong><div class="kv"><span>Coste cambio: 10 🪙</span></div></div>
            <button class="btn btn--class" data-class="${c}">Elegir</button>
          </div>`).join('')}
        </div>
      </section>
    `;
    v.querySelectorAll('[data-class]').forEach(b=>b.onclick=()=>Features.Profile.setClass(b.dataset.class));
  }

  function renderProfile(){
    const s = State.get();
    const v = document.getElementById('view');
    v.innerHTML = `
      <section class="section grid cols-2">
        <div class="card">
          <h3>Perfil</h3>
          <div class="flex">
            <input id="inpName" class="btn--ghost" style="flex:1;padding:10px;border-radius:10px;border:1px solid var(--line);background:#0a1226;color:var(--text)" value="${s.profile.name}">
            <button class="btn" id="btnRename">Guardar nombre</button>
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
            <button class="btn btn--ok" id="btnSave">Guardar perfil</button>
          </div>
        </div>
        <div class="card">
          <h3>Perfiles guardados</h3>
          <div id="slots">${s.profileSlots.map((p,i)=>`<div class="flex" style="justify-content:space-between"><span>${p.name}</span><button class="btn" data-load="${i}">Cargar</button></div>`).join('')||'<div class="kv"><span>Sin perfiles</span></div>'}</div>
        </div>
      </section>
    `;
    document.getElementById('btnRename').onclick = ()=>{
      const val = document.getElementById('inpName').value.trim();
      Features.Profile.setName(val);
      renderHUD();
      toast('Nombre actualizado','ok');
    };
    document.getElementById('btnSave').onclick = ()=>Features.Profile.save(`Perfil ${new Date().toLocaleString()}`);
    v.querySelectorAll('[data-load]').forEach(b=>b.onclick=()=>Features.Profile.load(parseInt(b.dataset.load,10)));
    v.querySelectorAll('[data-zone]').forEach(b=>b.onclick=()=>{ Features.Profile.setZone(b.dataset.zone); toast('Zona de suerte: '+b.dataset.zone,'ok'); });
  }

  // Render “general”
  function render(){
    renderHUD();
    const hash = window.location.hash || '#/misiones';
    if (routes[hash]) routes[hash](); else routes['#/misiones']();
    // refresco de contadores visible
    document.querySelectorAll('.mission__timer').forEach(el=>{
      const id = el.dataset.id;
      const m = State.get().missions.list.find(x=>x.id===id);
      if (m) el.textContent = U.hms(U.secondsLeft(m.endsAt));
    });
  }

  // Expose Notif también fuera
  const Notif = { ask, toast };

  return { render, Notif, navigate, initTabs };
})();

/* ---------- Bootstrap ---------- */
(function bootstrap(){
  State.hydrate();

  document.addEventListener('DOMContentLoaded', ()=>{
    UI.initTabs();

    // Crear Diaria inicial si es primer arranque
    const s = State.get();
    if (!s.missions.list.some(m=>m.type==='Diaria') && s.missions.history.length===0) {
      Features.Missions.createDaily();
      // Monedas iniciales para poder comprar algo en la demo
      Features.Progression.addCoins(150);
    }

    // Navegación
    window.addEventListener('hashchange', ()=>UI.render());
    if (!window.location.hash) window.location.hash = '#/misiones';

    // Ticker de 1s
    Core.startTick();
    Core.on('tick:1s', ()=> {
      // Solo actualiza los contadores visibles sin re-render completo
      document.querySelectorAll('.mission__timer').forEach(el=>{
        const id = el.dataset.id;
        const m = State.get().missions.list.find(x=>x.id===id);
        if (m) el.textContent = U.hms(U.secondsLeft(m.endsAt));
      });
    });

    // Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(()=>{});
    }

    // Primer render
    UI.render();
  });
})();
