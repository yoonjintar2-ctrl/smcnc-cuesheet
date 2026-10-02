// ===== 06-xgrid.js : 엑셀형 입력 표 (직접 구현, 보이는 행만 그림) =====
// 기능: 범위 드래그 선택 · 행/열/전체 선택 · 행 숨기기/표시 · 행 삽입/삭제 · 복사/잘라내기/붙여넣기(엑셀 호환)
//       내용 지우기 · 되돌리기/다시 실행 · 찾기/바꾸기 · 머리글 필터(정렬+값 선택) · 채우기 핸들 · 우클릭 메뉴
//       열 너비 조절 · 한글 직접 입력 · 마스터 목록 자동완성
const XG = { RH: 26, HEAD: 52, SUMH: 20, RN: 50, SPARE: 30, MINROWS: 10000 };   // HEAD = 합계 줄(20) + 머리글(32) · 빈 행 포함 최소 1만 행(엑셀처럼 넉넉히)
let XG_SEQ = 1;

function xgTsv(block) {
  return block.map(r => r.map(v => { const s = v == null ? '' : String(v); return /[\t\n"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join('\t')).join('\r\n');
}
function xgParseTsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  const t = String(text || '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"' && cur === '') q = true;
    else if (ch === '\t') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  while (rows.length > 1 && rows[rows.length - 1].every(v => v === '')) rows.pop();
  return rows;
}
// 클립보드 → { text, html }. 엑셀은 보이는 글자(text/plain)와 HTML 표(text/html)를 함께 준다
function xgClip(e) {
  const cd = e.clipboardData || window.clipboardData; if (!cd) return { text: '', html: '' };
  let t = '', h = ''; try { t = cd.getData('text/plain') || cd.getData('text') || ''; } catch (x) { }
  try { h = cd.getData('text/html') || ''; } catch (x) { }
  if (!t.trim() && h) t = xgHtmlToTsv(h); // HTML 표만 있을 때 (웹 페이지·일부 프로그램)
  return { text: t, html: h };
}
function xgClipText(e) { return xgClip(e).text; }
// HTML 표 → 칸 글자(T)와 실제 숫자(N). 병합 칸은 왼쪽 위에만 값
function xgHtmlGrid(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html'); const tb = doc.querySelector('table'); if (!tb) return null;
  const T = [], N = [];
  [...tb.rows].forEach((tr, r) => {
    T[r] = T[r] || []; N[r] = N[r] || []; let c = 0;
    for (const td of tr.cells) {
      while (T[r][c] != null) c++;
      const rs = td.rowSpan || 1, cs = td.colSpan || 1;
      for (let i = 0; i < rs; i++) { T[r + i] = T[r + i] || []; N[r + i] = N[r + i] || []; for (let j = 0; j < cs; j++) { T[r + i][c + j] = i || j ? '' : td.textContent.replace(/\s+/g, ' ').trim(); N[r + i][c + j] = i || j ? null : xgRawNum(td); } }
      c += cs;
    }
  });
  return { T: T.map(r => Array.from(r, v => v == null ? '' : v)), N };
}
function xgHtmlToTsv(html) { try { const H = xgHtmlGrid(html); return H ? xgTsv(H.T) : ''; } catch (e) { return ''; } }
// 엑셀: <td x:num="1.7282142857142851">1.7</td> · 구글 시트: data-sheets-value='{"1":3,"3":1.728…}'
function xgRawNum(td) {
  const v = td.getAttribute('x:num');
  if (v) { const n = Number(v); return isFinite(n) ? n : null; }
  const g = td.getAttribute('data-sheets-value');
  if (g) { try { const o = JSON.parse(g); if (o && o[1] === 3 && typeof o[3] === 'number') return o[3]; } catch (e) { } }
  return null;
}
// 화면 서식 때문에 반올림돼 복사된 숫자(A.R 1.7 ← 1.728…)를 셀의 실제 값으로 되돌림.
// 보이는 숫자와 반올림 오차 안에서 같을 때만 바꾼다(시간·날짜·글자·천 단위 축약 서식은 그대로).
function xgPrecise(B, html) {
  if (!html || !/x:num=|data-sheets-value/.test(html)) return B;
  let H = null; try { H = xgHtmlGrid(html); } catch (e) { } if (!H) return B;
  const T = H.T; while (T.length && T[T.length - 1].every(v => v === '')) T.pop();
  if (T.length !== B.length) return B; // 모양이 다르면 손대지 않음
  B.forEach((row, i) => row.forEach((v, j) => {
    const x = (H.N[i] || [])[j]; if (x == null) return;
    const s = String(v).replace(/\u00a0/g, ' ').trim();
    if (!s || /[가-힣a-z:/]/i.test(s.replace(/원/g, ''))) return;
    const d = num(s); if (d == null || d === x) return;
    const pct = s.includes('%'), dec = ((s.replace(/[^\d.]/g, '').split('.')[1]) || '').length;
    const tol = 0.5 * Math.pow(10, -dec) * (pct ? 0.01 : 1) + 1e-9 * Math.max(1, Math.abs(x));
    if (Math.abs(d - x) <= tol) row[j] = String(x);
  }));
  return B;
}
function xgCmp(a, b) {
  const ea = a === '' || a == null, eb = b === '' || b == null;
  if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
  const na = num(a), nb = num(b);
  if (na != null && nb != null && !/[가-힣a-z]/i.test(String(a) + String(b))) return na - nb;
  return String(a).localeCompare(String(b), 'ko', { numeric: true });
}

class XGrid {
  constructor(host, o) {
    this.o = o; this.host = host; this.cols = o.cols; this.nc = o.cols.length;
    this.widths = this.loadWidths();
    this.rows = []; this.hiddenIds = new Set(); this.filters = new Map(); this.view = [];
    this.undoS = []; this.redoS = [];
    this.act = { r: 0, c: 0 }; this.anchor = { r: 0, c: 0 }; this.sel = { r1: 0, c1: 0, r2: 0, c2: 0 };
    this.editing = null; this.copyR = null; this.findQ = null; this.hits = new Set();
    this.build();
    this.setRows(o.rows || [], o.hidden || []);
  }

  // ---------- 데이터 ----------
  blankRow() { return { id: XG_SEQ++, v: Array(this.nc).fill('') }; }
  isBlank(row) { return row.v.every(v => v === '' || v == null); }
  setRows(arrs, hiddenIdx) {
    this.rows = arrs.map(a => ({ id: XG_SEQ++, v: this.cols.map((_, j) => (a[j] == null ? '' : a[j])) }));
    this.hiddenIds = new Set((hiddenIdx || []).map(i => this.rows[i] && this.rows[i].id).filter(Boolean));
    this.undoS = []; this.redoS = []; this.copyR = null;
    this.ensureSpare(); this.recalcView(); this.clampSel(); this.render();
  }
  getRows() {
    let n = this.rows.length; while (n > 0 && this.isBlank(this.rows[n - 1])) n--;
    return this.rows.slice(0, n).map(r => r.v.slice());
  }
  getHidden() { const out = []; this.rows.forEach((r, i) => { if (this.hiddenIds.has(r.id)) out.push(i); }); return out; }
  ensureSpare() {
    let blank = 0; for (let i = this.rows.length - 1; i >= 0 && this.isBlank(this.rows[i]); i--) blank++;
    const need = Math.max(XG.SPARE - blank, XG.MINROWS - this.rows.length);
    for (let i = 0; i < need; i++) this.rows.push(this.blankRow());
  }
  idxOf(id) { return this.rows.findIndex(r => r.id === id); }
  recalcView() {
    const f = [...this.filters.entries()];
    this.view = []; this.gapBefore = new Set(); let hid = false;
    this.rows.forEach((r, i) => {
      if (this.hiddenIds.has(r.id)) { hid = true; return; }
      if (f.length && !this.isBlank(r)) for (const [c, set] of f) if (!set.has(this.fkey(r.v[c]))) return;
      if (hid) { this.gapBefore.add(i); hid = false; }
      this.view.push(i);
    });
    this.inner && (this.inner.style.height = (XG.HEAD + this.view.length * XG.RH + 8) + 'px');
  }
  fkey(v) { const s = v == null ? '' : String(v).trim(); return s === '' ? '(빈 칸)' : s; }
  rowAt(vr) { return this.rows[this.view[vr]]; }
  clampSel() {
    const mr = Math.max(0, this.view.length - 1), mc = this.nc - 1;
    const cl = (x, m) => Math.max(0, Math.min(m, x));
    this.act = { r: cl(this.act.r, mr), c: cl(this.act.c, mc) };
    this.anchor = { r: cl(this.anchor.r, mr), c: cl(this.anchor.c, mc) };
    this.sel = { r1: cl(this.sel.r1, mr), r2: cl(this.sel.r2, mr), c1: cl(this.sel.c1, mc), c2: cl(this.sel.c2, mc) };
  }

  // ---------- DOM ----------
  build() {
    const h = this.host; h.innerHTML = '';
    this.el = document.createElement('div'); this.el.className = 'xg';
    this.el.innerHTML = `<div class="xg-scroll"><div class="xg-inner"><div class="xg-head"></div><div class="xg-rows"></div>
      <div class="xg-copy"></div><div class="xg-selbox"></div><div class="xg-act"></div><div class="xg-fill"></div><button class="xg-dd" tabindex="-1">▾</button>
      <textarea class="xg-ed" spellcheck="false" autocomplete="off"></textarea></div></div>
      <div class="xg-find" hidden><div class="r"><input class="q" placeholder="찾을 내용"><span class="cnt"></span><button data-f="prev" title="이전 (Shift+Enter)">▲</button><button data-f="next" title="다음 (Enter)">▼</button><button data-f="x" title="닫기 (Esc)">✕</button></div>
      <div class="r rep"><input class="w" placeholder="바꿀 내용"><button data-f="one">바꾸기</button><button data-f="all">모두 바꾸기</button></div>
      <label class="opt"><input type="checkbox" class="oc"> 선택한 열에서만</label></div>
      <div class="xg-list" hidden></div>`;
    h.appendChild(this.el);
    const $ = s => this.el.querySelector(s);
    this.scroll = $('.xg-scroll'); this.inner = $('.xg-inner'); this.headEl = $('.xg-head'); this.rowsEl = $('.xg-rows');
    this.selEl = $('.xg-selbox'); this.actEl = $('.xg-act'); this.fillEl = $('.xg-fill'); this.copyEl = $('.xg-copy'); this.ddEl = $('.xg-dd');
    this.ed = $('.xg-ed'); this.findEl = $('.xg-find'); this.listEl = $('.xg-list');
    this.scroll.addEventListener('scroll', () => { if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = null; this.renderRows(); }); this.closeList(); });
    this.scroll.addEventListener('mousedown', e => this.onDown(e));
    this.scroll.addEventListener('dblclick', e => { const c = e.target.closest('.xg-c'); if (c) { this.startEdit('edit'); } });
    this.scroll.addEventListener('contextmenu', e => { e.preventDefault(); this.menu(e.clientX, e.clientY); });
    this.ed.addEventListener('keydown', e => this.onKey(e));
    this.ed.addEventListener('compositionstart', () => { this.composing = true; if (!this.editing) this.startEdit('enter', ''); });
    this.ed.addEventListener('compositionend', () => { this.composing = false; this.updateList(); });
    this.ed.addEventListener('input', () => { if (!this.editing && this.ed.value) this.startEdit('enter', null); if (this.editing) this.updateList(); });
    this.ed.addEventListener('copy', e => { if (this.editing) return; e.preventDefault(); e.clipboardData.setData('text/plain', this.copyText()); this.markCopy(); });
    this.ed.addEventListener('cut', e => { if (this.editing) return; e.preventDefault(); e.clipboardData.setData('text/plain', this.copyText()); this.clearSel('잘라내기'); });
    this.ed.addEventListener('paste', e => { if (this.editing) return; e.preventDefault(); const c = xgClip(e); this.paste(c.text, c.html); });
    this.ed.addEventListener('blur', () => setTimeout(() => { if (this.editing && document.activeElement !== this.ed && !this.composing) this.commit(); }, 0));
    this.ddEl.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); this.startEdit('edit'); this.updateList(true); });
    this.listEl.addEventListener('mousedown', e => { e.preventDefault(); const it = e.target.closest('[data-i]'); if (it) { this.listPick(+it.dataset.i); } });
    // 찾기
    const fq = this.findEl.querySelector('.q'), fw = this.findEl.querySelector('.w');
    fq.addEventListener('input', () => this.runFind(true));
    this.findEl.querySelector('.oc').addEventListener('change', () => this.runFind(true));
    this.findEl.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); this.closeFind(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (e.target === fw) this.replaceOne(); else this.findStep(e.shiftKey ? -1 : 1); }
      else if ((e.ctrlKey || e.metaKey) && /^[fh]$/i.test(e.key)) { e.preventDefault(); this.openFind(e.key.toLowerCase() === 'h'); }
    });
    this.findEl.addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; const f = b.dataset.f; if (f === 'next') this.findStep(1); if (f === 'prev') this.findStep(-1); if (f === 'x') this.closeFind(); if (f === 'one') this.replaceOne(); if (f === 'all') this.replaceAll(); });
    this.onDocMove = e => this.onMove(e); this.onDocUp = e => this.onUp(e);
  }
  setHeight(px) { this.scroll.style.height = Math.max(240, px) + 'px'; this.renderRows(); }
  focus() { try { this.ed.focus({ preventScroll: true }); } catch (e) { } }
  loadWidths() {
    let saved = null; try { saved = JSON.parse(localStorage.getItem('xgw:' + this.o.name) || 'null'); } catch (e) { }
    return this.cols.map((c, i) => (saved && saved[i]) || c.w);
  }
  saveWidths() { try { localStorage.setItem('xgw:' + this.o.name, JSON.stringify(this.widths)); } catch (e) { } }
  colLeft(c) { let x = 0; for (let i = 0; i < c; i++) x += this.widths[i]; return x; }
  totalW() { return XG.RN + this.widths.reduce((a, b) => a + b, 0); }
  colAt(x) { let acc = 0; for (let i = 0; i < this.nc; i++) { acc += this.widths[i]; if (x < acc) return i; } return this.nc - 1; }

  // ---------- 그리기 ----------
  render() { this.renderHead(); this.renderRows(); }
  // 보이는 행(필터·숨김 반영)의 합계 — 머리글 위 연한 줄에 표시
  sums() {
    const out = { n: 0, v: this.cols.map(() => 0) };
    const sc = this.cols.map((c, i) => c.sum ? i : -1).filter(i => i >= 0);
    const wIdx = this.cols.map(c => c.sumW ? this.cols.findIndex(x => x.k === c.sumW) : -1);
    for (const di of this.view) {
      const r = this.rows[di]; if (this.isBlank(r)) continue; out.n++;
      for (const i of sc) { const v = r.v[i]; if (typeof v !== 'number') continue; const w = wIdx[i] >= 0 ? (typeof r.v[wIdx[i]] === 'number' ? r.v[wIdx[i]] : 1) : 1; out.v[i] += v * w; }
    }
    return out;
  }
  renderHead() {
    const s = this.sel; const S = this.sums(); const filt = this.filters.size > 0;
    const sf = (c, v) => c.money ? (Math.abs(v) >= 1e8 ? (Math.round(v / 1e6) / 100).toLocaleString('ko-KR') + '억' : Math.round(v).toLocaleString('ko-KR')) : (Math.round(v * 100) / 100).toLocaleString('ko-KR');
    let h = `<div class="xg-sumrow${filt ? ' f' : ''}"><div class="xg-scorner" title="${filt ? '필터에 맞는' : '보이는'} 행 수">${S.n.toLocaleString('ko-KR')}행</div>`;
    this.cols.forEach((c, i) => {
      const v = S.v[i];
      h += `<div class="xg-sc${c.sum ? ' on' : ''}" style="width:${this.widths[i]}px"${c.sum ? ` title="${esc(c.t)} 합계${c.sumW ? ' (× ' + esc((this.cols.find(x => x.k === c.sumW) || {}).t || '') + ')' : ''}: ${Math.round(v).toLocaleString('ko-KR')}"` : ''}>${c.sum && S.n ? esc(sf(c, v)) : ''}</div>`;
    });
    h += `</div><div class="xg-hrow"><div class="xg-corner" title="전체 선택 (Ctrl+A)"></div>`;
    this.cols.forEach((c, i) => {
      const on = i >= s.c1 && i <= s.c2;
      h += `<div class="xg-hc${on ? ' sel' : ''}${this.widths[i] < 74 ? ' nar' : ''}" data-c="${i}" style="width:${this.widths[i]}px"><span class="t">${esc(c.t)}</span><button class="xg-fb${this.filters.has(i) ? ' on' : ''}" data-fc="${i}" title="정렬·필터">▾</button><i class="xg-rz" data-rc="${i}"></i></div>`;
    });
    this.headEl.innerHTML = h + '</div>';
    this.inner.style.width = this.totalW() + 'px';
  }
  renderRows() {
    if (!this.scroll) return;
    const st = this.scroll.scrollTop, ch = this.scroll.clientHeight || 600;
    const first = Math.max(0, Math.floor(st / XG.RH) - 8), last = Math.min(this.view.length, Math.ceil((st + ch) / XG.RH) + 8);
    const s = this.sel; const info = this.o.cellInfo; let html = '';
    for (let vr = first; vr < last; vr++) {
      const di = this.view[vr], row = this.rows[di];
      const gap = this.gapBefore.has(di);
      const rsel = vr >= s.r1 && vr <= s.r2;
      html += `<div class="xg-row" style="height:${XG.RH}px"><div class="xg-rn${rsel ? ' sel' : ''}${gap ? ' gap' : ''}" data-vr="${vr}">${di + 1}</div>`;
      for (let c = 0; c < this.nc; c++) {
        const v = row.v[c];
        const x = info ? info(di, c, v, row.v) : null;
        const txt = x && x.t != null ? x.t : (v == null ? '' : v);
        const cls = (this.cols[c].left ? ' l' : '') + (this.cols[c].num ? ' n' : '') + (x && x.cls ? ' ' + x.cls : '') + (this.hits.has(row.id + ':' + c) ? ' hit' : '') + (this.flashK && this.flashK.has(row.id + ':' + c) ? ' fl' : '');
        const st2 = x && x.bg ? ` style="width:${this.widths[c]}px;background:${x.bg}"` : ` style="width:${this.widths[c]}px"`;
        html += `<div class="xg-c${cls}"${st2}${x && x.tip ? ` title="${esc(x.tip)}"` : ''}>${esc(txt)}</div>`;
      }
      html += '</div>';
    }
    this.rowsEl.style.top = (XG.HEAD + first * XG.RH) + 'px';
    this.rowsEl.innerHTML = html;
    this.renderSel();
  }
  boxStyle(el, r1, c1, r2, c2) {
    el.style.top = (XG.HEAD + r1 * XG.RH) + 'px'; el.style.left = (XG.RN + this.colLeft(c1)) + 'px';
    el.style.width = (this.colLeft(c2 + 1) - this.colLeft(c1)) + 'px'; el.style.height = ((r2 - r1 + 1) * XG.RH) + 'px';
  }
  renderSel() {
    const s = this.sel, a = this.act;
    this.boxStyle(this.selEl, s.r1, s.c1, s.r2, s.c2);
    this.selEl.style.display = (s.r1 === s.r2 && s.c1 === s.c2) ? 'none' : 'block';
    this.boxStyle(this.actEl, a.r, a.c, a.r, a.c);
    this.fillEl.style.top = (XG.HEAD + (s.r2 + 1) * XG.RH - 4) + 'px'; this.fillEl.style.left = (XG.RN + this.colLeft(s.c2 + 1) - 4) + 'px';
    if (this.copyR) { const c = this.copyR; this.copyEl.style.display = 'block'; this.boxStyle(this.copyEl, c.r1, c.c1, c.r2, c.c2); } else this.copyEl.style.display = 'none';
    const list = this.cols[a.c].list;
    if (list && !this.editing) { this.ddEl.style.display = 'block'; this.ddEl.style.top = (XG.HEAD + a.r * XG.RH + 3) + 'px'; this.ddEl.style.left = (XG.RN + this.colLeft(a.c + 1) - 20) + 'px'; }
    else this.ddEl.style.display = 'none';
    // 머리글·행번호 강조
    this.headEl.querySelectorAll('.xg-hc').forEach(e => e.classList.toggle('sel', +e.dataset.c >= s.c1 && +e.dataset.c <= s.c2));
    this.rowsEl.querySelectorAll('.xg-rn').forEach(e => e.classList.toggle('sel', +e.dataset.vr >= s.r1 && +e.dataset.vr <= s.r2));
    if (!this.editing) this.placeEd();
  }
  placeEd() {
    const a = this.act;
    Object.assign(this.ed.style, { top: (XG.HEAD + a.r * XG.RH) + 'px', left: (XG.RN + this.colLeft(a.c)) + 'px', width: this.widths[a.c] + 'px', height: XG.RH + 'px' });
  }
  ensureVisible(vr, c) {
    const sc = this.scroll, top = vr * XG.RH, bottom = top + XG.RH, viewH = sc.clientHeight - XG.HEAD;
    if (top < sc.scrollTop) sc.scrollTop = top;
    else if (bottom > sc.scrollTop + viewH) sc.scrollTop = bottom - viewH;
    if (c != null) {
      const l = this.colLeft(c), r = l + this.widths[c], viewW = sc.clientWidth - XG.RN;
      if (l < sc.scrollLeft) sc.scrollLeft = l; else if (r > sc.scrollLeft + viewW) sc.scrollLeft = r - viewW;
    }
  }

  // ---------- 선택 ----------
  select(r1, c1, r2, c2, act) {
    this.sel = { r1: Math.min(r1, r2), r2: Math.max(r1, r2), c1: Math.min(c1, c2), c2: Math.max(c1, c2) };
    if (act) this.act = act;
    this.clampSel(); this.renderSel();
    if (this.o.onSelect) { const row = this.rowAt(this.act.r); this.o.onSelect(row ? this.view[this.act.r] : -1, this.act.c); }
  }
  moveTo(r, c, extend) {
    const mr = this.view.length - 1;
    r = Math.max(0, Math.min(mr, r)); c = Math.max(0, Math.min(this.nc - 1, c));
    if (extend) { this.act = this.act; this.select(this.anchor.r, this.anchor.c, r, c); this.extEnd = { r, c }; }
    else { this.anchor = { r, c }; this.extEnd = null; this.select(r, c, r, c, { r, c }); }
    this.ensureVisible(r, c); this.renderRows();
  }
  selectAll() { this.anchor = { r: 0, c: 0 }; this.select(0, 0, Math.max(0, this.dataRowsLimit() - 1), this.nc - 1, { r: this.act.r, c: this.act.c }); }
  dataRowsLimit() { let n = this.view.length; while (n > 1 && this.isBlank(this.rowAt(n - 1))) n--; return n; }
  edgeJump(r, c, dr, dc) {
    // Ctrl+방향키: 데이터 끝으로
    const filled = (rr, cc) => { const row = this.rowAt(rr); return row && row.v[cc] !== '' && row.v[cc] != null; };
    let rr = r, cc = c;
    const step = () => { rr += dr; cc += dc; };
    const inb = () => rr >= 0 && rr < this.view.length && cc >= 0 && cc < this.nc;
    const cur = filled(r, c); step();
    if (!inb()) return { r, c };
    if (cur && filled(rr, cc)) { while (inb() && filled(rr, cc)) step(); rr -= dr; cc -= dc; }
    else { while (inb() && !filled(rr, cc)) step(); if (!inb()) { rr -= dr; cc -= dc; if (dr > 0) rr = Math.max(0, this.dataRowsLimit() - 1); } }
    return { r: Math.max(0, Math.min(this.view.length - 1, rr)), c: Math.max(0, Math.min(this.nc - 1, cc)) };
  }

  // ---------- 마우스 ----------
  pos(e) {
    const rc = this.inner.getBoundingClientRect();
    const x = e.clientX - rc.left - XG.RN, y = e.clientY - rc.top - XG.HEAD;
    return { r: Math.max(0, Math.min(this.view.length - 1, Math.floor(y / XG.RH))), c: Math.max(0, this.colAt(Math.max(0, x))) };
  }
  onDown(e) {
    this.closeMenu();
    if (e.target.closest('.xg-fb')) { e.preventDefault(); const c = +e.target.closest('.xg-fb').dataset.fc; this.filterMenu(c, e.target.closest('.xg-fb')); return; }
    if (e.target.closest('.xg-rz')) { e.preventDefault(); const c = +e.target.closest('.xg-rz').dataset.rc; this.drag = { t: 'rz', c, x0: e.clientX, w0: this.widths[c] }; this.listen(); return; }
    if (this.editing && (e.target !== this.ed || e.button === 2)) this.commit();
    if (e.target === this.ed && e.button !== 2) return;
    if (e.button === 2) {
      const p = this.pos(e); const s = this.sel;
      const inSel = p.r >= s.r1 && p.r <= s.r2 && p.c >= s.c1 && p.c <= s.c2;
      const rn = e.target.closest('.xg-rn'), hc = e.target.closest('.xg-hc');
      if (rn && !(+rn.dataset.vr >= s.r1 && +rn.dataset.vr <= s.r2 && s.c1 === 0 && s.c2 === this.nc - 1)) { const r = +rn.dataset.vr; this.anchor = { r, c: 0 }; this.select(r, 0, r, this.nc - 1, { r, c: 0 }); }
      else if (hc && !(s.c1 <= +hc.dataset.c && +hc.dataset.c <= s.c2)) { const c = +hc.dataset.c; this.select(0, c, this.view.length - 1, c, { r: 0, c }); }
      else if (!inSel && !rn && !hc) this.moveTo(p.r, p.c);
      e.preventDefault(); this.focus(); return;
    }
    e.preventDefault(); this.focus();
    if (e.target.closest('.xg-corner')) { this.selectAll(); return; }
    if (e.target.closest('.xg-fill')) { this.drag = { t: 'fill', src: { ...this.sel } }; this.listen(); return; }
    const hc = e.target.closest('.xg-hc');
    if (hc) {
      const c = +hc.dataset.c;
      if (e.shiftKey) this.select(0, this.anchor.c, this.view.length - 1, c, { r: 0, c: this.anchor.c });
      else { this.anchor = { r: 0, c }; this.select(0, c, this.view.length - 1, c, { r: 0, c }); }
      this.drag = { t: 'col', c0: this.anchor.c }; this.listen(); return;
    }
    const rn = e.target.closest('.xg-rn');
    if (rn) {
      const r = +rn.dataset.vr;
      if (e.shiftKey) this.select(this.anchor.r, 0, r, this.nc - 1, { r: this.anchor.r, c: 0 });
      else { this.anchor = { r, c: 0 }; this.select(r, 0, r, this.nc - 1, { r, c: 0 }); }
      this.drag = { t: 'row', r0: this.anchor.r }; this.listen(); return;
    }
    if (e.target.closest('.xg-c') || e.target.closest('.xg-selbox') || e.target.closest('.xg-act')) {
      const p = this.pos(e);
      if (e.shiftKey) this.select(this.anchor.r, this.anchor.c, p.r, p.c);
      else this.moveTo(p.r, p.c);
      this.drag = { t: 'cell' }; this.listen();
    }
  }
  listen() { document.addEventListener('mousemove', this.onDocMove); document.addEventListener('mouseup', this.onDocUp); }
  onMove(e) {
    const d = this.drag; if (!d) return;
    if (d.t === 'rz') { this.widths[d.c] = Math.max(32, d.w0 + e.clientX - d.x0); this.render(); return; }
    this.lastMove = e; this.autoScroll(e);
    const p = this.pos(e);
    if (d.t === 'cell') this.select(this.anchor.r, this.anchor.c, p.r, p.c);
    if (d.t === 'row') this.select(d.r0, 0, p.r, this.nc - 1, { r: d.r0, c: 0 });
    if (d.t === 'col') this.select(0, d.c0, this.view.length - 1, p.c, { r: 0, c: d.c0 });
    if (d.t === 'fill') {
      const s = d.src; const down = p.r - s.r2, right = p.c - s.c2;
      if (down > 0 && down >= right) d.to = { r1: s.r1, c1: s.c1, r2: p.r, c2: s.c2 };
      else if (right > 0) d.to = { r1: s.r1, c1: s.c1, r2: s.r2, c2: p.c };
      else d.to = null;
      const t = d.to || s; this.boxStyle(this.selEl, t.r1, t.c1, t.r2, t.c2); this.selEl.style.display = 'block'; this.selEl.classList.toggle('filling', !!d.to);
    }
  }
  autoScroll(e) {
    const rc = this.scroll.getBoundingClientRect(); let dy = 0, dx = 0;
    if (e.clientY > rc.bottom - 18) dy = 22; else if (e.clientY < rc.top + XG.HEAD + 6) dy = -22;
    if (e.clientX > rc.right - 18) dx = 30; else if (e.clientX < rc.left + XG.RN + 4) dx = -30;
    clearInterval(this.asT);
    if (dy || dx) this.asT = setInterval(() => { this.scroll.scrollTop += dy; this.scroll.scrollLeft += dx; if (this.lastMove) this.onMove(this.lastMove); }, 40);
  }
  onUp() {
    clearInterval(this.asT);
    document.removeEventListener('mousemove', this.onDocMove); document.removeEventListener('mouseup', this.onDocUp);
    const d = this.drag; this.drag = null;
    if (!d) return;
    if (d.t === 'rz') { this.saveWidths(); return; }
    if (d.t === 'fill') { this.selEl.classList.remove('filling'); if (d.to) this.fill(d.src, d.to); else this.renderSel(); }
    this.focus();
  }

  // ---------- 키보드 ----------
  onKey(e) {
    const k = e.key, ctrl = e.ctrlKey || e.metaKey;
    if (this.editing) {
      if (e.isComposing || e.keyCode === 229) return;
      const lo = !this.listEl.hidden && this.listItems && this.listItems.length;
      if (lo && (k === 'ArrowDown' || k === 'ArrowUp')) { e.preventDefault(); this.listHi = Math.max(0, Math.min(this.listItems.length - 1, (this.listHi == null ? -1 : this.listHi) + (k === 'ArrowDown' ? 1 : -1))); this.drawList(); return; }
      if (k === 'Enter' && !e.altKey) { e.preventDefault(); if (lo && this.listHi != null && this.listHi >= 0) this.ed.value = this.listItems[this.listHi].v; this.commit(); this.moveTo(this.act.r + (e.shiftKey ? -1 : 1), this.act.c); return; }
      if (k === 'Tab') { e.preventDefault(); if (lo && this.listHi != null && this.listHi >= 0) this.ed.value = this.listItems[this.listHi].v; this.commit(); this.moveTo(this.act.r, this.act.c + (e.shiftKey ? -1 : 1)); return; }
      if (k === 'Escape') { e.preventDefault(); if (lo) this.closeList(); else this.cancelEdit(); return; }
      if (this.editing.mode === 'enter' && /^Arrow/.test(k)) {
        e.preventDefault(); this.commit();
        const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
        this.moveTo(this.act.r + d[0], this.act.c + d[1]); return;
      }
      return;
    }
    if (e.isComposing || e.keyCode === 229) { this.startEdit('enter', ''); return; }
    const a = this.act, ext = e.shiftKey;
    const cur = ext && this.extEnd ? this.extEnd : a;
    if (ctrl) {
      const kk = k.toLowerCase();
      if (kk === 'a') { e.preventDefault(); this.selectAll(); }
      else if (kk === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
      else if (kk === 'y' || (kk === 'z' && e.shiftKey)) { e.preventDefault(); this.redo(); }
      else if (kk === 'f') { e.preventDefault(); this.openFind(false); }
      else if (kk === 'h') { e.preventDefault(); this.openFind(true); }
      else if (/^Arrow/.test(k)) { e.preventDefault(); const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k]; const t = this.edgeJump(cur.r, cur.c, d[0], d[1]); this.moveTo(t.r, t.c, ext); }
      else if (k === 'Home') { e.preventDefault(); this.moveTo(0, 0, ext); }
      else if (k === 'End') { e.preventDefault(); this.moveTo(this.dataRowsLimit() - 1, this.nc - 1, ext); }
      return;
    }
    if (e.altKey && k === 'ArrowDown') { e.preventDefault(); if (this.cols[a.c].list) { this.startEdit('edit'); this.updateList(true); } return; }
    const page = Math.max(1, Math.floor((this.scroll.clientHeight - XG.HEAD) / XG.RH) - 1);
    switch (k) {
      case 'ArrowUp': e.preventDefault(); this.moveTo(cur.r - 1, cur.c, ext); return;
      case 'ArrowDown': e.preventDefault(); this.moveTo(cur.r + 1, cur.c, ext); return;
      case 'ArrowLeft': e.preventDefault(); this.moveTo(cur.r, cur.c - 1, ext); return;
      case 'ArrowRight': e.preventDefault(); this.moveTo(cur.r, cur.c + 1, ext); return;
      case 'PageDown': e.preventDefault(); this.moveTo(cur.r + page, cur.c, ext); return;
      case 'PageUp': e.preventDefault(); this.moveTo(cur.r - page, cur.c, ext); return;
      case 'Home': e.preventDefault(); this.moveTo(cur.r, 0, ext); return;
      case 'End': e.preventDefault(); this.moveTo(cur.r, this.nc - 1, ext); return;
      case 'Enter': e.preventDefault(); this.moveTo(a.r + (e.shiftKey ? -1 : 1), a.c); return;
      case 'Tab': e.preventDefault(); this.moveTo(a.r, a.c + (e.shiftKey ? -1 : 1)); return;
      case 'Delete': case 'Backspace': e.preventDefault(); this.clearSel('지우기'); return;
      case 'F2': e.preventDefault(); this.startEdit('edit'); return;
      case 'Escape': this.copyR = null; this.renderSel(); return;
    }
    if (k.length === 1 && !e.altKey) this.startEdit('enter', ''); // 글자는 그대로 입력칸으로 들어감
  }

  // ---------- 편집 ----------
  startEdit(mode, init) {
    const a = this.act; const row = this.rowAt(a.r); if (!row) return;
    this.editing = { mode, id: row.id, c: a.c };
    this.placeEd();
    this.ed.classList.add('on'); this.ddEl.style.display = 'none';
    if (init === '') this.ed.value = '';
    else if (init == null && mode === 'enter') { /* 입력 중인 값 유지 */ }
    else { const v = row.v[a.c]; this.ed.value = v == null ? '' : String(v); const n = this.ed.value.length; this.ed.setSelectionRange(n, n); }
    this.ed.style.width = Math.max(this.widths[a.c], 120) + 'px';
    this.focus();
    if (this.cols[a.c].list) this.updateList(mode === 'edit');
  }
  commit() {
    const ed = this.editing; if (!ed) return;
    this.editing = null; this.ed.classList.remove('on'); this.closeList();
    let v = this.ed.value; this.ed.value = '';
    v = v.replace(/\r?\n/g, ' ').trim();
    if (this.cols[ed.c].num && v !== '') { const n = num(v); if (n != null && !/[가-힣a-z]/i.test(v)) v = n; }
    this.applyCells([{ id: ed.id, c: ed.c, n: v }], '입력');
    this.placeEd();
  }
  cancelEdit() { this.editing = null; this.ed.classList.remove('on'); this.ed.value = ''; this.closeList(); this.renderSel(); }
  // 자동완성 목록
  updateList(all) {
    const c = this.editing ? this.editing.c : this.act.c; const col = this.cols[c];
    if (!col.list || !this.editing) return this.closeList();
    const row = this.rows[this.idxOf(this.editing.id)];
    const opts = col.list(row ? row.v : []) || [];
    const q = norm(this.ed.value);
    let items = opts.map(o => (typeof o === 'string' ? { v: o } : o));
    if (q && !all) items = items.filter(o => norm(o.v).includes(q) || (o.alias && norm(o.alias).includes(q)) || (o.sub && norm(o.sub).includes(q)));
    this.listItems = items.slice(0, 200);
    const exact = this.listItems.findIndex(o => norm(o.v) === q);
    this.listHi = exact >= 0 ? exact : (q && this.listItems.length ? 0 : null);
    if (!this.listItems.length) return this.closeList();
    this.drawList();
  }
  drawList() {
    const L = this.listEl; L.hidden = false;
    L.innerHTML = this.listItems.map((o, i) => `<div class="it${i === this.listHi ? ' on' : ''}" data-i="${i}">${o.color ? `<span class="sw" style="background:${o.color}"></span>` : ''}${esc(o.v)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</div>`).join('');
    const er = this.ed.getBoundingClientRect(), hr = this.el.getBoundingClientRect();
    L.style.left = (er.left - hr.left) + 'px'; L.style.top = (er.bottom - hr.top + 2) + 'px'; L.style.minWidth = Math.max(160, er.width) + 'px';
    const hi = L.querySelector('.on'); if (hi) hi.scrollIntoView({ block: 'nearest' });
  }
  listPick(i) { const o = this.listItems[i]; if (!o) return; this.ed.value = o.v; this.commit(); this.moveTo(this.act.r + 1, this.act.c); }
  closeList() { this.listEl.hidden = true; this.listItems = null; this.listHi = null; }

  // ---------- 변경·되돌리기 ----------
  posMap() { const m = new Map(); this.rows.forEach((r, i) => m.set(r.id, i)); return m; }
  applyCells(changes, label, extraOps) {
    const ch = []; const pos = changes.length > 30 ? this.posMap() : null;
    for (const x of changes) {
      const i = pos ? (pos.has(x.id) ? pos.get(x.id) : -1) : this.idxOf(x.id); if (i < 0) continue;
      const o = this.rows[i].v[x.c];
      if (String(o) === String(x.n)) continue;
      this.rows[i].v[x.c] = x.n; ch.push({ id: x.id, c: x.c, o, n: x.n });
    }
    const ops = (extraOps || []).concat(ch.length ? [{ t: 'cells', ch }] : []);
    if (!ops.length) { this.renderRows(); return; }
    this.pushOp(ops.length === 1 ? ops[0] : { t: 'multi', ops }, label);
  }
  pushOp(op, label) { op.label = label; this.undoS.push(op); if (this.undoS.length > 200) this.undoS.shift(); this.redoS = []; this.changed(op); }
  changed(op) {
    this.ensureSpare();
    if (op && /ins|del|hide|order/.test(op.t + (op.ops || []).map(x => x.t).join())) this.recalcView();
    this.clampSel(); this.render();
    if (this.findQ) this.runFind(false);
    if (this.o.onChange) this.o.onChange(op);
  }
  doOp(op, dir) {
    if (op.t === 'multi') { const list = dir > 0 ? op.ops : op.ops.slice().reverse(); list.forEach(o => this.doOp(o, dir)); return; }
    if (op.t === 'cells') { const pos = this.posMap(); for (const x of op.ch) { const i = pos.has(x.id) ? pos.get(x.id) : -1; if (i >= 0) this.rows[i].v[x.c] = dir > 0 ? x.n : x.o; } }
    if (op.t === 'ins') { if (dir > 0) this.rows.splice(op.at, 0, ...op.rows); else this.rows.splice(op.at, op.rows.length); }
    if (op.t === 'del') {
      if (dir > 0) { for (let k = op.items.length - 1; k >= 0; k--) this.rows.splice(op.items[k].at, 1); }
      else { for (const it of op.items) this.rows.splice(it.at, 0, it.row); }
    }
    if (op.t === 'hide') for (const id of op.ids) { if ((dir > 0) === op.v) this.hiddenIds.add(id); else this.hiddenIds.delete(id); }
    if (op.t === 'order') { const ids = dir > 0 ? op.after : op.before; const m = new Map(this.rows.map(r => [r.id, r])); this.rows = ids.map(id => m.get(id)).filter(Boolean); }
  }
  undo() { const op = this.undoS.pop(); if (!op) return false; this.doOp(op, -1); this.redoS.push(op); this.copyR = null; this.changed(op); return true; }
  redo() { const op = this.redoS.pop(); if (!op) return false; this.doOp(op, 1); this.undoS.push(op); this.changed(op); return true; }

  // ---------- 범위 작업 ----------
  selRows() { const s = this.sel; const out = []; for (let r = s.r1; r <= s.r2; r++) { const row = this.rowAt(r); if (row) out.push(row); } return out; }
  copyText() {
    const s = this.sel; const rows = this.selRows();
    let n = rows.length; while (n > 1 && this.isBlank(rows[n - 1])) n--;
    return xgTsv(rows.slice(0, n).map(r => r.v.slice(s.c1, s.c2 + 1)));
  }
  markCopy() { this.copyR = { ...this.sel }; this.renderSel(); }
  clearSel(label) {
    const s = this.sel; const ch = [];
    for (const row of this.selRows()) for (let c = s.c1; c <= s.c2; c++) if (row.v[c] !== '') ch.push({ id: row.id, c, n: '' });
    this.copyR = null; this.applyCells(ch, label || '지우기');
  }
  paste(text, html) {
    let B = xgParseTsv(text); if (!B.length) return;
    if (html) B = xgPrecise(B, html);
    const s = this.sel; const ops = []; const ch = [];
    // 머리글 행·예전 양식 등은 바깥(앱)에서 열을 맞춰 줌 → 행 맨 앞(A열)부터
    const pre = this.o.prepPaste ? this.o.prepPaste(B) : null;
    if (pre) {
      B = pre.rows; if (!B.length) { if (this.o.toast) this.o.toast(pre.note || '붙여넣을 행이 없어요'); return; }
      const r0 = s.r1;
      const need = r0 + B.length - this.view.length;
      if (need > 0) { const rows = Array.from({ length: need }, () => this.blankRow()); const at = this.rows.length; this.rows.push(...rows); ops.push({ t: 'ins', at, rows }); this.recalcView(); }
      B.forEach((br, i) => { const row = this.rowAt(r0 + i); if (!row) return; for (let c = 0; c < this.nc; c++) ch.push({ id: row.id, c, n: this.coerce(c, br[c]) }); });
      this.copyR = null;
      this.applyCells(ch, '붙여넣기', ops);
      this.anchor = { r: r0, c: 0 }; this.select(r0, 0, r0 + B.length - 1, this.nc - 1, { r: r0, c: 0 }); this.ensureVisible(r0, 0);
      this.flash(ch.filter(x => x.n !== ''));
      if (this.o.toast && pre.note) this.o.toast(pre.note, 5000);
      return;
    }
    if (B.length === 1 && B[0].length === 1 && (s.r2 > s.r1 || s.c2 > s.c1)) {
      for (const row of this.selRows()) for (let c = s.c1; c <= s.c2; c++) ch.push({ id: row.id, c, n: this.coerce(c, B[0][0]) });
      this.applyCells(ch, '붙여넣기'); this.flash(ch); return;
    }
    const r0 = s.r1, c0 = s.c1;
    const need = r0 + B.length - this.view.length;
    if (need > 0) { const rows = Array.from({ length: need }, () => this.blankRow()); const at = this.rows.length; this.rows.push(...rows); ops.push({ t: 'ins', at, rows }); this.recalcView(); }
    B.forEach((br, i) => { const row = this.rowAt(r0 + i); if (!row) return; br.forEach((v, j) => { const c = c0 + j; if (c < this.nc) ch.push({ id: row.id, c, n: this.coerce(c, v) }); }); });
    this.copyR = null;
    this.applyCells(ch, '붙여넣기', ops);
    this.select(r0, c0, r0 + B.length - 1, Math.min(this.nc - 1, c0 + B[0].length - 1), { r: r0, c: c0 });
    this.flash(ch);
    if (this.o.toast && B.length >= 20) this.o.toast(`${B.length.toLocaleString('ko-KR')}행 × ${Math.min(B[0].length, this.nc - c0)}열을 붙여넣었어요`);
  }
  // 붙여넣기·채우기·바꾸기로 값이 바뀐 칸을 잠깐 반짝
  flash(changes) {
    if (!changes || !changes.length) return;
    this.flashK = new Set(changes.map(x => x.id + ':' + x.c)); this.renderRows();
    clearTimeout(this.flT); this.flT = setTimeout(() => { this.flashK = null; this.renderRows(); }, 1500);
  }
  coerce(c, v) {
    v = v == null ? '' : String(v).replace(/\u00a0/g, ' ').trim();
    const col = this.cols[c];
    if (col.num && v !== '') {
      if (/^-+$/.test(v)) return col.money ? 0 : ''; // 엑셀 회계 서식의 0 ('-')
      const n = num(v); if (n != null && !/[가-힣a-z]/i.test(v.replace(/원/g, ''))) return n;
    }
    if (this.o.normalize && v !== '') return this.o.normalize(col, v);
    return v;
  }
  fill(src, to) {
    const ch = [];
    const h = src.r2 - src.r1 + 1, w = src.c2 - src.c1 + 1;
    for (let r = to.r1; r <= to.r2; r++) for (let c = to.c1; c <= to.c2; c++) {
      if (r >= src.r1 && r <= src.r2 && c >= src.c1 && c <= src.c2) continue;
      const sr = this.rowAt(src.r1 + ((r - src.r1) % h)), tr = this.rowAt(r); if (!sr || !tr) continue;
      ch.push({ id: tr.id, c, n: sr.v[src.c1 + ((c - src.c1) % w)] });
    }
    this.applyCells(ch, '채우기');
    this.select(to.r1, to.c1, to.r2, to.c2);
    this.flash(ch);
  }
  insertRows(where) {
    const s = this.sel; const cnt = s.r2 - s.r1 + 1;
    const ref = where === 'above' ? this.view[s.r1] : (this.view[s.r2] != null ? this.view[s.r2] + 1 : this.rows.length);
    const rows = Array.from({ length: where === 'end' ? 10 : cnt }, () => this.blankRow());
    const at = where === 'end' ? (() => { let n = this.rows.length; while (n > 0 && this.isBlank(this.rows[n - 1])) n--; return n; })() : ref;
    this.rows.splice(at, 0, ...rows);
    this.pushOp({ t: 'ins', at, rows }, '행 삽입');
  }
  deleteRows() {
    const ids = new Set(this.selRows().map(r => r.id));
    const items = []; this.rows.forEach((row, at) => { if (ids.has(row.id)) items.push({ at, row }); });
    if (!items.length) return 0;
    for (let k = items.length - 1; k >= 0; k--) this.rows.splice(items[k].at, 1);
    this.pushOp({ t: 'del', items }, '행 삭제');
    this.select(this.sel.r1, this.sel.c1, this.sel.r1, this.sel.c1, { r: this.sel.r1, c: this.sel.c1 });
    return items.length;
  }
  hideRows() {
    const ids = this.selRows().filter(r => !this.isBlank(r)).map(r => r.id); if (!ids.length) return 0;
    ids.forEach(id => this.hiddenIds.add(id));
    this.pushOp({ t: 'hide', ids, v: true }, '행 숨기기');
    this.moveTo(Math.min(this.sel.r1, this.view.length - 1), this.act.c);
    return ids.length;
  }
  unhideRows(all) {
    let ids;
    if (all) ids = [...this.hiddenIds];
    else {
      const s = this.sel; const a = s.r1 > 0 ? this.view[s.r1 - 1] + 1 : 0, b = this.view[s.r2 + 1] != null ? this.view[s.r2 + 1] - 1 : this.rows.length - 1;
      ids = this.rows.slice(Math.min(a, this.view[s.r1]), Math.max(b, this.view[s.r2]) + 1).filter(r => this.hiddenIds.has(r.id)).map(r => r.id);
    }
    if (!ids.length) return 0;
    ids.forEach(id => this.hiddenIds.delete(id));
    this.pushOp({ t: 'hide', ids, v: false }, '숨긴 행 표시');
    return ids.length;
  }
  sortBy(c, desc) {
    const before = this.rows.map(r => r.id);
    const filled = this.rows.filter(r => !this.isBlank(r)), blank = this.rows.filter(r => this.isBlank(r));
    const idx = new Map(filled.map((r, i) => [r.id, i]));
    filled.sort((a, b) => { const x = xgCmp(a.v[c], b.v[c]); return (desc && a.v[c] !== '' && b.v[c] !== '' ? -x : x) || idx.get(a.id) - idx.get(b.id); });
    this.rows = filled.concat(blank);
    this.pushOp({ t: 'order', before, after: this.rows.map(r => r.id) }, '정렬');
  }
  setFilter(c, set) { if (set) this.filters.set(c, set); else this.filters.delete(c); this.recalcView(); this.clampSel(); this.render(); if (this.o.onView) this.o.onView(); }
  clearFilters() { this.filters.clear(); this.recalcView(); this.clampSel(); this.render(); if (this.o.onView) this.o.onView(); }
  gotoData(di, c) {
    let vr = this.view.indexOf(di);
    if (vr < 0) {
      const row = this.rows[di]; if (!row) return;
      if (this.filters.size) { this.filters.clear(); this.recalcView(); this.render(); if (this.o.onView) this.o.onView(); }
      if (this.hiddenIds.has(row.id)) { this.hiddenIds.delete(row.id); this.pushOp({ t: 'hide', ids: [row.id], v: false }, '숨긴 행 표시'); }
      vr = this.view.indexOf(di);
    }
    if (vr >= 0) { this.moveTo(vr, c == null ? 0 : c); this.focus(); }
  }

  // ---------- 찾기·바꾸기 ----------
  openFind(rep) {
    this.findEl.hidden = false; this.findEl.classList.toggle('rep', !!rep);
    const q = this.findEl.querySelector('.q');
    const s = this.sel; const row = this.rowAt(this.act.r);
    if (!q.value && row && s.r1 === s.r2 && s.c1 === s.c2 && row.v[this.act.c] !== '') { /* 빈칸이면 그대로 */ }
    q.focus(); q.select(); this.runFind(false);
  }
  closeFind() { this.findEl.hidden = true; this.findQ = null; this.hits = new Set(); this.renderRows(); this.focus(); }
  runFind(jump) {
    const q = this.findEl.querySelector('.q').value.trim().toLowerCase();
    const only = this.findEl.querySelector('.oc').checked ? this.act.c : null;
    this.findQ = q || null; this.matches = []; this.hits = new Set();
    if (q) this.view.forEach((di, vr) => { const row = this.rows[di]; for (let c = 0; c < this.nc; c++) { if (only != null && c !== only) continue; const v = row.v[c]; if (v !== '' && v != null && String(v).toLowerCase().includes(q)) { this.matches.push({ vr, c }); this.hits.add(row.id + ':' + c); } } });
    if (jump && this.matches.length) { const a = this.act; let i = this.matches.findIndex(m => m.vr > a.r || (m.vr === a.r && m.c >= a.c)); this.mi = i < 0 ? 0 : i; this.gotoMatch(); }
    else { this.mi = this.matches.findIndex(m => m.vr === this.act.r && m.c === this.act.c); }
    this.findCount(); this.renderRows();
  }
  findCount() { this.findEl.querySelector('.cnt').textContent = this.findQ ? (this.matches.length ? `${(this.mi >= 0 ? this.mi : 0) + 1}/${this.matches.length}` : '없음') : ''; }
  gotoMatch() { const m = this.matches[this.mi]; if (!m) return; this.anchor = { r: m.vr, c: m.c }; this.select(m.vr, m.c, m.vr, m.c, { r: m.vr, c: m.c }); this.ensureVisible(m.vr, m.c); this.renderRows(); this.findCount(); }
  findStep(d) { if (!this.matches || !this.matches.length) return this.runFind(true); this.mi = ((this.mi < 0 ? (d > 0 ? -1 : 0) : this.mi) + d + this.matches.length) % this.matches.length; this.gotoMatch(); }
  replaceIn(v, q, w) { const s = String(v); const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); return s.replace(re, w); }
  replaceOne() {
    const q = this.findQ; if (!q) return; const w = this.findEl.querySelector('.w').value;
    const m = this.matches[this.mi]; if (!m || m.vr !== this.act.r || m.c !== this.act.c) return this.findStep(1);
    const row = this.rowAt(m.vr); this.applyCells([{ id: row.id, c: m.c, n: this.coerce(m.c, this.replaceIn(row.v[m.c], q, w)) }], '바꾸기');
    this.runFind(false); if (this.matches.length) { this.mi = Math.min(Math.max(0, this.mi), this.matches.length - 1); const nx = this.matches.findIndex(x => x.vr > m.vr || (x.vr === m.vr && x.c > m.c)); this.mi = nx < 0 ? 0 : nx; this.gotoMatch(); }
  }
  replaceAll() {
    const q = this.findQ; if (!q || !this.matches.length) return 0; const w = this.findEl.querySelector('.w').value;
    const ch = this.matches.map(m => { const row = this.rowAt(m.vr); return { id: row.id, c: m.c, n: this.coerce(m.c, this.replaceIn(row.v[m.c], q, w)) }; });
    const n = ch.length; this.applyCells(ch, '모두 바꾸기'); this.flash(ch); this.runFind(false);
    if (this.o.toast) this.o.toast(`${n}개 셀을 바꿨어요`);
    return n;
  }

  // ---------- 팝업 메뉴 ----------
  closeMenu() { if (this.pop) { this.pop.remove(); this.pop = null; document.removeEventListener('mousedown', this.popOff, true); } }
  openPop(html, x, y) {
    this.closeMenu();
    const p = document.createElement('div'); p.className = 'xg-pop'; p.innerHTML = html;
    document.body.appendChild(p);
    const w = p.offsetWidth, h = p.offsetHeight;
    p.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + 'px'; p.style.top = Math.max(8, Math.min(y, window.innerHeight - h - 8)) + 'px';
    this.pop = p;
    this.popOff = e => { if (!p.contains(e.target)) this.closeMenu(); };
    setTimeout(() => document.addEventListener('mousedown', this.popOff, true), 0);
    return p;
  }
  menu(x, y) {
    if (this.editing) this.commit();
    const s = this.sel; const rowsSel = s.c1 === 0 && s.c2 === this.nc - 1;
    const nRows = s.r2 - s.r1 + 1; const c = this.act.c; const row = this.rowAt(this.act.r);
    const items = [
      ['cut', '잘라내기', 'Ctrl+X'], ['copy', '복사', 'Ctrl+C'], ['paste', '붙여넣기', 'Ctrl+V'], '-',
      ['insA', `위에 행 ${nRows}개 삽입`], ['insB', `아래에 행 ${nRows}개 삽입`], ['del', `행 ${nRows}개 삭제`], ['hide', '행 숨기기'], ['unhide', '숨긴 행 표시 (선택 범위)'], '-',
      ['clear', '내용 지우기', 'Delete'], '-',
      ['asc', `'${this.cols[c].t}' 오름차순 정렬`], ['desc', `'${this.cols[c].t}' 내림차순 정렬`],
      ['fval', row && row.v[c] !== '' ? `'${String(row.v[c]).slice(0, 14)}'만 보기` : null], ['fclr', this.filters.size ? '필터 모두 해제' : null],
    ];
    const html = items.filter(i => i === '-' || i[1]).map(i => i === '-' ? '<hr>' : `<button data-m="${i[0]}">${esc(i[1])}${i[2] ? `<small>${i[2]}</small>` : ''}</button>`).join('');
    const p = this.openPop(html, x, y); p.classList.add('menu');
    p.addEventListener('click', ev => {
      const b = ev.target.closest('[data-m]'); if (!b) return; const m = b.dataset.m; this.closeMenu(); this.focus();
      if (m === 'copy' || m === 'cut') { const t = this.copyText(); if (navigator.clipboard) navigator.clipboard.writeText(t).catch(() => { }); if (m === 'cut') this.clearSel('잘라내기'); else this.markCopy(); }
      if (m === 'paste') { if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(t => this.paste(t)).catch(() => this.o.toast && this.o.toast('브라우저가 클립보드 읽기를 막았어요. Ctrl+V를 눌러 주세요.')); }
      if (m === 'insA') this.insertRows('above'); if (m === 'insB') this.insertRows('below');
      if (m === 'del') this.deleteRows(); if (m === 'hide') this.hideRows(); if (m === 'unhide') this.unhideRows(false);
      if (m === 'clear') this.clearSel();
      if (m === 'asc') this.sortBy(c, false); if (m === 'desc') this.sortBy(c, true);
      if (m === 'fval') this.setFilter(c, new Set([this.fkey(row.v[c])]));
      if (m === 'fclr') this.clearFilters();
    });
  }
  filterMenu(c, btn) {
    const r = btn.getBoundingClientRect();
    const others = [...this.filters.entries()].filter(([k]) => k !== c);
    const cnt = new Map();
    this.rows.forEach(row => {
      if (this.hiddenIds.has(row.id) || this.isBlank(row)) return;
      for (const [k, set] of others) if (!set.has(this.fkey(row.v[k]))) return;
      const key = this.fkey(row.v[c]); cnt.set(key, (cnt.get(key) || 0) + 1);
    });
    const vals = [...cnt.keys()].sort((a, b) => a === '(빈 칸)' ? 1 : b === '(빈 칸)' ? -1 : xgCmp(a, b));
    const cur = this.filters.get(c);
    const html = `<button data-a="asc">오름차순 정렬</button><button data-a="desc">내림차순 정렬</button><hr>
      <input class="fs" placeholder="값 검색">
      <label class="all"><input type="checkbox" data-all checked> (모두 선택)</label>
      <div class="vals">${vals.map(v => `<label><input type="checkbox" value="${esc(v)}" ${!cur || cur.has(v) ? 'checked' : ''}><span>${esc(v)}</span><small>${cnt.get(v)}</small></label>`).join('')}</div>
      <div class="ft"><button data-a="clr" ${cur ? '' : 'disabled'}>이 열 필터 해제</button><span class="sp"></span><button data-a="x">취소</button><button data-a="ok" class="pri">확인</button></div>`;
    const p = this.openPop(html, r.left - 160, r.bottom + 4); p.classList.add('filter');
    const boxes = () => [...p.querySelectorAll('.vals input')];
    const all = p.querySelector('[data-all]');
    const sync = () => { const b = boxes().filter(x => x.parentElement.style.display !== 'none'); all.checked = b.every(x => x.checked); };
    sync();
    all.onchange = () => boxes().forEach(x => { if (x.parentElement.style.display !== 'none') x.checked = all.checked; });
    p.querySelector('.vals').onchange = sync;
    p.querySelector('.fs').oninput = e => { const q = e.target.value.toLowerCase(); boxes().forEach(x => { const show = !q || x.value.toLowerCase().includes(q); x.parentElement.style.display = show ? '' : 'none'; if (q) x.checked = show; }); sync(); };
    p.querySelector('.fs').focus();
    p.addEventListener('click', ev => {
      const b = ev.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
      if (a === 'asc' || a === 'desc') { this.closeMenu(); this.sortBy(c, a === 'desc'); }
      if (a === 'clr') { this.closeMenu(); this.setFilter(c, null); }
      if (a === 'x') this.closeMenu();
      if (a === 'ok') { const on = boxes().filter(x => x.checked).map(x => x.value); this.closeMenu(); this.setFilter(c, on.length === vals.length ? null : new Set(on)); }
      this.focus();
    });
  }
  hiddenCount() { let n = 0; for (const r of this.rows) if (this.hiddenIds.has(r.id)) n++; return n; }
  destroy() { this.closeMenu(); this.host.innerHTML = ''; }
}
