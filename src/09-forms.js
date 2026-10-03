// ===== 09-forms.js : 웹 입력 화면 (마스터 · 예산 · 소재) =====
// 원칙: 품목·채널 이름은 마스터에서만 만들고, 예산·소재·큐시트는 마스터 목록에서 골라 쓴다.
// 품목 색: 채도를 낮추고 밝기를 맞춘 조화로운 팔레트 (앞 6색은 색약 구분 검사 통과 · 2026-10 변경)
// 품목 색 v3 (10-03): 같은 카테고리는 비슷한 계열 — 정수기 파랑 · 매트리스 주황 · 안마의자/마사지 자주·분홍 · 청정기 올리브 · 음식물처리기 초록
// 같은 달에 같이 나오는 품목끼리는 정상 시각 ΔE 15 이상(검사함). 새 품목은 아래 순서로 안 쓴 색
const PALETTE = ['#3274bd', '#c8602f', '#2f9b79', '#86408f', '#e08ab8', '#86bce6', '#f0b27a', '#173a60', '#7a6a58', '#3aa3bd', '#8a9a3c', '#b0477a', '#bcc56e', '#a33a2c', '#7f8793'];
const ITEM_COLOR_V2 = {"아이콘3": "#3a77b8", "카페 얼음": "#dcb155", "안마매트리스": "#ca653c", "트리플체어2": "#6654a1", "페블체어2": "#db86af", "음처기": "#2f9b79", "아이콘 얼음": "#87a54d", "스매": "#a43a41", "아이콘프로": "#008b96", "노블": "#91803c", "히티브": "#c38148", "비데": "#7789c3", "마사지셋": "#925b8d", "테라솔U": "#8b492a", "페스타": "#7f8793"};
const ITEM_COLOR_V3 = {"아이콘3": "#3274bd", "카페 얼음": "#86bce6", "안마매트리스": "#c8602f", "트리플체어2": "#86408f", "페블체어2": "#e08ab8", "음처기": "#2f9b79", "아이콘 얼음": "#173a60", "스매": "#f0b27a", "아이콘프로": "#3aa3bd", "노블": "#8a9a3c", "히티브": "#bcc56e", "비데": "#7a6a58", "마사지셋": "#b0477a", "테라솔U": "#a33a2c", "페스타": "#7f8793"};
// 예전 기본 팔레트 → 새 팔레트 (직접 고른 색은 그대로 두고, 예전 기본색인 것만 바꿈)
const PALETTE_V2 = {'#2a78d6': '#3a77b8', '#eda100': '#dcb155', '#eb6834': '#ca653c', '#4a3aa7': '#6654a1', '#e87ba4': '#db86af', '#1baf7a': '#2f9b79', '#008300': '#87a54d', '#e34948': '#a43a41', '#0e7c86': '#008b96', '#8c6d1f': '#91803c', '#b0721a': '#c38148', '#5b7fbf': '#7789c3', '#a24f8f': '#925b8d', '#9a4a24': '#8b492a', '#6f7680': '#7f8793'};
function nextColor() { const used = new Set((WS.sheets.품목 || []).map(r => str(r[3]).toLowerCase())); return PALETTE.find(c => !used.has(c)) || '#6f7680'; }
function colorVal(v) { const s = str(v).replace('#', ''); return /^[0-9a-f]{6}$/i.test(s) ? '#' + s.toLowerCase() : '#6f7680'; }
// '1.5억', '3,000만', '150000000' → 원. 빈칸 → '', 못 읽으면 null
function parseAmount(v) {
  const s = String(v == null ? '' : v).replace(/[\s,원₩]/g, '');
  if (!s) return '';
  let m = s.match(/^(-?\d+(?:\.\d+)?)억(?:(\d+(?:\.\d+)?)만)?$/); if (m) return Math.round(+m[1] * 1e8 + (m[2] ? +m[2] * 1e4 : 0));
  m = s.match(/^(-?\d+(?:\.\d+)?)만$/); if (m) return Math.round(+m[1] * 1e4);
  const n = num(s); return n == null ? null : n;
}
function amtTxt(v) { return v === '' || v == null ? '' : (typeof v === 'number' ? fmt.won(v) : String(v)); }
function pctTxt(v) { if (v === '' || v == null) return ''; const n = num(v); return n == null ? String(v) : String(Math.round(n * 1000) / 10); }
function parsePct(t) { const s = String(t == null ? '' : t).trim(); if (!s) return ''; if (/%$/.test(s)) return num(s); const n = num(s); return n == null ? null : n / 100; }
function dropAlias(list, name) { return str(list).split(/[,;/]/).map(x => x.trim()).filter(x => x && norm(x) !== norm(name)).join(', '); }
function addAlias(list, name) { const a = str(list).split(/[,;/]/).map(x => x.trim()).filter(Boolean); if (name && !a.some(x => norm(x) === norm(name))) a.push(name); return a.join(', '); }
function optHtml(list, cur) { return list.map(v => { const [val, lab] = Array.isArray(v) ? v : [v, v]; return `<option value="${esc(val)}" ${String(val) === String(cur) ? 'selected' : ''}>${esc(lab)}</option>`; }).join(''); }
// 엔터 = 아래 행 같은 칸으로 (엑셀처럼)
function bindEnterDown(root) {
  root.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
    const inp = e.target.closest('input[data-f],input[data-c]'); if (!inp) return;
    e.preventDefault();
    const tr = inp.closest('tr'); const key = inp.dataset.f != null ? `[data-f="${inp.dataset.f}"]` : `[data-c="${inp.dataset.c}"]`;
    let nx = e.shiftKey ? tr.previousElementSibling : tr.nextElementSibling;
    while (nx && !nx.querySelector('input' + key)) nx = e.shiftKey ? nx.previousElementSibling : nx.nextElementSibling;
    if (nx) { const t = nx.querySelector('input' + key); t.focus(); t.select && t.select(); } else inp.blur();
  });
}

// ---------- 이름 바꾸기를 모든 시트에 반영 ----------
function renameEverywhere(kind, from, to, dry) {
  const S = WS.sheets; const n = { 지상파: 0, 케이블: 0, 예산: 0, 소재: 0 };
  const eq = v => norm(v) === norm(from);
  const set = (row, j, sh) => { n[sh]++; if (!dry) row[j] = to; };
  if (kind === 'item') {
    for (const sh of ['지상파', '케이블']) { const j = colIndex(sh, 'item'); for (const r of S[sh] || []) if (eq(r[j])) set(r, j, sh); }
    const B = S.예산 || []; if (B[0]) B[0].forEach((h, j) => { if (j && eq(h)) set(B[0], j, '예산'); });
    for (const r of S.소재 || []) if (eq(r[0])) set(r, 0, '소재');
    if (!dry && WS.opsNotes) for (const k of Object.keys(WS.opsNotes)) { const [a, b] = k.split('|'); if (eq(a)) { WS.opsNotes[to + '|' + b] = WS.opsNotes[k]; delete WS.opsNotes[k]; } }
  } else {
    for (const sh of ['지상파', '케이블']) { const j = colIndex(sh, 'ch'); for (const r of S[sh] || []) if (eq(r[j])) set(r, j, sh); }
    for (const r of (S.예산 || []).slice(1)) if (eq(r[0])) set(r, 0, '예산');
    if (!dry) {
      if (WS.cueOrder && WS.cueOrder[from]) { WS.cueOrder[to] = WS.cueOrder[from]; delete WS.cueOrder[from]; }
      for (const r of S.목표CPRP || []) if (/지상파/.test(str(r[0])) && eq(r[1])) r[1] = to;
    }
  }
  n.total = n.지상파 + n.케이블 + n.예산 + n.소재;
  return n;
}
function renameTxt(n) { return [['지상파', n.지상파, '행'], ['케이블', n.케이블, '행'], ['예산표', n.예산, '곳'], ['소재', n.소재, '행']].filter(x => x[1]).map(x => `${x[0]} ${fmt.int(x[1])}${x[2]}`).join(' · '); }

// 이번 달 사용량
function usageMaps() {
  const U = { item: new Map(), ch: new Map(), cm: new Map(), budItem: new Map(), budCh: new Map(), creItem: new Map() };
  const inc = (m, k, v = 1) => { if (k) m.set(k, (m.get(k) || 0) + v); };
  for (const s of M.spots) { inc(U.item, s.item, s.cnt); inc(U.ch, s.ch, s.cnt); if (s.cmRaw) inc(U.cm, norm(s.cmRaw), s.cnt); }
  for (const c of M.cells) if (c.budget) { inc(U.budItem, c.item, c.budget); inc(U.budCh, c.ch, c.budget); }
  for (const c of M.creatives) inc(U.creItem, c.item);
  return U;
}

// 뷰어(보기 전용)일 때 입력 화면을 읽기 전용 표로
function lockForm(el) {
  el.classList.add('ro');
  el.querySelectorAll('input,textarea').forEach(i => { i.readOnly = true; i.tabIndex = -1; if (/^(color|checkbox|radio|file)$/.test(i.type)) i.disabled = true; });
  el.querySelectorAll('select').forEach(x => { x.disabled = true; });
  el.querySelectorAll('[data-add],[data-addch],[data-rx],[data-cx],[data-cl],[data-cr],[data-it],[data-b="paste"],[data-b="fill"],[data-b="wipe"],button.x,[data-addcre],[data-delitem],[data-addit],#creadd,.mapsel,.iha,tr.add,section.itchips,.note.warn').forEach(b => b.remove());
}

