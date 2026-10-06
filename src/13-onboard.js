// ===== 13-onboard.js : 방송사 원본(raw) 큐시트 가져오기 — 채널·품목·CM위치 자동 매칭 =====
// 해석(12-qmengine.js)과 채널·품목 판정(lookupPC · getSoakedLabel)은 Q-Mate v3.7.2 로직 그대로.
// 규칙 표만 이 앱의 '매칭 규칙'(마스터)에 두고, 판정 결과 이름은 마스터 이름·별칭으로 맞춘다.
// 못 찾은 것은 화면에서 마스터 목록 중 고르게 하고, 마스터에 없으면 새로 추가하도록 안내한다(고른 것은 규칙으로 기억).

// Q-Mate v3.7.2 기본 채널 규칙 [파일명 포함, 시트명 포함, MPP, 채널] — 위에서부터 첫 일치. 채널·MPP가 모두 빈 규칙 = 그 시트 빼기
const QM_CH_RULES = [
  ['SBS Sport', '', 'SBS', 'SBS Sports'], ['SBS비즈', '', 'SBS', 'SBS Biz'], ['SBS 비즈', '', 'SBS', 'SBS Biz'], ['SBS Biz', '', 'SBS', 'SBS Biz'], ['SBS Plus', '', 'SBS', 'SBS Plus'], ['KBS JOY', '', 'KBS', 'KBS Joy'],
  [' KBS ', '', 'KBS', 'KBS'], ['_KBS_', '', 'KBS', 'KBS'], [' SBS ', '', 'SBS', 'SBS'], ['_SBS_', '', 'SBS', 'SBS'], [' MBC ', '', 'MBC', 'MBC'], ['_MBC_', '', 'MBC', 'MBC'], ['MBC-TV', '', 'MBC', 'MBC'],
  ['JTBC2_', '', 'JTBC 미디어컴', 'JTBC2'], ['JTBC_', '', 'JTBC 미디어컴', 'JTBC'],
  ['CJENM', 'tvN SHOW', 'CJ ENM', 'tvN Show'], ['CJENM', 'tvN DRAMA', 'CJ ENM', 'tvN Drama'], ['CJENM', 'tvN STORY', 'CJ ENM', 'tvN Story'], ['CJENM', 'tvN', 'CJ ENM', 'tvN'], ['CJENM', 'Mnet', 'CJ ENM', 'Mnet'], ['CJENM', 'OCN Movies', 'CJ ENM', 'OCN Movies'], ['CJENM', 'OCN', 'CJ ENM', 'OCN'], ['CJENM', '', 'CJ ENM', ''],
  ['CJ ENM', 'tvN SHOW', 'CJ ENM', 'tvN Show'], ['CJ ENM', 'tvN DRAMA', 'CJ ENM', 'tvN Drama'], ['CJ ENM', 'tvN STORY', 'CJ ENM', 'tvN Story'], ['CJ ENM', 'tvN', 'CJ ENM', 'tvN'],
  ['CJ_', 'tvN SHOW', 'CJ ENM', 'tvN Show'], ['CJ_', 'tvN DRAMA', 'CJ ENM', 'tvN Drama'], ['CJ_', 'tvN STORY', 'CJ ENM', 'tvN Story'], ['CJ_', 'tvN', 'CJ ENM', 'tvN'],
  ['KBS조이', '', 'KBS', 'KBS Joy'], ['MBC every1', '일자별', '', ''], ['MBC every1', '', 'MBC', 'MBC every1'], ['SBS 플러스', '', 'SBS', 'SBS Plus'],
  ['E채널', '', 't.cast', 'E채널'], ['DRAMAcube', '', 't.cast', 'DRAMAcube'], ['드라맥스', '', 'iHQ', 'Dramax'], ['ENAPLAY', '', 'KT ENA', 'ENA Play'], ['ENADRAMA', '', 'KT ENA', 'ENA Drama'], ['ENA', '', 'KT ENA', 'ENA'],
  ['채널S', '', '미디어에스', '채널S'], ['TV조선', '', 'TV조선', 'TV조선'], ['채널A', '', '미디어렙에이', '채널A'], ['연합뉴스', '', '연합뉴스TV', '연합뉴스TV'], ['YTN', '', 'YTN', 'YTN'], ['MBN', '', 'MBN', 'MBN'],
  ['MBC 드라마넷', '', 'MBC', 'MBC드라마넷'], ['KBSN스포츠', '', 'KBS', 'KBSN스포츠'], ['KBS스포츠', '', 'KBS', 'KBSN스포츠'], ['MBC SPORTS+', '', 'MBC', 'MBC SPORTS+'], ['MBC SPORTS', '', 'MBC', 'MBC SPORTS'], ['SPOTV', '', 'SPOTV', 'SPOTV'],
];
// Q-Mate 기본 품목(소재명) 규칙 [파일명 키워드, 품목] — 품목은 마스터 별칭으로 다시 맞춘다
const QM_ITEM_RULES = [['노블', '노블'], ['페블', '페블'], ['아이콘얼음', '아이콘 얼음'], ['아이콘', '아이콘3'], ['스마트매트리스', '스매'], ['페스타', '페스타'], ['비데', '비데'], ['스매', '스매'], ['카페얼음정수기', '카페 얼음'], ['카페 얼음정수기', '카페 얼음'], ['안마', '안마매트리스'], ['음처기', '음식물처리기'], ['음식물', '음식물처리기'], ['스마트 매트리스', '스매'], ['아이콘 얼음', '아이콘 얼음'], ['얼음정수기', '아이콘 얼음']];

