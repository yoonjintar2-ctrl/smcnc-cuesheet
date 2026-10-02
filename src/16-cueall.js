// ===== 16-cueall.js : 전체 큐시트 — 지상파·케이블을 섞어 날짜 → 시작 시간 순, 1행 = 1회 송출 (광고주 제공용 '결과 데이터') =====
const CUEALL_EXTRA = [['cre', '소재'], ['cm', 'CM 위치'], ['grade', '시급'], ['price', '단가']];
function cueAllUI() {
  if (!UI.all) UI.all = { media: null, ch: null, item: null, a: null, b: null, q: '', cols: { cre: 1, cm: 0, grade: 0, price: 0 } };
  return UI.all;
}
// 1회 = 1행으로 펼친 전체 목록 (케이블 총횟수 2 이상이면 그 수만큼 나눔)
function cueAllRows() {
  const out = [];
  for (const s of M.spots) {
    if (!s.chRaw && !s.prog) continue;
    const n = s.src === '케이블' ? Math.max(1, Math.round(s.cnt || 1)) : 1;
    for (let k = 0; k < n; k++) out.push(s);
  }
  const mOrd = s => s.media === '지상파' ? 0 : 1;
  const itOrd = s => { const it = M.MS.items.get(s.item); return it ? it.order : 999; };
  out.sort((x, y) => (x.day || 99) - (y.day || 99) || timeToMin(x.start) - timeToMin(y.start) || mOrd(x) - mOrd(y) || chOrd(x.ch) - chOrd(y.ch) || itOrd(x) - itOrd(y) || String(x.prog).localeCompare(String(y.prog), 'ko'));
  return out;
}
function cueAllFilter(rows) {
  const f = cueAllUI();
  const lo = f.a ? dKey(f.a) : 0, hi = f.b ? dKey(f.b) : 0, q = norm(f.q);
  return rows.filter(s => {
    if (f.media && !f.media.has(s.media)) return false;
    if (f.ch && !f.ch.has(s.ch)) return false;
    if (f.item && !f.item.has(s.item || s.itemRaw)) return false;
    if (lo || hi) { if (!s.day) return false; const k = M.ym.y * 10000 + M.ym.m * 100 + s.day; if (lo && k < lo) return false; if (hi && k > hi) return false; }
    if (q && !norm(s.prog).includes(q)) return false;
    return true;
  });
}
function cueAllCols() {
  const c = cueAllUI().cols;
  const cols = [['media', '구분'], ['ch', '방송사'], ['item', '품목'], ['prog', '편성명'], ['date', '날짜'], ['dow', '요일'], ['start', '시작시간'], ['end', '종료시간'], ['sec', '초수']];
  for (const [k, t] of CUEALL_EXTRA) if (c[k]) cols.push([k, t]);
  return cols;
}
function cueAllVal(s, k) {
  if (k === 'media') return s.media;
  if (k === 'ch') return s.ch;
  if (k === 'item') return s.item || s.itemRaw;
  if (k === 'prog') return s.prog;
  if (k === 'date') return s.day ? `${M.ym.m}/${s.day}` : '';
  if (k === 'dow') return s.dow || s.dowRaw || '';
  if (k === 'start') return s.start;
  if (k === 'end') return s.end;
  if (k === 'sec') return s.sec || '';
  if (k === 'cre') return s.cre;
  if (k === 'cm') return s.cmRaw ? (s.cmCls && s.cmCls !== s.cmRaw && s.cmCls !== '일반' ? `${s.cmRaw} (${s.cmCls})` : s.cmRaw) : (s.cmCls === '일반' ? '' : s.cmCls);
  if (k === 'grade') return s.grade;
  if (k === 'price') return s.price || '';
  return '';
}