// =====================================================================
// 마스터
// =====================================================================
const MST_HELP = {
  품목: '약칭이 큐시트·예산·소재 어디서나 쓰는 유일한 이름이에요(별칭은 쓰지 않아요). 정식명이나 예전 이름으로 적힌 곳이 있으면 화면 위 노란 줄로 알려 드리고, 한 번에 약칭으로 고칠 수 있어요. 순서는 요약 표·그래프의 품목 순서예요.',
  채널: '매체(지상파/케이블)와 MPP로 케이블 큐시트의 PP 묶음과 목표 CPRP를 찾고, 요약그룹으로 운영 요약의 방송사(KBS·MBC·SBS·CJ ENM·JTBC·기타)를 묶어요.',
  CM위치: '큐시트에 적힌 CM 위치 표현을 중CM / PIB / 전후CM 중 하나로 분류해요. 중CM 비중 그래프와 3) 표가 이 분류를 써요.',
  목표CPRP: 'GRP = 예산 ÷ 목표 CPRP(15초 기준) × 초수 환산. 지상파는 채널명, 케이블은 MPP로 찾아요.',
  매칭규칙: '방송사 원본 큐시트를 가져올 때(방송사 큐시트 온보딩) 파일명·시트명으로 채널·품목을 맞추는 규칙이에요. 가져오기 창에서 직접 고른 것이 여기에 쌓여서 다음 달부터 자동으로 맞춰져요. 위에서부터 첫 번째로 맞는 규칙을 써요.',
};
function renderMasterForm(el) {
  const cur = UI.master;
  const tabs = [['품목', `품목 ${M.MS.items.size}`], ['채널', `채널 ${M.MS.chList.length}`], ['CM위치', `CM 위치 ${(WS.sheets.CM위치 || []).length}`], ['목표CPRP', `목표 CPRP ${(WS.sheets.목표CPRP || []).length}`], ['매칭규칙', `매칭 규칙 ${(WS.sheets.매칭규칙 || []).length}`]];
  el.innerHTML = `<div class="viewhead"><div><h2>마스터</h2><div class="sub">이름의 기준. 여기 있는 품목·채널만 예산·소재·큐시트에서 고를 수 있어요. 새 달을 만들면 그대로 이어받아요.</div></div><div class="spacer"></div>
    <label class="advbox" title="요약 제목 · 내려받는 파일 이름에 쓰여요">광고주 <input id="advname" value="${esc(advName())}" ${CLOUD.on ? 'readonly title="온라인에서는 관리자 메뉴의 \'광고주 이름 바꾸기\'로 바꿔요"' : ''}></label>${segHtml('mst', tabs, cur)}</div>
    <div class="formwrap"><section class="card"><div class="bd" id="mbody"></div></section><aside class="side" id="mside"></aside></div>`;
  bindSeg(el, 'mst', v => { UI.master = v; renderMasterForm(el); });
  const an = el.querySelector('#advname'); if (an && !CLOUD.on) an.onchange = () => { WS.adv = an.value.trim(); App.changed('meta', true); App.toast(`광고주 이름: ${esc(advName())}`); };
  const body = el.querySelector('#mbody');
  ({ 품목: mItems, 채널: mChannels, CM위치: mCm, 목표CPRP: mCprp, 매칭규칙: mRules })[cur](body, el);
  bindEnterDown(body);
  renderMasterSide(el);
  el._refresh = () => renderMasterSide(el);
}
function renderMasterSide(el) {
  const side = el.querySelector('#mside'); if (!side) return;
  const cur = UI.master;
  let h = `<div class="card"><div class="hd"><h4>${esc(SHEETS[cur].label)}</h4></div><div class="bd small">${esc(MST_HELP[cur])}
    <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-mx="xlsx">⤓ 마스터 엑셀</button><button class="btn sm ghost" data-mx="reset">${esc(SHEETS[cur].label)} 기본값으로</button></div></div></div>`;
  if (cur === '품목') h += `<div class="card"><div class="hd"><h4>색상 미리보기</h4></div><div class="bd"><div class="chips">${[...M.MS.items.values()].map(it => `<span class="spot" style="--c:${it.light};--b:${it.color};display:inline-block">${esc(it.key)}</span>`).join('')}</div></div></div>`;
  h += App.unknownHtml();
  side.innerHTML = h;
  App.bindUnknown(side);
  side.querySelector('[data-mx="xlsx"]').onclick = () => saveWorkspaceXlsx(WS, M, MASTER_SHEETS, '마스터');
  side.querySelector('[data-mx="reset"]').onclick = () => App.confirm(`${SHEETS[cur].label}을(를) 기본값으로`, `<p>처음 받은 기본 ${esc(SHEETS[cur].label)} 목록으로 되돌려요. 직접 추가·수정한 내용은 사라지고, 지금 상태는 변경 이력에 버전으로 남겨 둘게요.</p>`, '되돌리기', async () => {
    await App.saveVersion(`마스터 ${SHEETS[cur].label} 기본값 복원 전`, true);
    WS.sheets[cur] = DEFAULT_MASTER[cur].map(r => r.slice()); App.changed('master'); App.toast('기본값으로 되돌렸어요');
  });
}
function mstMove(sheet, i, d, sameFn) {
  const rows = WS.sheets[sheet]; let j = i + d;
  while (j >= 0 && j < rows.length && sameFn && !sameFn(rows[j])) j += d;
  if (j < 0 || j >= rows.length) return false;
  [rows[i], rows[j]] = [rows[j], rows[i]]; return true;
}
function mstFocusLast(el, f) { const ins = el.querySelectorAll(`#mbody tr[data-i] input[data-f="${f}"]`); const x = ins[ins.length - 1]; if (x) { x.focus(); x.scrollIntoView({ block: 'center' }); } }
function mstDelete(el, sheet, i, label, used) {
  const go = () => { WS.sheets[sheet].splice(i, 1); App.changed('master'); };
  if (used) App.confirm(`'${label}' 삭제`, `<p>이번 달에 ${used} 쓰고 있어요. 삭제하면 그 행들은 '마스터에 없는 이름'으로 표시돼요.</p>`, '삭제', go);
  else go();
}

// ---- 품목 ---- (별칭 없음: 약칭이 유일한 이름 · ⋮⋮ 끌어서 순서)
function mItems(body, el) {
  const rows = WS.sheets.품목; const U = usageMaps();
  const cats = [...new Set(rows.map(r => str(r[2])).filter(Boolean))];
  body.innerHTML = `<div class="fhd"><div class="muted small">약칭이 큐시트·예산·소재에 쓰는 <b>유일한 이름</b>이에요(별칭 없음). 약칭을 바꾸면 이번 달 시트에 적힌 이름도 함께 바뀌어요. 왼쪽 ⋮⋮를 끌어 순서를 바꿔요.</div><div class="spacer"></div><button class="btn sm pri" data-add>＋ 품목 추가</button></div>
  <datalist id="dl-cat">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
  <div class="tw free"><table class="t form"><thead><tr><th></th><th>색</th><th class="l">약칭 (큐시트 표기)</th><th class="l">정식명 (운영 요약)</th><th class="l">카테고리</th><th class="l">비고 (작업자 메모)</th><th>이번 달</th><th></th></tr></thead><tbody>
  ${rows.map((r, i) => {
    const key = str(r[0]); const n = U.item.get(key) || 0, b = U.budItem.get(key) || 0, cr = U.creItem.get(key) || 0;
    return `<tr data-i="${i}"><td class="dh" title="끌어서 순서 바꾸기">⋮⋮</td>
    <td class="c"><label class="colorpick" style="--c:${colorVal(r[3])}"><input type="color" data-f="3" value="${colorVal(r[3])}"></label></td>
    <td class="in"><input data-f="0" value="${esc(key)}" placeholder="약칭" class="${key ? '' : 'need'}"></td>
    <td class="in"><input data-f="1" value="${esc(str(r[1]))}"></td>
    <td class="in"><input data-f="2" value="${esc(str(r[2]))}" list="dl-cat"></td>
    <td class="in wide"><input data-f="4" value="${esc(str(r[4]))}" placeholder="${key ? '' : '예: 10월부터 신규 · 소재 2종'}"></td>
    <td class="use">${n || b || cr ? [n ? fmt.int(n) + '회' : '', b ? fmt.eok(b, 2) : '', cr ? '소재 ' + cr : ''].filter(Boolean).join(' · ') : '<span class="muted">-</span>'}</td>
    <td><button class="x" data-del title="삭제">✕</button></td></tr>`;
  }).join('')}</tbody></table></div>`;
  body.querySelector('[data-add]').onclick = () => { rows.push(['', '', cats[0] || '기타', nextColor(), '']); App.changed('master', true); renderMasterForm(el); mstFocusLast(el, 0); };
  dragRows(body.querySelector('tbody'), order => { reorderBy(rows, order); App.changed('master', true); renderMasterForm(el); });
  body.querySelectorAll('tr[data-i]').forEach(tr => {
    const i = +tr.dataset.i, r = rows[i];
    tr.querySelector('[data-del]').onclick = () => { const k = str(r[0]); const n = U.item.get(k) || 0, b = U.budItem.get(k) || 0; mstDelete(el, '품목', i, k || '빈 행', (n || b) ? [n ? fmt.int(n) + '회 송출' : '', b ? '예산 ' + fmt.eok(b, 2) : ''].filter(Boolean).join('·') + '에' : ''); };
    tr.querySelectorAll('[data-f]').forEach(inp => {
      const f = +inp.dataset.f;
      if (f === 3) inp.addEventListener('input', () => { inp.parentElement.style.setProperty('--c', inp.value); });
      inp.addEventListener('change', () => {
        const v = inp.value.trim();
        if (f === 0) return mRename('item', '품목', i, v, inp, el);
        r[f] = v; App.changed('master', true); if (f === 3) renderMasterSide(el);
      });
    });
  });
}
// 약칭·채널명 바꾸기
function mRename(kind, sheet, i, v, inp, el) {
  const rows = WS.sheets[sheet]; const r = rows[i]; const old = str(r[0]);
  if (v === old) return;
  const what = kind === 'item' ? '품목' : '채널';
  if (!v) { inp.value = old; if (old) App.toast(`${what} 이름은 비울 수 없어요. 지우려면 오른쪽 ✕를 누르세요.`); return; }
  if (rows.some((x, j) => j !== i && norm(x[0]) === norm(v))) { inp.value = old; return App.toast(`'${esc(v)}'은(는) 이미 있는 ${what}이에요`); }
  const owner = kind === 'item' ? resolveItem(M.MS, v) : (resolveCh(M.MS, v) || {}).name;
  if (owner && owner !== old) { inp.value = old; return App.toast(kind === 'item' ? `'${esc(v)}'은(는) 이미 있는 약칭이에요.` : `'${esc(v)}'은(는) 이미 '${esc(owner)}'의 별칭이에요. 그 ${what}의 별칭에서 먼저 빼 주세요.`, 5000); }
  if (!old) { r[0] = v; if (kind === 'item' && !str(r[1])) { r[1] = v; const f1 = inp.closest('tr').querySelector('[data-f="1"]'); if (f1) f1.value = v; } inp.classList.remove('need'); App.changed('master', true); return; }
  const n = renameEverywhere(kind, old, v, true);
  const syncFull = () => { if (kind === 'item' && str(r[1]) === old) r[1] = v; };
  // 품목: 별칭 없이 이름만 바꿈 (옛 이름은 '잘못 적힌 이름' 알림용으로만 기억) · 채널: 옛 이름을 별칭으로 남김
  const keepOld = () => { if (kind === 'item') { WS.itemLegacy = WS.itemLegacy || {}; WS.itemLegacy[v] = addAlias(WS.itemLegacy[old] || '', old); delete WS.itemLegacy[old]; } else r[1] = addAlias(dropAlias(r[1], v), old); };
  const apply = () => { syncFull(); r[0] = v; keepOld(); renameEverywhere(kind, old, v); App.dataReplaced(); App.toast(`${what} 이름을 '${esc(old)}' → '${esc(v)}'로 바꿨어요${n.total ? ` (${renameTxt(n)})` : ''}.${kind === 'item' ? '' : ' 옛 이름은 별칭으로 남겼어요.'}`, 6000); };
  if (!n.total) { syncFull(); r[0] = v; keepOld(); App.changed('master', true); const tr = inp.closest('tr'); const al = kind === 'ch' && tr.querySelector('[data-f="1"]'); if (al) al.value = r[1]; const f1 = kind === 'item' && tr.querySelector('[data-f="1"]'); if (f1) f1.value = r[1]; return; }
  App.confirm(`${what} 이름 바꾸기: ${old} → ${v}`, `<p>이번 달 <b>${renameTxt(n)}</b>에 '${esc(old)}'로 적혀 있어요. 모두 '${esc(v)}'로 바꿀게요.${kind === 'item' ? ' 나중에 옛 이름으로 들어오면 고치라고 알려 드려요.' : ` 담당자가 옛 이름으로 보내도 알아보도록 '${esc(old)}'는 별칭으로 남겨 둘게요.`}</p><p class="small muted">입력 표의 되돌리기(Ctrl+Z) 기록은 초기화돼요.</p>`, '모두 바꾸기', apply, () => { inp.value = old; });
}