const OB_KINDS = ['채널', '품목', '제외'];
const kwn = s => String(s == null ? '' : s).normalize('NFC').toLowerCase();
function obRules(W = WS) { return (W.sheets.매칭규칙 || []).map(r => ({ kind: str(r[0]), file: str(r[1]), sheet: str(r[2]), val: str(r[3]) })).filter(r => OB_KINDS.includes(r.kind) && (r.file || r.sheet)); }

// ---- 채널 판정 : Q-Mate lookupPC 그대로 ----
// 규칙 목록 = 사용자 매칭 규칙(위) + Q-Mate 기본 규칙(아래) — Q-Mate와 같이 '개인 규칙 우선'
function obMappingRules(MS) {
  const user = obRules().filter(r => r.kind === '채널' || r.kind === '제외').map(r => {
    const c = r.kind === '채널' ? resolveCh(MS, r.val) : null;
    return { fileIncludes: r.file, sheetIncludes: r.sheet, pp: r.kind === '제외' ? '' : (c ? c.mpp : r.val), channel: r.kind === '제외' ? '' : (c ? c.name : r.val), user: true };
  });
  return user.concat(QM_CH_RULES.map(([f, sh, pp, ch]) => ({ fileIncludes: f, sheetIncludes: sh, pp, channel: ch })));
}
// Q-Mate v3.7.2 lookupPC(fn, sn) — 1차: 파일명 포함(+시트명 조건) · 2차: 시트명 키워드를 시트명·파일명 어디서든 · 3차: 파일명 키워드를 시트명에서
function qmLookupPC(rules, fn, sn) {
  const f = (fn || '').normalize('NFC').toLowerCase(), s = (sn || '').normalize('NFC').toLowerCase();
  for (const r of rules) {
    if (!r.fileIncludes) continue;
    if (f.indexOf(r.fileIncludes.normalize('NFC').toLowerCase()) < 0) continue;
    if (r.sheetIncludes && s.indexOf(r.sheetIncludes.normalize('NFC').toLowerCase()) < 0) continue;
    return { pp: r.pp, channel: r.channel, rule: r, pass: 1 };
  }
  const fb = (hay, key) => key.length >= 3 && hay.indexOf(key) >= 0;
  for (const r of rules) {
    if (!r.sheetIncludes) continue; if (!r.pp && !r.channel) continue;
    const k = r.sheetIncludes.normalize('NFC').toLowerCase();
    if (fb(s, k) || fb(f, k)) return { pp: r.pp, channel: r.channel, rule: r, pass: 2 };
  }
  for (const r of rules) {
    if (!r.fileIncludes) continue; if (!r.pp && !r.channel) continue;
    const k = r.fileIncludes.normalize('NFC').toLowerCase().trim();
    if (!fb(s, k)) continue;
    if (r.sheetIncludes && s.indexOf(r.sheetIncludes.normalize('NFC').toLowerCase()) < 0) continue;
    return { pp: r.pp, channel: r.channel, rule: r, pass: 3 };
  }
  return { pp: '', channel: '' };
}
function obDetectChannel(MS, fn, sn) {
  const r = qmLookupPC(obMappingRules(MS), fn, sn);
  if (!r.rule) return { ch: '', src: '', label: '' };
  const R = r.rule, src = R.user ? 'rule' : 'qmate';
  const label = `${R.user ? '매칭 규칙' : 'Q-Mate 규칙'}: ${[R.fileIncludes && (r.pass === 3 ? '시트명' : '파일명') + ' “' + R.fileIncludes.trim() + '”', R.sheetIncludes && '시트명 “' + R.sheetIncludes + '”'].filter(Boolean).join(' + ')}`;
  if (!r.pp && !r.channel) return { skip: true, src, label: label + ' → 빼기' };
  if (!r.channel) return { ch: '', pp: r.pp, src, label: label + ` → ${r.pp} (채널은 못 찾음)` };
  const c = resolveCh(MS, r.channel);
  return c ? { ch: c.name, pp: c.mpp, src, label } : { ch: '', guess: r.channel, pp: r.pp, src, label: label + ` → ‘${r.channel}’(마스터에 없음)`, unknown: true };
}

