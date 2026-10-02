// ===== 08-app.js : 앱 셸·저장·가져오기·내보내기·이력 =====
let WS = null, M = null, MVER = 0;
const REPORT = (typeof window !== 'undefined' && window.__REPORT__) || null;
const GRID_SHEETS = ['지상파', '케이블'];
const FORM_TABS = { master: el => renderMasterForm(el), 예산: el => renderBudgetForm(el), 소재: el => renderCreForm(el) };
function fixWS(w) {
  w.sheets = w.sheets || {};
  for (const k of ALL_SHEETS) if (!w.sheets[k]) w.sheets[k] = k === '예산' ? [['채널']] : (DEFAULT_MASTER[k] ? DEFAULT_MASTER[k].map(r => r.slice()) : []);
  w.hidden = w.hidden || {}; w.cueOrder = w.cueOrder || {}; w.opsNotes = w.opsNotes || {}; w.reach = w.reach || {}; w.reachMeta = w.reachMeta || {}; w.opsReach = w.opsReach || {};
  // 품목 색 팔레트 v2: 예전 기본색 그대로인 품목만 새 색으로 (직접 고른 색은 유지)
  if (!(w.palV >= 2)) { for (const r of w.sheets.품목 || []) { const c = String(r[3] || '').toLowerCase().replace(/^([0-9a-f]{6})$/, '#$1'); if (PALETTE_V2[c]) r[3] = PALETTE_V2[c]; } w.palV = 2; }
  // 품목 별칭 폐지 (v2): 별칭 칸은 '비고'로 바뀜 — 예전 별칭은 잘못 적힌 이름을 알아보는 데만 쓰도록 따로 보관
  w.itemLegacy = w.itemLegacy || {};
  if (!(w.itemV >= 2)) { for (const r of w.sheets.품목 || []) { const k = str(r[0]); if (k && str(r[4])) w.itemLegacy[k] = [w.itemLegacy[k], str(r[4])].filter(Boolean).join(', '); if (r.length > 4) r[4] = ''; } w.itemV = 2; }
  // 지상파 구분(정기물 등)은 행마다: 예전엔 병합 칸처럼 첫 행에만 있었음 → 같은 채널 안에서 아래 행으로 이어 적음 (한 번만)
  if (!(w.kindV >= 1)) { fillGroundKind(w.sheets.지상파 || []); w.kindV = 1; }
  w.view = w.view || {};
  return w;
}
function fillGroundKind(rows) {
  let ch = null, kind = '', n = 0;
  for (const r of rows) {
    if (!r || isBlankRow(r)) continue;
    const c = str(r[0]); if (c !== ch) { ch = c; kind = ''; }
    if (str(r[1])) kind = str(r[1]); else if (kind) { r[1] = kind; n++; }
  }
  return n;
}
function setM(m) { M = m; M.ver = ++MVER; return M; }

// ---------- 저장소 (IndexedDB) ----------
const DB = {
  db: null, ok: false,
  open() {
    return new Promise(res => {
      try {
        const r = indexedDB.open('coway-tv-cue', 1);
        r.onupgradeneeded = () => {
          const d = r.result;
          if (!d.objectStoreNames.contains('ws')) d.createObjectStore('ws');
          if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
          if (!d.objectStoreNames.contains('versions')) { const v = d.createObjectStore('versions', { keyPath: 'id', autoIncrement: true }); v.createIndex('ym', 'ym'); }
        };
        r.onsuccess = () => { this.db = r.result; this.ok = true; res(true); };
        r.onerror = () => res(false);
      } catch (e) { res(false); }
    });
  },
  req(store, mode, fn) {
    return new Promise((res, rej) => {
      if (!this.ok) return res(null);
      const tx = this.db.transaction(store, mode); const st = tx.objectStore(store);
      const q = fn(st); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error);
    });
  },
  get(store, key) { return this.req(store, 'readonly', s => s.get(key)); },
  put(store, val, key) { return this.req(store, 'readwrite', s => key === undefined ? s.put(val) : s.put(val, key)); },
  del(store, key) { return this.req(store, 'readwrite', s => s.delete(key)); },
  keys(store) { return this.req(store, 'readonly', s => s.getAllKeys()); },
  versions(ym) { return this.req('versions', 'readonly', s => s.index('ym').getAll(ym)); },
};

// ---------- 저장소: 이 컴퓨터(IndexedDB) 또는 온라인(Supabase) ----------
const Store = {
  async months() { return CLOUD.on ? (CLOUD.camp ? await CLOUD.months(CLOUD.camp.id) : []) : (DB.ok ? (await DB.keys('ws')) || [] : []); },
  async load(ym) { if (CLOUD.on) return CLOUD.camp ? await CLOUD.load(CLOUD.camp.id, ym) : null; const w = DB.ok ? await DB.get('ws', ym) : null; return w ? fixWS(w) : null; },
  async put(w) { if (CLOUD.on) return App.cloudSave(); if (DB.ok && w) { await DB.put('ws', w, w.ym); await DB.put('kv', w.ym, 'lastYm'); } },
  async versions(ym) { return CLOUD.on ? await CLOUD.versions(ym) : (DB.ok ? (await DB.versions(ym)) || [] : []); },
  async verWS(v) { return v.ws || (CLOUD.on ? await CLOUD.versionWS(v.id) : null); },
  async addVersion(rec) { if (CLOUD.on) return CLOUD.addVersion(rec); if (DB.ok) await DB.put('versions', rec); },
  ok() { return CLOUD.on ? CLOUD.admin : DB.ok; },
};

