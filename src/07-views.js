// ===== 07-views.js : 결과 화면 (요약 · 지상파/케이블 큐시트) =====
const UI = { cmUnit: 'pp', cmSort: 'mid', tab: 'summary', media: 'all', dnMedia: 'all', metric: 'budget', tcItem: 'all', cabPP: null, cabCh: 'all', gCh: 'all', issueSev: 'all', reachG: '지상파케이블', master: '품목', donutItem: 'all', donutBonus: true, dailyFocus: null, mxSec: 'all', mxDow: 'all' };
const CHARTS = {};
function killCharts(...keys) { for (const k of (keys.length ? keys : Object.keys(CHARTS))) { try { if (CHARTS[k] && CHARTS[k].destroy) CHARTS[k].destroy(); } catch (e) { } delete CHARTS[k]; } }
const CHART_INK = { muted: '#929292', grid: '#e9e9e9', ink2: '#616161' };
function chartDefaults() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = 11.5;
  Chart.defaults.color = CHART_INK.muted;
  Chart.defaults.animation = { duration: 350 };
  Chart.defaults.plugins.tooltip.backgroundColor = '#262626';
  Chart.defaults.plugins.tooltip.padding = 9;
  Chart.defaults.plugins.tooltip.cornerRadius = 7;
  Chart.defaults.plugins.tooltip.titleFont = { weight: '600' };
}
const SLATE = ['#575757', '#9e9e9e', '#d2d2d2', '#e8e8e8'];
function itemColor(key) { const it = M.MS.items.get(key); return it ? it.color : '#757575'; }
function itemLight(key) { const it = M.MS.items.get(key); return it ? it.light : '#f1f1f1'; }
function mediaCells() { return M.cells.filter(c => UI.media === 'all' || c.media === UI.media); }
function mediaSpots() { return M.spots.filter(s => s.item && s.chInfo && (UI.media === 'all' || s.media === UI.media)); }
function ymLabel() { const p = M.ym; return p ? `${p.y}년 ${p.m}월` : WS.ym; }
function segHtml(id, opts, cur) { return `<div class="seg" data-seg="${id}">${opts.map(([v, t]) => `<button data-v="${esc(v)}" class="${v === cur ? 'on' : ''}">${esc(t)}</button>`).join('')}</div>`; }
function bindSeg(root, id, fn) { root.querySelectorAll(`[data-seg="${id}"] button`).forEach(b => b.onclick = () => fn(b.dataset.v)); }
function bindChips(root, sel, fn) { root.querySelectorAll(sel).forEach(b => b.onclick = () => fn(b.dataset.v)); }
function chipsHtml(attr, list, cur) {
  return `<div class="chips">${list.map(([v, t, color]) => `<button class="chipbtn ${v === cur ? 'on' : ''}" ${attr} data-v="${esc(v)}">${color ? `<span class="sw" style="background:${color}"></span>` : ''}${esc(t)}</button>`).join('')}</div>`;
}
function xlBtn(id, label) { return `<button class="btn sm" data-xl="${id}">⤓ ${label || '엑셀'}</button>`; }

// 채널 행 묶음
function channelRows(cells) {
  const m = new Map();
  for (const c of cells) {
    if (!c.budget && !c.cnt) continue;
    if (!m.has(c.ch)) m.set(c.ch, { ch: c.ch, media: c.media, mpp: c.mpp, group: c.group, order: c.chOrder, cells: [] });
    m.get(c.ch).cells.push(c);
  }
  return [...m.values()].sort((a, b) => (a.media === b.media ? 0 : a.media === '지상파' ? -1 : 1) || a.order - b.order);
}
function itemsIn(cells) { return M.activeItems.filter(k => cells.some(c => c.item === k && (c.cnt || c.budget))); }