// ---- 품목 판정 : Q-Mate getSoakedLabel 그대로 (파일명 키워드, 위에서부터 첫 일치) ----
// 순서도 Q-Mate와 같이 기본 규칙이 위, 사용자 규칙이 아래
function obSoakedRules() { return QM_ITEM_RULES.map(([k, l]) => ({ fileKeyword: k, label: l })).concat(obRules().filter(r => r.kind === '품목' && r.file).map(r => ({ fileKeyword: r.file, label: r.val, user: true }))); }
function obDetectItem(MS, fn) {
  const f = String(fn == null ? '' : fn).normalize('NFC').toLowerCase();
  for (const r of obSoakedRules()) {
    const k = String(r.fileKeyword || '').normalize('NFC').toLowerCase();
    if (!k || f.indexOf(k) < 0) continue;
    const item = resolveItemLoose(MS, r.label);
    const label = `${r.user ? '매칭 규칙' : 'Q-Mate 규칙'}: 파일명 “${r.fileKeyword}”`;
    return item ? { item, src: r.user ? 'rule' : 'qmate', label } : { item: '', guess: r.label, src: 'qmate', label: label + ` → ‘${r.label}’(마스터에 없음)`, unknown: true };
  }
  return { item: '', src: '', label: '' };
}

// 이름 비슷한 순 후보 (Q-Mate 유사도 + 포함 관계)
function obSuggest(text, names, n = 4) {
  const t = norm(text); if (!t) return [];
  const sc = names.map(nm => { const k = norm(nm); let s = QME.strSimilarity(text, nm); if (k && (t.includes(k) || k.includes(t))) s += 0.6; return [nm, s]; });
  return sc.filter(x => x[1] >= 0.34).sort((a, b) => b[1] - a[1]).slice(0, n).map(x => x[0]);
}
// 파일명에서 규칙 키워드 후보: 날짜·광고주·'큐시트' 같은 흔한 말을 빼고,
// others(같이 올린 다른 파일 이름)에 없는 덩어리를 먼저 — 같은 방송사 파일 여러 개 중 이 파일만의 표시(대개 품목)
function obKeyword(fn, avoid = [], others = []) {
  const split = n => String(n).replace(/\.[^.]+$/, '').split(/[_\-\s\[\]()]+/).map(x => x.trim()).filter(Boolean);
  const toks = split(fn);
  const junk = /^(\d{2,8}|\d{1,2}월|\d{4}년|코웨이|코웨이\(주\)|coway|큐시트|q-?sheet|qsheet|cue|cuesheet|sm|c&c|cc|최종|수정|v\d+|raw|로우|원본|캠페인|운행표|[0-9a-f]{8}|\d+\.\d+|\d+\.\d+~\d+\.\d+)$/i;
  const av = avoid.map(norm).filter(Boolean);
  const ok = toks.filter(t => !junk.test(t) && !av.some(a => norm(t) === a || (a.length >= 3 && norm(t).includes(a))));
  const elsewhere = new Set(others.flatMap(split).map(norm));
  return ok.find(t => !elsewhere.has(norm(t))) || ok[0] || '';
}

