// ===== 19-xlreport.js : 보고용 엑셀 =====
// 모든 시트 공통: 눈금선 없음 · A열 여백(너비 3) · 1·3행 높이 2(비움) · 2행 = 시트 제목 · 값은 가운데 정렬 · 엑셀 차트(웹 그래프를 엑셀 차트로)
// 16차: 머리말 ⤓ 하나로 전체 파일만 — 운영 요약 · 소재 운영 · 큐시트 캘린더(M월) · 지상파 큐시트(M월) · 케이블 큐시트(M월) PP별 · 전체 큐시트(M월)
//       (+ 다시 넣기용 데이터는 숨김 시트 — 관리자만) · 줄바꿈이 필요한 칸은 줄 높이를 글자 길이로 계산해서 잘리지 않게
const XRF = '맑은 고딕';
const ZF = '#,##0;-#,##0;"-"';   // 0은 '-'로
function xrBd(c, w) { const s = { style: w || 'thin', color: { rgb: c } }; return { top: s, bottom: s, left: s, right: s }; }
function xs2(base, extra) { const o = JSON.parse(JSON.stringify(base)); for (const k in extra || {}) o[k] = Object.assign({}, o[k] || {}, extra[k]); return o; }
const XRS = (() => {
  const cell = { font: { name: XRF, sz: 10, color: { rgb: '262626' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: xrBd('E3E3E3') };
  return {
    title: { font: { name: XRF, sz: 16, bold: true, color: { rgb: '262626' } }, alignment: { horizontal: 'left', vertical: 'center' } },
    sec: { font: { name: XRF, sz: 12, bold: true, color: { rgb: '3F3F3F' } }, alignment: { horizontal: 'left', vertical: 'center' } },
    sec2: { font: { name: XRF, sz: 10, bold: true, color: { rgb: '575757' } }, alignment: { horizontal: 'left', vertical: 'center' } },
    note: { font: { name: XRF, sz: 9, color: { rgb: '929292' } }, alignment: { horizontal: 'left', vertical: 'center' } },
    head: { font: { name: XRF, sz: 10, bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '424242' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: xrBd('6D6D6D') },
    cell,
    lab: xs2(cell, { font: { bold: true }, fill: { fgColor: { rgb: 'F9F9F9' } } }),
    grp: xs2(cell, { font: { bold: true, color: { rgb: '3F3F3F' } }, fill: { fgColor: { rgb: 'F1F1F1' } } }),
    subt: xs2(cell, { font: { bold: true, color: { rgb: '3F3F3F' } }, fill: { fgColor: { rgb: 'E6E6E6' } }, border: xrBd('D0D0D0') }),
    tot: xs2(cell, { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '575757' } }, border: xrBd('575757') }),
    bon: xs2(cell, { fill: { fgColor: { rgb: 'FCEEF4' } } }),
    // 큐시트의 방송사 계 · 3사 계 (화면과 같은 진한 회색 · 흰 글자)
    csub: xs2(cell, { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '6E6E73' } }, border: xrBd('7C7C81') }),
    ctot: xs2(cell, { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '3A3A3C' } }, border: xrBd('4A4A4D') }),
  };
})();
// 시트 만들기: 칸마다 값·서식을 넣고 마지막에 SheetJS 시트로
function XRSheet(name, title) {
  const b = { name, cells: new Map(), merges: [], widths: [3], heights: { 0: 2, 1: 30, 2: 2 }, charts: [], maxR: 2, maxC: 1 };
  b.put = (r, c, v, s, z) => { b.cells.set(r + ',' + c, { v, s, z }); if (r > b.maxR) b.maxR = r; if (c > b.maxC) b.maxC = c; };
  b.merge = (r1, c1, r2, c2, s) => {
    if (r1 === r2 && c1 === c2) return;
    b.merges.push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
    const st = s || (b.cells.get(r1 + ',' + c1) || {}).s;
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (!(r === r1 && c === c1)) b.put(r, c, '', st);
  };
  b.chart = (xml, c1, r1, c2, r2) => b.charts.push({ xml, c1, r1, c2, r2 });
  b.put(1, 1, title, XRS.title);
  return b;
}
// 글자 폭 어림 (엑셀 열 너비 단위: 기본 숫자 한 글자) — 한글 ≈ 1.85, 영문·숫자 ≈ 1, 공백·문장부호 ≈ 0.55
function xrTextW(str, sz, bold) {
  let w = 0;
  for (const ch of String(str == null ? '' : str)) {
    const c = ch.codePointAt(0);
    if ((c >= 0x1100 && c <= 0x11ff) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7af) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xffef)) w += 1.85;
    else if (/[MW@%#&]/.test(ch)) w += 1.35;
    else if (/[A-Z0-9mw]/.test(ch)) w += 1.05;
    else if (/[ .,:;'|!il\[\]()\-\/]/.test(ch)) w += 0.55;
    else w += 0.92;
  }
  return w * (sz || 10) / 10 * (bold ? 1.06 : 1);
}
function xrToSheet(b) {
  xrFit(b);
  const ws = {};
  for (const [k, x] of b.cells) {
    const [r, c] = k.split(',').map(Number);
    const isN = typeof x.v === 'number' && isFinite(x.v);
    const cell = isN ? { t: 'n', v: x.v, z: x.z || '#,##0' } : { t: 's', v: x.v == null ? '' : String(x.v) };
    cell.s = x.s || XRS.cell;
    ws[XLSX.utils.encode_cell({ r, c })] = cell;
  }
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: b.maxR + 1, c: b.maxC } });
  const wOf = c => b.widths[c] || 12;
  ws['!cols'] = Array.from({ length: b.maxC + 1 }, (_, c) => ({ wch: wOf(c) }));
  // 줄 높이: 줄바꿈하는 칸(wrapText)은 글자 길이·병합 너비로 몇 줄인지 계산해 높이를 정함 (엑셀은 저장된 줄 높이를 다시 계산하지 않아서 글자가 잘려 보였음)
  const span = new Map(); const vmerged = new Set();
  for (const m of b.merges) {
    if (m.s.r === m.e.r) { let w = 0; for (let c = m.s.c; c <= m.e.c; c++) w += wOf(c); span.set(m.s.r + ',' + m.s.c, w); }
    else for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) vmerged.add(r + ',' + c);
  }
  const need = {};
  for (const [k, x] of b.cells) {
    if (typeof x.v !== 'string' || !x.v || vmerged.has(k)) continue;
    const st = x.s || XRS.cell; if (!st.alignment || !st.alignment.wrapText) continue;
    const [r, c] = k.split(',').map(Number);
    const sz = (st.font && st.font.sz) || 10, bold = !!(st.font && st.font.bold);
    const avail = Math.max(2, (span.get(k) || wOf(c)) - 1.2);
    const lines = x.v.split('\n').reduce((a, seg) => a + Math.max(1, Math.ceil(xrTextW(seg, sz, bold) * 1.04 / avail)), 0);
    const h = lines * (sz * 1.34 + 0.6) + 5;
    if (!need[r] || h > need[r]) need[r] = h;
  }
  ws['!rows'] = []; for (let r = 0; r <= b.maxR + 1; r++) { const base = b.heights[r] != null ? b.heights[r] : (r >= 3 ? 18 : 15); ws['!rows'][r] = { hpt: Math.round(Math.max(base, b.fixH && b.fixH[r] ? 0 : need[r] || 0) * 10) / 10 }; }
  ws['!merges'] = b.merges;
  if (b.autofilter) ws['!autofilter'] = { ref: b.autofilter };
  return ws;
}

