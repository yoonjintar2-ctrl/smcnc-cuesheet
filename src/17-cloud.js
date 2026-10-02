// ===== 17-cloud.js : 온라인 운영 (GitHub Pages + Supabase) — 뷰어 모드 / 관리자 모드 =====
// config.js 에 window.CUE_CONFIG = { url, anonKey } 가 있으면 온라인 모드, 없으면 지금처럼 이 컴퓨터(브라우저)에 저장하는 모드.
// 뷰어: 링크(?c=캠페인)로 들어와 운영사항·큐시트만 봄(수정 불가). 관리자: 비밀번호로 접속하면 지금과 같은 편집 화면, 고친 내용은 바로 온라인에 저장.
// 데이터 보호(supabase/schema.sql): 표는 RLS로 모두 막고 함수로만 — 읽기는 캠페인 코드를 아는 사람만, 쓰기는 비밀번호로 받은 세션 토큰이 있어야
function readOnly() { return !!REPORT || (CLOUD.on && !CLOUD.admin); }
function advName() { return (CLOUD.camp && CLOUD.camp.name) || (typeof WS !== 'undefined' && WS && WS.adv) || '코웨이'; }

const CLOUD = {
  on: false, admin: false, cfg: null, tok: null, camp: null, camps: [], at: {}, sent: {}, saving: false, again: false, err: null,
  PARTS: ['meta', '지상파', '케이블', '예산', '소재', 'master', 'reach'],
  init() {
    const c = typeof window !== 'undefined' && window.CUE_CONFIG;
    if (!c || !c.url || !c.anonKey || /YOUR-/.test(c.url)) return false;
    this.cfg = c; this.on = true;
    // ?viewer=1 이면 관리자로 접속해 있어도 뷰어 화면으로 (관리자 메뉴의 '뷰어 화면으로 보기')
    try { const t = JSON.parse(sessionStorage.getItem('cue.admin') || 'null'); if (t && t.tok && this.qs('viewer') !== '1') { this.tok = t; this.admin = true; } } catch (e) { }
    return true;
  },
  qs(k) { try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; } },
  setQs(o) { try { const u = new URL(location.href); for (const k in o) { if (o[k] == null) u.searchParams.delete(k); else u.searchParams.set(k, o[k]); } history.replaceState(null, '', u); } catch (e) { } },

  // ---------- 통신 ----------
  async req(path, { method = 'GET', body, headers = {} } = {}) {
    // 새 방식 공개 키(sb_publishable_…)는 apikey 머리글만, 예전 anon 키(JWT)는 Authorization 에도
    const h = Object.assign({ apikey: this.cfg.anonKey, 'Content-Type': 'application/json' }, /^sb_/.test(this.cfg.anonKey) ? {} : { Authorization: 'Bearer ' + this.cfg.anonKey }, headers);
    let r;
    try { r = await fetch(this.cfg.url.replace(/\/$/, '') + path, { method, headers: h, body: body == null ? undefined : JSON.stringify(body) }); }
    catch (e) { const x = new Error('인터넷 연결을 확인해 주세요'); x.net = true; throw x; }
    const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = txt; }
    if (!r.ok) {
      const x = new Error((j && (j.message || j.msg || j.error_description || j.error)) || ('HTTP ' + r.status)); x.status = r.status; x.body = j;
      if (r.status === 401 && /session expired/i.test(x.message) && this.admin) { this.logout(true); x.message = '관리자 접속 시간이 끝났어요. 새로고침해서 다시 접속해 주세요'; }
      throw x;
    }
    return j;
  },
  rpc(fn, args) { return this.req('/rest/v1/rpc/' + fn, { method: 'POST', body: args }); },
  // 관리자 함수: 세션 토큰을 함께 보냄
  arpc(fn, args) { return this.rpc(fn, Object.assign({ p_tok: this.tok && this.tok.tok }, args)); },

  // ---------- 관리자 접속 (비밀번호 → 세션 토큰, 이 탭에서만 유지) ----------
  async login(pw) {
    const t = await this.rpc('cue_login', { p_pw: pw });
    this.tok = { tok: typeof t === 'string' ? t : (t && t.cue_login) }; this.admin = true;
    try { sessionStorage.setItem('cue.admin', JSON.stringify(this.tok)); } catch (e) { }
  },
  logout(silent) {
    const t = this.tok && this.tok.tok; if (t && !silent) this.rpc('cue_logout', { p_tok: t }).catch(() => { });
    this.tok = null; this.admin = false; try { sessionStorage.removeItem('cue.admin'); } catch (e) { }
    if (!silent) setTimeout(() => location.reload(), 150);
  },

  // ---------- 캠페인 · 달 ----------
  async loadCamps() { this.camps = this.admin ? (await this.arpc('cue_admin_camps', {})) || [] : []; return this.camps; },
  async campInfo(id) {
    if (this.admin) { const c = this.camps.find(x => x.id === id); if (c) return c; }
    const r = await this.rpc('cue_view_camp', { p_camp: id }); return Array.isArray(r) ? r[0] || null : r;
  },
  async months(id) { return ((await this.rpc('cue_view_months', { p_camp: id })) || []).map(r => typeof r === 'string' ? r : r.ym); },
  async newCamp(name) {
    const id = (str(name).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) || 'camp') + '-' + Math.random().toString(36).slice(2, 10);
    await this.arpc('cue_admin_camp_save', { p_id: id, p_name: name });
    return id;
  },
  async renameCamp(id, name) { await this.arpc('cue_admin_camp_save', { p_id: id, p_name: name }); if (this.camp && this.camp.id === id) this.camp.name = name; },

  // ---------- 작업 내용 (달 단위, 시트 묶음별로 따로 저장 → 지상파·케이블 담당자가 동시에 고쳐도 서로 안 덮음) ----------
  parts(w) {
    const S = w.sheets;
    return {
      meta: { v: w.v, ym: w.ym, start: w.start, end: w.end, palV: w.palV, itemV: w.itemV, itemLegacy: w.itemLegacy || {}, reachMeta: w.reachMeta || {}, opsNotes: w.opsNotes || {}, opsReach: w.opsReach || {}, adv: w.adv || '' },
      지상파: { rows: S.지상파 || [], hidden: (w.hidden || {}).지상파 || [] },
      케이블: { rows: S.케이블 || [], hidden: (w.hidden || {}).케이블 || [], cueOrder: w.cueOrder || {} },
      예산: S.예산 || [['채널']], 소재: S.소재 || [],
      master: { 품목: S.품목, 채널: S.채널, CM위치: S.CM위치, 목표CPRP: S.목표CPRP, 매칭규칙: S.매칭규칙 || [] },
      reach: w.reach || {},
    };
  },
  fromParts(rows, ym) {
    const P = {}; this.at = {}; this.sent = {};
    for (const r of rows || []) { P[r.part] = r.data; this.at[r.part] = r.updated_at; this.sent[r.part] = JSON.stringify(r.data); }
    const w = emptyWorkspace(ym);
    const m = P.meta || {};
    for (const k of ['v', 'start', 'end', 'palV', 'itemV', 'itemLegacy', 'reachMeta', 'opsNotes', 'opsReach', 'adv']) if (m[k] != null) w[k] = m[k];
    if (P.지상파) { w.sheets.지상파 = P.지상파.rows || []; w.hidden.지상파 = P.지상파.hidden || []; }
    if (P.케이블) { w.sheets.케이블 = P.케이블.rows || []; w.hidden.케이블 = P.케이블.hidden || []; w.cueOrder = P.케이블.cueOrder || {}; }
    if (P.예산) w.sheets.예산 = P.예산; if (P.소재) w.sheets.소재 = P.소재;
    if (P.master) for (const k of MASTER_SHEETS) if (P.master[k]) w.sheets[k] = P.master[k];
    if (P.reach) w.reach = P.reach;
    return fixWS(w);
  },
  async load(id, ym) {
    const rows = await this.rpc('cue_view', { p_camp: id, p_ym: ym });
    if (!rows || !rows.length) return null;
    return this.fromParts(rows, ym);
  },
  // 바뀐 묶음만 올림. 다른 관리자가 그사이 같은 묶음을 저장했으면 'conflict'
  async save(w, force) {
    if (!this.admin || !this.camp) return;
    if (this.saving) { this.again = true; return; }
    this.saving = true; this.again = false;
    try {
      const P = this.parts(w); let n = 0;
      for (const k of this.PARTS) {
        const s = JSON.stringify(P[k]);
        if (!force && this.sent[k] === s) continue;
        try {
          const ts = await this.arpc('cue_save', { p_camp: this.camp.id, p_ym: w.ym, p_part: k, p_data: P[k], p_prev: this.at[k] || null, p_who: this.who() });
          this.at[k] = typeof ts === 'string' ? ts : (ts && ts.cue_save) || ts; this.sent[k] = s; n++;
        } catch (e) {
          if (e.status === 409 || /conflict/i.test(e.message)) { const x = new Error('conflict'); x.conflict = k; throw x; }
          throw e;
        }
      }
      this.err = null; return n;
    } catch (e) { this.err = e; throw e; }
    finally { this.saving = false; if (this.again) setTimeout(() => App.cloudSave(), 50); }
  },
  // 저장한 사람 표시용 이름 (이 브라우저에 한 번 적어 두면 충돌 알림에 나옴)
  who() { try { return localStorage.getItem('cue.who') || null; } catch (e) { return null; } },
  async serverStamps(id, ym) {
    const r = await this.rpc('cue_stamps', { p_camp: id, p_ym: ym });
    const o = {}; for (const x of r || []) o[x.part] = x; return o;
  },

  // ---------- 버전 (변경 이력) — 작업 내용 전체를 압축해서 ----------
  async gz(obj) {
    const s = JSON.stringify(obj);
    if (typeof CompressionStream === 'undefined') return 'j:' + s;
    const cs = new CompressionStream('gzip'); const wr = cs.writable.getWriter(); wr.write(new TextEncoder().encode(s)); wr.close();
    const b = new Uint8Array(await new Response(cs.readable).arrayBuffer()); let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return 'z:' + btoa(bin);
  },
  async ungz(t) {
    if (/^j:/.test(t)) return JSON.parse(t.slice(2));
    const bin = atob(t.slice(2)); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    const ds = new DecompressionStream('gzip'); const wr = ds.writable.getWriter(); wr.write(b); wr.close();
    return JSON.parse(await new Response(ds.readable).text());
  },
  async addVersion(rec) {
    const wsz = await this.gz(rec.ws);
    await this.arpc('cue_ver_add', { p_camp: this.camp.id, p_ym: rec.ym, p_time: new Date(rec.time).toISOString(), p_label: rec.label, p_auto: !!rec.auto, p_summary: rec.summary || '', p_stats: rec.stats || {}, p_wsz: wsz });
  },
  async versions(ym) {
    if (!this.admin || !this.camp) return [];
    const r = await this.arpc('cue_ver_list', { p_camp: this.camp.id, p_ym: ym });
    return (r || []).map(v => Object.assign(v, { time: new Date(v.vt || v.time).getTime(), lazy: true }));
  },
  async versionWS(id) { const z = await this.arpc('cue_ver_get', { p_id: id }); return z ? this.ungz(typeof z === 'string' ? z : z.cue_ver_get) : null; },
};