// 고른 이름(또는 별칭)이 파일명에 그대로 있으면 그 글자를 규칙 키워드로 (예: 'SBS Golf_코웨이…' → 'SBS Golf')
function obKwFromName(fn, names) {
  const f = String(fn).normalize('NFC'), fl = f.toLowerCase();
  const list = names.filter(Boolean).map(n => String(n).normalize('NFC')).sort((a, b) => b.length - a.length);
  for (const n of list) { const i = fl.indexOf(n.toLowerCase()); if (i >= 0 && n.length >= 2) return f.slice(i, i + n.length); }
  return '';
}

// ---- 세션 ----
const OB = {
  files: [], seq: 1, cm: {}, mode: 'replace', media: null,   // 15차 media: 넣을 시트(지상파|케이블) — 다른 매체 행은 넣지 않음
  reset() { this.files = []; this.cm = {}; this.mode = 'replace'; this.media = null; },
  tgtOf(media) { return media === '지상파' ? '지상파' : '케이블'; },
  async addFiles(list) {
    const arr = [...list].filter(f => /\.(xlsx|xlsm|xls|csv)$/i.test(f.name));
    for (const file of arr) {
      const F = { id: this.seq++, name: file.name, size: file.size, status: 'loading', sheets: [], entry: null, item: null, itemSel: undefined, remember: true };
      this.files.push(F);
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        const MS = buildMaster(WS);
        QME.hooks.lookupPC = (fn, sn) => { const r = obDetectChannel(MS, fn, sn); if (!r || r.skip || !r.ch) return { pp: (r && r.pp) || '', channel: '' }; const c = MS.chByName.get(r.ch); return { pp: c ? c.mpp : '', channel: r.ch }; };
        QME.hooks.getBroadcastType = ch => { const c = MS.chByName.get(ch); return c ? (c.media === '지상파' ? '지상파' : '케이블/종편') : ''; };
        F.entry = QME.parseWorkbook(buf, file.name);
        F.status = 'ok';
      } catch (e) { F.status = /password|encrypt/i.test(e.message || '') ? 'locked' : 'error'; F.err = e.message; }
    }
    this.detect();
    return arr.length;
  },
  remove(id) { this.files = this.files.filter(f => f.id !== id); },
  // 자동 판정 (마스터·규칙이 바뀌면 다시)
  detect() {
    const MS = buildMaster(WS);
    for (const F of this.files) {
      if (F.status !== 'ok') continue;
      F.item = obDetectItem(MS, F.name);
      F.sheets = F.entry.sheets.map(sh => {
        const prev = (F.sheets || []).find(x => x.name === sh.name) || {};
        return { name: sh.name, sh, auto: obDetectChannel(MS, F.name, sh.name), sel: prev.sel, manual: prev.manual, remember: prev.remember != null ? prev.remember : true, kwFile: prev.kwFile, kwSheet: prev.kwSheet, kwDirty: prev.kwDirty };
      });
      if (F.itemSel !== undefined && F.itemSel && !MS.items.has(F.itemSel)) F.itemSel = undefined;
    }
    this.build();
  },
  chOf(S) { if (S.sel === '__skip') return { skip: true }; if (S.sel) return { ch: S.sel }; return S.auto; },
  itemOf(F) { return F.itemSel !== undefined ? F.itemSel : (F.item && F.item.item) || ''; },
  // 엔진으로 1행 1송출 만들기 → 이 앱의 지상파/케이블 행
  build() {
    const MS = buildMaster(WS);
    const chMap = new Map();
    for (const F of this.files) for (const S of F.sheets) chMap.set(F.name + '\u0001' + S.name, this.chOf(S));
    // 채널을 아직 못 찾은 시트도 몇 회인지 보여 주려고 임시 이름('?시트명')으로 돌린다
    QME.hooks.lookupPC = (fn, sn) => {
      let r = chMap.get(fn + '\u0001' + sn);
      if (r === undefined) r = obDetectChannel(MS, fn, sn);   // 파일 단위 판정(시트명 없이 부를 때)
      if (!r || r.skip) return { pp: '', channel: '' };
      if (!r.ch) return { pp: r.pp || '?', channel: sn ? '?' + sn : '' };
      const c = MS.chByName.get(r.ch); return { pp: c ? c.mpp : '', channel: r.ch };
    };
    QME.hooks.getBroadcastType = ch => { const c = MS.chByName.get(ch); return c ? (c.media === '지상파' ? '지상파' : '케이블/종편') : ''; };
    QME.hooks.getChannelPP = ch => { const c = MS.chByName.get(ch); return c ? c.mpp : ''; };
    QME.hooks.getSoakedLabel = () => '';
    const ok = this.files.filter(F => F.status === 'ok');
    const out = { rows: [], cm: new Map(), byFile: new Map() };
    for (const F of ok) {
      const entry = { name: F.name, status: 'loaded', sheets: F.entry.sheets.filter(sh => { const S = F.sheets.find(x => x.name === sh.name); const r = S && this.chOf(S); return r && !r.skip; }) };
      let rows = [];
      try { rows = QME.buildRows([entry]).slice(1); } catch (e) { console.error(e); F.err = e.message; }
      const item = this.itemOf(F);
      const st = { n: 0, price: 0, d1: 99, d2: 0, ym: {}, sheets: new Map(), other: new Map() };
      for (const r of rows) {
        const shName = r[57], S = F.sheets.find(x => x.name === shName), sh = S && S.sh;
        const chR = S ? this.chOf(S) : {}; const ch = chR && chR.ch || '';
        const c = ch ? MS.chByName.get(ch) : null;
        const src = sh && sh.dataRows ? sh.dataRows[r[58]] || [] : [];
        const extra = obExtra(sh, src);
        const [mo, dd] = String(r[18] || '').split('/').map(Number);
        const terr = c && c.media === '지상파';   // Q-Mate: 지상파 3사는 품목 '미지정'
        const o = { file: F.name, sheet: shName, ch, media: c ? c.media : '', item: terr ? '' : item, prog: str(r[2]), dow: str(r[3]), start: str(r[4]), end: str(r[5]), grade: str(r[6]), sec: r[7] === '' ? '' : +r[7], cm: str(r[8]), cmRaw: str(r[56]), price: r[9] === '' ? '' : +r[9], date: mo ? `${mo}/${dd}` : '', mo, dd, cre: '', note: '', amount: terr ? extra.amount : '' };
        if (this.media && c && this.tgtOf(c.media) !== this.media) { st.other.set(shName, (st.other.get(shName) || 0) + 1); continue; }   // 고른 시트가 아닌 매체
        out.rows.push(o);
        st.n++; st.price += +o.price || 0; if (dd) { st.d1 = Math.min(st.d1, dd); st.d2 = Math.max(st.d2, dd); st.ym[mo] = (st.ym[mo] || 0) + 1; }
        st.sheets.set(shName, (st.sheets.get(shName) || 0) + 1);
        if (o.cm && !MS.cm.has(norm(o.cm))) { const x = out.cm.get(o.cm) || { n: 0, files: new Set(), media: o.media }; x.n++; x.files.add(F.name); out.cm.set(o.cm, x); }
      }
      out.byFile.set(F.id, st);
    }
    this.out = out;
    return out;
  },
  // 확인이 필요한 것들
  todo() {
    const t = { ch: [], item: [], cm: [] }; const MS = buildMaster(WS);
    for (const F of this.files) {
      if (F.status !== 'ok') continue;
      for (const S of F.sheets) { const r = this.chOf(S); if (!r.skip && !r.ch) { const n = (this.out && this.out.byFile.get(F.id) || { sheets: new Map() }).sheets.get(S.name) || 0; if (n || !S.sh.dataRows || S.sh.dataRows.length) t.ch.push({ F, S, n }); } }
      const cabSheet = this.media !== '지상파' && F.sheets.some(S => { const r = this.chOf(S); if (r.skip) return false; const c = r.ch && MS.chByName.get(r.ch); return !c || c.media !== '지상파'; });
      if (cabSheet && F.itemSel === undefined && !(F.item && F.item.item)) t.item.push({ F });
    }
    if (this.out) for (const [raw, x] of this.out.cm) if (!this.cm[raw]) t.cm.push({ raw, ...x });
    return t;
  },
};
// 엔진(Q-Mate)이 안 읽는 칸 중 이 앱 지상파 시트에 꼭 필요한 '금액'(0·빈칸 = 보너스)만 따로 읽는다
function obExtra(sh, src) {
  const o = { cre: '', note: '', amount: '' }; if (!sh) return o;
  const ci = sh.colInfo || {}, H = ci.headers || [];
  if (!ci._x) {
    const find = re => H.findIndex((h, j) => re.test(String(h).replace(/\s+/g, '')) && ci.types[j] !== 'date' && ci.types[j] !== 'program');
    ci._x = { amt: find(/^(방송금액|실집행금액|집행금액|금액|유상금액)(\(원\))?$/), cre: find(/^(광고)?소재(명)?$/), note: H.findIndex((h, j) => /^비고/.test(String(h).replace(/\s+/g, '')) && ci.types[j] !== 'date') };
  }
  const X = ci._x;
  if (X.cre >= 0) o.cre = str(src[X.cre]);
  if (X.note >= 0) o.note = str(src[X.note]);
  if (X.amt >= 0) { const v = str(src[X.amt]); const n = num(v); o.amount = n != null ? n : (/^-+$/.test(v) ? 0 : ''); }
  return o;
}
// 고른 결과를 시트 행으로
function obToSheetRows(rows) {
  const cab = [], gr = [];
  for (const o of rows) {
    if (!o.ch) continue;
    const ds = DAYS_KO.map(d => (o.dow === d ? 1 : ''));
    if (o.media === '지상파') gr.push([o.ch, '', o.prog, o.dow, o.start, o.end, o.grade, o.sec, o.price, o.amount === '' ? '' : o.amount, o.date, o.item, o.cre, o.cm, '', '', o.note]);
    else cab.push([o.ch, o.item, o.prog, o.dow, o.start, o.end, o.grade, o.sec, o.cm, o.price, 1].concat(ds, [o.date, o.cre, o.note]));
  }
  return { 케이블: cab, 지상파: gr };
}
const DAYS_KO = ['월', '화', '수', '목', '금', '토', '일'];
