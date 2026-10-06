// ===== 18-cal.js : 큐시트 캘린더 — Q-Mate의 달력형 큐시트 (월~일 7칸 × 주 단위, 날짜 칸마다 그날 나간 광고) =====
// 한 줄 = 시작 시간 · 채널 · 초수 · 프로그램 · CM 위치 (품목은 왼쪽 색 띠) — 채널로 묶지 않고 광고 시작 시간 순. 같은 날 같은 송출이 여러 번이면 ×N
// 이번 달이면 오늘 칸을 강조하고, 오늘 칸 안에 '지금' 줄(지금 방송 중인 광고는 강조)을 1분마다 옮김
const CAL_WD = ['월', '화', '수', '목', '금', '토', '일'];
function calUI() { if (!UI.cal) UI.cal = { media: 'all', ch: null, item: null }; return UI.cal; }
function calNow() { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), min: d.getHours() * 60 + d.getMinutes(), hm: `${pad2(d.getHours())}:${pad2(d.getMinutes())}` }; }
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
    if (x) x.n += s.cnt || 1; else by[s.day].set(k, { ch: s.ch, media: s.media, st: s.start, en: s.end, sec: s.sec, prog: s.prog, cm, cmCls: s.cmCls, item: s.item, itemRaw: s.itemRaw, n: s.cnt || 1 });
  }
  // 광고 노출 시작 시간 순 (같은 시간이면 지상파 → 채널 순)
  const sortE = l => l.sort((a, b) => timeToMin(a.st) - timeToMin(b.st) || (a.media === b.media ? 0 : a.media === '지상파' ? -1 : 1) || chOrd(a.ch) - chOrd(b.ch));
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
  const now = calNow(), isNowMonth = now.y === M.ym.y && now.m === M.ym.m;
  const help = `${ymLabel()} · 날짜 칸마다 그날 나간 광고를 <b>시작 시간 순</b>으로 — 시간 · 채널 · 초수 · 프로그램 · CM 위치 (왼쪽 색 = 품목). 프로그램 이름이 길면 줄여 보여요 — 마우스를 올리면 전체 이름, 엑셀에는 전체 이름이 들어가요.${isNowMonth ? `<br><span class="calnowlg">오늘 ${now.m}/${now.d} · 지금 ${now.hm}</span> — 오늘 칸에 '지금' 줄이 있고, 지금 방송 중인 광고는 강조돼요.` : ''}`;
  root.innerHTML = `<section class="card cafilter"><div class="bd">
      ${segHtml('calmedia', [['all', '전체'], ['지상파', '지상파'], ['케이블', '케이블']], f.media)}
      ${mselHtml('calch', '채널', chOpts, f.ch)}
      ${mselHtml('calit', '품목', itOpts, f.item)}
      ${f.ch || f.item || f.media !== 'all' ? '<button class="btn sm ghost" id="cal-reset">필터 해제</button>' : ''}
      <div class="spacer"></div>${isNowMonth ? '<button class="btn sm" id="cal-today">오늘로</button>' : ''}${xlBtn('cal', '캘린더 엑셀')}<span class="helpw"><button class="helpq" id="cal-help" aria-label="캘린더 보는 법" title="캘린더 보는 법">?</button><div class="helppop" hidden>${help}</div></span>
    </div></section>
    <div class="castat"><span>방송사 <b class="tnum">${new Set(rows.map(s => s.ch)).size}</b>개</span><span>횟수 <b class="tnum">${fmt.int(n)}</b>회</span><span>단가 합 <b class="tnum">${fmt.eok(amt, 2)}</b></span>${d0 ? `<span>기간 <b>${M.ym.m}/${d0}~${M.ym.m}/${d1}</b></span>` : ''}<span class="muted">중CM ${fmt.pct(n ? cmN('중CM') / n : 0)} · PIB ${fmt.pct(n ? cmN('PIB') / n : 0)} · 전후CM 등 ${fmt.pct(n ? 1 - (cmN('중CM') + cmN('PIB')) / n : 0)}</span>
      <div class="spacer"></div><span class="qmlegend">${shownItems.map(k => `<span><i style="background:${itemColor(k)}"></i>${esc(k)}</span>`).join('')}</span></div>
    <section class="card calcard"><div class="calw"><table class="calt"><colgroup>${CAL_WD.map(() => '<col>').join('')}</colgroup><thead><tr>${CAL_WD.map((w, i) => `<th class="${i >= 5 ? 'we' : ''}">${w}</th>`).join('')}</tr></thead><tbody>
    ${weeks.map(wk => `<tr>${wk.map((c, i) => {
      if (!c) return '<td class="off"></td>';
      const today = isNowMonth && c.d === now.d;
      const cls = (i === 5 ? 'sat' : i === 6 ? 'sun' : '') + (today ? ' today' : '');
      let nowDone = !today;
      const line = e => {
        const it = M.MS.items.get(e.item); const col = it ? it.color : '#b9c2cb';
        const a = timeToMin(e.st), b = e.en ? timeToMin(e.en) : a + 60; const onair = today && a <= now.min && now.min < (b > a ? b : a + 60);
        let pre = '';
        if (!nowDone && a > now.min) { nowDone = true; pre = `<div class="calnow" data-now><span>지금 ${now.hm}</span></div>`; }
        // 한 줄: 시간 · 채널 · 초수 · 프로그램(길면 …) · ×N · CM — 마우스를 올리면 전체
        return pre + `<div class="cale one${e.cmCls === '중CM' ? ' mid' : ''}${onair ? ' onair' : ''}" style="--b:${col}" title="${esc(`${e.st}${e.en ? '~' + e.en : ''} · ${e.ch} · ${e.sec || ''}초 · ${e.prog} · ${e.cm || ''} · ${e.item || e.itemRaw || ''}${e.n > 1 ? ` · ${e.n}회` : ''}${onair ? ' · 지금 방송 중' : ''}`)}"><span class="t tnum">${esc(e.st)}</span><span class="c">${esc(e.ch)}</span><span class="s tnum">${e.sec ? e.sec + '″' : ''}</span><span class="p">${progHtml(e.prog)}</span>${e.n > 1 ? `<span class="x">×${e.n}</span>` : ''}${e.cm ? `<span class="m">${esc(e.cm)}</span>` : ''}</div>`;
      };
      const body = c.list.map(line).join('') + (nowDone ? '' : `<div class="calnow" data-now><span>지금 ${now.hm}</span></div>`);
      return `<td class="${cls.trim()}"${today ? ' id="cal-td-today"' : ''}><div class="cald"><b>${c.d}</b>${today ? '<em>오늘</em>' : ''}<span class="tnum">${c.n ? fmt.int(c.n) + '회' : ''}</span></div>${body}</td>`;
    }).join('')}</tr>`).join('')}
    </tbody></table></div></section>`;
  const re = () => { const y = window.scrollY; renderCal(root); window.scrollTo(0, y); };
  bindSeg(root, 'calmedia', v => { f.media = v; re(); });
  // 오늘이 있는 주(행)가 고정된 요일 머리글 바로 아래에 오도록
  const goToday = smooth => { const td = root.querySelector('#cal-td-today'); if (!td) return; const shellH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--shellh'), 10) || 100; const th = root.querySelector('table.calt thead'); const top = td.closest('tr').getBoundingClientRect().top + window.scrollY - shellH - (th ? th.offsetHeight : 30) - 6; window.scrollTo({ top: Math.max(0, top), behavior: smooth && !reduceMotion() ? 'smooth' : 'auto' }); };
  const tb = root.querySelector('#cal-today'); if (tb) tb.onclick = () => goToday(true);
  // 캘린더를 열 때마다(사이트를 처음 열 때 포함) 오늘이 있는 주로 · 필터를 바꿀 때는 그 자리 그대로
  if (isNowMonth && f.jump !== false) { f.jump = false; requestAnimationFrame(() => requestAnimationFrame(() => goToday(false))); }
  const hq = root.querySelector('#cal-help'), hp = hq && hq.nextElementSibling;
  if (hq) { hq.onclick = e => { e.stopPropagation(); hp.hidden = !hp.hidden; if (!hp.hidden) { const off = ev => { if (!hp.contains(ev.target)) { hp.hidden = true; document.removeEventListener('click', off); } }; setTimeout(() => document.addEventListener('click', off), 0); } }; }
  clearInterval(renderCal.t);
  if (isNowMonth) renderCal.t = setInterval(() => { if (App.tab !== 'cal' || !root.isConnected || root.hidden) return clearInterval(renderCal.t); if (calNow().hm !== now.hm) re(); }, 20000);
  bindMsel(root, 'calch', chOpts, f.ch, v => { f.ch = v; re(); });
  bindMsel(root, 'calit', itOpts, f.item, v => { f.item = v; re(); });
  const rs = root.querySelector('#cal-reset'); if (rs) rs.onclick = () => { Object.assign(f, { media: 'all', ch: null, item: null }); re(); };
  root.querySelector('[data-xl="cal"]').onclick = () => exportCal(weeks);
}
// 엑셀: 요일 머리글(5칸씩 병합) → 주마다 날짜 줄(병합) + 송출 줄(채널 · 시간 · 초수 · 프로그램 · CM)
function exportCal(weeks) { xrDownload([xrCalSheet(weeks)], null, xrName('큐시트캘린더')); }
