// ===== 15-ui.js : 공통 화면 부품 — 가로 넘김 단추 · 여러 개 고르기 · 기간 달력 · 끌어서 순서 바꾸기 =====

// ---------- 가로 넘김 단추 (스크롤바 대신 양옆 ‹ › · 디지털 미디어 대시보드 서머리와 같은 방식) ----------
// card = 단추를 얹을 상자(position:relative), wrap = 옆으로 넘치는 상자. 한 번에 보이는 폭의 85%쯤, 블록 경계에 맞춰 멈춤
function hpager(card, wrap, o) {
  if (!card || !wrap) return;
  o = o || {};
  card.classList.add('hpcard'); wrap.classList.add('hpwrap');
  card.querySelectorAll(':scope>.hpbtn').forEach(b => b.remove());
  const mk = (cls, dir, lab) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'hpbtn ' + cls; b.title = lab; b.setAttribute('aria-label', lab);
    b.innerHTML = `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="${dir < 0 ? 'M12.5 4.5 7 10l5.5 5.5' : 'M7.5 4.5 13 10l-5.5 5.5'}" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    b.onclick = e => { e.stopPropagation(); hpGo(wrap, dir, o); };
    card.appendChild(b); return b;
  };
  const L = mk('l', -1, '이전'), R = mk('r', 1, '다음');
  const paint = () => {
    if (!card.isConnected) return false;
    const max = wrap.scrollWidth - wrap.clientWidth, over = max > 2 && wrap.offsetParent;
    L.classList.toggle('on', !!over && wrap.scrollLeft > 8);
    R.classList.toggle('on', !!over && wrap.scrollLeft < max - 8);
    if (!over) return true;
    const cr = card.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
    const top = (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--shellh'), 10) || 100) + 30;
    const vt = Math.max(wr.top, top), vb = Math.min(wr.bottom, innerHeight - 10);
    const y = vb > vt ? (vt + vb) / 2 - cr.top : (wr.top + wr.bottom) / 2 - cr.top;
    L.style.top = R.style.top = Math.round(y) + 'px';
    L.style.left = Math.round(wr.left - cr.left + 10 + (o.leftPad ? o.leftPad() : 0)) + 'px';   // 왼쪽 고정 열이 있으면 그 오른쪽에
    R.style.right = Math.round(cr.right - wr.right + 10) + 'px';
    return true;
  };
  wrap.__hp = paint;
  if (!wrap.__hpb) {
    wrap.__hpb = 1;
    wrap.addEventListener('scroll', () => { cancelAnimationFrame(wrap.__raf); wrap.__raf = requestAnimationFrame(() => wrap.__hp && wrap.__hp()); }, { passive: true });
    try { new ResizeObserver(() => wrap.__hp && wrap.__hp()).observe(wrap); } catch (e) { }
  }
  if (!window.__hpList) {
    window.__hpList = [];
    let raf = 0; const q = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { window.__hpList = window.__hpList.filter(f => f()); }); };
    addEventListener('scroll', q, { passive: true }); addEventListener('resize', q);
  }
  window.__hpList = window.__hpList.filter(f => f.__card !== card && (!f.__card || f.__card.isConnected));
  paint.__card = card; window.__hpList.push(paint);
  setTimeout(paint, 0); setTimeout(paint, 300);
  return { paint, go: d => hpGo(wrap, d, o) };
}
function hpGo(wrap, dir, o) {
  const view = wrap.clientWidth, max = wrap.scrollWidth - wrap.clientWidth, cur = wrap.scrollLeft, step = Math.max(160, view * 0.85);
  const pad = (o && o.pad) || 0;
  // 멈출 자리: o.snap()이 주면 그 위치들(예: 큐시트 주차 열), 아니면 안쪽 블록 시작 위치
  const starts = o && o.snap ? o.snap().filter(x => x >= 0) : [...wrap.children].filter(el => el.offsetWidth).map(el => el.offsetLeft - wrap.firstElementChild.offsetLeft - pad).filter(x => x >= 0);
  let to = dir > 0 ? cur + step : cur - step;
  if (dir > 0) { const c = starts.filter(x => x > cur + 8 && x <= to); if (c.length) to = c[c.length - 1]; }
  else { const c = starts.filter(x => x >= to && x < cur - 8); if (c.length) to = c[0]; }
  wrap.scrollTo({ left: Math.max(0, Math.min(max, to)), behavior: reduceMotion() ? 'auto' : 'smooth' });
}

// 엑셀 열 이름 (0 → A, 25 → Z, 26 → AA)
function xlCol(n) { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

// ---------- 여러 개 고르기 (구분·방송사·품목 필터) ----------
// opts: [{v, t, color?, sub?}] · cur: Set(고른 값) 또는 null(=전체)
function mselHtml(id, label, opts, cur) {
  const all = !cur || cur.size === 0 || cur.size >= opts.length;
  const picked = all ? [] : opts.filter(o => cur.has(o.v));
  const tags = all ? '<span class="mtag all">전체</span>' : picked.slice(0, 3).map(o => `<span class="mtag">${o.color ? `<i style="background:${o.color}"></i>` : ''}${esc(o.t)}</span>`).join('') + (picked.length > 3 ? `<span class="mtag more">+${picked.length - 3}</span>` : '');
  return `<div class="msel" data-msel="${esc(id)}"><span class="ml">${esc(label)}</span><button type="button" class="mbtn${all ? '' : ' on'}">${tags}<span class="car">▾</span></button></div>`;
}
function bindMsel(root, id, opts, cur, onChange) {
  const box = root.querySelector(`[data-msel="${CSS.escape(id)}"]`); if (!box) return;
  box.querySelector('.mbtn').onclick = e => {
    e.stopPropagation();
    closePops();
    let sel = new Set(!cur || !cur.size ? opts.map(o => o.v) : [...cur]);
    const pop = document.createElement('div'); pop.className = 'pop mpop';
    const draw = q => {
      const list = opts.filter(o => !q || norm(o.t).includes(norm(q)) || norm(o.sub || '').includes(norm(q)));
      const allOn = sel.size === opts.length;
      pop.querySelector('.mlist').innerHTML = `<label class="mrow all"><input type="checkbox" data-all ${allOn ? 'checked' : ''}><span>전체</span><small>${opts.length}</small></label>` +
        list.map(o => `<label class="mrow"><input type="checkbox" data-v="${esc(o.v)}" ${sel.has(o.v) ? 'checked' : ''}>${o.color ? `<i style="background:${o.color}"></i>` : ''}<span>${esc(o.t)}</span>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</label>`).join('');
    };
    pop.innerHTML = `${opts.length > 8 ? '<input class="mq" placeholder="검색">' : ''}<div class="mlist"></div><div class="mft"><button type="button" class="btn sm ghost" data-only>모두 해제</button><div class="spacer"></div><button type="button" class="btn sm pri" data-ok>적용</button></div>`;
    document.body.appendChild(pop); placePop(pop, box.querySelector('.mbtn'));
    draw('');
    const q = pop.querySelector('.mq'); if (q) { q.oninput = () => draw(q.value); setTimeout(() => q.focus(), 20); }
    pop.addEventListener('change', ev => {
      const t = ev.target;
      if (t.dataset.all != null) { sel = t.checked ? new Set(opts.map(o => o.v)) : new Set(); draw(q ? q.value : ''); return; }
      if (t.dataset.v != null) { if (t.checked) sel.add(t.dataset.v); else sel.delete(t.dataset.v); const a = pop.querySelector('[data-all]'); if (a) a.checked = sel.size === opts.length; }
    });
    pop.querySelector('[data-only]').onclick = () => { sel = new Set(); draw(q ? q.value : ''); };
    pop.querySelector('[data-ok]').onclick = () => { closePops(); onChange(sel.size === 0 || sel.size === opts.length ? null : sel); };
    pop.addEventListener('keydown', ev => { if (ev.key === 'Enter' && !ev.isComposing) pop.querySelector('[data-ok]').click(); });
  };
}
function closePops() { document.querySelectorAll('.pop').forEach(p => { if (p.__close) p.__close(); p.remove(); }); }
function placePop(pop, anchor) {
  pop.__anchor = anchor;
  const r = anchor.getBoundingClientRect();
  pop.style.position = 'fixed'; pop.style.zIndex = 80;
  pop.style.top = Math.round(r.bottom + 4) + 'px';
  const w = pop.offsetWidth || 260;
  pop.style.left = Math.round(Math.max(8, Math.min(r.left, innerWidth - w - 12))) + 'px';
  const h = pop.offsetHeight; if (r.bottom + 4 + h > innerHeight - 8 && r.top - h - 4 > 8) pop.style.top = Math.round(r.top - h - 4) + 'px';
}
if (typeof window !== 'undefined') {
  document.addEventListener('mousedown', e => { if (!e.target.closest('.pop')) closePops(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.querySelector('.pop')) { closePops(); e.stopPropagation(); } }, true);
  // 스크롤하면 닫지 않고 기준 단추를 따라 자리만 옮김 (단추가 화면 밖으로 나가면 닫음)
  window.addEventListener('scroll', () => { document.querySelectorAll('.pop').forEach(p => { const a = p.__anchor; if (!a || !a.isConnected) return; const r = a.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) { if (p.__close) p.__close(); p.remove(); } else placePop(p, a); }); }, { passive: true, capture: true });
}

// ---------- 기간 달력 (시작일 → 종료일 차례로 누름) ----------
// '10/1~10/31', '10.1-10.15', '2026-10-01~2026-10-31' → { a:{y,m,d}, b:{y,m,d} }
function parsePeriod(s, ym) {
  const t = String(s || '').trim(); if (!t) return null;
  const parts = t.split(/\s*[~∼〜–—]\s*|\s+-\s+|(?<=\d)-(?=\d{1,2}[./])/).filter(Boolean);
  const one = (x, base) => {
    let m = String(x).match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/); if (m) return { y: +m[1], m: +m[2], d: +m[3] };
    m = String(x).match(/(\d{1,2})\s*[./월]\s*(\d{1,2})/); if (m) return { y: base ? base.y : (ym ? ym.y : new Date().getFullYear()), m: +m[1], d: +m[2] };
    m = String(x).match(/^(\d{1,2})일?$/); if (m && base) return { y: base.y, m: base.m, d: +m[1] };
    return null;
  };
  const a = one(parts[0]); if (!a) return null;
  const b = parts[1] ? one(parts[1], a) : a;
  return b ? { a, b } : { a, b: a };
}
function periodTxt(a, b) { return !a ? '' : (b && (a.m !== b.m || a.d !== b.d || a.y !== b.y)) ? `${a.m}/${a.d}~${b.m}/${b.d}` : `${a.m}/${a.d}~${a.m}/${a.d}`; }
const dKey = d => d ? d.y * 10000 + d.m * 100 + d.d : 0;
// anchor 아래에 달력을 띄움. o: { ym:{y,m}, a, b, onPick(a,b), title }
function openRangeCal(anchor, o) {
  closePops();
  let view = { y: (o.a || o.ym).y, m: (o.a || o.ym).m };
  let a = o.a || null, b = o.b || null, hov = null, picking = false;
  const pop = document.createElement('div'); pop.className = 'pop calpop';
  const range = () => { const lo = a, hi = b || (picking && hov ? hov : a); if (!lo) return [0, 0]; return [Math.min(dKey(lo), dKey(hi || lo)), Math.max(dKey(lo), dKey(hi || lo))]; };
  const kOf = d => view.y * 10000 + view.m * 100 + d;
  // 날짜 칸은 달이 바뀔 때만 새로 그리고, 고르는 중(마우스 이동)에는 색만 바꿈
  const paint = () => {
    const [L, H] = range();
    pop.querySelectorAll('.calgrid [data-d]').forEach(c => { const k = kOf(+c.dataset.d); c.classList.toggle('in', !!L && k >= L && k <= H); c.classList.toggle('a', k === L); c.classList.toggle('b', k === H); });
    const lo = L ? { y: Math.floor(L / 10000), m: Math.floor(L / 100) % 100, d: L % 100 } : null, hi = H ? { y: Math.floor(H / 10000), m: Math.floor(H / 100) % 100, d: H % 100 } : null;
    pop.querySelector('.calst').innerHTML = picking ? '<b>종료일</b>을 누르세요' : lo ? `<b>${periodTxt(lo, hi)}</b>` : '<b>시작일</b>을 누르세요';
  };
  const draw = () => {
    const first = new Date(view.y, view.m - 1, 1).getDay(), n = daysInMonth(view.y, view.m);
    let cells = '';
    for (let i = 0; i < first; i++) cells += '<span class="cd x"></span>';
    for (let d = 1; d <= n; d++) { const wd = (first + d - 1) % 7; cells += `<button type="button" class="cd${wd === 0 ? ' sun' : wd === 6 ? ' sat' : ''}" data-d="${d}">${d}</button>`; }
    pop.innerHTML = `<div class="calhd"><button type="button" class="cnav" data-nav="-1">‹</button><b>${view.y}년 ${view.m}월</b><button type="button" class="cnav" data-nav="1">›</button></div>
      <div class="calwk">${'일월화수목금토'.split('').map((w, i) => `<span class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</span>`).join('')}</div>
      <div class="calgrid">${cells}</div>
      <div class="calft"><span class="calst"></span><div class="spacer"></div>
        <button type="button" class="btn sm ghost" data-q="month">${o.ym.m}월 전체</button>${o.clear !== false ? '<button type="button" class="btn sm ghost" data-q="clear">지우기</button>' : ''}</div>`;
    paint();
  };
  draw();
  document.body.appendChild(pop); placePop(pop, anchor);
  pop.addEventListener('mousedown', e => e.preventDefault());
  pop.addEventListener('mouseover', e => { const c = e.target.closest('[data-d]'); if (c && picking) { const d = { y: view.y, m: view.m, d: +c.dataset.d }; if (!hov || dKey(hov) !== dKey(d)) { hov = d; paint(); } } });
  pop.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]'); if (nav) { const m = view.m + +nav.dataset.nav; view = m < 1 ? { y: view.y - 1, m: 12 } : m > 12 ? { y: view.y + 1, m: 1 } : { y: view.y, m }; draw(); return; }
    const q = e.target.closest('[data-q]');
    if (q) {
      if (q.dataset.q === 'month') { const s = { y: o.ym.y, m: o.ym.m, d: 1 }, t = { y: o.ym.y, m: o.ym.m, d: daysInMonth(o.ym.y, o.ym.m) }; closePops(); o.onPick(s, t); }
      else { closePops(); o.onPick(null, null); }
      return;
    }
    const c = e.target.closest('[data-d]'); if (!c) return;
    const d = { y: view.y, m: view.m, d: +c.dataset.d };
    if (!picking) { a = d; b = null; picking = true; hov = d; paint(); return; }
    b = d; picking = false;
    const lo = dKey(a) <= dKey(b) ? a : b, hi = dKey(a) <= dKey(b) ? b : a;
    a = lo; b = hi; paint(); setTimeout(() => { closePops(); o.onPick(lo, hi); }, 120);
  });
  return pop;
}

// ---------- 끌어서 순서 바꾸기 (마스터 표 ⋮⋮) ----------
// tbody 안 tr[data-i] 를 손잡이(td.dh)로 끌어 옮김. 놓으면 onDone(새 순서의 data-i 배열). same(a,b): 함께 섞일 수 있는 행인지(예: 같은 매체)
function dragRows(tbody, onDone, same) {
  if (!tbody || tbody.__drag) return; tbody.__drag = 1;
  let drag = null, moved = false;
  tbody.addEventListener('mousedown', e => { const h = e.target.closest('td.dh'); if (h) h.parentElement.draggable = true; });
  tbody.addEventListener('mouseup', () => tbody.querySelectorAll('tr[draggable]').forEach(t => t.removeAttribute('draggable')));
  tbody.addEventListener('dragstart', e => {
    drag = e.target.closest('tr[data-i]'); if (!drag) return; moved = false;
    drag.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', drag.dataset.i); } catch (x) { }
  });
  tbody.addEventListener('dragover', e => {
    if (!drag) return; e.preventDefault();
    const tr = e.target.closest('tr[data-i]'); if (!tr || tr === drag) return;
    if (same && !same(drag, tr)) return;
    const rc = tr.getBoundingClientRect(); const after = e.clientY > rc.top + rc.height / 2;
    const ref = after ? tr.nextSibling : tr; if (ref !== drag && ref !== drag.nextSibling) { tbody.insertBefore(drag, ref); moved = true; }
  });
  tbody.addEventListener('drop', e => e.preventDefault());
  tbody.addEventListener('dragend', () => {
    tbody.querySelectorAll('tr[draggable]').forEach(t => t.removeAttribute('draggable'));
    if (!drag) return; drag.classList.remove('dragging'); drag = null;
    if (moved) onDone([...tbody.querySelectorAll('tr[data-i]')].map(t => +t.dataset.i));
  });
}
// 배열을 새 순서로 (order = 원래 번호들; 표에 없는 행은 제자리)
function reorderBy(rows, order) {
  const pos = order.slice().sort((x, y) => x - y);
  const next = rows.slice(); pos.forEach((p, k) => { next[p] = rows[order[k]]; });
  rows.splice(0, rows.length, ...next);
}

// ---------- 긴 병합 칸의 글자를 화면에 보이게 (지상파 큐시트 '정기물' 등) ----------
// 원래는 병합 칸 높이의 가운데. 칸이 화면보다 길면 '지금 보이는 부분'의 가운데로 따라 움직임 (표 안 스크롤·페이지 스크롤 모두)
// 큐시트 표 가로 이동: 스크롤바 대신 ‹ › 둥근 단추(미디어 대시보드와 같은 방식) · 왼쪽 열(구분·프로그램)은 고정, 주차 열 단위로 멈춤
function cueHpager(root) {
  root.querySelectorAll('table.cue.qm').forEach(tb => {
    const wrap = tb.closest('.tw'), card = wrap && wrap.closest('.card'); if (!wrap || !card) return;
    const fix = [...tb.querySelectorAll('thead th.fx')];
    let x = 0; fix.forEach(th => { th.style.left = x + 'px'; x += th.offsetWidth; });
    tb.style.setProperty('--fx', x + 'px');
    // 고정 열의 왼쪽 위치를 몸통 칸에도 (표 첫 줄 기준)
    const L = fix.map(th => th.style.left);
    tb.querySelectorAll('tbody td.fx').forEach(td => { const k = +td.dataset.fx; if (L[k] != null) td.style.left = L[k]; });
    hpager(card, wrap, { snap: () => [...tb.querySelectorAll('thead th.wkh')].map(th => th.offsetLeft - x), leftPad: () => x });
    // 고정 열 오른쪽 그림자는 옆으로 넘겼을 때만 (처음엔 요일 열 왼쪽에 그림자가 보이지 않게)
    const upd = () => tb.classList.toggle('hscrolled', wrap.scrollLeft > 2);
    wrap.addEventListener('scroll', upd, { passive: true }); upd();
  });
}
function keepMergedVisible(root) {
  const cells = [...root.querySelectorAll('td.kind')]; if (!cells.length) return;
  const paint = () => {
    if (!root.isConnected) return false;
    const shellB = (document.getElementById('shell') || { getBoundingClientRect: () => ({ bottom: 0 }) }).getBoundingClientRect().bottom;
    for (const td of cells) {
      const lab = td.firstElementChild; if (!lab) continue;
      const r = td.getBoundingClientRect(); if (!r.height) continue;
      const sc = td.closest('.tw'); const sr = sc ? sc.getBoundingClientRect() : { top: -1e9, bottom: 1e9 };
      const head = td.closest('table').tHead; const hb = head ? head.getBoundingClientRect().bottom : 0;
      const vt = Math.max(r.top, sr.top, hb, shellB), vb = Math.min(r.bottom, sr.bottom, innerHeight);
      const h = lab.offsetHeight || 16;
      let y = vb - vt > h ? (vt + vb) / 2 - r.top - h / 2 : (r.height - h) / 2;
      y = Math.max(4, Math.min(r.height - h - 4, y));
      lab.style.transform = `translateY(${Math.round(y)}px)`;
    }
    return true;
  };
  let raf = 0; const q = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (!paint()) { removeEventListener('scroll', q, true); removeEventListener('resize', q); } }); };
  addEventListener('scroll', q, { passive: true, capture: true }); addEventListener('resize', q);
  setTimeout(paint, 0); setTimeout(paint, 300);
}
// ---------- 표 열 너비: 내용 길이에 맞춘 기본 너비 + 머리글 경계를 끌어서 조절 (13차 · 마스터) ----------
// opts.flex = 남는 너비를 받을 열 번호(비고·별칭) · 끌어서 바꾼 너비는 이 브라우저에만 기억 (경계를 두 번 누르면 기본 너비로)
const COLW = {};
function colwLoad(key) { if (COLW[key]) return COLW[key]; let o = {}; try { o = JSON.parse(localStorage.getItem('colw:' + key) || '{}') || {}; } catch (e) { } return (COLW[key] = o); }
function colwSave(key) { try { localStorage.setItem('colw:' + key, JSON.stringify(COLW[key] || {})); } catch (e) { } }
function colFit(table, key, opts = {}) {
  const ths = [...table.querySelectorAll('thead tr:first-child th')]; const n = ths.length; if (!n) return;
  const rows = [...table.querySelectorAll('tbody tr')].filter(tr => tr.children.length === n);
  // 글자 너비는 실제 글꼴로 재기 (캔버스는 웹 글꼴이 안 잡힐 때가 있어 한글이 좁게 나옴)
  const sp = colFit.sp || (colFit.sp = Object.assign(document.createElement('span'), { style: 'position:absolute;left:-9999px;top:0;white-space:pre;visibility:hidden' }));
  if (!sp.isConnected) document.body.appendChild(sp);
  const fontOf = el => { const s = getComputedStyle(el); return `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`; };
  const hf = fontOf(ths[0]); const inp0 = table.querySelector('td.in input:not([type=color]),td.in select'); const cf = fontOf(inp0 || rows[0] && rows[0].children[0] || table);
  const mw = (t, f) => { sp.style.font = f; sp.textContent = String(t || ''); return sp.offsetWidth; };
  // 입력 칸 글자는 입력 칸 자체로 잼 (입력 칸은 글꼴 대체가 달라 span보다 넓게 그려질 때가 있음)
  const ip = colFit.ip || (colFit.ip = Object.assign(document.createElement('input'), { tabIndex: -1, style: 'position:absolute;left:-9999px;top:0;width:1px;padding:0;border:0;visibility:hidden' }));
  if (!ip.isConnected) document.body.appendChild(ip);
  const iw = (t, f) => { ip.style.font = f; ip.value = String(t || ''); return Math.max(ip.scrollWidth, mw(t, f)); };
  const want = ths.map((th, j) => {
    let w = mw(th.textContent.trim(), hf) + 24;
    for (const tr of rows) {
      const td = tr.children[j];
      if (td.querySelector('input[type=color]')) { w = Math.max(w, 58); continue; }
      const el = td.querySelector('input,select');
      if (el) { const t = el.tagName === 'SELECT' ? (el.selectedOptions[0] || {}).text : (el.value || el.placeholder); w = Math.max(w, iw(t, cf) + (el.tagName === 'SELECT' ? 50 : el.getAttribute('list') ? 56 : 36)); }   // 목록(datalist) 입력 칸은 오른쪽 ▾ 자리
      else w = Math.max(w, mw(td.textContent.trim(), cf) + 22);
    }
    return Math.max(34, Math.min(opts.max || 320, Math.ceil(w)));
  });
  const saved = colwLoad(key); const flex = opts.flex == null ? -1 : opts.flex;
  const W = want.map((w, j) => saved[j] || w);
  const host = table.parentElement;
  let colg = table.querySelector('colgroup'); if (colg) colg.remove();
  colg = document.createElement('colgroup'); colg.innerHTML = W.map(() => '<col>').join(''); table.insertBefore(colg, table.firstChild);
  const cols = [...colg.children];
  const apply = () => {
    if (flex >= 0) { const others = W.reduce((a, w, j) => j === flex ? a : a + w, 0); W[flex] = Math.max(saved[flex] || want[flex], (host.clientWidth || 0) - others - 2); }
    cols.forEach((c, j) => c.style.width = W[j] + 'px');
    table.style.width = W.reduce((a, w) => a + w, 0) + 'px';
  };
  table.classList.add('colfit'); table.style.tableLayout = 'fixed'; apply();
  ths.forEach((th, j) => {
    if (j === n - 1 && flex !== j) return;
    const h = document.createElement('span'); h.className = 'colrs'; h.title = '끌어서 열 너비 조절 · 두 번 누르면 기본 너비'; th.appendChild(h);
    h.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation(); const x0 = e.clientX, w0 = W[j]; document.body.classList.add('colresizing'); h.classList.add('on');
      const mv = ev => { W[j] = Math.max(34, Math.round(w0 + ev.clientX - x0)); saved[j] = W[j]; apply(); };
      const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); document.body.classList.remove('colresizing'); h.classList.remove('on'); colwSave(key); };
      addEventListener('mousemove', mv); addEventListener('mouseup', up);
    });
    h.addEventListener('dblclick', e => { e.stopPropagation(); delete saved[j]; W[j] = want[j]; colwSave(key); apply(); });
  });
  if (table._ro) table._ro.disconnect();
  if (flex >= 0 && typeof ResizeObserver !== 'undefined') { let lw = host.clientWidth; table._ro = new ResizeObserver(() => { if (!table.isConnected) return table._ro.disconnect(); if (Math.abs(host.clientWidth - lw) > 1) { lw = host.clientWidth; apply(); } }); table._ro.observe(host); }
}

// 15차: 두 줄 머리글 표 — 둘째 줄 sticky top을 첫 줄 실제 높이로 (고정 31px이면 줄 높이가 다를 때 머리글 사이가 벌어져 세로선에 단차가 생김)
function syncStickyHeads(root) {
  if (!root) return;
  root.querySelectorAll('table.t > thead').forEach(th => {
    const rows = [...th.rows]; if (rows.length < 2) return;
    let top = 0;
    rows.forEach((tr, i) => { const h = tr.getBoundingClientRect().height; if (i && h) for (const c of tr.cells) c.style.top = top + 'px'; top += h; });
  });
}