// ---- 채널 ----
function mChannels(body, el) {
  const rows = WS.sheets.채널; const U = usageMaps();
  const mpps = [...new Set(rows.map(r => str(r[3])).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
  const groups = [...new Set(SUM_GROUPS.concat(rows.map(r => str(r[4])).filter(Boolean)))];
  const isG = r => /지상파/.test(str(r[2]));
  const sec = (media) => {
    const idx = rows.map((r, i) => i).filter(i => (media === '지상파') === isG(rows[i]));
    return `<tr class="grp"><td colspan="9">${media} <span class="muted small">${idx.length}개</span></td></tr>` + idx.map(i => {
      const r = rows[i]; const name = str(r[0]); const n = U.ch.get(name) || 0, b = U.budCh.get(name) || 0;
      return `<tr data-i="${i}" data-sec="${media}"><td class="dh" title="끌어서 순서 바꾸기 (같은 매체 안에서)">⋮⋮</td>
      <td class="in"><input data-f="0" value="${esc(name)}" placeholder="채널명" class="${name ? '' : 'need'}"></td>
      <td class="in"><select data-f="2">${optHtml(['지상파', '케이블'], isG(r) ? '지상파' : '케이블')}</select></td>
      <td class="in"><input data-f="3" value="${esc(str(r[3]))}" list="dl-mpp" placeholder="${isG(r) ? '' : 'MPP'}"></td>
      <td class="in"><select data-f="4">${optHtml(groups, str(r[4]) || (isG(r) ? name : '기타'))}</select></td>
      <td class="in wide"><input data-f="1" value="${esc(str(r[1]))}" placeholder="${name ? '' : '다르게 적히는 이름 (쉼표로 구분)'}"></td>
      <td class="use">${n || b ? [n ? fmt.int(n) + '회' : '', b ? fmt.eok(b, 2) : ''].filter(Boolean).join(' · ') : '<span class="muted">-</span>'}</td>
      <td><button class="x" data-del title="삭제">✕</button></td></tr>`;
    }).join('');
  };
  body.innerHTML = `<div class="fhd"><div class="muted small">케이블 큐시트는 MPP(=PP)로 먼저 묶이고 그 아래 채널을 골라 봐요. 순서는 표·큐시트의 채널 순서예요 — 왼쪽 ⋮⋮를 끌어 바꿔요.</div><div class="spacer"></div><button class="btn sm" data-add="지상파">＋ 지상파 채널</button><button class="btn sm pri" data-add="케이블">＋ 케이블 채널</button></div>
  <datalist id="dl-mpp">${mpps.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
  <div class="tw free"><table class="t form"><thead><tr><th></th><th class="l">채널</th><th class="l">매체</th><th class="l">MPP (PP)</th><th class="l">요약그룹</th><th class="l">별칭</th><th>이번 달</th><th></th></tr></thead><tbody>${sec('지상파')}${sec('케이블')}</tbody></table></div>`;
  body.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
    const g = b.dataset.add === '지상파';
    const at = g ? rows.reduce((a, r, i) => isG(r) ? i + 1 : a, 0) : rows.length;
    rows.splice(at, 0, ['', '', b.dataset.add, '', g ? '' : '기타']); App.changed('master', true); renderMasterForm(el);
    const tr = el.querySelector(`#mbody tr[data-i="${at}"] input[data-f="0"]`); if (tr) { tr.focus(); tr.scrollIntoView({ block: 'center' }); }
  });
  dragRows(body.querySelector('tbody'), order => { reorderBy(rows, order); App.changed('master', true); renderMasterForm(el); }, (a, b) => a.dataset.sec === b.dataset.sec);
  body.querySelectorAll('tr[data-i]').forEach(tr => {
    const i = +tr.dataset.i, r = rows[i];
    tr.querySelector('[data-del]').onclick = () => { const k = str(r[0]); const n = U.ch.get(k) || 0, b = U.budCh.get(k) || 0; mstDelete(el, '채널', i, k || '빈 행', (n || b) ? [n ? fmt.int(n) + '회 송출' : '', b ? '예산 ' + fmt.eok(b, 2) : ''].filter(Boolean).join('·') + '에' : ''); };
    tr.querySelectorAll('[data-f]').forEach(inp => inp.addEventListener('change', () => {
      const f = +inp.dataset.f; let v = inp.value.trim();
      if (f === 0) return mRename('ch', '채널', i, v, inp, el);
      if (f === 1) { v = v.split(/[,;/]/).map(x => x.trim()).filter(Boolean).join(', '); inp.value = v; }
      r[f] = v;
      if (f === 2) { if (v === '지상파' && (!str(r[4]) || str(r[4]) === '기타')) r[4] = str(r[0]); App.changed('master', true); renderMasterForm(el); return; }
      App.changed('master', true);
    }));
  });
}

// ---- CM 위치 ----
function mCm(body, el) {
  const rows = WS.sheets.CM위치; const U = usageMaps();
  const classes = [...new Set(CM_CLASSES.concat(rows.map(r => str(r[1])).filter(Boolean)))];
  const unk = new Map();
  for (const s of M.spots) if (s.cmRaw && !M.MS.cm.has(norm(s.cmRaw))) { const k = s.cmRaw; const x = unk.get(k) || { n: 0, cls: s.cmCls, media: s.media }; x.n += s.cnt; unk.set(k, x); }
  const q = UI.cmQ || '';
  body.innerHTML = `${unk.size ? `<div class="note warn" style="margin-top:0"><b>마스터에 없는 표현 ${unk.size}개</b> — 지금은 규칙으로 추정해서 집계하고 있어요. 맞으면 추가만 누르세요.
      <div class="unkcm">${[...unk].sort((a, b) => b[1].n - a[1].n).map(([k, x]) => `<span class="uc"><b>${esc(k)}</b> <span class="muted">${fmt.int(x.n)}회</span> → <select data-ucls="${esc(k)}">${optHtml(classes, x.cls)}</select><button class="btn sm" data-uadd="${esc(k)}">추가</button></span>`).join('')}</div>
      <button class="btn sm pri" data-uall style="margin-top:6px">추정대로 모두 추가</button></div>` : ''}
    <div class="fhd"><input class="search" id="cmq" placeholder="표현 검색" value="${esc(q)}"><span class="muted small">${rows.length}개 · 앞 글자가 '중'이면 중CM, TOP·END·PIB면 PIB로 추정해요</span><div class="spacer"></div><button class="btn sm pri" data-add>＋ 표현 추가</button></div>
    <datalist id="dl-cmcls">${classes.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="tw free fit"><table class="t form narrow"><thead><tr><th class="l">큐시트 표현</th><th class="l">구분</th><th>이번 달</th><th></th></tr></thead><tbody>
    ${rows.map((r, i) => { if (q && !norm(r[0]).includes(norm(q)) && !norm(r[1]).includes(norm(q))) return ''; const n = U.cm.get(norm(r[0])) || 0;
      return `<tr data-i="${i}"><td class="in"><input data-f="0" value="${esc(str(r[0]))}" class="${str(r[0]) ? '' : 'need'}"></td><td class="in"><input data-f="1" value="${esc(str(r[1]))}" list="dl-cmcls"></td><td class="use">${n ? fmt.int(n) + '회' : '<span class="muted">-</span>'}</td><td><button class="x" data-del title="삭제">✕</button></td></tr>`; }).join('')}
    </tbody></table></div>`;
  const qi = body.querySelector('#cmq');
  qi.oninput = debounce(() => { UI.cmQ = qi.value; const pos = qi.selectionStart; renderMasterForm(el); const n = el.querySelector('#cmq'); n.focus(); n.setSelectionRange(pos, pos); }, 200);
  body.querySelector('[data-add]').onclick = () => { UI.cmQ = ''; rows.push(['', '중CM']); App.changed('master', true); renderMasterForm(el); mstFocusLast(el, 0); };
  body.querySelectorAll('[data-uadd]').forEach(b => b.onclick = () => { const k = b.dataset.uadd; rows.push([k, body.querySelector(`[data-ucls="${CSS.escape(k)}"]`).value]); App.changed('master'); });
  const ua = body.querySelector('[data-uall]'); if (ua) ua.onclick = () => { body.querySelectorAll('[data-ucls]').forEach(s => rows.push([s.dataset.ucls, s.value])); App.changed('master'); App.toast(`CM 위치 ${unk.size}개를 추가했어요`); };
  body.querySelectorAll('tr[data-i]').forEach(tr => {
    const i = +tr.dataset.i, r = rows[i];
    tr.querySelector('[data-del]').onclick = () => { rows.splice(i, 1); App.changed('master'); };
    tr.querySelectorAll('[data-f]').forEach(inp => inp.addEventListener('change', () => {
      const f = +inp.dataset.f, v = inp.value.trim();
      if (f === 0 && v && rows.some((x, j) => j !== i && norm(x[0]) === norm(v))) { inp.value = str(r[0]); return App.toast(`'${esc(v)}'은(는) 이미 있어요`); }
      r[f] = v; inp.classList.toggle('need', f === 0 && !v); App.changed('master', true);
    }));
  });
}

