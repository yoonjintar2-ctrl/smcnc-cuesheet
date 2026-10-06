// ===== 10-charts.js : 직접 그리는 차트 (3D 도넛 · 일별 송출 누적 막대+주차 · 품목 막대 · 중CM 비중) + 애니메이션 도우미 =====

function setupCanvas(cv, w, h) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
function tipShow(tip, host, x, y, html) {
  tip.innerHTML = html; tip.style.display = 'block';
  const hw = host.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
  tip.style.left = Math.max(4, Math.min(hw - tw - 4, x + 14)) + 'px';
  tip.style.top = Math.max(4, y - th - 12) + 'px';
}
function shade(hex, f) { // f<0 어둡게
  const c = hexToRgb(hex) || [111, 118, 128];
  const m = c.map(x => Math.max(0, Math.min(255, Math.round(f < 0 ? x * (1 + f) : x + (255 - x) * f))));
  return '#' + m.map(x => x.toString(16).padStart(2, '0')).join('');
}
function mixHex(a, b, q) { const x = hexToRgb(a) || [0, 0, 0], y = hexToRgb(b) || [0, 0, 0]; return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * q).toString(16).padStart(2, '0')).join(''); }

// ---------- 애니메이션 도우미 (움직임 줄이기 설정이면 바로 끝 상태) ----------
const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeOut = t => 1 - Math.pow(1 - t, 3);
function tween(ms, fn, done) {
  if (reduceMotion() || typeof requestAnimationFrame === 'undefined') { fn(1); if (done) done(); return () => { }; }
  const t0 = performance.now(); let raf = 0, alive = true;
  const step = now => { if (!alive) return; const q = Math.min(1, (now - t0) / ms); fn(easeOut(q)); if (q < 1) raf = requestAnimationFrame(step); else if (done) done(); };
  raf = requestAnimationFrame(step);
  return () => { alive = false; cancelAnimationFrame(raf); };
}
// 숫자 굴리기: el 글자를 from → to 로
function rollText(el, from, to, f, ms = 600) { if (!el) return; if (el._stop) el._stop(); el._stop = tween(ms, q => { el.textContent = f(from + (to - from) * q); }); }
// 떠 있는 툴팁 (HTML 차트용)
let FTIP = null;
function ftip(e, html) {
  if (!FTIP) { FTIP = document.createElement('div'); FTIP.className = 'ftip'; document.body.appendChild(FTIP); }
  FTIP.innerHTML = html; FTIP.style.display = 'block';
  const w = FTIP.offsetWidth, h = FTIP.offsetHeight;
  FTIP.style.left = Math.max(6, Math.min(window.innerWidth - w - 6, e.clientX + 14)) + 'px';
  FTIP.style.top = Math.max(6, e.clientY - h - 12) + 'px';
}
function ftipHide() { if (FTIP) FTIP.style.display = 'none'; }