function renderCueAll(root) {
  const f = cueAllUI();
  const all = cueAllRows();
  // 고른 값이 이번 달 목록에 없으면 풀기
  const chs = [...new Set(all.map(s => s.ch))].sort((a, b) => chOrd(a) - chOrd(b));
  const items = M.MS.itemOrder.filter(k => all.some(s => s.item === k)).concat([...new Set(all.filter(s => !s.item && s.itemRaw).map(s => s.itemRaw))]);
  const keep = (set, list) => { if (!set) return null; const x = new Set([...set].filter(v => list.includes(v))); return x.size && x.size < list.length ? x : null; };
  f.media = keep(f.media, ['지상파', '케이블']); f.ch = keep(f.ch, chs); f.item = keep(f.item, items);
  const rows = cueAllFilter(all);
  const cols = cueAllCols();
  const nG = rows.filter(s => s.media === '지상파').length;
  const days = new Set(rows.map(s => s.day).filter(Boolean)).size;
  const dTxt = f.a ? `${f.a.m}/${f.a.d} – ${f.b ? `${f.b.m}/${f.b.d}` : ''}` : `${M.ym.m}/1 – ${M.ym.m}/${daysInMonth(M.ym.y, M.ym.m)}`;
  const chOpts = chs.map(c => { const x = M.MS.chByName.get(c); return { v: c, t: c, sub: x ? (x.media === '지상파' ? '지상파' : x.mpp) : '' }; });
  const itOpts = items.map(k => ({ v: k, t: k, color: M.MS.items.has(k) ? itemColor(k) : '#b9c2cb' }));
  const W = { media: 74, ch: 128, item: 122, prog: 0, date: 62, dow: 46, start: 76, end: 76, sec: 50, cre: 120, cm: 120, grade: 52, price: 100 };
  root.innerHTML = `<div class="viewhead"><div><h2>전체 큐시트</h2><div class="sub">${ymLabel()} · 지상파·케이블을 섞어 <b>날짜 → 시작 시간</b> 순으로, 1행 = 1회 송출 · 광고주에게 주는 결과 데이터 형식</div></div><div class="spacer"></div>
      <button class="btn pri" id="ca-dl">⤓ 다운로드 (엑셀)</button></div>
    <section class="card cafilter"><div class="bd">
      ${mselHtml('media', '구분', [{ v: '지상파', t: '지상파' }, { v: '케이블', t: '케이블' }], f.media)}
      ${mselHtml('ch', '방송사', chOpts, f.ch)}
      ${mselHtml('item', '품목', itOpts, f.item)}
      <div class="msel"><span class="ml">날짜</span><button type="button" class="mbtn${f.a ? ' on' : ''}" id="ca-date"><span class="mtag${f.a ? '' : ' all'}">${dTxt}</span><span class="car">▾</span></button></div>
      <div class="msel"><span class="ml">편성명</span><input class="search" id="ca-q" placeholder="검색" value="${esc(f.q)}"></div>
      ${f.media || f.ch || f.item || f.a || f.q ? '<button class="btn sm ghost" id="ca-reset">필터 해제</button>' : ''}
      <div class="spacer"></div>
      <div class="cacols"><span class="ml">추가 열</span>${CUEALL_EXTRA.map(([k, t]) => `<label class="${f.cols[k] ? 'checked' : ''}"><input type="checkbox" data-cacol="${k}" ${f.cols[k] ? 'checked' : ''}>${t}</label>`).join('')}</div>
    </div></section>
    <div class="castat"><span><b class="tnum">${fmt.int(rows.length)}</b>회</span><span class="muted">지상파 ${fmt.int(nG)} · 케이블 ${fmt.int(rows.length - nG)} · ${days}일</span>${rows.length !== all.length ? `<span class="muted">(전체 ${fmt.int(all.length)}회 중)</span>` : ''}<div class="spacer"></div><span class="note0">※ 방송사 사정에 따라 편성명과 시간은 일부 변경될 수 있습니다.</span></div>
    <section class="card"><div class="tw caw"><table class="t caall"><colgroup><col style="width:46px">${cols.map(([k]) => `<col${W[k] ? ` style="width:${W[k]}px"` : ''}>`).join('')}</colgroup>
    <thead><tr><th class="no"></th>${cols.map(([k, t]) => `<th class="c-${k}">${t}</th>`).join('')}</tr></thead><tbody></tbody></table></div></section>`;
  // 화면에 보이는 줄만 그림 (수천 행이어도 바로 열리게) — 줄 높이는 고정
  const RH = 31, wrap = root.querySelector('.caw'), tb = root.querySelector('table.caall tbody');
  const rowHtml = (s, i) => {
    const nd = i && rows[i - 1].day !== s.day; const band = (s.day || 0) % 2 ? ' odd' : '';
    return `<tr class="${nd ? 'nd' : ''}${band}"><td class="no">${i + 1}</td>${cols.map(([k]) => {
      const v = cueAllVal(s, k);
      if (k === 'item') { const it = M.MS.items.get(s.item); return `<td class="c-item"><span class="ipill${it ? '' : ' unk'}" style="--c:${it ? it.light : '#f3e3e1'};--b:${it ? it.color : '#8f3d35'}">${esc(v)}</span></td>`; }
      if (k === 'media') return `<td class="c-media"><span class="md ${s.media === '지상파' ? 'g' : 'c'}">${esc(v)}</span></td>`;
      if (k === 'prog') return `<td class="c-prog l" title="${esc(v)}">${progHtml(v)}</td>`;
      if (k === 'price') return `<td class="c-price r">${v ? fmt.won(v) : ''}</td>`;
      if (k === 'cre') return `<td class="c-cre l">${esc(v)}</td>`;
      return `<td class="c-${k}">${esc(v)}</td>`;
    }).join('')}</tr>`;
  };
  let lastA = -1, lastB = -1;
  const paint = force => {
    if (!rows.length) { tb.innerHTML = `<tr><td colspan="${cols.length + 1}" class="empty">${all.length ? '조건에 맞는 송출이 없어요' : '지상파·케이블 탭에 송출을 넣으면 여기에 날짜순으로 쭉 나와요'}</td></tr>`; return; }
    const top = wrap.scrollTop, h = wrap.clientHeight || 600;
    const a = Math.max(0, Math.floor(top / RH) - 15), b = Math.min(rows.length, Math.ceil((top + h) / RH) + 25);
    if (!force && a === lastA && b === lastB) return; lastA = a; lastB = b;
    let h0 = '';
    for (let i = a; i < b; i++) h0 += rowHtml(rows[i], i);
    tb.innerHTML = (a ? `<tr class="sp" style="height:${a * RH}px"><td colspan="${cols.length + 1}"></td></tr>` : '') + h0 + (b < rows.length ? `<tr class="sp" style="height:${(rows.length - b) * RH}px"><td colspan="${cols.length + 1}"></td></tr>` : '');
  };
  paint(true); if (f.scroll) { wrap.scrollTop = f.scroll; paint(true); }
  wrap.addEventListener('scroll', () => { f.scroll = wrap.scrollTop; cancelAnimationFrame(wrap.__raf); wrap.__raf = requestAnimationFrame(() => paint()); }, { passive: true });
  const re = keep => { const y = window.scrollY; if (!keep) f.scroll = 0; renderCueAll(root); window.scrollTo(0, y); };
  bindMsel(root, 'media', [{ v: '지상파', t: '지상파' }, { v: '케이블', t: '케이블' }], f.media, v => { f.media = v; re(); });
  bindMsel(root, 'ch', chOpts, f.ch, v => { f.ch = v; re(); });
  bindMsel(root, 'item', itOpts, f.item, v => { f.item = v; re(); });
  root.querySelector('#ca-date').onclick = e => { e.stopPropagation(); openRangeCal(e.currentTarget, { ym: M.ym, a: f.a, b: f.b, onPick: (a, b) => { f.a = a; f.b = b; re(); } }); };
  const qi = root.querySelector('#ca-q');
  qi.oninput = debounce(() => { f.q = qi.value; const pos = qi.selectionStart; re(); const n = root.querySelector('#ca-q'); n.focus(); n.setSelectionRange(pos, pos); }, 250);
  const rs = root.querySelector('#ca-reset'); if (rs) rs.onclick = () => { Object.assign(f, { media: null, ch: null, item: null, a: null, b: null, q: '' }); re(); };
  root.querySelectorAll('[data-cacol]').forEach(i => i.onchange = () => { f.cols[i.dataset.cacol] = i.checked ? 1 : 0; re(true); });
  root.querySelector('#ca-dl').onclick = () => exportCueAll(rows);
}
function exportCueAll(rows) {
  const cols = cueAllCols();
  const serial = d => (Date.UTC(M.ym.y, M.ym.m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
  const head = ['No'].concat(cols.map(c => c[1]));
  const aoa = [head].concat(rows.map((s, i) => [i + 1].concat(cols.map(([k]) => k === 'date' ? (s.day ? serial(s.day) : '') : k === 'sec' || k === 'price' ? (cueAllVal(s, k) === '' ? '' : +cueAllVal(s, k)) : cueAllVal(s, k)))));
  const iItem = cols.findIndex(c => c[0] === 'item') + 1, iDate = cols.findIndex(c => c[0] === 'date') + 1;
  const W = { media: 8, ch: 16, item: 14, prog: 46, date: 12, dow: 6, start: 9, end: 9, sec: 6, cre: 18, cm: 12, grade: 6, price: 12 };
  const f = cueAllUI(); const tag = f.a ? `_${f.a.m}${pad2(f.a.d)}-${f.b ? f.b.m + pad2(f.b.d) : ''}` : '';
  downloadBook([{ name: '전체 큐시트', aoa, widths: [6].concat(cols.map(([k]) => W[k] || 10)),
    autofilter: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: head.length - 1 } }),
    numFmt: (r, c) => c === iDate ? 'yyyy-mm-dd' : c === 0 ? '0' : '#,##0',
    styler: (r, c) => {
      if (r === 0) return null;
      const s = rows[r - 1];
      if (c === iItem) { const it = M.MS.items.get(s.item); if (it) return xsMerge(XS.cell, { fill: { fgColor: { rgb: hexRgb(it.light) } }, alignment: { horizontal: 'center', vertical: 'center' } }); }
      const k = cols[c - 1] && cols[c - 1][0];
      if (c === 0 || ['media', 'ch', 'date', 'dow', 'start', 'end', 'sec', 'grade'].includes(k)) return xsMerge(XS.cell, { alignment: { horizontal: 'center', vertical: 'center' } });
      return null;
    } }], `코웨이 큐시트_${M.ym.y % 100}년 ${M.ym.m}월${tag}_결과데이터.xlsx`);
  App.toast(`${fmt.int(rows.length)}행을 엑셀로 내려받았어요`);
}
