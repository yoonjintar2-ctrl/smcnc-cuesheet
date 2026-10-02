// ===== 04-model.js : 입력 시트 → 통합 스팟 테이블 → 집계·검증 =====

function buildMaster(WS) {
  const S = WS.sheets;
  const items = new Map(), itemAlias = new Map(), itemOrder = [];
  for (const r of S.품목 || []) {
    const key = str(r[0]);
    if (!key || items.has(key)) continue;
    const color = /^#?[0-9a-f]{6}$/i.test(str(r[3])) ? ('#' + str(r[3]).replace('#', '')) : '#6f7680';
    const it = { key, full: str(r[1]) || key, cat: str(r[2]) || '기타', color, light: tint(color, 0.82), order: itemOrder.length };
    items.set(key, it); itemOrder.push(key);
  }
  // 품목 이름은 약칭만 (띄어쓰기 차이만 같은 이름으로 봄). 별칭은 쓰지 않음
  for (const r of S.품목 || []) { const key = str(r[0]); if (key && !itemAlias.has(norm(key))) itemAlias.set(norm(key), key); }
  // 잘못 적힌 이름 알아보기용: 정식명 · 예전 별칭 · 기본 별칭 → 약칭 (집계에는 쓰지 않고 '고쳐 주세요' 알림에만)
  const itemHint = new Map();
  const legacy = WS.itemLegacy || {};
  for (const r of S.품목 || []) {
    const key = str(r[0]); if (!key) continue;
    const names = [str(r[1])].concat(String((typeof ITEM_HINTS0 !== 'undefined' && ITEM_HINTS0[key]) || '').split(/[,;/]/), String(legacy[key] || '').split(/[,;/]/));
    for (const a of names) { const n = norm(a); if (n && !itemAlias.has(n) && !itemHint.has(n)) itemHint.set(n, key); }
  }
  const channels = new Map(), chByName = new Map(), chList = [];
  for (const r of S.채널 || []) {
    const name = str(r[0]); if (!name || chByName.has(name)) continue;
    const media = /지상파/.test(str(r[2])) ? '지상파' : '케이블';
    const c = { name, media, mpp: str(r[3]) || name, group: str(r[4]) || (media === '지상파' ? name : '기타'), order: chList.length };
    chByName.set(name, c); chList.push(c);
    if (!channels.has(norm(name))) channels.set(norm(name), c);
  }
  for (const r of S.채널 || []) {
    const c = chByName.get(str(r[0])); if (!c) continue;
    for (const a of str(r[1]).split(/[,;/]/)) { const n = norm(a); if (n && !channels.has(n)) channels.set(n, c); }
  }
  const cm = new Map();
  for (const r of S.CM위치 || []) {
    const e = norm(r[0]); if (!e || cm.has(e)) continue;
    cm.set(e, normCmClass(str(r[1])));
  }
  const cprp = new Map();
  for (const r of S.목표CPRP || []) {
    const media = /지상파/.test(str(r[0])) ? '지상파' : '케이블';
    const v = num(r[2]); if (!v) continue;
    const k = media + '|' + norm(r[1]); if (!cprp.has(k)) cprp.set(k, v);
  }
  return { items, itemAlias, itemHint, itemOrder, channels, chList, chByName, cm, cprp };
}
function normCmClass(s) {
  const t = String(s || '').trim();
  if (/^중/.test(t)) return '중CM';
  if (/PIB/i.test(t)) return 'PIB';
  if (/전후/.test(t)) return '전후CM';
  if (/일반|그외/.test(t)) return '일반';
  return t || '일반';
}
function cmClassOf(MS, raw, media) {
  const s = str(raw);
  if (!s) return { cls: media === '지상파' ? '일반' : '전후CM', known: true };
  const k = norm(s);
  if (MS.cm.has(k)) return { cls: MS.cm.get(k), known: true };
  let cls;
  if (/중/.test(s)) cls = '중CM';
  else if (/PIB|TOP|END|PCM/i.test(s)) cls = 'PIB';
  else if (/전|후/.test(s)) cls = '전후CM';
  else cls = media === '지상파' ? '일반' : '전후CM';
  return { cls, known: false };
}
function resolveItem(MS, raw) {
  const n = norm(raw); if (!n) return null;
  return MS.itemAlias.get(n) || null;
}
// 약칭이 아니지만 어떤 품목인지 알 수 있는 이름(정식명·예전 별칭) → 그 약칭. 방송사 원본 온보딩·고치기 안내에 씀
function itemHintOf(MS, raw) { const n = norm(raw); return n && !MS.itemAlias.has(n) ? (MS.itemHint.get(n) || null) : null; }
function resolveItemLoose(MS, raw) { return resolveItem(MS, raw) || itemHintOf(MS, raw); }
function resolveCh(MS, raw) {
  const n = norm(raw); if (!n) return null;
  return MS.channels.get(n) || null;
}
function reachAt(curve, grp) {
  if (!curve || !curve.length || grp == null || !isFinite(grp)) return null;
  let lo = 0, hi = curve.length - 1;
  if (grp <= curve[0][0]) return curve[0];
  if (grp >= curve[hi][0]) return curve[hi];
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (curve[mid][0] <= grp) lo = mid; else hi = mid; }
  return (grp - curve[lo][0] <= curve[hi][0] - grp) ? curve[lo] : curve[hi];
}