// ---------- 표 데이터 ----------
const METRIC_LABEL = { budget: '예산', bonus: '보너스', value: '예산+보너스', rate: '보너스율' };
function metricOf(c, metric) { if (!c) return null; return metric === 'rate' ? c.rate : c[metric]; }
function aggMetric(cells, metric) {
  if (metric === 'rate') { const b = sum(cells, c => c.budget), x = sum(cells, c => c.bonus); return b > 0 ? x / b : null; }
  return sum(cells, c => c[metric]);
}
function hierRows(cells, valsFn, filterFn) {
  const chs = channelRows(cells).filter(filterFn || (() => true));
  const rows = [];
  for (const media of ['지상파', '케이블']) {
    const list = chs.filter(r => r.media === media); if (!list.length) continue;
    for (const r of list) rows.push({ t: 'row', lab: [media, r.media === '지상파' ? r.ch : r.mpp, r.ch], vals: valsFn(r.cells) });
    rows.push({ t: 'sub', lab: [media + ' 계', '', ''], vals: valsFn(cells.filter(c => c.media === media)) });
  }
  if (chs.some(r => r.media === '지상파') && chs.some(r => r.media === '케이블')) rows.push({ t: 'tot', lab: ['합계', '', ''], vals: valsFn(cells) });
  return rows;
}
function table1(cells, metric) {
  const items = itemsIn(cells);
  const rows = hierRows(cells, list => items.map(k => aggMetric(list.filter(c => c.item === k), metric)).concat([aggMetric(list, metric)]));
  return { head: ['구분', 'MPP', '채널'].concat(items, ['계']), items, rows, ck: `t1|${UI.media}|${metric}` };
}
// 송출 횟수: 주차별 송출수 + 소재 길이(데이터에 있는 초수마다 열) + 주말 여부 + CM 위치별 비중을 한 표로
function tableCnt(cells, item) {
  const cs = item === 'all' ? cells : cells.filter(c => c.item === item);
  const W = M.weeks;
  const secs = [...new Set(cs.flatMap(c => Object.keys(c.sec).filter(k => c.sec[k] > 0).map(Number)))].filter(x => x > 0).sort((a, b) => a - b);
  const vals = list => {
    const a = aggCells(list); const n = a.cnt || 0;
    const wk = W.map((_, i) => sum(list, c => c.wk[i]));
    const mid = a.cmc.중CM || 0, pib = a.cmc.PIB || 0;
    return wk.concat([n], secs.map(x => a.sec[x] || 0), [a.wd, a.we, n ? a.we / n : null, mid, pib, n - mid - pib, n ? mid / n : null, n ? (mid + pib) / n : null]);
  };
  const nW = W.length, nS = secs.length, o = nW + 1 + nS;
  return {
    head: ['구분', 'MPP', '채널'].concat(W.map(w => `${w.n}주`), ['계'], secs.map(x => `${x}초`), ['주중', '주말', '주말 비중', '중CM', 'PIB', '전후CM 등', '중CM 비중', '중CM+PIB 비중']),
    headSub: W.map(w => w.range),
    rows: hierRows(cs, vals, r => sum(r.cells, c => c.cnt) > 0), pctCols: [o + 2, o + 6, o + 7], ck: `tc|${UI.media}|${item}`,
    groups: [['주차별 송출수', nW + 1], ['소재 길이', nS], ['주말 여부', 3], ['CM 위치별 비중', 5]].filter(g => g[1] > 0), eq: 72,
  };
}
// 같은 값이 이어지면 셀 병합(rowspan)
function spans(rows) {
  const s0 = rows.map(() => 0), s1 = rows.map(() => 0);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].t !== 'row') continue;
    if (i === 0 || rows[i - 1].t !== 'row' || rows[i - 1].lab[0] !== rows[i].lab[0]) { let j = i; while (j < rows.length && rows[j].t === 'row' && rows[j].lab[0] === rows[i].lab[0]) j++; s0[i] = j - i; }
    if (i === 0 || rows[i - 1].t !== 'row' || rows[i - 1].lab[0] !== rows[i].lab[0] || rows[i - 1].lab[1] !== rows[i].lab[1]) { let j = i; while (j < rows.length && rows[j].t === 'row' && rows[j].lab[0] === rows[i].lab[0] && rows[j].lab[1] === rows[i].lab[1]) j++; s1[i] = j - i; }
  }
  return { s0, s1 };
}
function tableHtml(T, fmtVal) {
  const { s0, s1 } = spans(T.rows);
  // 묶음 머리글 경계(값 열 번호) — 그 열 왼쪽에 굵은 세로선
  const gs = new Set(); if (T.groups) { let j = 0; for (const [, n] of T.groups) { gs.add(j); j += n; } }
  const gc = j => gs.has(j) ? ' gs' : '';
  const body = T.rows.map((r, i) => {
    let lab;
    if (r.t === 'row') lab = (s0[i] ? `<td class="mg" rowspan="${s0[i]}">${esc(r.lab[0])}</td>` : '') + (s1[i] ? `<td class="mg" rowspan="${s1[i]}">${esc(r.lab[1])}</td>` : '') + `<td>${esc(r.lab[2])}</td>`;
    else lab = `<td colspan="3">${esc(r.lab[0])}</td>`;
    const rk = T.ck ? `${T.ck}|${r.lab.join('/')}|` : '';
    return `<tr class="${r.t === 'row' ? '' : r.t}">${lab}${r.vals.map((v, j) => `<td class="${(v == null || v === 0) ? 'z' : ''}${gc(j)}"${rk ? ` data-ck="${esc(rk + T.head[3 + j])}"` : ''}>${fmtVal(v, j)}</td>`).join('')}</tr>`;
  }).join('');
  // 묶음 머리글(주차별 송출수 · 소재 길이 · 주말 여부 · CM 위치별 비중)이 있으면 두 줄 머리글 · eq = 값 열 너비를 모두 같게
  const nv = T.head.length - 3, ew = T.eq === true || T.eq === 1 ? 96 : T.eq;
  const hc = (h, j) => `${esc(h)}${T.headSub && T.headSub[j] ? `<span class="rg">${esc(T.headSub[j])}</span>` : ''}`;
  const LW = T.eq ? [64, 100, 116] : null;
  const colg = T.eq ? `<colgroup>${LW.map(w => `<col style="width:${w}px">`).join('')}${T.head.slice(3).map(() => `<col style="width:${ew}px">`).join('')}</colgroup>` : '';
  const head = T.groups
    ? `<tr>${T.head.slice(0, 3).map(h => `<th rowspan="2">${esc(h)}</th>`).join('')}${(() => { let j = 0; return T.groups.map(([g, n]) => { const h = `<th class="grph${gc(j)}" colspan="${n}">${esc(g)}</th>`; j += n; return h; }).join(''); })()}</tr><tr>${T.head.slice(3).map((h, j) => `<th class="${gc(j).trim()}">${hc(h, j)}</th>`).join('')}</tr>`
    : `<tr>${T.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>`;
  return `<div class="tw free"><table class="t ctr${T.eq ? ' eqw' : ''}${T.groups ? ' grp' : ''}"${T.eq ? ` style="width:${LW[0] + LW[1] + LW[2] + nv * ew}px"` : ''}>${colg}<thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}
function tableSheet(name, T, opts = {}) {
  const H = T.groups ? 2 : 1;
  const aoa = []; const merges = [];
  if (T.groups) {
    const g = T.head.slice(0, 3); for (const [lab, n] of T.groups) { g.push(lab); for (let k = 1; k < n; k++) g.push(''); }
    aoa.push(g); aoa.push(['', '', ''].concat(T.head.slice(3).map((h, j) => T.headSub && T.headSub[j] ? `${h} (${T.headSub[j]})` : h)));
    for (let c = 0; c < 3; c++) merges.push({ s: { r: 0, c }, e: { r: 1, c } });
    let c0 = 3; for (const [, n] of T.groups) { if (n > 1) merges.push({ s: { r: 0, c: c0 }, e: { r: 0, c: c0 + n - 1 } }); c0 += n; }
  } else aoa.push(T.head);
  const { s0, s1 } = spans(T.rows);
  T.rows.forEach((r, i) => {
    aoa.push((r.t === 'row' ? r.lab : [r.lab[0], '', '']).concat(r.vals.map(v => v == null ? '' : v)));
    if (r.t !== 'row') merges.push({ s: { r: i + H, c: 0 }, e: { r: i + H, c: 2 } });
    if (s0[i] > 1) merges.push({ s: { r: i + H, c: 0 }, e: { r: i + H - 1 + s0[i], c: 0 } });
    if (s1[i] > 1) merges.push({ s: { r: i + H, c: 1 }, e: { r: i + H - 1 + s1[i], c: 1 } });
  });
  return Object.assign({ name, aoa, merges, headerRows: H, styler: tableStyler(T, H) }, opts);
}
function tableStyler(T, H = 1) {
  return (r, c) => {
    if (r < H) return null;
    const row = T.rows[r - H]; if (!row) return null;
    const al = { horizontal: 'center', vertical: 'center' };
    if (row.t === 'sub') return xsMerge(XS.total, { alignment: al });
    if (row.t === 'tot') return xsMerge(XS.total, { fill: { fgColor: { rgb: 'ECECEC' } }, font: { bold: true, sz: 10, color: { rgb: '3F3F3F' } }, alignment: al });
    return xsMerge(XS.cell, { alignment: al });
  };
}
function moneyTxt(v) { return v == null ? '-' : fmt.won(v); }

// ---------- 운영 요약 ----------
// 15차: 품목 카테고리(정수기·매트리스…)끼리 모아 A열 병합 · 품목 요약 줄은 B~C열 병합(방송사 칸 비움) · 합계는 A~C열
function opsOrdered() {
  const cats = []; for (const o of M.ops) if (!cats.includes(o.cat)) cats.push(o.cat);
  return cats.flatMap(c => M.ops.filter(o => o.cat === c));
}
function opsTable() {
  const head = ['품목 카테고리', '품목', '방송사', '예산(억원)', '횟수', 'GRP', 'eq.GRP', 'R1+(%)', 'R3+(%)', '주요 프로그램'];
  const rows = []; const ops = opsOrdered();
  ops.forEach((o, k) => {
    const first = k === 0 || ops[k - 1].cat !== o.cat;
    const catSpan = first ? ops.filter(x => x.cat === o.cat).reduce((a, x) => a + x.rows.length + 1, 0) : 0;
    o.rows.forEach((r, i) => rows.push({ t: 'row', item: o.item, group: r.group, manual: r.manual, src: r, span: i === 0 ? o.rows.length : 0, catSpan: i === 0 ? catSpan : 0, vals: [o.cat, o.full, r.group, r.budget / 1e8, r.cnt, r.grp, r.eq, r.r1, r.r3, r.progs] }));
    rows.push({ t: 'sub', item: o.item, src: o.total, vals: [o.cat, o.full + ' 요약', '', o.total.budget / 1e8, o.total.cnt, o.total.grp, o.total.eq, o.total.r1, o.total.r3, ''] });
  });
  const T = { budget: sum(M.ops, o => o.total.budget), cnt: sum(M.ops, o => o.total.cnt), grp: sum(M.ops, o => o.total.grp), eq: sum(M.ops, o => o.total.eq) };
  rows.push({ t: 'tot', vals: ['합계', '', '', T.budget / 1e8, T.cnt, T.grp, T.eq, null, null, ''] });
  return { head, rows };
}
function opsHtml() {
  const T = opsTable();
  return `<div class="tw free"><table class="t ops ctr"><thead><tr>${T.head.map((h, i) => `<th${i === 9 ? ' class="pgh"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>
  ${T.rows.map(r => `<tr class="${r.t === 'row' ? '' : r.t}">${r.vals.map((v, j) => {
    if (j < 3) {
      if (r.t === 'tot') return j === 0 ? `<td class="sumname" colspan="3">${esc(v)}</td>` : '';
      if (r.t === 'sub') return j === 1 ? `<td class="sumname" colspan="2">${esc(v)}</td>` : '';   // A열은 카테고리 병합 칸이 덮음
      if (j === 0) return r.catSpan ? `<td class="mg cat" rowspan="${r.catSpan}">${esc(v)}</td>` : '';
      if (j === 1) return r.span ? `<td class="mg" rowspan="${r.span}"><span class="sw" style="background:${itemColor(r.item)};margin-right:6px"></span>${esc(v)}</td>` : '';
      return `<td>${esc(v)}</td>`;
    }
    if (j === 9) {
      // 자동 값은 칸 너비에 맞춰 나중에 채움(fitProgs) — 단가 낮은 프로그램부터 빼고 끝에 ' 등'
      const auto = r.t === 'row' && !r.manual && r.src && r.src.autoList && r.src.autoList.length ? ` data-list="${esc(JSON.stringify(r.src.autoList))}"` : '';
      const txt = auto ? '' : esc(v);
      return r.t === 'row' && !readOnly() ? `<td class="wrap prog${r.manual ? ' manual' : ''}" contenteditable="plaintext-only" spellcheck="false" data-k="${esc(r.item + '|' + r.group)}"${auto} title="처음엔 이 품목·방송사의 본방 중CM 프로그램(3개 이하면 본방 전후CM도 단가 높은 순)이 칸 너비만큼 들어가요. 직접 고치면 그 글이 우선하고, 비우면 다시 자동으로 돌아가요.">${txt}</td>` : `<td class="wrap prog"${auto}>${txt}</td>`;
    }
    const ck = ` data-ck="${esc(`ops|${r.item || ''}|${r.t === 'row' ? r.group : r.t}|${j}`)}"`;
    if (j === 3) return `<td${ck}>${v ? fmt.dec(v, 2) : '-'}</td>`;
    if (j === 4) return `<td${ck}>${fmt.int(v)}</td>`;
    if ((j === 7 || j === 8) && r.src && !readOnly()) {
      // R1+·R3+ : 누르면 직접 입력 (누적리치와 다른 값을 써야 할 때) · 비우면 누적리치 값으로
      const x = r.src, f = j === 7 ? 'r1' : 'r3', man = x[f + 'm'], auto = x[f + 'a'];
      const tip = man ? `직접 입력한 값이에요 (누적리치 값 ${auto == null ? '없음' : fmt.dec(auto, 1)}). 비우면 누적리치 값으로 돌아가요.` : '누르면 직접 고칠 수 있어요. 비우면 누적리치 값으로 돌아가요.';
      return `<td${ck} class="rv${man ? ' manual' : ''}" contenteditable="plaintext-only" spellcheck="false" data-rk="${esc(x.rk)}" data-rf="${f}" title="${esc(tip)}">${v == null ? '' : fmt.dec(v, 1)}</td>`;
    }
    return `<td${ck}>${v == null ? '<span class="muted">-</span>' : fmt.dec(v, 1)}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table></div>`;
}
// 품목 요약 R1·R3에 쓰는 누적리치 곡선(엑셀 '수동 입력: 지상파케이블 or 케이블') — 15차: 표에서 빼고 이 창에서 고름
function opsCurveDialog() {
  const list = opsOrdered();
  App.modal(`<div class="hd"><h3>품목 요약 리치 곡선</h3><div class="small muted">운영 요약의 품목 요약 줄 R1+·R3+를 어느 누적리치 곡선에서 찾을지 골라요. 처음엔 지상파 송출이 있으면 '지상파케이블', 없으면 '케이블'.</div></div>
    <div class="bd"><table class="bulkt"><thead><tr><th class="l">품목</th><th class="l">자동</th><th class="l">쓸 곡선</th></tr></thead><tbody>
    ${list.map(o => `<tr><td class="l"><span class="sw" style="background:${itemColor(o.item)};margin-right:6px"></span>${esc(o.item)}</td><td class="l muted">${esc(o.total.autoCurve)}</td><td class="l${o.total.curveManual ? ' manual' : ''}"><select data-curve="${esc(o.item)}" data-auto="${esc(o.total.autoCurve)}">${['지상파케이블', '케이블'].map(c => `<option value="${c}"${c === o.total.group ? ' selected' : ''}>${c}${c === o.total.autoCurve ? ' (자동)' : ''}</option>`).join('')}</select></td></tr>`).join('')}
    </tbody></table></div><div class="ft"><button class="btn pri" data-x>닫기</button></div>`, box => {
    box.querySelectorAll('select[data-curve]').forEach(sel => sel.addEventListener('change', () => {
      const k = sel.dataset.curve, v = sel.value.replace(/\s*\(자동\)$/, ''); WS.opsCurve = WS.opsCurve || {};
      if (v === sel.dataset.auto) delete WS.opsCurve[k]; else WS.opsCurve[k] = v;
      sel.closest('td').classList.toggle('manual', v !== sel.dataset.auto);
      App.changed('ops'); App.toast(`${esc(k)} 요약 리치를 ${esc(v)} 곡선에서 찾아요${v === sel.dataset.auto ? ' (자동)' : ''}`);
    }));
  });
}
function opsSheet() {
  const T = opsTable();
  const aoa = [T.head].concat(T.rows.map(r => r.vals.map(v => v == null ? '' : v)));
  const merges = [];
  T.rows.forEach((r, i) => {
    const R0 = i + 1;
    if (r.catSpan > 1) merges.push({ s: { r: R0, c: 0 }, e: { r: R0 + r.catSpan - 1, c: 0 } });
    if (r.span > 1) merges.push({ s: { r: R0, c: 1 }, e: { r: R0 + r.span - 1, c: 1 } });
    if (r.t === 'sub') merges.push({ s: { r: R0, c: 1 }, e: { r: R0, c: 2 } });
    if (r.t === 'tot') merges.push({ s: { r: R0, c: 0 }, e: { r: R0, c: 2 } });
  });
  return { name: '운영 요약', aoa, merges, widths: [12, 18, 14, 10, 8, 9, 9, 9, 9, 70],
    numFmt: (r, c) => c === 3 ? '0.00' : (c >= 5 && c <= 8) ? '0.0' : '#,##0',
    styler: (r, c) => { if (r === 0) return null; const row = T.rows[r - 1]; if (!row) return null;
      if (c === 0 && row.t !== 'tot') return xsMerge(XS.cell, { alignment: { vertical: 'center' } });
      if (row.t === 'sub') return XS.total; if (row.t === 'tot') return xsMerge(XS.total, { fill: { fgColor: { rgb: 'ECECEC' } } });
      if (c === 1 && row.item) return xsMerge(XS.cell, { fill: { fgColor: { rgb: hexRgb(itemLight(row.item)) } }, alignment: { vertical: 'center' } });
      return c === 9 ? xsMerge(XS.cell, { alignment: { wrapText: true, vertical: 'center', horizontal: 'left' } }) : null; } };
}
// ---------- 요약 (통합 요약 + 운영 요약) ----------
const ANIM = { seen: false, kpi: null };
function renderSummary(root) {
  if (CHARTS._daily) { if (CHARTS._daily.stop) CHARTS._daily.stop(); if (CHARTS._daily.destroy) CHARTS._daily.destroy(); }
  killCharts('item', '_daily');
  if (!M.spots.length && !M.cells.length) { root.innerHTML = onboardingHtml(); bindOnboarding(root); return; }
  const cells = mediaCells();
  const A = aggCells(cells), all = aggCells(M.cells);
  const items = itemsIn(cells);
  const g = aggCells(M.cells.filter(c => c.media === '지상파')), cb = aggCells(M.cells.filter(c => c.media === '케이블'));
  if (UI.donutItem !== 'all' && !items.includes(UI.donutItem)) UI.donutItem = 'all';
  const mediaSub = UI.media === 'all' ? `지상파 ${fmt.eok(g.budget)} · 케이블 ${fmt.eok(cb.budget)}` : `전체의 ${fmt.pct(all.budget ? A.budget / all.budget : 0)}`;
  const cntSub = UI.media === 'all' ? `지상파 ${fmt.int(g.cnt)} · 케이블 ${fmt.int(cb.cnt)}` : `전체의 ${fmt.pct(all.cnt ? A.cnt / all.cnt : 0)}`;
  const meta = WS.reachMeta || {};
  if (UI.media !== 'all') UI.dnMedia = 'all';
  const dCells = UI.dnMedia === 'all' ? cells : cells.filter(c => c.media === UI.dnMedia);
  const dItems = itemsIn(dCells);
  if (UI.donutItem !== 'all' && !dItems.includes(UI.donutItem)) UI.donutItem = 'all';
  if (!items.includes(UI.tcItem)) UI.tcItem = 'all';
  root.innerHTML = `
  <div class="viewhead"><div><h2>${esc(advName())} ${M.ym.m}월 TV큐시트 요약</h2><div class="sub">${ymLabel()} · 예산·보너스, 송출, 운영 요약을 한 화면에 · 금액은 원(VAT 별도)</div></div><div class="spacer"></div>
    ${segHtml('media', [['all', '전체'], ['지상파', '지상파'], ['케이블', '케이블']], UI.media)} ${xlBtn('sumall', '요약 전체 엑셀')}</div>
  <div class="kpis k5">
    <div class="kpi"><div class="l">예산</div><div class="v tnum" data-ck="kpi|${UI.media}|budget"><span data-kv="budget">${fmt.eok(A.budget)}</span></div><div class="s">${mediaSub}</div></div>
    <div class="kpi"><div class="l">보너스</div><div class="v tnum" data-ck="kpi|${UI.media}|bonus"><span data-kv="bonus">${fmt.eok(A.bonus)}</span></div><div class="s">보너스율 ${fmt.pct(A.rate)}</div></div>
    <div class="kpi hl"><div class="l">전체 밸류</div><div class="v tnum" data-ck="kpi|${UI.media}|value"><span data-kv="value">${fmt.eok(A.value)}</span></div><div class="s">예산 + 보너스${A.budget ? ` · 예산의 ${fmt.dec(A.value / A.budget, 2)}배` : ''}</div></div>
    <div class="kpi"><div class="l">송출</div><div class="v tnum" data-ck="kpi|${UI.media}|cnt"><span data-kv="cnt">${fmt.int(A.cnt)}회</span></div><div class="s">${cntSub}</div></div>
    <div class="kpi"><div class="l">eq.GRP (15초 환산)</div><div class="v tnum" data-ck="kpi|${UI.media}|eq"><span data-kv="eq">${fmt.int(A.eq)}</span></div><div class="s">GRP ${fmt.int(A.grp)} · 목표 CPRP 기준 추정</div></div>
  </div>
  <section class="card" style="margin-bottom:16px"><div class="hd"><h3>운영 요약</h3><span class="sub">주요 프로그램 = 그 방송사의 본방 중CM 프로그램${readOnly() ? '' : ' · 칸을 눌러 직접 고칠 수 있어요'}</span><div class="spacer"></div>${readOnly() || !M.ops.length ? '' : '<button class="btn sm ghost" data-curvecfg title="품목 요약 R1+·R3+를 찾을 누적리치 곡선">요약 리치 곡선</button>'} ${xlBtn('ops', '운영 요약 엑셀')}</div><div class="bd" style="padding:0">${opsHtml()}</div>
    <div class="foot" style="padding:0 16px 14px">GRP = 예산 ÷ 목표 CPRP(15초 기준) × 초수 환산 · eq.GRP = 15초 환산 GRP · 리치 기준 ${esc(meta.target || '아리아나 누적리치')} ${meta.period ? '(' + esc(meta.period) + ')' : ''}${Object.keys(M.reach || {}).length ? '' : ' — <b>누적리치가 없어 R1·R3를 계산하지 못했어요</b>'}</div></section>
  <div class="grid2">
    <section class="card ibcard"><div class="hd"><h3>품목별 예산·보너스</h3><span class="sub">진한 막대 = 예산 · 옅은 막대 = 보너스 · 품목 아래 = 예산 비중</span></div><div class="bd">
      <div class="lg"><span><span class="sw" style="background:#757575"></span>예산</span><span><span class="sw" style="background:#757575;opacity:.32"></span>보너스</span><span class="muted">막대 끝 숫자 = 예산+보너스 (밸류)</span></div>
      <div id="ibars" role="img" aria-label="품목별 예산·보너스"></div></div></section>
    <section class="card"><div class="hd"><h3>방송사별 예산·보너스</h3><span class="sub">도넛 각도 = 예산 비중 · 위로 솟은 반투명 기둥 = 보너스</span><div class="spacer"></div>${UI.media === 'all' ? segHtml('dnmedia', [['all', '전체'], ['지상파', '지상파'], ['케이블', '케이블']], UI.dnMedia) : ''} <label class="tgl" title="도넛 위 보너스 기둥 보이기/숨기기"><input type="checkbox" id="dn-bonus" ${UI.donutBonus === false ? '' : 'checked'}><span class="tk"></span>보너스 금액 표시</label></div><div class="bd">
      ${chipsHtml('data-dn', [['all', '전체 품목']].concat(dItems.map(k => [k, k, itemColor(k)])), UI.donutItem)}
      <div class="donutwrap"><div id="donut"></div><div id="donutlg"></div></div></div></section>
  </div>
  <section class="card" style="margin-bottom:16px"><div class="hd"><h3>예산 및 보너스</h3><span class="sub">원, VAT 별도</span><div class="spacer"></div>
    ${segHtml('metric', [['budget', '예산'], ['bonus', '보너스'], ['value', '예산+보너스'], ['rate', '보너스율']], UI.metric)} ${xlBtn('t1')}</div><div class="bd" id="t1"></div></section>
  <div class="cmrow2">
    <div class="sq4">
      <section class="card sqcard"><div class="hd"><h3>초수별 노출수</h3><div class="spacer"></div>${UI.media === 'all' ? segHtml('mxsec', [['all', '전체'], ['지상파', '지상파'], ['케이블', '케이블']], UI.mxSec) : ''}</div><div class="bd"><div class="sqd" id="sq-sec"></div></div></section>
      <section class="card sqcard"><div class="hd"><h3>요일별 노출수</h3><div class="spacer"></div>${UI.media === 'all' ? segHtml('mxdow', [['all', '전체'], ['지상파', '지상파'], ['케이블', '케이블']], UI.mxDow) : ''}</div><div class="bd"><div class="sqd" id="sq-dow"></div></div></section>
      <section class="card sqcard"><div class="hd"><h3>지상파 중CM 비중</h3><span class="sub" id="sq-g-n"></span></div><div class="bd"><div class="sqd" id="sq-cmg"></div></div></section>
      <section class="card sqcard"><div class="hd"><h3>케이블 중CM 비중</h3><span class="sub" id="sq-c-n"></span></div><div class="bd"><div class="sqd" id="sq-cmc"></div></div></section>
    </div>
    <section class="card cmcard"><div class="hd"><h3>중CM · PIB 비중</h3><span class="sub">송출 횟수 기준 · PP별 / 채널별</span></div><div class="bd">
      <div class="cmctl"><div class="cmlg"><span><span class="sw" style="background:${CMC.mid}"></span>중CM</span><span><span class="sw" style="background:${CMC.pib}"></span>PIB</span><span><span class="sw" style="background:${CMC.fb}"></span>전후CM 등</span></div><div class="spacer"></div>
        ${segHtml('cmunit', [['pp', 'PP별'], ['ch', '채널별']], UI.cmUnit)} ${segHtml('cmsort', [['mid', '중CM 순'], ['prem', '중CM+PIB 순'], ['n', '송출 순']], UI.cmSort)}</div>
      <div id="cmshare"></div></div></section>
  </div>
  <section class="card" style="margin-bottom:16px"><div class="hd"><h3>송출 횟수</h3><span class="sub">주차별 송출수 · 소재 길이 · 주말 여부 · CM 위치별 비중</span><div class="spacer"></div>${xlBtn('tc')}</div><div class="bd">
    ${chipsHtml('data-tc', [['all', '전체 품목']].concat(items.map(k => [k, k, itemColor(k)])), UI.tcItem)}<div id="tc" style="margin-top:10px"></div></div></section>
  <section class="card" style="margin-bottom:16px"><div class="hd"><h3>주차별 송출 수</h3><span class="sub" id="dailysub"></span><div class="spacer"></div><span class="dcount tnum" id="dcount"></span>
    ${chipsHtml('data-df', [['', '전체 품목']].concat(items.map(k => [k, `${k} ${fmt.int(sum(cells.filter(c => c.item === k), c => c.cnt))}`, itemColor(k)])), UI.dailyFocus || '')}</div><div class="bd"><div id="daily"></div></div></section>
  <section class="card"><div class="hd"><h3>당월 소재</h3><span class="sub">품목별 운영 소재 · 금액/횟수 비중 · 지상파 실제 = 지상파 송출 중 그 소재로 나간 비율</span><div class="spacer"></div>${xlBtn('cre', '당월 소재 엑셀')}</div><div class="bd" style="padding:0">${creSummaryHtml()}</div></section>`;
  const rerender = () => { const y = window.scrollY; renderSummary(root); window.scrollTo(0, y); };
  bindSeg(root, 'media', v => { UI.media = v; rerender(); });
  bindSeg(root, 'metric', v => { UI.metric = v; root.querySelector('#t1').innerHTML = tableHtml(table1(cells, UI.metric), v2 => UI.metric === 'rate' ? fmt.pct(v2) : moneyTxt(v2)); root.querySelectorAll('[data-seg="metric"] button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); });
  bindSeg(root, 'dnmedia', v => { UI.dnMedia = v; rerender(); });
  root.querySelector('#dn-bonus').onchange = e => { UI.donutBonus = e.target.checked; drawDonut(false); };
  bindChips(root, '[data-dn]', v => { UI.donutItem = v; root.querySelectorAll('[data-dn]').forEach(b => b.classList.toggle('on', b.dataset.v === v)); drawDonut(false); });
  bindChips(root, '[data-df]', v => { UI.dailyFocus = v || null; root.querySelectorAll('[data-df]').forEach(b => b.classList.toggle('on', b.dataset.v === v)); if (CHARTS._daily) CHARTS._daily.setFocus(UI.dailyFocus); });
  const drawTc = v => { const T = tableCnt(cells, v); root.querySelector('#tc').innerHTML = tableHtml(T, (x, j) => T.pctCols.includes(j) ? fmt.pct(x) : (x ? fmt.int(x) : '-')); };
  bindChips(root, '[data-tc]', v => { UI.tcItem = v; root.querySelectorAll('[data-tc]').forEach(b => b.classList.toggle('on', b.dataset.v === v)); drawTc(v); });
  root.querySelector('#t1').innerHTML = tableHtml(table1(cells, UI.metric), v => UI.metric === 'rate' ? fmt.pct(v) : moneyTxt(v));
  drawTc(UI.tcItem);
  root.querySelectorAll('[data-xl]').forEach(b => b.onclick = () => exportSummary(b.dataset.xl, cells, items));
  bindOpsEdit(root);
  // 처음 열 때만 '등장' 애니메이션, 그 뒤로는 이전 값에서 새 값으로 바뀌는 애니메이션
  const intro = !ANIM.seen; ANIM.seen = true;
  // KPI 숫자 굴리기
  const kv = { budget: A.budget, bonus: A.bonus, value: A.value, cnt: A.cnt, eq: A.eq }, kf = { budget: v => fmt.eok(v), bonus: v => fmt.eok(v), value: v => fmt.eok(v), cnt: v => fmt.int(v) + '회', eq: v => fmt.int(v) };
  const kFrom = intro || !ANIM.kpi ? { budget: 0, bonus: 0, value: 0, cnt: 0, eq: 0 } : ANIM.kpi;
  root.querySelectorAll('[data-kv]').forEach(el => { const k = el.dataset.kv; if (kFrom[k] !== kv[k]) rollText(el, kFrom[k], kv[k], kf[k], intro ? 750 : 500); });
  ANIM.kpi = kv;
  // 품목별 예산·보너스 막대 (예산 → 보너스 2단계)
  itemBars(root.querySelector('#ibars'), items.map(k => { const cc = cells.filter(c => c.item === k); return { k, color: itemColor(k), budget: sum(cc, c => c.budget), bonus: sum(cc, c => c.bonus) }; }), { intro });
  // 3D 도넛 (펼친 뒤 기둥 · 품목 바꾸면 부드럽게)
  function drawDonut(first) {
    // 조각 = 매체(지상파 → 케이블) × 방송사 묶음 · 매체 사이는 살짝 띄움 · 조각 목록은 품목을 바꿔도 같게(부드럽게 바뀌도록)
    const cs = UI.donutItem === 'all' ? dCells : dCells.filter(c => c.item === UI.donutItem);
    const base = UI.donutItem === 'all' ? DN_BASE : itemColor(UI.donutItem);
    const steps = [0, 0.18, 0.34, 0.48, 0.6, 0.7, 0.78];
    const gl = SUM_GROUPS.concat([...new Set(dCells.map(c => c.group))].filter(g => g && !SUM_GROUPS.includes(g)));
    const sl = [];
    for (const md of ['지상파', '케이블']) for (const gn of gl) {
      if (!dCells.some(c => c.media === md && c.group === gn)) continue;
      const x = cs.filter(c => c.media === md && c.group === gn); const b = sum(x, c => c.budget), bo = sum(x, c => c.bonus);
      const gi = SUM_GROUPS.indexOf(gn); sl.push({ label: gn, grp: md, value: b, extra: bo, rate: b ? bo / b : 0, color: gi === 0 ? base : tint(base, steps[gi < 0 ? 6 : gi] || 0.8) });
    }
    const shown = sl.filter(x => x.value > 0);
    const B = sum(sl, x => x.value), X = sum(sl, x => x.extra);
    donut3D(root.querySelector('#donut'), sl, { bonus: UI.donutBonus !== false, height: 330, intro: first && intro });
    const ck = (md, gn, j) => `data-ck="dn|${UI.media}|${UI.dnMedia}|${UI.donutItem}|${md}|${gn}|${j}"`;
    const meds = ['지상파', '케이블'].filter(md => shown.some(x => x.grp === md));
    const body = meds.map(md => {
      const rs = shown.filter(x => x.grp === md); const mb = sum(rs, x => x.value), mx2 = sum(rs, x => x.extra);
      return rs.map((x, i) => `<tr>${i ? '' : `<td class="mg" rowspan="${rs.length + 1}">${md}</td>`}<td>${esc(x.label)}</td><td ${ck(md, x.label, 0)}>${fmt.eok(x.value, 2)}</td><td ${ck(md, x.label, 1)}>${fmt.eok(x.extra, 2)}</td><td ${ck(md, x.label, 2)}>${fmt.pct(x.rate)}</td></tr>`).join('')
        + `<tr class="sub"><td class="l">소계</td><td ${ck(md, '소계', 0)}>${fmt.eok(mb, 2)}</td><td ${ck(md, '소계', 1)}>${fmt.eok(mx2, 2)}</td><td ${ck(md, '소계', 2)}>${fmt.pct(mb ? mx2 / mb : null)}</td></tr>`;
    }).join('');
    root.querySelector('#donutlg').innerHTML = `<table class="t sm dlg"><thead><tr><th>매체</th><th class="l">방송사</th><th>예산</th><th>보너스</th><th>보너스율</th></tr></thead><tbody>${body}<tr class="tot"><td colspan="2">합계</td><td ${ck('', '계', 0)}>${fmt.eok(B, 2)}</td><td ${ck('', '계', 1)}>${fmt.eok(X, 2)}</td><td ${ck('', '계', 2)}>${fmt.pct(B ? X / B : null)}</td></tr></tbody></table>`;
  }
  drawDonut(true);
  // 일별 송출 (일별 누적 막대 + 주차별 · ▶ 한 달 재생)
  const ds = mediaSpots();
  const dcount = root.querySelector('#dcount');
  CHARTS._daily = dailyStack(root.querySelector('#daily'), ds, { days: daysInMonth(M.ym.y, M.ym.m), ym: M.ym, weeks: M.weeks, itemOrder: M.activeItems, focus: UI.dailyFocus, intro,
    onTick: txt => { dcount.textContent = txt; } });
  root.querySelector('#dailysub').textContent = '왼쪽 주차를 누르면 그 주 강조 · 오른쪽 = 일별';
  // 중CM 비중 (PP별 미니 도넛)
  const drawCm = () => { const box = root.querySelector('#cmshare'); const o = cmStackHtml(cells, UI.cmUnit, UI.cmSort); box.innerHTML = o.html; cmStackBind(box, o.rows, UI.cmUnit); };
  drawCm();
  bindSeg(root, 'cmunit', v => { UI.cmUnit = v; root.querySelectorAll('[data-seg="cmunit"] button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); drawCm(); });
  bindSeg(root, 'cmsort', v => { UI.cmSort = v; root.querySelectorAll('[data-seg="cmsort"] button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); drawCm(); });
  // 15차: 초수별 · 요일별 노출수 · 지상파/케이블 중CM 비중 = 정사각형 4칸 3D 도넛 (펼치는 애니메이션, 표 없음)
  if (UI.media !== 'all') { UI.mxSec = 'all'; UI.mxDow = 'all'; }
  const sub = m => m === 'all' ? cells : cells.filter(c => c.media === m);
  const drawSec = first => { const a = aggCells(sub(UI.mxSec || 'all')); const secs = Object.keys(a.sec).map(Number).filter(x => x > 0 && a.sec[x] > 0).sort((p, q) => p - q);
    sqDonut(root.querySelector('#sq-sec'), secs.map(x => ({ label: `${x}초`, value: a.sec[x], color: secColor(x) })), { intro: first && intro, unit: '송출' }); };
  const drawDow = first => { const a = aggCells(sub(UI.mxDow || 'all'));
    sqDonut(root.querySelector('#sq-dow'), [{ label: '주중', value: a.wd, color: MIXC.wd }, { label: '주말', value: a.we, color: MIXC.we }], { intro: first && intro, unit: '송출' }); };
  const drawCmD = (md, el, nEl) => { const a = aggCells(cells.filter(c => c.media === md)); const n = a.cnt || 0, mid = a.cmc.중CM || 0, pib = a.cmc.PIB || 0;
    root.querySelector(nEl).textContent = n ? `${fmt.int(n)}회` : '';
    sqDonut(root.querySelector(el), [{ label: '중CM', value: mid, color: CMC.mid }, { label: 'PIB', value: pib, color: CMC.pib }, { label: '전후CM 등', value: Math.max(0, n - mid - pib), color: '#cfcfd2' }], { intro, unit: '송출', center: () => [n ? fmt.pct((mid + pib) / n) : '-', '중CM+PIB'] }); };
  drawSec(true); drawDow(true); drawCmD('지상파', '#sq-cmg', '#sq-g-n'); drawCmD('케이블', '#sq-cmc', '#sq-c-n');
  bindSeg(root, 'mxsec', v => { UI.mxSec = v; root.querySelectorAll('[data-seg="mxsec"] button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); drawSec(false); });
  bindSeg(root, 'mxdow', v => { UI.mxDow = v; root.querySelectorAll('[data-seg="mxdow"] button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); drawDow(false); });
}
// 정사각형 칸 3D 도넛 — 방송사별 예산·보너스와 같은 그림(기둥 없음) · 바깥 레이블 = 이름 %·횟수 · 가운데 = 가장 큰 조각 비중
function sqDonut(host, parts, o) {
  const H = Math.max(200, host.clientHeight || 300);
  const tot = sum(parts, p => p.value);
  const top = parts.slice().sort((a, b) => b.value - a.value)[0];
  donut3D(host, parts.map(p => ({ label: p.label, value: p.value, extra: 0, rate: 0, color: p.color })), { bonus: false, own: true, height: H, intro: o.intro, rScale: 0.3, rMax: 120, hole: 0.5, h0: 13, cyR: 0.58,
    valFmt: v => `${fmt.int(v)}회`,
    center: o.center || (() => [tot && top ? fmt.pct(top.value / tot) : '-', top ? top.label : '']),
    tip: (s, t) => `<b>${esc(s.label)}</b><div>${fmt.int(s.value)}회 <span class="m">(${fmt.pct(t ? s.value / t : 0)})</span></div>` });
}
// 주요 프로그램 자동 값: 칸 너비(한 줄)에 맞게 단가 높은 순으로 넣고 끝에 ' 등'
function fitProgs(root) {
  const tds = [...root.querySelectorAll('table.ops td[data-list]')]; if (!tds.length) return;
  const cv = fitProgs.cv || (fitProgs.cv = document.createElement('canvas')); const ctx = cv.getContext('2d');
  const cs = getComputedStyle(tds[0]); ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const w = tds[0].clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 6;
  for (const td of tds) {
    let list = []; try { list = JSON.parse(td.dataset.list); } catch (e) { }
    let t = list[0] || '';
    for (let i = 1; i < list.length; i++) { const x = t + ', ' + list[i]; if (ctx.measureText(x + ' 등').width > w) break; t = x; }
    t = t ? t + ' 등' : ''; td.textContent = t; td.dataset.auto = t;
  }
}
function bindOpsEdit(root) {
  fitProgs(root);
  const cb = root.querySelector('[data-curvecfg]'); if (cb) cb.onclick = () => opsCurveDialog();
  root.querySelectorAll('td.rv[data-rk]').forEach(td => {
    td.addEventListener('focus', () => { const r = document.createRange(); r.selectNodeContents(td); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
    td.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); td.blur(); } if (e.key === 'Escape') { td.dataset.esc = '1'; td.blur(); } });
    td.addEventListener('blur', () => {
      const k = td.dataset.rk, f = td.dataset.rf;
      if (td.dataset.esc) { delete td.dataset.esc; App.rerender(); return; }
      const t = td.innerText.replace(/[%\s]/g, '');
      const ov = WS.opsReach = WS.opsReach || {}; const cur = ov[k] || {};
      const before = cur[f];
      let v = null;
      if (t !== '') { v = num(t); if (v == null || v < 0 || v > 100) { App.toast('R1+·R3+는 0~100 사이 숫자로 써 주세요 (%)'); App.rerender(); return; } v = Math.round(v * 10) / 10; }
      if (v == null) delete cur[f]; else cur[f] = v;
      if (Object.keys(cur).length) ov[k] = cur; else delete ov[k];
      if (before !== cur[f]) { App.changed('ops'); if (v != null) App.toast(`${esc(k.replace('|', ' · '))} ${f === 'r1' ? 'R1+' : 'R3+'}를 ${fmt.dec(v, 1)}%로 직접 넣었어요 · 비우면 누적리치 값으로 돌아가요`, 4000); }
      else App.rerender();
    });
  });
  root.querySelectorAll('td.prog[data-k]').forEach(td => {
    td.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); td.blur(); } });
    td.addEventListener('blur', () => {
      const k = td.dataset.k, t = td.innerText.replace(/\s+/g, ' ').trim();
      WS.opsNotes = WS.opsNotes || {};
      const [item, group] = k.split('|');
      const o = M.ops.find(x => x.item === item); const r = o && o.rows.find(x => x.group === group);
      const auto = td.dataset.auto != null ? td.dataset.auto : r ? r.auto : '';
      const before = WS.opsNotes[k];
      if (!t || t === auto) delete WS.opsNotes[k]; else WS.opsNotes[k] = t;
      if (before !== WS.opsNotes[k]) { td.classList.toggle('manual', !!WS.opsNotes[k]); if (!t) td.textContent = auto; App.changed('ops', true); }
    });
  });
}
// 송출 구성 도넛 (SVG) — 가운데 큰 비중, 오른쪽에 막대 범례
const MIXC = { s15: '#d99a3d', s30: '#13958a', etc: '#cbcbcb', wd: '#7563a8', we: '#d97f74' };   // 색약 구분 검사 통과 (기타는 회색)
const SECC = { 10: '#8a9a3a', 15: '#d99a3d', 20: '#4f7fbf', 30: '#13958a', 40: '#a0702a', 45: '#c25b8f', 60: '#6d6d6d' };   // 초수 색은 초수마다 고정 (순서가 바뀌어도 같은 색)
function secColor(x) { return SECC[x] || '#a3a3a3'; }
function mixDonut(title, parts, size = 132, center) {
  const tot = sum(parts, p => p[1]) || 1, R = 46, r = 30, C = 2 * Math.PI;
  let a0 = -Math.PI / 2; const arcs = [];
  const live = parts.filter(p => p[1]);
  for (const [lab, v, col] of parts) {
    if (!v) continue;
    const a1 = a0 + C * v / tot, gap = live.length > 1 ? 0.012 : 0;
    const P = (a, rr) => [60 + rr * Math.cos(a), 60 + rr * Math.sin(a)];
    const s0 = a0 + gap, s1 = a1 - gap, big = s1 - s0 > Math.PI ? 1 : 0;
    const [x0, y0] = P(s0, R), [x1, y1] = P(s1, R), [x2, y2] = P(s1, r), [x3, y3] = P(s0, r);
    const d = live.length === 1 ? `M60 ${60 - R}A${R} ${R} 0 1 1 59.99 ${60 - R}ZM60 ${60 - r}A${r} ${r} 0 1 0 60.01 ${60 - r}Z` : `M${x0} ${y0}A${R} ${R} 0 ${big} 1 ${x1} ${y1}L${x2} ${y2}A${r} ${r} 0 ${big} 0 ${x3} ${y3}Z`;
    arcs.push(`<path d="${d}" fill="${col}" data-tip="${esc(`${title} · ${lab} ${fmt.int(v)}회 (${fmt.pct(v / tot)})`)}"></path>`);
    a0 = a1;
  }
  const top = parts.slice().sort((x, y) => y[1] - x[1])[0] || ['', 0];
  const cv = center ? center.v : fmt.pct(top[1] / tot), cl = center ? center.l : top[0];
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="${esc(title)}">${arcs.join('') || '<circle cx="60" cy="60" r="38" fill="none" stroke="#e8e8e8" stroke-width="16"></circle>'}<text x="60" y="58" text-anchor="middle" class="v">${cv}</text><text x="60" y="74" text-anchor="middle" class="l">${esc(cl)}</text></svg>`;
}
// 중CM · PIB 매체 합계: 지상파 · 케이블 도넛 두 개를 한 줄에
function cmDonutsHtml(cells) {
  return ['지상파', '케이블'].map(m => {
    const A = aggCells(cells.filter(c => c.media === m)); const n = A.cnt; if (!n) return '';
    const mid = A.cmc.중CM || 0, pib = A.cmc.PIB || 0, fb = n - mid - pib;
    const parts = [['중CM', mid, CMC.mid], ['PIB', pib, CMC.pib], ['전후CM 등', fb, CMC.fb]];
    return `<div class="cmdn"><div class="cmdn-h"><span class="mtag ${m === '지상파' ? 'g' : 'c'}">${m}</span><span class="muted tnum">${fmt.int(n)}회</span></div><div class="mixb"><div class="mdnc">${mixDonut(m + ' 중CM·PIB', parts, 128, { v: fmt.pct((mid + pib) / n), l: '중CM+PIB' })}</div>
      <div class="mixl">${parts.map(([lab, v, col]) => `<div class="mr"><span class="sw" style="background:${col}"></span><span class="ml">${lab}</span><span class="mbar"><i style="width:${(v / n * 100).toFixed(1)}%;background:${col}"></i></span><b class="tnum">${fmt.int(v)}</b><span class="muted tnum">${fmt.pct(v / n)}</span></div>`).join('')}</div></div></div>`;
  }).join('');
}
function mixSection(title, sub, parts) {
  const tot = sum(parts, p => p[1]) || 1;
  return `<div class="mixsec">${sub ? `<div class="mixh"><b>${title}</b><span>${sub}</span></div>` : ''}<div class="mixb"><div class="mdnc">${mixDonut(title, parts, 136)}</div>
    <div class="mixl">${parts.map(([lab, v, col]) => `<div class="mr"><span class="sw" style="background:${col}"></span><span class="ml">${lab}</span><span class="mbar"><i style="width:${(v / tot * 100).toFixed(1)}%;background:${col}"></i></span><b class="tnum">${fmt.int(v)}</b><span class="muted tnum">${fmt.pct(v / tot)}</span></div>`).join('') || '<div class="muted small">송출이 없어요</div>'}</div></div></div>`;
}
function mixDonutBind(root) { root.querySelectorAll('path[data-tip]').forEach(p => { p.addEventListener('mousemove', e => ftip(e, esc(p.dataset.tip))); p.addEventListener('mouseleave', ftipHide); }); }
function exportSummary(which, cells, items) {
  const name = `${advName()}TV_${WS.ym.replace('-', '')}_`;
  const sheetsT1 = () => [['budget', '예산'], ['bonus', '보너스'], ['value', '예산+보너스'], ['rate', '보너스율']].map(([m, t]) => {
    const T = table1(cells, m);
    return tableSheet('예산 및 보너스 ' + t, T, { widths: [12, 14, 14].concat(T.items.map(() => 15), [16]), numFmt: () => m === 'rate' ? '0%' : '#,##0' });
  });
  const sheetsTc = () => ['all'].concat(items).map(k => { const T = tableCnt(cells, k); return tableSheet('송출 횟수 ' + (k === 'all' ? '전체' : k), T, { widths: [12, 14, 14].concat(T.head.slice(3).map(() => 13)), numFmt: (r, c) => T.pctCols.includes(c - 3) ? '0%' : '#,##0' }); });
  const cmSheet = () => { const rows = cmRows(cells, UI.cmUnit).sort((a, b) => (a.media === b.media ? 0 : a.media === '지상파' ? -1 : 1) || b.sm - a.sm);
    return { name: '중CM·PIB 비중', aoa: [['매체', UI.cmUnit === 'ch' ? '채널' : 'PP', '송출', '중CM', 'PIB', '전후CM 등', '중CM 비중', 'PIB 비중', '중CM+PIB 비중']].concat(rows.map(r => [r.media, r.name, r.n, r.mid, r.pib, r.fb, r.sm, r.sp, r.sm + r.sp])),
      widths: [8, 16, 8, 8, 8, 10, 10, 10, 13], numFmt: (r, c) => c >= 6 ? '0%' : '#,##0' }; };
  // 보고용 엑셀 (19-xlreport.js): 눈금선 없음 · A열 여백 · 2행 제목 · 엑셀 차트
  void name; void sheetsT1; void sheetsTc; void cmSheet;
  if (which === 't1') xrDownload([xrOpsSheet('t1')], null, xrName('예산및보너스'));
  if (which === 'tc') xrDownload([xrOpsSheet('tc')], null, xrName('송출횟수'));
  if (which === 'ops') xrDownload([xrOpsSheet('ops')], null, xrName('운영요약'));
  if (which === 'sumall') xrDownload([xrOpsSheet()], null, xrName('요약'));
  if (which === 'cre') xrDownload([xrCreSheet()], null, xrName('소재'));
}

// ---------- 큐시트 공통 (Q-Mate 편성표 디자인: 진한 머리글 · 품목 색 상자 · 본방 강조) ----------
// 상자 안 글자: 고를 수 있음 (품목 · 소재 · 초수 · CM위치 · 날짜)
const CHIP_F = [['item', '품목'], ['cre', '소재'], ['sec', '초수'], ['cm', 'CM위치'], ['day', '날짜']];
// 15차: 주차 칸 한 송출 = 지상파 '[품목] 소재 초수' · 케이블 '[품목] 초수 CM위치' (초수는 숫자만) — 값 항목 고르기는 없앰(고정 양식)
function isLight(hex) { const c = hexToRgb(hex) || [111, 118, 128]; const L = (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; return L > 0.62; }
function spotText(s, mode) {
  const it = `[${s.item || s.itemRaw || '?'}]`;
  if (mode === 'g') return [it, s.cre, s.sec || ''].filter(x => x !== '' && x != null).join(' ');
  const cm = s.cmCls && s.cmCls !== '일반' ? s.cmCls : (s.cmRaw || '');
  return [it, s.sec || '', cm].filter(x => x !== '' && x != null).join(' ');
}
function spotChip(s, mode) {
  const c = itemColor(s.item), b = isLight(c) ? shade(c, -0.32) : c;   // 글자는 늘 흰색 → 밝은 품목 색은 바탕을 조금 진하게
  const day = s.day ? `${M.ym.m}/${s.day}` : '';
  return `<span class="spot ibox" style="--b:${b}" title="${esc(`${s.prog} · ${s.item || s.itemRaw || ''} ${s.cre || ''} ${s.sec || ''}초 · ${s.cmRaw || s.cmCls || ''} · ${day}`)}">${esc(spotText(s, mode))}</span>`;
}
// 프로그램명의 <본방> <생방> <특집> 표시를 색 글자로 (Q-Mate와 같은 색)
const PTAG = { 본방: 'bon', 생방: 'live', 특집: 'sp' };
function progHtml(name) { return esc(name).replace(/&lt;(본방|생방|특집)&gt;|[<＜\[【(（]\s*(본방|생방|특집)\s*[>＞\]】)）]/g, (m, a, b) => `<b class="ptag ${PTAG[a || b]}">&lt;${a || b}&gt;</b>`); }
function chipBar(mode, items) {
  return `<div class="qmbar"><span class="lb">품목 색상</span><span class="qmlegend">${items.map(k => `<span><i style="background:${itemColor(k)}"></i>${esc(k)}</span>`).join('')}</span><span class="lb" style="margin-left:14px">칸 = ${mode === 'g' ? '[품목] 소재 초수' : '[품목] 초수 CM위치'}</span></div>`;
}
function bindChipBar() { }
function groupCue(list, keyFn) {
  const m = new Map();
  for (const s of list) { const k = keyFn(s); if (!m.has(k)) m.set(k, { k, first: s, spots: [] }); m.get(k).spots.push(s); }
  return [...m.values()];
}
const chOrd = n => { const c = M.MS.chByName.get(n); return c ? c.order : 999; };

// ---------- 지상파 큐시트 ----------
function renderCueG(root) {
  const sp = M.spots.filter(s => s.src === '지상파');
  const chs = [...new Set(sp.map(s => s.ch))].sort((a, b) => chOrd(a) - chOrd(b));
  if (UI.gCh !== 'all' && !chs.includes(UI.gCh)) UI.gCh = 'all';
  const W = M.weeks;
  const show = UI.gCh === 'all' ? chs : [UI.gCh];
  let html = `<div class="viewhead"><div><h2>지상파 큐시트</h2><div class="sub">${ymLabel()} · 같은 프로그램·시간·단가는 한 줄로 묶고 주차 칸에 소재와 날짜를 표시 · <b class="cmtag">중CM</b> 줄 강조 (케이블 큐시트의 본방과 같은 표시)</div></div><div class="spacer"></div>${xlBtn('cueg', '지상파 큐시트 엑셀')}</div>
  ${chipsHtml('data-gch', [['all', '전체']].concat(chs.map(c => [c, `${c} ${sp.filter(s => s.ch === c).length}`])), UI.gCh)}
  ${sp.length ? chipBar('g', M.MS.itemOrder.filter(k => sp.some(s => s.item === k))) : ''}`;
  const G = M.gSettle;
  if (G && G.rows.length) html += `<section class="card" style="margin-top:14px"><div class="hd"><h3>지상파 정산</h3><span class="sub">연계 = (KBS+MBC 유상 금액)×20% + SBS 예산×10% · CM지정비 = 단가×지정율 (KBS 유상은 ÷0.85)</span></div><div class="bd">
    <div class="tw free"><table class="t"><thead><tr><th class="l">구분</th>${G.rows.map(r => `<th>${esc(r.ch)}</th>`).join('')}<th>3사 계</th></tr></thead><tbody>
    <tr><td class="l">송출 (유상)</td>${G.rows.map(r => `<td>${fmt.int(r.cnt)} (${fmt.int(r.paidCnt)})</td>`).join('')}<td>${fmt.int(sum(G.rows, r => r.cnt))} (${fmt.int(sum(G.rows, r => r.paidCnt))})</td></tr>
    <tr><td class="l">유상 금액 (3사 Total)</td>${G.rows.map(r => `<td data-ck="gs|paid|${esc(r.ch)}">${fmt.won(r.paid)}</td>`).join('')}<td data-ck="gs|paid|tot">${fmt.won(G.paid)}</td></tr>
    <tr><td class="l">CM지정비</td>${G.rows.map(r => `<td data-ck="gs|desig|${esc(r.ch)}">${fmt.won(r.desig)}</td>`).join('')}<td data-ck="gs|desig|tot">${fmt.won(G.desig)}</td></tr>
    <tr><td class="l">예산</td>${G.rows.map(r => `<td data-ck="gs|bud|${esc(r.ch)}">${fmt.won(r.budget)}</td>`).join('')}<td data-ck="gs|bud|tot">${fmt.won(G.budget)}</td></tr>
    <tr class="sub"><td class="l">연계</td>${G.rows.map(() => '<td></td>').join('')}<td data-ck="gs|link">${fmt.won(G.link)}</td></tr>
    <tr class="sub"><td class="l">예비비 (예산 − 유상 − CM지정비 − 연계)</td>${G.rows.map(() => '<td></td>').join('')}<td data-ck="gs|reserve" style="${G.reserve < 0 ? 'color:#8f3d35' : ''}">${fmt.won(G.reserve)}</td></tr>
    </tbody></table></div></div></section>`;
  if (!sp.length) html += '<div class="card" style="margin-top:14px"><div class="empty">지상파 탭에 송출 행을 입력하면 여기에 큐시트가 만들어져요</div></div>';
  // 13차: 방송사별로 표를 나누지 않고 한 표 — 맨 왼쪽 '방송사' 열(병합) · 방송사마다 계 줄 · 맨 아래 3사 계
  if (sp.length) {
    let body = ''; const all = [];
    const wkN = rows => W.map(w => sum(rows, r => r.spots.filter(x => x.week === w.n).length));
    const totRow = (cls, lab, T, wk, fx, span) => `<tr class="${cls}"><td class="l fx" data-fx="${fx}" colspan="${span}">${lab}</td><td colspan="6"></td><td>${fmt.int(T.n)}</td><td class="r">${fmt.won(T.paid)}</td><td></td><td></td><td class="r">${fmt.won(T.desig)}</td><td></td>${wk.map(v => `<td>${fmt.int(v)}</td>`).join('')}<td></td><td class="r">${fmt.dec(T.eq, 1)}</td><td class="r">${T.cprp ? fmt.won(T.cprp) : '-'}</td></tr>`;
    for (const ch of show) {
      const list = sp.filter(s => s.ch === ch); if (!list.length) continue;
      const rows = gCueRows(ch, list); all.push(...rows);
      const cc = M.cells.filter(c => c.ch === ch && (c.budget || c.cnt));
      const paid = list.filter(s => !s.bonus);
      const meta = `${list.length}회 (유상 ${paid.length} · 보너스 ${list.length - paid.length}) · 예산 ${fmt.eok(sum(cc, c => c.budget), 2)} · 보너스 ${fmt.eok(sum(cc, c => c.bonus), 2)}\n` + cc.map(c => `${c.item} ${c.cnt}회 · ${fmt.eok(c.budget, 2)}`).join('\n');
      body += rows.map((r, i) => { const s = r.first; const same = i && rows[i - 1].first.prog === s.prog; return `<tr class="${r.live || r.cmg === '중CM' ? 'bon' : ''}${same ? ' same' : ''}${i ? '' : ' chfirst'}">${i ? '' : `<td class="info kind chc fx" data-fx="0" rowspan="${rows.length + 1}" title="${esc(meta)}"><span class="kl"><b>${esc(ch)}</b><small>${list.length}회</small><small>예산 ${fmt.eok(sum(cc, c => c.budget), 1)}</small></span></td>`}${r.kspan ? `<td class="info kind fx" data-fx="1" rowspan="${r.kspan}"><span class="kl">${esc(r.kind)}</span></td>` : ''}<td class="info pg fx" data-fx="2"><span>${progHtml(s.prog)}</span>${s.note ? `<i class="pnote" title="${esc('비고: ' + s.note)}">비고</i>` : ''}</td><td class="info">${esc(s.dowRaw || s.dow)}</td><td class="info">${esc(s.start)}</td><td class="info">${esc(s.end)}</td><td class="info">${esc(s.grade)}</td><td class="info">${s.sec || ''}</td><td class="info r">${fmt.won(s.price)}</td><td class="info" data-ck="${esc(`cg|${ch}|${r.k}|n`)}">${r.spots.length}</td>
        <td class="info ${s.bonus ? 'c' : 'r'}">${s.bonus ? '<span class="tagb bon">보너스</span>' : `<span class="tagb paid">${fmt.won(r.paid)}</span>`}</td><td class="info cmo">${r.cmg === '중CM' ? `<b class="cmtag">${esc(s.cmRaw || '중CM')}</b>` : esc(s.cmRaw)}</td><td class="info r">${s.rate ? fmt.pct(s.rate) : ''}</td><td class="info r">${r.desig ? fmt.won(r.desig) : '<span class="muted">-</span>'}</td><td class="info dl">${esc(r.dates)}</td>
        ${W.map(w => `<td class="wk" data-ck="${esc(`cg|${ch}|${r.k}|${w.n}`)}">${r.spots.filter(x => x.week === w.n).map(x => spotChip(x, 'g')).join('')}</td>`).join('')}
        <td class="info r">${r.ar == null ? '' : fmt.dec(r.ar, 1)}</td><td class="info r">${r.eq ? fmt.dec(r.eq, 1) : ''}</td><td class="info r">${r.cprp ? fmt.won(r.cprp) : '<span class="muted">-</span>'}</td></tr>`; }).join('');
      body += totRow('sub', `${esc(ch)} 계`, gCueTotal(rows), wkN(rows), 1, 2);
    }
    if (show.length > 1) body += totRow('tot', '3사 계', gCueTotal(all), wkN(all), 0, 3);
    html += `<div class="card" style="margin-top:14px"><div class="tw cgw" style="border:0"><table class="t cue qm cg one"><thead><tr>
      <th class="fx" rowspan="2">방송사</th><th class="fx" rowspan="2">구분</th><th class="fx pgh" rowspan="2">프로그램</th><th rowspan="2">요일</th><th rowspan="2">시작</th><th rowspan="2">종료</th><th rowspan="2">시급</th><th rowspan="2">초수</th><th rowspan="2">단가</th><th rowspan="2">횟수</th><th rowspan="2">금액</th><th colspan="3" class="grph">CM지정</th><th rowspan="2">집행일자</th>${W.map(w => `<th class="wkh" rowspan="2">${w.label}차<span class="rg">${w.range}</span></th>`).join('')}<th rowspan="2">A.R(%)</th><th colspan="2" class="grph">예상 효과</th></tr>
      <tr><th class="h2 cmoh">CM 순서</th><th class="h2">지정율</th><th class="h2 dsh">지정금액<span class="rg">(원)</span></th><th class="h2">Eq GRP</th><th class="h2">CPRP (원)</th></tr></thead><tbody>${body}</tbody></table></div></div>`;
  }
  root.innerHTML = html;
  keepMergedVisible(root); cueHpager(root);
  bindChips(root, '[data-gch]', v => { UI.gCh = v; renderCueG(root); });
  bindChipBar(root, 'g', () => { const y = window.scrollY; renderCueG(root); window.scrollTo(0, y); });
  root.querySelector('[data-xl="cueg"]').onclick = () => exportCueG(chs);
}
// 지상파 큐시트 한 채널의 줄: 같은 프로그램·시간·단가·유상/보너스·CM지정은 한 줄로. 구분(정기물 등)은 비면 위 값을 이어받아 셀 병합
// 오른쪽 계산 열은 기존 지상파 시트와 같게: 지정금액 = 단가×지정율(KBS 유상은 ÷0.85) · Eq GRP = A.R × 초수/15 · CPRP = (금액+지정금액) ÷ Eq GRP
function gDesig(s, ch) { const r = s.rate || 0; if (!r) return 0; return (!s.bonus && ch === 'KBS') ? (s.price / 0.85) * r : s.price * r; }
function gCueRows(ch, list) {
  const rows = groupCue(list, s => [s.kind, s.prog, s.dowRaw || s.dow, s.start, s.end, s.grade, s.sec, s.price, s.bonus ? 'b' : 'p', s.cmRaw, s.rate].join('|'));
  let last = '';
  for (const r of rows) {
    const s = r.first; r.kind = str(s.kind) || last; last = r.kind;
    r.live = /본방|생방/.test(s.prog) ? 1 : 0;
    r.paid = sum(r.spots, x => x.bonus ? 0 : (x.amount || 0));
    r.desig = sum(r.spots, x => gDesig(x, ch));
    const ars = r.spots.filter(x => x.ar != null && x.ar !== '');
    r.ar = ars.length ? sum(ars, x => +x.ar) / ars.length : null;
    r.eq = sum(ars, x => (+x.ar) * (x.sec || 15) / 15);
    r.cprp = r.eq > 0 && (r.paid + r.desig) > 0 ? (r.paid + r.desig) / r.eq : 0;
    r.wkend = s.dow ? (s.weekend ? '주말' : '주중') : '';
    r.cmg = s.cmCls === '중CM' || s.cmCls === 'PIB' ? s.cmCls : '그외';
    r.dates = dayList(r.spots);
  }
  rows.forEach((r, i) => { if (i && rows[i - 1].kind === r.kind) { r.kspan = 0; return; } let n = 1; while (i + n < rows.length && rows[i + n].kind === r.kind) n++; r.kspan = n; });
  return rows;
}
// 집행일자: '10/4, 11, 18' (기존 지상파 시트와 같은 모양)
function dayList(spots) { const d = [...new Set(spots.map(x => x.day).filter(Boolean))].sort((a, b) => a - b); return d.length ? `${M.ym.m}/${d.join(', ')}` : ''; }
function gCueTotal(rows) {
  const t = { n: sum(rows, r => r.spots.length), paid: sum(rows, r => r.paid), desig: sum(rows, r => r.desig), eq: sum(rows, r => r.eq) };
  t.cprp = t.eq > 0 ? (t.paid + t.desig) / t.eq : 0; return t;
}
function exportCueG() { xrDownload([xrGroundSheet()], null, xrName('지상파큐시트')); }

// ---------- 케이블 큐시트 ----------
function cueKey(s) { return [s.prog, s.dowRaw || s.dow, s.start, s.end, s.grade].join('|'); }
function cableRows(ch, list) {
  const rows = groupCue(list, cueKey);
  for (const r of rows) {
    r.live = /본방|생방/.test(r.first.prog) ? 1 : 0;   // 생방도 본방과 똑같이 (위로 · 분홍 음영)
    r.avg15 = sum(r.spots, s => s.sec ? s.price / s.sec * 15 : 0) / r.spots.length;
  }
  rows.sort((a, b) => b.live - a.live || b.avg15 - a.avg15 || String(a.first.prog).localeCompare(String(b.first.prog), 'ko') || DOW.indexOf((a.first.dowRaw || a.first.dow || '').charAt(0)) - DOW.indexOf((b.first.dowRaw || b.first.dow || '').charAt(0)) || timeToMin(a.first.start) - timeToMin(b.first.start));
  const ord = (WS.cueOrder || {})[ch];
  if (ord && ord.length) {
    const pos = new Map(ord.map((k, i) => [k, i]));
    const slots = []; rows.forEach((r, i) => { if (pos.has(r.k)) slots.push(i); });
    const known = slots.map(i => rows[i]).sort((a, b) => pos.get(a.k) - pos.get(b.k));
    slots.forEach((i, j) => { rows[i] = known[j]; });
    rows.custom = true;
  }
  return rows;
}
function renderCueC(root) {
  const sp = M.spots.filter(s => s.src === '케이블');
  const chs = [...new Set(sp.map(s => s.ch))].sort((a, b) => chOrd(a) - chOrd(b));
  const ppOf = ch => { const c = M.MS.chByName.get(ch); return c ? c.mpp : '기타'; };
  const pps = [...new Set(chs.map(ppOf))];
  if (!UI.cabPP || !pps.includes(UI.cabPP)) UI.cabPP = pps[0] || null;
  const ppChs = chs.filter(c => ppOf(c) === UI.cabPP);
  if (UI.cabCh !== 'all' && !ppChs.includes(UI.cabCh)) UI.cabCh = ppChs.length > 1 ? 'all' : (ppChs[0] || 'all');
  const W = M.weeks;
  const cnt = l => fmt.int(sum(l, s => s.cnt));
  let html = `<div class="viewhead"><div><h2>케이블 큐시트</h2><div class="sub">${ymLabel()} · 본방·생방 → 15초 평단가 높은 순${readOnly() ? '' : ' · 행을 끌어서 순서를 바꿀 수 있어요'}</div></div><div class="spacer"></div>${xlBtn('cuec', '케이블 큐시트 엑셀')}</div>
  <div class="ppsel"><span class="lbl">PP</span>${chipsHtml('data-pp', pps.map(p => [p, `${p} ${cnt(sp.filter(s => ppOf(s.ch) === p))}`]), UI.cabPP)}</div>
  <div class="ppsel"><span class="lbl">채널</span>${chipsHtml('data-cch', (ppChs.length > 1 ? [['all', `${UI.cabPP} 전체`]] : []).concat(ppChs.map(c => [c, `${c} ${cnt(sp.filter(s => s.ch === c))}`])), UI.cabCh)}</div>
  ${sp.length ? chipBar('c', M.MS.itemOrder.filter(k => sp.some(s => s.item === k && ppChs.includes(s.ch)))) : ''}`;
  if (!sp.length) html += '<div class="card" style="margin-top:14px"><div class="empty">케이블 탭에 케이블raw를 붙여넣으면 여기에 큐시트가 만들어져요</div></div>';
  const show = UI.cabCh === 'all' ? ppChs : [UI.cabCh];
  for (const ch of show) {
    const list = sp.filter(s => s.ch === ch);
    const cc = M.cells.filter(c => c.ch === ch && (c.budget || c.cnt));
    const rows = cableRows(ch, list);
    html += `<section class="card" style="margin-top:14px"><div class="hd"><h3>${esc(ch)}</h3><span class="sub tnum">${cnt(list)}회 · 예산 ${fmt.eok(sum(cc, c => c.budget), 2)} · 보너스 ${fmt.eok(sum(cc, c => c.bonus), 2)}</span><div class="spacer"></div>${rows.custom && !readOnly() ? `<button class="btn sm" data-reset="${esc(ch)}">기본 순서로</button>` : ''}</div><div class="bd">
      <div class="tw free"><table class="t"><thead><tr><th class="l">품목</th><th>예산 (원)</th><th>횟수</th><th>보너스 (원)</th><th>보너스율</th><th class="l">집행 기간</th><th class="l">소재</th></tr></thead><tbody>
      ${cc.map(c => { const cs = M.creatives.filter(x => x.item === c.item); const k = j => `data-ck="${esc(`cc|${ch}|${c.item}|${j}`)}"`; return `<tr><td class="l"><span class="sw" style="background:${itemColor(c.item)};margin-right:6px"></span>${esc(c.item)}</td><td ${k(0)}>${fmt.won(c.budget)}</td><td ${k(1)}>${fmt.int(c.cnt)}</td><td ${k(2)}>${fmt.won(c.bonus)}</td><td ${k(3)}>${fmt.pct(c.rate)}</td><td class="l">${esc([...new Set(cs.map(x => x.period))].join(', '))}</td><td class="l">${esc(cs.map(x => x.cre + (x.cshare ? ` ${fmt.pct(x.cshare)}` : '')).join(' : '))}</td></tr>`; }).join('')}
      <tr class="sub"><td class="l">계</td><td>${fmt.won(sum(cc, c => c.budget))}</td><td>${fmt.int(sum(cc, c => c.cnt))}</td><td>${fmt.won(sum(cc, c => c.bonus))}</td><td>${fmt.pct(sum(cc, c => c.budget) ? sum(cc, c => c.bonus) / sum(cc, c => c.budget) : null)}</td><td></td><td></td></tr>
      </tbody></table></div></div>
      <div class="tw" style="border:0;border-top:1px solid var(--rule2);border-radius:0 0 12px 12px;max-height:none"><table class="t cue qm" data-ch="${esc(ch)}"><thead><tr>${readOnly() ? '' : '<th class="fx"></th>'}<th class="fx pgh">프로그램명</th><th>요일</th><th>시작</th><th>종료</th><th>시급</th><th>횟수</th>${W.map(w => `<th class="wkh">${w.label}차<span class="rg">${w.range}</span></th>`).join('')}</tr></thead><tbody>
      ${rows.map((r, i) => { const s = r.first; const same = i && rows[i - 1].first.prog === s.prog; return `<tr data-k="${esc(r.k)}" class="${r.live ? 'bon' : ''}${same ? ' same' : ''}">${readOnly() ? '' : '<td class="grip info fx" data-fx="0" title="끌어서 순서 바꾸기">⋮⋮</td>'}<td class="info pg fx" data-fx="${readOnly() ? 0 : 1}"><span>${progHtml(s.prog)}</span></td><td class="info">${esc(s.dowRaw || s.dow)}</td><td class="info">${esc(s.start)}</td><td class="info">${esc(s.end)}</td><td class="info">${esc(s.grade)}</td><td class="info" data-ck="${esc(`cq|${ch}|${r.k}|n`)}">${sum(r.spots, x => x.cnt)}</td>
        ${W.map(w => `<td class="wk" data-ck="${esc(`cq|${ch}|${r.k}|${w.n}`)}">${r.spots.filter(x => x.week === w.n).map(x => spotChip(x, 'c')).join('')}</td>`).join('')}</tr>`; }).join('')}
      </tbody></table></div></section>`;
  }
  root.innerHTML = html;
  cueHpager(root);
  const keep = () => { const y = window.scrollY; renderCueC(root); window.scrollTo(0, y); };
  bindChips(root, '[data-pp]', v => { UI.cabPP = v; UI.cabCh = 'all'; renderCueC(root); });
  bindChips(root, '[data-cch]', v => { UI.cabCh = v; renderCueC(root); });
  bindChipBar(root, 'c', keep);
  root.querySelector('[data-xl="cuec"]').onclick = () => exportCueC(chs);
  root.querySelectorAll('[data-reset]').forEach(b => b.onclick = () => { delete WS.cueOrder[b.dataset.reset]; App.changed('order', true); keep(); });
  // 끌어서 순서 바꾸기
  if (!readOnly()) root.querySelectorAll('table.cue[data-ch]').forEach(tb => {
    let drag = null;
    tb.addEventListener('mousedown', e => { const g = e.target.closest('td.grip'); if (g) g.parentElement.draggable = true; });
    tb.addEventListener('mouseup', () => tb.querySelectorAll('tr[draggable]').forEach(t => t.removeAttribute('draggable')));
    tb.addEventListener('dragstart', e => { drag = e.target.closest('tr[data-k]'); if (!drag) return; drag.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', drag.dataset.k); } catch (x) { } });
    tb.addEventListener('dragover', e => { if (!drag) return; e.preventDefault(); const tr = e.target.closest('tr[data-k]'); if (!tr || tr === drag) return; const rc = tr.getBoundingClientRect(); const after = e.clientY > rc.top + rc.height / 2; tr.parentNode.insertBefore(drag, after ? tr.nextSibling : tr); });
    tb.addEventListener('dragend', () => {
      tb.querySelectorAll('tr[draggable]').forEach(t => t.removeAttribute('draggable'));
      if (!drag) return; drag.classList.remove('dragging'); drag = null;
      WS.cueOrder = WS.cueOrder || {}; WS.cueOrder[tb.dataset.ch] = [...tb.querySelectorAll('tr[data-k]')].map(t => t.dataset.k);
      App.changed('order', true); keep();
    });
  });
}
function exportCueC() { xrDownload([xrCableSheet()], null, xrName('케이블큐시트')); }

// ---------- 시작 안내 ----------
function onboardingHtml() {
  if (readOnly()) return `<div class="viewhead"><div><h2>${esc(advName())} ${M.ym.m}월 큐시트</h2><div class="sub">${ymLabel()}</div></div></div><section class="card"><div class="empty">아직 이 달 큐시트가 올라오지 않았어요</div></section>`;
  return `<div class="viewhead"><div><h2>${ymLabel()} 큐시트 시작하기</h2><div class="sub">마스터(품목·채널) → 예산·소재 → 지상파·케이블 순서로 채우면 이 화면이 자동으로 만들어져요.</div></div></div>
  <div class="onb">
    <div class="card"><div class="bd"><div class="n">1</div><h3>예산·소재</h3><p class="muted">운영사항의 예산(채널 × 품목)과 품목별 소재를 먼저 채워요. 엑셀 범위를 복사해 붙여넣어도 돼요.</p><button class="btn pri" data-act="tab-예산">예산 열기</button></div></div>
    <div class="card"><div class="bd"><div class="n">2</div><h3>방송사 큐시트 온보딩</h3><p class="muted">방송사에서 받은 원본 큐시트 엑셀을 끌어다 놓으면 자동으로 매칭해서 지상파·케이블 시트에 넣어요.</p><button class="btn" data-act="onboard">온보딩 열기</button></div></div>
    <div class="card"><div class="bd"><div class="n">3</div><h3>큐시트 입력</h3><p class="muted">지상파·케이블 입력 시트는 엑셀처럼 써요. 복사해 붙여넣기, 범위 선택, 찾기/바꾸기(Ctrl+F), 필터, 행 번호 우클릭으로 삽입·삭제.</p><button class="btn" data-act="tab-지상파">지상파 입력 열기</button></div></div>
  </div>`;
}
function bindOnboarding(root) {
  root.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
    const a = b.dataset.act;
    if (a === 'onboard') OBUI.open();
    else if (a.startsWith('tab-')) App.go(a.slice(4));
  });
}

// 요약 탭 '당월 소재' (14차: 당월 운영 메뉴는 관리자만 보므로 뷰어도 요약에서 소재를 봄)
function creSummaryHtml() {
  const by = groupBy(M.creatives, c => c.item || c.itemRaw);
  if (!by.size) return '<div class="empty">당월 소재가 아직 없어요</div>';
  const pool = groupBy(M.spots.filter(s => s.src === '지상파' && s.item), s => s.item);
  const ord = k => { const b = M.budgetItems.indexOf(k); if (b >= 0) return b; const it = M.MS.items.get(k); return it ? 100 + it.order : 999; };
  let body = '';
  for (const [k, l] of [...by].sort((a, b) => ord(a[0]) - ord(b[0]))) {
    const p = pool.get(k) || [];
    body += l.map((c, i) => { const hit = p.filter(s => creMatch(c.cre, s.cre)).length; return `<tr>${i ? '' : `<td class="mg crit" rowspan="${l.length + 1}" style="--c:${itemColor(k)}"><span class="sw" style="background:${itemColor(k)}"></span>${esc(k)}</td>`}<td>${esc(c.period)}</td><td>${c.sec ? c.sec + '초' : ''}</td><td>${esc(c.cre)}</td><td>${c.share == null ? '' : fmt.pct(c.share)}</td><td>${c.cshare == null ? '' : fmt.pct(c.cshare)}</td><td>${p.length ? `${fmt.pct(hit / p.length)} <span class="muted">(${hit}회)</span>` : '<span class="muted">-</span>'}</td><td>${esc(c.reg)}</td><td class="wrap">${esc(c.note)}</td></tr>`; }).join('');
    const sh = l.filter(c => c.share != null), cs = l.filter(c => c.cshare != null);
    body += `<tr class="sub"><td colspan="3">${esc(k)} 계</td><td>${sh.length ? fmt.pct(sum(sh, c => c.share)) : ''}</td><td>${cs.length ? fmt.pct(sum(cs, c => c.cshare)) : ''}</td><td colspan="3"></td></tr>`;
  }
  return `<div class="tw free"><table class="t ctr cresum"><thead><tr><th>품목</th><th>운영기간</th><th>초수</th><th>소재</th><th>금액 비중</th><th>횟수 비중</th><th>지상파 실제</th><th>심의번호</th><th>비고</th></tr></thead><tbody>${body}</tbody></table></div>`;
}