// ---- 목표 CPRP ----
function mCprp(body, el) {
  const rows = WS.sheets.목표CPRP;
  const pps = [...new Set(M.MS.chList.filter(c => c.media === '케이블').map(c => c.mpp))];
  const gch = M.MS.chList.filter(c => c.media === '지상파').map(c => c.name);
  const miss = new Map();
  for (const c of M.cells) if (c.budget > 0 && !c.cprp) { const pp = c.media === '지상파' ? c.ch : c.mpp; miss.set(c.media + '|' + pp, { media: c.media, pp, b: (miss.get(c.media + '|' + pp) || { b: 0 }).b + c.budget }); }
  const used = r => { const media = /지상파/.test(str(r[0])) ? '지상파' : '케이블'; return M.cells.filter(c => c.budget > 0 && c.media === media && (norm(media === '지상파' ? c.ch : c.mpp) === norm(r[1]) || norm(c.mpp) === norm(r[1]))); };
  body.innerHTML = `${miss.size ? `<div class="note warn" style="margin-top:0"><b>목표 CPRP가 없는 예산</b> — GRP가 0으로 잡혀요.<div class="unkcm">${[...miss.values()].map(x => `<span class="uc"><b>${esc(x.media)} · ${esc(x.pp)}</b> <span class="muted">예산 ${fmt.eok(x.b, 2)}</span><button class="btn sm" data-madd="${esc(x.media + '|' + x.pp)}">행 추가</button></span>`).join('')}</div></div>` : ''}
    <div class="fhd"><div class="muted small">15초 기준 CPRP(원). '150만'처럼 써도 돼요.</div><div class="spacer"></div><button class="btn sm pri" data-add>＋ CPRP 추가</button></div>
    <datalist id="dl-pp-케이블">${pps.map(c => `<option value="${esc(c)}">`).join('')}</datalist><datalist id="dl-pp-지상파">${gch.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="tw free fit"><table class="t form narrow"><thead><tr><th class="l">매체</th><th class="l">PP (지상파는 채널)</th><th>CPRP (원)</th><th>이번 달 적용</th><th></th></tr></thead><tbody>
    ${rows.map((r, i) => { const media = /지상파/.test(str(r[0])) ? '지상파' : '케이블'; const u = used(r);
      return `<tr data-i="${i}"><td class="in"><select data-f="0">${optHtml(['지상파', '케이블'], media)}</select></td><td class="in"><input data-f="1" value="${esc(str(r[1]))}" list="dl-pp-${media}" class="${str(r[1]) ? '' : 'need'}"></td>
      <td class="in"><input data-f="2" class="r" inputmode="numeric" value="${esc(amtTxt(num(r[2]) == null ? r[2] : num(r[2])))}"></td>
      <td class="use">${u.length ? `${u.length}개 채널×품목 · 예산 ${fmt.eok(sum(u, c => c.budget), 2)}` : '<span class="muted">-</span>'}</td><td><button class="x" data-del title="삭제">✕</button></td></tr>`; }).join('')}
    </tbody></table></div>`;
  body.querySelector('[data-add]').onclick = () => { rows.push(['케이블', '', '']); App.changed('master', true); renderMasterForm(el); mstFocusLast(el, 1); };
  body.querySelectorAll('[data-madd]').forEach(b => b.onclick = () => { const [media, pp] = b.dataset.madd.split('|'); rows.push([media, pp, '']); App.changed('master', true); renderMasterForm(el); mstFocusLast(el, 2); });
  body.querySelectorAll('tr[data-i]').forEach(tr => {
    const i = +tr.dataset.i, r = rows[i];
    tr.querySelector('[data-del]').onclick = () => { rows.splice(i, 1); App.changed('master'); };
    tr.querySelectorAll('[data-f]').forEach(inp => {
      if (+inp.dataset.f === 2) inp.addEventListener('focus', () => { inp.value = num(r[2]) == null ? str(r[2]) : String(num(r[2])); inp.select(); });
      inp.addEventListener('change', () => {
        const f = +inp.dataset.f; let v = inp.value.trim();
        if (f === 2) { const n = parseAmount(v); if (n === null) { inp.classList.add('bad'); return App.toast('숫자로 읽을 수 없어요'); } inp.classList.remove('bad'); r[2] = n; inp.value = amtTxt(n); }
        else r[f] = v;
        App.changed('master', f !== 0); if (f === 0) renderMasterForm(el);
      });
      if (+inp.dataset.f === 2) inp.addEventListener('blur', () => { if (!inp.classList.contains('bad')) inp.value = amtTxt(num(r[2]) == null ? r[2] : num(r[2])); });
    });
  });
}