// 소재 시트 파싱 (품목·기간·초수는 위 행에서 이어받음)
function parseCreatives(WS, MS) {
  const out = [];
  let curItem = '', curPeriod = '', curSec = null;
  (WS.sheets.소재 || []).forEach((r, i) => {
    if (isBlankRow(r)) return;
    const itemRaw = str(r[0]);
    if (itemRaw) { curItem = itemRaw; curPeriod = ''; curSec = null; }
    if (str(r[1])) curPeriod = str(r[1]);
    const sec = num(String(r[2] || '').replace(/["”초]/g, ''));
    if (sec) curSec = sec;
    const cre = str(r[3]);
    if (!cre || /계$/.test(cre)) return;
    out.push({ row: i, itemRaw: curItem, item: resolveItem(MS, curItem), period: curPeriod, sec: curSec, cre, share: num(r[4]), cshare: num(r[5]), reg: str(r[6]), note: str(r[7]) });
  });
  return out;
}

function compute(WS) {
  const MS = buildMaster(WS);
  const ym = parseYM(WS.ym);
  const weeks = buildWeeks(WS.ym, 1, ym ? daysInMonth(ym.y, ym.m) : 31);
  const issues = [];
  const issue = (sheet, row, col, sev, msg) => issues.push({ sheet, row, col, sev, msg });
  const creatives = parseCreatives(WS, MS);
  const creByItem = groupBy(creatives.filter(c => c.item), c => c.item);

  // ---- 스팟 ----
  const spots = [];
  const dupSeen = new Map();
  for (const sheet of ['지상파', '케이블']) {
    const def = SHEETS[sheet]; const ci = k => colIndex(sheet, k);
    const rows = WS.sheets[sheet] || [];
    rows.forEach((r, i) => {
      if (isBlankRow(r)) return;
      const g = k => { const j = ci(k); return j < 0 ? '' : r[j]; };
      const chRaw = str(g('ch'));
      const chInfo = resolveCh(MS, chRaw);
      const prog = str(g('prog'));
      if (!chRaw && !prog && !str(g('item'))) return; // 메모성 행
      const sp = {
        src: sheet, row: i, chRaw, chInfo,
        ch: chInfo ? chInfo.name : chRaw,
        media: chInfo ? chInfo.media : def.media,
        group: chInfo ? chInfo.group : (def.media === '지상파' ? chRaw : '기타'),
        mpp: chInfo ? chInfo.mpp : chRaw,
        kind: str(g('kind')), prog, dowRaw: str(g('dow')), start: normTime(g('start')), end: normTime(g('end')), grade: str(g('grade')),
        sec: num(String(g('sec') || '').replace(/["”초]/g, '')), price: num(g('price')) || 0,
        cnt: sheet === '케이블' ? (num(g('cnt')) || 1) : 1,
        amount: sheet === '지상파' ? num(g('amount')) : null,
        itemRaw: str(g('item')), cre: str(g('cre')), cmRaw: str(g('cm')), rate: num(g('rate')), ar: num(g('ar')), note: str(g('note')),
      };
      sp.item = resolveItem(MS, sp.itemRaw);
      if (sp.amount == null && sheet === '지상파') sp.amount = 0;
      sp.bonus = sheet === '지상파' ? !(sp.amount > 0) : null;
      const cmc = cmClassOf(MS, sp.cmRaw, sp.media);
      sp.cmCls = cmc.cls;
      // 날짜
      const dv = parseDateVal(g('date'), ym);
      sp.day = null;
      if (!dv) {
        issue(sheet, i, 'date', 'err', str(g('date')) ? `날짜를 읽을 수 없어요: "${str(g('date'))}"` : '날짜가 비어 있어요 (주차 계산에서 빠짐)');
      } else if (ym && dv.m !== ym.m) {
        issue(sheet, i, 'date', 'warn', `${dv.m}/${dv.d} — ${ym.m}월이 아닌 날짜예요`);
      } else {
        sp.day = dv.d;
        if (ym && (dv.d < 1 || dv.d > daysInMonth(ym.y, ym.m))) { issue(sheet, i, 'date', 'err', '존재하지 않는 날짜예요'); sp.day = null; }
      }
      sp.week = weekOfDay(weeks, sp.day);
      sp.dow = sp.day && ym ? dowOf(ym.y, ym.m, sp.day) : sp.dowRaw;
      if (sp.day && sp.dowRaw && ym && sp.dowRaw.charAt(0) !== sp.dow) issue(sheet, i, 'dow', 'warn', `요일 불일치: ${ym.m}/${sp.day}은 ${sp.dow}요일`);
      sp.weekend = sp.dow === '토' || sp.dow === '일';
      // 채널·품목
      if (!chRaw) issue(sheet, i, 'ch', 'err', '채널이 비어 있어요');
      else if (!chInfo) issue(sheet, i, 'ch', 'err', `마스터에 없는 채널: "${chRaw}"`);
      else if (chInfo.media !== def.media) issue(sheet, i, 'ch', 'warn', `${chInfo.name}은(는) ${chInfo.media} 채널이에요`);
      if (!sp.itemRaw) issue(sheet, i, 'item', 'err', '품목이 비어 있어요 (집계에서 빠짐)');
      else if (!sp.item) { sp.itemHint = itemHintOf(MS, sp.itemRaw); issue(sheet, i, 'item', 'err', sp.itemHint ? `약칭이 아닌 이름 "${sp.itemRaw}" → '${sp.itemHint}'(으)로 고쳐 주세요 (집계에서 빠짐)` : `마스터에 없는 품목: "${sp.itemRaw}"`); }
      if (!sp.sec) issue(sheet, i, 'sec', 'err', '초수가 비어 있거나 숫자가 아니에요');
      if (!sp.price) issue(sheet, i, 'price', 'warn', '단가가 비어 있어요');
      if (!prog) issue(sheet, i, 'prog', 'warn', '프로그램명이 비어 있어요');
      if (!cmc.known) issue(sheet, i, 'cm', 'info', `CM위치 "${sp.cmRaw}"는 마스터에 없어 '${cmc.cls}'로 추정했어요`);
      // 소재
      if (sp.item && sp.cre && creByItem.has(sp.item)) {
        const list = creByItem.get(sp.item);
        const hit = list.find(c => creMatch(c.cre, sp.cre));
        if (!hit) issue(sheet, i, 'cre', 'info', `소재 시트의 ${sp.item} 소재(${list.map(c => c.cre).join(', ')})에 없는 이름이에요`);
        else if (hit.sec && sp.sec && hit.sec !== sp.sec) issue(sheet, i, 'sec', 'warn', `${sp.cre}는 ${hit.sec}초 소재예요`);
      }
      // 중복
      const dk = [sheet, sp.ch, sp.day, sp.prog, sp.start, sp.cmRaw, sp.item, sp.cre].join('|');
      if (dupSeen.has(dk)) issue(sheet, i, 'prog', 'info', `${dupSeen.get(dk) + 1}행과 똑같은 송출이에요 (중복 확인)`);
      else dupSeen.set(dk, i);
      spots.push(sp);
    });
  }

  // ---- 예산 ----
  const budget = new Map(); // ch|item → 원
  const budgetItems = [];
  const B = WS.sheets.예산 || [];
  const head = B[0] || [];
  const colItem = [];
  for (let j = 1; j < head.length; j++) {
    const raw = str(head[j]); if (!raw) { colItem[j] = null; continue; }
    const key = resolveItem(MS, raw);
    colItem[j] = key;
    if (!key) { const h = itemHintOf(MS, raw); issue('예산', 0, 'c' + j, 'err', h ? `약칭이 아닌 이름 "${raw}" → '${h}'(으)로 고쳐 주세요` : `마스터에 없는 품목: "${raw}"`); }
    else if (!budgetItems.includes(key)) budgetItems.push(key);
  }
  for (let i = 1; i < B.length; i++) {
    const r = B[i]; if (isBlankRow(r)) continue;
    const chRaw = str(r[0]);
    if (/^(합계|계|total)/i.test(chRaw)) continue;
    const c = resolveCh(MS, chRaw);
    let any = false;
    for (let j = 1; j < r.length; j++) {
      const v = num(r[j]); if (!v) continue; any = true;
      if (!colItem[j]) { if (str(head[j]) === '') issue('예산', i, 'c' + j, 'err', '1행에 품목명이 없는 열에 금액이 있어요'); continue; }
      if (!c) continue;
      const k = c.name + '|' + colItem[j];
      budget.set(k, (budget.get(k) || 0) + v);
    }
    if (chRaw && !c && any) issue('예산', i, 'c0', 'err', `마스터에 없는 채널: "${chRaw}"`);
  }

  // ---- 채널×품목 셀 ----
  const cells = new Map();
  const cellOf = (chName, item) => {
    const k = chName + '|' + item;
    if (!cells.has(k)) {
      const ci = MS.chByName.get(chName) || { name: chName, media: '케이블', mpp: chName, group: '기타', order: 999 };
      const it = MS.items.get(item) || { key: item, order: 999 };
      cells.set(k, { k, ch: chName, item, media: ci.media, group: ci.group, mpp: ci.mpp, chOrder: ci.order, itemOrder: it.order,
        budget: 0, cnt: 0, value: 0, bonusSpots: 0, paidAmt: 0, wk: weeks.map(() => 0), sec: {}, secPrice: {}, priceSum: 0,
        wd: 0, we: 0, cmc: { 중CM: 0, PIB: 0, 전후CM: 0, 일반: 0 } });
    }
    return cells.get(k);
  };
  for (const [k, v] of budget) { const [ch, item] = k.split('|'); cellOf(ch, item).budget = v; }
  for (const sp of spots) {
    if (!sp.item || !sp.chInfo) continue;
    const c = cellOf(sp.ch, sp.item);
    c.cnt += sp.cnt;
    const pv = sp.price * sp.cnt;
    c.priceSum += pv;
    if (sp.src === '지상파') { if (sp.bonus) c.bonusSpots += pv; else c.paidAmt += (sp.amount || 0); }
    if (sp.week) c.wk[sp.week - 1] += sp.cnt;
    if (sp.sec) { c.sec[sp.sec] = (c.sec[sp.sec] || 0) + sp.cnt; c.secPrice[sp.sec] = (c.secPrice[sp.sec] || 0) + pv; }
    if (sp.weekend) c.we += sp.cnt; else c.wd += sp.cnt;
    c.cmc[sp.cmCls] = (c.cmc[sp.cmCls] || 0) + sp.cnt;
  }
  for (const c of cells.values()) {
    if (c.media === '지상파') { c.bonus = c.bonusSpots; c.value = c.budget + c.bonusSpots; }
    else { c.value = c.priceSum; c.bonus = c.value - c.budget; }
    c.rate = c.budget > 0 ? c.bonus / c.budget : null;
    // GRP: 예산 ÷ 목표CPRP(15초) × 초수 환산
    let cp = MS.cprp.get(c.media + '|' + norm(c.media === '지상파' ? c.ch : c.mpp)) || MS.cprp.get(c.media + '|' + norm(c.mpp));
    c.cprp = cp || null;
    let factor = null;
    if (c.priceSum > 0) { factor = 0; for (const s in c.secPrice) factor += (c.secPrice[s] / c.priceSum) * (15 / (+s)); }
    else {
      const list = creByItem.get(c.item) || [];
      const w = list.filter(x => x.sec);
      if (w.length) { const tot = sum(w, x => x.share || 1); factor = sum(w, x => (x.share || 1) * 15 / x.sec) / tot; }
      else factor = 0.5;
    }
    c.factor = factor;
    c.eq = cp && c.budget ? c.budget / cp : 0;
    c.grp = c.eq * factor;
    if (c.budget > 0 && !cp) issue('목표CPRP', -1, 'cprp', 'warn', `${c.media} ${c.media === '지상파' ? c.ch : c.mpp}의 목표 CPRP가 없어 GRP를 계산하지 못했어요`);
    if (c.budget > 0 && c.cnt === 0) issue('예산', -1, null, 'warn', `${c.ch} · ${c.item}: 예산 ${fmt.eok(c.budget, 2)}이 있는데 송출이 0회예요`);
    if (c.budget === 0 && c.cnt > 0 && c.media === '케이블') issue('케이블', -1, null, 'warn', `${c.ch} · ${c.item}: 송출 ${c.cnt}회가 있는데 예산이 0이에요 (보너스율 계산 불가)`);
  }
  const cellList = [...cells.values()].sort((a, b) => (a.media === b.media ? 0 : a.media === '지상파' ? -1 : 1) || a.chOrder - b.chOrder || a.itemOrder - b.itemOrder);
  // 이번 달 품목 (예산 헤더 순서 → 그 외 송출 있는 품목)
  const activeItems = budgetItems.slice();
  for (const c of cellList) if ((c.cnt > 0 || c.budget > 0) && !activeItems.includes(c.item)) activeItems.push(c.item);

  // ---- 운영 요약 ----
  const reach = WS.reach || {};
  // R1+·R3+ 직접 입력(예외): WS.opsReach['품목|방송사' 또는 '품목|합계'] = { r1, r3 } — 있으면 누적리치 값 대신 씀
  const reachOv = (r, k) => { const o = (WS.opsReach || {})[k] || {}; r.r1 = o.r1 != null ? o.r1 : r.r1a; r.r3 = o.r3 != null ? o.r3 : r.r3a; r.r1m = o.r1 != null; r.r3m = o.r3 != null; r.rk = k; };
  const ops = [];
  for (const item of activeItems) {
    const its = cellList.filter(c => c.item === item && (c.budget > 0 || c.cnt > 0));
    if (!its.length) continue;
    const rows = [];
    for (const gname of SUM_GROUPS.concat([...new Set(its.map(c => c.group))].filter(g => !SUM_GROUPS.includes(g)))) {
      const gc = its.filter(c => c.group === gname); if (!gc.length) continue;
      const r = { group: gname, budget: sum(gc, c => c.budget), cnt: sum(gc, c => c.cnt), grp: sum(gc, c => c.grp), eq: sum(gc, c => c.eq), value: sum(gc, c => c.value) };
      const pt = reachAt(reach[gname], r.grp); r.r1a = pt ? pt[1] : null; r.r3a = pt ? pt[2] : null; reachOv(r, item + '|' + gname);
      r.auto = bonMidPrograms(spots.filter(s => s.item === item && s.group === gname));   // 처음 값 = 그 방송사 본방 중CM 프로그램 (직접 고치면 그 글이 우선)
      const ov = (WS.opsNotes || {})[item + '|' + gname];
      r.progs = ov != null && ov !== '' ? ov : r.auto; r.manual = ov != null && ov !== '';
      rows.push(r);
    }
    const hasG = its.some(c => c.media === '지상파' && c.cnt > 0);
    const t = { group: hasG ? '지상파케이블' : '케이블', budget: sum(rows, r => r.budget), cnt: sum(rows, r => r.cnt), grp: sum(rows, r => r.grp), eq: sum(rows, r => r.eq), value: sum(rows, r => r.value) };
    const pt = reachAt(reach[t.group], t.grp); t.r1a = pt ? pt[1] : null; t.r3a = pt ? pt[2] : null; reachOv(t, item + '|합계');
    const it = MS.items.get(item);
    ops.push({ item, full: it ? it.full : item, cat: it ? it.cat : '', rows, total: t });
  }
  // ---- 지상파 정산 (기존 지상파 시트 하단: 3사 Total · CM지정비 · 연계 · 예비비 · Grand Total) ----
  const gSettle = (() => {
    const g = spots.filter(s => s.src === '지상파' && s.chInfo && s.chInfo.media === '지상파');
    const chs = [...new Set(g.map(s => s.ch))];
    const by = ch => {
      const l = g.filter(s => s.ch === ch);
      const paid = sum(l, s => s.bonus ? 0 : (s.amount || 0));
      const desig = sum(l, s => { const r = s.rate || 0; if (!r) return 0; return (!s.bonus && ch === 'KBS') ? (s.price / 0.85) * r : s.price * r; }); // 기존 시트: KBS 유상만 ÷0.85
      const bud = sum(cellList.filter(c => c.ch === ch), c => c.budget);
      return { ch, paid, desig, budget: bud, cnt: l.length, paidCnt: l.filter(s => !s.bonus).length };
    };
    const rows = chs.sort((a, b) => ((MS.chByName.get(a) || {}).order ?? 99) - ((MS.chByName.get(b) || {}).order ?? 99)).map(by);
    const paid = sum(rows, r => r.paid), desig = sum(rows, r => r.desig), budget = sum(rows, r => r.budget);
    const R = n => (rows.find(r => r.ch === n) || {});
    const link = ((R('KBS').paid || 0) + (R('MBC').paid || 0)) * 0.2 + (R('SBS').budget || 0) * 0.1;
    return { rows, paid, desig, link, reserve: budget - (paid + desig + link), budget };
  })();
  const sevRank = { err: 0, warn: 1, info: 2 };
  issues.sort((a, b) => sevRank[a.sev] - sevRank[b.sev]);
  return { WS, MS, ym, weeks, spots, cells: cellList, cellMap: cells, budgetItems, activeItems, creatives, ops, issues, reach, gSettle };
}

function creMatch(a, b) { const x = norm(a).replace(/편$/, ''), y = norm(b).replace(/편$/, ''); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); }
function topPrograms(list, n = 4) {
  const pri = { 중CM: 0, PIB: 1, 전후CM: 2, 일반: 3 };
  const sorted = list.slice().sort((a, b) => (pri[a.cmCls] - pri[b.cmCls]) || (b.price - a.price));
  const seen = new Set(), out = [];
  for (const s of sorted) {
    const name = cleanProg(s.prog); if (!name) continue;
    const key = name + '|' + (s.cmCls === '중CM' || s.cmCls === 'PIB' ? s.cmCls : '');
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name + (s.cmCls === '중CM' || s.cmCls === 'PIB' ? ' ' + s.cmCls : ''));
  }
  return out.slice(0, n).join(', ') + (out.length > n ? ' 등' : '');
}

// 본방(생방 포함) 중CM으로 나간 프로그램 이름 — 많이 나간 순. 지상파는 재방 표시가 없으면 본방으로 봄
function isBonSpot(s) { const p = String(s.prog || ''); if (/본방|생방/.test(p)) return true; return s.media === '지상파' && !/재방|[(（<\[]\s*재\s*[)）>\]]/.test(p); }
function bonMidPrograms(list, n = 12) {
  const m = new Map();
  for (const s of list) { if (s.cmCls !== '중CM' || !isBonSpot(s)) continue; const name = cleanProg(s.prog); if (!name) continue; const x = m.get(name) || { n: 0, p: 0 }; x.n += s.cnt || 1; x.p = Math.max(x.p, s.price || 0); m.set(name, x); }
  const out = [...m].sort((a, b) => b[1].n - a[1].n || b[1].p - a[1].p).map(x => x[0]);
  return out.slice(0, n).join(', ') + (out.length > n ? ` 외 ${out.length - n}개` : '');
}

// 집계 도우미
function aggCells(cells) {
  const r = { budget: 0, value: 0, bonus: 0, cnt: 0, grp: 0, eq: 0, wk: null, wd: 0, we: 0, cmc: { 중CM: 0, PIB: 0, 전후CM: 0, 일반: 0 }, sec: {} };
  for (const c of cells) {
    r.budget += c.budget; r.value += c.value; r.bonus += c.bonus; r.cnt += c.cnt; r.grp += c.grp; r.eq += c.eq; r.wd += c.wd; r.we += c.we;
    if (!r.wk) r.wk = c.wk.map(() => 0);
    c.wk.forEach((v, i) => r.wk[i] += v);
    for (const k in c.cmc) r.cmc[k] = (r.cmc[k] || 0) + c.cmc[k];
    for (const s in c.sec) r.sec[s] = (r.sec[s] || 0) + c.sec[s];
  }
  r.rate = r.budget > 0 ? r.bonus / r.budget : null;
  if (!r.wk) r.wk = [];
  return r;
}

// ---- 버전 비교 ----
function spotKey(s) { return [s.src, s.ch, s.day, cleanProg(s.prog), s.start, s.cmRaw].join('|'); }
function spotVal(s) { return [s.item || s.itemRaw, s.cre, s.sec, s.price, s.src === '지상파' ? (s.amount || 0) : s.cnt].join('|'); }
function diffModels(a, b) {
  const res = { added: [], removed: [], changed: [], budget: [] };
  const idx = M => { const m = new Map(); for (const s of M.spots) { const k = spotKey(s); if (!m.has(k)) m.set(k, []); m.get(k).push(s); } return m; };
  const A = idx(a), Bm = idx(b);
  const keys = new Set([...A.keys(), ...Bm.keys()]);
  for (const k of keys) {
    const oa = (A.get(k) || []).slice(), nb = (Bm.get(k) || []).slice();
    // 같은 값끼리 상쇄
    for (let i = oa.length - 1; i >= 0; i--) {
      const j = nb.findIndex(x => spotVal(x) === spotVal(oa[i]));
      if (j >= 0) { nb.splice(j, 1); oa.splice(i, 1); }
    }
    const n = Math.min(oa.length, nb.length);
    for (let i = 0; i < n; i++) res.changed.push({ from: oa[i], to: nb[i] });
    for (let i = n; i < oa.length; i++) res.removed.push(oa[i]);
    for (let i = n; i < nb.length; i++) res.added.push(nb[i]);
  }
  const bk = new Set([...a.cellMap.keys(), ...b.cellMap.keys()]);
  for (const k of bk) {
    const x = a.cellMap.get(k), y = b.cellMap.get(k);
    const bx = x ? x.budget : 0, by = y ? y.budget : 0;
    if (Math.round(bx) !== Math.round(by)) res.budget.push({ k, ch: (x || y).ch, item: (x || y).item, from: bx, to: by });
  }
  return res;
}
function diffSummary(d) {
  const parts = [];
  if (d.added.length) parts.push(`+${d.added.length}`);
  if (d.removed.length) parts.push(`−${d.removed.length}`);
  if (d.changed.length) parts.push(`변경 ${d.changed.length}`);
  if (d.budget.length) parts.push(`예산 ${d.budget.length}건`);
  return parts.length ? parts.join(' · ') : '변경 없음';
}
