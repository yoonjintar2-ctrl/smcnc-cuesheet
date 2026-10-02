// ===== 18-cal.js : 큐시트 캘린더 — Q-Mate의 달력형 큐시트 (월~일 7칸 × 주 단위, 날짜 칸마다 그날 나간 광고) =====
// 한 줄 = 채널 · 시작 시간 · 초수 · 프로그램 · CM 위치 (품목은 왼쪽 색 띠). 같은 날 같은 송출이 여러 번이면 ×N
const CAL_WD = ['월', '화', '수', '목', '금', '토', '일'];
function calUI() { if (!UI.cal) UI.cal = { media: 'all', ch: null, item: null, sort: 'ch' }; return UI.cal; }
function calRows() {
  const f = calUI();
  return M.spots.filter(s => s.day && (s.chRaw || s.prog) && (f.media === 'all' || s.media === f.media) && (!f.ch || f.ch.has(s.ch)) && (!f.item || f.item.has(s.item || s.itemRaw)));
}
// 날짜별 줄: 같은 채널·시간·초수·프로그램·CM·품목은 한 줄로 합치고 횟수
function calGrid(rows) {
  const f = calUI(); const y = M.ym.y, m = M.ym.m, days = daysInMonth(y, m);
  const by = Array.from({ length: days + 1 }, () => new Map());
  for (const s of rows) {
    const cm = s.cmRaw || (s.cmCls === '일반' ? '' : s.cmCls);
    const k = [s.ch, s.start, s.sec, s.prog, cm, s.item || s.itemRaw].join('|');
    const x = by[s.day].get(k);
    if (x) x.n += s.cnt || 1; else by[s.day].set(k, { ch: s.ch, media: s.media, st: s.start, sec: s.sec, prog: s.prog, cm, cmCls: s.cmCls, item: s.item, itemRaw: s.itemRaw, n: s.cnt || 1 });
  }
  const sortE = l => l.sort((a, b) => f.sort === 'time'
    ? timeToMin(a.st) - timeToMin(b.st) || chOrd(a.ch) - chOrd(b.ch)
    : (a.media === b.media ? 0 : a.media === '지상파' ? -1 : 1) || chOrd(a.ch) - chOrd(b.ch) || String(a.ch).localeCompare(String(b.ch), 'ko') || timeToMin(a.st) - timeToMin(b.st));
  const weeks = []; let cur = null;
  for (let d = 1; d <= days; d++) {
    const wd = (new Date(y, m - 1, d).getDay() + 6) % 7;   // 월=0 … 일=6
    if (!cur || wd === 0) { cur = Array(7).fill(null); weeks.push(cur); }
    const list = sortE([...by[d].values()]);
    cur[wd] = { d, wd, list, n: sum(list, e => e.n) };
  }
  return weeks;
}
function renderCal(root) {
  const f = calUI();
  const all = M.spots.filter(s => s.day && (s.chRaw || s.prog));
  const chs = [...new Set(all.map(s => s.ch))].sort((a, b) => chOrd(a) - chOrd(b));
  const items = M.MS.itemOrder.filter(k => all.some(s => s.item === k));
  const keep = (set, list) => { if (!set) return null; const x = new Set([...set].filter(v => list.includes(v))); return x.size && x.size < list.length ? x : null; };
  f.ch = keep(f.ch, chs); f.item = keep(f.item, items);
  const rows = calRows();
  const weeks = calGrid(rows);
  const n = sum(rows, s => s.cnt || 1), amt = sum(rows, s => (s.price || 0) * (s.cnt || 1));
  const cmN = k => sum(rows.filter(s => s.cmCls === k), s => s.cnt || 1);
  const days = rows.map(s => s.day); const d0 = days.length ? Math.min(...days) : 0, d1 = days.length ? Math.max(...days) : 0;
  const chOpts = chs.map(c => { const x = M.MS.chByName.get(c); return { v: c, t: c, sub: x ? (x.media === '지상파' ? '지상파' : x.mpp) : '' }; });
  const itOpts = items.map(k => ({ v: k, t: k, color: itemColor(k) }));
  const shownItems = items.filter(k => rows.some(s => s.item === k));
  root.innerHTML = `<div class="viewhead"><div><h2>큐시트 캘린더</h2><div class="sub">${ymLabel()} · 날짜 칸마다 그날 나간 광고 — 채널 · 시작 시간 · 초수 · 프로그램 · CM 위치 (왼쪽 색 = 품목)</div></div><div class="spacer"></div>${xlBtn('cal', '캘린더 엑셀')}</div>
    <section class="card cafilter"><div class="bd">
      ${segHtml('calmedia', [['all', '전체'], ['지상파', '지상파'], ['케이블', '케이블']], f.media)}
      ${mselHtml('calch', '채널', chOpts, f.ch)}
      ${mselHtml('calit', '품목', itOpts, f.item)}
      ${f.ch || f.item || f.media !== 'all' ? '<button class="btn sm ghost" id="cal-reset">필터 해제</button>' : ''}
      <div class="spacer"></div><span class="ml">정렬</span>${segHtml('calsort', [['ch', '채널 순'], ['time', '시간 순']], f.sort)}
    </div></section>
    <div class="castat"><span>방송사 <b class="tnum">${new Set(rows.map(s => s.ch)).size}</b>개</span><span>횟수 <b class="tnum">${fmt.int(n)}</b>회</span><span>단가 합 <b class="tnum">${fmt.eok(amt, 2)}</b></span>${d0 ? `<span>기간 <b>${M.ym.m}/${d0}~${M.ym.m}/${d1}</b></span>` : ''}<span class="muted">중CM ${fmt.pct(n ? cmN('중CM') / n : 0)} · PIB ${fmt.pct(n ? cmN('PIB') / n : 0)} · 전후CM 등 ${fmt.pct(n ? 1 - (cmN('중CM') + cmN('PIB')) / n : 0)}</span>
      <div class="spacer"></div><span class="qmlegend">${shownItems.map(k => `<span><i style="background:${itemColor(k)}"></i>${esc(k)}</span>`).join('')}</span></div>
    <section class="card calcard"><div class="calw"><table class="calt"><colgroup>${CAL_WD.map(() => '<col>').join('')}</colgroup><thead><tr>${CAL_WD.map((w, i) => `<th class="${i === 5 ? 'sat' : i === 6 ? 'sun' : ''}">${w}</th>`).join('')}</tr></thead><tbody>
    ${weeks.map(wk => `<tr>${wk.map((c, i) => {
      if (!c) return '<td class="off"></td>';
      const cls = i === 5 ? 'sat' : i === 6 ? 'sun' : '';
      return `<td class="${cls}"><div class="cald"><b>${c.d}</b><span class="tnum">${c.n ? fmt.int(c.n) + '회' : ''}</span></div>${c.list.map((e, k) => {
        const it = M.MS.items.get(e.item); const col = it ? it.color : '#b9c2cb';
        const head = f.sort === 'ch' && (k === 0 || c.list[k - 1].ch !== e.ch);
        return `${head ? `<div class="calch">${esc(e.ch)}</div>` : ''}<div class="cale${e.cmCls === '중CM' ? ' mid' : ''}" style="--b:${col}" title="${esc(`${e.ch} · ${e.st} · ${e.sec || ''}초 · ${e.prog} · ${e.cm || ''} · ${e.item || e.itemRaw || ''}${e.n > 1 ? ` · ${e.n}회` : ''}`)}">${f.sort === 'time' ? `<span class="c">${esc(e.ch)}</span>` : ''}<span class="t tnum">${esc(e.st)}</span><span class="s tnum">${e.sec ? e.sec + '″' : ''}</span><span class="p">${progHtml(e.prog)}</span><span class="m">${esc(e.cm)}</span>${e.n > 1 ? `<span class="x">×${e.n}</span>` : ''}</div>`;
      }).join('')}</td>`;
    }).join('')}</tr>`).join('')}
    </tbody></table></div></section>`;
  const re = () => { const y = window.scrollY; renderCal(root); window.scrollTo(0, y); };
  bindSeg(root, 'calmedia', v => { f.media = v; re(); });
  bindSeg(root, 'calsort', v => { f.sort = v; re(); });
  bindMsel(root, 'calch', chOpts, f.ch, v => { f.ch = v; re(); });
  bindMsel(root, 'calit', itOpts, f.item, v => { f.item = v; re(); });
  const rs = root.querySelector('#cal-reset'); if (rs) rs.onclick = () => { Object.assign(f, { media: 'all', ch: null, item: null }); re(); };
  root.querySelector('[data-xl="cal"]').onclick = () => exportCal(weeks);
}
// 엑셀: 요일 머리글(5칸씩 병합) → 주마다 날짜 줄(병합) + 송출 줄(채널 · 시간 · 초수 · 프로그램 · CM)
function exportCal(weeks) {
  const aoa = [], merges = [], kinds = [];
  aoa.push(CAL_WD.flatMap(w => [w, '', '', '', ''])); kinds.push('h');
  CAL_WD.forEach((_, i) => merges.push({ s: { r: 0, c: i * 5 }, e: { r: 0, c: i * 5 + 4 } }));
  const fills = [];
  for (const wk of weeks) {
    const r0 = aoa.length;
    aoa.push(wk.flatMap(c => c ? [`${M.ym.m}월 ${c.d}일${c.n ? ` · ${c.n}회` : ''}`, '', '', '', ''] : ['', '', '', '', ''])); kinds.push('d');
    wk.forEach((c, i) => merges.push({ s: { r: r0, c: i * 5 }, e: { r: r0, c: i * 5 + 4 } }));
    const mx = Math.max(1, ...wk.map(c => c ? c.list.length : 0));
    for (let k = 0; k < mx; k++) {
      const row = [], fr = [];
      wk.forEach(c => { const e = c && c.list[k]; if (e) { row.push(e.ch, e.st, e.sec || '', e.prog + (e.n > 1 ? ` ×${e.n}` : ''), e.cm); fr.push(e.item); } else { row.push('', '', '', '', ''); fr.push(null); } });
      aoa.push(row); kinds.push('e'); fills[aoa.length - 1] = fr;
    }
  }
  downloadBook([{ name: '캘린더', aoa, merges, headerRows: 1, widths: CAL_WD.flatMap(() => [10, 6, 4, 24, 7]),
    styler: (r, c) => {
      if (kinds[r] === 'h') return null;
      if (kinds[r] === 'd') return xsMerge(XS.sub, { alignment: { horizontal: 'left', vertical: 'center' } });
      const it = fills[r] && fills[r][Math.floor(c / 5)];
      if (it && c % 5 === 0) return xsMerge(XS.cell, { fill: { fgColor: { rgb: hexRgb(itemLight(it)) } } });
      return xsMerge(XS.cell, { alignment: { horizontal: c % 5 === 3 ? 'left' : 'center', vertical: 'center' } });
    } }], `${advName()}TV_${WS.ym.replace('-', '')}_큐시트캘린더.xlsx`);
}
