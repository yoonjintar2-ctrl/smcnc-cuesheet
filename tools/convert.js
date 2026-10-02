// 예전 통합 큐시트 엑셀 → 이 도구의 작업 내용(JSON · 백업 엑셀)으로 변환 (개발용)
// 사용: LANG=C.UTF-8 node tools/convert.js out_dir file1.xlsx[:라벨] file2.xlsx ...
// 결과: out_dir/YYYY-MM.json (CLOUD.parts 형식 + 요약), out_dir/코웨이TV큐시트_YYYYMM_백업.xlsx
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const OUT = path.resolve(process.argv[2]); fs.mkdirSync(OUT, { recursive: true });
const files = process.argv.slice(3);
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
    const res = await p.evaluate(async ({ b64, label }) => {
      const bin = atob(b64); const buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      const R = legacyToWS(buf); const P = R.parts;
      // 빈 작업에서 시작 → 앱의 '넣기'와 같은 순서로 반영 (마스터는 새 이름만 추가)
      WS = emptyWorkspace(P.ym); if (P.start) WS.start = P.start; if (P.end) WS.end = P.end; WS.adv = '코웨이';
      for (const k of ['지상파', '케이블', '예산', '소재']) if (P[k]) WS.sheets[k] = P[k];
      if (P.reach) { WS.reach = P.reach; WS.reachMeta = P.reachMeta || {}; }
      fixWS(WS);
      if (P.master) App.mergeMaster(P.master);
      fillGroundKind(WS.sheets.지상파);
      // 구분이 아예 비어 있는 채널 블록(예: 7·8월 SBS)은 정기물로
      for (const r of WS.sheets.지상파) if (!isBlankRow(r) && !str(r[1])) r[1] = '정기물';
      setM(compute(WS));
      // 약칭이 아닌 품목 이름 → 약칭으로 (노란 알림의 '모두 약칭으로 고치기'와 같음)
      const wrong = App.wrongItemNames(); const fixed = [];
      for (const x of wrong) { const n = renameEverywhere('item', x.raw, x.key); fixed.push(`${x.raw}→${x.key} ${n.total}`); }
      setM(compute(WS));
      const unk = App.unknownNames();
      const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
      const A = aggCells(M.cells);
      const g = M.spots.filter(s => s.src === '지상파'), c = M.spots.filter(s => s.src === '케이블');
      const kindEmpty = WS.sheets.지상파.filter(r => !isBlankRow(r) && !str(r[1])).length;
      return {
        ym: WS.ym, notes: R.notes, fixed,
        unkItems: [...unk.items], unkChs: [...unk.chs],
        stats: { g: g.length, c: sum(c, s => s.cnt), budget: A.budget, value: A.value, bonus: A.bonus, err: M.issues.filter(i => i.sev === 'err').length, warn: M.issues.filter(i => i.sev === 'warn').length, kindEmpty, items: M.activeItems },
        errSample: M.issues.filter(i => i.sev === 'err').slice(0, 8).map(i => `${i.sheet} ${i.row + 1} ${i.msg}`),
        parts: CLOUD.parts(WS), ws: WS,
      };
    }, { b64, label });
    const tag = res.ym.replace('-', '');
    fs.writeFileSync(path.join(OUT, res.ym + '.json'), JSON.stringify({ ym: res.ym, label: label || '', parts: res.parts, ws: res.ws, stats: res.stats }));
    // 백업 엑셀 (앱의 '엑셀 백업 → 전체 백업 받기'와 같은 파일)
    const [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => saveWorkspaceXlsx(WS, M, ALL_SHEETS, '백업'))]);
    const xl = path.join(OUT, `코웨이TV큐시트_${tag}_백업.xlsx`); await dl.saveAs(xl);
    console.log(JSON.stringify({ ym: res.ym, notes: res.notes, fixed: res.fixed, unkItems: res.unkItems, unkChs: res.unkChs, stats: res.stats, errSample: res.errSample }, null, 0));
  }
  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors');
  await ctx.close();
})();
