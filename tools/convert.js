// 예전 통합 큐시트 엑셀 → 이 도구의 작업 내용(JSON · 백업 엑셀)으로 변환 (개발용)
// 사용: LANG=C.UTF-8 node tools/convert.js out_dir file1.xlsx[:라벨] file2.xlsx ...   (연도는 YEAR=2026 환경변수, 기본 2026)
// 결과: out_dir/YYYY-MM.json (CLOUD.parts 형식 + 요약 + 엑셀 대조표), out_dir/코웨이TV큐시트_YYYYMM_백업.xlsx
// 엑셀 '운영 요약' 상단 표를 기준값으로 씀:
//   ① 목표 CPRP — 달마다 다름(1월 KBS 165만 등). 방송사 하나짜리 그룹(KBS·MBC·SBS·CJ ENM·JTBC)은 금액 ÷ eq.GRP,
//      '기타'는 여러 PP라 PP별 기본값에 같은 배수를 곱해 eq.GRP 합계를 맞춤
//   ② GRP 초수 비중 — GRP ÷ eq.GRP = 15초 환산 계수 → 15·30초 비중 (소재 탭 비중과 다를 때만)
//   ③ R1·R3 — 누적리치 시트가 없는 달(1~6월)은 엑셀 값을 '직접 입력'으로, 있는 달은 다를 때만
//   ④ 주요 프로그램 문구 — 엑셀에 적힌 그대로
//   ⑤ 1~2월 케이블 단가 — 채널별 시트에 단가가 없어 피벗 '방송 Value'를 초수 비례로 나눠 채움(채널×품목 합계는 엑셀과 같음)
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const OUT = path.resolve(process.argv[2]); fs.mkdirSync(OUT, { recursive: true });
const files = process.argv.slice(3);
const YEAR = +(process.env.YEAR || 2026);
const URL = 'file://' + path.resolve(__dirname, '../dist/코웨이TV큐시트.html');
(async () => {
  const UD = fs.mkdtempSync('/tmp/cv-');
  const ctx = await chromium.launchPersistentContext(UD, { viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  const p = ctx.pages()[0] || await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(800);
  await p.addScriptTag({ content: fs.readFileSync(path.resolve(__dirname, 'legacy.js'), 'utf8') });
  for (const arg of files) {
    const [f, label] = arg.split(':');
    const b64 = fs.readFileSync(f).toString('base64');
    const res = await p.evaluate(async ({ b64, label, YEAR }) => {
      const bin = atob(b64); const buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      const R = legacyToWS(buf, { year: YEAR }); const P = R.parts;
      const planNotes = [];
      // 빈 작업에서 시작 → 앱의 '넣기'와 같은 순서로 반영 (마스터는 새 이름만 추가)
      WS = emptyWorkspace(P.ym); if (P.start) WS.start = P.start; if (P.end) WS.end = P.end; WS.adv = '코웨이';
      for (const k of ['지상파', '케이블', '예산', '소재']) if (P[k]) WS.sheets[k] = P[k];
      { let n = 0; const dj = colIndex('케이블', 'date'); for (const r of WS.sheets.케이블) { const m = String(r[dj] == null ? '' : r[dj]).trim().match(/^(\d{2})(\d{2})$/); if (m && +m[1] >= 1 && +m[1] <= 12) { r[dj] = m[1] + '/' + m[2]; n++; } } if (n) planNotes.push(`케이블 날짜 ${n}칸 '0301' → '03/01'`); }
      if (P.reach) { WS.reach = P.reach; WS.reachMeta = P.reachMeta || {}; }
      fixWS(WS);
      if (P.master) App.mergeMaster(P.master);
      // 예전 품목·이름 (기본 마스터에 없는 것)
      const rawNames = [].concat((WS.sheets.예산[0] || []).slice(1), WS.sheets.케이블.map(r => r[1]), WS.sheets.지상파.map(r => r[11]), WS.sheets.소재.map(r => r[0])).map(norm);
      if (rawNames.some(n => n === '트리플' || n === '트리플체어') && !WS.sheets.품목.some(r => r[0] === '트리플체어')) {
        const at = WS.sheets.품목.findIndex(r => r[0] === '트리플체어2');
        WS.sheets.품목.splice(at >= 0 ? at + 1 : WS.sheets.품목.length, 0, ['트리플체어', '트리플체어', '안마의자', '#5b2f66', '']);
        planNotes.push('품목 추가: 트리플체어(안마의자)');
      }
      WS.itemLegacy = Object.assign({}, WS.itemLegacy, { 비데: '룰루비데', 마사지셋: '마사지셋/코어셋, 코어셋', 트리플체어: '트리플', 아이콘프로: '아이콘 프로' });
      fillGroundKind(WS.sheets.지상파);
      // 구분이 아예 비어 있는 채널 블록(예: 7·8월 SBS)은 정기물로
      for (const r of WS.sheets.지상파) if (!isBlankRow(r) && !str(r[1])) r[1] = '정기물';
      setM(compute(WS));
      // 약칭이 아닌 품목 이름 → 약칭으로 (노란 알림의 '모두 약칭으로 고치기'와 같음)
      const wrong = App.wrongItemNames(); const fixed = [];
      for (const x of wrong) { const n = renameEverywhere('item', x.raw, x.key); fixed.push(`${x.raw}→${x.key} ${n.total}`); }
      setM(compute(WS));
      // ⑤ 1~2월 케이블 단가
      if (P.valueXL) {
        const V = new Map();
        for (const [k, v] of Object.entries(P.valueXL)) {
          const [ch, it] = k.split('|'); const c = resolveCh(M.MS, ch), key = resolveItemLoose(M.MS, it) || resolveItemLoose(M.MS, it.split('/')[0]);
          if (!c || !key) { planNotes.push(`방송 Value ${ch}·${it} ${v}: 이름을 못 찾음`); continue; }
          if (c.media !== '케이블') continue;
          V.set(c.name + '|' + key, (V.get(c.name + '|' + key) || 0) + v);
        }
        // 편성(채널·프로그램·요일·시작·CM)마다 15초 단가 하나 → 같은 편성은 품목이 달라도 같은 단가(초수 비례).
        // 채널 평균에서 시작해 품목별 합계가 엑셀 방송 Value와 같아질 때까지 곱셈 반복. 안 되는 채널은 품목별 평균
        const rows = WS.sheets.케이블;
        const info = rows.map((r, i) => { const c = resolveCh(M.MS, r[0]), key = resolveItem(M.MS, r[1]); return c && key ? { i, ch: c.name, item: key, slot: [c.name, cleanProg(r[2]) || str(r[2]), str(r[3]), str(r[4]), str(r[8])].join('|'), w: (+r[7] || 15) / 15 } : null; }).filter(Boolean);
        let miss = 0, fb = [], slotN = 0;
        for (const ch of [...new Set(info.map(x => x.ch))]) {
          const L = info.filter(x => x.ch === ch);
          const its = [...new Set(L.map(x => x.item))];
          for (const it of its.filter(it => !V.get(ch + '|' + it))) { const n = L.filter(x => x.item === it); miss += n.length; planNotes.push(`${ch}·${it} ${n.length}회: 방송 Value 없음 → 단가 0`); n.forEach(x => rows[x.i][9] = 0); }
          const I = its.filter(it => V.get(ch + '|' + it)); if (!I.length) continue;
          const LL = L.filter(x => I.includes(x.item));
          const slots = [...new Set(LL.map(x => x.slot))];
          const u0 = I.reduce((s, it) => s + V.get(ch + '|' + it), 0) / LL.reduce((s, x) => s + x.w, 0);
          const A = I.map(it => slots.map(sl => LL.filter(x => x.item === it && x.slot === sl).reduce((s, x) => s + x.w, 0) * u0));
          const y = I.map(it => V.get(ch + '|' + it));
          // 곱셈 반복(GIS): 단가는 항상 양수, 같은 편성은 같은 단가 — 품목별 합계가 Value에 수렴
          let z = slots.map(() => 1), err = 1;
          const colS = slots.map((_, k) => A.reduce((s, r) => s + r[k], 0));
          for (let it2 = 0; it2 < 5000 && err > 1e-10; it2++) {
            const cur = A.map(r => r.reduce((s, v, k) => s + v * z[k], 0));
            err = Math.max(...cur.map((c, i) => Math.abs(c / y[i] - 1)));
            const lr = cur.map((c, i) => Math.log(y[i] / c));
            z = z.map((v, k) => v * Math.exp(A.reduce((s, r, i) => s + r[k] * lr[i], 0) / colS[k]));
          }
          if (err > 1e-6) {   // 편성이 겹쳐 딱 맞출 수 없으면 그 채널은 품목별 평균
            fb.push(`${ch}(${(err * 100).toFixed(1)}%)`);
            for (const it of I) { const l = LL.filter(x => x.item === it); const W = l.reduce((s, x) => s + x.w, 0), unit = V.get(ch + '|' + it) / W; let left = V.get(ch + '|' + it); l.forEach((x, n) => { const pr = n === l.length - 1 ? left : Math.round(unit * x.w); rows[x.i][9] = pr; left -= pr; }); }
            continue;
          }
          slotN += slots.length;
          LL.forEach(x => { rows[x.i][9] = Math.round(u0 * z[slots.indexOf(x.slot)] * x.w); });
          // 끝수(몇 원): 그 품목만 쓰는 편성(같은 초수) 한두 개의 단가를 똑같이 몇 원씩 → 같은 편성 단가 차이가 안 생김
          const key2 = x => x.slot + '|' + rows[x.i][7];
          let rest = 0;
          for (const it of I) {
            const l = LL.filter(x => x.item === it); let left = V.get(ch + '|' + it) - l.reduce((s, x) => s + rows[x.i][9], 0);
            if (!left) continue;
            const ex = [...new Set(l.map(key2))].filter(k => LL.filter(q => key2(q) === k).every(q => q.item === it)).map(k => ({ k, n: l.filter(x => key2(x) === k).length })).sort((p, q) => p.n - q.n);
            const add = (k, d) => l.filter(x => key2(x) === k).forEach(x => rows[x.i][9] += d);
            let done = false;
            for (const e of ex) if (left % e.n === 0) { add(e.k, left / e.n); done = true; break; }
            if (!done) for (const e1 of ex) { for (const e2 of ex) { if (e1 === e2) continue; for (let k1 = -60; k1 <= 60 && !done; k1++) { const r2 = left - k1 * e1.n; if (r2 % e2.n === 0) { add(e1.k, k1); add(e2.k, r2 / e2.n); done = true; } } if (done) break; } if (done) break; }
            if (!done) rest += Math.abs(left);
          }
          if (rest) planNotes.push(`${ch}: 끝수 ${rest}원은 단가에 못 넣음 (Value 합계와 몇 원 차이)`);
        }
        for (const [k, v] of V) if (!info.some(x => x.ch + '|' + x.item === k)) planNotes.push(`${k.replace('|', '·')}: 방송 Value ${v}인데 송출 없음`);
        planNotes.push(`케이블 단가: 채널별 시트에 단가가 없어 편성마다 15초 단가를 정해 채널×품목 합계를 엑셀 방송 Value에 맞춤 (편성 ${slotN}개${fb.length ? ` · 품목별 평균으로 한 채널: ${fb.join(', ')}` : ''}${miss ? ` · Value 없는 ${miss}회는 0` : ''})`);
        setM(compute(WS));
      }
      // 엑셀 GRP 초수 계획 표(3~9월 '당월 운영') — 소재 탭과 초수 구성이 같은데 비중만 다르면 엑셀 값을 직접 입력값으로
      for (const [nm, o] of Object.entries(P.secPlanXL || {})) {
        const key = resolveItemLoose(M.MS, nm); if (!key) continue;
        const der = M.secPlanOf(key); const xs = Object.keys(o).filter(k => o[k] > 0).sort().join(','), ds = der ? Object.keys(der.shares).sort().join(',') : '';
        if (!der || xs !== ds) continue;
        const tot = Object.values(o).reduce((x, v) => x + v, 0); if (Object.keys(o).some(k => o[k] > 0 && Math.abs(o[k] / tot - der.shares[k]) > 0.001)) { WS.secPlan[key] = Object.fromEntries(Object.entries(o).filter(([, v]) => v > 0)); planNotes.push(`${key}: GRP 초수 비중(계획 표) ${JSON.stringify(WS.secPlan[key])}`); }
      }
      setM(compute(WS));
      // 품목 요약 리치 곡선 — 엑셀에서 손으로 고른 곡선이 자동과 다르면 그대로
      for (const [nm, v] of Object.entries(P.curveXL || {})) {
        const key = resolveItemLoose(M.MS, nm); const o = key && M.ops.find(x => x.item === key); if (!o) continue;
        if (o.total.autoCurve !== v) { WS.opsCurve[key] = v; planNotes.push(`${key}: 요약 리치 곡선 ${v}`); }
      }
      setM(compute(WS));

      // ===== 엑셀 '운영 요약' 기준 맞춤 =====
      const XL = P.opsXL; const xl = {};
      const keyOf = nm => resolveItemLoose(M.MS, nm) || resolveItemLoose(M.MS, nm.split('/')[0]) || (norm(nm) === '마사지셋/코어셋' ? '마사지셋' : null);
      if (XL) for (const it of XL.items) { const k = keyOf(it.name); if (!k) { planNotes.push(`운영 요약 품목 '${it.name}'을 못 찾음`); continue; } xl[k] = it; }
      const G = SUM_GROUPS;
      const live = (k, g) => { const x = xl[k] && xl[k].rows[g]; return x && x.eq > 0 && (x.amt > 0 || x.cnt > 0) ? x : null; };
      // ① 목표 CPRP
      if (XL) {
        const cpRows = WS.sheets.목표CPRP;
        const setCp = (media, pp, v) => { const r = cpRows.find(r => (/지상파/.test(str(r[0])) ? '지상파' : '케이블') === media && norm(r[1]) === norm(pp)); if (r) r[2] = v; else cpRows.push([media, pp, v]); };
        const cpOf = (media, pp) => { const r = cpRows.find(r => (/지상파/.test(str(r[0])) ? '지상파' : '케이블') === media && norm(r[1]) === norm(pp)); return r ? num(r[2]) : null; };
        // 작은 선형계: z = x/x0 (x = 1/CPRP, x0 = 지금 값) — 품목마다 Σ 예산·x = 엑셀 eq.GRP
        const solve = (A, y) => { const n = A.length; const M2 = A.map((r, i) => r.concat([y[i]])); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M2[r][c]) > Math.abs(M2[p][c])) p = r; [M2[c], M2[p]] = [M2[p], M2[c]]; if (Math.abs(M2[c][c]) < 1e-12) return null; for (let r = 0; r < n; r++) if (r !== c) { const f = M2[r][c] / M2[c][c]; for (let k = c; k <= n; k++) M2[r][k] -= f * M2[c][k]; } } return M2.map((r, i) => r[n] / r[i]); };
        const T = A => A[0].map((_, j) => A.map(r => r[j]));
        const mul = (A, B) => A.map(r => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
        const fit = (A, y) => {   // A: 품목×미지수 (eq 단위), y: 엑셀 eq → z
          const m = A.length, n = A[0].length;
          if (n <= m) { const At = T(A); const N = mul(At, A).map((r, i) => r.map((v, j) => v + (i === j ? 1e-9 : 0))); const z = solve(N, mul(At, y.map(v => [v])).map(r => r[0])); if (!z) return null; const res = Math.max(...A.map((r, i) => Math.abs(r.reduce((s, v, k) => s + v * z[k], 0) - y[i]) / y[i])); return { z, res, exact: res < 1e-4 }; }
          const one = A[0].map(() => 1), r0 = y.map((v, i) => v - A[i].reduce((s, a) => s + a, 0));
          const N = mul(A, T(A)).map((r, i) => r.map((v, j) => v + (i === j ? 1e-9 : 0))); const w = solve(N, r0); if (!w) return null;
          const z = one.map((_, k) => 1 + A.reduce((s, r, i) => s + r[k] * w[i], 0)); return { z, res: 0, exact: true, minNorm: true };
        };
        const nameOfPP = c => c.media === '지상파' ? c.ch : c.mpp;
        const rnd = x => Math.abs(x - Math.round(x / 1000) * 1000) < 3 ? Math.round(x / 1000) * 1000 : Math.round(x);
        for (const g of G) {
          const cs = M.cells.filter(c => c.group === g && c.budget > 0 && live(c.item, g));
          if (!cs.length) continue;
          const items = [...new Set(cs.map(c => c.item))]; const y = items.map(k => xl[k].rows[g].eq);
          const media = cs[0].media;
          const bud = (it, f) => cs.filter(c => c.item === it && f(c)).reduce((s, c) => s + c.budget, 0);
          const pps = [...new Set(cs.map(nameOfPP))];
          let out = null, how = '', odd = [];
          // ⓐ PP 하나: 품목마다 금액 ÷ eq → 가장 많은 품목이 같은 값 (엑셀에 수식이 어긋난 품목이 섞여 있어도 그 값만 빼고)
          if (pps.length === 1) {
            const per = items.map((it, i) => ({ it, v: bud(it, () => true) / y[i] }));
            const best = per.map(p => ({ v: p.v, n: per.filter(q => Math.abs(q.v / p.v - 1) < 0.002).length })).sort((x, z) => z.n - x.n)[0];
            if (best.n === items.length || media === '지상파' || best.n >= 2) {
              const agree = per.filter(q => Math.abs(q.v / best.v - 1) < 0.002);
              const v = rnd(agree.reduce((s, q) => s + bud(q.it, () => true), 0) / agree.reduce((s, q) => s + y[items.indexOf(q.it)], 0));
              out = [[pps[0], v]]; odd = per.filter(q => !agree.includes(q)).map(q => `${q.it} ${Math.round(q.v)}`);
              if (odd.length && media === '케이블') out = null;   // 케이블은 채널마다 다른지 먼저 봄
            }
          }
          // ⓑ 채널별(또는 PP별) 값이 품목 수 이하이면 연립방정식으로 정확히
          const exactBy = keyOf2 => {
            const keys = [...new Set(cs.map(keyOf2))]; if (keys.length > items.length) return null;
            const x0 = keys.map(k => { const c = cs.find(c => keyOf2(c) === k); return 1 / (cpOf(media, k) || cpOf(media, c.mpp) || c.cprp || 1e6); });
            const A = items.map(it => keys.map((k, j) => bud(it, c => keyOf2(c) === k) * x0[j]));
            const f = fit(A, y); if (!f || !f.exact) return null;
            const v = keys.map((k, j) => 1 / (x0[j] * f.z[j])); if (v.some(x => !(x > 0) || !isFinite(x))) return null;
            return keys.map((k, j) => [k, rnd(v[j])]);
          };
          if (!out && pps.length > 1) { out = exactBy(nameOfPP); if (out) how = 'PP별'; }
          if (!out && media === '케이블') { out = exactBy(c => c.ch); if (out) how = '채널별'; }
          // ⓒ 못 맞추면: PP별 지금 값에 같은 배수 (품목별 eq 오차 제곱합 최소)
          if (!out) {
            const a = items.map(it => cs.filter(c => c.item === it).reduce((s, c) => { const cp = cpOf(media, nameOfPP(c)) || c.cprp; return s + (cp ? c.budget / cp : 0); }, 0));
            // 품목 둘 이상이 같은 배수로 딱 맞으면 그 배수(엑셀 수식이 어긋난 품목은 빼고), 아니면 최소제곱 — 1에서 2% 안쪽이면 기본값 그대로
            const ks = items.map((it, i) => a[i] / y[i]);
            const cl = ks.map(k0 => ks.filter(k1 => Math.abs(k1 / k0 - 1) < 0.002)).sort((x, z) => z.length - x.length)[0];
            let kk = cl.length >= 2 ? cl.reduce((s, v) => s + v, 0) / cl.length : a.reduce((s, v) => s + v * v, 0) / a.reduce((s, v, i) => s + v * y[i], 0);   // eq ≈ a / kk
            if (Math.abs(kk - 1) < (cl.length >= 2 ? 0.002 : 0.02)) kk = 1;
            out = kk === 1 ? [] : pps.map(pp => [pp, rnd((cpOf(media, pp) || 0) * kk)]).filter(x => x[1] > 0); how = kk === 1 ? '기본값' : `기본값 × ${kk.toFixed(4)}`;
            odd = items.map((it, i) => ({ it, e: a[i] / kk / y[i] - 1 })).filter(q => Math.abs(q.e) > 0.005).map(q => `${q.it} ${(q.e * 100).toFixed(1)}%`);
          }
          const ch = [];
          for (const [k, v] of out) { const old = cpOf(media, k) || (cs.find(c => c.ch === k) || {}).cprp; if (old !== v) { setCp(media, k, v); ch.push(`${k} ${old ? Math.round(old) : '-'}→${v}`); } }
          if (ch.length || odd.length) planNotes.push(`목표 CPRP ${g}${how ? ` (${how})` : ''}: ${ch.join(', ') || '그대로'}${odd.length ? ` · 엑셀 eq와 안 맞는 품목: ${odd.join(', ')}` : ''}`);
        }
        setM(compute(WS));
        // ② GRP 초수 비중 (GRP ÷ eq.GRP) — 지상파·케이블이 다르면 매체별로
        for (const k of Object.keys(xl)) {
          const fOf = gs => { gs = gs.filter(g => live(k, g) && M.cells.some(c => c.item === k && c.group === g && c.budget > 0)); return gs.length ? gs.reduce((a, g) => a + xl[k].rows[g].grp, 0) / gs.reduce((a, g) => a + xl[k].rows[g].eq, 0) : null; };
          const fG = fOf(['KBS', 'MBC', 'SBS']), fC = fOf(['CJ ENM', 'JTBC', '기타']);
          const plan = f => { const s30 = 2 * (1 - f); if (s30 < -0.001 || s30 > 1.001) return null; const r30 = Math.round(Math.min(1, Math.max(0, s30)) * 1e6) / 1e6; return r30 >= 1 ? { 30: 1 } : r30 <= 0 ? { 15: 1 } : { 15: Math.round((1 - r30) * 1e6) / 1e6, 30: r30 }; };
          const same = (a, b) => a == null || b == null || Math.abs(a - b) < 0.0005;
          const pl = M.secPlanOf(k); const fa = pl ? pl.factor : null;
          if (same(fG, fC)) {
            const f = fG != null ? fG : fC; if (f == null || (fa != null && Math.abs(fa - f) < 0.0005)) continue;
            const o = plan(f); if (!o) { planNotes.push(`${k}: 엑셀 GRP/eq ${f.toFixed(4)} — 15·30초로 못 나눔`); continue; }
            WS.secPlan[k] = o; planNotes.push(`${k}: GRP 초수 비중 ${JSON.stringify(o)} (엑셀 GRP÷eq ${f.toFixed(4)}${fa != null ? `, 소재 탭 ${fa.toFixed(4)}` : ''})`);
          } else {
            for (const [m, f] of [['지상파', fG], ['케이블', fC]]) { if (fa != null && Math.abs(fa - f) < 0.0005) continue; const o = plan(f); if (o) WS.secPlan[k + '|' + m] = o; }
            planNotes.push(`${k}: GRP 초수 비중 매체별 — 지상파 ×${fG.toFixed(4)}, 케이블 ×${fC.toFixed(4)} (소재 탭 ${fa != null ? fa.toFixed(4) : '-'})`);
          }
        }
        setM(compute(WS));
        // ③ R1·R3  ④ 주요 프로그램
        const noReach = !Object.keys(WS.reach || {}).length; let nr = 0, nn = 0;
        for (const o of M.ops) {
          const x = xl[o.item]; if (!x) continue;
          for (const r of o.rows) {
            const e = x.rows[r.group]; if (!e) continue;
            const ov = {};
            if (e.r1 != null && (noReach || r.r1a == null || Math.abs(r.r1a - e.r1) > 0.05)) ov.r1 = e.r1;
            if (e.r3 != null && (noReach || r.r3a == null || Math.abs(r.r3a - e.r3) > 0.05)) ov.r3 = e.r3;
            if (Object.keys(ov).length) { WS.opsReach[o.item + '|' + r.group] = ov; nr++; }
            if (e.prog && e.prog !== r.auto) { WS.opsNotes[o.item + '|' + r.group] = e.prog; nn++; }
          }
          const t = x.total; if (t) {
            const ov = {};
            if (t.r1 != null && (noReach || o.total.r1a == null || Math.abs(o.total.r1a - t.r1) > 0.05)) ov.r1 = t.r1;
            if (t.r3 != null && (noReach || o.total.r3a == null || Math.abs(o.total.r3a - t.r3) > 0.05)) ov.r3 = t.r3;
            if (Object.keys(ov).length) { WS.opsReach[o.item + '|합계'] = ov; nr++; }
          }
        }
        if (nr) planNotes.push(`R1·R3 엑셀 값 ${nr}칸 직접 입력${noReach ? ' (누적리치 시트 없음)' : ' (누적리치 계산과 다른 칸)'}`);
        if (nn) planNotes.push(`주요 프로그램 엑셀 문구 ${nn}칸`);
        setM(compute(WS));
      }
      // ===== 엑셀 대조 =====
      const cmp = [];
      const d = (a, b, tol) => a == null || b == null ? '' : Math.abs(a - b) > tol ? '≠' : '';
      for (const o of M.ops) {
        const x = xl[o.item];
        for (const r of o.rows.concat([Object.assign({}, o.total, { group: '계' })])) {
          const e = x ? (r.group === '계' ? x.total : x.rows[r.group]) : null;
          cmp.push({ item: o.item, g: r.group, amt: [r.budget / 1e8, e && e.amt], cnt: [r.cnt, e && e.cnt], grp: [r.grp, e && e.grp], eq: [r.eq, e && e.eq], r1: [r.r1, e && e.r1], r3: [r.r3, e && e.r3],
            bad: e ? [d(r.budget / 1e8, e.amt, 0.006) && 'amt', d(r.cnt, e.cnt, 0.5) && 'cnt', d(r.grp, e.grp, 0.01) && 'grp', d(r.eq, e.eq, 0.01) && 'eq', d(r.r1, e.r1, 0.05) && 'r1', d(r.r3, e.r3, 0.05) && 'r3'].filter(Boolean) : ['엑셀에 없음'] });
        }
      }
      for (const k of Object.keys(xl)) if (!M.ops.some(o => o.item === k)) { const t = xl[k].total || {}; if (t.cnt > 0 || t.amt > 0) cmp.push({ item: k, g: '계', bad: ['앱에 없음'], cnt: [0, t.cnt], amt: [0, t.amt] }); }
      const unk = App.unknownNames();
      const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
      const A = aggCells(M.cells);
      const g = M.spots.filter(s => s.src === '지상파'), c = M.spots.filter(s => s.src === '케이블');
      const kindEmpty = WS.sheets.지상파.filter(r => !isBlankRow(r) && !str(r[1])).length;
      const cv = {}; for (const cl of M.cells) { const k = cl.ch; cv[k] = cv[k] || { value: 0, cnt: 0, mid: 0, pib: 0 }; cv[k].value += cl.value; cv[k].cnt += cl.cnt; cv[k].mid += cl.cmc.중CM || 0; cv[k].pib += cl.cmc.PIB || 0; }
      return {
        ym: WS.ym, notes: R.notes.concat(planNotes), fixed,
        unkItems: [...unk.items], unkChs: [...unk.chs],
        stats: { g: g.length, c: sum(c, s => s.cnt), budget: A.budget, value: A.value, bonus: A.bonus, err: M.issues.filter(i => i.sev === 'err').length, warn: M.issues.filter(i => i.sev === 'warn').length, kindEmpty, items: M.activeItems, start: WS.start, end: WS.end },
        errSample: M.issues.filter(i => i.sev === 'err').slice(0, 8).map(i => `${i.sheet} ${i.row + 1} ${i.msg}`),
        warnSample: M.issues.filter(i => i.sev === 'warn').slice(0, 12).map(i => `${i.sheet} ${i.row + 1} ${i.msg}`),
        cmp, cableByCh: cv, cellsOut: M.cells.map(c => [c.ch, c.item, c.budget, c.value, c.bonus, c.cnt]),
        parts: CLOUD.parts(WS), ws: WS,
      };
    }, { b64, label, YEAR });
    const tag = res.ym.replace('-', '');
    fs.writeFileSync(path.join(OUT, res.ym + '.json'), JSON.stringify({ ym: res.ym, label: label || '', parts: res.parts, ws: res.ws, stats: res.stats, cmp: res.cmp, cableByCh: res.cableByCh, cells: res.cellsOut }));
    // 백업 엑셀 (앱의 '엑셀 백업 → 전체 백업 받기'와 같은 파일)
    const [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => downloadFullReport())]);
    const xl = path.join(OUT, `코웨이TV큐시트_${tag}_백업.xlsx`); await dl.saveAs(xl);
    const bad = res.cmp.filter(x => x.bad.length);
    console.log(JSON.stringify({ ym: res.ym, notes: res.notes, fixed: res.fixed, unkItems: res.unkItems, unkChs: res.unkChs, stats: res.stats, errSample: res.errSample, warnSample: res.warnSample, cmpBad: bad.length + '/' + res.cmp.length }, null, 0));
    for (const x of bad) console.log('  ≠', x.item, x.g, x.bad.join(','), JSON.stringify(Object.fromEntries(['amt', 'cnt', 'grp', 'eq', 'r1', 'r3'].filter(k => x[k]).map(k => [k, x[k].map(v => v == null ? null : Math.round(v * 1000) / 1000)]))));
  }
  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors');
  await ctx.close();
})();
