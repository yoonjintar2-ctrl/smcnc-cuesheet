// ===== 20-year.js : 'YYYY년 운영 누적' — 월별 PP별 · 품목별 광고비(예산) 그래프 + 표 (15차) =====
// 데이터: 그 해 달마다 저장된 예산표 + 마스터(채널→PP, 품목) — 온라인은 cue_view_year 한 번(없으면 달마다 불러옴), 오프라인은 이 브라우저 저장분
// 지금 열린 달은 화면에 있는 내용(WS) 그대로 · 아직 집행하지 않은 달은 빈 칸
const SETTINGS = { v: {} };
function yearMenuOn() { return !CLOUD.on || !!SETTINGS.v.yearMenu; }
const YEAR = { cache: {}, loading: null };
const YEAR_GC = { KBS: '#2f2f31', MBC: '#4d4d50', SBS: '#6c6c70', 'CJ ENM': '#8e8e93', JTBC: '#b2b2b7', 기타: '#d3d3d7' };

async function yearData(y) {
  const yms = App.months.filter(m => parseYM(m) && parseYM(m).y === y).sort();
  const key = y + '|' + yms.join(',');
  const c = YEAR.cache[y];
  if (c && c.key === key && Date.now() - c.at < 5 * 60 * 1000) return c.data;
  const data = {};
  if (CLOUD.on) {
    let rows = null;
    try { rows = await CLOUD.rpc('cue_view_year', { p_camp: CLOUD.camp.id, p_year: String(y) }); } catch (e) { rows = null; }
    if (rows) for (const r of rows) { const d = data[r.ym] = data[r.ym] || {}; d[r.part] = r.data; }
    else for (const ym of yms) { try { const w = await CLOUD.load(CLOUD.camp.id, ym); if (w) data[ym] = { 예산: w.sheets.예산, master: { 품목: w.sheets.품목, 채널: w.sheets.채널 } }; } catch (e) { } }
  } else {
    for (const ym of yms) { try { const w = await Store.load(ym); if (w) data[ym] = { 예산: w.sheets.예산, master: { 품목: w.sheets.품목, 채널: w.sheets.채널 } }; } catch (e) { } }
  }
  YEAR.cache[y] = { key, at: Date.now(), data };
  return data;
}

// 달 하나의 예산표 → { pp: Map(ppKey → {v, media, group, order}), item: Map(item → v), total }
function yearMonthAgg(budget, master) {
  const w = { sheets: { 품목: (master && master.품목) || [], 채널: (master && master.채널) || [] }, itemLegacy: {} };
  const MS = buildMaster(w); const cur = M.MS;
  const out = { pp: new Map(), item: new Map(), total: 0, colors: {} };
  const B = budget || []; const head = B[0] || [];
  const itemOf = h => resolveItemLoose(cur, h) || resolveItemLoose(MS, h) || str(h);
  for (let i = 1; i < B.length; i++) {
    const r = B[i] || []; const raw = str(r[0]); if (!raw || /^(합계|계|total)/i.test(raw)) continue;
    const ch = resolveCh(cur, raw) || resolveCh(MS, raw); if (!ch) continue;
    for (let j = 1; j < r.length; j++) {
      const v = num(r[j]); if (!v || !str(head[j])) continue;
      const pk = ch.media === '지상파' ? ch.name : ch.mpp;
      const o = out.pp.get(pk) || { v: 0, media: ch.media, group: ch.group, order: ch.order };
      o.v += v; o.order = Math.min(o.order, ch.order); out.pp.set(pk, o);
      const it = itemOf(head[j]); out.item.set(it, (out.item.get(it) || 0) + v);
      if (!out.colors[it]) { const x = MS.items.get(it); if (x) out.colors[it] = x.color; }
      out.total += v;
    }
  }
  return out;
}