// =====================================================================
// 예산 : 채널 × 품목
// =====================================================================
// 예산 시트를 마스터 이름 기준으로 정리 (이름 통일·중복 합산·정렬)
function budNormalize() {
  const B = WS.sheets.예산 && WS.sheets.예산.length ? WS.sheets.예산 : [['채널']];
  const head = B[0] || ['채널'];
  const cols = []; const colOf = new Map(); const map = [];
  for (let j = 1; j < head.length; j++) {
    const raw = str(head[j]);
    if (!raw && !B.slice(1).some(r => num(r[j]))) { map[j] = -1; continue; }
    const name = raw ? (resolveItemLoose(M.MS, raw) || raw) : '';
    const k = name || ('#' + j);
    if (!colOf.has(k)) { colOf.set(k, cols.length); cols.push(name); }
    map[j] = colOf.get(k);
  }
  const rowOf = new Map(); const rows = [];
  for (let i = 1; i < B.length; i++) {
    const r = B[i]; if (isBlankRow(r)) continue;
    const raw = str(r[0]); if (/^(합계|총계|계|total)$/i.test(raw) || /\s계$/.test(raw)) continue;
    const c = resolveCh(M.MS, raw); const name = c ? c.name : raw;
    if (!rowOf.has(name)) { rowOf.set(name, rows.length); rows.push({ ch: name, info: c, v: cols.map(() => '') }); }
    const row = rows[rowOf.get(name)];
    for (let j = 1; j < r.length; j++) { const ci = map[j]; if (ci == null || ci < 0) continue; const n = num(r[j]); if (n == null) continue; row.v[ci] = (row.v[ci] === '' ? 0 : row.v[ci]) + n; }
  }
  // 매체 → PP(마스터에서 그 PP 채널이 처음 나오는 순서) → 채널 순서
  const ppRank = budPPRank();
  const mo = x => x.info ? (x.info.media === '지상파' ? 0 : 100000) + (x.info.media === '지상파' ? 0 : (ppRank.get(x.info.mpp) || 0) * 1000) + x.info.order : 900000;
  rows.sort((a, b) => mo(a) - mo(b));
  const out = [['채널'].concat(cols)].concat(rows.map(r => [r.ch].concat(r.v)));
  if (JSON.stringify(out) !== JSON.stringify(WS.sheets.예산 || [])) { WS.sheets.예산 = out; return true; }
  return false;
}
function budPPRank() { const m = new Map(); for (const c of M.MS.chList) if (c.media === '케이블' && !m.has(c.mpp)) m.set(c.mpp, m.size + 1); return m; }
function budPP(ch) { const c = resolveCh(M.MS, ch); return c ? (c.media === '지상파' ? '지상파' : c.mpp) : ''; }
// ＋ 채널 추가: PP 묶음 → 채널을 고르는 창 (없는 채널은 PP를 정해 마스터에 바로 추가)
function openAddChannel(anchor, media, present, onPick) {
  closePops();
  const pop = document.createElement('div'); pop.className = 'pop addch';
  const pps = () => { const m = new Map(); for (const c of M.MS.chList) if (c.media === media) { const k = media === '지상파' ? '지상파' : c.mpp; if (!m.has(k)) m.set(k, []); m.get(k).push(c); } return m; };
  let cur = null;
  const draw = q => {
    const G = pps(); const keys = [...G.keys()];
    if (!cur || !G.has(cur)) cur = keys.find(k => G.get(k).some(c => !present.has(c.name))) || keys[0];
    const qq = norm(q);
    const list = qq ? M.MS.chList.filter(c => c.media === media && (norm(c.name).includes(qq) || norm(c.mpp).includes(qq))) : (G.get(cur) || []);
    pop.innerHTML = `<div class="ach-hd"><b>${media} 채널 추가</b><input class="mq" placeholder="채널·PP 검색" value="${esc(q || '')}"></div>
      <div class="ach-b">${media === '케이블' ? `<div class="ach-pp">${keys.map(k => { const l = G.get(k); const left = l.filter(c => !present.has(c.name)).length; return `<button type="button" class="${k === cur && !qq ? 'on' : ''}" data-pp="${esc(k)}"><span>${esc(k)}</span><small>${left ? left : '✓'}</small></button>`; }).join('')}</div>` : ''}
      <div class="ach-ch">${list.length ? list.map(c => present.has(c.name) ? `<div class="ach-x"><span>${esc(c.name)}</span><small>이미 있음</small></div>` : `<button type="button" data-ch="${esc(c.name)}"><span>${esc(c.name)}</span>${qq && media === '케이블' ? `<small>${esc(c.mpp)}</small>` : ''}</button>`).join('') : '<div class="muted small" style="padding:8px">없어요</div>'}</div></div>
      <div class="ach-new"><span class="muted small">마스터에 없는 채널</span><input data-nn placeholder="새 채널 이름" value="${esc(qq && !list.some(c => norm(c.name) === qq) ? q : '')}">${media === '케이블' ? `<input data-np list="dl-achpp" placeholder="PP" value="${esc(qq ? '' : cur || '')}"><datalist id="dl-achpp">${keys.map(k => `<option value="${esc(k)}">`).join('')}</datalist>` : ''}<button type="button" class="btn sm" data-mk>마스터에 추가하고 넣기</button></div>`;
    const qi = pop.querySelector('.mq'); qi.oninput = () => { const pos = qi.selectionStart; draw(qi.value); const n = pop.querySelector('.mq'); n.focus(); n.setSelectionRange(pos, pos); };
  };
  draw('');
  document.body.appendChild(pop); placePop(pop, anchor);
  setTimeout(() => { const q = pop.querySelector('.mq'); if (q) q.focus(); }, 30);
  pop.addEventListener('click', e => {
    const pp = e.target.closest('[data-pp]'); if (pp) { cur = pp.dataset.pp; draw(''); return; }
    const ch = e.target.closest('[data-ch]'); if (ch) { closePops(); onPick(ch.dataset.ch); return; }
    if (e.target.closest('[data-mk]')) {
      const name = pop.querySelector('[data-nn]').value.trim(); const ppv = media === '케이블' ? pop.querySelector('[data-np]').value.trim() : name;
      if (!name) return App.toast('새 채널 이름을 적어 주세요');
      const ex = resolveCh(M.MS, name); if (ex) { closePops(); return onPick(ex.name); }
      if (media === '케이블' && !ppv) return App.toast('PP를 적거나 골라 주세요');
      const rows = WS.sheets.채널; const at = media === '지상파' ? rows.reduce((a, r, i) => /지상파/.test(str(r[2])) ? i + 1 : a, 0) : rows.length;
      rows.splice(at, 0, [name, '', media, ppv, media === '지상파' ? name : '기타']);
      setM(compute(WS)); App.toast(`마스터 채널에 '${esc(name)}'${media === '케이블' ? ` (PP ${esc(ppv)})` : ''}을(를) 추가했어요`);
      closePops(); onPick(name);
    }
  });
  pop.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && e.target.classList.contains('mq')) { const b = pop.querySelector('[data-ch]'); if (b) b.click(); } });
}
function budTotals() {
  const B = WS.sheets.예산; const cols = B[0].slice(1);
  const media = r => { const c = resolveCh(M.MS, r[0]); return c ? c.media : '?'; };
  const t = { col: cols.map(() => 0), g: cols.map(() => 0), c: cols.map(() => 0), row: [], all: 0, gAll: 0, cAll: 0 };
  B.slice(1).forEach((r, i) => {
    let s = 0; const m = media(r);
    cols.forEach((_, j) => { const v = num(r[j + 1]) || 0; s += v; t.col[j] += v; if (m === '지상파') t.g[j] += v; else if (m === '케이블') t.c[j] += v; });
    t.row[i] = s; t.all += s; if (m === '지상파') t.gAll += s; else if (m === '케이블') t.cAll += s;
  });
  return t;
}
function renderBudgetForm(el) {
  if (budNormalize()) App.changed('예산', true);
  const B = WS.sheets.예산; const cols = B[0].slice(1); const rows = B.slice(1);
  const items = [...M.MS.items.values()];
  const have = new Set(cols);
  const T = budTotals();
  const secOf = r => { const c = resolveCh(M.MS, r[0]); return c ? c.media : '미확인'; };
  const present = new Set(rows.map(r => r[0]));
  const cellCnt = (ch, k) => { const c = M.cellMap.get(ch + '|' + k); return c && c.cnt ? `<small class="cc">${fmt.int(c.cnt)}회</small>` : ''; };
  const colHead = (k, j) => { const it = M.MS.items.get(k); return `<th class="ih${it ? '' : ' unk'}" data-col="${j}"><div class="ihd">${it ? `<span class="sw" style="background:${it.color}"></span>` : ''}<span class="nm">${esc(k || '(이름 없음)')}</span></div>
    <div class="iha">${j > 0 ? `<button data-cl="${j}" title="왼쪽으로">◀</button>` : ''}${j < cols.length - 1 ? `<button data-cr="${j}" title="오른쪽으로">▶</button>` : ''}<button data-cx="${j}" title="열 빼기">✕</button></div>
    ${it ? '' : `<select data-cmap="${j}" class="mapsel"><option value="">마스터 품목으로…</option>${items.filter(x => !have.has(x.key)).map(x => `<option value="${esc(x.key)}">${esc(x.key)}</option>`).join('')}</select>`}</th>`; };
  let body = '';
  for (const sec of ['지상파', '케이블', '미확인']) {
    const idx = rows.map((r, i) => i).filter(i => secOf(rows[i]) === sec);
    if (sec === '미확인' && !idx.length) continue;
    body += `<tr class="grp"><td colspan="${cols.length + 3}">${sec === '미확인' ? '<span style="color:#8f3d35">마스터에 없는 채널</span>' : sec}</td></tr>`;
    // PP(상위) → 채널: 같은 PP 채널은 PP 칸 하나로 묶음
    idx.forEach((i, n) => {
      const r = rows[i]; const c = resolveCh(M.MS, r[0]); const pp = budPP(r[0]);
      const first = n === 0 || budPP(rows[idx[n - 1]][0]) !== pp;
      let span = 1; if (first) while (n + span < idx.length && budPP(rows[idx[n + span]][0]) === pp) span++;
      const ppTot = first ? idx.slice(n, n + span).reduce((a, k) => a + (T.row[k] || 0), 0) : 0;
      body += `<tr data-r="${i}" data-pp="${esc(pp)}"${first ? ' class="ppfirst"' : ''}>${first ? `<td class="l ppc" rowspan="${span}"><span class="pn">${esc(sec === '지상파' ? '지상파 3사' : pp || '-')}</span>${span > 1 || sec === '케이블' ? `<small class="pt" data-ppt="${esc(pp)}">${ppTot ? fmt.eok(ppTot, 2) : ''}</small>` : ''}</td>` : ''}<td class="l chn"><span class="nm">${esc(r[0])}</span>${c ? '' : `<select data-rmap="${i}" class="mapsel"><option value="">마스터 채널로…</option>${M.MS.chList.filter(x => !present.has(x.name)).map(x => `<option value="${esc(x.name)}">${esc(x.name)}</option>`).join('')}</select>`}<button class="x" data-rx="${i}" title="행 빼기">✕</button></td>
        ${cols.map((k, j) => `<td class="in bi"><input data-r="${i}" data-c="${j}" inputmode="numeric" value="${esc(amtTxt(r[j + 1]))}">${cellCnt(r[0], k)}</td>`).join('')}<td class="rt" data-rt="${i}">${T.row[i] ? fmt.won(T.row[i]) : ''}</td></tr>`;
    });
    if (sec !== '미확인') body += `<tr class="add"><td class="l" colspan="2"><button type="button" class="addchbtn" data-addch="${sec}">＋ ${sec} 채널 추가${sec === '케이블' ? ' <small>PP → 채널</small>' : ''}</button></td><td colspan="${cols.length + 1}"></td></tr>`;
    if (sec !== '미확인') body += `<tr class="sub" data-st="${sec}"><td class="l" colspan="2">${sec} 계</td>${cols.map((_, j) => `<td>${(sec === '지상파' ? T.g : T.c)[j] ? fmt.won((sec === '지상파' ? T.g : T.c)[j]) : '-'}</td>`).join('')}<td>${fmt.won(sec === '지상파' ? T.gAll : T.cAll)}</td></tr>`;
  }
  body += `<tr class="tot" data-st="all"><td class="l" colspan="2">합계</td>${cols.map((_, j) => `<td>${fmt.won(T.col[j])}</td>`).join('')}<td>${fmt.won(T.all)}</td></tr>`;
  el.innerHTML = `<div class="viewhead"><div><h2>예산</h2><div class="sub">${ymLabel()} · 채널 × 품목 예산 (원, VAT 별도)${roTab('예산') ? '' : `. '1.5억', '3000만'처럼 써도 되고, 엑셀 범위를 복사해 칸에 붙여넣으면 그 칸부터 채워져요.`}</div></div><div class="spacer"></div>
      <button class="btn sm" data-b="paste">엑셀 표 통째로 붙여넣기</button><button class="btn sm" data-b="fill">기본 채널 넣기</button><button class="btn sm" data-b="xlsx">⤓ 예산 엑셀</button><button class="btn sm ghost" data-b="wipe">금액 비우기</button></div>
    <div class="formwrap"><div class="stack">
      <section class="card itchips"><div class="hd"><h3>품목</h3><span class="sub">누르면 예산표 열로 넣고 빼요. 열 순서가 요약 표·그래프의 품목 순서예요.</span></div><div class="bd"><div class="chips">${items.map(it => `<button class="chipbtn ${have.has(it.key) ? 'on' : ''}" data-it="${esc(it.key)}"><span class="sw" style="background:${it.color}"></span>${esc(it.key)}</button>`).join('')}</div></div></section>
      <section class="card"><div class="tw free bud"><table class="t form budget"><thead><tr><th class="l pph">PP</th><th class="l chh">채널</th>${cols.map(colHead).join('')}<th>계</th></tr></thead><tbody>${body}</tbody></table></div></section>
    </div><aside class="side" id="bside"></aside></div>`;
  if (!cols.length) el.querySelector('.bud').insertAdjacentHTML('afterbegin', '<div class="empty">위에서 이번 달 품목을 눌러 열을 만들고, 채널을 추가해 금액을 넣으세요.</div>');
  const tb = el.querySelector('table.budget');
  const write = (i, j, v) => { WS.sheets.예산[i + 1][j + 1] = v; };
  const refreshTotals = () => {
    const T2 = budTotals();
    tb.querySelectorAll('[data-rt]').forEach(td => { const v = T2.row[+td.dataset.rt]; td.textContent = v ? fmt.won(v) : ''; });
    tb.querySelectorAll('tr[data-st]').forEach(tr => { const s = tr.dataset.st; const arr = s === '지상파' ? T2.g : s === '케이블' ? T2.c : T2.col; const all = s === '지상파' ? T2.gAll : s === '케이블' ? T2.cAll : T2.all; const tds = tr.querySelectorAll('td'); arr.forEach((v, j) => { tds[j + 1].textContent = v ? fmt.won(v) : '-'; }); tds[tds.length - 1].textContent = fmt.won(all); });
    tb.querySelectorAll('[data-ppt]').forEach(sm => { const pp = sm.dataset.ppt; let t = 0; tb.querySelectorAll(`tr[data-r][data-pp="${CSS.escape(pp)}"]`).forEach(tr => { t += T2.row[+tr.dataset.r] || 0; }); sm.textContent = t ? fmt.eok(t, 2) : ''; });
    renderBudgetSide(el);
  };
  tb.addEventListener('focusin', e => { const inp = e.target.closest('input[data-r]'); if (!inp) return; const v = WS.sheets.예산[+inp.dataset.r + 1][+inp.dataset.c + 1]; inp.value = v === '' || v == null ? '' : String(v); inp.select(); });
  tb.addEventListener('focusout', e => { const inp = e.target.closest('input[data-r]'); if (!inp || inp.classList.contains('bad')) return; inp.value = amtTxt(WS.sheets.예산[+inp.dataset.r + 1][+inp.dataset.c + 1]); });
  tb.addEventListener('change', e => {
    const inp = e.target.closest('input[data-r]'); if (!inp) return;
    const v = parseAmount(inp.value);
    if (v === null) { inp.classList.add('bad'); App.toast(`'${esc(inp.value)}'를 금액으로 읽지 못했어요`); return; }
    inp.classList.remove('bad'); write(+inp.dataset.r, +inp.dataset.c, v);
    if (document.activeElement !== inp) inp.value = amtTxt(v);
    refreshTotals(); App.changed('예산', true);
  });
  tb.addEventListener('keydown', e => {
    const inp = e.target.closest('input[data-r]'); if (!inp || e.isComposing) return;
    const mv = { Enter: e.shiftKey ? -1 : 1, ArrowDown: 1, ArrowUp: -1 }[e.key]; if (!mv) return;
    e.preventDefault();
    const all = [...tb.querySelectorAll(`input[data-c="${inp.dataset.c}"]`)]; const k = all.indexOf(inp) + mv;
    if (all[k]) all[k].focus(); else inp.blur();
  });
  tb.addEventListener('paste', e => {
    const inp = e.target.closest('input[data-r]'); if (!inp || roTab('예산')) return;
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!/[\t\n]/.test(text.trim())) return;
    e.preventDefault();
    const blk = xgParseTsv(text);
    const order = [...tb.querySelectorAll('tr[data-r]')].map(tr => +tr.dataset.r);
    const r0 = order.indexOf(+inp.dataset.r), c0 = +inp.dataset.c; let n = 0, bad = 0, over = 0;
    blk.forEach((br, bi) => { const ri = order[r0 + bi]; if (ri == null) { if (br.some(x => str(x))) over++; return; } br.forEach((x, bj) => { const cj = c0 + bj; if (cj >= cols.length) return; const v = parseAmount(x); if (v === null) { bad++; return; } write(ri, cj, v); n++; }); });
    App.changed('예산', true); renderBudgetForm(el);
    App.toast(`${fmt.int(n)}칸을 채웠어요${bad ? ` · 숫자가 아닌 ${bad}칸은 건너뜀` : ''}${over ? ` · 행이 모자라 ${over}줄은 못 넣었어요 (채널을 먼저 추가하세요)` : ''}`);
  });
  // 품목 열 넣고 빼기
  const delCol = j => { WS.sheets.예산.forEach(r => r.splice(j + 1, 1)); App.changed('예산'); };
  el.querySelectorAll('[data-it]').forEach(b => b.onclick = () => {
    const k = b.dataset.it; const j = cols.indexOf(k);
    if (j < 0) { WS.sheets.예산.forEach((r, i) => { while (r.length < cols.length + 1) r.push(''); r.push(i === 0 ? k : ''); }); App.changed('예산'); return; }
    const t = T.col[j]; if (!t) return delCol(j);
    App.confirm(`'${k}' 열 빼기`, `<p>${esc(k)} 예산 <b>${fmt.won(t)}원</b>이 들어 있어요. 열을 빼면 금액도 지워져요.</p>`, '빼기', () => delCol(j));
  });
  el.querySelectorAll('[data-cx]').forEach(b => b.onclick = () => { const j = +b.dataset.cx; const t = T.col[j]; if (!t) return delCol(j); App.confirm(`'${cols[j] || '(이름 없음)'}' 열 빼기`, `<p>예산 <b>${fmt.won(t)}원</b>이 들어 있어요. 열을 빼면 금액도 지워져요.</p>`, '빼기', () => delCol(j)); });
  const swapCol = (a, b2) => { WS.sheets.예산.forEach(r => { [r[a + 1], r[b2 + 1]] = [r[b2 + 1], r[a + 1]]; }); App.changed('예산'); };
  el.querySelectorAll('[data-cl]').forEach(b => b.onclick = () => swapCol(+b.dataset.cl, +b.dataset.cl - 1));
  el.querySelectorAll('[data-cr]').forEach(b => b.onclick = () => swapCol(+b.dataset.cr, +b.dataset.cr + 1));
  el.querySelectorAll('[data-cmap]').forEach(s => s.onchange = () => { if (!s.value) return; WS.sheets.예산[0][+s.dataset.cmap + 1] = s.value; App.changed('예산'); });
  // 채널 행
  el.querySelectorAll('[data-addch]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    openAddChannel(b, b.dataset.addch, new Set(WS.sheets.예산.slice(1).map(r => str(r[0]))), ch => {
      if (WS.sheets.예산.slice(1).some(r => str(r[0]) === ch)) return App.toast(`'${esc(ch)}'은(는) 이미 예산표에 있어요`);
      WS.sheets.예산.push([ch].concat(WS.sheets.예산[0].slice(1).map(() => '')));
      App.changed('예산', false, () => {
        const rr = [...App.paneEl('예산').querySelectorAll('tr[data-r]')].find(tr => tr.querySelector('.nm').textContent === ch); if (!rr) return;
        rr.classList.add('justadded'); setTimeout(() => rr.classList.remove('justadded'), 2200);
        const f = rr.querySelector('input'); if (f) f.focus(); rr.scrollIntoView({ block: 'center' });
      });
      App.toast(`예산표에 '${esc(ch)}' 행을 넣었어요${cols.length ? '' : ' · 위 품목을 눌러 열을 만들면 금액을 넣을 수 있어요'}`);
    });
  });
  el.querySelectorAll('[data-rx]').forEach(b => b.onclick = () => { const i = +b.dataset.rx; const t = T.row[i]; const go = () => { WS.sheets.예산.splice(i + 1, 1); App.changed('예산'); }; if (!t) return go(); App.confirm(`'${rows[i][0]}' 행 빼기`, `<p>예산 <b>${fmt.won(t)}원</b>이 들어 있어요.</p>`, '빼기', go); });
  el.querySelectorAll('[data-rmap]').forEach(s => s.onchange = () => { if (!s.value) return; WS.sheets.예산[+s.dataset.rmap + 1][0] = s.value; App.changed('예산'); });
  // 상단 버튼
  el.querySelector('[data-b="xlsx"]').onclick = () => saveWorkspaceXlsx(WS, M, ['예산'], '예산');
  el.querySelector('[data-b="fill"]').onclick = () => { const add = M.MS.chList.slice(0, 21).filter(c => !present.has(c.name)); add.forEach(c => WS.sheets.예산.push([c.name].concat(cols.map(() => '')))); App.changed('예산'); App.toast(add.length ? `채널 ${add.length}개를 넣었어요` : '기본 채널은 이미 다 있어요'); };
  el.querySelector('[data-b="wipe"]').onclick = () => App.confirm('예산 금액 비우기', '<p>품목 열과 채널 행은 두고 금액만 지워요. 지금 상태는 버전으로 남겨 둘게요.</p>', '비우기', async () => { await App.saveVersion('예산 비우기 전 자동 백업', true); WS.sheets.예산 = [WS.sheets.예산[0]].concat(WS.sheets.예산.slice(1).map(r => [r[0]].concat(cols.map(() => '')))); App.changed('예산'); });
  el.querySelector('[data-b="paste"]').onclick = () => budPasteDialog();
  renderBudgetSide(el);
  if (roTab('예산')) lockForm(el);
  el._refresh = () => { el.querySelectorAll('td.bi').forEach(td => { const inp = td.querySelector('input'); const r = WS.sheets.예산[+inp.dataset.r + 1]; const k = WS.sheets.예산[0][+inp.dataset.c + 1]; const old = td.querySelector('.cc'); if (old) old.remove(); const h = cellCnt(r && r[0], k); if (h) td.insertAdjacentHTML('beforeend', h); }); renderBudgetSide(el); };
}
function renderBudgetSide(el) {
  const side = el.querySelector('#bside'); if (!side) return;
  const B = WS.sheets.예산; const cols = B[0].slice(1); const T = budTotals();
  const mx = Math.max(1, ...T.col);
  const warn = M.issues.filter(i => i.sheet === '예산');
  side.innerHTML = `<div class="card"><div class="hd"><h4>예산 합계</h4></div><div class="bd"><dl class="kv"><dt>전체</dt><dd>${fmt.won(T.all)}원</dd><dt>지상파</dt><dd>${fmt.won(T.gAll)}원 <span class="muted">(${fmt.eok(T.gAll, 2)})</span></dd><dt>케이블</dt><dd>${fmt.won(T.cAll)}원 <span class="muted">(${fmt.eok(T.cAll, 2)})</span></dd></dl>
    <div class="mini" style="margin-top:10px">${cols.map((k, j) => `<div class="r"><span>${esc(k)}</span><span class="b"><span style="width:${T.col[j] / mx * 100}%;background:${itemColor(k)}"></span></span><span class="v">${fmt.dec(T.col[j] / 1e8, 2)}억</span></div>`).join('')}</div></div></div>
    <div class="card"><div class="hd"><h4>확인 필요 ${warn.length ? `<span class="badge warn">${warn.length}</span>` : ''}</h4></div><div class="bd">${warn.length ? `<div class="issues">${warn.slice(0, 60).map(i => `<div class="iss"><span class="sev ${i.sev}"></span><span>${esc(i.msg)}</span></div>`).join('')}</div>` : '<span class="muted small">문제 없어요. 칸 아래 작은 회색 숫자는 이 채널×품목의 이번 달 송출 횟수예요.</span>'}</div></div>`;
}
// 엑셀 표 통째로 붙여넣기
function parseBudgetTable(text) {
  const A = xgParseTsv(text).map(r => r.map(v => String(v == null ? '' : v).trim()));
  const h = A.findIndex(r => r.some(v => resolveItemLoose(M.MS, v)));
  if (h < 0) return null;
  let cc = 0; const W = Math.max(...A.map(r => r.length));
  for (let j = 0; j < W; j++) if (A.slice(h + 1).some(r => resolveCh(M.MS, r[j]))) { cc = j; break; }
  const cols = [];
  A[h].forEach((v, j) => { if (j <= cc || !v || /^(합계|총계|계|total|sum)$/i.test(v)) return; cols.push({ j, key: resolveItemLoose(M.MS, v), raw: v }); });
  const rows = [];
  for (let i = h + 1; i < A.length; i++) {
    const r = A[i]; const raw = r[cc] || '';
    if (!raw || /^(합계|총계|계|total|소계)$/i.test(raw) || /\s?계$/.test(raw) && !resolveCh(M.MS, raw)) continue;
    const vals = cols.map(c => { const v = parseAmount(r[c.j]); return v === null ? '' : v; });
    if (!vals.some(v => v)) continue;
    const ch = resolveCh(M.MS, raw);
    rows.push({ raw, ch: ch ? ch.name : null, vals });
  }
  return { cols, rows };
}
function budPasteDialog() {
  App.modal(`<div class="hd"><h3>예산표 붙여넣기</h3><div class="small muted">엑셀에서 품목 머리글 행과 채널 열이 포함되게 표를 복사해 아래에 붙여넣으세요 (예: 당월 운영의 예산표 AG35:AR84). 지금 예산표를 통째로 바꿔요.</div></div>
    <div class="bd"><textarea class="paste" id="bp" placeholder="여기에 Ctrl+V"></textarea><div id="bpv" class="small" style="margin-top:10px"></div></div>
    <div class="ft"><button class="btn" data-x>취소</button><button class="btn pri" id="bp-ok" disabled>바꾸기</button></div>`, (box, close) => {
    const ta = box.querySelector('#bp'), pv = box.querySelector('#bpv'), ok = box.querySelector('#bp-ok'); let P = null;
    const upd = () => {
      P = parseBudgetTable(ta.value);
      if (!P || !P.rows.length) { ok.disabled = true; pv.innerHTML = ta.value.trim() ? '<span style="color:#8f3d35">품목 머리글(마스터의 품목 이름)이 있는 행을 찾지 못했어요.</span>' : ''; return; }
      const tot = sum(P.rows, r => sum(r.vals, v => v || 0));
      const uc = P.cols.filter(c => !c.key), ur = P.rows.filter(r => !r.ch);
      ok.disabled = false;
      pv.innerHTML = `<b>${P.rows.length}개 채널 × ${P.cols.length}개 품목 · 합계 ${fmt.won(tot)}원 (${fmt.eok(tot, 2)})</b><div class="chips" style="margin-top:6px">${P.cols.map(c => `<span class="chipbtn" style="cursor:default">${c.key ? `<span class="sw" style="background:${itemColor(c.key)}"></span>${esc(c.key)}` : `<span style="color:#8f3d35">${esc(c.raw)} ?</span>`}</span>`).join('')}</div>
        ${uc.length || ur.length ? `<div class="note warn">마스터에 없는 이름: ${uc.map(c => esc(c.raw)).concat(ur.map(r => esc(r.raw))).join(', ')} — 그대로 넣고 빨갛게 표시할게요. 넣은 뒤 칸 옆 목록에서 마스터 이름으로 바꾸세요 (채널은 마스터에 별칭을 추가해도 돼요).</div>` : ''}`;
    };
    ta.addEventListener('input', upd); ta.addEventListener('paste', () => setTimeout(upd, 0));
    setTimeout(() => ta.focus(), 50);
    ok.onclick = async () => {
      if (!P) return; close(true);
      const had = WS.sheets.예산 && WS.sheets.예산.length > 1; if (had) await App.saveVersion('예산 붙여넣기 전 자동 백업', true);
      WS.sheets.예산 = [['채널'].concat(P.cols.map(c => c.key || c.raw))].concat(P.rows.map(r => [r.ch || r.raw].concat(r.vals)));
      App.changed('예산'); App.toast(`예산표를 바꿨어요 · ${P.rows.length}개 채널`);
    };
  });
}