// ---------- 3D 도넛 : 각도 = 예산 비중, 위로 솟은 반투명 기둥 = 보너스 금액(끄면 기둥 없음) ----------
// 조각에 grp(매체)가 있으면 묶음 사이를 살짝 띄우고 묶음째 바깥으로 조금 밀어냄 (지상파 / 케이블 규모가 한눈에)
const DN_BASE = '#3a3a3c';
// 처음엔 12시부터 펼친 뒤 기둥이 솟고(intro), 품목·매체를 바꾸면 이전 모양에서 새 값으로 부드럽게 바뀜
const DN = { last: null };
function donut3D(host, slices, opts = {}) {
  let st = host._dn;
  if (!st || !host.contains(st.cv)) {
    host.innerHTML = '<canvas></canvas><div class="ctip"></div>'; host.classList.add('chost');
    st = host._dn = { host, cv: host.querySelector('canvas'), tip: host.querySelector('.ctip'), hover: -1, sweep: 1, rise: 1, cur: null, stop: null };
    st.cv.addEventListener('mousemove', e => dnMove(st, e));
    st.cv.addEventListener('mouseleave', () => { st.hover = -1; st.tip.style.display = 'none'; dnDraw(st); });
  }
  const W = host.clientWidth || 460, H = opts.height || 340;
  st.W = W; st.H = H; st.ctx = setupCanvas(st.cv, W, H);
  const R = Math.min(W * 0.27, 150);
  st.g = { R, r: R * 0.55, t: 0.5, H0: 16, cx: W / 2, cy: H * 0.66 };
  const HMAX = Math.min(120, H * 0.36);
  const metric = s => Math.max(0, s.extra || 0);
  const mx = Math.max(1e-9, ...slices.map(metric));
  const tgt = slices.map(s => ({ ...s, h: opts.bonus === false ? 0 : HMAX * metric(s) / mx }));
  if (st.stop) st.stop();
  const from = opts.intro ? null : (st.cur || DN.last);
  if (!from || from.length !== tgt.length) {
    st.cur = tgt; st.sweep = 0; st.rise = 0; dnDraw(st);
    st.stop = tween(620, q => { st.sweep = q; dnDraw(st); }, () => { st.stop = tween(560, q => { st.rise = q; dnDraw(st); }); });
  } else {
    st.sweep = 1; st.rise = 1;
    st.stop = tween(520, q => {
      st.cur = tgt.map((s, i) => { const f = from[i]; const L = (a, b) => (a || 0) + ((b || 0) - (a || 0)) * q; return { ...s, value: L(f.value, s.value), extra: L(f.extra, s.extra), rate: L(f.rate, s.rate), h: L(f.h, s.h), color: mixHex(f.color, s.color, q) }; });
      dnDraw(st);
    });
  }
  DN.last = tgt;
}
function dnGeo(st) {
  const { R, r, t, cx, cy } = st.g; const O0 = { x: 0, y: 0 };
  const P = (ang, rad, z, o = O0) => [cx + o.x + rad * Math.cos(ang), cy + o.y + rad * Math.sin(ang) * t - z];
  const arc = (a0, a1, rad, z, o) => { const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 0.04)); const pts = []; for (let i = 0; i <= n; i++) pts.push(P(a0 + (a1 - a0) * i / n, rad, z, o)); return pts; };
  const poly = pts => { const p = new Path2D(); pts.forEach((q, i) => i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1])); p.closePath(); return p; };
  const top = (s, z) => poly(arc(s.a0, s.a1, R, z, s.o).concat(arc(s.a1, s.a0, r, z, s.o)));
  const wall = (a0, a1, rad, z0, z1, o) => poly(arc(a0, a1, rad, z0, o).concat(arc(a1, a0, rad, z1, o)));
  const clip = (a0, a1, front) => { const out = []; const TAU = Math.PI * 2; for (let k = -1; k <= 1; k++) { const lo = (front ? 0 : Math.PI) + k * TAU, hi = lo + Math.PI; const x0 = Math.max(a0, lo), x1 = Math.min(a1, hi); if (x1 > x0) out.push([x0, x1]); } return out; };
  return { P, arc, poly, top, wall, clip };
}
function dnDraw(st) {
  const ctx = st.ctx, W = st.W, H = st.H, { R, r, t, H0, cx, cy } = st.g; const G = dnGeo(st);
  const ff = getComputedStyle(document.body).fontFamily;
  ctx.clearRect(0, 0, W, H);
  const total = sum(st.cur, s => s.value);
  if (!(total > 0)) { st.S = []; ctx.fillStyle = '#929292'; ctx.font = '13px ' + ff; ctx.textAlign = 'center'; ctx.fillText('예산 데이터가 없어요', W / 2, H / 2); return; }
  // 매체 묶음 사이 틈(GAP) · 묶음 바깥 밀기(EX)
  const vg = [...new Set(st.cur.filter(s => s.value > 0).map(s => s.grp || ''))];
  const nb = vg.length > 1 ? vg.length : 0, GAP = nb ? 0.075 : 0, EX = nb ? 6 : 0, span = Math.PI * 2 - nb * GAP;
  let a = -Math.PI / 2 + GAP / 2 * st.sweep, pg = null;
  const S = st.S = st.cur.map(s => { if (s.value > 0) { if (pg != null && (s.grp || '') !== pg) a += GAP * st.sweep; pg = s.grp || ''; } const a0 = a; a += (s.value / total) * span * st.sweep; return { ...s, a0, a1: a, mid: (a0 + a) / 2, o: { x: 0, y: 0 } }; });
  if (EX) for (const g of vg) { const ss = S.filter(s => (s.grp || '') === g && s.value > 0); const gm = (Math.min(...ss.map(s => s.a0)) + Math.max(...ss.map(s => s.a1))) / 2; const o = { x: Math.cos(gm) * EX, y: Math.sin(gm) * EX * t }; S.forEach(s => { if ((s.grp || '') === g) s.o = o; }); }
  const hp = []; const hover = st.hover;
  ctx.fillStyle = 'rgba(38,38,38,.06)'; ctx.beginPath(); ctx.ellipse(cx, cy + 6, R * 1.04, R * t * 1.04, 0, 0, Math.PI * 2); ctx.fill();
  const lift = i => (i === hover ? 7 : 0);
  // 1) 바탕(예산) — 안쪽 벽(뒤) → 바깥 벽(앞) → 윗면
  for (const [i, s] of S.entries()) for (const [x0, x1] of G.clip(s.a0, s.a1, false)) { ctx.fillStyle = shade(s.color, -0.35); ctx.fill(G.wall(x0, x1, r, lift(i), H0 + lift(i), s.o)); }
  for (const [i, s] of S.entries()) for (const [x0, x1] of G.clip(s.a0, s.a1, true)) { ctx.fillStyle = shade(s.color, -0.22); ctx.fill(G.wall(x0, x1, R, lift(i), H0 + lift(i), s.o)); }
  for (const [i, s] of S.entries()) { if (s.a1 - s.a0 < 0.002) continue; const p = G.top(s, H0 + lift(i)); ctx.fillStyle = i === hover ? shade(s.color, 0.08) : s.color; ctx.fill(p); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.2; ctx.stroke(p); }
  // 2) 보너스 — 반투명 기둥, 뒤에서 앞으로
  const order = S.map((s, i) => i).sort((x, y) => Math.sin(S[x].mid) - Math.sin(S[y].mid));
  for (const i of order) {
    const s = S[i]; const z0 = H0 + lift(i), z1 = z0 + s.h * st.rise;
    if (s.a1 - s.a0 < 0.01 || z1 - z0 < 0.5) { hp[i] = G.top(s, z0); continue; }
    const col = s.color; const em = i === hover ? 1.7 : 1;
    const g = Math.min(0.035, (s.a1 - s.a0) * 0.14), b0 = s.a0 + g, b1 = s.a1 - g, Ro = R - 4, Ri = r + 4;
    const capB = ang => G.poly([G.P(ang, Ro, z0, s.o), G.P(ang, Ri, z0, s.o), G.P(ang, Ri, z1, s.o), G.P(ang, Ro, z1, s.o)]);
    ctx.fillStyle = rgba(col, 0.07 * em); ctx.fill(G.wall(b0, b1, Ri, z0, z1, s.o));
    ctx.fillStyle = rgba(col, 0.10 * em); ctx.fill(capB(b0)); ctx.fill(capB(b1));
    ctx.fillStyle = rgba(col, 0.16 * em); ctx.fill(G.wall(b0, b1, Ro, z0, z1, s.o));
    const tp = G.poly(G.arc(b0, b1, Ro, z1, s.o).concat(G.arc(b1, b0, Ri, z1, s.o))); ctx.fillStyle = rgba(col, 0.34 * em); ctx.fill(tp);
    // 테두리는 아주 옅게 (세로 모서리 선은 없앰) — 마우스를 올린 기둥만 조금 진하게
    ctx.strokeStyle = rgba(col, i === hover ? 0.5 : 0.18); ctx.lineWidth = i === hover ? 1.1 : 0.8; ctx.stroke(tp);
    const hit = new Path2D(); hit.addPath(tp); hit.addPath(G.wall(b0, b1, Ro, z0, z1, s.o)); hit.addPath(G.top(s, z0)); hp[i] = hit;
  }
  st.hp = hp;
  // 라벨 : 아래 불투명한 바탕(예산) 테두리 기준 + 짧은 지시선 (다 펼친 뒤에만)
  if (st.sweep > 0.98) for (const s of S) {
    const share = s.value / total; if (share < 0.035) continue;
    const sn = Math.sin(s.mid), cs = Math.cos(s.mid), front = sn > -0.05;
    const zz = front ? H0 * 0.5 : H0;
    const p0 = G.P(s.mid, R + 1, zz, s.o), p1 = G.P(s.mid, R + 20, zz, s.o);
    const side = cs > 0.12 ? 1 : cs < -0.12 ? -1 : 0;
    const ex = p1[0] + side * 8, ey = p1[1] + (front ? 6 : -4);
    ctx.strokeStyle = shade(s.color, -0.3); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(ex, p1[1]); ctx.stroke();
    ctx.fillStyle = shade(s.color, -0.3); ctx.beginPath(); ctx.arc(p0[0], p0[1], 2, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = side > 0 ? 'left' : side < 0 ? 'right' : 'center';
    const l1 = `${s.label} ${Math.round(share * 100)}%`, l2 = fmt.eok(s.value, 1);
    ctx.font = '600 12px ' + ff; const tw = ctx.measureText(l1).width;
    let tx = side ? ex + side * 3 : p1[0]; const ty1 = front ? ey + 9 : ey - 12, ty2 = ty1 + 14;
    if (side < 0) tx = Math.max(tw + 4, tx); else if (side > 0) tx = Math.min(W - tw - 4, tx);
    ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.94)';
    ctx.strokeText(l1, tx, ty1); ctx.fillStyle = '#262626'; ctx.fillText(l1, tx, ty1);
    ctx.font = '11px ' + ff; ctx.strokeText(l2, tx, ty2); ctx.fillStyle = '#616161'; ctx.fillText(l2, tx, ty2);
  }
  // 가운데 글자 (지금 그려지는 값 기준)
  const c1 = fmt.eok(total, 1), c2 = `보너스 ${fmt.eok(sum(st.cur, s => s.extra), 1)}`;
  ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.92)';
  ctx.font = '700 15px ' + ff; ctx.strokeText(c1, cx, cy - H0 - 4); ctx.fillStyle = '#262626'; ctx.fillText(c1, cx, cy - H0 - 4);
  ctx.font = '12px ' + ff; ctx.strokeText(c2, cx, cy - H0 + 13); ctx.fillStyle = '#616161'; ctx.fillText(c2, cx, cy - H0 + 13);
}
function dnMove(st, e) {
  if (!st.S || !st.S.length) return;
  const rc = st.cv.getBoundingClientRect(); const x = e.clientX - rc.left, y = e.clientY - rc.top;
  const sx = st.cv.width / st.W, sy = st.cv.height / st.H; const S = st.S, hp = st.hp || []; const G = dnGeo(st);
  const order = S.map((s, i) => i).sort((p, q) => Math.sin(S[q].mid) - Math.sin(S[p].mid));
  let h = -1;
  for (const i of order) if (hp[i] && st.ctx.isPointInPath(hp[i], x * sx, y * sy)) { h = i; break; }
  if (h < 0) for (const i of order) { if (st.ctx.isPointInPath(G.top(S[i], st.g.H0), x * sx, y * sy)) { h = i; break; } }
  if (h !== st.hover) { st.hover = h; dnDraw(st); }
  if (h >= 0) { const s = S[h]; const total = sum(S, z => z.value); tipShow(st.tip, st.host, x, y, `<b>${s.grp ? esc(s.grp) + ' · ' : ''}${esc(s.label)}</b><div>예산 ${fmt.eok(s.value, 2)} <span class="m">(${fmt.pct(s.value / total)})</span></div><div>보너스 ${fmt.eok(s.extra, 2)} · 보너스율 ${fmt.pct(s.value ? s.extra / s.value : null)}</div><div class="m">예산+보너스 ${fmt.eok(s.value + s.extra, 2)}</div>`); }
  else st.tip.style.display = 'none';
}

