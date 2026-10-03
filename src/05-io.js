// ===== 05-io.js : 엑셀 읽기(작업·백업 파일·케이블raw·아리아나) / 쓰기 =====

function sheetAoa(ws) {
  if (!ws || !ws['!ref']) return [];
  const rg = XLSX.utils.decode_range(ws['!ref']);
  rg.s.r = 0; rg.s.c = 0; // 항상 A1부터 (시트 사용 범위가 P1 등에서 시작해도 열 번호 고정)
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: true, range: XLSX.utils.encode_range(rg) });
}
function hnorm(h) { return norm(h).replace(/\(.*$/, ''); }

// 머리글 이름 → 열 키 (시트 종류별)
const HEADER_MAP = {
  지상파: { ch: ['채널'], kind: ['구분'], prog: ['프로그램', '프로그램명'], dow: ['요일'], start: ['시작', '시작시간', '시작2'], end: ['종료', '종료시간', '종료2'],
    grade: ['시급'], sec: ['초수'], price: ['단가'], amount: ['금액'], date: ['날짜', '집행일자', '일자'], item: ['품목'], cre: ['소재'],
    cm: ['cm지정', 'cm위치', 'cm순서'], rate: ['지정율', '지정률'], ar: ['a.r', 'ar', 'a.r%'], note: ['비고'] },
  케이블: { ch: ['채널'], item: ['품목'], prog: ['프로그램명', '프로그램'], dow: ['요일'], start: ['시작2', '시작', '시작시간'], end: ['종료2', '종료', '종료시간'],
    grade: ['시급'], sec: ['초수'], cm: ['구분', 'cm위치', 'cm구분'], price: ['단가'], cnt: ['총횟수', '횟수'],
    d1: ['월'], d2: ['화'], d3: ['수'], d4: ['목'], d5: ['금'], d6: ['토'], d7: ['일'], date: ['날짜', '일자'], cre: ['소재'], note: ['비고'] },
};
function mapHeaders(header, sheet) {
  const map = {}; const hm = HEADER_MAP[sheet];
  const hs = header.map(hnorm);
  for (const k in hm) {
    for (const cand of hm[k]) {
      const j = hs.findIndex((h, idx) => h === norm(cand) && !Object.values(map).includes(idx));
      if (j >= 0) { map[k] = j; break; }
    }
  }
  return map;
}
function rowsByHeader(aoa, sheet, headerRow = 0, hiddenSrc) {
  const header = aoa[headerRow] || [];
  const map = mapHeaders(header, sheet);
  const cols = SHEETS[sheet].cols;
  const out = [], hidden = [];
  for (let i = headerRow + 1; i < aoa.length; i++) {
    const r = aoa[i];
    if (isBlankRow(r)) continue;
    if (hiddenSrc && hiddenSrc.has(i)) hidden.push(out.length);
    out.push(cols.map(c => (map[c.k] != null ? cleanCell(r[map[c.k]]) : '')));
  }
  return { rows: out, map, hidden };
}
// 엑셀에서 숨긴 행 번호(0부터, 시트 기준)
function hiddenRowsOf(ws) { const s = new Set(); (ws && ws['!rows'] || []).forEach((r, i) => { if (r && r.hidden) s.add(i); }); return s; }
function cleanCell(v) {
  if (v == null) return '';
  if (typeof v === 'string') { const t = v.trim(); return t.startsWith('=') ? '' : t; }
  return v;
}

// ---- 예전 가로형 지상파 표(주차 칸에 '[품목] 소재30') → 1행 1송출 ----
const LEGACY_SPOT = /^\s*\[(.+?)\]\s*(.*?)\s*(\d+)\s*$/;
function legacyGroundRows(a, from = 0) {
  const out = []; let cur = '', kind = '';
  for (let i = from; i < a.length; i++) {
    const r = a[i] || [];
    const A = str(r[0]);
    if (/total|cm지정비|예비비|연계/i.test(A)) { cur = ''; kind = ''; if (/3사|grand/i.test(A)) break; continue; }
    // 엑셀에서 머리글째 복사했을 때의 제목·머리글 행(채널/프로그램, 1주·10/1~4 …)은 건너뜀
    if (A === '채널' || str(r[2]) === '프로그램' || /큐시트$/.test(A)) continue;
    if (A && A !== cur) { cur = A; kind = ''; }
    if (str(r[1])) kind = str(r[1]);   // 구분(정기물 등)은 병합 칸이라 첫 행에만 있음 → 아래 행에도 이어서 적음
    const prog = str(r[2]); if (!prog) continue;
    for (let w = 20; w <= 25; w++) {
      const v = r[w];
      if (typeof v !== 'string' || !v.trim() || v.trim().startsWith('=')) continue;
      const t = v.trim();
      // 복사하면 숫자도 글자로 옴: 주차 합계(9, 16 …)·'-'·주차 머리글은 송출이 아님
      if (/^[\d,.\s()-]+$/.test(t) || /^(주차별|\d+주|\d{1,2}\/\d{1,2}(~\d{1,2}(\/\d{1,2})?)?)$/.test(t)) continue;
      const m = v.match(LEGACY_SPOT);
      const item = m ? m[1].trim() : '', cre = m ? m[2].trim() : v.trim(), sec = m ? +m[3] : (num(r[7]) || '');
      // 지정율이 있어도 지정금액 칸(O열)이 비어 있으면 엑셀 CM지정비에 안 들어감 → 엑셀 기준으로 지정율을 비고로 옮김
      let rate = num(r[13]) != null ? num(r[13]) : '', note = str(r[11]);
      if (rate && r.length > 14 && !(num(r[14]) > 0)) { note = [note, `지정율 ${Math.round(rate * 1000) / 10}% (지정금액 없음)`].filter(Boolean).join(' · '); rate = ''; }
      out.push([cur, kind, prog, str(r[3]), normTime(r[4]), normTime(r[5]), str(r[6]), sec, num(r[8]) || '', num(r[10]) != null ? num(r[10]) : (/^\s*-+\s*$/.test(String(r[10] == null ? '' : r[10])) ? 0 : ''),
        str(r[19]), item, cre, str(r[12]), rate, num(r[46]) != null ? num(r[46]) : '', note]);
    }
  }
  return out;
}
function isLegacyGroundBlock(B) {
  let hit = 0;
  for (const r of B) { if (!r || r.length < 21) continue; for (let w = 20; w <= 25; w++) if (typeof r[w] === 'string' && LEGACY_SPOT.test(r[w])) { hit++; break; } if (hit >= 2) return true; }
  return false;
}

// ---- 아리아나 누적리치 (8블록 가로 배치) ----
function parseReachAoa(a) {
  if (!a || !a.length) return null;
  // 'Spot\Variables' 머리글 행 찾기
  let h = -1;
  for (let i = 0; i < Math.min(a.length, 60); i++) if ((a[i] || []).some(v => /spot\s*\\?\s*variables/i.test(str(v)))) { h = i; break; }
  if (h < 0) {
    // 긴 형식: 그룹 | Cume GRP | R1 | R3
    const hdr = (a[0] || []).map(norm);
    if (hdr[0] === '그룹') {
      const reach = {};
      for (let i = 1; i < a.length; i++) { const r = a[i]; const g = str(r[0]); const x = num(r[1]); if (!g || x == null) continue; (reach[g] = reach[g] || []).push([x, num(r[2]), num(r[3])]); }
      for (const g in reach) reach[g] = thinCurve(reach[g]);
      return { reach, meta: {} };
    }
    return null;
  }
  const reach = {}, meta = {};
  const row0 = a[0] || [];
  (a[h] || []).forEach((v, c) => {
    if (!/spot/i.test(str(v))) return;
    let g = str(row0[c]);
    if (!g) for (let k = c; k >= Math.max(0, c - 3); k--) if (str(row0[k])) { g = str(row0[k]); break; }
    if (!g) g = '그룹' + c;
    const pts = [];
    for (let i = h + 1; i < a.length; i++) {
      const r = a[i] || []; const x = num(r[c + 1]);
      if (x == null) { if (str(r[c]) === '') break; else continue; }
      pts.push([x, num(r[c + 2]), num(r[c + 3])]);
    }
    if (pts.length) reach[g] = thinCurve(pts);
    if (!meta.period) { for (let i = 0; i < h; i++) { const r = a[i] || []; if (/reported/i.test(str(r[c]))) meta.period = str(r[c + 1]).replace(/;\s*$/, ''); if (/target/i.test(str(r[c]))) meta.target = str((a[i + 1] || [])[c + 1]).split(' ')[0]; } }
  });
  return Object.keys(reach).length ? { reach, meta } : null;
}
// 그룹 하나: 아리아나 결과(머리말·"Spot\Variables" 머리글 포함 가능) 또는 숫자만(4열: spot·GRP·R1·R3 / 3열: GRP·R1·R3)
function parseReachBlock(a) {
  if (!a || !a.length) return null;
  const meta = {}; let h = -1, cG = -1, c1 = -1, c3 = -1;
  for (let i = 0; i < Math.min(a.length, 80); i++) {
    const r = a[i] || [];
    r.forEach((v, j) => {
      const t = str(v);
      if (/reported\s*date/i.test(t) && !meta.period) meta.period = str(r[j + 1]).replace(/;\s*$/, '');
      if (/^target$/i.test(t) && !meta.target) meta.target = str((a[i + 1] || [])[j]).split(' ')[0];
    });
    const gi = r.findIndex(v => /cume/i.test(str(v)));
    if (gi >= 0) { h = i; cG = gi; c1 = r.findIndex(v => /reach\D*1/i.test(str(v))); c3 = r.findIndex(v => /reach\D*3/i.test(str(v))); break; }
  }
  const pts = []; let skipped = 0;
  if (h >= 0) {
    if (c1 < 0) c1 = cG + 1; if (c3 < 0) c3 = cG + 2;
    for (let i = h + 1; i < a.length; i++) { const r = a[i] || []; const x = num(r[cG]); if (x == null) continue; pts.push([x, num(r[c1]), num(r[c3])]); }
    skipped = h + 1;
  } else {
    for (const r of a) {
      const ns = (r || []).map(v => num(v)).filter(v => v != null);
      if (ns.length >= 4) pts.push([ns[1], ns[2], ns[3]]); else if (ns.length === 3) pts.push(ns.slice(0, 3)); else if ((r || []).some(v => str(v))) skipped++;
    }
  }
  return pts.length ? { pts: thinCurve(pts), meta, skipped } : null;
}
// 누적리치 곡선 줄이기: GRP는 원본 자릿수 그대로(소수 넷째 자리), R1·R3가 같은 구간은 처음·끝 점만 남김 → '가장 가까운 점' 찾기 결과는 원본 곡선과 똑같음 (여러 번 해도 같음)
function thinCurve(pts) {
  const P = pts.filter(p => p && p[0] != null && isFinite(p[0])).map(p => [Math.round(p[0] * 1e4) / 1e4, p[1], p[2]]).sort((x, y) => x[0] - y[0]);
  const same = (a, b) => a[1] === b[1] && a[2] === b[2];
  const out = [];
  for (let i = 0; i < P.length; i++) {
    const p = P[i]; if (out.length && out[out.length - 1][0] === p[0]) continue;   // 같은 GRP는 처음 것
    const prev = P[i - 1], next = P[i + 1];
    if (prev && next && same(prev, p) && same(p, next)) continue;                    // 구간 가운데 점
    out.push(p);
  }
  return out;
}

// ---- 파일 판별 ----
function isLegacyBook(names) { return names.some(n => /^지상파TV/.test(n)) || names.includes('케이블raw') || names.includes('당월 운영'); }
function readFileParts(buf, fileName) {
  const head = XLSX.read(buf, { type: 'array', bookSheets: true });
  const names = head.SheetNames;
  // 예전 통합 큐시트 양식은 이 도구에서 바로 넣지 않음 (지난 큐시트는 담당자가 따로 변환해 넣음)
  if (isLegacyBook(names)) return { kind: 'legacy', parts: {}, notes: [] };
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, cellFormula: false, cellHTML: false, cellText: false, cellStyles: true });
  const parts = {}; const notes = [];
  // 작업 파일 (_meta)
  if (wb.Sheets['_meta']) {
    for (const r of sheetAoa(wb.Sheets['_meta'])) {
      const k = str(r[0]), v = r[1];
      if (k === 'ym') parts.ym = str(v);
      if (k === 'reachPeriod' && str(v)) (parts._rm = parts._rm || {}).period = str(v);
      if (k === 'reachTarget' && str(v)) (parts._rm = parts._rm || {}).target = str(v);
    }
  }
  for (const name of wb.SheetNames) {
    const a = sheetAoa(wb.Sheets[name]);
    const key = ALL_SHEETS.find(s => norm(s) === norm(name)) || (norm(name) === norm('목표 CPRP') ? '목표CPRP' : null);
    if (key && key !== '예산' && SHEETS[key].cols && (key === '지상파' || key === '케이블')) {
      const { rows, hidden } = rowsByHeader(a, key, 0, hiddenRowsOf(wb.Sheets[name]));
      parts[key] = rows; notes.push(`${key} ${rows.length}행${hidden.length ? ` (숨긴 행 ${hidden.length})` : ''}`);
      if (hidden.length) (parts.hidden = parts.hidden || {})[key] = hidden;
    } else if (name === '케이블순서') {
      const co = {};
      for (const r of a.slice(1)) { const ch = str(r[0]), k = str(r[2]); if (ch && k) (co[ch] = co[ch] || []).push([num(r[1]) || 0, k]); }
      for (const ch in co) co[ch] = co[ch].sort((x, y) => x[0] - y[0]).map(x => x[1]);
      if (Object.keys(co).length) parts.cueOrder = co;
    } else if (key === '예산') {
      parts.예산 = trimRows(a).map(r => r.map(cleanCell)); notes.push(`예산 ${Math.max(0, parts.예산.length - 1)}개 채널`);
    } else if (key) {
      const t = SHEETS[key].cols.map(c => c.t);
      const body = a.length && norm(a[0][0]) === norm(t[0]) ? a.slice(1) : a;
      const rows = trimRows(body).map(r => t.map((_, j) => cleanCell(r[j])));
      // 예전 작업 파일의 품목 '별칭' 열 → 비고로 옮기지 않고, 잘못 적힌 이름 알림용으로만 보관
      if (key === '품목' && a.length && norm((a[0] || [])[4]) === '별칭') { parts.itemLegacy = {}; for (const r of rows) { if (str(r[0]) && str(r[4])) parts.itemLegacy[str(r[0])] = str(r[4]); r[4] = ''; } }
      if (MASTER_SHEETS.includes(key)) { parts.master = parts.master || {}; parts.master[key] = rows; }
      else parts[key] = rows;
      notes.push(`${SHEETS[key].label} ${rows.length}행`);
    } else if (name === '리치직접입력') {
      parts.opsReach = {}; for (const r of a.slice(1)) { if (!str(r[0]) || !str(r[1])) continue; const o = {}; if (num(r[2]) != null) o.r1 = num(r[2]); if (num(r[3]) != null) o.r3 = num(r[3]); if (Object.keys(o).length) parts.opsReach[str(r[0]) + '|' + str(r[1])] = o; }
    } else if (name === 'GRP초수비중') {
      parts.secPlan = {}; for (const r of a.slice(1)) { const k = str(r[0]), sec = num(r[1]), v = num(r[2]); if (!k || !sec || v == null) continue; (parts.secPlan[k] = parts.secPlan[k] || {})[sec] = v; }
    } else if (name === '요약리치곡선') {
      parts.opsCurve = {}; for (const r of a.slice(1)) { const k = str(r[0]), v = str(r[1]); if (k && (v === '지상파케이블' || v === '케이블')) parts.opsCurve[k] = v; }
    } else if (name === '주요프로그램') {
      parts.opsNotes = {}; for (const r of a.slice(1)) if (str(r[0]) && str(r[2])) parts.opsNotes[str(r[0]) + '|' + str(r[1])] = str(r[2]);
    } else if (/누적리치|리치|reach/i.test(name)) {
      const rr = parseReachAoa(a); if (rr) { parts.reach = rr.reach; parts.reachMeta = rr.meta; notes.push(`누적리치 ${Object.keys(rr.reach).length}개 그룹`); }
    } else {
      // 머리글로 판별
      const hdr = (a[0] || []).map(hnorm);
      if (hdr.includes('프로그램명') && hdr.includes('품목') && hdr.includes('단가') && !parts.케이블) { const { rows } = rowsByHeader(a, '케이블'); parts.케이블 = rows; notes.push(`케이블 ${rows.length}행 ('${name}' 시트)`); }
      else if (hdr.includes('프로그램') && hdr.includes('품목') && hdr.includes('날짜') && !parts.지상파) { const { rows } = rowsByHeader(a, '지상파'); parts.지상파 = rows; notes.push(`지상파 ${rows.length}행 ('${name}' 시트)`); }
      else { const rr = parseReachAoa(a); if (rr && !parts.reach) { parts.reach = rr.reach; parts.reachMeta = rr.meta; notes.push(`누적리치 ${Object.keys(rr.reach).length}개 그룹 ('${name}')`); } }
    }
  }
  if (parts._rm) { if (parts.reach) parts.reachMeta = Object.assign({}, parts.reachMeta || {}, parts._rm); delete parts._rm; }
  return { kind: wb.Sheets['_meta'] ? 'workspace' : 'single', parts, notes };
}