async function renderYear(root) {
  const y = App.selYear || parseYM(WS.ym).y;
  root.innerHTML = `<div class="viewhead"><div><h2>${y}년 운영 누적</h2><div class="sub">${y}년 월별 광고비(예산, 원 VAT 별도) · 불러오는 중…</div></div></div><div class="card"><div class="empty"><div class="spin"></div></div></div>`;
  let data;
  try { data = await yearData(y); } catch (e) { root.innerHTML = `<div class="card"><div class="empty">불러오지 못했어요: ${esc(e.message)}</div></div>`; return; }
  if (App.tab !== 'year' || !root.isConnected) return;
  // 지금 열린 달은 화면의 내용으로
  if (parseYM(WS.ym).y === y) data = Object.assign({}, data, { [WS.ym]: { 예산: WS.sheets.예산, master: { 품목: WS.sheets.품목, 채널: WS.sheets.채널 } } });
  const MON = Array.from({ length: 12 }, (_, i) => `${y}-${pad2(i + 1)}`);
  const per = MON.map(ym => data[ym] ? yearMonthAgg(data[ym].예산, data[ym].master) : null);
  const done = per.filter(x => x && x.total > 0).length;
  const total = sum(per, x => x ? x.total : 0);
  // PP 줄: 지상파 → 케이블, 채널 관리 순서
  const pps = new Map();
  per.forEach(x => { if (x) for (const [k, o] of x.pp) { const p = pps.get(k) || { k, media: o.media, group: o.group, order: o.order }; p.order = Math.min(p.order, o.order); pps.set(k, p); } });
  const ppList = [...pps.values()].sort((a, b) => (a.media === b.media ? 0 : a.media === '지상파' ? -1 : 1) || a.order - b.order);
  // 품목 줄: 지금 마스터 순서(카테고리끼리) → 그 밖의 예전 품목
  const its = new Set(); per.forEach(x => { if (x) for (const k of x.item.keys()) its.add(k); });
  const ord = k => { const i = M.MS.itemOrder.indexOf(k); return i < 0 ? 999 : i; };
  const itList = [...its].sort((a, b) => ord(a) - ord(b) || String(a).localeCompare(String(b), 'ko'));
  const colorOf = k => { const it = M.MS.items.get(k); if (it) return it.color; for (const x of per) if (x && x.colors[k]) return x.colors[k]; return '#9a9aa0'; };
  const cell = v => v ? fmt.dec(v / 1e8, 2) : '';
  const monCols = MON.map((ym, i) => `<th>${i + 1}월</th>`).join('');
  // ---- PP별 표 ----
  const ppRow = p => { const vs = per.map(x => x ? (x.pp.get(p.k) || {}).v || 0 : null); return `<tr><td class="l">${esc(p.k)}</td>${vs.map((v, i) => `<td class="${v == null ? 'na' : v ? '' : 'z'}" data-ck="yr|pp|${esc(p.k)}|${i}">${v == null ? '' : cell(v)}</td>`).join('')}<td class="yt">${cell(sum(vs, v => v || 0))}</td></tr>`; };
  const sumRow = (cls, lab, f) => { const vs = per.map(x => x ? f(x) : null); return `<tr class="${cls}"><td class="l">${lab}</td>${vs.map(v => `<td>${v == null ? '' : cell(v)}</td>`).join('')}<td class="yt">${cell(sum(vs, v => v || 0))}</td></tr>`; };
  let ppBody = '';
  for (const md of ['지상파', '케이블']) {
    const l = ppList.filter(p => p.media === md); if (!l.length) continue;
    ppBody += `<tr class="grp"><td colspan="14">${md}</td></tr>` + l.map(ppRow).join('') + sumRow('sub', `${md} 계`, x => sum([...x.pp.values()].filter(o => o.media === md), o => o.v));
  }
  ppBody += sumRow('tot', '합계', x => x.total);
  // ---- 품목별 표 ----
  const itBody = itList.map(k => { const vs = per.map(x => x ? x.item.get(k) || 0 : null); return `<tr><td class="l"><span class="sw" style="background:${colorOf(k)};margin-right:6px"></span>${esc(k)}</td>${vs.map((v, i) => `<td class="${v == null ? 'na' : v ? '' : 'z'}" data-ck="yr|it|${esc(k)}|${i}">${v == null ? '' : cell(v)}</td>`).join('')}<td class="yt">${cell(sum(vs, v => v || 0))}</td></tr>`; }).join('') + sumRow('tot', '합계', x => x.total);
  // ---- 그래프 (월별 쌓은 막대) ----
  const groups = SUM_GROUPS.concat(['그 밖']);
  const gOf = p => SUM_GROUPS.includes(p.group) ? (p.media === '지상파' ? p.k : p.group) : '기타';
  const ppSeries = groups.filter(g => g !== '그 밖').map(g => ({ k: g, c: YEAR_GC[g] || '#c7c7cc', v: per.map(x => x ? sum([...x.pp.entries()].filter(([k, o]) => gOf({ k, media: o.media, group: o.group }) === g), ([, o]) => o.v) : null) })).filter(s => s.v.some(v => v));
  const itSeries = itList.map(k => ({ k, c: colorOf(k), v: per.map(x => x ? x.item.get(k) || 0 : null) }));
  root.innerHTML = `<div class="viewhead"><div><h2>${y}년 운영 누적</h2><div class="sub">${y}년 월별 광고비 · 예산(VAT 별도) 기준 · 단위 억원 · 아직 집행하지 않은 달은 비워 둬요</div></div><div class="spacer"></div>${readOnly() ? '' : `<span class="muted small">${yearMenuOn() ? '뷰어에게 보이는 메뉴예요' : '지금은 숨김 — 관리자 메뉴에서 뷰어에게 보이게 할 수 있어요'}</span>`}</div>
    <div class="kpis k3">
      <div class="kpi hl"><div class="l">${y}년 누적 광고비</div><div class="v tnum">${fmt.eok(total)}</div><div class="s">${done ? `${done}개월 집행` : '아직 집행한 달이 없어요'}</div></div>
      <div class="kpi"><div class="l">월평균</div><div class="v tnum">${done ? fmt.eok(total / done) : '-'}</div><div class="s">집행한 달 기준</div></div>
      <div class="kpi"><div class="l">가장 많이 쓴 달</div><div class="v tnum">${done ? (() => { const i = per.reduce((b, x, j) => (x && x.total > ((per[b] || {}).total || 0)) ? j : b, 0); return `${i + 1}월`; })() : '-'}</div><div class="s">${done ? fmt.eok(Math.max(...per.map(x => x ? x.total : 0))) : ''}</div></div>
    </div>
    <section class="card" style="margin-bottom:16px"><div class="hd"><h3>월별 PP별 광고비</h3><span class="sub">지상파 3사 · CJ ENM · JTBC · 기타 PP 묶음으로 쌓음 · 표는 PP별</span></div><div class="bd">
      ${yearChartHtml(ppSeries, MON)}
      <div class="tw free"><table class="t ctr yeart"><thead><tr><th class="l">PP</th>${monCols}<th>계</th></tr></thead><tbody>${ppBody}</tbody></table></div></div></section>
    <section class="card"><div class="hd"><h3>월별 품목별 광고비</h3><span class="sub">품목 색으로 쌓음</span></div><div class="bd">
      ${yearChartHtml(itSeries, MON)}
      <div class="tw free"><table class="t ctr yeart"><thead><tr><th class="l">품목</th>${monCols}<th>계</th></tr></thead><tbody>${itBody}</tbody></table></div></div></section>`;
  yearChartBind(root);
}
// 월 12칸 쌓은 막대 (HTML) — 막대 위 = 그 달 합계 · 마우스를 올리면 구성
function yearChartHtml(series, MON) {
  const tots = MON.map((_, i) => sum(series, s => s.v[i] || 0));
  const mx = Math.max(1, ...tots);
  const step = [0.5, 1, 2, 5, 10, 20, 50].find(s => mx / 1e8 / s <= 5) || 100;
  const top = Math.ceil(mx / 1e8 / step) * step;
  const ticks = []; for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  return `<div class="ychart"><div class="ylg">${series.map(s => `<span><i style="background:${s.c}"></i>${esc(s.k)}</span>`).join('')}</div>
    <div class="yplot"><div class="yax">${ticks.map(t => `<span style="bottom:${t / top * 100}%">${t % 1 ? t.toFixed(1) : t}억</span>`).join('')}</div>
    <div class="ycols"><div class="ygrid">${ticks.map(t => `<i class="ygl" style="bottom:${t / top * 100}%"></i>`).join('')}</div>${MON.map((ym, i) => { const T = tots[i]; const has = series.some(s => s.v[i] != null);
      return `<div class="ycol${has ? '' : ' na'}" data-tip="${esc(`<b>${i + 1}월 · ${T ? fmt.eok(T, 2) : '집행 없음'}</b>` + series.filter(s => s.v[i]).map(s => `<div><span class="sw" style="background:${s.c}"></span> ${esc(s.k)} ${fmt.eok(s.v[i], 2)} <span class="m">${fmt.pct(s.v[i] / (T || 1))}</span></div>`).join(''))}"><div class="ystk" style="height:${T / 1e8 / top * 100}%">${T ? `<em>${fmt.dec(T / 1e8, 1)}</em>` : ''}${series.map(s => s.v[i] ? `<b style="flex:${s.v[i]};background:${s.c}"></b>` : '').join('')}</div><span class="ym">${i + 1}월</span></div>`; }).join('')}</div></div></div>`;
}
function yearChartBind(root) {
  root.querySelectorAll('.ycol').forEach(c => { c.addEventListener('mousemove', e => ftip(e, c.dataset.tip)); c.addEventListener('mouseleave', ftipHide); });
  // 처음 그릴 때 막대가 아래에서 자라남
  root.querySelectorAll('.ystk').forEach(s => { const h = s.style.height; s.style.height = '0%'; requestAnimationFrame(() => requestAnimationFrame(() => { s.style.height = h; })); });
}
