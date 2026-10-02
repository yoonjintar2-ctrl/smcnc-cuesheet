// ===== 14-onboard-ui.js : '방송사 큐시트 온보딩' 창 — 방송사 원본 엑셀 → 자동 매칭 → 확인 → 시트에 넣기 =====
// 흐름: ① 파일 올리기(머리글·열 자동 감지) ② 못 맞춘 것만 확인 — 마스터에서 고르기 → 없으면 마스터에 추가 ③ 미리보기 후 넣기
const OBUI = {
  bg: null,
  open(files) {
    if (this.bg) { if (files && files.length) this.add(files); return; }
    OB.reset();
    const bg = document.createElement('div'); bg.className = 'modal-bg obbg';
    bg.innerHTML = '<div class="modal obm" role="dialog" aria-label="방송사 큐시트 온보딩"></div>';
    document.body.appendChild(bg); this.bg = bg; this.box = bg.querySelector('.obm');
    bg.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.target.closest('input,select')) { e.stopPropagation(); this.close(); } });
    // 창 위에 끌어다 놓기
    bg.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); const z = bg.querySelector('.obdrop'); if (z) z.classList.add('on'); });
    bg.addEventListener('dragleave', e => { if (e.target === bg) { const z = bg.querySelector('.obdrop'); if (z) z.classList.remove('on'); } });
    bg.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); const z = bg.querySelector('.obdrop'); if (z) z.classList.remove('on'); this.add(e.dataTransfer.files); });
    this.render();
    if (files && files.length) this.add(files);
  },
  close() { if (!this.bg) return; this.bg.remove(); this.bg = null; OB.reset(); },
  async add(list) {
    const arr = [...(list || [])];
    if (!arr.length) return;
    this.busy = `파일 ${arr.length}개를 읽는 중…`; this.render();
    await new Promise(r => setTimeout(r, 20));
    const n = await OB.addFiles(arr);
    this.busy = null;
    if (!n) App.toast('엑셀(.xlsx/.xls/.csv) 파일만 올릴 수 있어요');
    this.render();
  },
  // 사용자가 고른 것 반영 → 다시 계산 → 다시 그림
  refresh(redetect) { if (redetect) OB.detect(); else OB.build(); this.render(); },

  render() {
    if (!this.bg) return;
    const body = this.box.querySelector('.obb'); const st = body ? body.scrollTop : 0;
    const MS = buildMaster(WS);
    const files = OB.files, out = OB.out || { rows: [], byFile: new Map(), cm: new Map() };
    const td = OB.todo();
    const need = td.ch.length + td.item.length;
    const okRows = out.rows.filter(o => o.ch);
    const step = !files.length ? 1 : need ? 2 : 3;
    this.box.innerHTML = `
    <div class="obh"><div><h2>방송사 큐시트 온보딩</h2><div class="sub">방송사에서 받은 원본 엑셀을 끌어다 놓으면 머리글·열을 자동으로 읽고, 채널·품목·CM위치를 마스터와 맞춰서 지상파/케이블 시트에 넣어요.</div></div><button class="btn ghost obx" title="닫기 (Esc)">✕</button></div>
    <div class="obsteps">${[['파일 올리기', files.length ? `${files.length}개` : ''], ['매칭 확인', need ? `${need}건 남음` : (files.length ? '완료' : '')], ['시트에 넣기', okRows.length ? `${fmt.int(okRows.length)}회` : '']].map(([t, s], i) => `<div class="obst ${step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}"><i>${step > i + 1 ? '✓' : i + 1}</i><span>${t}</span>${s ? `<small>${s}</small>` : ''}</div>`).join('<span class="obsep"></span>')}</div>
    <div class="obb">
      <div class="obdrop${files.length ? ' sm' : ''}" tabindex="0"><div class="ic">📊</div><div><div class="t">${files.length ? '파일 더 추가하기' : '여기에 엑셀 파일을 끌어다 놓으세요'}</div><div class="s">.xlsx · .xls · .csv — 여러 파일, 여러 시트 모두 · 머리글 행 자동 감지 · 숨김 시트는 읽지 않음</div></div><button class="btn pri obpick">파일 선택</button><input type="file" class="obfile" accept=".xlsx,.xlsm,.xls,.csv" multiple hidden></div>
      ${this.busy ? `<div class="obbusy">${esc(this.busy)}</div>` : ''}
      ${td.ch.length || td.item.length || td.cm.length ? this.todoHtml(MS, td, out) : ''}
      ${files.length ? this.filesHtml(MS, out) : ''}
      ${okRows.length && !need ? this.previewHtml(MS, okRows) : ''}
    </div>
    <div class="obf"><div class="msg">${!files.length ? '파일을 올리면 자동으로 매칭해요' : need ? `<b class="w">확인이 필요한 ${need}건</b>을 고르면 넣을 수 있어요` : `<b>${fmt.int(okRows.length)}회</b> 넣을 준비가 됐어요 · 넣기 전 상태는 변경 이력에 버전으로 남아요`}</div>
      <button class="btn" data-ob="close">취소</button><button class="btn pri" data-ob="go" ${!okRows.length || need ? 'disabled' : ''}>${okRows.length ? `${fmt.int(okRows.length)}회 시트에 넣기` : '시트에 넣기'}</button></div>`;
    const nb = this.box.querySelector('.obb'); nb.scrollTop = st;
    this.bind();
  },

  filesHtml(MS, out) {
    const chOpts = sel => `<option value="">채널 고르기…</option>${['지상파', '케이블'].map(m => `<optgroup label="${m}">${MS.chList.filter(c => c.media === m).map(c => `<option value="${esc(c.name)}" ${c.name === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`).join('')}<option value="__skip" ${sel === '__skip' ? 'selected' : ''}>— 이 시트 빼기 —</option>`;
    const itOpts = sel => `<option value="">품목 고르기…</option>${MS.itemOrder.map(k => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(k)}</option>`).join('')}<option value="__none" ${sel === '__none' ? 'selected' : ''}>— 품목 없이 —</option>`;
    let h = `<section class="obsec"><div class="obsh"><h3>올린 파일</h3><span class="muted">자동으로 맞춘 채널·품목을 바꾸려면 옆 목록에서 고르세요</span></div><div class="tw"><table class="t obtab"><thead><tr><th class="l">파일</th><th class="l">시트</th><th class="l">채널</th><th class="l">품목</th><th>송출</th><th>단가 합</th><th>기간</th><th></th></tr></thead><tbody>`;
    for (const F of OB.files) {
      const fst = out.byFile.get(F.id) || { n: 0, price: 0, d1: 99, d2: 0, sheets: new Map(), ym: {} };
      if (F.status !== 'ok') { h += `<tr class="bad"><td class="l fn" title="${esc(F.name)}">📄 ${esc(F.name)}</td><td class="l" colspan="6">${F.status === 'locked' ? '🔒 암호가 걸린 파일이라 열 수 없어요' : F.status === 'loading' ? '읽는 중…' : '읽지 못했어요: ' + esc(F.err || '')}</td><td><button class="x" data-rm="${F.id}" title="빼기">✕</button></td></tr>`; continue; }
      const sheets = F.sheets.length ? F.sheets : [{ name: '(빈 파일)', auto: {}, sh: { dataRows: [] } }];
      const itemSel = F.itemSel !== undefined ? (F.itemSel || '__none') : (F.item && F.item.item) || '';
      const terrOnly = F.sheets.length && F.sheets.every(S => { const r = OB.chOf(S); const c = r.ch && MS.chByName.get(r.ch); return r.skip || (c && c.media === '지상파'); });
      const itemCell = terrOnly ? '<span class="muted small" title="Q-Mate와 같이 지상파 3사 원본은 품목을 미지정으로 넣어요">지상파 · 품목 미지정</span>'
        : `<div class="obsel ${itemSel ? (F.itemSel !== undefined ? 'man' : 'auto') : 'need'}"><select data-fi="${F.id}">${itOpts(itemSel)}</select>${F.itemSel === undefined && F.item && F.item.label ? `<small title="${esc(F.item.label)}">${esc(F.item.label)}</small>` : ''}</div>`;
      const mo = Object.keys(fst.ym).map(Number);
      const off = mo.filter(m => m !== M.ym.m);
      sheets.forEach((S, si) => {
        const r = S.sel !== undefined ? (S.sel === '__skip' ? { skip: true } : { ch: S.sel }) : S.auto;
        const cur = S.sel !== undefined ? S.sel : (r.skip ? '__skip' : r.ch || '');
        const n = fst.sheets.get(S.name) || 0;
        const c = r.ch && MS.chByName.get(r.ch);
        h += `<tr class="${si ? 'osr' : 'ofr'}${r.skip ? ' skip' : ''}">
          ${si ? '<td class="l"></td>' : `<td class="l fn" rowspan="1" title="${esc(F.name)}">📄 ${esc(F.name)}${F.entry.hiddenSheets && F.entry.hiddenSheets.length ? `<small class="hid" title="${esc(F.entry.hiddenSheets.join(', '))}">숨김 시트 ${F.entry.hiddenSheets.length}개 제외</small>` : ''}</td>`}
          <td class="l sn">${esc(S.name)}</td>
          <td class="l"><div class="obsel ${r.skip ? 'skip' : r.ch ? (S.sel !== undefined ? 'man' : 'auto') : 'need'}"><select data-ch="${F.id}" data-sh="${esc(S.name)}">${chOpts(cur)}</select>${S.sel === undefined && (r.label || (c && c.media)) ? `<small title="${esc(r.label || '')}">${c ? `<span class="md ${c.media === '지상파' ? 'g' : 'c'}">${c.media}</span>` : ''}${esc(r.label || '')}</small>` : ''}</div></td>
          <td class="l">${si ? '' : itemCell}</td>
          <td class="tnum">${r.skip ? '<span class="muted">뺌</span>' : fmt.int(n)}</td>
          <td class="tnum">${si || r.skip ? '' : fmt.won(fst.price)}</td>
          <td class="tnum">${si || !fst.d2 ? '' : `${mo.length > 1 ? '' : (mo[0] || '') + '/'}${fst.d1}~${fst.d2}${off.length ? ` <span class="warn" title="지금 작업 월(${M.ym.m}월)이 아닌 날짜가 있어요">⚠ ${off.join('·')}월</span>` : ''}`}</td>
          <td>${si ? '' : `<button class="x" data-rm="${F.id}" title="이 파일 빼기">✕</button>`}</td></tr>`;
      });
    }
    return h + '</tbody></table></div></section>';
  },

  todoHtml(MS, td, out) {
    const chNames = MS.chList.map(c => c.name), itNames = MS.itemOrder.slice();
    let h = `<section class="obsec"><div class="obsh"><h3>확인이 필요해요</h3><span class="muted">마스터에서 맞는 이름을 고르고, 없으면 마스터에 새로 추가하세요. 고른 것은 다음부터 자동으로 맞춰요.</span></div>`;
    // 채널
    for (const { F, S, n } of td.ch) {
      const r = S.auto || {};
      const sample = [...new Set(out.rows.filter(o => o.file === F.name && o.sheet === S.name).map(o => o.prog))].slice(0, 3);
      const hint = [S.name, r.guess, F.name].filter(Boolean).join(' ');
      const sug = [...new Set([].concat(r.guess && resolveCh(MS, r.guess) ? [resolveCh(MS, r.guess).name] : [], r.pp ? MS.chList.filter(c => norm(c.mpp) === norm(r.pp)).map(c => c.name) : [], obSuggest(S.name, chNames), obSuggest(F.name.replace(/\.[^.]+$/, ''), chNames)))].slice(0, 5);
      const kwF = S.kwFile != null ? S.kwFile : obKeyword(F.name, itNames.concat([...MS.itemAlias.keys()], [...MS.itemHint.keys()]));
      const kwS = S.kwSheet != null ? S.kwSheet : (/^(sheet\d*|큐시트|통합|운행표|raw|q-?sheet)$/i.test(S.name.trim()) ? '' : S.name);
      const key = `${F.id}|${S.name}`;
      h += `<div class="obcard" data-card="ch" data-key="${esc(key)}"><div class="oc-h"><span class="tag w">채널</span><b>${esc(S.name)}</b><span class="muted">· ${esc(F.name)} · ${fmt.int(n)}회</span></div>
        <div class="oc-b">${sample.length ? `<div class="smp">프로그램 예: ${sample.map(esc).join(' · ')}</div>` : ''}${r.guess ? `<div class="smp">기본 규칙으로는 ‘${esc(r.guess)}’인데 마스터에 없어요</div>` : r.pp ? `<div class="smp">${esc(r.pp)} 파일이에요. 어느 채널인지 골라 주세요</div>` : ''}
          <div class="oc-row"><span class="lb">① 마스터에서 고르기</span>${sug.length ? sug.map(x => `<button class="chip" data-pick-ch="${esc(x)}">${esc(x)}</button>`).join('') : ''}<select data-pick-ch-sel><option value="">전체 목록…</option>${['지상파', '케이블'].map(m => `<optgroup label="${m}">${MS.chList.filter(c => c.media === m).map(c => `<option>${esc(c.name)}</option>`).join('')}</optgroup>`).join('')}</select></div>
          <div class="oc-row"><span class="lb">② 없으면 마스터에 추가</span><input data-nc="name" value="${esc(r.guess || S.name)}" placeholder="채널명" style="width:130px"><select data-nc="media"><option>케이블</option><option>지상파</option></select><input data-nc="mpp" list="ob-mpp" placeholder="MPP (예: CJ ENM)" value="${esc(r.pp && r.pp !== '?' ? r.pp : '')}" style="width:130px"><select data-nc="group">${SUM_GROUPS.map(g => `<option ${g === '기타' ? 'selected' : ''}>${g}</option>`).join('')}</select><button class="btn sm" data-add-ch>＋ 새 채널 추가</button></div>
          <div class="oc-row rem"><label><input type="checkbox" data-rem ${S.remember !== false ? 'checked' : ''}> 다음부터 자동으로:</label> 파일명에 <input data-kwf value="${esc(kwF)}" style="width:120px"> ${'시트명에'} <input data-kws value="${esc(kwS)}" style="width:110px" placeholder="(상관없음)"> 이(가) 있으면 이 채널 <button class="lnk" data-skip>이 시트는 빼기</button></div>
        </div></div>`;
    }
    // 품목
    const cats = [...new Set((WS.sheets.품목 || []).map(r => str(r[2])).filter(Boolean))];
    for (const { F } of td.item) {
      const st = out.byFile.get(F.id) || { n: 0 };
      const sh0 = F.entry.sheets[0];
      const title = sh0 ? (sh0.raw || []).slice(0, Math.min(6, (sh0.colInfo && sh0.colInfo.hIdx) || 6)).map(r => r.filter(Boolean).join(' ')).filter(Boolean).slice(0, 2).join(' / ') : '';
      const sug = [...new Set([].concat(F.item && F.item.cands || [], obSuggest(F.name.replace(/\.[^.]+$/, ''), itNames), obSuggest(title, itNames)))].slice(0, 5);
      const kw = F.kw != null ? F.kw : obKeyword(F.name, MS.chList.map(c => c.name).concat([...MS.channels.keys()]), OB.files.filter(x => x !== F).map(x => x.name));
      h += `<div class="obcard" data-card="item" data-fid="${F.id}"><div class="oc-h"><span class="tag w">품목</span><b>${esc(F.name)}</b><span class="muted">· ${fmt.int(st.n)}회</span></div>
        <div class="oc-b">${title ? `<div class="smp">파일 안 제목: ${esc(title.slice(0, 120))}</div>` : ''}${F.item && F.item.label ? `<div class="smp">${esc(F.item.label)}</div>` : ''}
          <div class="oc-row"><span class="lb">① 마스터에서 고르기</span>${sug.map(x => `<button class="chip" data-pick-it="${esc(x)}"><span class="sw" style="background:${itemColor(x)}"></span>${esc(x)}</button>`).join('')}<select data-pick-it-sel><option value="">전체 목록…</option>${itNames.map(k => `<option>${esc(k)}</option>`).join('')}</select><button class="lnk" data-pick-it="__none">품목 없이 넣기</button></div>
          <div class="oc-row"><span class="lb">② 없으면 마스터에 추가</span><input data-ni="key" placeholder="약칭 (큐시트 표기)" style="width:130px" value="${esc(kw)}"><input data-ni="full" placeholder="정식명" style="width:130px"><input data-ni="cat" list="ob-cat" placeholder="카테고리" style="width:100px"><button class="btn sm" data-add-it>＋ 새 품목 추가</button></div>
          <div class="oc-row rem"><label><input type="checkbox" data-rem ${F.remember !== false ? 'checked' : ''}> 다음부터 자동으로:</label> 파일명에 <input data-kw value="${esc(kw)}" style="width:140px"> 이(가) 있으면 이 품목</div>
        </div></div>`;
    }
    // CM위치
    if (td.cm.length) {
      h += `<div class="obcard" data-card="cm"><div class="oc-h"><span class="tag">CM위치</span><b>마스터에 없는 CM위치 ${td.cm.length}개</b><span class="muted">· 추정한 구분으로 넣어도 돼요. 넣을 때 마스터 CM위치에 함께 추가해요</span></div><div class="oc-b"><table class="t sm"><tbody>
        ${td.cm.map(x => { const g = cmClassOf(MS, x.raw, x.media).cls; const v = OB.cm[x.raw] || g; return `<tr><td class="l"><b>${esc(x.raw)}</b></td><td class="tnum">${fmt.int(x.n)}회</td><td class="l muted small">${[...x.files].slice(0, 2).map(esc).join(', ')}${x.files.size > 2 ? ` 외 ${x.files.size - 2}` : ''}</td><td>${CM_CLASSES.map(c => `<label class="rd"><input type="radio" name="cm-${esc(x.raw)}" data-cm="${esc(x.raw)}" value="${c}" ${v === c ? 'checked' : ''}> ${c}</label>`).join('')}</td></tr>`; }).join('')}</tbody></table></div></div>`;
    }
    const mpps = [...new Set(MS.chList.map(c => c.mpp))];
    return h + `<datalist id="ob-mpp">${mpps.map(m => `<option value="${esc(m)}">`).join('')}</datalist><datalist id="ob-cat">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></section>`;
  },

  previewHtml(MS, rows) {
    const g = new Map();
    for (const o of rows) {
      const tgt = o.media === '지상파' ? '지상파' : '케이블';
      const k = tgt + '|' + o.ch + '|' + o.item;
      const x = g.get(k) || { tgt, ch: o.ch, item: o.item, n: 0, price: 0, amt: 0, paid: 0, d1: 99, d2: 0, files: new Set() };
      x.n++; x.price += +o.price || 0; if (tgt === '지상파' && +o.amount > 0) { x.paid++; x.amt += +o.amount; }
      if (o.dd) { x.d1 = Math.min(x.d1, o.dd); x.d2 = Math.max(x.d2, o.dd); }
      x.files.add(o.file); g.set(k, x);
    }
    const ex = (tgt, ch, item) => { const sh = WS.sheets[tgt] || []; const ci = colIndex(tgt, 'ch'), ii = colIndex(tgt, 'item'); return sh.filter(r => { const c = resolveCh(MS, r[ci]); const it = resolveItem(MS, r[ii]) || str(r[ii]); return c && c.name === ch && (it || '') === (item || ''); }).length; };
    const list = [...g.values()].sort((a, b) => (a.tgt === b.tgt ? 0 : a.tgt === '지상파' ? -1 : 1) || (MS.chByName.get(a.ch) || {}).order - (MS.chByName.get(b.ch) || {}).order || (MS.itemOrder.indexOf(a.item) - MS.itemOrder.indexOf(b.item)));
    let exTot = 0; list.forEach(x => { x.ex = ex(x.tgt, x.ch, x.item); exTot += x.ex; });
    const hasG = list.some(x => x.tgt === '지상파');
    return `<section class="obsec"><div class="obsh"><h3>넣을 내용</h3><span class="muted">채널 · 품목별로 묶어 보여줘요</span></div>
      <div class="tw"><table class="t obtab"><thead><tr><th class="l">시트</th><th class="l">채널</th><th class="l">품목</th><th>송출</th><th>단가 합</th>${hasG ? '<th>유상(금액)</th>' : ''}<th>기간</th><th>지금 시트의 같은 채널·품목</th></tr></thead><tbody>
      ${list.map(x => `<tr><td class="l"><span class="md ${x.tgt === '지상파' ? 'g' : 'c'}">${x.tgt}</span></td><td class="l"><b>${esc(x.ch)}</b></td><td class="l">${x.item ? `<span class="sw" style="background:${itemColor(x.item)};margin-right:6px"></span>${esc(x.item)}` : '<span class="muted">품목 없음</span>'}</td><td class="tnum">${fmt.int(x.n)}</td><td class="tnum">${fmt.won(x.price)}</td>${hasG ? `<td class="tnum">${x.tgt === '지상파' ? `${fmt.int(x.paid)}회 · ${fmt.won(x.amt)}` : ''}</td>` : ''}<td class="tnum">${x.d2 ? `${x.d1}~${x.d2}일` : ''}</td><td class="tnum">${x.ex ? `<span class="warn">${fmt.int(x.ex)}행</span>` : '<span class="muted">없음</span>'}</td></tr>`).join('')}
      </tbody></table></div>
      ${hasG ? '<div class="note">지상파는 원본의 방송금액(실집행금액)이 0이거나 비어 있으면 보너스로 들어가요. 금액 열이 없는 양식이면 지상파 시트에서 유상 금액을 확인해 주세요.</div>' : ''}
      <div class="obmode"><label class="opt"><input type="radio" name="obmode" value="replace" ${OB.mode === 'replace' ? 'checked' : ''}><span><b>같은 채널·품목의 기존 행은 지우고 새로 넣기</b><small>수정본을 다시 받았을 때 · 지금 시트에서 ${fmt.int(exTot)}행이 바뀌어요</small></span></label>
        <label class="opt"><input type="radio" name="obmode" value="append" ${OB.mode === 'append' ? 'checked' : ''}><span><b>기존 행은 그대로 두고 뒤에 이어 붙이기</b><small>추가 편성분만 받았을 때</small></span></label></div></section>`;
  },

  bind() {
    const B = this.box;
    B.querySelector('.obx').onclick = () => this.close();
    B.querySelector('[data-ob="close"]').onclick = () => this.close();
    const fin = B.querySelector('.obfile');
    B.querySelector('.obpick').onclick = e => { e.stopPropagation(); fin.click(); };
    B.querySelector('.obdrop').onclick = e => { if (!e.target.closest('button')) fin.click(); };
    fin.onchange = () => { const f = [...fin.files]; fin.value = ''; this.add(f); };
    B.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { OB.remove(+b.dataset.rm); this.refresh(); });
    const fileOf = id => OB.files.find(F => F.id === +id);
    const sheetOf = (fid, sn) => { const F = fileOf(fid); return F && F.sheets.find(S => S.name === sn); };
    B.querySelectorAll('select[data-ch]').forEach(s => s.onchange = () => { const S = sheetOf(s.dataset.ch, s.dataset.sh); if (!S) return; S.sel = s.value || undefined; S.manual = !!s.value; this.refresh(); });
    B.querySelectorAll('select[data-fi]').forEach(s => s.onchange = () => { const F = fileOf(s.dataset.fi); if (!F) return; F.itemSel = s.value === '__none' ? '' : (s.value || undefined); F.manual = !!s.value; this.refresh(); });
    // 확인 카드 — 채널
    B.querySelectorAll('[data-card="ch"]').forEach(card => {
      const [fid, ...rest] = card.dataset.key.split('|'); const S = sheetOf(fid, rest.join('|')); if (!S) return;
      const keep = () => { S.kwFile = card.querySelector('[data-kwf]').value.trim(); S.kwSheet = card.querySelector('[data-kws]').value.trim(); S.remember = card.querySelector('[data-rem]').checked; };
      // 고른 채널 이름·별칭이 파일명에 있으면 그 글자를 키워드로 (직접 고친 키워드는 그대로)
      const kwFor = v => { if (S.kwDirty || v === '__skip') return; const MS = buildMaster(WS); const c = MS.chByName.get(v); if (!c) return; const names = [c.name].concat([...MS.channels].filter(([, x]) => x === c).map(([n]) => n)); const k = obKwFromName(F.name, names); if (k) S.kwFile = k; };
      const F = fileOf(fid);
      const pick = v => { keep(); kwFor(v); S.sel = v; S.manual = true; this.refresh(); };
      card.querySelectorAll('[data-kwf],[data-kws]').forEach(i => i.addEventListener('input', () => { S.kwDirty = true; }));
      card.querySelectorAll('[data-pick-ch]').forEach(b => b.onclick = () => pick(b.dataset.pickCh));
      card.querySelector('[data-pick-ch-sel]').onchange = e => { if (e.target.value) pick(e.target.value); };
      card.querySelector('[data-skip]').onclick = () => pick('__skip');
      card.querySelectorAll('[data-kwf],[data-kws],[data-rem]').forEach(i => i.onchange = keep);
      card.querySelector('[data-add-ch]').onclick = () => {
        const v = k => card.querySelector(`[data-nc="${k}"]`).value.trim();
        const name = v('name'); if (!name) return App.toast('채널명을 적어 주세요');
        const MS = buildMaster(WS); const ex = resolveCh(MS, name);
        if (ex) { App.toast(`‘${esc(ex.name)}’은(는) 이미 마스터에 있어요. 그 채널로 맞췄어요`); return pick(ex.name); }
        const media = v('media'), mpp = v('mpp') || name;
        WS.sheets.채널.push([name, '', media, mpp, media === '지상파' ? name : (card.querySelector('[data-nc="group"]').value || '기타')]);
        App.changed('master', true);
        App.toast(`마스터에 새 채널 ‘${esc(name)}’(${media} · ${esc(mpp)})을 추가했어요. 목표 CPRP가 필요하면 마스터에서 넣어 주세요`, 6000);
        keep(); kwFor(name); S.sel = name; S.manual = true; this.refresh(true);
      };
    });
    // 확인 카드 — 품목
    B.querySelectorAll('[data-card="item"]').forEach(card => {
      const F = fileOf(card.dataset.fid); if (!F) return;
      const keep = () => { F.kw = card.querySelector('[data-kw]').value.trim(); F.remember = card.querySelector('[data-rem]').checked; };
      const kwFor = v => { if (F.kwDirty || v === '__none') return; const MS = buildMaster(WS); const names = [v].concat([...MS.itemAlias, ...MS.itemHint].filter(([, x]) => x === v).map(([n]) => n)); const k = obKwFromName(F.name, names); if (k) F.kw = k; };
      const pick = v => { keep(); kwFor(v); F.itemSel = v === '__none' ? '' : v; F.manual = v !== '__none'; this.refresh(); };
      card.querySelector('[data-kw]').addEventListener('input', () => { F.kwDirty = true; });
      card.querySelectorAll('[data-pick-it]').forEach(b => b.onclick = () => pick(b.dataset.pickIt));
      card.querySelector('[data-pick-it-sel]').onchange = e => { if (e.target.value) pick(e.target.value); };
      card.querySelectorAll('[data-kw],[data-rem]').forEach(i => i.onchange = keep);
      card.querySelector('[data-add-it]').onclick = () => {
        const v = k => card.querySelector(`[data-ni="${k}"]`).value.trim();
        const key = v('key'); if (!key) return App.toast('품목 약칭을 적어 주세요');
        const MS = buildMaster(WS); const ex = resolveItem(MS, key) || resolveItemLoose(MS, v('full'));
        if (ex) { App.toast(`‘${esc(ex)}’은(는) 이미 마스터에 있어요. 그 품목으로 맞췄어요`); return pick(ex); }
        WS.sheets.품목.push([key, v('full') || key, v('cat') || '기타', nextColor(), '']);
        App.changed('master', true);
        App.toast(`마스터에 새 품목 ‘${esc(key)}’을 추가했어요. 색상·정식명·비고는 마스터에서 바꿀 수 있어요`, 6000);
        keep(); kwFor(key); F.itemSel = key; F.manual = true; this.refresh(true);
      };
    });
    B.querySelectorAll('input[data-cm]').forEach(i => i.onchange = () => { OB.cm[i.dataset.cm] = i.value; });
    B.querySelectorAll('input[name="obmode"]').forEach(i => i.onchange = () => { OB.mode = i.value; });
    const go = B.querySelector('[data-ob="go"]'); if (go) go.onclick = () => this.commit();
  },

  // 시트에 넣기
  async commit() {
    const out = OB.build(); const MS = buildMaster(WS);
    const rows = out.rows.filter(o => o.ch);
    if (!rows.length) return;
    const R = obToSheetRows(rows);
    const before = deepClone(WS);
    await App.saveVersion('큐시트 온보딩 전 자동 백업', true);
    let removed = 0;
    const combos = new Set(rows.map(o => (o.media === '지상파' ? '지상파' : '케이블') + '|' + o.ch + '|' + (o.item || '')));
    for (const tgt of ['지상파', '케이블']) {
      if (!R[tgt].length) continue;
      const hid = new Set(WS.hidden[tgt] || []);
      let keep = (WS.sheets[tgt] || []).map((r, i) => ({ r, i })).filter(x => !isBlankRow(x.r));
      if (OB.mode === 'replace') {
        const ci = colIndex(tgt, 'ch'), ii = colIndex(tgt, 'item');
        const n0 = keep.length;
        keep = keep.filter(({ r }) => { const c = resolveCh(MS, r[ci]); const it = resolveItem(MS, r[ii]) || str(r[ii]); return !(c && combos.has(tgt + '|' + c.name + '|' + (it || ''))); });
        removed += n0 - keep.length;
      }
      WS.sheets[tgt] = keep.map(x => x.r).concat(R[tgt]);
      WS.hidden[tgt] = keep.map((x, j) => (hid.has(x.i) ? j : -1)).filter(j => j >= 0);   // 숨겨 둔 행은 그대로 숨김
    }
    // 마스터: 새 CM위치 · 매칭 규칙
    const cmk = new Set(WS.sheets.CM위치.map(r => norm(r[0])));
    for (const [raw, x] of out.cm) if (!cmk.has(norm(raw))) { WS.sheets.CM위치.push([raw, OB.cm[raw] || cmClassOf(MS, raw, x.media).cls]); cmk.add(norm(raw)); }
    const rules = WS.sheets.매칭규칙 = WS.sheets.매칭규칙 || [];
    const has = (k, f, s, v) => rules.some(r => str(r[0]) === k && kwn(r[1]) === kwn(f) && kwn(r[2]) === kwn(s));
    let nr = 0;
    for (const F of OB.files) {
      for (const S of F.sheets) if (S.manual && S.remember !== false && S.sel && (S.kwFile || S.kwSheet)) {
        const kind = S.sel === '__skip' ? '제외' : '채널';
        if (!has(kind, S.kwFile || '', S.kwSheet || '')) { rules.unshift([kind, S.kwFile || '', S.kwSheet || '', kind === '제외' ? '' : S.sel]); nr++; }
      }
      if (F.manual && F.remember !== false && F.itemSel && F.kw && !has('품목', F.kw, '')) { rules.unshift(['품목', F.kw, '', F.itemSel]); nr++; }
    }
    const Mb = compute(fixWS(before));
    App.dataReplaced();
    const d = diffModels(Mb, M);
    const nf = OB.files.filter(F => F.status === 'ok').length;
    await App.saveVersion(`큐시트 온보딩: 원본 ${nf}개 파일 (${fmt.int(rows.length)}회)`, true, d);
    await App.flushSave();
    const msg = `<b>${fmt.int(rows.length)}회</b>를 넣었어요 · 케이블 ${fmt.int(R.케이블.length)} · 지상파 ${fmt.int(R.지상파.length)}${removed ? ` · 기존 ${fmt.int(removed)}행 바꿈` : ''}${nr ? ` · 매칭 규칙 ${nr}개 기억` : ''}`;
    this.close();
    App.go(R.케이블.length >= R.지상파.length ? 'cuec' : 'cueg');
    App.toast(msg, 7000);
  },
};