// ---- 쓰기 ----
const XS = {
  head: { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10, name: '맑은 고딕' }, fill: { fgColor: { rgb: '3F5B73' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: bd('2B4256') },
  sub: { font: { bold: true, sz: 10, name: '맑은 고딕', color: { rgb: '1D2833' } }, fill: { fgColor: { rgb: 'E7EDF2' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: bd('C9D4DE') },
  cell: { font: { sz: 10, name: '맑은 고딕', color: { rgb: '1D2833' } }, alignment: { vertical: 'center' }, border: bd('DFE4E9') },
  total: { font: { bold: true, sz: 10, name: '맑은 고딕', color: { rgb: '1D2833' } }, fill: { fgColor: { rgb: 'EEF1F4' } }, alignment: { vertical: 'center' }, border: bd('C9D4DE') },
};
function bd(c) { const s = { style: 'thin', color: { rgb: c } }; return { top: s, bottom: s, left: s, right: s }; }
function xsMerge(base, extra) { return JSON.parse(JSON.stringify(Object.assign({}, base, extra || {}))); }
function hexRgb(h) { return String(h || '').replace('#', '').toUpperCase(); }

// sheets: [{name, aoa, widths?, styler?(r,c,v)->style, merges?, numFmt?(r,c)->fmt, headerRows?}]
function buildBook(sheets) {
  const wb = XLSX.utils.book_new();
  for (const sh of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sh.aoa);
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    const hr = sh.headerRows == null ? 1 : sh.headerRows;
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        let cell = ws[addr];
        if (!cell) { if (r < hr) { cell = ws[addr] = { t: 's', v: '' }; } else continue; }
        let s = r < hr ? XS.head : XS.cell;
        if (sh.styler) { const x = sh.styler(r, c, cell.v); if (x) s = x; }
        cell.s = s;
        if (cell.t === 'n') { const f = sh.numFmt ? sh.numFmt(r, c, cell.v) : null; cell.z = f || (Math.abs(cell.v) >= 1000 ? '#,##0' : (Number.isInteger(cell.v) ? '0' : '0.0')); }
      }
    }
    if (sh.widths) ws['!cols'] = sh.widths.map(w => ({ wch: w }));
    if (sh.merges) ws['!merges'] = sh.merges;
    if (sh.autofilter) ws['!autofilter'] = { ref: sh.autofilter };
    ws['!rows'] = Array.from({ length: hr }, () => ({ hpt: 22 }));
    for (const r of sh.hiddenRows || []) ws['!rows'][r] = { hidden: true };
    XLSX.utils.book_append_sheet(wb, ws, sh.name.slice(0, 31));
  }
  return wb;
}
function saveBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.style.display = 'none';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function downloadBook(sheets, filename) {
  const wb = buildBook(sheets);
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
  saveBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}

