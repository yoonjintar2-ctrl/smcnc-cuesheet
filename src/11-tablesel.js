// ===== 11-tablesel.js : 결과 표(큐시트·요약)를 엑셀처럼 범위 선택 =====
// 드래그 · Shift+클릭 · 머리글 클릭(열 전체) · Ctrl+A · 방향키(Shift로 넓히기) · Ctrl+C(엑셀에 병합 그대로 붙여넣기) · Esc
const TSel = {
  tb: null, grid: null, a: null, b: null, rect: null, cells: [], colMode: false, bar: null,
  init() {
    if (this.ready || typeof document === 'undefined') return; this.ready = true;
    document.addEventListener('mousedown', e => this.down(e));
    document.addEventListener('keydown', e => this.key(e));
    document.addEventListener('copy', e => this.copy(e));
  },
  inField(el) { return el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable); },
  // 병합(rowspan·colspan)을 펼친 논리 격자
  map(tb) {
    const grid = [];
    [...tb.rows].forEach((tr, r) => {
      grid[r] = grid[r] || []; let c = 0;
      for (const td of tr.cells) {
        while (grid[r][c]) c++;
        const rs = Math.max(1, td.rowSpan || 1), cs = Math.max(1, td.colSpan || 1);
        for (let i = 0; i < rs; i++) { grid[r + i] = grid[r + i] || []; for (let j = 0; j < cs; j++) grid[r + i][c + j] = td; }
        td._rc = [r, c, rs, cs]; c += cs;
      }
    });
    this.nc = Math.max(0, ...grid.map(g => g.length));
    this.headRows = tb.tHead ? tb.tHead.rows.length : 0;
    return grid;
  },
  down(e) {
    if (e.button !== 0) return;
    if (e.target.closest && e.target.closest('.tselbar')) return;
    const td = e.target.closest && e.target.closest('td,th');
    const tb = td && td.closest('table.t');
    if (!tb || !tb.closest('.tsel-scope') || e.target.closest('button,input,select,textarea,a,[contenteditable],.grip')) { this.clear(); return; }
    e.preventDefault();
    if (document.activeElement && this.inField(document.activeElement)) document.activeElement.blur();
    if (tb !== this.tb || !this.grid) { this.clear(); this.tb = tb; this.grid = this.map(tb); }
    const rc = td._rc || (this.grid = this.map(tb), td._rc);
    const isHead = td.tagName === 'TH' && td.closest('thead');
    if (e.shiftKey && this.a) { this.b = this.colMode ? [this.grid.length - 1, rc[1] + rc[3] - 1] : [rc[0], rc[1]]; }
    else if (isHead) { this.colMode = true; this.a = [rc[0], rc[1]]; this.b = [this.grid.length - 1, rc[1] + rc[3] - 1]; }
    else { this.colMode = false; this.a = [rc[0], rc[1]]; this.b = [rc[0], rc[1]]; }
    this.paint();
    const mv = ev => this.move(ev), up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); clearInterval(this.asT); };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  },
  move(ev) {
    clearInterval(this.asT);
    const edge = ev.clientY > window.innerHeight - 28 ? 18 : ev.clientY < 70 ? -18 : 0;
    if (edge) this.asT = setInterval(() => { window.scrollBy(0, edge); this.move(ev); }, 50);
    const el = document.elementFromPoint(ev.clientX, ev.clientY); const td = el && el.closest && el.closest('td,th');
    if (!td || td.closest('table.t') !== this.tb || !td._rc) return;
    const rc = td._rc;
    const nb = this.colMode ? [this.grid.length - 1, rc[1] + rc[3] - 1] : [rc[0], rc[1]];
    if (!this.b || nb[0] !== this.b[0] || nb[1] !== this.b[1]) { this.b = nb; this.paint(); }
  },
  paint() {
    if (!this.a || !this.b) return;
    let r1 = Math.min(this.a[0], this.b[0]), r2 = Math.max(this.a[0], this.b[0]), c1 = Math.min(this.a[1], this.b[1]), c2 = Math.max(this.a[1], this.b[1]);
    // 병합된 칸은 통째로 포함 (엑셀과 같음)
    for (let ch = true, guard = 0; ch && guard < 20; guard++) {
      ch = false;
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
        const el = (this.grid[r] || [])[c]; if (!el) continue; const [er, ec, rs, cs] = el._rc;
        if (er < r1) { r1 = er; ch = true; } if (er + rs - 1 > r2) { r2 = er + rs - 1; ch = true; }
        if (ec < c1) { c1 = ec; ch = true; } if (ec + cs - 1 > c2) { c2 = ec + cs - 1; ch = true; }
      }
    }
    this.rect = { r1, r2, c1, c2 };
    for (const el of this.cells) el.classList.remove('tsel', 'tsel-a');
    const set = new Set();
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) { const el = (this.grid[r] || [])[c]; if (el) set.add(el); }
    this.cells = [...set];
    for (const el of this.cells) el.classList.add('tsel');
    const act = (this.grid[this.a[0]] || [])[this.a[1]]; if (act) act.classList.add('tsel-a');
    this.tb.classList.add('tsel-on');
    this.updateBar();
  },
  clear() {
    for (const el of this.cells) el.classList.remove('tsel', 'tsel-a');
    if (this.tb) this.tb.classList.remove('tsel-on');
    this.cells = []; this.rect = null; this.a = this.b = null; this.tb = null; this.grid = null; this.colMode = false;
    if (this.bar) this.bar.hidden = true;
  },
  cellText(el) {
    const spots = el.querySelectorAll('.spot');
    if (spots.length) return [...spots].map(sp => { const base = [...sp.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim(); const i = sp.querySelector('i'); return i && i.textContent ? `${base} (${i.textContent})` : base; }).join('\n');
    const c = el.cloneNode(true); c.querySelectorAll('.dbadge').forEach(x => x.remove()); c.querySelectorAll('br').forEach(x => x.replaceWith(' '));
    return c.textContent.replace(/\s+/g, ' ').trim();
  },
  origins() { // 범위 안 칸들 (병합은 왼쪽 위 칸 하나만)
    const R = this.rect, out = [];
    for (let r = R.r1; r <= R.r2; r++) for (let c = R.c1; c <= R.c2; c++) { const el = (this.grid[r] || [])[c]; if (el && el._rc[0] === r && el._rc[1] === c) out.push(el); }
    return out;
  },
  tsv() {
    const R = this.rect, rows = [];
    for (let r = R.r1; r <= R.r2; r++) { const row = []; for (let c = R.c1; c <= R.c2; c++) { const el = (this.grid[r] || [])[c]; row.push(el && el._rc[0] === r && el._rc[1] === c ? this.cellText(el) : ''); } rows.push(row); }
    return xgTsv(rows);
  },
  html() {
    const R = this.rect; let h = '<table border="1" style="border-collapse:collapse">';
    for (let r = R.r1; r <= R.r2; r++) {
      h += '<tr>';
      for (let c = R.c1; c <= R.c2; c++) {
        const el = (this.grid[r] || [])[c];
        if (!el) { h += '<td></td>'; continue; }
        if (el._rc[0] !== r || el._rc[1] !== c) continue;
        const rs = Math.min(el._rc[0] + el._rc[2] - 1, R.r2) - r + 1, cs = Math.min(el._rc[1] + el._rc[3] - 1, R.c2) - c + 1;
        const tag = el.tagName === 'TH' ? 'th' : 'td';
        h += `<${tag}${rs > 1 ? ` rowspan="${rs}"` : ''}${cs > 1 ? ` colspan="${cs}"` : ''} style="vertical-align:${rs > 1 ? 'middle' : 'top'}">${esc(this.cellText(el)).replace(/\n/g, '<br style="mso-data-placement:same-cell">')}</${tag}>`;
      }
      h += '</tr>';
    }
    return h + '</table>';
  },
  copy(e) {
    if (!this.rect || !this.tb || !document.contains(this.tb)) return;
    if (this.inField(document.activeElement)) return;
    const s = window.getSelection && window.getSelection(); if (s && !s.isCollapsed && s.toString().trim()) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', this.tsv());
    e.clipboardData.setData('text/html', this.html());
    this.tb.classList.remove('tsel-copied'); void this.tb.offsetWidth; this.tb.classList.add('tsel-copied');
    this.updateBar('복사했어요 · 엑셀에서 Ctrl+V');
  },
  key(e) {
    if (!this.rect || !this.tb) return;
    if (!document.contains(this.tb)) return this.clear();
    if (this.inField(e.target) || document.querySelector('.modal-bg')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') { this.clear(); return; }
    if (ctrl && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); this.colMode = false; this.a = [this.headRows, 0]; this.b = [this.grid.length - 1, this.nc - 1]; this.paint(); return; }
    const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (!d || ctrl) return;
    e.preventDefault(); this.colMode = false;
    const cur = e.shiftKey ? this.b : this.a; const el0 = (this.grid[cur[0]] || [])[cur[1]];
    // 병합된 칸은 한 번에 건너뜀
    let r = cur[0], c = cur[1];
    if (el0) { if (d[0] > 0) r = el0._rc[0] + el0._rc[2] - 1; if (d[1] > 0) c = el0._rc[1] + el0._rc[3] - 1; if (d[0] < 0) r = el0._rc[0]; if (d[1] < 0) c = el0._rc[1]; }
    r = Math.max(0, Math.min(this.grid.length - 1, r + d[0])); c = Math.max(0, Math.min(this.nc - 1, c + d[1]));
    const el = (this.grid[r] || [])[c]; if (el) { r = el._rc[0]; c = el._rc[1]; }
    if (e.shiftKey) this.b = [r, c]; else { this.a = [r, c]; this.b = [r, c]; }
    this.paint();
    if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  },
  updateBar(msg) {
    if (!this.rect) return;
    if (!this.bar) {
      this.bar = document.createElement('div'); this.bar.className = 'tselbar';
      this.bar.innerHTML = '<span class="t"></span><button type="button">복사</button><button type="button" class="x" title="선택 해제 (Esc)">✕</button>';
      document.body.appendChild(this.bar);
      this.bar.querySelector('button:not(.x)').addEventListener('click', () => { try { document.execCommand('copy'); } catch (er) { } });
      this.bar.querySelector('.x').addEventListener('click', () => this.clear());
    }
    const R = this.rect, cells = this.origins();
    let n = 0, s = 0, filled = 0;
    for (const el of cells) { const t = this.cellText(el); if (t) filled++; if (/^-?[\d,]+(\.\d+)?$/.test(t)) { n++; s += num(t); } }
    const rows = R.r2 - R.r1 + 1, cols = R.c2 - R.c1 + 1;
    this.bar.querySelector('.t').innerHTML = msg ? esc(msg) : `<b>${fmt.int(rows)}행 × ${cols}열</b> · 값 ${fmt.int(filled)}개${n > 1 ? ` · 합계 ${fmt.won(s)} · 평균 ${fmt.won(s / n)}` : ''} <span class="k">Ctrl+C 복사</span>`;
    this.bar.hidden = false;
  },
};
