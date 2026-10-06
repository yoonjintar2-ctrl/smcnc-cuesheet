// ===== tools/legacy.js : 예전 통합 큐시트(…TV set 큐시트….xlsx) → 작업 내용 변환 (개발용 · 앱에는 들어가지 않음) =====
// 지난달 큐시트를 온라인에 넣을 때만 씀: 빌드된 앱 페이지에 이 파일을 주입하고 legacyToWS(buf) 호출
// ---- 기존(레거시) 큐시트 통합본 ----
function readLegacy(wb, names, opt) {
  opt = opt || {};
  const parts = {}; const notes = [];
  // 1~2월 형식: '당월 운영'·'케이블raw'·'vlookup' 없이 'N월 운영 요약' 피벗 + 채널별 시트
  if (!wb.Sheets['당월 운영'] && !wb.Sheets['케이블raw']) readOldFormat(wb, names, opt, parts, notes);
  const gName = names.find(n => /^지상파TV/.test(n));
  // 당월 운영
  const op = sheetAoa(wb.Sheets['당월 운영']);
  if (op.length) {
    const s = op[3] && op[3][33], e = op[3] && op[3][34];
    const ds = parseDateVal(s), de = parseDateVal(e);
    if (ds) { parts.ym = `${ds.y}-${pad2(ds.m)}`; parts.start = ds.d; parts.end = de && de.m === ds.m ? de.d : daysInMonth(ds.y, ds.m); }
    // 예산표 위치는 달마다 한두 칸씩 다름 → '채널' 머리글 칸을 찾아서 그 오른쪽이 품목, 아래가 채널
    let hr = 34, hc = 32;
    for (let i = 26; i <= 48; i++) { const r = op[i] || []; const j = r.findIndex((v, k) => k >= 26 && k <= 44 && str(v) === '채널' && typeof r[k + 1] === 'string' && str(r[k + 1])); if (j >= 0) { hr = i; hc = j; break; } }
    const hdr = op[hr] || [];
    const items = []; for (let j = hc + 1; j <= hc + 11; j++) items.push(str(hdr[j]) && str(hdr[j]) !== '0' && isNaN(+hdr[j]) ? str(hdr[j]) : '');
    const last = items.reduce((a, v, i) => v ? i : a, -1);
    const B = [['채널'].concat(items.slice(0, last + 1))];
    for (let i = hr + 1; i <= hr + 60; i++) {
      const r = op[i]; if (!r) continue;
      const ch = str(r[hc]);
      if (/품목별|집행|^구분$|\d+\/\d+\s*~/.test(ch)) break;   // 예산표 아래 '품목별 집행 기간 및 소재' 표가 이어 붙어 있음 → 거기서 멈춤
      if (!ch || ch === '0' || /total|합계/i.test(ch)) continue;
      const vals = []; for (let j = hc + 1; j <= hc + 1 + last; j++) { const v = num(r[j]); vals.push(v || ''); }
      B.push([ch].concat(vals));
    }
    parts.예산 = B;
    notes.push(`예산 ${B.length - 1}개 채널 × ${last + 1}개 품목`);
  }
  // 지상파
  if (gName) {
    const a = sheetAoa(wb.Sheets[gName]);
    const out = legacyGroundRows(a, 5);
    parts.지상파 = out;
    notes.push(`지상파 ${out.length}회 (주차 칸 문자열 → 1행 1송출로 변환)`);
  }
  // 케이블raw
  if (wb.Sheets['케이블raw']) {
    const a = sheetAoa(wb.Sheets['케이블raw']);
    // 3~6월 파일: B열 머리글이 '소재'인데 실제로는 품목 약칭, 뒤쪽 '품목' 열은 대분류(정수기·청정기…) → 머리글을 바로잡고 읽음
    const h0 = (a[0] || []).map(str);
    if (h0[1] === '소재' && h0.indexOf('품목', 2) > 1) { a[0] = a[0].slice(); a[0][h0.indexOf('품목', 2)] = '품목대분류'; a[0][1] = '품목'; notes.push('케이블raw B열(머리글 소재) = 품목 약칭으로 읽음'); }
    const { rows } = rowsByHeader(a, '케이블');
    parts.케이블 = rows;
    notes.push(`케이블 ${rows.length}회`);
  }
  // 운영소재 — 달 중간에 소재가 바뀌면 표가 여러 개(기간별). 첫 표를 쓰고, 뒤 표에만 있는 품목(예: 1월 히티브)은 이어 붙임. '*정책성 채널' 아래 표는 제외
  const sName = names.find(n => /운영소재/.test(n));
  if (sName) {
    const a = sheetAoa(wb.Sheets[sName]);
    const tables = [];
    for (let h = 0; h < a.length; h++) {
      if (/^\*\s*정책성/.test(str((a[h] || [])[0]))) break;
      if (!(str((a[h] || [])[0]) === '품목' && /소재/.test(str(a[h][3])) && /금액/.test(str(a[h][4])))) continue;
      const out = []; let item = '';
      for (let i = h + 1; i < a.length; i++) {
        const r = a[i];
        if (isBlankRow(r)) { if (out.length) break; else continue; }
        if (/^\*/.test(str(r[0])) || str(r[0]) === '품목') break;
        if (str(r[0])) item = str(r[0]);
        out.push({ item, row: [str(r[0]), str(r[1]), str(r[2]).replace(/["”]/g, ''), str(r[3]), num(r[4]) != null ? num(r[4]) : '', num(r[5]) != null ? num(r[5]) : '', str(r[6]), str(r[7])] });
      }
      if (out.length) tables.push(out);
    }
    if (tables.length) {
      const out = tables[0].map(x => x.row); const have = new Set(tables[0].map(x => norm(x.item))); const added = [];
      for (const t of tables.slice(1)) {
        const its = [...new Set(t.map(x => norm(x.item)))].filter(k => !have.has(k));
        for (const k of its) { out.push(...t.filter(x => norm(x.item) === k).map(x => x.row)); have.add(k); added.push(t.find(x => norm(x.item) === k).item); }
      }
      parts.소재 = out;
      notes.push(`소재 ${out.filter(r => r[3] && !/계$/.test(r[3])).length}개` + (tables.length > 1 ? ` (표 ${tables.length}개 중 첫 표${added.length ? ' + 뒤 표에만 있는 ' + added.join('·') : ''})` : ''));
    }
  }
  // vlookup → 마스터(추가분만 병합) — 달마다 표 위치가 달라서(7월은 품목 표가 I열부터) 머리글로 열을 찾음
  if (wb.Sheets['vlookup']) {
    const a = sheetAoa(wb.Sheets['vlookup']);
    const find = re => { for (let i = 0; i < 3; i++) { const r = a[i] || []; const j = r.findIndex(v => re.test(str(v))); if (j >= 0) return { i, j, row: r }; } return null; };
    const it = [], ch = [], cm = [], cp = [];
    const hI = find(/^짧은\s*이름$/), hC = find(/^채널$/), hCm = find(/^CM위치$/), hP = find(/목표\s*CPRP/);
    const gCol = hC ? hC.row.findIndex((v, j) => j > hC.j && /PP\s*대구분/.test(str(v))) : -1;
    const mCol = hC ? hC.row.findIndex((v, j) => j > hC.j && j <= hC.j + 5 && /지상파\/케이블/.test(str(v))) : -1;
    const start = Math.max(hI ? hI.i : 1, hC ? hC.i : 1, hCm ? hCm.i : 1) + 1;
    let itDone = false;
    for (let i = start; i < a.length; i++) {
      const r = a[i] || [];
      if (hCm && str(r[hCm.j - 1]) && str(r[hCm.j])) cm.push([str(r[hCm.j - 1]), str(r[hCm.j])]);
      if (hC && str(r[hC.j])) { const name = str(r[hC.j]); const md = mCol >= 0 ? str(r[mCol]) : ''; ch.push([name, '', /지상파/.test(md) || /^(KBS|MBC|SBS)$/.test(name) ? '지상파' : '케이블', str(r[hC.j + 1]).replace(/^\d+\)\s*/, ''), (gCol >= 0 ? str(r[gCol]) : '') || '기타']); }
      if (hI && !itDone) { if (!str(r[hI.j])) itDone = true; else it.push([str(r[hI.j]), str(r[hI.j + 1]), str(r[hI.j + 2]), '', '']); }
      if (hP && str(r[hP.j - 1]) && num(r[hP.j])) cp.push([/지상파/.test(str(r[hP.j - 2])) ? '지상파' : '케이블', str(r[hP.j - 1]), num(r[hP.j])]);
    }
    parts.master = { 품목: it, 채널: ch, CM위치: cm, 목표CPRP: cp };
  }
  // 당월 운영 '품목별 집행 기간 및 소재' 표의 초수별 예산 비중 (엑셀 GRP 계산에 쓰는 값)
  if (op.length) {
    for (let i = 60; i < Math.min(op.length, 120); i++) {
      const r = op[i] || []; const j = r.findIndex(v => str(v) === '15초'); if (j < 0 || str(r[j + 1]) !== '30초') continue;
      const plan = {};
      for (let k = i + 1; k < i + 16; k++) { const q = op[k] || []; const nm = str(q[32]); if (!nm || nm === '0') continue; const a15 = num(q[j]) || 0, a30 = num(q[j + 1]) || 0; if (a15 || a30) plan[nm] = { 15: a15, 30: a30 }; }
      parts.secPlanXL = plan; break;
    }
  }
  // 운영 요약 '품목 요약' 줄의 리치 곡선(수동 입력: 지상파케이블 or 케이블)
  const oName = names.find(n => /운영 요약$/.test(n));
  if (oName && wb.Sheets[oName]) {
    const a = sheetAoa(wb.Sheets[oName]); const cv = {};
    for (const r of a) { const b = str(r[1]); if (/요약$/.test(b) && /^(지상파케이블|케이블)$/.test(str(r[9]))) cv[b.replace(/\s*요약$/, '')] = str(r[9]); }
    parts.curveXL = cv;
    parts.opsXL = readOpsSummary(a);
    if (parts.opsXL) notes.push(`운영 요약 ${parts.opsXL.items.length}개 품목 (엑셀 GRP·리치·주요 프로그램 기준값)`);
  }
  // 누적리치
  if (wb.Sheets['누적리치']) {
    const rr = parseReachAoa(sheetAoa(wb.Sheets['누적리치']));
    if (rr) { parts.reach = rr.reach; parts.reachMeta = rr.meta; notes.push(`누적리치 ${Object.keys(rr.reach).length}개 그룹`); }
  }
  return { kind: 'legacy', parts, notes };
}


function legacyToWS(buf, opt) {
  const head = XLSX.read(buf, { type: 'array', bookSheets: true });
  const names = head.SheetNames;
  const old = !names.includes('당월 운영') && !names.includes('케이블raw');
  const skip = /^(라디오|채널 별 세부|\d+월 주별 횟수)/;
  const want = names.filter(n => /^지상파TV/.test(n) || /운영소재/.test(n) || /운영 요약$/.test(n) || ['케이블raw', '당월 운영', 'vlookup', '누적리치'].includes(n) || (old && !skip.test(n)));
  const wb = XLSX.read(buf, { type: 'array', sheets: want, cellDates: false, cellFormula: false, cellHTML: false, cellText: false });
  return readLegacy(wb, names, opt);
}

// ---- 운영 요약 상단 표: 품목 × 방송사(KBS·MBC·SBS·CJ ENM·JTBC·기타)의 금액·횟수·GRP·eq.GRP·R1·R3·주요 프로그램 ----
// 달마다 열 위치가 다름(1월: GRP F열 / 2월: E열 / 3월~: F열 + 금액 D열) → 머리글로 찾음
function readOpsSummary(a) {
  const G = ['KBS', 'MBC', 'SBS', 'CJ ENM', 'JTBC', '기타'];
  const col = {}; let hEnd = -1, gc = -1;
  for (let i = 0; i < 8; i++) {
    (a[i] || []).forEach((v, j) => {
      const t = str(v).replace(/\s+/g, ' ').trim(); if (!t) return;
      const set = k => { if (col[k] == null) { col[k] = j; hEnd = Math.max(hEnd, i); } };
      if (t === '방송사') { gc = j; hEnd = Math.max(hEnd, i); }
      else if (/^금액/.test(t)) set('amt'); else if (t === '횟수') set('cnt');
      else if (/^GRP$/i.test(t)) set('grp'); else if (/^eq\.?\s*GRP$/i.test(t)) set('eq');
      else if (/^R1/.test(t)) set('r1'); else if (/^R3/.test(t)) set('r3'); else if (/주요\s*프로그램/.test(t)) set('prog');
    });
  }
  if (gc < 0 || col.grp == null || col.eq == null) return null;
  const items = []; let cur = null, name = '';
  const val = (r, k) => col[k] == null ? null : num(r[col[k]]);
  const rec = r => ({ amt: val(r, 'amt'), cnt: val(r, 'cnt'), grp: val(r, 'grp'), eq: val(r, 'eq'), r1: val(r, 'r1'), r3: val(r, 'r3') });
  for (let i = hEnd + 1; i < a.length; i++) {
    const r = a[i] || [];
    const c0 = str(r[0]), c1 = str(r[1]), g = str(r[gc]);
    if (/^\[/.test(c0)) break;
    if (/\s*계$/.test(c0) && !g) { if (cur) cur.total = rec(r); cur = null; continue; }
    if (/요약$/.test(c1) && !g) { if (cur) cur.total = rec(r); cur = null; continue; }
    if (!G.includes(g)) continue;
    if (c1 && (!cur || norm(c1) !== norm(cur.name))) { name = c1; cur = { name, cat: c0, rows: {} }; items.push(cur); }
    if (!cur) continue;
    let prog = '';
    if (col.prog != null) for (let j = col.prog; j <= col.prog + 3; j++) { const t = str(r[j]); if (t.length > prog.length && !/^(지상파케이블|케이블)$/.test(t) && !G.includes(t)) prog = t; }
    cur.rows[g] = Object.assign(rec(r), { prog });
  }
  return { items, col };
}

// ---- 1~2월 형식 ----
function readOldFormat(wb, names, opt, parts, notes) {
  const oName = names.find(n => /^\d+월 운영 요약$/.test(n));
  if (!oName) return;
  const Y = opt.year || 2026, Mo = +oName.match(/^(\d+)월/)[1];
  parts.ym = `${Y}-${pad2(Mo)}`;
  // 예산·방송 Value: 운영 요약 아래 '품목별/채널별 운영 상세' 피벗
  const a = sheetAoa(wb.Sheets[oName]);
  const hr = a.findIndex(r => str((r || [])[0]) === '구분' && str(r[2]) === '채널' && /예산/.test(str(r[3])));
  if (hr >= 0) {
    const H = a[hr], I = a[hr + 1] || [];
    const items = []; for (let j = 3; j < I.length; j++) { const t = str(I[j]); if (!t || /계$/.test(t)) break; items.push({ j, name: t }); }
    const vc = H.findIndex(v => /value/i.test(str(v))), bc = H.findIndex(v => /보너스\s*금액/.test(str(v)));
    const vItems = []; if (vc >= 0) for (let j = vc; j < I.length; j++) { const t = str(I[j]); if (!t || /계$/.test(t)) break; vItems.push({ j, name: t }); }
    const B = [], value = {}; let media = '';
    for (let i = hr + 2; i < a.length; i++) {
      const r = a[i] || [];
      const c0 = str(r[0]), c1 = str(r[1]), c2 = str(r[2]);
      if (/총합계|media\s*total|^라디오/i.test(c0)) break;
      if (c0) media = c0;
      if (/계$/.test(c1) || /계$/.test(c0)) continue;
      const ch = /지상파/.test(media) ? c1 : c2; if (!ch) continue;
      const vals = items.map(x => num(r[x.j]) || 0);
      const vv = vItems.map(x => num(r[x.j]) || 0);
      vItems.forEach((x, k) => { if (vv[k]) value[ch + '|' + x.name] = vv[k]; });
      if (vals.some(v => v) || vv.some(v => v)) B.push([ch].concat(vals));
    }
    const used = items.map((x, k) => B.some(r => r[k + 1])).map((u, k) => u ? k : -1).filter(k => k >= 0);
    parts.예산 = [['채널'].concat(used.map(k => items[k].name))].concat(B.map(r => [r[0]].concat(used.map(k => r[k + 1] || ''))));
    parts.valueXL = value;
    notes.push(`예산 ${B.length}개 채널 × ${used.length}개 품목 (운영 요약 피벗)`);
  }
  // 케이블: 채널별 시트(주차 칸 '품목 / 15초 / 중CM' = 1송출) → 1행 1송출. 단가는 없어서 피벗의 방송 Value ÷ 횟수로 나중에 채움
  const out = []; let d0 = 99, d1 = 0; const skipped = [];
  for (const n of names) {
    const ws = wb.Sheets[n]; if (!ws) continue;
    const s = sheetAoa(ws); if (!s.length || str((s[0] || [])[0]) !== '채널') continue;
    const chName = str((s[1] || [])[0]);
    if (!chName || norm(chName) !== norm(n)) { if (chName) skipped.push(n); continue; }   // 'JTBC IMC서비스 (브로슈어애드)'는 숨긴 참고 시트(A2 = JTBC)
    const h = s.findIndex(r => str((r || [])[0]) === '프로그램'); if (h < 0) continue;
    const wk = [];
    (s[h] || []).forEach((v, j) => { const m = str(v).match(/^\d+\s*주\s*\((\d+)\/(\d+)(?:\s*~\s*(?:(\d+)\/)?(\d+))?\)/); if (m) { const st = +m[1] === Mo ? +m[2] : 1, en = m[4] ? +m[4] : +m[2]; wk.push({ j, st, en }); d0 = Math.min(d0, st); d1 = Math.max(d1, en); } });
    let base = null;
    for (let i = h + 1; i < s.length; i++) {
      const r = s[i] || []; const p = str(r[0]);
      if (/^(합계|계|total)(\s|$)/i.test(p)) break;   // 한글 뒤에는 \b가 안 먹음
      if (p) base = { prog: p, dow: str(r[1]), start: normTime(r[2]), end: normTime(r[3]), grade: str(r[4]) };
      for (const w of wk) {
        const v = str(r[w.j]); if (!v || v === '0') continue;
        const m = v.match(/^(.+?)\s*\/\s*(\d+)\s*초\s*\/\s*(.+?)\s*$/);
        if (!m || !base) { notes.push(`${n} ${i + 1}행: 읽지 못한 칸 "${v}"`); continue; }
        let d = 0; for (let x = w.st; x <= w.en; x++) if (dowOf(Y, Mo, x) === base.dow) { d = x; break; }
        if (!d) { notes.push(`${n} ${i + 1}행: ${w.st}~${w.en}일에 ${base.dow}요일 없음`); d = w.st; }
        const di = DOW.indexOf(dowOf(Y, Mo, d));
        const cm = m[3].replace(/^(중\d+CM)\s*\(.*\)$/, '$1');
        const row = [chName, m[1].trim(), base.prog, base.dow, base.start, base.end, base.grade, +m[2], cm, '', 1, '', '', '', '', '', '', '', `${pad2(Mo)}/${pad2(d)}`, '', ''];
        row[11 + di] = 1;
        out.push(row);
      }
    }
  }
  parts.케이블 = out;
  if (d1) { parts.start = d0; parts.end = d1; }
  notes.push(`케이블 ${out.length}회 (채널별 시트)` + (skipped.length ? ` · 건너뜀: ${skipped.join(', ')}` : ''));
}