function itemFill(M, key) {
  const it = M && M.MS.items.get(key);
  return it ? { fgColor: { rgb: hexRgb(it.light) } } : null;
}
function numify(v, isNum) {
  if (!isNum) return v;
  const n = num(v); return n == null ? (v === '' ? '' : v) : n;
}

// 작업 파일(엑셀) — 입력 시트 + 마스터 + 누적리치 + _meta
function workspaceSheets(WS, M, which) {
  const out = [];
  for (const name of which) {
    const def = SHEETS[name];
    if (name === '예산') {
      const aoa = (WS.sheets.예산 || []).map((r, i) => r.map((v, j) => (i > 0 && j > 0) ? numify(v, true) : v));
      out.push({ name: '예산', aoa: aoa.length ? aoa : [['채널']], widths: [14].concat(Array(12).fill(14)),
        styler: (r, c) => r === 0 ? XS.head : c === 0 ? XS.sub : null });
      continue;
    }
    const ki = def.cols.findIndex(c => c.k === 'item' || (name === '품목' && c.k === 'key'));
    const colorIdx = name === '품목' ? 3 : -1;
    const rows = (WS.sheets[name] || []).map(r => def.cols.map((c, j) => numify(r[j] == null ? '' : r[j], c.num)));
    out.push({
      name, aoa: [def.cols.map(c => c.t)].concat(rows),
      hiddenRows: ((WS.hidden || {})[name] || []).filter(i => i < rows.length).map(i => i + 1),
      widths: def.cols.map(c => Math.max(4, Math.round(c.w / 7))),
      autofilter: rows.length ? XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: def.cols.length - 1 } }) : null,
      styler: (r, c, v) => {
        if (r === 0) return null;
        if (c === ki && M) { const key = name === '품목' ? str(v) : resolveItem(M.MS, v); const f = itemFill(M, key); if (f) return xsMerge(XS.cell, { fill: f }); }
        if (c === colorIdx && /^#?[0-9a-f]{6}$/i.test(str(v))) return xsMerge(XS.cell, { fill: { fgColor: { rgb: hexRgb(v) } }, font: { color: { rgb: 'FFFFFF' }, sz: 10 } });
        return null;
      },
    });
  }
  return out;
}
function reachSheet(WS) {
  const aoa = [['그룹', 'Cume GRP', 'Reach1+(%)', 'Reach3+(%)']];
  for (const g of Object.keys(WS.reach || {})) for (const p of WS.reach[g]) aoa.push([g, p[0], p[1], p[2]]);
  return { name: '누적리치', aoa, widths: [14, 12, 12, 12] };
}
function notesSheet(WS) {
  const aoa = [['품목', '방송사', '주요 프로그램(직접 입력)']];
  for (const k of Object.keys(WS.opsNotes || {})) { const [a, b] = k.split('|'); aoa.push([a, b, WS.opsNotes[k]]); }
  return { name: '주요프로그램', aoa, widths: [14, 12, 80] };
}
function reachOvSheet(WS) {
  const aoa = [['품목', '방송사(합계=품목 요약)', 'R1+(%) 직접 입력', 'R3+(%) 직접 입력']];
  for (const k of Object.keys(WS.opsReach || {})) { const [a, b] = k.split('|'); const o = WS.opsReach[k] || {}; aoa.push([a, b, o.r1 == null ? '' : o.r1, o.r3 == null ? '' : o.r3]); }
  return { name: '리치직접입력', aoa, widths: [14, 22, 16, 16] };
}
function secPlanSheet(WS) {
  const aoa = [['품목', '초수', '예산 비중 (GRP 계산용)']];
  for (const k of Object.keys(WS.secPlan || {})) for (const s of Object.keys(WS.secPlan[k] || {})) aoa.push([k, +s, WS.secPlan[k][s]]);
  return { name: 'GRP초수비중', aoa, widths: [14, 8, 20] };
}
function opsCurveSheet(WS) {
  const aoa = [['품목', '품목 요약 리치 곡선 (직접 고름)']];
  for (const k of Object.keys(WS.opsCurve || {})) aoa.push([k, WS.opsCurve[k]]);
  return { name: '요약리치곡선', aoa, widths: [14, 26] };
}
function cueOrderSheet(WS) {
  const aoa = [['채널', '순서', '프로그램|요일|시작|종료|시급']];
  for (const ch of Object.keys(WS.cueOrder || {})) (WS.cueOrder[ch] || []).forEach((k, i) => aoa.push([ch, i + 1, k]));
  return { name: '케이블순서', aoa, widths: [14, 6, 70] };
}
function metaSheet(WS, which) {
  return { name: '_meta', aoa: [['key', 'value'], ['app', '코웨이 TV 큐시트 ' + APP_VERSION], ['ym', WS.ym], ['savedAt', new Date().toISOString()], ['sheets', which.join(',')], ['reachPeriod', (WS.reachMeta || {}).period || ''], ['reachTarget', (WS.reachMeta || {}).target || '']], widths: [14, 40] };
}
function saveWorkspaceXlsx(WS, M, which, suffix) {
  const sheets = workspaceSheets(WS, M, which);
  if (which.length === ALL_SHEETS.length && Object.keys(WS.reach || {}).length) sheets.push(reachSheet(WS));
  if (which.length === ALL_SHEETS.length && Object.keys(WS.opsNotes || {}).length) sheets.push(notesSheet(WS));
  if (which.length === ALL_SHEETS.length && Object.keys(WS.opsReach || {}).length) sheets.push(reachOvSheet(WS));
  if ((which.length === ALL_SHEETS.length || which.includes('소재')) && Object.keys(WS.secPlan || {}).length) sheets.push(secPlanSheet(WS));
  if (which.length === ALL_SHEETS.length && Object.keys(WS.opsCurve || {}).length) sheets.push(opsCurveSheet(WS));
  if (which.includes('케이블') && Object.keys(WS.cueOrder || {}).length) sheets.push(cueOrderSheet(WS));
  sheets.push(metaSheet(WS, which));
  const ymTxt = WS.ym.replace('-', '');
  downloadBook(sheets, `코웨이TV큐시트_${ymTxt}_${suffix || '작업'}_${fmt.stamp()}.xlsx`);
}