// ---------- 품목별 예산과 보너스 : 예산이 먼저 차오르고 → 보너스가 이어서 뻗음 ----------
const BARS = { last: null };
function itemBars(host, rows, opts = {}) {
  const B = sum(rows, x => x.budget) || 1;
  const mxRaw = Math.max(1, ...rows.map(x => x.budget + Math.max(0, x.bonus)));
  const stepE = [1, 2, 5, 10, 20, 50, 100].find(s => mxRaw / 1e8 / s <= 6) || 200;
  const mx = Math.ceil(mxRaw * 1.1 / (stepE * 1e8)) * stepE * 1e8;
  const ticks = []; for (let v = 0; v <= mx + 1; v += stepE * 1e8) ticks.push(v);
  host.innerHTML = `<div class="ibars">
    <div class="ib-grid">${ticks.map(v => `<i style="left:${v / mx * 100}%"></i>`).join('')}</div>
    ${rows.map((x, i) => `<div class="ibr" data-i="${i}"><div class="nm"><b>${esc(x.k)}</b><small>예산 비중 ${fmt.pct(x.budget / B)}</small></div>
      <div class="trk"><div class="bx" style="background:${rgba(x.color, .28)}"></div><div class="bb" style="background:${x.color}"></div><span class="lbb"></span><span class="lbx"></span><span class="lbv" style="color:${x.color}"></span></div></div>`).join('')}
    <div class="ib-scale">${ticks.map(v => `<span style="left:${v / mx * 100}%">${Math.round(v / 1e8)}억</span>`).join('')}</div></div>`;
  // 데이터 레이블: ① 예산 = 진한 막대 안 끝 ② 보너스 = 옅은 막대 안 끝 ③ 예산+보너스(밸류) = 막대 바깥, 품목 색 글자
  //   막대가 짧아 글자가 안 들어가면 ①은 옅은 막대 시작 쪽으로, ②는 숨김(마우스를 올리면 툴팁에 다 나옴)
  const els = [...host.querySelectorAll('.ibr')].map(r => ({ trk: r.querySelector('.trk'), bb: r.querySelector('.bb'), bx: r.querySelector('.bx'), lbb: r.querySelector('.lbb'), lbx: r.querySelector('.lbx'), lbv: r.querySelector('.lbv') }));
  const set = (vals) => {
    rows.forEach((x, i) => {
      const e = els[i], v = vals[i]; const wb = v.b / mx * 100, wx = Math.max(0, v.x) / mx * 100;
      e.bb.style.width = wb + '%'; e.bx.style.left = wb + '%'; e.bx.style.width = wx + '%';
      const TW = e.trk.clientWidth || 1, pb = TW * wb / 100, px = TW * wx / 100;
      e.lbb.textContent = v.b > 0 ? fmt.eok(v.b, 1) : '';
      const bw = e.lbb.offsetWidth; const inB = bw + 12 <= pb;
      e.lbb.classList.toggle('out', !inB); e.lbb.style.color = inB ? '#fff' : shade(x.color, -0.42);
      e.lbb.style.left = inB ? (pb - bw - 7) + 'px' : (pb + 6) + 'px';
      e.lbx.textContent = v.x > 0.5e6 ? '+' + fmt.eok(v.x, 1) : '';
      const xw = e.lbx.offsetWidth, used = inB ? pb : pb + 6 + bw;
      const okX = xw && pb + px - xw - 8 > used + 6;
      e.lbx.style.visibility = okX ? '' : 'hidden'; e.lbx.style.left = (pb + px - xw - 7) + 'px'; e.lbx.style.color = shade(x.color, -0.45);
      e.lbv.textContent = v.b + v.x > 0 ? fmt.eok(v.b + Math.max(0, v.x), 1) : '';
      e.lbv.style.left = (pb + px + 7) + 'px';
    });
  };
  const target = rows.map(x => ({ b: x.budget, x: Math.max(0, x.bonus) }));
  const prev = !opts.intro && BARS.last ? rows.map(x => BARS.last.get(x.k) || { b: 0, x: 0 }) : null;
  if (host._stop) host._stop();
  if (prev) { set(prev); host._stop = tween(480, q => set(target.map((t, i) => ({ b: prev[i].b + (t.b - prev[i].b) * q, x: prev[i].x + (t.x - prev[i].x) * q })))); }
  else { set(target.map(() => ({ b: 0, x: 0 }))); host._stop = tween(560, q => set(target.map(t => ({ b: t.b * q, x: 0 }))), () => { host._stop = tween(620, q => set(target.map(t => ({ b: t.b, x: t.x * q })))); }); }
  BARS.last = new Map(rows.map((x, i) => [x.k, target[i]]));
  host.querySelectorAll('.ibr').forEach(r => {
    const x = rows[+r.dataset.i];
    r.addEventListener('mousemove', e => ftip(e, `<b><span class="sw" style="background:${x.color}"></span>${esc(x.k)}</b><div>예산 ${fmt.eok(x.budget, 2)} <span class="m">(비중 ${fmt.pct(x.budget / B)})</span></div><div>보너스 ${fmt.eok(x.bonus, 2)} · 보너스율 ${x.budget ? fmt.pct(x.bonus / x.budget) : '-'}</div><div class="m">예산+보너스 ${fmt.eok(x.budget + x.bonus, 2)}</div>`));
    r.addEventListener('mouseleave', ftipHide);
  });
}

