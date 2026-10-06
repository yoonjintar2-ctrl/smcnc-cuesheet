// ===== 19-xlreport.js : 보고용 엑셀 =====
// 모든 시트 공통: 눈금선 없음 · A열 여백(너비 3) · 1·3행 높이 2(비움) · 2행 = 시트 제목 · 값은 가운데 정렬 · 엑셀 차트(웹 그래프를 엑셀 차트로)
// '큐시트 엑셀 받기' = 운영 요약 · 예산표 · 지상파 큐시트 · 케이블 큐시트 · 소재 운영 (+ 다시 넣기용 데이터는 숨김 시트)
const XRF = '맑은 고딕';
const ZF = '#,##0;-#,##0;"-"';   // 0은 '-'로
function xrBd(c, w) { const s = { style: w || 'thin', color: { rgb: c } }; return { top: s, bottom: s, left: s, right: s }; }
function xs2(base, extra) { const o = JSON.parse(JSON.stringify(base)); for (const k in extra || {}) o[k] = Object.assign({}, o[k] || {}, extra[k]); return o; }
const XRS = (() => {
  const cell = { font: { name: XRF, sz: 10, color: { rgb: '1D2833' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: xrBd('DFE4E9') };
  return {
    title: { font: { name: XRF, sz: 16, bold: true, color: { rgb: '1D2833' } }, alignment: { horizontal: 'left', vertical: 'center' } },
    sec: { font: { name: XRF, sz: 12, bold: true, color: { rgb: '2B4256' } }, alignment: { horizontal: 'left', vertical: 'center' } },
    sec2: { font: { name: XRF, sz: 10, bold: true, color: { rgb: '3F5B73' } }, alignment: { horizontal: 'left', vertical: 'center' } },
    note: { font: { name: XRF, sz: 9, color: { rgb: '8794A0' } }, alignment: { horizontal: 'left', vertical: 'center' } },
    head: { font: { name: XRF, sz: 10, bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '2F4659' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: xrBd('5A7085') },
    cell,
    lab: xs2(cell, { font: { bold: true }, fill: { fgColor: { rgb: 'F7F9FA' } } }),
    grp: xs2(cell, { font: { bold: true, color: { rgb: '2B4256' } }, fill: { fgColor: { rgb: 'EEF2F6' } } }),
    subt: xs2(cell, { font: { bold: true, color: { rgb: '2B4256' } }, fill: { fgColor: { rgb: 'DFE7EF' } }, border: xrBd('C5D2DE') }),
    tot: xs2(cell, { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '3F5B73' } }, border: xrBd('3F5B73') }),
    bon: xs2(cell, { fill: { fgColor: { rgb: 'FCEEF4' } } }),
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
function xrToSheet(b) {
  const ws = {};
  for (const [k, x] of b.cells) {
    const [r, c] = k.split(',').map(Number);
    const isN = typeof x.v === 'number' && isFinite(x.v);
    const cell = isN ? { t: 'n', v: x.v, z: x.z || '#,##0' } : { t: 's', v: x.v == null ? '' : String(x.v) };
    cell.s = x.s || XRS.cell;
    ws[XLSX.utils.encode_cell({ r, c })] = cell;
  }
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: b.maxR + 1, c: b.maxC } });
  ws['!cols'] = Array.from({ length: b.maxC + 1 }, (_, c) => ({ wch: b.widths[c] || 12 }));
  // 모든 줄 높이를 정해 둠 (엑셀·리브레오피스가 줄 높이를 다시 계산해 차트 위치가 표와 겹치지 않게)
  ws['!rows'] = []; for (let r = 0; r <= b.maxR + 1; r++) ws['!rows'][r] = { hpt: b.heights[r] != null ? b.heights[r] : (r >= 3 ? 18 : 15) };
  ws['!merges'] = b.merges;
  return ws;
}

// ---------- 엑셀 차트 (DrawingML) ----------
function xmlEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
const xrHex = h => String(h || '#8794a0').replace('#', '').toUpperCase().slice(0, 6);
function xrTx(sz, color, bold) { return `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${bold ? 1 : 0}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${XRF}"/><a:ea typeface="${XRF}"/></a:defRPr></a:pPr><a:endParaRPr lang="ko-KR"/></a:p></c:txPr>`; }
function xrFill(hex) { return `<c:spPr><a:solidFill><a:srgbClr val="${xrHex(hex)}"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr>`; }
function xrStrLit(list) { return `<c:strLit><c:ptCount val="${list.length}"/>${list.map((v, i) => `<c:pt idx="${i}"><c:v>${xmlEsc(v)}</c:v></c:pt>`).join('')}</c:strLit>`; }
function xrNumLit(list, fmt) { return `<c:numLit><c:formatCode>${xmlEsc(fmt || 'General')}</c:formatCode><c:ptCount val="${list.length}"/>${list.map((v, i) => v == null || !isFinite(v) ? '' : `<c:pt idx="${i}"><c:v>${+v}</c:v></c:pt>`).join('')}</c:numLit>`; }
// sp: { type:'bar'|'doughnut', dir:'bar'|'col', group:'clustered'|'stacked', title, cats:[], series:[{name, color, vals:[], pts:[색…]}], fmt, labels:true, legend:'b'|'r'|null, hole }
function xrChart(sp) {
  const fmt = sp.fmt || '#,##0';
  const dl = (show, pos) => show ? `<c:dLbls><c:numFmt formatCode="${xmlEsc(sp.type === 'doughnut' ? '0%' : fmt)}" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${xrTx(sp.lblSz || 800, sp.lblColor || (sp.type === 'doughnut' || sp.group === 'stacked' ? 'FFFFFF' : '55636F'), true)}${pos ? `<c:dLblPos val="${pos}"/>` : ''}<c:showLegendKey val="0"/><c:showVal val="${sp.type === 'doughnut' ? 0 : 1}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${sp.type === 'doughnut' ? 1 : 0}"/><c:showBubbleSize val="0"/>${sp.type === 'doughnut' ? '<c:showLeaderLines val="0"/>' : ''}</c:dLbls>` : '<c:dLbls><c:delete val="1"/></c:dLbls>';
  // 칸 색이 진하면 흰 글자, 옅으면 진한 글자 (점마다)
  const inkOf = hex => { const c = hexToRgb('#' + xrHex(hex)) || [128, 128, 128]; return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255 > 0.6 ? '1D2833' : 'FFFFFF'; };
  const ptLbls = (s, pos) => (sp.type === 'doughnut' || sp.group === 'stacked') && s.pts ? s.pts.map((col, k) => col ? `<c:dLbl><c:idx val="${k}"/><c:numFmt formatCode="${xmlEsc(sp.type === 'doughnut' ? '0%' : fmt)}" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${xrTx(sp.lblSz || 800, inkOf(col), true)}${pos ? `<c:dLblPos val="${pos}"/>` : ''}<c:showLegendKey val="0"/><c:showVal val="${sp.type === 'doughnut' ? 0 : 1}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${sp.type === 'doughnut' ? 1 : 0}"/><c:showBubbleSize val="0"/></c:dLbl>` : '').join('') : '';
  const dl2 = (s, show, pos) => show ? dl(true, pos).replace('<c:dLbls>', '<c:dLbls>' + ptLbls(s, pos)) : dl(false);
  const ser = (s, i) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${xmlEsc(s.name)}</c:v></c:tx>${xrFill(s.color)}${sp.type === 'bar' ? '<c:invertIfNegative val="0"/>' : ''}${(s.pts || []).map((col, k) => col ? `<c:dPt><c:idx val="${k}"/>${sp.type === 'bar' ? '<c:invertIfNegative val="0"/><c:bubble3D val="0"/>' : '<c:bubble3D val="0"/>'}${xrFill(col)}</c:dPt>` : '').join('')}${dl2(s, sp.labels !== false && s.labels !== false, sp.type === 'bar' ? (sp.group === 'stacked' ? 'ctr' : 'outEnd') : null)}<c:cat>${xrStrLit(sp.cats)}</c:cat><c:val>${xrNumLit(s.vals, fmt)}</c:val></c:ser>`;
  let plot;
  if (sp.type === 'doughnut') {
    plot = `<c:doughnutChart><c:varyColors val="1"/>${sp.series.map(ser).join('')}<c:firstSliceAng val="0"/><c:holeSize val="${sp.hole || 58}"/></c:doughnutChart>`;
  } else {
    const ax = (id, cross, pos, cat) => cat
      ? `<c:catAx><c:axId val="${id}"/><c:scaling><c:orientation val="${sp.dir === 'bar' ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${pos}"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="C9D1D9"/></a:solidFill></a:ln></c:spPr>${xrTx(900, '55636F', false)}<c:crossAx val="${cross}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
      : `<c:valAx><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="${sp.hideVal ? 1 : 0}"/><c:axPos val="${pos}"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="ECEFF2"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="${xmlEsc(fmt)}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${xrTx(800, '8794A0', false)}<c:crossAx val="${cross}"/><c:crosses val="${sp.dir === 'bar' ? 'max' : 'autoZero'}"/><c:crossBetween val="between"/></c:valAx>`;
    plot = `<c:barChart><c:barDir val="${sp.dir || 'col'}"/><c:grouping val="${sp.group || 'clustered'}"/><c:varyColors val="0"/>${sp.series.map(ser).join('')}<c:gapWidth val="${sp.gap || 60}"/>${sp.group === 'stacked' ? '<c:overlap val="100"/>' : '<c:overlap val="-10"/>'}<c:axId val="5001"/><c:axId val="5002"/></c:barChart>`
      + ax(5001, 5002, sp.dir === 'bar' ? 'l' : 'b', true) + ax(5002, 5001, sp.dir === 'bar' ? 't' : 'l', false);
  }
  const title = sp.title ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1100" b="1"/></a:pPr><a:r><a:rPr lang="ko-KR" sz="1100" b="1"><a:solidFill><a:srgbClr val="1D2833"/></a:solidFill><a:latin typeface="${XRF}"/><a:ea typeface="${XRF}"/></a:rPr><a:t>${xmlEsc(sp.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>` : '<c:autoTitleDeleted val="1"/>';
  const legend = sp.legend ? `<c:legend><c:legendPos val="${sp.legend}"/><c:overlay val="0"/>${xrTx(900, '55636F', false)}</c:legend>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart>${title}<c:plotArea><c:layout/>${plot}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="DFE4E9"/></a:solidFill></a:ln></c:spPr>${xrTx(900, '55636F', false)}</c:chartSpace>`;
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
const xrName = what => `${advName()}TV큐시트_${WS.ym.replace('-', '')}_${what}_${fmt.stamp()}.xlsx`;
const xrTitle = what => `${advName()} ${M.ym ? M.ym.m + '월' : WS.ym} TV ${what}`;

// ---------- 표 쓰기 ----------
// 계층 표(구분·PP·채널 + 값 열): table1 / tableCnt 결과 → 시트. 묶음 머리글(groups)이 있으면 2줄 머리글
function xrHierTable(b, r0, c0, T, numFmt) {
  const nv = T.head.length - 3; let r = r0;
  const gs = new Set(); if (T.groups) { let j = 0; for (const [, n] of T.groups) { gs.add(j); j += n; } }
  const gEdge = (s, j) => gs.has(j) && j > 0 ? xs2(s, { border: { left: { style: 'medium', color: { rgb: '6F8296' } } } }) : s;
  if (T.groups) {
    for (let k = 0; k < 3; k++) { b.put(r, c0 + k, T.head[k] === 'MPP' ? 'PP' : T.head[k], XRS.head); b.merge(r, c0 + k, r + 1, c0 + k, XRS.head); }
    let j = 0; for (const [g, n] of T.groups) { b.put(r, c0 + 3 + j, g, gEdge(XRS.head, j)); b.merge(r, c0 + 3 + j, r, c0 + 3 + j + n - 1, XRS.head); j += n; }
    T.head.slice(3).forEach((h, k) => b.put(r + 1, c0 + 3 + k, T.headSub && T.headSub[k] ? `${h}\n${T.headSub[k]}` : h, gEdge(XRS.head, k)));
    b.heights[r + 1] = T.headSub ? 30 : 20; r += 2;
  } else { T.head.forEach((h, k) => b.put(r, c0 + k, h === 'MPP' ? 'PP' : h, XRS.head)); b.heights[r] = 22; r += 1; }
  const { s0, s1 } = spans(T.rows);
  T.rows.forEach((row, i) => {
    const st = row.t === 'sub' ? XRS.subt : row.t === 'tot' ? XRS.tot : XRS.cell;
    if (row.t === 'row') {
      if (s0[i]) { b.put(r, c0, row.lab[0], XRS.lab); if (s0[i] > 1) b.merge(r, c0, r + s0[i] - 1, c0, XRS.lab); }
      if (s1[i]) { b.put(r, c0 + 1, row.lab[1], XRS.lab); if (s1[i] > 1) b.merge(r, c0 + 1, r + s1[i] - 1, c0 + 1, XRS.lab); }
      b.put(r, c0 + 2, row.lab[2], XRS.cell);
    } else { b.put(r, c0, row.lab[0], st); b.merge(r, c0, r, c0 + 2, st); }
    row.vals.forEach((v, j) => b.put(r, c0 + 3 + j, v == null ? '-' : v, gEdge(st, j), numFmt(j, v)));
    r++;
  });
  return { r, c1: c0 + 2 + nv };
}

// ---------- ① 운영 요약 (운영 요약 표 → 예산 및 보너스 표·차트 → 송출 횟수 표·차트) ----------
function xrOpsSheet(only) {
  const cells = M.cells, items = itemsIn(cells);
  const b = XRSheet('운영 요약', xrTitle(only === 't1' ? '예산 및 보너스' : only === 'tc' ? '송출 횟수' : '운영 요약'));
  b.widths = [3, 12, 18, 14].concat(Array(30).fill(15));
  const Tc = tableCnt(cells, 'all');
  const LAST = Math.max(3 + Tc.head.length - 3, 3 + table1(cells, 'budget').head.length - 3, 16);
  let r = 3;
  const secRow = (t, note) => { b.put(r, 1, t, XRS.sec); if (note) { b.put(r, 4, note, XRS.note); } b.heights[r] = 26; r++; };
  // 운영 요약 표
  if (!only || only === 'ops') {
    const meta = WS.reachMeta || {};
    secRow('운영 요약', `GRP = 예산 ÷ 목표 CPRP(15초 기준) × 초수 환산 · eq.GRP = 15초 환산 GRP · 리치 기준 ${meta.target || '아리아나 누적리치'}${meta.period ? ' (' + meta.period + ')' : ''}`);
    const head = ['품목 카테고리', '품목', '방송사', '예산(억원)', '횟수', 'GRP', 'eq.GRP', 'R1+(%)', 'R3+(%)', '주요 프로그램'];
    head.forEach((h, k) => b.put(r, 1 + k, h, XRS.head)); b.merge(r, 10, r, LAST, XRS.head); b.heights[r] = 22; r++;
    for (const o of M.ops) {
      const r0 = r, fill = { fill: { fgColor: { rgb: hexRgb(itemLight(o.item)) } } };
      o.rows.forEach(x => {
        const txt = x.manual ? x.progs : progsText(x.autoList || [], 75);
        if (txt.length > 80) b.heights[r] = 17 * Math.ceil(txt.length / 80) + 2;
        [x.budget / 1e8, x.cnt, x.grp, x.eq, x.r1, x.r3].forEach((v, k) => b.put(r, 4 + k, v == null ? '-' : v, XRS.cell, ['0.00', '#,##0', '0.0', '0.0', '0.0', '0.0'][k]));
        b.put(r, 3, x.group, XRS.cell); b.put(r, 10, txt, XRS.cell); b.merge(r, 10, r, LAST, XRS.cell); r++;
      });
      b.put(r0, 1, o.cat, XRS.lab); b.put(r0, 2, o.full, xs2(XRS.lab, fill)); if (o.rows.length > 1) { b.merge(r0, 1, r - 1, 1, XRS.lab); b.merge(r0, 2, r - 1, 2, xs2(XRS.lab, fill)); }
      const t = o.total;
      b.put(r, 1, '', XRS.subt); b.put(r, 2, o.full + ' 요약', XRS.subt); b.put(r, 3, t.group, XRS.subt);
      [t.budget / 1e8, t.cnt, t.grp, t.eq, t.r1, t.r3].forEach((v, k) => b.put(r, 4 + k, v == null ? '-' : v, XRS.subt, ['0.00', '#,##0', '0.0', '0.0', '0.0', '0.0'][k]));
      b.put(r, 10, '', XRS.subt); b.merge(r, 10, r, LAST, XRS.subt); r++;
    }
    const T = { budget: sum(M.ops, o => o.total.budget), cnt: sum(M.ops, o => o.total.cnt), grp: sum(M.ops, o => o.total.grp), eq: sum(M.ops, o => o.total.eq) };
    b.put(r, 1, '합계', XRS.tot); b.merge(r, 1, r, 3, XRS.tot);
    [T.budget / 1e8, T.cnt, T.grp, T.eq, '', ''].forEach((v, k) => b.put(r, 4 + k, v, XRS.tot, ['0.00', '#,##0', '0.0', '0.0'][k]));
    b.put(r, 10, '', XRS.tot); b.merge(r, 10, r, LAST, XRS.tot); r += 2;
  }
  // 예산 및 보너스
  if (!only || only === 't1') {
    secRow('예산 및 보너스', '원, VAT 별도 · 보너스 = 예산+보너스(밸류) − 예산');
    for (const [m, t] of [['budget', '예산 (원)'], ['bonus', '보너스 (원)'], ['value', '예산+보너스 (원)'], ['rate', '보너스율']]) {
      b.put(r, 1, t, XRS.sec2); b.heights[r] = 20; r++;
      const o = xrHierTable(b, r, 1, table1(cells, m), () => m === 'rate' ? '0%' : ZF); r = o.r + 1;
    }
    // 차트: 품목별 예산·보너스 (억) · 방송사별 예산 비중
    const iv = items.map(k => { const cc = cells.filter(c => c.item === k); return { k, b: sum(cc, c => c.budget) / 1e8, x: sum(cc, c => c.bonus) / 1e8 }; });
    const H = Math.max(16, items.length * 2 + 6);
    b.chart(xrChart({ type: 'bar', dir: 'bar', group: 'stacked', title: '품목별 예산·보너스 (억원)', cats: iv.map(x => x.k), fmt: '0.0', legend: 'b', gap: 45,
      series: [{ name: '예산', color: '#3f5b73', vals: iv.map(x => x.b), pts: iv.map(x => itemColor(x.k)) }, { name: '보너스', color: '#c9d4de', vals: iv.map(x => x.x), pts: iv.map(x => itemLight(x.k)), labels: true }], lblColor: '1D2833' }), 1, r, 8, r + H);
    const steps = [0, 0.18, 0.34, 0.48, 0.6, 0.7, 0.78];
    const gv = SUM_GROUPS.map((g, i) => ({ g, v: sum(cells.filter(c => c.group === g), c => c.budget), col: i === 0 ? '#3f5b73' : tint('#3f5b73', steps[i] || 0.8) })).filter(x => x.v > 0);
    b.chart(xrChart({ type: 'doughnut', title: '방송사별 예산 비중', cats: gv.map(x => x.g), legend: 'r', series: [{ name: '예산', color: '#3f5b73', vals: gv.map(x => x.v), pts: gv.map(x => x.col) }] }), 9, r, 15, r + H);
    r += H + 2;
  }
  // 송출 횟수
  if (!only || only === 'tc') {
    secRow('송출 횟수', '주차별 송출수 · 소재 길이 · 주말 여부 · CM 위치별 비중');
    const o = xrHierTable(b, r, 1, Tc, j => Tc.pctCols.includes(j) ? '0%' : ZF); r = o.r + 1;
    const W = M.weeks, H = 17;
    b.chart(xrChart({ type: 'bar', dir: 'col', group: 'stacked', title: '주차별 송출 (품목별)', cats: W.map(w => `${w.n}주 (${w.range})`), legend: 'b', gap: 55, labels: false,
      series: items.map(k => ({ name: k, color: itemColor(k), vals: W.map((_, i) => sum(cells.filter(c => c.item === k), c => c.wk[i])) })) }), 1, r, 9, r + H);
    const cmd = m => { const A = aggCells(cells.filter(c => c.media === m)); const mid = A.cmc.중CM || 0, pib = A.cmc.PIB || 0; return { n: A.cnt, v: [mid, pib, A.cnt - mid - pib] }; };
    let c = 9;
    for (const m of ['지상파', '케이블']) { const d = cmd(m); if (!d.n) continue; b.chart(xrChart({ type: 'doughnut', title: `${m} 중CM · PIB 비중 (${fmt.int(d.n)}회)`, cats: ['중CM', 'PIB', '전후CM 등'], legend: 'b', series: [{ name: m, color: CMC.mid, vals: d.v, pts: [CMC.mid, CMC.pib, CMC.fb] }], lblColor: '1D2833' }), c, r, c + 5, r + H); c += 5; }
    r += H + 1;
    const A = aggCells(cells); const secs = Object.keys(A.sec).map(Number).filter(x => x > 0 && A.sec[x] > 0).sort((a, b2) => a - b2);
    b.chart(xrChart({ type: 'doughnut', title: '초수별 노출수', cats: secs.map(x => x + '초'), legend: 'b', series: [{ name: '초수', color: '#13958a', vals: secs.map(x => A.sec[x]), pts: secs.map(secColor) }] }), 1, r, 6, r + H);
    b.chart(xrChart({ type: 'doughnut', title: '요일별 노출수', cats: ['주중', '주말'], legend: 'b', series: [{ name: '요일', color: MIXC.wd, vals: [A.wd, A.we], pts: [MIXC.wd, MIXC.we] }] }), 6, r, 11, r + H);
    r += H + 1;
  }
  b.maxR = Math.max(b.maxR, r);
  return b;
}

// ---------- ② 예산표 ----------
function xrBudgetSheet() {
  const b = XRSheet('예산표', xrTitle('예산'));
  const T = table1(M.cells.filter(c => c.budget > 0), 'budget');
  b.widths = [3, 10, 16, 16].concat(T.items.map(() => 15), [16]);
  b.put(3, 1, '채널 × 품목 예산 (원, VAT 별도)', XRS.note); b.heights[3] = 22;
  xrHierTable(b, 4, 1, T, () => ZF);
  return b;
}

// ---------- ③ 지상파 큐시트 (정산 → 큐시트) ----------
function xrSpotTxt(s, mode) {
  const o = chipOpts(mode), p = [];
  if (o.item) p.push(s.item || s.itemRaw); if (o.cre && s.cre && mode === 'g') p.push(s.cre); if (o.sec && s.sec) p.push(s.sec + '초');
  if (o.cm && (s.cmCls || s.cmRaw)) p.push(mode === 'g' ? (s.cmRaw || s.cmCls) : s.cmCls);
  return p.join(' / ') + (s.day ? ` ${M.ym.m}/${s.day}` : '');
}
function xrGroundSheet() {
  const b = XRSheet('지상파 큐시트', xrTitle('지상파 큐시트'));
  const W = M.weeks, sp = M.spots.filter(s => s.src === '지상파');
  const chs = [...new Set(sp.map(s => s.ch))].sort((a, c) => chOrd(a) - chOrd(c));
  b.widths = [3, 8, 9, 34, 6, 7, 7, 6, 6, 13, 6, 13, 11, 7, 12, 15].concat(W.map(() => 26), [8, 9, 13]);
  let r = 3;
  const G = M.gSettle;
  if (G && G.rows.length) {
    b.put(r, 1, '지상파 정산', XRS.sec); b.put(r, 4, '연계 = (KBS+MBC 유상 금액)×20% + SBS 예산×10% · CM지정비 = 단가×지정율 (KBS 유상은 ÷0.85)', XRS.note); b.heights[r] = 26; r++;
    // 값 칸은 큐시트 열 3개씩 병합 (열 너비가 큐시트에 맞춰져 있어서)
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
  b.put(r, 1, '큐시트', XRS.sec); b.put(r, 4, '같은 프로그램·시간·단가는 한 줄로 묶고 주차 칸에 품목·소재·초수·날짜 · 분홍 = 중CM·본방', XRS.note); b.heights[r] = 26; r++;
  // 2줄 머리글
  const one = ['채널', '구분', '프로그램', '요일', '시작', '종료', '시급', '초수', '단가', '횟수', '금액'];
  one.forEach((h, k) => { b.put(r, 1 + k, h, XRS.head); b.merge(r, 1 + k, r + 1, 1 + k, XRS.head); });
  b.put(r, 12, 'CM지정', XRS.head); b.merge(r, 12, r, 14, XRS.head);
  ['CM 순서', '지정율', '지정금액\n(원, VAT 별도)'].forEach((h, k) => b.put(r + 1, 12 + k, h, XRS.head));
  b.put(r, 15, '집행일자', XRS.head); b.merge(r, 15, r + 1, 15, XRS.head);
  W.forEach((w, k) => { b.put(r, 16 + k, `${w.label}차\n${w.range}`, XRS.head); b.merge(r, 16 + k, r + 1, 16 + k, XRS.head); });
  const cA = 16 + W.length;
  b.put(r, cA, 'A.R(%)', XRS.head); b.merge(r, cA, r + 1, cA, XRS.head);
  b.put(r, cA + 1, '예상 효과', XRS.head); b.merge(r, cA + 1, r, cA + 2, XRS.head);
  b.put(r + 1, cA + 1, 'Eq GRP', XRS.head); b.put(r + 1, cA + 2, 'CPRP (원)', XRS.head);
  b.heights[r] = 20; b.heights[r + 1] = 30; r += 2;
  for (const ch of chs) {
    const list = sp.filter(s => s.ch === ch), rows = gCueRows(ch, list), r0 = r;
    rows.forEach(x => {
      const s = x.first, st = x.live || x.cmg === '중CM' ? XRS.bon : XRS.cell;
      const wk = W.map(w => x.spots.filter(y => y.week === w.n));
      const v = [null, x.kspan ? x.kind : '', s.prog + (s.note ? `\n(비고: ${s.note})` : ''), s.dowRaw || s.dow, s.start, s.end, s.grade, s.sec || '', s.price || '', x.spots.length, s.bonus ? '보너스' : x.paid, s.cmRaw, s.rate || '', x.desig ? Math.round(x.desig) : '', x.dates];
      v.forEach((val, k) => { if (k === 0) return; b.put(r, k + 1, val, k === 1 || k === 2 ? xs2(st, { font: { bold: k === 1 } }) : k === 10 && s.bonus ? xs2(st, { font: { color: { rgb: 'B0306A' } } }) : st, k === 12 ? '0%' : '#,##0'); });
      wk.forEach((l, k) => b.put(r, 16 + k, l.map(y => xrSpotTxt(y, 'g')).join('\n'), l.length ? xs2(st, { fill: { fgColor: { rgb: hexRgb(itemLight(l[0].item)) } }, font: { sz: 9 } }) : st));
      b.put(r, cA, x.ar == null ? '' : x.ar, st, '0.0'); b.put(r, cA + 1, x.eq || '', st, '0.0'); b.put(r, cA + 2, x.cprp ? Math.round(x.cprp) : '', st, '#,##0');
      const lines = Math.max(1, ...wk.map(l => l.length), Math.ceil(String(v[2]).length / 21) + (s.note ? 1 : 0)); if (lines > 1) b.heights[r] = 15 * lines + 3;
      r++;
    });
    // 구분 병합
    let k0 = r0; rows.forEach((x, i) => { if (x.kspan > 1) b.merge(r0 + i, 2, r0 + i + x.kspan - 1, 2); });
    b.put(r0, 1, ch, XRS.lab); if (r - r0 > 1) b.merge(r0, 1, r - 1, 1, XRS.lab);
    const T = gCueTotal(rows);
    b.put(r, 1, `${ch} 계`, XRS.subt); b.merge(r, 1, r, 9, XRS.subt);
    b.put(r, 10, T.n, XRS.subt); b.put(r, 11, T.paid, XRS.subt); b.put(r, 12, '', XRS.subt); b.put(r, 13, '', XRS.subt); b.put(r, 14, Math.round(T.desig), XRS.subt); b.put(r, 15, '', XRS.subt);
    W.forEach((w, k) => b.put(r, 16 + k, sum(rows, x => x.spots.filter(y => y.week === w.n).length), XRS.subt));
    b.put(r, cA, '', XRS.subt); b.put(r, cA + 1, T.eq, XRS.subt, '0.0'); b.put(r, cA + 2, T.cprp ? Math.round(T.cprp) : '-', XRS.subt);
    r++; void k0;
  }
  return b;
}

// ---------- ④ 케이블 큐시트 ----------
function xrCableSheet() {
  const b = XRSheet('케이블 큐시트', xrTitle('케이블 큐시트'));
  const W = M.weeks, sp = M.spots.filter(s => s.src === '케이블');
  const chs = [...new Set(sp.map(s => s.ch))].sort((a, c) => chOrd(a) - chOrd(c));
  b.widths = [3, 12, 6, 38, 6, 7, 7, 6, 6].concat(W.map(() => 26));
  let r = 3;
  b.put(r, 1, '본방·생방 → 15초 평단가 높은 순 · 분홍 = 본방·생방', XRS.note); b.heights[r] = 22; r++;
  ['채널', '본방', '프로그램명', '요일', '시작', '종료', '시급', '횟수'].forEach((h, k) => b.put(r, 1 + k, h, XRS.head));
  W.forEach((w, k) => b.put(r, 9 + k, `${w.label}차\n${w.range}`, XRS.head)); b.heights[r] = 30; r++;
  for (const ch of chs) {
    const list = sp.filter(s => s.ch === ch), r0 = r;
    for (const x of cableRows(ch, list)) {
      const s = x.first, st = x.live ? XRS.bon : XRS.cell; const wk = W.map(w => x.spots.filter(y => y.week === w.n));
      [x.live ? (/생방/.test(s.prog) && !/본방/.test(s.prog) ? '생방' : '본방') : '', s.prog, s.dowRaw || s.dow, s.start, s.end, s.grade, sum(x.spots, y => y.cnt)].forEach((v, k) => b.put(r, 2 + k, v, k === 0 && v ? xs2(st, { font: { bold: true, color: { rgb: 'E0005A' } } }) : st));
      wk.forEach((l, k) => b.put(r, 9 + k, l.map(y => xrSpotTxt(y, 'c') + (y.cnt > 1 ? ` ×${y.cnt}` : '')).join('\n'), l.length ? xs2(st, { fill: { fgColor: { rgb: hexRgb(itemLight(l[0].item)) } }, font: { sz: 9 } }) : st));
      const lines = Math.max(1, ...wk.map(l => l.length), Math.ceil(String(s.prog).length / 24)); if (lines > 1) b.heights[r] = 15 * lines + 3;
      r++;
    }
    b.put(r0, 1, ch, XRS.lab); if (r - r0 > 1) b.merge(r0, 1, r - 1, 1, XRS.lab);
    b.put(r, 1, `${ch} 계`, XRS.subt); b.merge(r, 1, r, 7, XRS.subt); b.put(r, 8, sum(list, s => s.cnt), XRS.subt);
    W.forEach((w, k) => b.put(r, 9 + k, sum(list.filter(s => s.week === w.n), s => s.cnt), XRS.subt)); r++;
  }
  return b;
}

// ---------- ⑤ 소재 운영 ----------
function xrCreSheet() {
  const b = XRSheet('소재 운영', xrTitle('소재 운영'));
  b.widths = [3, 14, 16, 7, 22, 10, 10, 12, 16, 30];
  let r = 3;
  b.put(r, 1, '품목별 운영 소재 · 금액/횟수 비중 · 지상파 실제 = 지상파 송출 중 그 소재로 나간 비율', XRS.note); b.heights[r] = 22; r++;
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
    b.put(r, 9, pl && Object.keys(pl.shares).length > 1 ? `GRP 계산 초수 비중: ${Object.entries(pl.shares).map(([s, v]) => `${s}초 ${fmt.pct(v)}`).join(' · ')}` : '', XRS.subt); r++;
  }
  return b;
}

// ---------- ⑥ 큐시트 캘린더 ----------
function xrCalSheet(weeks) {
  const b = XRSheet('큐시트 캘린더', xrTitle('큐시트 캘린더'));
  const per = [10, 6, 4, 26, 8];
  b.widths = [3].concat(CAL_WD.flatMap(() => per));
  let r = 3;
  b.put(r, 1, '날짜 칸마다 그날 나간 광고를 시작 시간 순으로 — 채널 · 시간 · 초수 · 프로그램(전체 이름) · CM 위치 (왼쪽 색 = 품목)', XRS.note); b.heights[r] = 22; r++;
  CAL_WD.forEach((w, i) => { const c = 1 + i * 5; b.put(r, c, w, i >= 5 ? xs2(XRS.head, { fill: { fgColor: { rgb: '5A2B3A' } } }) : XRS.head); b.merge(r, c, r, c + 4); }); b.heights[r] = 22; r++;
  for (const wk of weeks) {
    wk.forEach((c, i) => { const cc = 1 + i * 5; b.put(r, cc, c ? `${M.ym.m}월 ${c.d}일${c.n ? ` · ${c.n}회` : ''}` : '', c ? xs2(XRS.grp, { alignment: { horizontal: 'left' }, font: { color: { rgb: i === 6 ? 'D6453D' : i === 5 ? '2F6FC4' : '2B4256' } } }) : XRS.cell); b.merge(r, cc, r, cc + 4); });
    r++;
    const mx = Math.max(1, ...wk.map(c => c ? c.list.length : 0));
    for (let k = 0; k < mx; k++) {
      wk.forEach((c, i) => {
        const e = c && c.list[k], cc = 1 + i * 5;
        if (!e) { for (let j = 0; j < 5; j++) b.put(r, cc + j, '', XRS.cell); return; }
        const mid = e.cmCls === '중CM', st = mid ? XRS.bon : XRS.cell;
        b.put(r, cc, e.ch, xs2(st, { fill: { fgColor: { rgb: hexRgb(itemLight(e.item)) } }, font: { bold: true } }));
        b.put(r, cc + 1, e.st, st); b.put(r, cc + 2, e.sec || '', st); b.put(r, cc + 3, e.prog + (e.n > 1 ? ` ×${e.n}` : ''), xs2(st, { alignment: { horizontal: 'left', wrapText: true } }));
        b.put(r, cc + 4, e.cm, mid ? xs2(st, { font: { bold: true, color: { rgb: 'E0005A' } } }) : st);
      });
      r++;
    }
  }
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
// '큐시트 엑셀 받기': 보고용 5개 시트 + 숨김 데이터(이 파일을 '백업 파일 다시 넣기'로 그대로 넣을 수 있음)
function xrFullBytes() { return xrBookBytes([xrOpsSheet(), xrBudgetSheet(), xrGroundSheet(), xrCableSheet(), xrCreSheet()], xrDataSheets(ALL_SHEETS)); }
function downloadFullReport() { saveBlob(new Blob([xrFullBytes()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), xrName('큐시트')); }