// ---------- 앱 ----------
const App = {
  tab: null, lastVersionAt: 0, dirtyV: false, months: [], panes: {}, grids: {}, scrollMem: {}, pend: null, selRow: {},
  // 메뉴: 평소엔 분류(입력 · 운영사항 · 큐시트 · 점검)만 한 줄 → 누르면 전체 메뉴가 한 판에 펼쳐짐 (미디어 대시보드와 같은 방식)
  TABS: [
    { id: 'input', g: '입력', ic: '<path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" d="M3.2 14.2 12.6 4.8l2.6 2.6-9.4 9.4H3.2z"/><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" d="M11 6.4l2.6 2.6"/>', items: [['master', '마스터'], ['지상파', '지상파'], ['케이블', '케이블'], ['reach', '누적리치']] },
    { id: 'plan', g: '운영사항', ic: '<path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" d="M4.4 3.4h11.2v13.4H4.4z"/><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" d="M7.2 7.4h5.6M7.2 10.4h5.6M7.2 13.4h3.4"/>', items: [['예산', '예산'], ['소재', '소재']] },
    { id: 'cue', g: '큐시트', ic: '<path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" d="M2.8 3.6h14.4v12.8H2.8z"/><path fill="none" stroke="currentColor" stroke-width="1.7" d="M2.8 7.6h14.4M7.6 7.6v8.8"/>', items: [['summary', '요약'], ['cueall', '전체 큐시트'], ['cueg', '지상파 큐시트'], ['cuec', '케이블 큐시트'], ['cal', '큐시트 캘린더']] },
    { id: 'chk', g: '점검', ic: '<path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" d="M4 10.4l3.6 3.6L16 5.6"/>', items: [['issues', '검증'], ['history', '변경 이력']] },
  ],
  // 지금 보여 줄 분류 (뷰어: 운영사항 · 큐시트만)
  areas() { return readOnly() && !REPORT ? this.TABS.filter(a => a.id === 'plan' || a.id === 'cue') : this.TABS; },
  tabAllowed(tab) { return this.areas().some(a => a.items.some(x => x[0] === tab)); },

  async init() {
    let root = document.getElementById('root');
    if (!root) { root = document.createElement('div'); root.id = 'root'; document.body.appendChild(root); }
    const cloud = !REPORT && CLOUD.init();
    root.innerHTML = this.shellHtml();
    this.main = document.getElementById('view');
    this.bindResize(); TSel.init();
    // 위 메뉴(머리말+탭)는 항상 위에 고정 — 높이를 CSS 변수로 알려 다른 고정 요소가 그 아래에 붙게
    const shell = document.getElementById('shell');
    const setH = () => document.documentElement.style.setProperty('--shellh', shell.offsetHeight + 'px');
    setH(); try { new ResizeObserver(setH).observe(shell); } catch (e) { }
    if (REPORT) {
      WS = fixWS(REPORT.ws); setM(compute(WS));
      this.TABS = [{ id: 'cue', g: '', items: [['summary', '요약'], ['cueall', '전체 큐시트'], ['cueg', '지상파 큐시트'], ['cuec', '케이블 큐시트'], ['cal', '큐시트 캘린더']] }];
      this.go('summary'); return;
    }
    if (cloud) return this.initCloud();
    await DB.open();
    const last = DB.ok ? await DB.get('kv', 'lastYm') : null;
    WS = last ? await DB.get('ws', last) : null;
    if (!WS) { const d = new Date(); WS = emptyWorkspace(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`); }
    fixWS(WS); setM(compute(WS));
    const vs = DB.ok ? await DB.versions(WS.ym) : [];
    this.lastVersionAt = vs && vs.length ? vs[vs.length - 1].time : 0;
    await this.refreshMonths();
    this.bindTop(); this.bindDrop(); this.bindKeys();
    this.renderMonth();
    this.go('summary');
    this.status(DB.ok ? '자동 저장 켜짐' : '<span style="color:#8f3d35">브라우저 저장을 쓸 수 없어요 — 엑셀로 저장해 두세요</span>');
    document.addEventListener('visibilitychange', () => { if (document.hidden && DB.ok) DB.put('ws', WS, WS.ym); });
  },
  // ---------- 온라인 모드 시작: 링크의 캠페인(?c=) · 달(?m=)을 불러옴. 뷰어는 보기만, 관리자는 편집 ----------
  async initCloud() {
    this.bindKeys(); this.bindCloudTop();
    if (CLOUD.admin) { this.bindTop(); this.bindDrop(); }
    this.gate('<div class="spin"></div><div>불러오는 중…</div>');
    try {
      if (CLOUD.admin) await CLOUD.loadCamps();
      // 코웨이 전용: 캠페인은 config.js 의 camp 로 고정 (예전 링크의 ?c= 도 그대로 열림)
      let cid = CLOUD.qs('c') || CLOUD.cfg.camp;
      if (!cid && CLOUD.admin) cid = (CLOUD.camps[0] || {}).id;
      if (!cid) return CLOUD.admin ? this.gateNewCamp() : this.gate(`<h2>큐시트를 찾을 수 없어요</h2><p class="muted">담당자에게 큐시트 링크를 받아 주세요.</p>`);
      const camp = await CLOUD.campInfo(cid);
      if (!camp) return this.gate(`<h2>큐시트를 찾을 수 없어요</h2><p class="muted">링크가 바뀌었을 수 있어요. 담당자에게 새 링크를 받아 주세요.</p>`);
      CLOUD.camp = camp; CLOUD.setQs({ c: cid === CLOUD.cfg.camp ? null : cid });
      const adv = document.getElementById('advchip'); if (adv) adv.textContent = camp.name;
      this.months = await CLOUD.months(cid);
      let ym = CLOUD.qs('m'); if (!this.months.includes(ym)) ym = this.months[0];
      if (!ym) {
        if (!CLOUD.admin) return this.gate(`<h2>${esc(camp.name)} — 아직 올라온 큐시트가 없어요</h2><p class="muted">관리자가 큐시트를 올리면 여기에서 볼 수 있어요.</p>`);
        const d = new Date(); WS = emptyWorkspace(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`); WS.adv = camp.name; CLOUD.at = {}; CLOUD.sent = {};
        await CLOUD.save(WS, true); this.months = [WS.ym];
      } else WS = await CLOUD.load(cid, ym);
      CLOUD.setQs({ m: WS.ym }); CLOUD.loadedAt = Date.now();
      fixWS(WS); setM(compute(WS));
      if (CLOUD.admin) LOCK.start();
      const vs = CLOUD.admin ? await CLOUD.versions(WS.ym) : []; this.lastVersionAt = vs.length ? vs[vs.length - 1].time : 0;
      this.main.innerHTML = ''; this.panes = {};
      this.renderMonth();
      this.go(this.tabAllowed(CLOUD.qs('t')) ? CLOUD.qs('t') : 'summary');
      this.status(CLOUD.admin ? '<b>●</b> 온라인 저장 켜짐' : '');
    } catch (e) {
      // 예전(다른 DB) 관리자 접속이 남아 있으면 → 접속을 지우고 뷰어로 다시 열기 (그다음 비밀번호로 다시 접속)
      if (e.status === 401 && !CLOUD.admin && !this._rel) { this._rel = 1; return location.reload(); }
      console.error(e); return this.gate(`<h2>불러오지 못했어요</h2><p class="muted">${esc(e.message)}</p><button class="btn" onclick="location.reload()">다시 시도</button>`); }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (CLOUD.admin) this.cloudSave(); return; }
      this.checkRemote();
    });
    window.addEventListener('beforeunload', e => { if (CLOUD.admin && (CLOUD.saving || this.cloudDirty)) { e.preventDefault(); e.returnValue = ''; } });
    window.addEventListener('pagehide', () => LOCK.releaseAll(true));
  },
  gate(html) { this.main.innerHTML = `<div class="gatebox"><div class="card"><div class="bd">${html}</div></div></div>`; this.panes = {}; const n = document.getElementById('nav'); if (n) n.innerHTML = ''; },
  gateNewCamp() {
    this.gate(`<h2>첫 캠페인을 만들어 주세요</h2><p class="muted">광고주 이름으로 캠페인을 만들면, 뷰어에게 줄 링크가 생겨요.</p><div style="display:flex;gap:8px;justify-content:center;margin-top:12px"><input id="ncname" placeholder="광고주 이름 (예: 코웨이)" style="height:34px;border:1px solid var(--rule);border-radius:8px;padding:0 10px;width:220px"><button class="btn pri" id="ncgo">만들기</button></div>`);
    const go = async () => { const n = this.main.querySelector('#ncname').value.trim(); if (!n) return; try { const id = await CLOUD.newCamp(n); CLOUD.setQs({ c: id, m: null }); location.reload(); } catch (e) { this.toast('만들지 못했어요: ' + esc(e.message)); } };
    this.main.querySelector('#ncgo').onclick = go; this.main.querySelector('#ncname').onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) go(); };
  },
  // 다른 관리자가 같은 달을 바꿨는지 (창으로 돌아올 때) — 뷰어는 오래됐으면 새로 불러옴
  async checkRemote() {
    if (!CLOUD.on || !CLOUD.camp || !WS) return;
    try {
      if (!CLOUD.admin) { if (Date.now() - (CLOUD.loadedAt || 0) > 3 * 60 * 1000) { const w = await CLOUD.load(CLOUD.camp.id, WS.ym); CLOUD.loadedAt = Date.now(); if (w) { WS = w; this.noFlash(); this.dataReplaced(); } } return; }
      const st = await CLOUD.serverStamps(CLOUD.camp.id, WS.ym);
      const ch = Object.keys(st).filter(k => CLOUD.at[k] && st[k].updated_at !== CLOUD.at[k]);
      if (ch.length) this.toast(`다른 관리자(${esc([...new Set(ch.map(k => st[k].updated_by || ''))].join(', '))})가 ${ch.map(k => this.partLabel(k)).join('·')}을(를) 바꿨어요 <button class="btn sm" onclick="App.reloadCloud()">새로 불러오기</button>`, 12000);
    } catch (e) { }
  },
  partLabel(k) { return { meta: '요약 설정', master: '마스터', reach: '누적리치' }[k] || k; },
  async reloadCloud() { const w = await CLOUD.load(CLOUD.camp.id, WS.ym); if (w) { WS = w; this.noFlash(); this.dataReplaced(); this.toast('최신 내용으로 다시 불러왔어요'); } },
  async cloudSave(force) {
    if (!CLOUD.admin || !CLOUD.camp || !WS) return;
    WS.savedAt = Date.now();
    this.status('☁ 저장 중…');
    try {
      await CLOUD.save(WS, force); this.cloudDirty = false;
      this.status(`<b>●</b> 온라인 저장됨 ${fmt.time(Date.now()).split(' ')[1]}`);
      if (this.dirtyV && Date.now() - this.lastVersionAt > 20 * 60 * 1000) await this.saveVersion('자동 백업 (20분 간격)', true);
    } catch (e) {
      if (e.conflict) return this.conflictDialog(e.conflict);
      this.status(`<span style="color:#8f3d35">온라인 저장 실패 — ${esc(e.message)} · 잠시 뒤 다시 시도</span>`);
      clearTimeout(this._retry); this._retry = setTimeout(() => this.cloudSave(), 15000);
    }
  },
  conflictDialog(part) {
    if (this._conf) return; this._conf = true;
    this.modal(`<div class="hd"><h3>다른 관리자가 먼저 저장했어요</h3></div><div class="bd"><p>이 달 <b>${esc(this.partLabel(part))}</b>을(를) 다른 관리자가 방금 바꿨어요. 어떻게 할까요?</p>
      <p class="small muted">다시 불러오면 내가 아직 저장하지 못한 이 부분 수정은 사라져요(지금 상태는 버전으로 남겨 둘게요). 덮어쓰면 다른 관리자의 수정이 사라져요.</p></div>
      <div class="ft"><button class="btn" id="cf-load">그 내용 다시 불러오기</button><button class="btn pri" id="cf-over">내 것으로 덮어쓰기</button></div>`, (box, close) => {
      box.querySelector('#cf-load').onclick = async () => { close(true); this._conf = false; await this.saveVersion('충돌 — 다시 불러오기 전 내 상태', true); await this.reloadCloud(); };
      box.querySelector('#cf-over').onclick = async () => { close(true); this._conf = false; const st = await CLOUD.serverStamps(CLOUD.camp.id, WS.ym); for (const k in st) CLOUD.at[k] = st[k].updated_at; this.cloudSave(); };
    }, () => { this._conf = false; });
  },

  shellHtml() {
    // 코웨이 전용 큐시트: 좌상단은 제목과 광고주만, 그 옆에 연·월 선택
    const brand = `<div class="brand"><h1>SM C&amp;C TV 큐시트</h1><span class="advchip" id="advchip">${esc(advName())}</span></div>`;
    const ym = '<div class="monthbox"><select id="yearsel" title="연도"></select><select id="monthsel" title="월"></select></div>';
    if (CLOUD.on && !CLOUD.admin) return `<div class="shell" id="shell"><header class="top">${brand}${ym}
      <div class="spacer"></div><span class="rolechip">뷰어</span><button class="btn" id="b-admin">관리자 모드 접속</button></header><nav class="nav" id="nav"></nav></div><main id="view"></main><div class="toast" id="toast"></div>`;
    if (REPORT) return `<div class="shell" id="shell"><header class="top"><div class="brand"><h1>${esc(REPORT.title || '큐시트 보고')}</h1></div><div class="spacer"></div><div class="status">업데이트 ${fmt.time(REPORT.at)}</div><button class="btn sm" onclick="window.print()">인쇄</button></header><nav class="nav" id="nav"></nav></div><main id="view"></main><div class="toast" id="toast"></div>`;
    return `<div class="shell" id="shell"><header class="top">
      ${brand}${ym}
      <div class="spacer"></div><div class="status" id="status"></div>
      <button class="btn pri" id="b-save" title="지금 상태를 저장하고 변경 이력에 남겨요 (Ctrl+S)">저장</button>
      <div class="dd" id="dd-bak"><button class="btn" id="b-bak">엑셀 백업 ▾</button><div class="dd-menu">
        <button data-bak="all">전체 백업 받기<small>입력·마스터·누적리치 전부 (로우데이터 엑셀)</small></button>
        <button data-bak="지상파">지상파 시트만</button>
        <button data-bak="케이블">케이블 시트만</button>
        <button data-bak="plan">예산·소재만</button>
        <button data-bak="master">마스터만</button>
        <hr><button data-bak="restore">백업 파일 다시 넣기…<small>이 도구에서 받은 백업 엑셀을 골라 그대로 넣어요</small></button></div></div>
      <button class="btn" id="b-onboard" title="방송사에서 받은 원본 큐시트 엑셀을 자동 매칭해서 지상파·케이블 시트에 넣기">방송사 큐시트 온보딩</button>
      ${CLOUD.on ? `<div class="dd" id="dd-admin"><button class="btn" id="b-adm">관리자 ▾</button><div class="dd-menu">
        <button data-adm="link">뷰어 링크 복사<small>보기만 하는 링크 (광고주·내부 공유용)</small></button>
        <button data-adm="view">뷰어 화면으로 보기<small>새 탭에서 뷰어가 보는 화면</small></button>
        <button data-adm="who">내 이름 바꾸기<small>다른 관리자에게 '작업 중'으로 보이는 이름</small></button>
        <button data-adm="report">보고서 HTML 내보내기<small>오프라인으로 보낼 때</small></button>
        <button data-adm="out">관리자 모드 종료</button></div></div>` : '<button class="btn" id="b-report">보고서 내보내기</button>'}
      <input type="file" id="filein" accept=".xlsx,.xlsm,.xls" multiple hidden>
    </header><nav class="nav" id="nav"></nav><div class="namebar" id="namebar" hidden></div><div class="lockbar" id="lockbar" hidden></div></div><main id="view"></main>
    <div class="drop" id="drop"><div>엑셀 파일을 놓으세요</div></div><div class="toast" id="toast"></div>`;
  },
  renderNav() {
    const nav = document.getElementById('nav'); if (!nav) return;
    const cnt = { 지상파: (WS.sheets.지상파 || []).filter(r => !isBlankRow(r)).length, 케이블: (WS.sheets.케이블 || []).filter(r => !isBlankRow(r)).length };
    const err = M.issues.filter(i => i.sev === 'err').length, warn = M.issues.filter(i => i.sev === 'warn').length;
    const unk = this.unknownNames(); const unkN = unk.items.size + unk.chs.size;
    const badge = id => {
      if (readOnly()) return '';
      const lk = LOCK.other(id); if (lk) return `<span class="badge lk" title="${esc(lk)}님이 작업 중">🔒 ${esc(lk)}</span>`;
      if (cnt[id]) return `<span class="badge">${fmt.int(cnt[id])}</span>`;
      if (id === 'master' && unkN) return `<span class="badge err" title="마스터에 없는 이름">${unkN}</span>`;
      if (id === 'issues' && (err || warn)) return `<span class="badge ${err ? 'err' : 'warn'}">${err || warn}</span>`;
      return '';
    };
    const areas = this.areas();
    const svg = a => `<span class="aic"><svg viewBox="0 0 20 20" width="13" height="13" aria-hidden="true">${a.ic}</svg></span>`;
    const cv = '<svg class="acv" viewBox="0 0 10 10" width="9" height="9" aria-hidden="true"><path d="M2 3.6l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    if (areas.length === 1) {
      // 보고서처럼 분류가 하나뿐이면 펼침 메뉴 없이 탭만
      nav.innerHTML = `<div class="flattabs">${areas[0].items.map(([id, t]) => `<button class="tab ${this.tab === id ? 'on' : ''}" data-tab="${id}">${t}${badge(id)}</button>`).join('')}</div>`;
    } else {
      const curA = areas.find(a => a.items.some(x => x[0] === this.tab));
      nav.innerHTML = `<div class="arearow">${areas.map(a => {
        const on = a === curA; const cur = on ? (a.items.find(x => x[0] === this.tab) || [])[1] : '';
        const dot = a.id === 'chk' && err && !readOnly() ? `<span class="badge err">${err}</span>` : '';
        return `<button type="button" class="area${on ? ' on' : ''}" data-area="${a.id}" aria-haspopup="menu" aria-expanded="false">${svg(a)}<span class="al">${a.g}</span>${cur ? `<span class="acur">${cur}</span>` : ''}${dot}${cv}</button>`;
      }).join('')}
        <div class="megapop" role="menu">${areas.map(a => `<div class="subgrp${a === curA ? ' cur' : ''}" data-area="${a.id}"><div class="subttl" data-home="${a.items[0][0]}">${svg(a)}<span>${a.g}</span></div>
          <div class="subbar">${a.items.map(([id, t]) => `<button type="button" class="${this.tab === id ? 'on' : ''}" data-tab="${id}"><span>${t}</span>${badge(id)}</button>`).join('')}</div></div>`).join('')}</div></div>`;
      const close = () => { delete nav.dataset.pop; nav.querySelectorAll('.area').forEach(x => x.setAttribute('aria-expanded', 'false')); };
      nav.querySelectorAll('.area').forEach(b => b.onclick = e => {
        e.stopPropagation();
        if (nav.dataset.pop) return close();
        nav.dataset.pop = b.dataset.area; b.setAttribute('aria-expanded', 'true');
        const g = nav.querySelector('.megapop'); g.style.left = ''; const r = g.getBoundingClientRect(); if (r.right > innerWidth - 8) g.style.left = Math.round(innerWidth - 8 - r.right) + 'px';
      });
      nav.querySelectorAll('.subttl').forEach(t => t.onclick = () => { close(); this.go(t.dataset.home); });
      if (!this._navWired) {
        this._navWired = true;
        document.addEventListener('click', e => { const n = document.getElementById('nav'); if (n && n.dataset.pop && !e.target.closest('#nav .arearow')) { delete n.dataset.pop; } });
        document.addEventListener('keydown', e => { const n = document.getElementById('nav'); if (e.key === 'Escape' && n && n.dataset.pop) { delete n.dataset.pop; } });
        window.addEventListener('resize', () => { const n = document.getElementById('nav'); if (n) delete n.dataset.pop; });
      }
    }
    nav.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { delete nav.dataset.pop; this.go(b.dataset.tab); });
    this.renderNameBar();
  },
  // ---------- 약칭이 아닌 품목 이름 알림 (별칭 폐지) ----------
  wrongItemNames() {
    const m = new Map();
    const add = (raw, key, sh, n) => { const k = str(raw); let x = m.get(k); if (!x) m.set(k, x = { raw: k, key, n: 0, sh: new Set() }); x.n += n || 0; x.sh.add(sh); };
    for (const s of M.spots) if (s.itemHint) add(s.itemRaw, s.itemHint, s.src, s.cnt);
    const B = WS.sheets.예산 || []; (B[0] || []).forEach((h, j) => { if (j) { const k = itemHintOf(M.MS, h); if (k) add(h, k, '예산'); } });
    for (const r of WS.sheets.소재 || []) { const k = itemHintOf(M.MS, r[0]); if (k) add(r[0], k, '소재'); }
    return [...m.values()];
  },
  renderNameBar() {
    const bar = document.getElementById('namebar'); if (!bar || REPORT) return;
    const w = this.wrongItemNames();
    const sig = w.map(x => x.raw + '>' + x.key).sort().join('|');
    if (!w.length) { bar.hidden = true; bar.innerHTML = ''; this._nbSig = ''; return; }
    bar.hidden = false;
    bar.innerHTML = `<span>⚠ <b>품목은 약칭으로만 적어 주세요.</b> 약칭이 아닌 이름은 집계에서 빠져요:</span><span class="nb-l">${w.map(x => `<span class="nb-i"><s>${esc(x.raw)}</s> → <b>${esc(x.key)}</b> <span class="muted">${[...x.sh].join('·')}${x.n ? ' ' + fmt.int(x.n) + '회' : ''}</span></span>`).join('')}</span><button class="btn sm pri" id="nb-fix">모두 약칭으로 고치기</button><button class="btn sm ghost" id="nb-see">어디인지 보기</button>`;
    bar.querySelector('#nb-fix').onclick = async () => {
      await this.saveVersion('약칭으로 고치기 전 자동 백업', true);
      let t = 0; for (const x of w) t += renameEverywhere('item', x.raw, x.key).total;
      this.dataReplaced(); this.toast(`${w.length}개 이름 · ${fmt.int(t)}곳을 약칭으로 고쳤어요`);
    };
    bar.querySelector('#nb-see').onclick = () => { UI.issueSev = 'err'; this.go('issues', true); };
    if (sig !== this._nbSig && this._nbSig != null) this.toast(`약칭이 아닌 품목 이름이 있어요: ${w.slice(0, 3).map(x => `'${esc(x.raw)}' → '${esc(x.key)}'`).join(', ')}${w.length > 3 ? ' 등' : ''} — 위 노란 줄에서 한 번에 고칠 수 있어요`, 6000);
    this._nbSig = sig;
  },

  // ---------- 화면 전환 (탭마다 화면을 따로 두고, 데이터가 바뀐 탭만 다시 그림) ----------
  paneEl(tab) {
    if (!this.panes[tab]) { const d = document.createElement('div'); d.className = 'pane' + (['summary', 'cueg', 'cuec', 'cueall'].includes(tab) ? ' tsel-scope' : ''); d.dataset.pane = tab; this.main.appendChild(d); this.panes[tab] = d; }
    return this.panes[tab];
  },
  go(tab, force) {
    if (!this.tabAllowed(tab)) tab = 'summary';
    if (CLOUD.on) CLOUD.setQs({ t: tab });
    const prev = this.tab;
    if (prev && prev !== tab) this.scrollMem[prev] = window.scrollY;
    this.tab = tab; UI.tab = tab;
    if (prev !== tab) TSel.clear();
    LOCK.enter(tab);
    this.renderNav();
    const el = this.paneEl(tab);
    for (const k in this.panes) this.panes[k].hidden = k !== tab;
    if (GRID_SHEETS.includes(tab)) { window.scrollTo(0, 0); this.showGrid(tab); return; }
    if (force || el.dataset.ver !== String(M.ver) || !el.firstChild) this.renderPane(tab);
    if (prev !== tab) window.scrollTo(0, this.scrollMem[tab] || 0);
  },
  renderPane(tab) {
    const el = this.paneEl(tab); el._refresh = null;
    // 데이터가 바뀌어 다시 그리는 경우: 전후 값을 비교해 바뀐 칸만 반짝
    const prev = el.firstChild && el.dataset.ver && el.dataset.ver !== String(M.ver) && !el.dataset.nf ? ckSnapshot(el) : null;
    delete el.dataset.nf;
    if (TSel.tb && el.contains(TSel.tb)) TSel.clear();
    try {
      if (tab === 'summary') renderSummary(el);
      else if (tab === 'cueg') renderCueG(el);
      else if (tab === 'cuec') renderCueC(el);
      else if (tab === 'cueall') renderCueAll(el);
      else if (tab === 'issues') this.renderIssues(el);
      else if (tab === 'history') this.renderHistory(el);
      else if (tab === 'reach') this.renderReach(el);
      else if (tab === 'cal') renderCal(el);
      else if (FORM_TABS[tab]) FORM_TABS[tab](el);
      if (!readOnly() && LOCK.blocked(tab)) lockForm(el);
    } catch (e) { console.error(e); el.innerHTML = `<div class="card"><div class="empty">화면을 그리다 오류가 났어요: ${esc(e.message)}</div></div>`; }
    el.dataset.ver = M.ver;
    if (prev && prev.size) { let n = 0; const now = ckSnapshot(el); for (const [k, v] of now) if (prev.has(k) && prev.get(k) !== v) n++; if (n && n <= 300) ckFlash(el, prev); }
  },
  rerender() {
    const t = this.tab;
    if (GRID_SHEETS.includes(t)) return this.lightRefresh();
    const y = window.scrollY; this.renderPane(t); window.scrollTo(0, y);
  },
  lightRefresh() {
    const t = this.tab;
    if (GRID_SHEETS.includes(t)) { const g = this.grids[t]; if (g) { g.renderRows(); this.renderSide(t); this.gridStat(t); } return; }
    const el = this.panes[t]; if (el && el._refresh) { el._refresh(); el.dataset.ver = M.ver; }
  },

  // ---------- 변경 → 재계산 → 저장 ----------
  // skip=true: 지금 보고 있는 화면은 다시 그리지 않고 숫자·표시만 갱신 (입력 중 포커스 유지)
  changed(kind, skip, after) {
    this.dirtyV = true;
    if (!this.pend) this.pend = { skip: true, after: [] };
    if (!skip) this.pend.skip = false;
    if (after) this.pend.after.push(after);
    this.recompute(); this.autosave();
  },
  recompute: debounce(function () {
    const p = App.pend || { skip: false, after: [] }; App.pend = null;
    setM(compute(WS)); App.renderNav();
    if (p.skip) App.lightRefresh(); else App.rerender();
    p.after.forEach(f => { try { f(); } catch (e) { console.error(e); } });
  }, 200),
  // 불러오기·되돌리기·달 바꾸기·이름 일괄 변경처럼 데이터가 통째로 바뀐 경우
  dataReplaced() {
    fixWS(WS); this.pend = null;
    setM(compute(WS));
    for (const n of GRID_SHEETS) { const g = this.grids[n]; if (g) { g.filters.clear(); g.closeFind && !g.findEl.hidden && g.closeFind(); g.setRows(WS.sheets[n] || [], (WS.hidden || {})[n] || []); } }
    this.renderMonth(); this.go(this.tab, true);
    this.dirtyV = true; this.autosave();
  },
  noFlash() { for (const k in this.panes) this.panes[k].dataset.nf = '1'; },
  autosave: debounce(async function () {
    if (REPORT) return;
    if (CLOUD.on) { App.cloudDirty = true; return App.cloudSave(); }
    if (!DB.ok) return;
    WS.savedAt = Date.now();
    App.status('저장 중…');
    try {
      await DB.put('ws', WS, WS.ym); await DB.put('kv', WS.ym, 'lastYm');
      App.status(`<b>●</b> 자동 저장됨 ${fmt.time(Date.now()).split(' ')[1]}`);
      if (App.dirtyV && Date.now() - App.lastVersionAt > 20 * 60 * 1000) await App.saveVersion('자동 백업 (20분 간격)', true);
    } catch (e) { App.status('<span style="color:#8f3d35">저장 실패 — 엑셀로 저장해 두세요</span>'); }
  }, 700),
  status(h) { const el = document.getElementById('status'); if (el) el.innerHTML = h; },
  toast(msg, ms = 3500) { const t = document.getElementById('toast'); if (!t) return; const d = document.createElement('div'); d.innerHTML = msg; t.appendChild(d); setTimeout(() => d.remove(), ms); },

  // ---------- 상단 ----------
  async refreshMonths() { this.months = await Store.months(); if (!this.months.includes(WS.ym)) this.months.push(WS.ym); this.months.sort().reverse(); },
  // 연도 · 월 선택 (한 달에 큐시트 하나). 뷰어는 큐시트가 있는 달만, 관리자는 없는 달을 고르면 새로 만들기
  renderMonth() {
    const ys = document.getElementById('yearsel'), ms = document.getElementById('monthsel'); if (!ys || !ms) return;
    if (!this.months.includes(WS.ym)) { this.months.push(WS.ym); this.months.sort().reverse(); }
    const cur = parseYM(WS.ym); if (this.selYear == null) this.selYear = cur.y;
    const now = new Date().getFullYear();
    const years = [...new Set(this.months.map(m => parseYM(m).y).concat(readOnly() ? [] : [now, now + 1]).concat([this.selYear]))].sort((a, b) => b - a);
    ys.innerHTML = years.map(y => `<option value="${y}" ${y === this.selYear ? 'selected' : ''}>${y}년</option>`).join('');
    const has = m => this.months.includes(`${this.selYear}-${pad2(m)}`);
    const inYear = cur.y === this.selYear;
    ms.innerHTML = (inYear ? '' : '<option value="" selected>월 선택</option>') + Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
      const ok = has(m); if (readOnly() && !ok) return '';
      return `<option value="${m}" ${inYear && m === cur.m ? 'selected' : ''}>${m}월${ok ? '' : ' (새로 만들기)'}</option>`;
    }).join('');
    ys.onchange = () => {
      this.selYear = +ys.value;
      const list = this.months.filter(m => parseYM(m).y === this.selYear).sort();
      if (list.length) return this.switchMonth(list[list.length - 1]);
      this.renderMonth();
    };
    ms.onchange = () => {
      const m = +ms.value; if (!m) return;
      const ym = `${this.selYear}-${pad2(m)}`;
      if (this.months.includes(ym)) return this.switchMonth(ym);
      this.renderMonth(); this.newMonth(ym);
    };
  },
  bindCloudTop() {
    const b = document.getElementById('b-admin'); if (b) b.onclick = () => this.loginDialog();
    const dd = document.getElementById('dd-admin'); if (!dd) return;
    document.getElementById('b-adm').onclick = e => { e.stopPropagation(); dd.classList.toggle('open'); };
    document.addEventListener('click', () => dd.classList.remove('open'));
    const link = () => `${location.origin}${location.pathname}${CLOUD.camp.id === CLOUD.cfg.camp ? '' : '?c=' + encodeURIComponent(CLOUD.camp.id)}`;
    const sep = () => link().includes('?') ? '&' : '?';
    dd.querySelectorAll('[data-adm]').forEach(x => x.onclick = async () => {
      dd.classList.remove('open'); const a = x.dataset.adm;
      if (a === 'link') { try { await navigator.clipboard.writeText(link()); this.toast(`뷰어 링크를 복사했어요<br><small>${esc(link())}</small>`, 6000); } catch (e) { this.promptText('뷰어 링크', '이 주소를 복사해서 보내세요', link(), () => { }); } }
      else if (a === 'view') { await this.flushSave(); window.open(link() + sep() + 'm=' + encodeURIComponent(WS.ym) + '&viewer=1', '_blank'); }
      else if (a === 'who') this.promptText('내 이름', '다른 관리자에게 “○○님이 작업 중”으로 보여요', CLOUD.who() || '', n => { try { localStorage.setItem('cue.who', n); } catch (e) { } LOCK.renew(); this.toast(`이름을 '${esc(n)}'(으)로 바꿨어요`); });
      else if (a === 'report') this.exportReport();
      else if (a === 'out') { await this.flushSave(); CLOUD.logout(); }
    });
  },
  loginDialog() {
    this.modal(`<div class="hd"><h3>관리자 모드 접속</h3></div><div class="bd"><p class="small muted" style="margin-top:0">비밀번호를 넣으면 편집 화면이 열려요. 고친 내용은 바로 온라인에 저장돼요.</p>
      <input type="password" id="admpw" autocomplete="current-password" placeholder="비밀번호" style="width:100%;height:36px;border:1px solid var(--rule);border-radius:8px;padding:0 10px">
      <input id="admwho" placeholder="내 이름 (작업 중 표시용 · 이 브라우저에 기억)" value="${esc(CLOUD.who() || '')}" style="width:100%;height:34px;border:1px solid var(--rule);border-radius:8px;padding:0 10px;margin-top:8px">
      <div id="admerr" class="small" style="color:#8f3d35;margin-top:6px;min-height:18px"></div></div>
      <div class="ft"><button class="btn" data-x>취소</button><button class="btn pri" id="adm-ok">접속</button></div>`, (box, close) => {
      const inp = box.querySelector('#admpw'), er = box.querySelector('#admerr'), ok = box.querySelector('#adm-ok');
      const go = async () => {
        if (!inp.value) return; ok.disabled = true; er.textContent = '확인 중…';
        const nm = box.querySelector('#admwho').value.trim(); if (nm) { try { localStorage.setItem('cue.who', nm); } catch (e) { } }
        try { await CLOUD.login(inp.value); close(true); CLOUD.setQs({ viewer: null, t: this.tab }); location.reload(); }
        catch (e) { ok.disabled = false; er.textContent = e.net ? e.message : '비밀번호가 맞지 않아요'; inp.select(); }
      };
      ok.onclick = go; inp.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) go(); };
      setTimeout(() => inp.focus(), 50);
    });
  },
  promptText(title, label, val, onOk) {
    this.modal(`<div class="hd"><h3>${esc(title)}</h3></div><div class="bd"><label class="small muted">${esc(label)}</label><input id="ptxt" value="${esc(val || '')}" style="width:100%;height:34px;border:1px solid var(--rule);border-radius:8px;padding:0 10px;margin-top:4px"></div>
      <div class="ft"><button class="btn" data-x>취소</button><button class="btn pri" id="pt-ok">확인</button></div>`, (box, close) => {
      const inp = box.querySelector('#ptxt'); const go = async () => { const v = inp.value.trim(); if (!v) return; close(true); try { await onOk(v); } catch (e) { this.toast('하지 못했어요: ' + esc(e.message), 5000); } };
      box.querySelector('#pt-ok').onclick = go; inp.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) go(); };
      setTimeout(() => { inp.focus(); inp.select(); }, 50);
    });
  },
  bindTop() {
    document.getElementById('b-onboard').onclick = () => OBUI.open();
    document.getElementById('filein').onchange = e => { this.handleFiles([...e.target.files], true); e.target.value = ''; };
    document.getElementById('b-save').onclick = () => this.manualSave();
    const dd = document.getElementById('dd-bak');
    document.getElementById('b-bak').onclick = e => { e.stopPropagation(); dd.classList.toggle('open'); };
    document.addEventListener('click', () => dd.classList.remove('open'));
    dd.querySelectorAll('[data-bak]').forEach(b => b.onclick = () => {
      const w = b.dataset.bak; dd.classList.remove('open');
      if (w === 'restore') return document.getElementById('filein').click();
      if (w === 'all') saveWorkspaceXlsx(WS, M, ALL_SHEETS, '백업');
      else if (w === 'plan') saveWorkspaceXlsx(WS, M, ['예산', '소재'], '예산소재');
      else if (w === 'master') saveWorkspaceXlsx(WS, M, MASTER_SHEETS, '마스터');
      else saveWorkspaceXlsx(WS, M, [w], w);
    });
    const br = document.getElementById('b-report'); if (br) br.onclick = () => this.exportReport();
  },
  // '저장' 버튼: 지금 상태를 저장하고 변경 이력에 남김 (자동 저장은 그대로 켜져 있음)
  async manualSave() {
    const b = document.getElementById('b-save'); if (b) b.disabled = true;
    try {
      if (this.autosave.flush) this.autosave.flush();
      await this.flushSave();
      if (CLOUD.on && CLOUD.err) throw CLOUD.err;
      await this.saveVersion('저장');
      if (this.panes.history) this.panes.history.dataset.ver = '';
      this.toast(`저장했어요 · ${fmt.time(Date.now()).split(' ')[1]} · 변경 이력에 남겼어요`, 2600);
    } catch (e) { this.toast('저장하지 못했어요: ' + esc(e.message || e), 5000); }
    finally { if (b) b.disabled = false; }
  },
  bindDrop() {
    const drop = document.getElementById('drop'); let n = 0;
    window.addEventListener('dragenter', e => { if ([...(e.dataTransfer.types || [])].includes('Files')) { n++; drop.classList.add('on'); } });
    window.addEventListener('dragleave', () => { n = Math.max(0, n - 1); if (!n) drop.classList.remove('on'); });
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', e => { e.preventDefault(); n = 0; drop.classList.remove('on'); if (readOnly()) return; const f = [...(e.dataTransfer.files || [])].filter(x => /\.xls[xm]?$/i.test(x.name)); if (f.length) this.handleFiles(f); });
  },
  bindKeys() {
    // 표 칸을 고르지 않은 채 Ctrl+V 해도 지금 보고 있는 지상파·케이블 표에 붙여넣기
    document.addEventListener('paste', e => {
      const g = this.grids[this.tab]; if (!g || e.defaultPrevented || document.querySelector('.modal-bg')) return;
      const t = e.target; if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      e.preventDefault(); g.focus(); const c = xgClip(e); g.paste(c.text, c.html);
    });
    document.addEventListener('keydown', e => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && !e.shiftKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); if (!readOnly()) this.manualSave(); return; }
      const g = this.grids[this.tab]; if (!g || document.querySelector('.modal-bg')) return;
      const t = e.target; if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (ctrl && /^[fhzya]$/i.test(e.key)) { g.focus(); g.onKey(e); }
    });
  },
  bindResize() {
    window.addEventListener('resize', debounce(() => {
      for (const k in this.panes) if (!GRID_SHEETS.includes(k) && k !== this.tab) this.panes[k].dataset.ver = '';
      if (GRID_SHEETS.includes(this.tab)) this.sizeGrid(this.tab);
      else if (['summary', 'reach'].includes(this.tab)) this.rerender();
    }, 300));
  },

  // ---------- 달 ----------
  async switchMonth(ym) {
    await this.flushSave();
    const w = await Store.load(ym);
    if (!w) return;
    LOCK.releaseAll(); this.selYear = parseYM(ym).y;
    WS = fixWS(w);
    const vs = await Store.versions(WS.ym);
    this.lastVersionAt = vs && vs.length ? vs[vs.length - 1].time : 0;
    if (DB.ok) await DB.put('kv', ym, 'lastYm');
    if (CLOUD.on) { CLOUD.setQs({ m: ym }); CLOUD.loadedAt = Date.now(); }
    this.noFlash(); this.dataReplaced(); this.dirtyV = false;
    this.toast(`${parseYM(ym).m}월 작업을 열었어요`);
  },
  newMonth(ym0) {
    const p = parseYM(ym0 || WS.ym); const nx = ym0 || (p.m === 12 ? `${p.y + 1}-01` : `${p.y}-${pad2(p.m + 1)}`); const q = parseYM(nx);
    this.modal(`<div class="hd"><h3>${q.y}년 ${q.m}월 큐시트 만들기</h3></div><div class="bd">
      <p>지금 열린 ${parseYM(WS.ym).m}월에서 마스터(품목·채널·CM위치·CPRP), 예산표의 품목·채널 틀, 케이블 큐시트 순서를 이어받고, 송출·예산 금액·소재는 비워서 시작해요.</p>
      <input type="hidden" id="nm" value="${nx}"></div>
      <div class="ft"><button class="btn" data-x>취소</button><button class="btn pri" id="nm-ok">만들기</button></div>`, (box, close) => {
      box.querySelector('#nm-ok').onclick = async () => {
        const ym = box.querySelector('#nm').value; if (!parseYM(ym)) return;
        close(true);
        if (this.months.includes(ym)) return this.switchMonth(ym);
        await this.flushSave();
        const n = emptyWorkspace(ym);
        for (const k of MASTER_SHEETS) n.sheets[k] = deepClone(WS.sheets[k]);
        const B = WS.sheets.예산 || [];
        n.sheets.예산 = B.length ? [B[0].slice()].concat(B.slice(1).map(r => [r[0]])) : [['채널']];
        n.cueOrder = deepClone(WS.cueOrder || {}); n.itemLegacy = deepClone(WS.itemLegacy || {}); n.view = deepClone(WS.view || {});
        WS = n; this.lastVersionAt = 0;
        if (CLOUD.on) { WS.adv = advName(); CLOUD.at = {}; CLOUD.sent = {}; await this.cloudSave(true); CLOUD.setQs({ m: ym }); }
        else if (DB.ok) { await DB.put('ws', WS, WS.ym); await DB.put('kv', WS.ym, 'lastYm'); }
        LOCK.releaseAll(); this.selYear = parseYM(ym).y; await this.refreshMonths(); this.noFlash(); this.dataReplaced(); this.dirtyV = false; this.go('예산');
        this.toast(`${parseYM(ym).m}월 작업을 만들었어요. 예산부터 채워 보세요.`);
      };
    });
  },
  async flushSave() { if (CLOUD.on) { if (CLOUD.admin && WS) await this.cloudSave(); return; } if (DB.ok && WS) { await DB.put('ws', WS, WS.ym); } },

  // ---------- 엑셀형 입력 표 (지상파·케이블) ----------
  showGrid(name) {
    const el = this.paneEl(name);
    if (!this.grids[name]) this.mountGrid(name, el);
    else { this.renderSide(name); this.gridStat(name); this.grids[name].setRO(!readOnly() && LOCK.blocked(name)); }
    this.sizeGrid(name);
    this.grids[name].focus();
  },
  sizeGrid(name) {
    const g = this.grids[name]; const el = this.panes[name]; if (!g || !el || el.hidden) return;
    const top = g.scroll.getBoundingClientRect().top + window.scrollY;
    g.setHeight(window.innerHeight - top - 22);
  },
  mountGrid(name, el) {
    const def = SHEETS[name];
    const B = (a, t, tip) => `<button class="btn sm" data-a="${a}" title="${esc(tip || '')}">${t}</button>`;
    el.innerHTML = `<div class="sheetwrap"><section class="card sheetcard"><div class="hd"><h3>${def.label}</h3><span class="sub tnum" data-stat></span><div class="spacer"></div><span class="hint">${esc(def.hint)}</span>
      <div class="gridbar">
        <div class="grp">${B('undo', '↶ 되돌리기', 'Ctrl+Z')}${B('redo', '↷ 다시', 'Ctrl+Y')}</div>
        <div class="grp">${B('find', '찾기', 'Ctrl+F')}${B('replace', '바꾸기', 'Ctrl+H')}${B('fclr', '필터 해제', '모든 열의 필터를 해제')}</div>
        <div class="grp">${B('all', '전체 선택', 'Ctrl+A')}${B('hide', '행 숨기기', '선택한 행을 숨겨요 (집계에는 포함)')}${B('unhide', '숨긴 행 표시', '숨긴 행을 모두 다시 보여줘요')}${B('add', '＋ 10행', '끝에 빈 행 10개')}</div>
        <div class="grp">${B('xlsx', '⤓ 이 시트 엑셀', '이 시트만 엑셀로 (숨긴 행 유지)')}<button class="btn sm ghost" data-a="wipe">시트 비우기</button></div>
        <span class="gridstat" data-gs></span>
      </div></div>
      <div class="gridfilter" data-fsum></div><div class="gridhost"></div></section></div>`;
    const cols = def.cols.map(c => Object.assign({}, c, { list: this.listFor(name, c.k) }));
    const g = new XGrid(el.querySelector('.gridhost'), {
      name, cols, rows: WS.sheets[name] || [], hidden: (WS.hidden || {})[name] || [],
      cellInfo: (di, c, v, rv) => this.cellInfo(name, di, c, v, rv),
      onChange: () => this.gridChanged(name),
      onSelect: di => this.gridSelect(name, di),
      onView: () => this.gridStat(name),
      toast: (m, ms) => this.toast(m, ms),
      prepPaste: B => this.prepPaste(name, B),
      normalize: (col, v) => (col.k === 'start' || col.k === 'end') ? normTime(v) : v,
      onRo: () => this.toast(LOCK.blockedMsg(name), 3000),
    });
    this.grids[name] = g;
    g.setRO(!readOnly() && LOCK.blocked(name));
    el.querySelectorAll('.gridbar [data-a]').forEach(b => { b.addEventListener('mousedown', e => e.preventDefault()); b.onclick = () => this.gridAction(name, b.dataset.a); });
    this.renderSide(name); this.gridStat(name);
  },
  // 엑셀에서 복사한 블록 정리: ① 예전 가로형 지상파 표 → 1행 1송출 ② 머리글 행이 있으면 열 이름으로 맞추고 머리글은 빼기
  prepPaste(name, B) {
    if (name === '지상파' && isLegacyGroundBlock(B)) {
      const rows = legacyGroundRows(B, 0);
      return { rows, note: `예전 가로형 지상파 표를 1행 1송출로 바꿔 넣었어요 · ${fmt.int(rows.length)}회` };
    }
    for (let h = 0; h < Math.min(3, B.length); h++) {
      const map = mapHeaders(B[h] || [], name);
      const n = Object.keys(map).length;
      if (n >= 3) {
        const cols = SHEETS[name].cols;
        const rows = B.slice(h + 1).filter(r => !isBlankRow(r)).map(r => cols.map(c => map[c.k] != null ? (r[map[c.k]] == null ? '' : r[map[c.k]]) : ''));
        if (name === '지상파') fillGroundKind(rows);   // 구분(정기물 등)이 병합 칸이라 첫 행에만 있어도 행마다 채움
        const miss = cols.filter(c => map[c.k] == null && !/^(d\d|note|ar|cre)$/.test(c.k)).map(c => c.t);
        return { rows, note: `머리글 행을 보고 열을 맞춰 ${fmt.int(rows.length)}행을 넣었어요 (머리글은 뺐어요)${miss.length ? ` · 파일에 없는 열: ${miss.join(', ')}` : ''}` };
      }
    }
    return null;
  },
  gridAction(name, a) {
    const g = this.grids[name]; if (!g) return;
    if (g.editing) g.commit();
    if (a === 'undo') { if (!g.undo()) this.toast('되돌릴 작업이 없어요'); }
    else if (a === 'redo') { if (!g.redo()) this.toast('다시 할 작업이 없어요'); }
    else if (a === 'find') return g.openFind(false);
    else if (a === 'replace') return g.openFind(true);
    else if (a === 'fclr') g.clearFilters();
    else if (a === 'all') g.selectAll();
    else if (a === 'hide') { const n = g.hideRows(); this.toast(n ? `${n}행을 숨겼어요. 숨긴 행도 집계에는 그대로 들어가요.` : '숨길 행(내용 있는 행)을 먼저 선택하세요'); }
    else if (a === 'unhide') { const n = g.unhideRows(true); this.toast(n ? `숨긴 ${n}행을 모두 다시 보여줘요` : '숨긴 행이 없어요'); }
    else if (a === 'add') { if (g.ro) return g.roNote(); g.insertRows('end'); this.toast('끝에 빈 행 10개를 넣었어요'); }
    else if (a === 'xlsx') saveWorkspaceXlsx(WS, M, [name], name);
    else if (a === 'wipe') {
      if (g.ro) return g.roNote();
      const n = g.getRows().filter(r => !isBlankRow(r)).length; if (!n) return this.toast('비어 있어요');
      return this.confirm(`${name} 시트 비우기`, `<p>${fmt.int(n)}행을 모두 지워요. 지우기 전 상태는 변경 이력에 버전으로 남기고, Ctrl+Z로도 되돌릴 수 있어요.</p>`, '비우기', async () => {
        await this.saveVersion(`${name} 비우기 전 자동 백업`, true);
        g.clearFilters(); g.unhideRows(true); g.selectAll(); g.deleteRows(); g.focus(); this.toast(`${name} 시트를 비웠어요`);
      });
    }
    g.focus();
  },
  gridChanged(name) {
    const g = this.grids[name];
    WS.sheets[name] = g.getRows(); WS.hidden[name] = g.getHidden();
    this.gridStat(name);
    this.changed(name, true);
  },
  gridSelect(name, di) {
    this.selRow[name] = di;
    clearTimeout(this.selT);
    this.selT = setTimeout(() => { this.renderSideSel(name); this.gridStat(name); }, 110);
  },
  gridStat(name) {
    const g = this.grids[name], el = this.panes[name]; if (!g || !el) return;
    const n = g.rows.reduce((a, r) => a + (g.isBlank(r) ? 0 : 1), 0), hid = g.hiddenCount(), f = g.filters.size;
    const shown = g.view.reduce((a, di) => a + (g.isBlank(g.rows[di]) ? 0 : 1), 0);
    const iss = M.issues.filter(i => i.sheet === name && i.row >= 0); const e = iss.filter(i => i.sev === 'err').length, w = iss.filter(i => i.sev === 'warn').length;
    el.querySelector('[data-stat]').innerHTML = `${fmt.int(n)}행${f || hid ? ` · 보이는 행 ${fmt.int(shown)}` : ''}${e ? ` · <span style="color:#8f3d35">오류 ${e}</span>` : ''}${w ? ` · <span style="color:#8a5a25">주의 ${w}</span>` : ''}`;
    this.filterSummary(name, g, el);
    const btn = a => el.querySelector(`[data-a="${a}"]`);
    btn('unhide').textContent = hid ? `숨긴 행 표시 (${hid})` : '숨긴 행 표시'; btn('unhide').disabled = !hid;
    btn('fclr').textContent = f ? `필터 해제 (${f})` : '필터 해제'; btn('fclr').disabled = !f; btn('fclr').classList.toggle('on', !!f);
    btn('undo').disabled = !g.undoS.length || g.ro; btn('redo').disabled = !g.redoS.length || g.ro;
    ['hide', 'add', 'wipe'].forEach(k => { const b = btn(k); if (b) b.disabled = g.ro; });
    // 엑셀 상태 표시줄처럼: 선택 범위 크기·합계
    const s = g.sel; const rs = g.selCount(), cs = s.c2 - s.c1 + 1;
    let txt = '';
    if (rs * cs > 1) {
      let cnt = 0, nsum = 0, nn = 0;
      if (rs * cs <= 60000) for (const row of g.selRows()) for (let c = s.c1; c <= s.c2; c++) { const v = row.v[c]; if (v === '' || v == null) continue; cnt++; if (typeof v === 'number') { nsum += v; nn++; } }
      txt = `선택 ${fmt.int(rs)}행${g.rowsSelected() ? '' : ` × ${cs}열`} · 값 ${fmt.int(cnt)}개${nn ? ` · 합계 ${fmt.won(nsum)}` : ''}${g.rowsSelected() ? ' · 우클릭으로 삽입·삭제' : ''}`;
    }
    el.querySelector('[data-gs]').textContent = txt;
  },
  // 필터를 걸면: 걸린 조건 · 송출 횟수 · 단가 합 · (유상 금액) · 해당 채널×품목 예산 — 머리글 위에 연하게
  filterSummary(name, g, el) {
    const box = el.querySelector('[data-fsum]'); if (!box) return;
    const f = [...g.filters.keys()];
    if (!f.length) { box.innerHTML = ''; box.hidden = true; return; }
    const cols = SHEETS[name].cols, ci = k => cols.findIndex(c => c.k === k);
    const iCh = ci('ch'), iIt = ci('item'), iPr = ci('price'), iCnt = ci('cnt'), iAmt = ci('amount');
    let n = 0, cnt = 0, val = 0, paid = 0, paidN = 0; const combos = new Set();
    for (const di of g.view) {
      const r = g.rows[di].v; if (g.isBlank(g.rows[di])) continue; n++;
      const k = iCnt >= 0 && typeof r[iCnt] === 'number' ? r[iCnt] : 1; cnt += k;
      if (typeof r[iPr] === 'number') val += r[iPr] * k;
      if (iAmt >= 0 && typeof r[iAmt] === 'number' && r[iAmt] > 0) { paid += r[iAmt]; paidN++; }
      const c = resolveCh(M.MS, r[iCh]); const it = resolveItem(M.MS, r[iIt]);
      if (c && it) combos.add(c.name + '|' + it);
    }
    // 예산은 채널·품목 열로만 걸렀을 때 그 조합의 예산 합 (다른 열로 거르면 예산을 나눌 수 없어 안 보여줌)
    const onlyChIt = f.every(c => c === iCh || c === iIt);
    const bud = onlyChIt ? sum([...combos], k => { const x = M.cellMap.get(k); return x ? x.budget : 0; }) : null;
    const conds = f.map(c => { const set = g.filters.get(c); const vals = [...set]; return `${cols[c].t}: ${vals.length > 3 ? vals.slice(0, 3).map(esc).join(', ') + ` 외 ${vals.length - 3}` : vals.map(esc).join(', ')}`; }).join(' · ');
    box.hidden = false;
    box.innerHTML = `<span class="lb">필터 결과</span><span class="cond">${conds}</span><span class="v"><b>${fmt.int(cnt)}</b>회 송출</span><span class="v">단가 합 <b>${fmt.eok(val, 2)}</b></span>${iAmt >= 0 ? `<span class="v">유상 ${fmt.int(paidN)}회 · <b>${fmt.eok(paid, 2)}</b></span>` : ''}${bud != null ? `<span class="v">예산 <b>${fmt.eok(bud, 2)}</b>${combos.size ? ` <small>(${combos.size}개 채널×품목)</small>` : ''}</span>` : `<span class="v muted" title="예산은 채널·품목 열로 걸렀을 때만 계산해요">예산 -</span>`}`;
  },
  issIdx(sheet) {
    if (!M._ii) M._ii = {};
    if (!M._ii[sheet]) {
      const m = new Map();
      for (const i of M.issues) if (i.sheet === sheet && i.row >= 0) { const k = i.row + ':' + (i.col == null ? -1 : colIndex(sheet, i.col)); if (!m.has(k)) m.set(k, i); }
      M._ii[sheet] = m;
    }
    return M._ii[sheet];
  },
  cellInfo(name, di, c, v, rv) {
    const col = SHEETS[name].cols[c]; const k = col.k;
    let t = null, cls = '', bg = null, tip = null;
    if (v !== '' && v != null) {
      if (col.money && typeof v === 'number') t = fmt.won(v);
      else if (k === 'date' && typeof v === 'number') { const d = parseDateVal(v, M.ym); if (d) t = `${d.m}/${d.d}`; }
      else if ((k === 'start' || k === 'end') && typeof v === 'number') t = normTime(v);
      else if (k === 'ar' && typeof v === 'number') t = String(Math.round(v * 100) / 100);   // 화면에서만 소수 둘째 자리 (값은 그대로)
      if (k === 'item') { const key = resolveItem(M.MS, v); if (key) { bg = itemLight(key); if (key !== str(v)) tip = `→ ${key}`; } else { cls = 'unk'; const h = itemHintOf(M.MS, v); tip = h ? `약칭이 아니에요 → '${h}'(으)로 고쳐 주세요 (위 노란 알림에서 한 번에 고칠 수 있어요)` : '마스터에 없는 품목 — 검증 탭에서 약칭으로 바꾸거나 새 품목으로 추가하세요'; } }
      else if (k === 'ch') { const ch = resolveCh(M.MS, v); if (!ch) { cls = 'unk'; tip = '마스터에 없는 채널'; } else if (ch.name !== str(v)) tip = `→ ${ch.name}`; }
    }
    if (name === '지상파' && k === 'amount' && str(rv[2]) && (v === '' || v === 0 || v === '0')) { t = '보너스'; cls += ' bonus'; }
    const iss = this.issIdx(name).get(di + ':' + c);
    if (iss) { cls += ' ' + iss.sev; tip = iss.msg; }
    return { t, cls, bg, tip };
  },
  listFor(name, k) {
    const media = SHEETS[name].media;
    const distinct = j => { const s = new Set(); for (const r of WS.sheets[name] || []) { const v = str(r[j]); if (v) s.add(v); if (s.size > 60) break; } return [...s]; };
    if (k === 'ch') return () => M.MS.chList.filter(c => c.media === media).map(c => ({ v: c.name, sub: media === '케이블' ? c.mpp : '', alias: str(((WS.sheets.채널 || []).find(r => str(r[0]) === c.name) || [])[1]) }));
    if (k === 'item') return () => (WS.sheets.품목 || []).filter(r => str(r[0])).map(r => ({ v: str(r[0]), color: colorVal(r[3]), sub: str(r[1]) !== str(r[0]) ? str(r[1]) : '' }));
    if (k === 'dow') return () => DOW;
    if (k === 'sec') return () => ['15', '20', '30', '60'];
    if (k === 'cm') return () => { const seen = new Set(); return (WS.sheets.CM위치 || []).filter(r => { const x = norm(r[0]); if (!x || seen.has(x)) return false; seen.add(x); return true; }).map(r => ({ v: str(r[0]), sub: str(r[1]) })); };
    if (k === 'cre') { const ij = colIndex(name, 'item'); return rv => { const key = resolveItem(M.MS, rv[ij]); const seen = new Set(); return M.creatives.filter(c => (!key || c.item === key) && !seen.has(c.cre) && seen.add(c.cre)).map(c => ({ v: c.cre, sub: (key ? '' : (c.item || '') + ' · ') + (c.sec ? c.sec + '초' : ''), color: itemColor(c.item) })); }; }
    if (k === 'kind' || k === 'grade') { const j = colIndex(name, k); return () => distinct(j); }
    return null;
  },

  // ---------- 오른쪽 실시간 패널 ----------
  renderSide(name) {
    const el = this.panes[name]; if (!el || !el.querySelector('[data-side="agg"]')) return;   // 입력 화면 오른쪽 패널은 없앴음
    const agg = el.querySelector('[data-side="agg"]'), iss = el.querySelector('[data-side="iss"]');
    const media = SHEETS[name].media;
    const cs = M.cells.filter(c => c.media === media);
    const A = aggCells(cs);
    const its = M.activeItems.filter(k => cs.some(c => c.item === k && (c.cnt || c.budget)));
    const mx = Math.max(1, ...its.map(k => sum(cs.filter(c => c.item === k), c => c.cnt)));
    agg.innerHTML = `<div class="card"><div class="hd"><h4>실시간 집계 · ${media}</h4></div><div class="bd">
      <dl class="kv"><dt>송출</dt><dd>${fmt.int(A.cnt)}회</dd><dt>예산</dt><dd>${fmt.eok(A.budget, 2)}</dd><dt>보너스 · 보너스율</dt><dd>${fmt.eok(A.bonus, 2)} · ${fmt.pct(A.rate)}</dd><dt>GRP · eq.GRP</dt><dd>${fmt.int(A.grp)} · ${fmt.int(A.eq)}</dd></dl>
      <div class="mini" style="margin-top:10px">${its.map(k => { const v = sum(cs.filter(c => c.item === k), c => c.cnt); return `<div class="r"><span>${esc(k)}</span><span class="b"><span style="width:${v / mx * 100}%;background:${itemColor(k)}"></span></span><span class="v">${fmt.int(v)}</span></div>`; }).join('')}</div>
      <div class="mini" style="margin-top:10px">${M.weeks.map((w, i) => `<div class="r"><span class="muted">${w.label} ${w.range}</span><span class="b"><span style="width:${(A.wk[i] || 0) / Math.max(1, ...A.wk) * 100}%;background:${SLATE[1]}"></span></span><span class="v">${fmt.int(A.wk[i] || 0)}</span></div>`).join('')}</div></div></div>`;
    this.renderSideSel(name);
    const list = M.issues.filter(i => i.sheet === name);
    iss.innerHTML = this.unknownHtml() + `<div class="card"><div class="hd"><h4>확인 필요 ${list.length ? `<span class="badge ${list.some(i => i.sev === 'err') ? 'err' : 'warn'}">${list.length}</span>` : ''}</h4></div><div class="bd">${list.length ? `<div class="issues">${list.slice(0, 80).map((i, k) => `<div class="iss" data-i="${k}"><span class="sev ${i.sev}"></span>${i.row >= 0 ? `<span class="rw">${i.row + 1}행</span>` : ''}<span>${esc(i.msg)}</span></div>`).join('')}${list.length > 80 ? `<div class="muted small">… 외 ${list.length - 80}건 (검증 탭)</div>` : ''}</div>` : '<span class="muted small">문제 없어요</span>'}</div></div>`;
    iss.querySelectorAll('[data-i]').forEach(d => d.onclick = () => { const i = list[+d.dataset.i]; if (i.row >= 0) this.grids[name].gotoData(i.row, i.col ? colIndex(name, i.col) : 0); });
    this.bindUnknown(iss);
  },
  renderSideSel(name) {
    const el = this.panes[name]; if (!el) return;
    const box = el.querySelector('[data-side="sel"]'); if (box) box.innerHTML = this.selHtml(name, this.selRow[name]);
  },
  selHtml(name, y) {
    if (y == null || y < 0) return `<div class="card"><div class="hd"><h4>선택한 행</h4></div><div class="bd small muted">행을 선택하면 주차·CM 구분·이 채널×품목의 예산과 보너스율을 바로 보여줘요</div></div>`;
    const s = M.spots.find(x => x.src === name && x.row === y);
    if (!s) return `<div class="card"><div class="hd"><h4>${y + 1}행</h4></div><div class="bd small muted">빈 행이에요</div></div>`;
    const c = s.item && M.cellMap.get(s.ch + '|' + s.item);
    const iss = M.issues.filter(i => i.sheet === name && i.row === y);
    return `<div class="card selrow"><div class="hd"><h4>${y + 1}행</h4></div><div class="bd">
      <div class="big">${esc(s.ch)} · ${esc(s.prog)}</div>
      <div class="tags">${s.day ? `<span class="tagb">${M.ym.m}/${s.day} (${s.dow}) · ${s.week}주</span>` : '<span class="tagb live">날짜 없음</span>'}<span class="tagb">${esc(s.cmCls)}${s.cmRaw ? ' · ' + esc(s.cmRaw) : ''}</span>${s.src === '지상파' ? (s.bonus ? '<span class="tagb bon">보너스</span>' : '<span class="tagb paid">유상</span>') : ''}${s.item ? `<span class="spot" style="--c:${itemLight(s.item)};--b:${itemColor(s.item)};display:inline-block">${esc(s.item)}${s.cre ? ' · ' + esc(s.cre) : ''} ${s.sec || ''}초</span>` : ''}</div>
      ${c ? `<dl class="kv"><dt>${esc(s.ch)} × ${esc(s.item)} 예산</dt><dd>${fmt.eok(c.budget, 2)}</dd><dt>이 조합 송출</dt><dd>${fmt.int(c.cnt)}회</dd><dt>보너스 · 보너스율</dt><dd>${fmt.eok(c.bonus, 2)} · ${fmt.pct(c.rate)}</dd><dt>GRP · eq.GRP</dt><dd>${fmt.dec(c.grp, 1)} · ${fmt.dec(c.eq, 1)}</dd></dl>` : ''}
      ${iss.map(i => `<div class="iss"><span class="sev ${i.sev}"></span><span>${esc(i.msg)}</span></div>`).join('')}</div></div>`;
  },
  // 마스터에 없는 이름 → 별칭 연결
  unknownNames() {
    const items = new Map(), chs = new Map();
    for (const s of M.spots) {
      if (s.itemRaw && !s.item && !s.itemHint) items.set(s.itemRaw, (items.get(s.itemRaw) || 0) + 1);
      if (s.chRaw && !s.chInfo) chs.set(s.chRaw, (chs.get(s.chRaw) || 0) + 1);
    }
    return { items, chs };
  },
  unknownHtml() {
    const { items: unk, chs: unkCh } = this.unknownNames();
    if (!unk.size && !unkCh.size) return '';
    const opts = [...M.MS.items.keys()].map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
    const chOpts = M.MS.chList.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');
    return `<div class="card unkcard"><div class="hd"><h4>마스터에 없는 이름</h4></div><div class="bd small">
      ${[...unk].map(([n, k]) => `<div class="unkrow"><span><b>${esc(n)}</b> <span class="muted">${k}회</span></span><select data-unk="${esc(n)}"><option value="">약칭으로 바꾸기…</option>${opts}<option value="__new">＋ 새 품목으로 추가</option></select></div>`).join('')}
      ${[...unkCh].map(([n, k]) => `<div class="unkrow"><span><b>${esc(n)}</b> <span class="muted">${k}회</span></span><select data-unkch="${esc(n)}"><option value="">채널 별칭으로…</option>${chOpts}</select></div>`).join('')}
      <div class="muted">품목은 별칭 없이 약칭으로 고쳐 넣어요 (시트에 적힌 이름이 바뀌어요). 채널은 별칭으로 연결돼요.</div></div></div>`;
  },
  bindUnknown(root) {
    root.querySelectorAll('[data-unk]').forEach(s => s.onchange = () => {
      const name = s.dataset.unk, v = s.value; if (!v) return;
      if (v === '__new') { WS.sheets.품목.push([name, name, '기타', nextColor(), '']); return this.masterChanged(`"${name}" → 새 품목`); }
      const n = renameEverywhere('item', name, v);
      this.dataReplaced(); this.toast(`'${esc(name)}'을(를) 약칭 '${esc(v)}'(으)로 고쳤어요 (${renameTxt(n)})`);
    });
    root.querySelectorAll('[data-unkch]').forEach(s => s.onchange = () => {
      const name = s.dataset.unkch, v = s.value; if (!v) return;
      const r = WS.sheets.채널.find(r => str(r[0]) === v); if (r) r[1] = addAlias(r[1], name);
      this.masterChanged(`"${name}" → ${v}`);
    });
  },
  masterChanged(msg) { this.changed('master'); if (msg) this.toast(`마스터에 반영했어요: ${esc(msg)}`); },

  // ---------- 누적리치 ----------
  // 엑셀처럼: 그룹 블록이 옆으로 나란히(1행 그룹 이름 + Spot·Cume GRP·Reach1+·Reach3+). 블록을 누르고 Ctrl+V. 좌우 이동은 ‹ › 단추
  renderReach(el) {
    const R = WS.reach || {}, meta = WS.reachMeta || {}, gm = meta.groups || {};
    const groups = REACH_GROUPS.concat(Object.keys(R).filter(g => !REACH_GROUPS.includes(g)));
    const used = g => { const out = []; for (const o of M.ops) { for (const r of o.rows) if (r.group === g && r.grp) out.push({ t: o.item, x: r }); if (o.total.group === g && o.total.grp) out.push({ t: `${o.item} 요약`, x: o.total }); } return out; };
    const filled = groups.filter(g => (R[g] || []).length).length;
    const selG = this.reachSel && groups.includes(this.reachSel) ? this.reachSel : groups.find(g => !(R[g] || []).length) || groups[0];
    const rv = (x, f) => x[f] == null ? '-' : `<span class="${x[f + 'm'] ? 'man' : ''}" title="${x[f + 'm'] ? '운영 요약에서 직접 입력한 값' : ''}">${fmt.dec(x[f], 1)}</span>`;
    const blank = n => Array.from({ length: n }, (_, k) => `<tr class="bl"><td class="rn">${k + 1}</td><td></td><td></td><td></td></tr>`).join('');
    // 지점이 수천 개라 처음엔 앞부분만 그리고, 블록 안에서 아래로 내리면 이어서 그림
    const rrows = (pts, a, b) => pts.slice(a, b).map((p, k) => `<tr><td class="rn">${a + k + 1}</td><td>${fmt.dec(p[0], 1)}</td><td>${p[1] == null ? '' : fmt.dec(p[1], 1)}</td><td>${p[2] == null ? '' : fmt.dec(p[2], 1)}</td></tr>`).join('');
    el.innerHTML = `<div class="viewhead"><div><h2>누적리치</h2><div class="sub">아리아나 결과를 그룹 블록에 붙여넣어요 — 엑셀처럼 <b>블록을 누르고 Ctrl+V</b> (머리말·머리글째 OK) · 운영 요약 R1+·R3+는 GRP가 가장 가까운 지점 값</div></div><div class="spacer"></div>
      <span class="muted small">${filled}/${groups.length} 그룹${meta.target ? ' · ' + esc(meta.target) : ''}${meta.period ? ' · ' + esc(meta.period) : ''}</span>
      <button class="btn sm" id="reachbulk" title="기존 누적리치 시트의 A1부터 끝까지(1행 그룹 이름 + 8개 블록)">8개 그룹 한 번에 붙여넣기</button>${filled ? '<button class="btn sm ghost" id="reachclear">모두 비우기</button>' : ''}</div>
      <div class="rjump">${groups.map(g => `<button type="button" class="${(R[g] || []).length ? 'ok' : ''}${g === selG ? ' on' : ''}" data-rj="${esc(g)}"><i></i>${esc(g)}</button>`).join('')}</div>
      <section class="card rstripcard"><div class="rstrip">${groups.map((g, gi) => {
        const pts = R[g] || [], u = used(g), m = gm[g] || {};
        const L = xlCol(gi * 4), L2 = xlCol(gi * 4 + 3);
        return `<div class="rblk${pts.length ? '' : ' rnone'}${g === selG ? ' sel' : ''}" data-rg="${esc(g)}">
          <div class="rcol">${L}–${L2}</div>
          <div class="rtitle"><b>${esc(g)}</b><span>${pts.length ? `${fmt.int(pts.length)}개 지점 · GRP ~${fmt.int(pts[pts.length - 1][0])}` : '비어 있음'}</span>${pts.length ? `<button type="button" class="rclr" data-rclr="${esc(g)}" title="이 그룹 비우기">비우기</button>` : ''}</div>
          <div class="rmeta">${m.target || m.period ? esc([m.target, m.period].filter(Boolean).join(' · ')) : '&nbsp;'}</div>
          <div class="rsheet" tabindex="-1"><textarea class="rcatch" data-rp="${esc(g)}" aria-label="${esc(g)} 붙여넣기" spellcheck="false"></textarea>
            <table class="rtab"><thead><tr><th class="rn"></th><th>Cume. GRP</th><th>Reach% 1+</th><th>Reach% 3+</th></tr></thead>
            <tbody>${pts.length ? rrows(pts, 0, 120) : blank(14)}</tbody></table>
            ${pts.length ? '' : '<div class="rhint"><b>여기를 누르고 Ctrl+V</b><span>아리아나 결과를 머리글째 복사해 오세요</span></div>'}</div>
          <div class="ruse">${u.length ? `<div class="lb">운영 요약에서 쓰는 값</div><table class="t sm"><thead><tr><th class="l">품목</th><th>GRP</th><th>R1+</th><th>R3+</th></tr></thead><tbody>${u.map(x => `<tr><td class="l">${esc(x.t)}</td><td>${fmt.dec(x.x.grp, 1)}</td><td>${rv(x.x, 'r1')}</td><td>${rv(x.x, 'r3')}</td></tr>`).join('')}</tbody></table>` : '<div class="muted small">이 그룹을 쓰는 운영 요약 행이 없어요</div>'}</div>
        </div>`; }).join('')}</div></section>`;
    const card = el.querySelector('.rstripcard'), wrap = el.querySelector('.rstrip');
    hpager(card, wrap);
    const put = (rr, label) => { WS.reach = Object.assign({}, WS.reach || {}, rr.reach); WS.reachMeta = Object.assign({}, WS.reachMeta || {}, rr.meta, { groups: Object.assign({}, (WS.reachMeta || {}).groups || {}, rr.gmeta || {}) }); this.changed('reach'); this.toast(label); };
    const blkOf = g => [...el.querySelectorAll('.rblk')].find(b => b.dataset.rg === g);
    const show = (g, focus) => {
      const b = blkOf(g); if (!b) return; this.reachSel = g;
      el.querySelectorAll('.rblk').forEach(x => x.classList.toggle('sel', x === b)); el.querySelectorAll('[data-rj]').forEach(x => x.classList.toggle('on', x.dataset.rj === g));
      const l = b.offsetLeft - wrap.firstElementChild.offsetLeft, r = l + b.offsetWidth;
      if (l < wrap.scrollLeft || r > wrap.scrollLeft + wrap.clientWidth) wrap.scrollTo({ left: Math.max(0, l - 12), behavior: reduceMotion() ? 'auto' : 'smooth' });
      if (focus) b.querySelector('.rcatch').focus({ preventScroll: true });
    };
    el.querySelectorAll('.rblk').forEach(b => {
      b.addEventListener('mousedown', e => { if (e.target.closest('button,.ruse')) return; e.preventDefault(); show(b.dataset.rg, true); });
      const sheet = b.querySelector('.rsheet'), pts = R[b.dataset.rg] || [];
      if (pts.length > 120) { let shown = 120; const tb = sheet.querySelector('tbody'); sheet.addEventListener('scroll', () => { if (shown < pts.length && sheet.scrollTop + sheet.clientHeight > sheet.scrollHeight - 300) { tb.insertAdjacentHTML('beforeend', rrows(pts, shown, shown + 400)); shown += 400; } }, { passive: true }); }
      const ta = b.querySelector('.rcatch');
      ta.addEventListener('focus', () => b.classList.add('focus')); ta.addEventListener('blur', () => b.classList.remove('focus'));
      ta.addEventListener('keydown', e => {
        const k = groups.indexOf(b.dataset.rg);
        if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) { if (groups[k + 1]) { e.preventDefault(); show(groups[k + 1], true); } }
        else if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) { if (k > 0) { e.preventDefault(); show(groups[k - 1], true); } }
        else if (e.key === 'Delete' || e.key === 'Backspace') { if ((WS.reach || {})[b.dataset.rg] && !roTab('reach')) { e.preventDefault(); const c = b.querySelector('[data-rclr]'); if (c) c.click(); } }
        else if (!(e.ctrlKey || e.metaKey) && e.key.length === 1) e.preventDefault();
      });
      ta.addEventListener('paste', e => {
        e.preventDefault(); if (roTab('reach')) return this.toast(LOCK.blockedMsg('reach')); const g = b.dataset.rg;
        const cd = e.clipboardData || window.clipboardData; const B = xgParseTsv(cd ? cd.getData('text') : '');
        const blocks = B.reduce((n, r) => n + r.filter(v => /spot\s*\\?\s*variables/i.test(String(v))).length, 0);
        if (blocks > 1) { const rr = parseReachAoa(B); if (rr) return put(rr, `블록 ${Object.keys(rr.reach).length}개를 넣었어요 (1행의 그룹 이름 기준)`); }
        const one = parseReachBlock(B);
        if (!one) return this.toast('GRP·Reach 값을 찾지 못했어요. 아리아나 결과의 "Spot\\Variables | Cume. GRP | Reach% 1+ | Reach% 3+" 부분이 들어가게 복사해 주세요.', 6000);
        const nx = groups[groups.indexOf(g) + 1];
        this.reachSel = nx && !((WS.reach || {})[nx] || []).length ? nx : g; this.reachFocus = true;   // 다음 빈 블록으로 (엑셀에서 옆 칸으로 가듯)
        put({ reach: { [g]: one.pts }, meta: one.meta.period || one.meta.target ? { period: one.meta.period || meta.period, target: one.meta.target || meta.target } : {}, gmeta: { [g]: one.meta } }, `${esc(g)}: ${fmt.int(one.pts.length)}개 지점을 넣었어요${one.skipped ? ` (머리글 ${one.skipped}행은 건너뜀)` : ''}${this.reachSel !== g ? ` · 다음은 ${esc(this.reachSel)}` : ''}`);
      });
    });
    el.querySelectorAll('[data-rj]').forEach(b => b.onclick = () => show(b.dataset.rj, true));
    el.querySelectorAll('[data-rclr]').forEach(b => b.onclick = e => { e.stopPropagation(); const g = b.dataset.rclr; const r = Object.assign({}, WS.reach); delete r[g]; WS.reach = r; this.reachSel = g; this.changed('reach'); this.toast(`${esc(g)} 값을 비웠어요`); });
    const rc = el.querySelector('#reachclear');
    if (rc) rc.onclick = () => this.confirm('누적리치 비우기', '<p>모든 그룹 값을 지워요. 운영 요약의 R1+·R3+가 비게 돼요 (직접 입력한 값은 그대로).</p>', '비우기', () => { WS.reach = {}; WS.reachMeta = {}; this.changed('reach'); });
    if (roTab('reach')) { el.querySelectorAll('#reachbulk,#reachclear,[data-rclr]').forEach(x => x.remove()); }
    else el.querySelector('#reachbulk').onclick = () => this.modal(`<div class="hd"><h3>8개 그룹 한 번에 붙여넣기</h3><div class="small muted">기존 '누적리치' 시트의 A1부터 끝까지(1행 그룹 이름 + 블록들)를 복사해 아래에 붙여넣으세요. 아리아나 결과 엑셀 파일을 화면에 끌어다 놓아도 돼요.</div></div>
      <div class="bd"><textarea class="paste" id="rbp" placeholder="여기에 Ctrl+V"></textarea></div><div class="ft"><button class="btn" data-x>닫기</button></div>`, (box, close) => {
      const ta = box.querySelector('#rbp'); setTimeout(() => ta.focus(), 40);
      ta.addEventListener('paste', e => { e.preventDefault(); const cd = e.clipboardData || window.clipboardData; const rr = parseReachAoa(xgParseTsv(cd ? cd.getData('text') : '')); if (!rr) return this.toast('누적리치 형식을 찾지 못했어요. "Spot\\Variables" 머리글이 포함되게 복사해 주세요.'); close(true); put(rr, `누적리치 ${Object.keys(rr.reach).length}개 그룹을 넣었어요`); });
    });
    // 처음 열 때 고른 블록이 보이게
    // 탭을 열면 고른 블록에 바로 Ctrl+V 할 수 있게 (입력 칸이 없는 화면이라 포커스를 가져와도 됨)
    requestAnimationFrame(() => { if (this.reachScroll != null) wrap.scrollLeft = this.reachScroll; show(selG, this.tab === 'reach' && !document.querySelector('.modal-bg')); this.reachFocus = false; });
    wrap.addEventListener('scroll', () => { this.reachScroll = wrap.scrollLeft; }, { passive: true });
  },

  // ---------- 검증 ----------
  renderIssues(el) {
    const all = M.issues;
    const f = UI.issueSev;
    const list = all.filter(i => f === 'all' || i.sev === f);
    const by = groupBy(list, i => i.sheet);
    const c = s => all.filter(i => i.sev === s).length;
    el.innerHTML = `<div class="viewhead"><div><h2>검증</h2><div class="sub">누르면 해당 시트의 그 칸으로 이동해요. 오류는 집계에서 빠지는 행, 주의는 숫자가 틀릴 수 있는 행, 정보는 확인만 하면 되는 행이에요.</div></div><div class="spacer"></div>
      ${segHtml('sev', [['all', `전체 ${all.length}`], ['err', `오류 ${c('err')}`], ['warn', `주의 ${c('warn')}`], ['info', `정보 ${c('info')}`]], f)}</div>
      <div class="sheetwrap"><div class="stack">${list.length ? [...by].map(([sheet, its]) => `<section class="card"><div class="hd"><h3>${esc((SHEETS[sheet] || {}).label || sheet)}</h3><span class="sub">${its.length}건</span></div><div class="bd"><div class="issues" style="max-height:none">
        ${its.slice(0, 400).map(i => `<div class="iss" data-s="${esc(sheet)}" data-r="${i.row}" data-c="${esc(i.col || '')}"><span class="sev ${i.sev}"></span>${i.row >= 0 ? `<span class="rw">${i.row + 1}행</span>` : '<span class="rw">—</span>'}<span>${esc(i.msg)}</span></div>`).join('')}
        ${its.length > 400 ? `<div class="muted small">… 외 ${its.length - 400}건</div>` : ''}</div></div></section>`).join('') : '<section class="card"><div class="empty">확인할 항목이 없어요</div></section>'}</div>
      <aside class="side">${this.unknownHtml() || '<div class="card"><div class="bd small muted">마스터에 없는 품목·채널 이름이 생기면 여기서 바로 별칭으로 연결할 수 있어요.</div></div>'}</aside></div>`;
    bindSeg(el, 'sev', v => { UI.issueSev = v; this.renderPane('issues'); });
    this.bindUnknown(el);
    el.querySelectorAll('.iss[data-s]').forEach(d => d.onclick = () => {
      const s = d.dataset.s, r = +d.dataset.r, col = d.dataset.c || null;
      if (GRID_SHEETS.includes(s)) { this.go(s); if (r >= 0) this.grids[s].gotoData(r, col ? Math.max(0, colIndex(s, col)) : 0); }
      else if (MASTER_SHEETS.includes(s)) { UI.master = s; this.go('master', true); }
      else if (FORM_TABS[s]) this.go(s);
    });
  },

  // ---------- 가져오기 ----------
  async handleFiles(files, restore) {
    if (OBUI.bg) return OBUI.add(files);
    this.toast('파일을 읽는 중…', 2000);
    const raw = [];
    for (const f of files) {
      try {
        const buf = new Uint8Array(await f.arrayBuffer());
        await new Promise(r => setTimeout(r, 30));
        const res = readFileParts(buf, f.name);
        if (res.kind === 'legacy') { this.toast(`<b>${esc(f.name)}</b>은(는) 예전 통합 큐시트 양식이라 여기서 넣지 않아요. 이 도구에서 받은 <b>엑셀 백업</b> 파일이나 방송사 원본 큐시트만 넣을 수 있어요.`, 7000); continue; }
        if (restore && res.kind !== 'workspace') { this.toast(`<b>${esc(f.name)}</b>은(는) 이 도구의 백업 파일이 아니에요. 방송사 원본이면 ‘방송사 큐시트 온보딩’으로 넣어 주세요.`, 6000); continue; }
        if (!Object.keys(res.parts).some(k => ['지상파', '케이블', '예산', '소재', 'master', 'reach'].includes(k))) { raw.push(f); continue; }   // 방송사 원본 큐시트로 보고 '방송사 큐시트 온보딩' 창으로
        await this.importDialog(f.name, res);
      } catch (e) { console.error(e); this.toast(`${esc(f.name)}을(를) 읽지 못했어요: ${esc(e.message)}`, 6000); }
    }
    if (raw.length) { this.toast(`방송사 원본 큐시트 ${raw.length}개로 보고 '방송사 큐시트 온보딩' 창에서 열었어요`, 4000); OBUI.open(raw); }
  },
  importDialog(fileName, res) {
    const P = res.parts;
    const opts = [];
    const cur = n => (WS.sheets[n] || []).filter(r => !isBlankRow(r)).length;
    const hid = n => (P.hidden && P.hidden[n] && P.hidden[n].length) ? ` · 숨긴 행 ${P.hidden[n].length}` : '';
    if (P.지상파) opts.push(['지상파', `지상파 ${fmt.int(P.지상파.length)}행${hid('지상파')}`, `현재 ${fmt.int(cur('지상파'))}행을 교체`]);
    if (P.케이블) opts.push(['케이블', `케이블 ${fmt.int(P.케이블.length)}행${hid('케이블')}`, `현재 ${fmt.int(cur('케이블'))}행을 교체${P.cueOrder ? ' · 케이블 큐시트 순서 포함' : ''}`]);
    if (P.예산) opts.push(['예산', `예산 ${Math.max(0, P.예산.length - 1)}개 채널`, '예산표 전체를 교체']);
    if (P.소재) opts.push(['소재', `소재 ${P.소재.length}행`, '소재 시트를 교체']);
    if (P.reach) opts.push(['reach', `누적리치 ${Object.keys(P.reach).length}개 그룹`, '커브를 교체']);
    if (P.master) opts.push(['master', '마스터 (새 이름만 추가)', '기존 품목·채널·색상은 그대로 두고 없는 것만 추가']);
    const diffYm = P.ym && P.ym !== WS.ym;
    const pym = P.ym ? parseYM(P.ym) : null;
    return new Promise(resolve => {
      this.modal(`<div class="hd"><h3>백업 넣기 · ${esc(fileName)}</h3><div class="small muted">${res.kind === 'workspace' ? '이 도구에서 받은 엑셀 백업 파일이에요.' : '시트 머리글로 내용을 판별했어요.'}</div></div>
        <div class="bd">${opts.map(([k, t, s]) => `<label class="opt"><input type="checkbox" data-k="${k}" checked><span><b>${t}</b><small>${s}</small></span></label>`).join('')}
        ${diffYm ? `<div class="note warn">파일은 <b>${pym.y}년 ${pym.m}월</b>, 지금 화면은 ${parseYM(WS.ym).m}월이에요.</div>
          <label class="opt"><input type="radio" name="ymsel" value="file" checked><span><b>${pym.m}월 작업으로 넣기</b><small>${this.months.includes(P.ym) ? '저장된 그 달 작업에 넣어요' : '새 달을 만들어 넣어요'}</small></span></label>
          <label class="opt"><input type="radio" name="ymsel" value="cur"><span><b>지금 화면(${parseYM(WS.ym).m}월)에 넣기</b></span></label>` : ''}
        <div class="note">넣기 전 상태는 변경 이력에 버전으로 남겨 두고, 넣은 뒤 무엇이 바뀌었는지 보여줘요.</div></div>
        <div class="ft"><button class="btn" data-x>취소</button><button class="btn pri" id="imp-ok">넣기</button></div>`, (box, close) => {
        box.querySelector('#imp-ok').onclick = async () => {
          const pick = [...box.querySelectorAll('input[data-k]')].filter(i => i.checked).map(i => i.dataset.k);
          const toFile = diffYm && (box.querySelector('input[name=ymsel]:checked') || {}).value === 'file';
          close(true);
          try { await this.applyImport(fileName, P, pick, toFile); } catch (e) { console.error(e); this.toast('반영 중 오류: ' + esc(e.message), 6000); }
          resolve(true);
        };
      }, () => resolve(false));
    });
  },
  async applyImport(fileName, P, pick, toFile) {
    if (toFile) {
      await this.flushSave();
      let w = await Store.load(P.ym);
      if (!w) { w = emptyWorkspace(P.ym); for (const k of MASTER_SHEETS) w.sheets[k] = deepClone(WS.sheets[k]); if (CLOUD.on) { w.adv = advName(); CLOUD.at = {}; CLOUD.sent = {}; } }
      WS = fixWS(w); setM(compute(WS)); this.noFlash();
      if (CLOUD.on) CLOUD.setQs({ m: WS.ym });
      const vs = await Store.versions(WS.ym); this.lastVersionAt = vs && vs.length ? vs[vs.length - 1].time : 0;
      if (DB.ok) await DB.put('kv', WS.ym, 'lastYm');
      await this.refreshMonths();
    }
    const before = deepClone(WS);
    const hadData = ['지상파', '케이블', '예산'].some(k => (WS.sheets[k] || []).length > 1);
    if (hadData) await this.saveVersion('백업 넣기 전 자동 백업', true);
    for (const k of ['지상파', '케이블', '예산', '소재']) if (pick.includes(k) && P[k]) {
      WS.sheets[k] = P[k];
      if (GRID_SHEETS.includes(k)) WS.hidden[k] = (P.hidden && P.hidden[k]) || [];
    }
    if (pick.includes('지상파') && P.지상파) fillGroundKind(WS.sheets.지상파);
    if (pick.includes('케이블') && P.cueOrder) WS.cueOrder = P.cueOrder;
    if (pick.includes('reach') && P.reach) { WS.reach = P.reach; WS.reachMeta = P.reachMeta || {}; }
    if (pick.includes('master') && P.master) this.mergeMaster(P.master);
    if (P.itemLegacy) { WS.itemLegacy = WS.itemLegacy || {}; for (const k in P.itemLegacy) WS.itemLegacy[k] = addAlias(WS.itemLegacy[k] || '', P.itemLegacy[k]); }
    if (P.opsNotes && pick.includes('지상파') && pick.includes('케이블')) WS.opsNotes = P.opsNotes;
    if (P.opsReach && pick.includes('지상파') && pick.includes('케이블')) WS.opsReach = P.opsReach;
    const Mb = compute(fixWS(before));
    this.dataReplaced();
    const d = diffModels(Mb, M);
    await this.saveVersion(`백업 넣기: ${fileName}`, true, d);
    await this.flushSave(); if (DB.ok) await DB.put('kv', WS.ym, 'lastYm');
    this.toast(`<b>${esc(fileName)}</b> 반영 · ${diffSummary(d)}`, 6000);
  },
  mergeMaster(pm) {
    const MS = buildMaster(WS);
    let added = 0;
    for (const r of pm.품목 || []) {
      if (!str(r[0]) || resolveItemLoose(MS, r[0]) || resolveItemLoose(MS, r[1])) continue;
      const def = DEFAULT_MASTER.품목.find(d => d[0] === str(r[0]));
      WS.sheets.품목.push(def ? def.slice() : [str(r[0]), str(r[1]) || str(r[0]), str(r[2]) || '기타', /^#?[0-9a-f]{6}$/i.test(str(r[3])) ? str(r[3]) : nextColor(), str(r[4])]);
      added++;
    }
    for (const r of pm.채널 || []) { if (!str(r[0]) || resolveCh(MS, r[0])) continue; WS.sheets.채널.push(r.slice(0, 5)); added++; }
    const rk = new Set((WS.sheets.매칭규칙 = WS.sheets.매칭규칙 || []).map(r => [r[0], r[1], r[2]].map(norm).join('|')));
    for (const r of pm.매칭규칙 || []) { const k = [r[0], r[1], r[2]].map(norm).join('|'); if (!str(r[0]) || rk.has(k)) continue; WS.sheets.매칭규칙.push(r.slice(0, 4).map(str)); rk.add(k); added++; }
    const cmk = new Set(WS.sheets.CM위치.map(r => norm(r[0])));
    for (const r of pm.CM위치 || []) { if (!str(r[0]) || cmk.has(norm(r[0]))) continue; WS.sheets.CM위치.push([str(r[0]), str(r[1])]); cmk.add(norm(r[0])); added++; }
    const cpk = new Set(WS.sheets.목표CPRP.map(r => (/지상파/.test(str(r[0])) ? '지상파' : '케이블') + '|' + norm(r[1])));
    for (const r of pm.목표CPRP || []) { const k = (/지상파/.test(str(r[0])) ? '지상파' : '케이블') + '|' + norm(r[1]); if (cpk.has(k)) continue; WS.sheets.목표CPRP.push(r.slice(0, 3)); cpk.add(k); added++; }
    if (added) this.toast(`마스터에 새 항목 ${added}개를 추가했어요`);
  },

  // ---------- 버전 ----------
  async saveVersion(label, auto, diff) {
    if (!Store.ok()) return;
    let summary = '';
    if (diff) summary = diffSummary(diff);
    else {
      // 직전 버전과 비교 (온라인은 내려받지 않고, 이 화면에서 마지막으로 남긴 버전과 비교)
      let pw = null;
      if (CLOUD.on) pw = this._lastVer && this._lastVer.ym === WS.ym ? this._lastVer.ws : null;
      else { const vs = await DB.versions(WS.ym); const prev = vs && vs.length ? vs[vs.length - 1] : null; pw = prev ? prev.ws : null; }
      if (pw) { try { summary = diffSummary(diffModels(compute(fixWS(deepClone(pw))), this.pend ? compute(WS) : M)); } catch (e) { summary = ''; } }
      else summary = CLOUD.on ? '' : '첫 버전';
    }
    const Mx = this.pend ? compute(WS) : M; const A = aggCells(Mx.cells);
    this._lastVer = { ym: WS.ym, ws: deepClone(WS) };
    await Store.addVersion({ ym: WS.ym, time: Date.now(), label, auto: !!auto, ws: deepClone(WS), summary,
      stats: { g: Mx.spots.filter(s => s.src === '지상파').length, c: sum(Mx.spots.filter(s => s.src === '케이블'), s => s.cnt), budget: A.budget, value: A.value, err: Mx.issues.filter(i => i.sev === 'err').length } });
    this.lastVersionAt = Date.now(); this.dirtyV = false;
    if (this.panes.history && this.tab !== 'history') this.panes.history.dataset.ver = '';
  },
  async renderHistory(el) {
    const vs = ((await Store.versions(WS.ym)) || []).slice().reverse();
    el.innerHTML = `<div class="viewhead"><div><h2>변경 이력 · ${ymLabel()}</h2><div class="sub">위의 ‘저장’을 누를 때마다 남고, 백업을 넣거나 20분 이상 편집하면 자동으로도 남아요. ${CLOUD.on ? '기록은 온라인에 저장돼서 다른 관리자도 같이 봐요.' : '기록은 이 컴퓨터의 브라우저에 저장돼요.'}</div></div></div>
      <div class="sheetwrap" style="grid-template-columns:minmax(0,1fr) minmax(0,1.2fr)"><section class="card"><div class="hd"><h3>버전 ${vs.length}개</h3></div><div>
      ${vs.length ? vs.map((v, i) => `<div class="ver"><div class="tm">${fmt.time(v.time)}</div><div><div class="lb">${esc(v.label)}</div><div class="st tnum">지상파 ${fmt.int(v.stats.g)} · 케이블 ${fmt.int(v.stats.c)} · 예산 ${fmt.eok(v.stats.budget, 2)} · <b>${esc(v.summary || '')}</b></div></div>
        <div style="display:flex;gap:6px"><button class="btn sm" data-cmp="${v.id}">지금과 비교</button>${vs[i + 1] ? `<button class="btn sm" data-prev="${v.id}" data-p2="${vs[i + 1].id}">직전과 비교</button>` : ''}<button class="btn sm" data-dl="${v.id}" title="이 버전을 엑셀로">⤓</button><button class="btn sm" data-rs="${v.id}">되돌리기</button></div></div>`).join('') : '<div class="empty">아직 버전이 없어요</div>'}
      </div></section><section class="card"><div class="hd"><h3>비교 결과</h3></div><div class="bd" id="diffbox"><span class="muted small">왼쪽에서 비교를 누르세요</span></div></section></div>`;
    const find = id => vs.find(v => v.id === +id);
    const wsOf = async v => { if (!v._ws) v._ws = await Store.verWS(v); return fixWS(deepClone(v._ws)); };
    el.querySelectorAll('[data-cmp]').forEach(b => b.onclick = async () => { const v = find(b.dataset.cmp); this.showDiff(el, compute(await wsOf(v)), M, `${fmt.time(v.time)} → 지금`); });
    el.querySelectorAll('[data-prev]').forEach(b => b.onclick = async () => { const a = find(b.dataset.p2), v = find(b.dataset.prev); this.showDiff(el, compute(await wsOf(a)), compute(await wsOf(v)), `${fmt.time(a.time)} → ${fmt.time(v.time)}`); });
    el.querySelectorAll('[data-dl]').forEach(b => b.onclick = async () => { const v = find(b.dataset.dl); const w = await wsOf(v); saveWorkspaceXlsx(w, compute(w), ALL_SHEETS, '버전'); });
    el.querySelectorAll('[data-rs]').forEach(b => b.onclick = () => {
      const v = find(b.dataset.rs);
      this.confirm('이 버전으로 되돌리기', `<p>${fmt.time(v.time)} · ${esc(v.label)}</p><p class="small muted">지금 상태는 버전으로 남겨 둘게요.</p>`, '되돌리기', async () => {
        await this.saveVersion('되돌리기 전 자동 백업', true);
        WS = await wsOf(v); this.dataReplaced(); await this.flushSave(); this.toast('되돌렸어요');
      });
    });
  },
  showDiff(el, a, b, title) {
    const d = diffModels(a, b);
    const line = s => `${esc(s.ch)} · ${M.ym ? M.ym.m : ''}/${s.day || '?'} · ${esc(cleanProg(s.prog))} ${esc(s.start)}`;
    const val = s => `[${esc(s.item || s.itemRaw)}] ${esc(s.cre || '')} ${s.sec || ''}초 · ${fmt.won(s.price)}${s.src === '지상파' ? (s.bonus ? ' · 보너스' : ' · 유상') : ''}`;
    const box = el.querySelector('#diffbox');
    box.innerHTML = `<div class="small muted" style="margin-bottom:8px">${esc(title)} · <b>${diffSummary(d)}</b></div>
      ${d.budget.length ? `<h4 style="margin:10px 0 6px">예산 변경</h4><div class="tw"><table class="t"><thead><tr><th class="l">채널</th><th class="l">품목</th><th>전</th><th>후</th></tr></thead><tbody>${d.budget.map(x => `<tr><td class="l">${esc(x.ch)}</td><td class="l">${esc(x.item)}</td><td>${fmt.won(x.from)}</td><td>${fmt.won(x.to)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${d.changed.length ? `<h4 style="margin:14px 0 6px">변경 ${d.changed.length}</h4><div class="tw"><table class="t diffl"><thead><tr><th class="l">송출</th><th class="l">전</th><th class="l">후</th></tr></thead><tbody>${d.changed.slice(0, 300).map(x => `<tr><td class="l">${line(x.to)}</td><td class="l del">${val(x.from)}</td><td class="l add">${val(x.to)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${d.added.length ? `<h4 style="margin:14px 0 6px">추가 ${d.added.length}</h4><div class="tw"><table class="t diffl"><tbody>${d.added.slice(0, 300).map(x => `<tr><td class="l add">＋ ${line(x)}</td><td class="l">${val(x)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${d.removed.length ? `<h4 style="margin:14px 0 6px">삭제 ${d.removed.length}</h4><div class="tw"><table class="t diffl"><tbody>${d.removed.slice(0, 300).map(x => `<tr><td class="l del">− ${line(x)}</td><td class="l">${val(x)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${!d.budget.length && !d.changed.length && !d.added.length && !d.removed.length ? '<div class="empty">차이가 없어요</div>' : ''}`;
  },

  // ---------- 보고서 내보내기 ----------
  exportReport() {
    const p = M.ym;
    const title = `${advName()} ${p.m}월 TV 온에어 보고 · ${p.y}년`;
    const data = { ws: WS, title, at: Date.now() };
    const json = JSON.stringify(data).replace(/</g, '\\u003c');
    const T = id => (document.getElementById(id) || {}).textContent || '';
    const SC = '<' + '/script>';
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>`
      + `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap">`
      + `<style>${T('css-app')}</style></head><body class="report"><script>${T('lib-chart')}${SC}<script>${T('lib-xlsx')}${SC}<script>window.__REPORT__=${json};${SC}<script>${T('app-js')}${SC}</body></html>`;
    saveBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${advName()}TV_온에어보고_${WS.ym.replace('-', '')}.html`);
    this.saveVersion(`보고서 내보내기 (${fmt.time(Date.now())})`, true);
    this.toast('보고서 HTML을 내려받았어요. 링크로 전달할 곳에 올리면 돼요.');
  },

  // ---------- 모달 ----------
  modal(inner, bind, onClose) {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal">${inner}</div>`;
    document.body.appendChild(bg);
    let done = false;
    const close = (silent) => { if (done) return; done = true; bg.remove(); if (onClose && silent !== true) onClose(); const g = this.grids[this.tab]; if (g) g.focus(); };
    bg.addEventListener('mousedown', e => { if (e.target === bg) close(); });
    bg.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    bg.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => close()));
    if (bind) bind(bg, close);
    return close;
  },
  confirm(title, html, okLabel, onOk, onCancel) {
    this.modal(`<div class="hd"><h3>${esc(title)}</h3></div><div class="bd">${html}</div><div class="ft"><button class="btn" data-x>취소</button><button class="btn pri" id="cf-ok">${esc(okLabel || '확인')}</button></div>`, (box, close) => {
      const b = box.querySelector('#cf-ok'); b.onclick = () => { close(true); onOk(); }; setTimeout(() => b.focus(), 30);
    }, onCancel);
  },
};

if (typeof window !== 'undefined') window.addEventListener('DOMContentLoaded', () => App.init());
