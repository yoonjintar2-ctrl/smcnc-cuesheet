// ===== tools/legacy.js : 예전 통합 큐시트(…TV set 큐시트….xlsx) → 작업 내용 변환 (개발용 · 앱에는 들어가지 않음) =====
// 지난달 큐시트를 온라인에 넣을 때만 씀: 빌드된 앱 페이지에 이 파일을 주입하고 legacyToWS(buf) 호출
// ---- 기존(레거시) 큐시트 통합본 ----
function readLegacy(wb, names) {
  const parts = {}; const notes = [];
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
    const { rows } = rowsByHeader(a, '케이블');
    parts.케이블 = rows;
    notes.push(`케이블 ${rows.length}회`);
  }
  // 운영소재 (첫 번째 표)
  const sName = names.find(n => /운영소재/.test(n));
  if (sName) {
    const a = sheetAoa(wb.Sheets[sName]);
    const h = a.findIndex(r => str(r[0]) === '품목' && /소재/.test(str(r[3])));
    if (h >= 0) {
      const out = [];
      for (let i = h + 1; i < a.length; i++) {
        const r = a[i];
        if (isBlankRow(r)) { if (out.length) break; else continue; }
        if (/^\*/.test(str(r[0]))) break;
        out.push([str(r[0]), str(r[1]), str(r[2]).replace(/["”]/g, ''), str(r[3]), num(r[4]) != null ? num(r[4]) : '', num(r[5]) != null ? num(r[5]) : '', str(r[6]), str(r[7])]);
      }
      parts.소재 = out;
      notes.push(`소재 ${out.filter(r => r[3] && !/계$/.test(r[3])).length}개`);
    }
  }
  // vlookup → 마스터(추가분만 병합)
  if (wb.Sheets['vlookup']) {
    const a = sheetAoa(wb.Sheets['vlookup']);
    const it = [], ch = [], cm = [], cp = [];
    for (let i = 2; i < a.length; i++) {
      const r = a[i] || [];
      if (str(r[0])) cm.push([str(r[0]), str(r[1])]);
      if (str(r[3])) ch.push([str(r[3]), '', /지상파/.test(str(r[7])) ? '지상파' : '케이블', str(r[4]).replace(/^\d+\)\s*/, ''), str(r[6]) || '기타']);
      if (str(r[10])) it.push([str(r[10]), str(r[11]), str(r[12]), '', '']);
      if (str(r[14]) && num(r[16])) cp.push([/지상파/.test(str(r[14])) ? '지상파' : '케이블', str(r[15]), num(r[16])]);
    }
    parts.master = { 품목: it, 채널: ch, CM위치: cm, 목표CPRP: cp };
  }
  // 누적리치
  if (wb.Sheets['누적리치']) {
    const rr = parseReachAoa(sheetAoa(wb.Sheets['누적리치']));
    if (rr) { parts.reach = rr.reach; parts.reachMeta = rr.meta; notes.push(`누적리치 ${Object.keys(rr.reach).length}개 그룹`); }
  }
  return { kind: 'legacy', parts, notes };
}


function legacyToWS(buf) {
  const head = XLSX.read(buf, { type: 'array', bookSheets: true });
  const names = head.SheetNames;
  const want = names.filter(n => /^지상파TV/.test(n) || /운영소재/.test(n) || ['케이블raw', '당월 운영', 'vlookup', '누적리치'].includes(n));
  const wb = XLSX.read(buf, { type: 'array', sheets: want, cellDates: false, cellFormula: false, cellHTML: false, cellText: false });
  return readLegacy(wb, names);
}