// ---------- 주차별 송출 수 : 왼쪽 주차별 누적 막대 + 오른쪽 일별(하루 = 막대 1개, 품목 색으로 쌓음) ----------
// 주차를 누르면 왼쪽에서 그 주 날짜만 진하게 · 품목 칩을 고르면 그 품목만 진하게 · ▶ 재생 = 하루씩 쌓이며 주차 합계도 함께 자람
function dailyStack(host, spots, opts) {
  const days = opts.days, ym = opts.ym, weeks = opts.weeks || [];
  const order = opts.itemOrder.slice();
  const byDay = Array.from({ length: days + 1 }, () => new Map());
  const media = Array.from({ length: days + 1 }, () => ({ 지상파: 0, 케이블: 0 }));
  for (const s of spots) {
    if (!(s.day >= 1 && s.day <= days)) continue;
    const n = s.cnt || 1; const m = byDay[s.day];
    m.set(s.item, (m.get(s.item) || 0) + n);
    if (!order.includes(s.item)) order.push(s.item);
    media[s.day][s.media] = (media[s.day][s.media] || 0) + n;
  }
  const dayTot = d => { let t = 0; for (const v of byDay[d].values()) t += v; return t; };
  const tot = Array.from({ length: days + 1 }, (_, d) => d ? dayTot(d) : 0);
  const total = sum(tot, x => x);
  const wkOf = d => weeks.findIndex(w => d >= w.from && d <= w.to);
  const wkItem = (w, k, upto = days) => { let t = 0; for (let d = w.from; d <= Math.min(w.to, upto); d++) t += byDay[d].get(k) || 0; return t; };
  const wkTot = (w, upto = days) => { let t = 0; for (let d = w.from; d <= Math.min(w.to, upto); d++) t += tot[d]; return t; };
  const wmax = Math.max(1, ...weeks.map(w => wkTot(w)));
  // 13차: 왼쪽 = 주차별(먼저 읽는 쪽), 오른쪽 = 일별 막대
  host.innerHTML = `<div class="dstk"><div class="dstk-r"><div class="dstk-h">주차별 <span>누르면 그 주를 강조</span></div>
    ${weeks.map((w, i) => `<button type="button" class="wkr" data-w="${i}"><span class="t"><b>${w.label}</b><span class="rg">${esc(w.range)}</span><em class="tnum" data-wt="${i}">${fmt.int(wkTot(w))}</em></span><span class="bar" data-wb="${i}"></span></button>`).join('')}</div>
    <div class="dstk-l chost"><div class="dstk-h">일별 <span>막대 = 하루 · 품목 색으로 쌓음</span></div><canvas></canvas><div class="ctip"></div></div></div>`;
  const pane = host.querySelector('.dstk-l'), cv = pane.querySelector('canvas'), tip = pane.querySelector('.ctip');
  const ffam = getComputedStyle(document.body).fontFamily;
  let focus = opts.focus || null, selW = null, hoverD = 0, prog = days + 1, stopPlay = null, rise = 1;
  const maxDay = Math.max(1, ...tot);
  const step = maxDay <= 40 ? 10 : maxDay <= 120 ? 25 : maxDay <= 300 ? 50 : 100;
  const ymax = Math.ceil(maxDay / step) * step;
  let W, H, ctx, left = 40, right = 6, topP = 36, bottom = 34, bw, plotH;   // 위쪽 = 주차 띠
  function layout() {
    W = pane.clientWidth || 760; H = 300; plotH = H - topP - bottom; bw = (W - left - right) / days;
    ctx = setupCanvas(cv, W, H);
  }
  const colOf = (k, d) => {
    const c = itemColor(k);
    const dimW = selW != null && wkOf(d) !== selW, dimI = focus && k !== focus;
    return dimW || dimI ? tint(c, dimW && dimI ? 0.86 : 0.74) : c;
  };
  function draw() {
    ctx.clearRect(0, 0, W, H);
    const baseY = topP + plotH;
    if (selW != null && weeks[selW]) { const w = weeks[selW]; const x = left + (w.from - 1) * bw; ctx.fillStyle = '#f3f3f3'; roundRect(ctx, x - 1, 2, (w.to - w.from + 1) * bw + 2, H - 4, 8); ctx.fill(); }
    // 주차 띠: 그 주 날짜 위를 얇고 연한 띠로 묶고 'N주차'
    weeks.forEach((w, i) => {
      const x = left + (w.from - 1) * bw + 2, ww = (w.to - w.from + 1) * bw - 4, on = selW === i, dim = selW != null && !on;
      ctx.fillStyle = on ? '#d8d8d8' : i % 2 ? '#ededed' : '#f3f3f3'; roundRect(ctx, x, 8, ww, 17, 5); ctx.fill();
      ctx.font = (on ? '700 ' : '600 ') + '11px ' + ffam; ctx.textAlign = 'center'; ctx.fillStyle = dim ? '#b1b1b1' : on ? '#454545' : '#696969';
      const lab = ww > 92 ? `${w.label}차 · ${w.range}` : ww > 40 ? `${w.label}차` : w.label;
      ctx.fillText(lab, x + ww / 2, 20.5);
    });
    if (hoverD && prog > days) { ctx.fillStyle = 'rgba(38,38,38,.05)'; ctx.fillRect(left + (hoverD - 1) * bw, topP, bw, plotH); }
    ctx.font = '10.5px ' + ffam; ctx.textAlign = 'right';
    for (let v = 0; v <= ymax; v += step) { const y = Math.round(baseY - plotH * v / ymax) + 0.5; ctx.fillStyle = '#a2a2a2'; ctx.fillText(String(v), left - 7, y + 3.5); ctx.strokeStyle = v ? '#f0f0f0' : '#d5d5d5'; ctx.beginPath(); ctx.moveTo(left - 2, y); ctx.lineTo(W - right, y); ctx.stroke(); }
    const gap = Math.max(2, bw * 0.22), bwi = bw - gap;
    for (let d = 1; d <= days; d++) {
      const vis = prog >= d + 1 ? 1 : prog > d ? easeOut(prog - d) : 0;
      const q = vis * rise;
      const x = left + (d - 1) * bw + gap / 2;
      let y = baseY;
      if (q > 0) for (const k of order) {
        const v = byDay[d].get(k); if (!v) continue;
        const h = plotH * v / ymax * q; y -= h;
        ctx.fillStyle = colOf(k, d); ctx.fillRect(x, y, bwi, Math.max(0, h - (h > 3 ? 1.2 : 0)));
      }
      const dw = dowOf(ym.y, ym.m, d);
      const dim = selW != null && wkOf(d) !== selW;
      ctx.textAlign = 'center'; ctx.font = (hoverD === d ? '600 ' : '') + '10.5px ' + ffam;
      ctx.fillStyle = dw === '일' ? (dim ? '#e6a7a2' : '#d6453d') : dw === '토' ? (dim ? '#e6a7a2' : '#d6453d') : (dim ? '#bebebe' : '#737373');
      ctx.fillText(String(d), x + bwi / 2, baseY + 14); ctx.fillText(dw, x + bwi / 2, baseY + 27);
    }
    // 오른쪽 주차 막대 (재생 중에는 지금 날짜까지)
    const upto = prog > days ? days : Math.floor(prog);
    weeks.forEach((w, i) => {
      const bar = host.querySelector(`[data-wb="${i}"]`), t = host.querySelector(`[data-wt="${i}"]`); if (!bar) return;
      const wt = wkTot(w, upto);
      t.textContent = fmt.int(wt);
      bar.innerHTML = `<span class="fill" style="width:${(wt / wmax * 100).toFixed(2)}%">${order.map(k => { const v = wkItem(w, k, upto); return v ? `<i style="flex:${v};background:${focus && k !== focus ? tint(itemColor(k), 0.74) : itemColor(k)}"></i>` : ''; }).join('')}</span>`;
    });
    host.querySelectorAll('.wkr').forEach(b => b.classList.toggle('on', selW === +b.dataset.w));
    if (opts.onTick) { const dd = Math.max(1, Math.min(days, Math.floor(prog))); opts.onTick(prog > days ? `${ym.m}/1~${days} · ${fmt.int(total)}회` : `${ym.m}/${dd} (${dowOf(ym.y, ym.m, dd)}) · 누적 ${fmt.int(sum(tot.slice(0, dd + 1), x => x))}회`, prog <= days); }
  }
  layout(); draw();
  // 처음 열 때: 막대가 아래에서 솟아오름
  if (opts.intro && !reduceMotion()) { rise = 0; tween(700, q => { rise = q; draw(); }); }
  cv.addEventListener('mousemove', e => {
    if (prog <= days) return;
    const rc = cv.getBoundingClientRect(); const x = e.clientX - rc.left, y = e.clientY - rc.top;
    const d = Math.floor((x - left) / bw) + 1;
    if (d < 1 || d > days || y > H - 4) { if (hoverD) { hoverD = 0; draw(); } tip.style.display = 'none'; return; }
    if (y < topP - 6) { const w = weeks[wkOf(d)]; if (hoverD) { hoverD = 0; draw(); } if (w) { const t = wkTot(w); tipShow(tip, pane, x, y + cv.offsetTop + 40, `<b>${w.label}차 · ${esc(w.range)} · ${fmt.int(t)}회</b><div class="m">일평균 ${fmt.dec(t / (w.to - w.from + 1), 1)}회 · 누르면 이 주 강조</div>`); } return; }
    if (d !== hoverD) { hoverD = d; draw(); }
    const w = weeks[wkOf(d)];
    const lines = order.filter(k => byDay[d].get(k)).map(k => `<div class="row"><span class="sw" style="background:${itemColor(k)}"></span>${esc(k)}<em>${fmt.int(byDay[d].get(k))}</em></div>`).join('');
    tipShow(tip, pane, x, y + cv.offsetTop, `<b>${ym.m}/${d} (${dowOf(ym.y, ym.m, d)}) · ${fmt.int(tot[d])}회</b><div class="m">${w ? w.label + ' · ' : ''}지상파 ${fmt.int(media[d].지상파 || 0)} · 케이블 ${fmt.int(media[d].케이블 || 0)}</div>${lines || '<div class="m">송출 없음</div>'}`);
  });
  cv.addEventListener('mouseleave', () => { hoverD = 0; tip.style.display = 'none'; draw(); });
  cv.addEventListener('click', e => { const rc = cv.getBoundingClientRect(); const d = Math.floor((e.clientX - rc.left - left) / bw) + 1; if (d >= 1 && d <= days) { const i = wkOf(d); selW = selW === i ? null : i; draw(); } });
  host.querySelectorAll('.wkr').forEach(b => {
    const i = +b.dataset.w, w = weeks[i];
    b.addEventListener('click', () => { selW = selW === i ? null : i; draw(); });
    b.addEventListener('mousemove', e => { const t = wkTot(w); ftip(e, `<b>${w.label} · ${esc(w.range)} · ${fmt.int(t)}회</b><div class="m">일평균 ${fmt.dec(t / (w.to - w.from + 1), 1)}회 · ${w.to - w.from + 1}일</div>${order.filter(k => wkItem(w, k)).map(k => `<div><span class="sw" style="background:${itemColor(k)}"></span> ${esc(k)} ${fmt.int(wkItem(w, k))}회 <span class="m">${fmt.pct(wkItem(w, k) / (t || 1))}</span></div>`).join('')}`); });
    b.addEventListener('mouseleave', ftipHide);
  });
  let rt = null;
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { if (Math.abs((pane.clientWidth || 0) - W) > 2) { layout(); draw(); } }, 80); }) : null;
  if (ro) ro.observe(pane);
  return {
    total,
    setFocus(f) { focus = f; draw(); },
    setWeek(i) { selW = i; draw(); },
    play() { if (stopPlay) stopPlay(); hoverD = 0; tip.style.display = 'none'; rise = 1; prog = 1; stopPlay = tween(Math.max(2800, days * 120), q => { prog = 1 + q * days; draw(); }, () => { prog = days + 1; stopPlay = null; draw(); }); },
    stop() { if (stopPlay) stopPlay(); stopPlay = null; prog = days + 1; draw(); },
    playing() { return !!stopPlay; },
    destroy() { if (ro) ro.disconnect(); if (stopPlay) stopPlay(); },
  };
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// ---------- 중CM · PIB 비중 : 100% 누적 막대 (왼쪽부터 중CM → PIB → 전후CM 등, 중요도 순 같은 계열 색) ----------
const CMC = { mid: '#454545', pib: '#919191', fb: '#e4e4e4' };
function cmRows(cells, unit) {
  const m = new Map();
  for (const c of cells) {
    if (!c.cnt) continue;
    const pp = c.media === '지상파' ? c.ch : c.mpp;
    const ppName = c.media === '케이블' && ['KBS', 'MBC', 'SBS'].includes(pp) ? pp + ' 계열' : pp;
    const key = unit === 'ch' ? 'c|' + c.ch : c.media + '|' + pp;
    const x = m.get(key) || { media: c.media, name: unit === 'ch' ? c.ch : ppName, pp: ppName, order: c.chOrder, n: 0, mid: 0, pib: 0, fb: 0, budget: 0, chs: new Set() };
    x.n += c.cnt; x.mid += c.cmc.중CM || 0; x.pib += c.cmc.PIB || 0; x.fb += (c.cmc.전후CM || 0) + (c.cmc.일반 || 0); x.budget += c.budget; x.chs.add(c.ch); x.order = Math.min(x.order, c.chOrder);
    m.set(key, x);
  }
  return [...m.values()].map(x => ({ ...x, sm: x.n ? x.mid / x.n : 0, sp: x.n ? x.pib / x.n : 0, sf: x.n ? x.fb / x.n : 0 }));
}
function cmStackHtml(cells, unit, sort) {
  const rows = cmRows(cells, unit);
  if (!rows.length) return { html: '<div class="empty">송출 데이터가 없어요</div>', rows };
  const key = { mid: r => r.sm, prem: r => r.sm + r.sp, n: r => r.n }[sort] || (r => r.sm);
  const ordered = [];
  const bar = (r, min) => `<div class="trk"><i class="mid" data-w="${(r.sm * 100).toFixed(2)}">${r.sm >= min ? Math.round(r.sm * 100) + '%' : ''}</i><i class="pib" data-w="${(r.sp * 100).toFixed(2)}">${r.sp >= min ? Math.round(r.sp * 100) + '%' : ''}</i><i class="fb">${r.sf >= min + 0.03 ? Math.round(r.sf * 100) + '%' : ''}</i></div>`;
  const media = ['지상파', '케이블'].filter(m => rows.some(r => r.media === m));
  // ① 매체 합계: 따로 상자에 크게 (세부 막대와 한눈에 구분)
  let tot = '';
  for (const m of media) {
    const l = rows.filter(r => r.media === m);
    const n = sum(l, r => r.n), x = sum(l, r => r.mid), y = sum(l, r => r.pib), z = sum(l, r => r.fb);
    const T = { media: m, name: `${m} 전체`, pp: `${m} 전체`, n, mid: x, pib: y, fb: z, budget: sum(l, r => r.budget), chs: new Set(l.flatMap(r => [...r.chs])), sm: n ? x / n : 0, sp: n ? y / n : 0, sf: n ? z / n : 0, tot: 1 };
    const ti = ordered.push(T) - 1;
    tot += `<div class="cmsr tot" data-i="${ti}"><div class="nm"><span class="mtag ${m === '지상파' ? 'g' : 'c'}">${m}</span>전체</div>${bar(T, 0.05)}<div class="n tnum"><b>${fmt.pct(T.sm + T.sp)}</b><small>중CM+PIB · ${fmt.int(n)}회</small></div></div>`;
  }
  let h = `<div class="cmsb${unit === 'ch' ? ' ch' : ''}">`;   // 매체 합계는 위의 도넛 두 개로 (cmDonutsHtml)
  // ② 세부 (PP별 / 채널별)
  for (const m of media) {
    const l = rows.filter(r => r.media === m).sort((a, b) => key(b) - key(a) || b.n - a.n);
    h += `<div class="cmsb-g">${m}<span>${unit === 'ch' ? '채널별' : 'PP별'} ${l.length}</span></div>`;
    for (const r of l) {
      const i = ordered.push(r) - 1;
      h += `<div class="cmsr" data-i="${i}"><div class="nm">${esc(r.name)}${unit === 'ch' && r.pp !== r.name ? `<small>${esc(r.pp)}</small>` : ''}</div>${bar(r, 0.07)}<div class="n tnum">${fmt.int(r.n)}회</div></div>`;
    }
  }
  return { html: h + '</div>', rows: ordered };
}
// 그린 뒤 호출: 막대가 왼쪽부터 차오르고, 마우스를 올리면 상세
function cmStackBind(root, rows, unit) {
  const segs = [...root.querySelectorAll('.cmsr .trk i[data-w]')];
  const go = () => segs.forEach(b => { b.style.width = b.dataset.w + '%'; });
  if (reduceMotion()) { segs.forEach(b => { b.style.transition = 'none'; }); go(); }
  else requestAnimationFrame(() => requestAnimationFrame(go));
  root.querySelectorAll('.cmsr').forEach(el => {
    const r = rows[+el.dataset.i]; if (!r) return;
    el.addEventListener('mousemove', e => ftip(e, `<b>${esc(r.name)}</b> <span class="m">${r.media}${unit === 'ch' && r.pp !== r.name ? ' · ' + esc(r.pp) : ''}</span>
      <div><span class="sw" style="background:${CMC.mid}"></span> 중CM ${fmt.int(r.mid)}회 · ${fmt.pct(r.sm)}</div>
      <div><span class="sw" style="background:${CMC.pib}"></span> PIB ${fmt.int(r.pib)}회 · ${fmt.pct(r.sp)}</div>
      <div><span class="sw" style="background:${CMC.fb}"></span> 전후CM 등 ${fmt.int(r.fb)}회 · ${fmt.pct(r.sf)}</div>
      <div class="m">송출 ${fmt.int(r.n)}회${unit === 'pp' && r.chs.size > 1 ? ' · 채널 ' + [...r.chs].map(esc).join(', ') : ''} · 예산 ${fmt.eok(r.budget, 2)}</div>`));
    el.addEventListener('mouseleave', ftipHide);
  });
}