// =====================================================================
// 소재 : 품목별 카드
// =====================================================================
// 위 행 이어받기(품목·기간·초수)를 풀어서 행마다 품목을 명시
function creNormalize() {
  const out = []; let ci = '', cp = '', cs = '';
  for (const r of WS.sheets.소재 || []) {
    if (isBlankRow(r)) continue;
    if (str(r[0])) { ci = str(r[0]); cp = ''; cs = ''; }
    if (str(r[1])) cp = str(r[1]);
    const sec = num(String(r[2] == null ? '' : r[2]).replace(/["”초]/g, '')); if (sec) cs = sec;
    const cre = str(r[3]); if (/계$/.test(cre)) continue;
    out.push([resolveItemLoose(M.MS, ci) || ci, cp, cs, cre, r[4] == null ? '' : r[4], r[5] == null ? '' : r[5], str(r[6]), str(r[7])]);
  }
  if (JSON.stringify(out) !== JSON.stringify(WS.sheets.소재 || [])) { WS.sheets.소재 = out; return true; }
  return false;
}
// GRP 계산용 초수별 예산 비중 (엑셀 '품목별 집행 기간 및 소재' 표의 15초·30초 예산 비중) — 비우면 소재 금액 비중을 초수별로 합산
function creSecShares(rr) {
  const sh = {}; const anyShare = rr.some(r => num(r[4]) != null);
  for (const r of rr) { const sec = num(r[2]); if (!sec || !str(r[3])) continue; sh[sec] = (sh[sec] || 0) + (anyShare ? (num(r[4]) || 0) : num(r[5]) != null ? num(r[5]) : 1); }
  const tot = sum(Object.values(sh), v => v); if (!tot) return {};
  for (const k in sh) sh[k] /= tot; return sh;
}
function secPlanHtml(k, rr) {
  const plan = (WS.secPlan || {})[k] || null, der = creSecShares(rr);
  const secs = [...new Set(Object.keys(der).concat(Object.keys(plan || {})).map(Number))].filter(x => x > 0).sort((a, b) => a - b);
  if (secs.length < 2 && !plan) return '';
  const pl = M.secPlanOf(k), fac = pl ? fmt.dec(pl.factor, 3) : '-';
  return `<div class="secplan" data-sp="${esc(k)}"><b>GRP 계산 초수 비중</b> <span class="muted">(예산)</span>
    ${secs.map(sec => `<label>${sec}초 <span class="in pc"><input data-sps="${sec}" class="r" inputmode="decimal" value="${plan && plan[sec] != null ? esc(pctTxt(plan[sec])) : ''}" placeholder="${der[sec] != null ? esc(pctTxt(der[sec])) : '0'}"><span>%</span></span></label>`).join('')}
    <span class="muted">→ 15초 환산 ×${fac} · ${plan ? '직접 넣은 값' : '비워 두면 소재 금액 비중으로'} · 엑셀 ‘품목별 집행 기간 및 소재’ 표의 예산 비중과 같은 값</span></div>`;
}
function renderCreForm(el) {
  if (creNormalize()) App.changed('소재', true);
  const rows = WS.sheets.소재;
  const keys = [...new Set(rows.map(r => r[0]))];
  const ord = k => { const b = M.budgetItems.indexOf(k); if (b >= 0) return b; const it = M.MS.items.get(k); return it ? 100 + it.order : 999; };
  keys.sort((a, b) => ord(a) - ord(b));
  const missing = M.budgetItems.filter(k => !keys.includes(k));
  const avail = [...M.MS.items.keys()].filter(k => !keys.includes(k));
  const secOpts = cur => optHtml([['', ''], ...[...new Set([15, 20, 30, 60].concat(cur ? [+cur] : []))].sort((a, b) => a - b).map(s => [s, s + '초'])], cur);
  const card = k => {
    const it = M.MS.items.get(k); const idx = rows.map((r, i) => i).filter(i => rows[i][0] === k);
    const cc = M.cells.filter(c => c.item === k); const gN = sum(cc.filter(c => c.media === '지상파'), c => c.cnt), cN = sum(cc.filter(c => c.media === '케이블'), c => c.cnt);
    return `<section class="card crecard" data-item="${esc(k)}" style="--c:${it ? it.color : '#8f3d35'}"><div class="hd"><span class="sw" style="background:${it ? it.color : '#8f3d35'}"></span><h3>${esc(k || '(품목 없음)')}</h3>
      <span class="sub">${it ? (it.full !== it.key ? esc(it.full) + ' · ' : '') : '<b style="color:#8f3d35">마스터에 없는 품목</b> · '}예산 ${fmt.eok(sum(cc, c => c.budget), 2)} · 지상파 ${fmt.int(gN)}회 · 케이블 ${fmt.int(cN)}회</span><div class="spacer"></div>
      ${it ? '' : `<select class="mapsel" data-imap="${esc(k)}"><option value="">마스터 품목으로…</option>${avail.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select>`}
      <button class="btn sm" data-addcre="${esc(k)}">＋ 소재</button><button class="btn sm ghost" data-delitem="${esc(k)}">품목 빼기</button></div>
      <table class="t form cre"><colgroup><col style="width:130px"><col style="width:96px"><col style="width:22%"><col style="width:96px"><col style="width:96px"><col style="width:120px"><col style="width:140px"><col><col style="width:40px"></colgroup><thead><tr><th class="l">운영기간</th><th class="l">초수</th><th class="l">소재명</th><th>금액 비중</th><th>횟수 비중</th><th title="지상파 송출 중 이 소재 비율">지상파 실제</th><th class="l">심의번호</th><th class="l">비고</th><th></th></tr></thead><tbody>
      ${idx.map(i => { const r = rows[i]; return `<tr data-i="${i}">
        <td class="in dp"><input data-f="1" class="datepick" value="${esc(str(r[1]))}" placeholder="달력에서 고르기" autocomplete="off" title="누르면 달력이 열려요 — 시작일, 종료일 차례로 누르세요 (직접 써도 돼요)"></td>
        <td class="in sel"><select data-f="2">${secOpts(r[2])}</select></td>
        <td class="in"><input data-f="3" value="${esc(str(r[3]))}" placeholder="소재명" class="${str(r[3]) ? '' : 'need'}"></td>
        <td class="in pc"><input data-f="4" class="r" inputmode="decimal" value="${esc(pctTxt(r[4]))}"><span>%</span></td>
        <td class="in pc"><input data-f="5" class="r" inputmode="decimal" value="${esc(pctTxt(r[5]))}"><span>%</span></td>
        <td class="act" data-act="${i}"></td>
        <td class="in"><input data-f="6" value="${esc(str(r[6]))}"></td>
        <td class="in wide"><input data-f="7" value="${esc(str(r[7]))}"></td>
        <td><button class="x" data-del="${i}" title="삭제">✕</button></td></tr>`; }).join('')}
      </tbody><tfoot><tr class="sub"><td class="l" colspan="3">합계</td><td data-s4></td><td data-s5></td><td></td><td colspan="3"></td></tr></tfoot></table>${secPlanHtml(k, idx.map(i => rows[i]))}</section>`;
  };
  el.innerHTML = `<div class="viewhead"><div><h2>소재</h2><div class="sub">${ymLabel()} · 품목별 운영 소재와 비중. 비중은 % 숫자로 (50 = 50%). 지상파 실제는 지상파 송출 중 그 소재로 나간 비율이에요.</div></div><div class="spacer"></div>
      <select class="btn sm" id="creadd"><option value="">＋ 품목 추가…</option>${avail.map(k => `<option value="${esc(k)}">${esc(k)}${M.budgetItems.includes(k) ? ' (예산 있음)' : ''}</option>`).join('')}</select><button class="btn sm" data-c="xlsx">⤓ 소재 엑셀</button></div>
    ${missing.length ? `<div class="note warn">예산은 있는데 소재가 없는 품목: ${missing.map(k => `<button class="chipbtn" data-addit="${esc(k)}"><span class="sw" style="background:${itemColor(k)}"></span>${esc(k)} 추가</button>`).join(' ')}</div>` : ''}
    <div class="crecards">${keys.map(card).join('') || '<section class="card"><div class="empty">위의 ＋ 품목 추가로 시작하세요. 예산에 넣은 품목은 노란 안내에서 바로 추가할 수 있어요.</div></section>'}</div>`;
  const sums = () => el.querySelectorAll('.crecard').forEach(sec => {
    const k = sec.dataset.item; const rr = rows.filter(r => r[0] === k && str(r[3]));
    const onePeriod = new Set(rr.map(r => str(r[1]))).size <= 1; // 기간이 다르면(중간 투입 소재) 합계가 100%가 아닐 수 있음
    for (const f of [4, 5]) { const vals = rr.map(r => num(r[f])).filter(v => v != null); const td = sec.querySelector(`[data-s${f}]`); if (!vals.length) { td.textContent = ''; continue; } const s = sum(vals); td.innerHTML = `${fmt.pct(s)}${onePeriod && Math.abs(s - 1) > 0.005 ? ' <span class="badge warn">100% 아님</span>' : ''}`; }
  });
  const actuals = () => {
    const pool = groupBy(M.spots.filter(s => s.src === '지상파' && s.item), s => s.item);
    el.querySelectorAll('td[data-act]').forEach(td => { const r = rows[+td.dataset.act]; const p = pool.get(r[0]) || []; if (!str(r[3]) || !p.length) { td.innerHTML = '<span class="muted">-</span>'; return; } const hit = p.filter(s => creMatch(r[3], s.cre)).length; td.innerHTML = `${fmt.pct(hit / p.length)} <span class="muted">(${hit}회)</span>`; });
  };
  sums(); actuals();
  el._refresh = () => actuals();
  bindEnterDown(el);
  el.querySelectorAll('tr[data-i]').forEach(tr => {
    const i = +tr.dataset.i; const r = rows[i];
    tr.querySelectorAll('[data-f]').forEach(inp => inp.addEventListener('change', () => {
      const f = +inp.dataset.f; let v = inp.value.trim();
      if (f === 4 || f === 5) { const n = parsePct(v); if (n === null) { inp.classList.add('bad'); return App.toast('비중은 숫자로 써 주세요 (50 = 50%)'); } inp.classList.remove('bad'); v = n; inp.value = pctTxt(n); }
      if (f === 2) v = v === '' ? '' : +v;
      r[f] = v; if (f === 3) inp.classList.toggle('need', !v);
      sums(); App.changed('소재', true);
    }));
  });
  // 운영기간: 달력에서 시작일 → 종료일
  el.querySelectorAll('input.datepick').forEach(inp => {
    const open = () => {
      if (roTab('소재')) return;
      const i = +inp.closest('tr').dataset.i; const r = rows[i];
      const P = parsePeriod(inp.value, M.ym);
      openRangeCal(inp, { ym: M.ym, a: P ? P.a : null, b: P ? P.b : null, onPick: (a, b) => {
        const v = a ? periodTxt(a, b) : '';
        inp.value = v; r[1] = v; sums(); App.changed('소재', true);
        // 같은 품목에서 기간이 비어 있는 아래 소재들도 같은 기간으로 (처음 고를 때만)
        if (v) { const k = r[0]; let n = 0; rows.forEach((x, j) => { if (j !== i && x[0] === k && !str(x[1])) { x[1] = v; n++; const o = el.querySelector(`tr[data-i="${j}"] input[data-f="1"]`); if (o) o.value = v; } }); if (n) App.toast(`같은 품목의 빈 운영기간 ${n}칸에도 ${esc(v)}를 넣었어요`); }
      } });
    };
    inp.addEventListener('click', e => { e.stopPropagation(); if (!document.querySelector('.calpop')) open(); });
    inp.addEventListener('keydown', e => { if ((e.altKey && e.key === 'ArrowDown') || e.key === 'F4') { e.preventDefault(); open(); } });
  });
  el.querySelectorAll('.secplan[data-sp]').forEach(box => box.querySelectorAll('input[data-sps]').forEach(inp => inp.addEventListener('change', () => {
    const k = box.dataset.sp; const o = {}; let bad = false;
    box.querySelectorAll('input[data-sps]').forEach(x => { const t = x.value.trim(); if (!t) return; const n = parsePct(t); if (n === null) { bad = true; x.classList.add('bad'); return; } o[x.dataset.sps] = n; });
    if (bad) return App.toast('비중은 숫자로 써 주세요 (27 = 27%)');
    WS.secPlan = WS.secPlan || {}; if (Object.keys(o).length) WS.secPlan[k] = o; else delete WS.secPlan[k];
    App.changed('소재');
  })));
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { rows.splice(+b.dataset.del, 1); App.changed('소재'); });
  const addRow = k => { const last = rows.map((r, i) => i).filter(i => rows[i][0] === k).pop(); const lr = last != null ? rows[last] : null; const nr = [k, lr ? lr[1] : '', lr ? lr[2] : '', '', '', '', '', '']; if (last != null) rows.splice(last + 1, 0, nr); else rows.push(nr);
    App.changed('소재', false, () => { const sec = [...App.paneEl('소재').querySelectorAll('.crecard')].find(s => s.dataset.item === k); const ins = sec ? sec.querySelectorAll('input[data-f="3"]') : []; const x = ins[ins.length - 1]; if (x) { x.focus(); x.scrollIntoView({ block: 'center' }); } }); };
  el.querySelectorAll('[data-addcre]').forEach(b => b.onclick = () => addRow(b.dataset.addcre));
  el.querySelectorAll('[data-addit]').forEach(b => b.onclick = () => addRow(b.dataset.addit));
  el.querySelector('#creadd').onchange = e => { if (e.target.value) addRow(e.target.value); };
  el.querySelectorAll('[data-delitem]').forEach(b => b.onclick = () => { const k = b.dataset.delitem; const n = rows.filter(r => r[0] === k && str(r[3])).length; const go = () => { WS.sheets.소재 = rows.filter(r => r[0] !== k); App.changed('소재'); }; if (!n) return go(); App.confirm(`'${k}' 소재 빼기`, `<p>소재 ${n}개를 지워요.</p>`, '빼기', go); });
  el.querySelectorAll('[data-imap]').forEach(s => s.onchange = () => { if (!s.value) return; rows.forEach(r => { if (r[0] === s.dataset.imap) r[0] = s.value; }); App.changed('소재'); });
  el.querySelector('[data-c="xlsx"]').onclick = () => saveWorkspaceXlsx(WS, M, ['소재'], '소재');
  if (roTab('소재')) lockForm(el);
}

// ---- 매칭 규칙 (방송사 원본 가져오기) ----
function mRules(body, el) {
  const rows = WS.sheets.매칭규칙 = WS.sheets.매칭규칙 || [];
  const MS = M.MS;
  const vals = kind => kind === '품목' ? MS.itemOrder : kind === '채널' ? MS.chList.map(c => c.name) : [];
  body.innerHTML = `<div class="fhd"><div class="muted small">예: 파일명에 ‘KBS조이’ → 채널 KBS Joy · 파일명에 ‘비렉스’ → 품목 안마매트리스 · 시트명에 ‘일자별’ → 제외(같은 내용 중복 시트)</div><div class="spacer"></div><button class="btn sm" data-ob>방송사 큐시트 온보딩 열기</button><button class="btn sm pri" data-add>＋ 규칙 추가</button></div>
    <datalist id="dl-rch">${MS.chList.map(c => `<option value="${esc(c.name)}">`).join('')}</datalist><datalist id="dl-rit">${MS.itemOrder.map(k => `<option value="${esc(k)}">`).join('')}</datalist>
    <div class="tw free fit"><table class="t form"><thead><tr><th></th><th class="l">종류</th><th class="l">파일명에 포함</th><th class="l">시트명에 포함</th><th class="l">→ 채널 / 품목</th><th></th></tr></thead><tbody>
    ${rows.length ? rows.map((r, i) => { const k = str(r[0]) || '채널'; const bad = k !== '제외' && str(r[3]) && !(k === '품목' ? resolveItem(MS, r[3]) : resolveCh(MS, r[3]));
      return `<tr data-i="${i}"><td class="dh" title="끌어서 순서 바꾸기 (위에 있는 규칙이 먼저)">⋮⋮</td><td class="in"><select data-f="0">${optHtml(OB_KINDS, k)}</select></td><td class="in"><input data-f="1" value="${esc(str(r[1]))}" placeholder="(상관없음)"></td><td class="in"><input data-f="2" value="${esc(str(r[2]))}" placeholder="(상관없음)"></td><td class="in"><input data-f="3" value="${esc(str(r[3]))}" list="${k === '품목' ? 'dl-rit' : 'dl-rch'}" ${k === '제외' ? 'disabled placeholder="(이 시트는 빼기)"' : ''} class="${bad ? 'need' : ''}" title="${bad ? '마스터에 없는 이름이에요' : ''}"></td><td><button class="x" data-del title="삭제">✕</button></td></tr>`; }).join('')
    : '<tr><td colspan="6" class="empty">아직 규칙이 없어요. 방송사 큐시트 온보딩 창에서 직접 고른 매칭이 여기에 쌓여요.</td></tr>'}
    </tbody></table></div>
    <details class="qmrules"><summary>기본으로 들어 있는 규칙 (Q-Mate) — 채널 ${QM_CH_RULES.length}개 · 품목 ${QM_ITEM_RULES.length}개</summary>
      <div class="small muted" style="margin:6px 0">판정은 Q-Mate와 똑같아요. 채널: 직접 만든 규칙 → 기본 규칙 순으로 ① 파일명(+시트명 조건) ② 시트명 키워드를 시트명·파일명 어디서든 ③ 파일명 키워드를 시트명에서. 품목: 기본 규칙 → 직접 만든 규칙 순으로 파일명 키워드. 찾은 이름은 마스터 약칭(채널은 이름·별칭)으로 맞춰요.</div>
      <table class="t sm"><thead><tr><th class="l">파일명에 포함</th><th class="l">시트명에 포함</th><th class="l">채널</th></tr></thead><tbody>${QM_CH_RULES.map(([f, sh, pp, ch]) => `<tr><td class="l"><code>${esc(f)}</code></td><td class="l">${esc(sh)}</td><td class="l">${ch ? esc(ch) : pp ? `<span class="muted">${esc(pp)} (시트에서 찾기)</span>` : '<span class="muted">빼기</span>'}</td></tr>`).join('')}</tbody></table>
      <table class="t sm" style="margin-top:8px"><thead><tr><th class="l">파일명 키워드</th><th class="l">품목</th></tr></thead><tbody>${QM_ITEM_RULES.map(([k, v]) => `<tr><td class="l"><code>${esc(k)}</code></td><td class="l">${esc(resolveItemLoose(MS, v) || v)}</td></tr>`).join('')}</tbody></table></details>`;
  body.querySelector('[data-ob]').onclick = () => OBUI.open();
  body.querySelector('[data-add]').onclick = () => { rows.push(['채널', '', '', '']); App.changed('master', true); renderMasterForm(el); mstFocusLast(el, 1); };
  dragRows(body.querySelector('tbody'), order => { reorderBy(rows, order); App.changed('master', true); renderMasterForm(el); });
  body.querySelectorAll('tr[data-i]').forEach(tr => {
    const i = +tr.dataset.i, r = rows[i];
    tr.querySelector('[data-del]').onclick = () => { rows.splice(i, 1); App.changed('master'); };
    tr.querySelectorAll('[data-f]').forEach(inp => inp.addEventListener('change', () => {
      const f = +inp.dataset.f; let v = inp.value.trim();
      if (f === 3 && v) { const k = str(r[0]); const x = k === '품목' ? resolveItemLoose(MS, v) : resolveCh(MS, v); if (x) v = typeof x === 'string' ? x : x.name; }
      r[f] = v; App.changed('master', true); if (f === 0 || f === 3) renderMasterForm(el);
    }));
  });
}