// ---------- 엑셀 차트 (DrawingML) ----------
function xmlEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
const xrHex = h => String(h || '#929292').replace('#', '').toUpperCase().slice(0, 6);
function xrTx(sz, color, bold) { return `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${bold ? 1 : 0}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${XRF}"/><a:ea typeface="${XRF}"/></a:defRPr></a:pPr><a:endParaRPr lang="ko-KR"/></a:p></c:txPr>`; }
function xrFill(hex) { return `<c:spPr><a:solidFill><a:srgbClr val="${xrHex(hex)}"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr>`; }
function xrStrLit(list) { return `<c:strLit><c:ptCount val="${list.length}"/>${list.map((v, i) => `<c:pt idx="${i}"><c:v>${xmlEsc(v)}</c:v></c:pt>`).join('')}</c:strLit>`; }
function xrNumLit(list, fmt) { return `<c:numLit><c:formatCode>${xmlEsc(fmt || 'General')}</c:formatCode><c:ptCount val="${list.length}"/>${list.map((v, i) => v == null || !isFinite(v) ? '' : `<c:pt idx="${i}"><c:v>${+v}</c:v></c:pt>`).join('')}</c:numLit>`; }
// sp: { type:'bar'|'doughnut', dir:'bar'|'col', group:'clustered'|'stacked', title, cats:[], series:[{name, color, vals:[], pts:[색…]}], fmt, labels:true, legend:'b'|'r'|null, hole }
function xrChart(sp) {
  const fmt = sp.fmt || '#,##0';
  const dl = (show, pos) => show ? `<c:dLbls><c:numFmt formatCode="${xmlEsc(sp.type === 'doughnut' ? '0%' : fmt)}" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${xrTx(sp.lblSz || 800, sp.lblColor || (sp.type === 'doughnut' || sp.group === 'stacked' ? 'FFFFFF' : '616161'), true)}${pos ? `<c:dLblPos val="${pos}"/>` : ''}<c:showLegendKey val="0"/><c:showVal val="${sp.type === 'doughnut' ? 0 : 1}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${sp.type === 'doughnut' ? 1 : 0}"/><c:showBubbleSize val="0"/>${sp.type === 'doughnut' ? '<c:showLeaderLines val="0"/>' : ''}</c:dLbls>` : '<c:dLbls><c:delete val="1"/></c:dLbls>';
  // 칸 색이 진하면 흰 글자, 옅으면 진한 글자 (점마다)
  const inkOf = hex => { const c = hexToRgb('#' + xrHex(hex)) || [128, 128, 128]; return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255 > 0.6 ? '262626' : 'FFFFFF'; };
  const ptLbls = (s, pos) => (sp.type === 'doughnut' || sp.group === 'stacked') && s.pts ? s.pts.map((col, k) => s.hideBelow != null && !(s.vals[k] >= s.hideBelow) ? `<c:dLbl><c:idx val="${k}"/><c:delete val="1"/></c:dLbl>` : col ? `<c:dLbl><c:idx val="${k}"/><c:numFmt formatCode="${xmlEsc(sp.type === 'doughnut' ? '0%' : fmt)}" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${xrTx(sp.lblSz || 800, inkOf(col), true)}${pos ? `<c:dLblPos val="${pos}"/>` : ''}<c:showLegendKey val="0"/><c:showVal val="${sp.type === 'doughnut' ? 0 : 1}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${sp.type === 'doughnut' ? 1 : 0}"/><c:showBubbleSize val="0"/></c:dLbl>` : '').join('') : '';
  const dl2 = (s, show, pos) => show ? dl(true, pos).replace('<c:dLbls>', '<c:dLbls>' + ptLbls(s, pos)) : dl(false);
  const ser = (s, i) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${xmlEsc(s.name)}</c:v></c:tx>${xrFill(s.color)}${sp.type === 'bar' ? '<c:invertIfNegative val="0"/>' : ''}${(s.pts || []).map((col, k) => col ? `<c:dPt><c:idx val="${k}"/>${sp.type === 'bar' ? '<c:invertIfNegative val="0"/><c:bubble3D val="0"/>' : '<c:bubble3D val="0"/>'}${xrFill(col)}</c:dPt>` : '').join('')}${dl2(s, sp.labels !== false && s.labels !== false, sp.type === 'bar' ? (sp.group === 'stacked' ? 'ctr' : 'outEnd') : null)}<c:cat>${xrStrLit(sp.cats)}</c:cat><c:val>${xrNumLit(s.vals, fmt)}</c:val></c:ser>`;
  let plot;
  if (sp.type === 'doughnut') {
    plot = `<c:doughnutChart><c:varyColors val="1"/>${sp.series.map(ser).join('')}<c:firstSliceAng val="0"/><c:holeSize val="${sp.hole || 58}"/></c:doughnutChart>`;
  } else {
    const ax = (id, cross, pos, cat) => cat
      ? `<c:catAx><c:axId val="${id}"/><c:scaling><c:orientation val="${sp.dir === 'bar' ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${pos}"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="D0D0D0"/></a:solidFill></a:ln></c:spPr>${xrTx(900, '616161', false)}<c:crossAx val="${cross}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
      : `<c:valAx><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="${sp.hideVal ? 1 : 0}"/><c:axPos val="${pos}"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="EFEFEF"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="${xmlEsc(fmt)}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${xrTx(800, '929292', false)}<c:crossAx val="${cross}"/><c:crosses val="${sp.dir === 'bar' ? 'max' : 'autoZero'}"/><c:crossBetween val="between"/></c:valAx>`;
    // 17차: totals = 쌓은 막대 위 합계 레이블 (선·점 없는 꺾은선 계열의 값 레이블을 막대 위에) — 범례에서는 뺌
    const nS = sp.series.length;
    const tot = sp.totals ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/><c:ser><c:idx val="${nS}"/><c:order val="${nS}"/><c:tx><c:v>합계</c:v></c:tx><c:spPr><a:ln w="12700"><a:noFill/></a:ln></c:spPr><c:marker><c:symbol val="none"/></c:marker><c:dLbls><c:numFmt formatCode="${xmlEsc(fmt)}" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${xrTx(900, '262626', true)}<c:dLblPos val="t"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls><c:cat>${xrStrLit(sp.cats)}</c:cat><c:val>${xrNumLit(sp.totals, fmt)}</c:val><c:smooth val="0"/></c:ser><c:marker val="1"/><c:axId val="5001"/><c:axId val="5002"/></c:lineChart>` : '';
    plot = `<c:barChart><c:barDir val="${sp.dir || 'col'}"/><c:grouping val="${sp.group || 'clustered'}"/><c:varyColors val="0"/>${sp.series.map(ser).join('')}<c:gapWidth val="${sp.gap || 60}"/>${sp.group === 'stacked' ? '<c:overlap val="100"/>' : '<c:overlap val="-10"/>'}<c:axId val="5001"/><c:axId val="5002"/></c:barChart>` + tot
      + ax(5001, 5002, sp.dir === 'bar' ? 'l' : 'b', true) + ax(5002, 5001, sp.dir === 'bar' ? 't' : 'l', false);
  }
  const title = sp.title ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1100" b="1"/></a:pPr><a:r><a:rPr lang="ko-KR" sz="1100" b="1"><a:solidFill><a:srgbClr val="262626"/></a:solidFill><a:latin typeface="${XRF}"/><a:ea typeface="${XRF}"/></a:rPr><a:t>${xmlEsc(sp.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>` : '<c:autoTitleDeleted val="1"/>';
  const legend = sp.legend ? `<c:legend><c:legendPos val="${sp.legend}"/>${sp.totals && sp.type !== 'doughnut' ? `<c:legendEntry><c:idx val="${sp.series.length}"/><c:delete val="1"/></c:legendEntry>` : ''}<c:overlay val="0"/>${xrTx(900, '616161', false)}</c:legend>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart>${title}<c:plotArea><c:layout/>${plot}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="E3E3E3"/></a:solidFill></a:ln></c:spPr>${xrTx(900, '616161', false)}</c:chartSpace>`;
}
// 쓴 xlsx(zip)를 열어 눈금선 끄기 · 차트 넣기
function xrPost(arr, builders) {
  const CFB = XLSX.CFB, enc = new TextEncoder(), dec = new TextDecoder();
  const z = CFB.read(new Uint8Array(arr), { type: 'array' });
  const get = p => { const e = CFB.find(z, '/' + p); return e ? dec.decode(e.content) : null; };
  const set = (p, t) => { const e = CFB.find(z, '/' + p); const d = enc.encode(t); if (e) { e.content = d; e.size = d.length; } else CFB.utils.cfb_add(z, '/' + p, d); };
  let ct = get('[Content_Types].xml'); let nChart = 0, nDraw = 0;
  builders.forEach((b, i) => {
    const sp = `xl/worksheets/sheet${i + 1}.xml`; let x = get(sp); if (x == null) return;
    x = x.replace(/<sheetView\b([^>]*?)(\/?)>/, (m, a, sl) => /showGridLines/.test(a) ? m : `<sheetView showGridLines="0"${a}${sl}>`);
    if (!/<sheetViews>/.test(x)) x = x.replace(/(<dimension[^>]*\/>)/, '$1<sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>');
    // 인쇄: 가로 · 너비 한 장에 맞춤
    if (!/<sheetPr/.test(x)) x = x.replace(/(<worksheet[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
    if (!/<pageSetup/.test(x)) { const ps = '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>'; x = /<pageMargins[^>]*\/>/.test(x) ? x.replace(/<pageMargins[^>]*\/>/, ps) : x.includes('<ignoredErrors') ? x.replace('<ignoredErrors', ps + '<ignoredErrors') : x.replace('</worksheet>', ps + '</worksheet>'); }
    if (b.charts.length) {
      const d = ++nDraw;
      x = x.replace('</worksheet>', '<drawing r:id="rIdXrDr"/></worksheet>');
      const relp = `xl/worksheets/_rels/sheet${i + 1}.xml.rels`; let rel = get(relp);
      const R = `<Relationship Id="rIdXrDr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${d}.xml"/>`;
      rel = rel ? rel.replace('</Relationships>', R + '</Relationships>') : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${R}</Relationships>`;
      set(relp, rel);
      const anchors = [], drels = [];
      b.charts.forEach((ch, k) => {
        const n = ++nChart;
        set(`xl/charts/chart${n}.xml`, ch.xml);
        ct = ct.replace('</Types>', `<Override PartName="/xl/charts/chart${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`);
        drels.push(`<Relationship Id="rIdC${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${n}.xml"/>`);
        anchors.push(`<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${ch.c1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${ch.r1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${ch.c2}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${ch.r2}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${k + 2}" name="차트 ${k + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rIdC${k + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`);
      });
      set(`xl/drawings/drawing${d}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors.join('')}</xdr:wsDr>`);
      set(`xl/drawings/_rels/drawing${d}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drels.join('')}</Relationships>`);
      ct = ct.replace('</Types>', `<Override PartName="/xl/drawings/drawing${d}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
    }
    set(sp, x);
  });
  set('[Content_Types].xml', ct);
  return CFB.write(z, { fileType: 'zip', type: 'array', compression: true });
}
// builders(보이는 시트) + hidden(다시 넣기용 데이터 시트, buildBook 형식) → xlsx 바이트
function xrBookBytes(builders, hidden) {
  const wb = XLSX.utils.book_new();
  for (const b of builders) XLSX.utils.book_append_sheet(wb, xrToSheet(b), b.name.slice(0, 31));
  if (hidden && hidden.length) { const hb = buildBook(hidden); for (const n of hb.SheetNames) { XLSX.utils.book_append_sheet(wb, hb.Sheets[n], n); XLSX.utils.book_set_sheet_visibility(wb, n, 1); } }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
  return xrPost(out, builders);
}
function xrDownload(builders, hidden, filename) {
  saveBlob(new Blob([xrBookBytes(builders, hidden)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}
// 파일 이름: 261006_코웨이 TV set 큐시트 (2026년 10월)_SM C&C.xlsx (앞 6자리 = 받은 날)
function xrFileName() { const d = new Date(); const yymmdd = `${String(d.getFullYear()).slice(2)}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`; return `${yymmdd}_${advName()} TV set 큐시트 (${M.ym.y}년 ${M.ym.m}월)_SM C&C.xlsx`; }
const xrName = what => `${advName()}TV큐시트_${WS.ym.replace('-', '')}_${what}_${fmt.stamp()}.xlsx`;
const xrTitle = what => `${advName()} ${M.ym ? M.ym.m + '월' : WS.ym} TV ${what}`;
const xrMon = () => `(${M.ym.m}월)`;
const xrSheetName = n => String(n).replace(/[:\\\/?*\[\]]/g, ' ').slice(0, 31);

// ---------- 표 쓰기 ----------
// 계층 표(구분·PP·채널 + 값 열): table1 / tableCnt 결과 → 시트
//   T.top(맨 위 제목 줄) · T.groups(묶음 줄) · T.head(값 머리글) — 있는 만큼 머리글 줄이 늘어남
//   o.span = 값 하나가 차지하는 칸 수(가는 칸 여러 개를 병합) · o.groupStyle(g) / o.subStyle(h) = 머리글 칸 서식(품목 색 등) · o.subSz = 값 머리글 글자 크기
function xrHierTable(b, r0, c0, T, numFmt, o = {}) {
  const k = o.span || 1, nv = T.head.length - 3; let r = r0;
  const vc = j => c0 + 3 + j * k;
  const gs = new Set(); if (T.groups) { let j = 0; for (const [, n] of T.groups) { gs.add(j); j += n; } }
  if (T.top) { let j = 0; for (const [, n] of T.top) { gs.add(j); j += n; } }
  const edge = s => xs2(s, { border: { left: { style: 'medium', color: { rgb: '7F7F7F' } } } });
  const gEdge = (s, j) => gs.has(j) && j > 0 ? edge(s) : s;
  const putV = (rr, j, v, st, z, fill) => { b.put(rr, vc(j), v, gEdge(st, j), z); if (k > 1) b.merge(rr, vc(j), rr, vc(j) + k - 1, fill || st); };
  const nh = (T.top ? 1 : 0) + (T.groups ? 1 : 0) + 1;
  for (let q = 0; q < 3; q++) { b.put(r, c0 + q, T.head[q] === 'MPP' ? 'PP' : T.head[q], XRS.head); if (nh > 1) b.merge(r, c0 + q, r + nh - 1, c0 + q, XRS.head); }
  const top = xs2(XRS.head, { fill: { fgColor: { rgb: '2C2C2E' } }, border: xrBd('5A5A5E') });
  if (T.top) {
    let j = 0;
    for (const [t, n, down] of T.top) { b.put(r, vc(j), t, gEdge(top, j)); b.merge(r, vc(j), down && T.groups ? r + 1 : r, vc(j + n) - 1, top); j += n; }
    b.heights[r] = 20; r++;
  }
  if (T.groups) {
    let j = 0;
    const wSpan = (c1, c2) => { let w = 0; for (let c = c1; c <= c2; c++) w += b.widths[c] || 12; return w; };
    for (const [g, n] of T.groups) { if (g != null) { const st = xrHeadFit(o.groupStyle ? o.groupStyle(g) : XRS.head, g, wSpan(vc(j), vc(j + n) - 1)); b.put(r, vc(j), g, gEdge(st, j)); b.merge(r, vc(j), r, vc(j + n) - 1, st); } j += n; }
    b.heights[r] = 20; r++;
  }
  T.head.slice(3).forEach((h, q) => { let st = o.subStyle ? o.subStyle(h, q) : XRS.head; if (o.subSz) st = xs2(st, { font: { sz: o.subSz } }); let w = 0; for (let c = vc(q); c < vc(q) + k; c++) w += b.widths[c] || 12; st = xrHeadFit(st, h, w); putV(r, q, h, st, undefined, st); });
  b.heights[r] = 20; r++;
  const { s0, s1 } = spans(T.rows);
  T.rows.forEach((row, i) => {
    const st = row.t === 'sub' ? XRS.subt : row.t === 'tot' ? XRS.tot : XRS.cell;
    if (row.t === 'row') {
      if (s0[i]) { b.put(r, c0, row.lab[0], XRS.lab); if (s0[i] > 1) b.merge(r, c0, r + s0[i] - 1, c0, XRS.lab); }
      if (s1[i]) { b.put(r, c0 + 1, row.lab[1], XRS.lab); if (s1[i] > 1) b.merge(r, c0 + 1, r + s1[i] - 1, c0 + 1, XRS.lab); }
      b.put(r, c0 + 2, row.lab[2], XRS.cell);
    } else { b.put(r, c0, row.lab[0], st); b.merge(r, c0, r, c0 + 2, st); }
    row.vals.forEach((v, j) => putV(r, j, v == null ? '-' : v, st, numFmt(j, v), st));
    r++;
  });
  return { r, c1: vc(nv) - 1 };
}
// 머리글이 칸 너비에 한 줄로 안 들어가면 글자를 조금 줄임(최소 8) — 엑셀에서 머리글이 두 줄로 꺾이지 않게
function xrFitSz(text, width, base, min) {
  base = base || 10; min = min || 8; const lines = String(text).split('\n');
  for (let sz = base; sz >= min; sz -= 0.5) if (lines.every(l => xrTextW(l, sz, true) * 1.04 <= width - 1.2)) return sz;
  return min;
}
const xrHeadFit = (st, text, width) => { const base = (st.font && st.font.sz) || 10, sz = xrFitSz(text, width, base); return sz === base ? st : xs2(st, { font: { sz } }); };
// 품목 머리글 칸: 품목 색 바탕 · 흰 글자 (옅은 색은 어둡게)
function xrItemHead(item) { const c = itemColor(item); return xs2(XRS.head, { fill: { fgColor: { rgb: hexRgb(isLight(c) ? shade(c, -0.32) : c) } }, border: xrBd('FFFFFF') }); }
// 열 너비 → 화면 픽셀 (엑셀 기본: 7 × 너비 + 5)
const xrPx = w => Math.round(w * 7 + 5);
// c1 열부터 px 픽셀쯤 되는 곳의 열 번호 (차트 오른쪽 끝)
function xrColTo(b, c1, px) { let c = c1, acc = 0; for (;;) { const w = xrPx(b.widths[c] || 12); if (acc + w / 2 > px) return c; acc += w; c++; } }
// 줄바꿈 없이 들어가야 하는 이름 칸(채널·PP·품목 등): 가장 긴 글자에 맞춰 열 너비를 넓힘 (b.fit = 열 번호들)
function xrFit(b) {
  if (!b.fit || !b.fit.length) return;
  const hm = new Set(); for (const m of b.merges) if (m.s.c !== m.e.c) for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) hm.add(r + ',' + c);
  for (const [k, x] of b.cells) {
    const c = +k.split(',')[1]; if (!b.fit.includes(c) || hm.has(k) || typeof x.v !== 'string' || !x.v.trim()) continue;
    const st = x.s || XRS.cell; if (!st.alignment || st.alignment.wrapText == null) continue;   // 제목·구역 이름(옆 칸으로 넘쳐 보이는 글자)은 빼고
    const sz = (st.font && st.font.sz) || 10, bold = !!(st.font && st.font.bold);
    const ind = st.alignment.indent ? st.alignment.indent * 1.3 : 0;
    const need = Math.max(...x.v.split('\n').map(seg => xrTextW(seg, sz, bold))) * 1.04 + 1.6 + ind;
    if (need > (b.widths[c] || 12)) b.widths[c] = Math.min(b.fitMax || 30, Math.ceil(need * 2) / 2);
  }
}

// 주요 프로그램(자동 값): 칸 너비에 한 줄로 들어가게 단가 높은 순으로 넣고 끝에 ' 등' (화면과 같은 방식)
function xrFitProgs(list, avail) {
  if (!list || !list.length) return '';
  let t = list[0];
  for (let i = 1; i < list.length; i++) { const x = t + ', ' + list[i]; if (xrTextW(x + ' 등', 10) * 1.04 > avail - 1.2) break; t = x; }
  return t + ' 등';
}
// ---------- ① 운영 요약 (운영 요약 표 → 예산 및 보너스 표·차트 → 송출 횟수 차트·표) ----------
// 17차: E열부터 가는 칸(너비 6)을 깔고 표마다 필요한 만큼 병합 — 운영 요약 값 = 2칸 · 예산 표 값 = 3칸 · 송출 횟수 = 1칸
//       (그래서 품목별 송출 횟수 표를 가로로 펼쳐도 위 표가 넓어지지 않음) · 차트는 한 화면(약 1,780px) 안에
function xrOpsSheet() {
  const cells = M.cells, items = itemsIn(cells);
  const b = XRSheet('운영 요약', xrTitle('운영 요약'));
  const U = 6;
  b.widths = [3, 11, 15, 10].concat(Array(160).fill(U));
  b.fit = [1, 2, 3];
  let r = 3;
  const secRow = t => { b.put(r, 1, t, XRS.sec); b.heights[r] = 26; r++; };
  // 운영 요약 표 — 같은 카테고리는 B열 병합(품목 요약 줄까지) · 품목은 C열 병합 · 요약 줄 이름 C~D · 합계 B~D · 값 2칸씩 · 주요 프로그램 10칸(왼쪽 정렬)
  {
    const VC = k => 4 + k * 2, PC = VC(6), PL = PC + 9, progW = 10 * U - 1.5;
    const T = opsTable();
    for (let k = 0; k < 3; k++) b.put(r, 1 + k, T.head[k], XRS.head);
    T.head.slice(3, 9).forEach((h, k) => { b.put(r, VC(k), h, XRS.head); b.merge(r, VC(k), r, VC(k) + 1, XRS.head); });
    b.put(r, PC, T.head[9], XRS.head); b.merge(r, PC, r, PL, XRS.head); b.heights[r] = 22; r++;
    const left = st => xs2(st, { alignment: { horizontal: 'left', indent: 1 } });
    const NF = ['0.00', '#,##0', '0.0', '0.0', '0.0', '0.0'];
    for (const row of T.rows) {
      const st = row.t === 'sub' ? XRS.subt : row.t === 'tot' ? XRS.tot : XRS.cell;
      if (row.t === 'row') {
        if (row.catSpan) { b.put(r, 1, row.vals[0], XRS.lab); if (row.catSpan > 1) b.merge(r, 1, r + row.catSpan - 1, 1, XRS.lab); }
        if (row.span) { const fl = xs2(XRS.lab, { fill: { fgColor: { rgb: hexRgb(itemLight(row.item)) } } }); b.put(r, 2, row.vals[1], fl); if (row.span > 1) b.merge(r, 2, r + row.span - 1, 2, fl); }
        b.put(r, 3, row.vals[2], XRS.cell);
      } else if (row.t === 'sub') { b.put(r, 2, row.vals[1], st); b.merge(r, 2, r, 3, st); }
      else { b.put(r, 1, row.vals[0], st); b.merge(r, 1, r, 3, st); }
      row.vals.slice(3, 9).forEach((v, k) => { b.put(r, VC(k), v == null || v === '' ? (row.t === 'tot' ? '' : '-') : v, st, NF[k]); b.merge(r, VC(k), r, VC(k) + 1, st); });
      let txt = '';
      if (row.t === 'row') { const x = row.src; txt = x.manual ? x.progs : xrFitProgs(x.autoList || [], progW); }
      b.put(r, PC, txt, left(st)); b.merge(r, PC, r, PL, left(st));
      r++;
    }
    r += 1;
  }
  // 예산 및 보너스 — 17차: 표 위 '예산 (원)' 같은 줄 대신 표 머리글 맨 위에 무엇의 표인지(예산 · 보너스 · 예산+보너스 · 보너스율)
  secRow('예산 및 보너스');
  for (const [m, t] of [['budget', '예산'], ['bonus', '보너스'], ['value', '예산+보너스'], ['rate', '보너스율']]) {
    const T1 = table1(cells, m); T1.top = [[t, T1.head.length - 3]];
    const o = xrHierTable(b, r, 1, T1, () => m === 'rate' ? '0%' : ZF, { span: 3, subStyle: h => M.MS.items.has(h) ? xrItemHead(h) : XRS.head }); r = o.r + 1;
  }
  const rB = r, HB = Math.max(16, items.length * 2 + 6); r += HB + 2;
  // 송출 횟수 — 차트(주차별 · 초수별 · 요일별 · 중CM) → 품목별 주차 송출수 표 → 품목별 소재 길이 · 주말 · CM 위치 표
  secRow('송출 횟수');
  const rC = r, HC = 17; r += HC + 1;
  const W = M.weeks, nW = W.length;
  const its = items.filter(k => cells.some(c => c.item === k && c.cnt > 0)), blocks = its.concat(['전체']);
  const pick = (list, k) => k === '전체' ? list : list.filter(c => c.item === k);
  const has = rr => sum(rr.cells, c => c.cnt) > 0;
  const blockStyle = g => g === '전체' ? xs2(XRS.head, { fill: { fgColor: { rgb: '3A3A3C' } } }) : xrItemHead(g);
  // ⓐ 주차별 송출수: [품목마다 1주~N주·계] + [전체]
  const TA = { head: ['구분', 'MPP', '채널'].concat(blocks.flatMap(() => W.map(w => `${w.n}주`).concat(['계']))),
    top: [['주차별 송출수 (품목별)', blocks.length * (nW + 1)]], groups: blocks.map(k => [k, nW + 1]),
    rows: hierRows(cells, list => blocks.flatMap(k => { const l = pick(list, k); return W.map((_, i) => sum(l, c => c.wk[i])).concat([aggCells(l).cnt || 0]); }), has) };
  r = xrHierTable(b, r, 1, TA, () => ZF, { groupStyle: blockStyle, subSz: 9 }).r + 1;
  // ⓑ 소재 길이(품목마다 초수별 · 전체) + 주말 여부 + CM 위치 (전체)
  const secs = [...new Set(cells.flatMap(c => Object.keys(c.sec).filter(k => c.sec[k] > 0).map(Number)))].filter(x => x > 0).sort((a, c) => a - c);
  const nS = secs.length;
  const TB = { head: ['구분', 'MPP', '채널'].concat(blocks.flatMap(() => secs.map(x => `${x}초`)), ['주중', '주말', '주말\n비중', '중CM', 'PIB', '전후\nCM 등', '중CM\n비중', '중CM\n+PIB\n비중']),
    top: [['소재 길이 (품목별 초수)', blocks.length * nS], ['주말 여부', 3, true], ['CM 위치', 5, true]].filter(x => x[1] > 0),
    groups: blocks.map(k => [k, nS]).concat([[null, 3], [null, 5]]).filter(x => x[1] > 0),
    rows: hierRows(cells, list => {
      const out = []; for (const k of blocks) { const a = aggCells(pick(list, k)); secs.forEach(x => out.push(a.sec[x] || 0)); }
      const a = aggCells(list), n = a.cnt || 0, mid = a.cmc.중CM || 0, pib = a.cmc.PIB || 0;
      return out.concat([a.wd, a.we, n ? a.we / n : null, mid, pib, n - mid - pib, n ? mid / n : null, n ? (mid + pib) / n : null]);
    }, has) };
  const pctB = new Set([blocks.length * nS + 2, blocks.length * nS + 6, blocks.length * nS + 7]);
  r = xrHierTable(b, r, 1, TB, j => pctB.has(j) ? '0%' : ZF, { groupStyle: blockStyle, subSz: 9 }).r + 1;
  // 차트 — 열 너비가 정해진 뒤(이름 칸 맞춤) 화면 픽셀로 자리 잡기
  xrFit(b);
  {
    const iv = items.map(k => { const cc = cells.filter(c => c.item === k); return { k, b: sum(cc, c => c.budget) / 1e8, x: sum(cc, c => c.bonus) / 1e8 }; });
    const mxv = Math.max(0, ...iv.map(x => x.b + Math.max(0, x.x)));
    const c1 = xrColTo(b, 1, 820), c2 = xrColTo(b, c1, 480);
    b.chart(xrChart({ type: 'bar', dir: 'bar', group: 'stacked', title: '품목별 예산·보너스 (억원)', cats: iv.map(x => x.k), fmt: '0.0', legend: 'b', gap: 45,
      // 17차: 막대가 너무 짧으면(가장 긴 막대의 5% 미만) 그 레이블은 숨김 — 글자가 겹치지 않게
      series: [{ name: '예산', color: '#575757', vals: iv.map(x => x.b), pts: iv.map(x => itemColor(x.k)), hideBelow: mxv * 0.05 }, { name: '보너스', color: '#d2d2d2', vals: iv.map(x => x.x), pts: iv.map(x => itemLight(x.k)), labels: true, hideBelow: mxv * 0.05 }], lblColor: '262626' }), 1, rB, c1, rB + HB);
    const steps = [0, 0.18, 0.34, 0.48, 0.6, 0.7, 0.78];
    const gv = SUM_GROUPS.map((g, i) => ({ g, v: sum(cells.filter(c => c.group === g), c => c.budget), col: i === 0 ? '#575757' : tint('#575757', steps[i] || 0.8) })).filter(x => x.v > 0);
    b.chart(xrChart({ type: 'doughnut', title: '방송사별 예산 비중', cats: gv.map(x => x.g), legend: 'r', series: [{ name: '예산', color: '#575757', vals: gv.map(x => x.v), pts: gv.map(x => x.col) }] }), c1, rB, c2, rB + HB);
  }
  {
    const A = aggCells(cells); const sx = Object.keys(A.sec).map(Number).filter(x => x > 0 && A.sec[x] > 0).sort((a, c) => a - c);
    const mid = A.cmc.중CM || 0, pib = A.cmc.PIB || 0;
    const wv = W.map((_, i) => sum(cells, c => c.wk[i]));
    const c1 = xrColTo(b, 1, 760), c2 = xrColTo(b, c1, 330), c3 = xrColTo(b, c2, 330), c4 = xrColTo(b, c3, 330);
    // 17차: 주차별 막대 위에 합계 레이블
    b.chart(xrChart({ type: 'bar', dir: 'col', group: 'stacked', title: '주차별 송출 (품목별)', cats: W.map(w => `${w.n}주 (${w.range})`), legend: 'b', gap: 55, labels: false, totals: wv,
      series: items.map(k => ({ name: k, color: itemColor(k), vals: W.map((_, i) => sum(cells.filter(c => c.item === k), c => c.wk[i])) })) }), 1, rC, c1, rC + HC);
    b.chart(xrChart({ type: 'doughnut', title: '초수별 노출수', cats: sx.map(x => x + '초'), legend: 'b', series: [{ name: '초수', color: '#13958a', vals: sx.map(x => A.sec[x]), pts: sx.map(secColor) }] }), c1, rC, c2, rC + HC);
    b.chart(xrChart({ type: 'doughnut', title: '요일별 노출수', cats: ['주중', '주말'], legend: 'b', series: [{ name: '요일', color: MIXC.wd, vals: [A.wd, A.we], pts: [MIXC.wd, MIXC.we] }] }), c2, rC, c3, rC + HC);
    b.chart(xrChart({ type: 'doughnut', title: `중CM 비중 (${fmt.int(A.cnt)}회)`, cats: ['중CM', 'PIB', '전후CM 등'], legend: 'b', series: [{ name: '중CM', color: CMC.mid, vals: [mid, pib, Math.max(0, A.cnt - mid - pib)], pts: [CMC.mid, CMC.pib, CMC.fb] }], lblColor: '262626' }), c3, rC, c4, rC + HC);
  }
  b.maxR = Math.max(b.maxR, r);
  return b;
}

// 주차 칸: 화면과 같은 글자([품목] 소재 초수 / [품목] 초수 CM위치) · 한 품목이면 품목 색 바탕에 흰 글자, 여러 품목이 섞이면 옅은 회색
function xrWeekStyle(st, list) {
  if (!list.length) return st;
  const its = new Set(list.map(y => y.item || y.itemRaw));
  if (its.size === 1) { const c = itemColor(list[0].item); const bg = isLight(c) ? shade(c, -0.32) : c; return xs2(st, { fill: { fgColor: { rgb: hexRgb(bg) } }, font: { sz: 9, bold: true, color: { rgb: 'FFFFFF' } }, border: xrBd('FFFFFF') }); }
  return xs2(st, { fill: { fgColor: { rgb: 'EFEFF1' } }, font: { sz: 9, bold: true } });
}
// ---------- ③ 지상파 큐시트 (정산 → 큐시트) ----------
function xrSpotTxt(s, mode) { return spotText(s, mode); }   // 화면 주차 칸과 같은 양식
function xrGroundSheet() {
  const b = XRSheet(xrSheetName(`지상파 큐시트${xrMon()}`), xrTitle('지상파 큐시트'));
  const W = M.weeks, sp = M.spots.filter(s => s.src === '지상파');
  const chs = [...new Set(sp.map(s => s.ch))].sort((a, c) => chOrd(a) - chOrd(c));
  b.widths = [3, 8, 8, 44, 5, 7, 7, 5.5, 5.5, 12.5, 5.5, 12.5, 10, 7, 12.5, 13].concat(W.map(() => 22), [8, 8, 12]);
  b.fit = [1, 2, 4, 5, 6, 7, 12, 13, 15].concat(W.map((_, k) => 16 + k)); b.fitMax = 30;   // 17차: 방송사 · 구분 · 요일 · 시작/종료 · 시급 · CM 순서 · 집행일자 · 주차 칸 글자는 한 줄로
  let r = 3;
  const G = M.gSettle;
  if (G && G.rows.length) {
    b.put(r, 1, '지상파 정산', XRS.sec); b.heights[r] = 26; r++;
    const hdr = ['구분'].concat(G.rows.map(x => x.ch), ['3사 계']);
    const vc = k => 4 + k * 3;
    hdr.forEach((h, k) => { if (k === 0) { b.put(r, 1, h, XRS.head); b.merge(r, 1, r, 3, XRS.head); } else { b.put(r, vc(k - 1), h, XRS.head); b.merge(r, vc(k - 1), r, vc(k - 1) + 2, XRS.head); } }); r++;
    const line = (lab, vals, st) => { b.put(r, 1, lab, st === XRS.cell ? XRS.lab : st); b.merge(r, 1, r, 3, st === XRS.cell ? XRS.lab : st); vals.forEach((v, k) => { b.put(r, vc(k), v, st, '#,##0'); b.merge(r, vc(k), r, vc(k) + 2, st); }); r++; };
    line('송출 (유상)', G.rows.map(x => `${fmt.int(x.cnt)} (${fmt.int(x.paidCnt)})`).concat([`${fmt.int(sum(G.rows, x => x.cnt))} (${fmt.int(sum(G.rows, x => x.paidCnt))})`]), XRS.cell);
    line('유상 금액 (3사 Total)', G.rows.map(x => x.paid).concat([G.paid]), XRS.cell);
    line('CM지정비', G.rows.map(x => Math.round(x.desig)).concat([Math.round(G.desig)]), XRS.cell);
    line('예산', G.rows.map(x => x.budget).concat([G.budget]), XRS.cell);
    line('연계', G.rows.map(() => '').concat([Math.round(G.link)]), XRS.subt);
    line('예비비 (예산 − 유상 − CM지정비 − 연계)', G.rows.map(() => '').concat([Math.round(G.reserve)]), XRS.subt);
    r++;
  }
  b.put(r, 1, '큐시트', XRS.sec); b.heights[r] = 26; r++;
  // 2줄 머리글
  const one = ['방송사', '구분', '프로그램', '요일', '시작', '종료', '시급', '초수', '단가', '횟수', '금액'];
  one.forEach((h, k) => { b.put(r, 1 + k, h, XRS.head); b.merge(r, 1 + k, r + 1, 1 + k, XRS.head); });
  b.put(r, 12, 'CM지정', XRS.head); b.merge(r, 12, r, 14, XRS.head);
  ['CM 순서', '지정율', '지정금액'].forEach((h, k) => b.put(r + 1, 12 + k, h, XRS.head));
  b.put(r, 15, '집행일자', XRS.head); b.merge(r, 15, r + 1, 15, XRS.head);
  W.forEach((w, k) => { b.put(r, 16 + k, `${w.label}차\n${w.range}`, XRS.head); b.merge(r, 16 + k, r + 1, 16 + k, XRS.head); });
  const cA = 16 + W.length;
  b.put(r, cA, 'A.R(%)', XRS.head); b.merge(r, cA, r + 1, cA, XRS.head);
  b.put(r, cA + 1, '예상 효과', XRS.head); b.merge(r, cA + 1, r, cA + 2, XRS.head);
  b.put(r + 1, cA + 1, 'Eq GRP', XRS.head); b.put(r + 1, cA + 2, 'CPRP', XRS.head);
  b.heights[r] = 20; b.heights[r + 1] = 32; r += 2;
  const all = { n: 0, paid: 0, desig: 0, eq: 0, wk: W.map(() => 0) };
  for (const ch of chs) {
    const list = sp.filter(s => s.ch === ch), rows = gCueRows(ch, list), r0 = r;
    rows.forEach(x => {
      const s = x.first, st = x.live || x.cmg === '중CM' ? XRS.bon : XRS.cell;
      const wk = W.map(w => x.spots.filter(y => y.week === w.n));
      const v = [null, x.kspan ? x.kind : '', s.prog + (s.note ? `\n(비고: ${s.note})` : ''), s.dowRaw || s.dow, s.start, s.end, s.grade, s.sec || '', s.price || '', x.spots.length, s.bonus ? '보너스' : x.paid, s.cmRaw, s.rate || '', x.desig ? Math.round(x.desig) : '', x.dates];
      v.forEach((val, k) => { if (k === 0) return; b.put(r, k + 1, val, k === 1 || k === 2 ? xs2(st, { font: { bold: k === 1 } }) : k === 10 && s.bonus ? xs2(st, { font: { color: { rgb: 'B0306A' } } }) : st, k === 12 ? '0%' : '#,##0'); });
      wk.forEach((l, k) => b.put(r, 16 + k, l.map(y => xrSpotTxt(y, 'g')).join('\n'), xrWeekStyle(st, l)));
      b.put(r, cA, x.ar == null ? '' : x.ar, st, '0.0'); b.put(r, cA + 1, x.eq || '', st, '0.0'); b.put(r, cA + 2, x.cprp ? Math.round(x.cprp) : '', st, '#,##0');
      r++;
    });
    rows.forEach((x, i) => { if (x.kspan > 1) b.merge(r0 + i, 2, r0 + i + x.kspan - 1, 2); });
    b.put(r0, 1, ch, XRS.lab); if (r - r0 > 1) b.merge(r0, 1, r - 1, 1, XRS.lab);
    const T = gCueTotal(rows);
    b.put(r, 1, `${ch} 계`, XRS.csub); b.merge(r, 1, r, 9, XRS.csub);
    b.put(r, 10, T.n, XRS.csub); b.put(r, 11, T.paid, XRS.csub); b.put(r, 12, '', XRS.csub); b.put(r, 13, '', XRS.csub); b.put(r, 14, Math.round(T.desig), XRS.csub); b.put(r, 15, '', XRS.csub);
    W.forEach((w, k) => { const n = sum(rows, x => x.spots.filter(y => y.week === w.n).length); all.wk[k] += n; b.put(r, 16 + k, n, XRS.csub); });
    b.put(r, cA, '', XRS.csub); b.put(r, cA + 1, T.eq, XRS.csub, '0.0'); b.put(r, cA + 2, T.cprp ? Math.round(T.cprp) : '-', XRS.csub);
    all.n += T.n; all.paid += T.paid; all.desig += T.desig; all.eq += T.eq || 0;
    r++;
  }
  if (chs.length > 1) {
    b.put(r, 1, '3사 계', XRS.ctot); b.merge(r, 1, r, 9, XRS.ctot);
    b.put(r, 10, all.n, XRS.ctot); b.put(r, 11, all.paid, XRS.ctot); b.put(r, 12, '', XRS.ctot); b.put(r, 13, '', XRS.ctot); b.put(r, 14, Math.round(all.desig), XRS.ctot); b.put(r, 15, '', XRS.ctot);
    W.forEach((w, k) => b.put(r, 16 + k, all.wk[k], XRS.ctot));
    b.put(r, cA, '', XRS.ctot); b.put(r, cA + 1, all.eq, XRS.ctot, '0.0'); b.put(r, cA + 2, all.eq ? Math.round((all.paid + all.desig) / all.eq) : '-', XRS.ctot); r++;
  }
  return b;
}

// ---------- ④ 케이블 큐시트 — 16차: PP마다 시트 하나 · 채널마다 예산표(품목·예산·횟수·보너스·보너스율·집행 기간·소재) → 큐시트 ----------
function xrCableSheets() {
  const sp = M.spots.filter(s => s.src === '케이블');
  const chs = [...new Set(sp.map(s => s.ch))].sort((a, c) => chOrd(a) - chOrd(c));
  const ppOf = ch => { const c = M.MS.chByName.get(ch); return c ? c.mpp : '기타'; };
  const pps = [...new Set(chs.map(ppOf))];
  if (!pps.length) return [xrCableSheet([], '')];
  return pps.map(pp => xrCableSheet(chs.filter(c => ppOf(c) === pp), pp));
}
function xrCableSheet(chs, pp) {
  const b = XRSheet(xrSheetName(`케이블 큐시트${xrMon()}${pp ? ' ' + pp : ''}`), xrTitle(`케이블 큐시트${pp ? ' · ' + pp : ''}`));
  const W = M.weeks, sp = M.spots.filter(s => s.src === '케이블');
  // 열: B 본방 · C 프로그램명 · D 요일 · E 시작 · F 종료 · G 시급 · H 횟수 · I~ 주차
  b.widths = [3, 6, 38, 6, 7, 7, 6, 6].concat(W.map(() => 24));
  const wc = 8, last = 7 + W.length;
  let r = 3;
  b.fit = [1, 3, 4, 5, 6].concat(W.map((_, k) => wc + k)); b.fitMax = 30;   // 17차: 본방 · 요일 · 시작/종료 · 시급 · 주차 칸 글자는 한 줄로
  if (!chs.length) { b.put(r, 1, '케이블 송출이 없어요', XRS.note); return b; }
  for (const ch of chs) {
    const list = sp.filter(s => s.ch === ch);
    const cc = M.cells.filter(c => c.ch === ch && (c.budget || c.cnt));
    if (ch !== chs[0]) r++;
    b.put(r, 1, `${ch}  ·  ${fmt.int(sum(list, s => s.cnt))}회 · 예산 ${fmt.eok(sum(cc, c => c.budget), 2)} · 보너스 ${fmt.eok(sum(cc, c => c.bonus), 2)}`, XRS.sec); b.heights[r] = 26; r++;
    // 예산표: [B~C 품목] [D~F 예산] [G~H 횟수] [I 보너스] [J 보너스율] [K 집행 기간] [L~ 소재]
    const cols = [[1, 2, '품목'], [3, 5, '예산'], [6, 7, '횟수'], [wc, wc, '보너스'], [wc + 1, wc + 1, '보너스율'], [wc + 2, wc + 2, '집행 기간'], [wc + 3, Math.max(wc + 3, last), '소재']];
    const put = (c1, c2, v, st, z) => { b.put(r, c1, v, st, z); if (c2 > c1) b.merge(r, c1, r, c2, st); };
    cols.forEach(([c1, c2, h]) => put(c1, c2, h, XRS.head)); b.heights[r] = 22; r++;
    for (const c of cc) {
      const cs = M.creatives.filter(x => x.item === c.item);
      const vals = [c.item, c.budget, c.cnt, c.bonus, c.rate, [...new Set(cs.map(x => x.period))].join(', '), cs.map(x => x.cre + (x.cshare ? ` ${fmt.pct(x.cshare)}` : '')).join(' : ')];
      cols.forEach(([c1, c2], k) => put(c1, c2, vals[k] == null ? '' : vals[k], k === 0 ? xs2(XRS.lab, { font: { color: { rgb: hexRgb(xrItemInk(c.item)) } } }) : k === 6 ? xs2(XRS.cell, { alignment: { horizontal: 'left', indent: 1 } }) : XRS.cell, k === 4 ? '0%' : '#,##0'));
      r++;
    }
    const B = sum(cc, c => c.budget), X = sum(cc, c => c.bonus);
    [['계'], [B], [sum(cc, c => c.cnt)], [X], [B ? X / B : ''], [''], ['']].forEach(([v], k) => put(cols[k][0], cols[k][1], v, XRS.subt, k === 4 ? '0%' : '#,##0')); r++;
    r++;
    // 큐시트
    ['본방', '프로그램명', '요일', '시작', '종료', '시급', '횟수'].forEach((h, k) => b.put(r, 1 + k, h, XRS.head));
    W.forEach((w, k) => b.put(r, wc + k, `${w.label}차\n${w.range}`, XRS.head)); b.heights[r] = 30; r++;
    for (const x of cableRows(ch, list)) {
      const s = x.first, st = x.live ? XRS.bon : XRS.cell; const wk = W.map(w => x.spots.filter(y => y.week === w.n));
      [x.live ? (/생방/.test(s.prog) && !/본방/.test(s.prog) ? '생방' : '본방') : '', s.prog, s.dowRaw || s.dow, s.start, s.end, s.grade, sum(x.spots, y => y.cnt)].forEach((v, k) => b.put(r, 1 + k, v, k === 0 && v ? xs2(st, { font: { bold: true, color: { rgb: 'E0005A' } } }) : k === 1 ? xs2(st, { alignment: { horizontal: 'left', indent: 1 } }) : st));
      wk.forEach((l, k) => b.put(r, wc + k, l.map(y => xrSpotTxt(y, 'c') + (y.cnt > 1 ? ` ×${y.cnt}` : '')).join('\n'), xrWeekStyle(st, l)));
      r++;
    }
    b.put(r, 1, `${ch} 계`, XRS.csub); b.merge(r, 1, r, 6, XRS.csub); b.put(r, 7, sum(list, s => s.cnt), XRS.csub);
    W.forEach((w, k) => b.put(r, wc + k, sum(list.filter(s => s.week === w.n), s => s.cnt), XRS.csub)); r++;
  }
  return b;
}
// 품목 글자색: 품목 색(너무 밝으면 어둡게)
function xrItemInk(item) { const c = itemColor(item); return isLight(c) ? shade(c, -0.38) : c; }

// ---------- ⑤ 소재 운영 ----------
function xrCreSheet() {
  const b = XRSheet('소재 운영', xrTitle('소재 운영'));
  b.widths = [3, 14, 16, 7, 22, 10, 10, 12, 16, 30];
  let r = 3;
  b.fit = [1, 2, 3, 4, 5, 6, 7, 8];   // 17차: 품목 · 운영기간 · 초수 · 소재 · 비중 · 심의번호는 한 줄로
  ['품목', '운영기간', '초수', '소재', '금액 비중', '횟수 비중', '지상파 실제', '심의번호', '비고'].forEach((h, k) => b.put(r, 1 + k, h, XRS.head)); b.heights[r] = 22; r++;
  const cr = M.creatives; const by = groupBy(cr, c => c.item || c.itemRaw);
  const pool = groupBy(M.spots.filter(s => s.src === '지상파' && s.item), s => s.item);
  for (const [k, l] of by) {
    const r0 = r, fill = xs2(XRS.lab, { fill: { fgColor: { rgb: hexRgb(itemLight(k)) } } });
    for (const c of l) {
      const p = pool.get(k) || []; const hit = p.filter(s => creMatch(c.cre, s.cre)).length;
      [c.period, c.sec ? c.sec + '초' : '', c.cre, c.share == null ? '' : c.share, c.cshare == null ? '' : c.cshare, p.length ? hit / p.length : '', c.reg, c.note].forEach((v, j) => b.put(r, 2 + j, v, XRS.cell, j === 3 || j === 4 || j === 5 ? '0%' : '#,##0'));
      r++;
    }
    b.put(r0, 1, k, fill); if (r - r0 > 1) b.merge(r0, 1, r - 1, 1, fill);
    const pl = M.secPlanOf(k), sh = l.filter(c => c.share != null);
    b.put(r, 1, `${k} 계`, XRS.subt); b.merge(r, 1, r, 4, XRS.subt);
    b.put(r, 5, sh.length ? sum(sh, c => c.share) : '', XRS.subt, '0%'); b.put(r, 6, l.some(c => c.cshare != null) ? sum(l, c => c.cshare || 0) : '', XRS.subt, '0%');
    b.put(r, 7, '', XRS.subt); b.put(r, 8, '', XRS.subt);
    b.put(r, 9, pl && Object.keys(pl.shares).length > 1 ? `GRP 계산 초수 비중: ${Object.entries(pl.shares).map(([s2, v]) => `${s2}초 ${fmt.pct(v)}`).join(' · ')}` : '', XRS.subt); r++;
  }
  return b;
}

// ---------- ⑥ 큐시트 캘린더 (M월) — 16차: 날짜 머리 = 진한 회색·흰 글자 · 품목 = 품목 색 글자(바탕 없음) · 프로그램 = 왼쪽 정렬, 줄바꿈 없이 넘치면 잘림 · 날짜 칸 안쪽 선 없음(바깥 테두리만) ----------
function xrCalSheet(weeks) {
  weeks = weeks || calGrid(M.spots.filter(s => s.day && (s.chRaw || s.prog)));
  const b = XRSheet(xrSheetName(`큐시트 캘린더${xrMon()}`), xrTitle('큐시트 캘린더'));
  const per = [5.5, 9, 9, 21, 6.5], NC = per.length;   // 시간 · 채널 · 품목 · 프로그램 · CM
  b.widths = [3].concat(CAL_WD.flatMap(() => per));
  const OUT = 'A8A8AD', bdS = { style: 'thin', color: { rgb: OUT } }, none = { style: 'thin', color: { rgb: 'FFFFFF' } };
  const base = { font: { name: XRF, sz: 9, color: { rgb: '262626' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: false } };
  const box = (j, lastRow, fill) => { const o = JSON.parse(JSON.stringify(base)); o.border = { left: j === 0 ? bdS : none, right: j === NC - 1 ? bdS : none, top: none, bottom: lastRow ? bdS : none }; if (fill) o.fill = { fgColor: { rgb: fill } }; return o; };
  let r = 3;
  CAL_WD.forEach((w, i) => { const c = 1 + i * NC; const st = xs2(XRS.head, { fill: { fgColor: { rgb: i >= 5 ? '5A2B3A' : '2C2C2E' } } }); b.put(r, c, w, st); b.merge(r, c, r, c + NC - 1, st); }); b.heights[r] = 22; r++;
  for (const wk of weeks) {
    wk.forEach((c, i) => {
      const cc = 1 + i * NC;
      const st = c ? xs2(XRS.head, { fill: { fgColor: { rgb: i >= 5 ? '7A3E4B' : '4E4E52' } }, alignment: { horizontal: 'left', indent: 1, wrapText: false }, border: xrBd(OUT) }) : xs2(XRS.cell, { fill: { fgColor: { rgb: 'F4F4F5' } }, border: xrBd(OUT) });
      b.put(r, cc, c ? `${M.ym.m}/${c.d}${c.n ? `  ·  ${c.n}회` : ''}` : '', st); b.merge(r, cc, r, cc + NC - 1, st);
    });
    b.heights[r] = 20; r++;
    const mx = Math.max(1, ...wk.map(c => c ? c.list.length : 0));
    for (let k = 0; k < mx; k++) {
      const lastRow = k === mx - 1;
      wk.forEach((c, i) => {
        const e = c && c.list[k], cc = 1 + i * NC;
        if (!e) { for (let j = 0; j < NC; j++) b.put(r, cc + j, j === 3 ? ' ' : '', box(j, lastRow, c ? null : 'F4F4F5')); return; }
        const mid = e.cmCls === '중CM', fill = mid ? 'FCEEF4' : null;
        const nm = e.item || e.itemRaw || '';
        b.put(r, cc, e.st, xs2(box(0, lastRow, fill), { font: { color: { rgb: '616161' } } }));
        b.put(r, cc + 1, e.ch, xs2(box(1, lastRow, fill), { font: { bold: true } }));
        b.put(r, cc + 2, nm, xs2(box(2, lastRow, fill), { font: { bold: true, color: { rgb: hexRgb(nm && M.MS.items.has(e.item) ? xrItemInk(e.item) : '#616161') } } }));
        b.put(r, cc + 3, e.prog + (e.n > 1 ? ` ×${e.n}` : ''), xs2(box(3, lastRow, fill), { alignment: { horizontal: 'left', indent: 1, wrapText: false } }));
        b.put(r, cc + 4, e.cm || ' ', mid ? xs2(box(4, lastRow, fill), { font: { bold: true, color: { rgb: 'E0005A' } } }) : box(4, lastRow, fill));   // 빈 칸이면 공백을 넣어 프로그램 글자가 넘어가지 않고 잘리게
      });
      b.heights[r] = 16; r++;
    }
  }
  return b;
}

// ---------- ⑦ 전체 큐시트 (M월) — 1행 = 1회 송출, 날짜 → 시작 시간 순 (광고주 제공용 결과 데이터) ----------
function xrCueAllSheet() {
  const b = XRSheet(xrSheetName(`전체 큐시트${xrMon()}`), xrTitle('전체 큐시트'));
  const rows = cueAllRows();
  const cols = [['media', '구분', 7], ['ch', '방송사', 14], ['item', '품목', 13], ['prog', '편성명', 44], ['date', '날짜', 11], ['dow', '요일', 5], ['start', '시작시간', 8], ['end', '종료시간', 8], ['sec', '초수', 5], ['cre', '소재', 16], ['cm', 'CM 위치', 12]];
  b.widths = [3, 6].concat(cols.map(c => c[2]));
  let r = 3;
  b.fit = [3, 4, 7, 8, 9, 10, 11, 12]; b.fitMax = 40;   // 17차: 방송사 · 품목 · 소재 · CM 위치 한 줄로
  const h0 = r;
  ['No'].concat(cols.map(c => c[1])).forEach((h, k) => b.put(r, 1 + k, h, XRS.head)); b.heights[r] = 22; r++;
  const serial = d => (Date.UTC(M.ym.y, M.ym.m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
  const nw = xs2(XRS.cell, { alignment: { wrapText: false } }), lw = xs2(nw, { alignment: { horizontal: 'left', indent: 1 } });
  rows.forEach((s, i) => {
    b.put(r, 1, i + 1, nw, '0');
    cols.forEach(([k], j) => {
      const c = 2 + j;
      if (k === 'date') b.put(r, c, s.day ? serial(s.day) : '', nw, 'yyyy-mm-dd');
      else if (k === 'sec') b.put(r, c, s.sec ? +s.sec : '', nw, '0');
      else if (k === 'item') b.put(r, c, cueAllVal(s, k), M.MS.items.has(s.item) ? xs2(nw, { font: { bold: true, color: { rgb: hexRgb(xrItemInk(s.item)) } } }) : nw);
      else b.put(r, c, cueAllVal(s, k), k === 'prog' || k === 'cre' ? lw : nw);
    });
    r++;
  });
  b.autofilter = XLSX.utils.encode_range({ s: { r: h0, c: 1 }, e: { r: Math.max(h0, r - 1), c: 1 + cols.length } });
  return b;
}

// ---------- 다시 넣기용 데이터 (숨김 시트) ----------
function xrDataSheets(which) {
  const sheets = workspaceSheets(WS, M, which);
  const all = which.length === ALL_SHEETS.length;
  if (all && Object.keys(WS.reach || {}).length) sheets.push(reachSheet(WS));
  if (all && Object.keys(WS.opsNotes || {}).length) sheets.push(notesSheet(WS));
  if (all && Object.keys(WS.opsReach || {}).length) sheets.push(reachOvSheet(WS));
  if ((all || which.includes('소재')) && Object.keys(WS.secPlan || {}).length) sheets.push(secPlanSheet(WS));
  if (all && Object.keys(WS.opsCurve || {}).length) sheets.push(opsCurveSheet(WS));
  if (all && Object.keys(WS.reviewOk || {}).length) sheets.push({ name: '확인함', aoa: [['확인 필요에서 괜찮다고 체크한 항목 (키)']].concat(Object.keys(WS.reviewOk).map(k => [k])), widths: [80] });
  if (which.includes('케이블') && Object.keys(WS.cueOrder || {}).length) sheets.push(cueOrderSheet(WS));
  sheets.push(metaSheet(WS, which));
  return sheets;
}
// 머리말 ⤓ '큐시트 엑셀 받기' (16차: 하나뿐 · 17차: 예산표 시트 뺌 — 운영 요약의 예산 표와 같음) — 보고용 시트 + 숨김 데이터(관리자만, 이 파일을 ＋로 그대로 다시 넣을 수 있음)
function xrReportBuilders() { return [xrOpsSheet(), xrCreSheet(), xrCalSheet(), xrGroundSheet()].concat(xrCableSheets(), [xrCueAllSheet()]); }
function xrFullBytes(noData) { return xrBookBytes(xrReportBuilders(), noData ? null : xrDataSheets(ALL_SHEETS)); }
function downloadFullReport() {
  try { saveBlob(new Blob([xrFullBytes(readOnly())], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), xrFileName()); App.toast('큐시트 엑셀을 내려받았어요'); }
  catch (e) { console.error(e); App.toast('엑셀을 만들지 못했어요: ' + esc(e.message || e), 6000); }
}