// ---------- 바뀐 값 반짝임 : 다시 그리기 전후로 data-ck 칸을 비교 ----------
function ckText(e) { let t = ''; for (const n of e.childNodes) if (!(n.classList && n.classList.contains('dbadge'))) t += n.textContent; return t.trim(); }
function ckSnapshot(root) { const m = new Map(); root.querySelectorAll('[data-ck]').forEach(e => m.set(e.dataset.ck, ckText(e))); return m; }
function ckParse(t) {
  const s = String(t || '').replace(/\s/g, '');
  let m = s.match(/^(-?[\d,.]+)억$/); if (m) return { v: num(m[1]) * 1e8, u: 'eok' };
  m = s.match(/^(-?[\d,.]+)%$/); if (m) return { v: num(m[1]), u: 'pct' };
  m = s.match(/^(-?[\d,.]+)(회)?$/); if (m) return { v: num(m[1]), u: m[2] ? 'cnt' : 'n' };
  return null;
}
function ckFlash(root, prev) {
  if (!prev || !prev.size) return 0;
  let n = 0;
  root.querySelectorAll('[data-ck]').forEach(e => {
    const k = e.dataset.ck; if (!prev.has(k)) return;
    const a = prev.get(k), b = ckText(e); if (a === b || n > 400) return;
    n++; e.classList.remove('chg'); void e.offsetWidth; e.classList.add('chg');
    const x = ckParse(a), y = ckParse(b);
    if (x && y && x.u === y.u && x.v != null && y.v != null && y.v !== x.v) {
      const d = y.v - x.v; const up = d > 0;
      const ad = Math.abs(d);
      const txt = x.u === 'eok' ? fmt.dec(ad / 1e8, 2) + '억' : x.u === 'pct' ? fmt.dec(ad, 1) + '%p' : Number.isInteger(x.v) && Number.isInteger(y.v) ? fmt.int(ad) : fmt.dec(ad, ad < 1 ? 2 : 1);
      const bd = document.createElement('span'); bd.className = 'dbadge ' + (up ? 'up' : 'dn'); bd.textContent = (up ? '▲ +' : '▼ −') + txt;
      if (getComputedStyle(e).position === 'static') e.style.position = 'relative';
      e.appendChild(bd); setTimeout(() => bd.remove(), 2200);
    }
    setTimeout(() => e.classList.remove('chg'), 2300);
  });
  return n;
}
