// ===== 12-qmengine.js : 방송사 원본(raw) 큐시트 해석 엔진 =====
// Q-Mate v3.7.2 (smtowncuesheet, 2026-09-28)의 검증된 해석 로직을 그대로 옮겨 왔다.
//   머리글 행 자동 감지 · 2줄 머리글 합치기 · 열 종류 판정(머리글 + 값 패턴) · 기간 찾기
//   1행 1송출로 펼치기(날짜 목록 '10/3, 10, 17' · 요일별 횟수 → 날짜 분배 · SPOTV 비고 날짜 · MBC SPORTS/MBN 균등분배)
//   합계·안내문 행 거르기 · 같은 파일 안의 중복 시트/행 제거 · 숨김 시트 제외
// 채널·품목 판정은 이 앱의 마스터/매칭 규칙으로 바꿔 끼운다(QME.hooks).
// ⚠ 원본 코드는 손대지 말고, 바꿀 일이 있으면 Q-Mate 쪽에서 고친 뒤 다시 옮긴다(scratch: port_qmate.py).
const QME = (function () {
  var HOOKS = {
    lookupPC: function (fn, sn) { return { pp: '', channel: '' }; },
    getBroadcastType: function (ch) { return ''; },
    getSoakedLabel: function (fn) { return ''; },
    getChannelPP: function (ch) { return ''; },
  };
  function lookupPC(fn, sn) { return HOOKS.lookupPC(fn, sn) || { pp: '', channel: '' }; }
  function getBroadcastType(ch) { return HOOKS.getBroadcastType(ch); }
  function getSoakedLabel(fn) { return HOOKS.getSoakedLabel(fn); }
  function getChannelPP(ch) { return HOOKS.getChannelPP(ch); }
  function getPPVal(pp) { return pp || ''; }
  function getItemLabel() { return ''; }
  function getLongName() { return ''; }
  var progNameMapLocal = {};
  var files = [];
/* ──────── [Q-Mate 207–237] CM 정규화 (Q-Mate 고정표) ──────── */
/* ═══════════════════════════════════
   CM 정규화 테이블 (고정, 수정 불가)
═══════════════════════════════════ */
var CM_NORM={
  '중CM':'중CM','전END':'PIB','전or후':'전후CM','후TOP':'PIB','후':'전후CM','전':'전후CM','중':'중CM',
  '후(후TOP)':'PIB','전(전END)':'PIB','후(PCM)':'PIB','전CM':'전후CM','후CM':'전후CM',
  '중CMTop':'중CM','전CMEnd':'PIB','후CMTop':'PIB','PPIB':'PIB','후TOP+1':'PIB',
  '전후CM':'전후CM','PIB1':'PIB','중간광고':'중CM','PIB2':'PIB','후CM_TOP':'PIB',
  '중 CM':'중CM','전 CM':'전후CM','전 END':'PIB','후 CM':'전후CM','후 TOP+1':'PIB',
  '전 END-2':'PIB','전PIB':'PIB','후PIB':'PIB','전후 CM':'전후CM','후 PIB A':'PIB',
  '전 PIB A':'PIB','후 TOP+2':'PIB','후 TOP':'PIB','전END-2':'PIB','후 TOP+3':'PIB',
  '전 END-1':'PIB','후TOP + 1':'PIB','전END - 1':'PIB','중TOP + 1':'중CM',
  '전(PCM)':'PIB','전 PIB B':'PIB','중 TOP':'중CM','PCM':'PIB','후 PIB B':'PIB',
  '전CM_END':'PIB','전END-1':'PIB','중(중TOP)':'중CM','전ENDCM':'PIB','후TOPCM':'PIB',
  'PIB B':'PIB','Live 중 CM':'중CM','PIB':'PIB','전PIB1':'PIB','전(PIB)':'PIB',
  '후(PIB)':'PIB','전PIB2':'PIB','후PIB2':'PIB','후PIB1':'PIB','중TOP':'중CM',
  '후TOP+3':'PIB','전PIB-3':'PIB','전PIB-2':'PIB','전or후CM':'전후CM','전PIB-1':'PIB',
  '후PIB+1':'PIB','중1CM':'중CM','중2CM':'중CM','중3CM':'중CM','중4CM':'중CM',
  '중5CM':'중CM','중6CM':'중CM','중7CM':'중CM','중8CM':'중CM','중9CM':'중CM',
  '중10CM':'중CM','중11CM':'중CM','중12CM':'중CM','중13CM':'중CM',
  '중1':'중CM','중2':'중CM','중3':'중CM','중4':'중CM','중5':'중CM',
  '전후cm':'전후CM','전후 cm':'전후CM',
};
function normCM(v){
  var t=String(v||'').trim();
  if(CM_NORM.hasOwnProperty(t))return CM_NORM[t];
  // case-insensitive fallback
  var tl=t.toLowerCase();
  for(var k in CM_NORM){if(k.toLowerCase()===tl)return CM_NORM[k];}
  return t;
}
/* ──────── [Q-Mate 607–678] 중복 시트 / 중복 행 ──────── */
/* ═══════════════════════════════════
   중복 시트 감지 (범용) — 한 파일 안에 동일 PP/채널로 매핑되는 시트가
   2개 이상이고 내용이 사실상 동일하면(예: "통합"/"일자별" 등 이름만 다른
   동일 데이터 시트) 뒤 시트를 중복으로 간주해 집계에서 제외.
   MBC every1 하드코딩 규칙(DEFAULT_MAPPING_RULES)과 별개로, 앞으로 등장할
   다른 방송사의 유사 케이스도 자동으로 잡아내기 위한 일반 로직.
═══════════════════════════════════ */
function _sheetFingerprint(sh){
  var sum=0,rowCount=0;
  (sh.dataRows||[]).forEach(function(row){
    var hasContent=false;
    (row||[]).forEach(function(c){
      if(c===''||c==null)return;
      hasContent=true;
      var n=+c;
      if(!isNaN(n))sum+=n;
    });
    if(hasContent)rowCount++;
  });
  return rowCount+'|'+Math.round(sum*100);
}
function findDuplicateSheetNames(f){
  var dup={};
  if(!f||!f.sheets||f.sheets.length<2)return dup;
  var byPC={};
  f.sheets.forEach(function(sh){
    var pc=lookupPC(f.name,sh.name);
    if(!pc.pp&&!pc.channel)return; // 매핑 규칙에서 이미 제외된 시트(예: MBC every1 일자별)는 대상 아님
    var key=pc.pp+'||'+pc.channel;
    (byPC[key]=byPC[key]||[]).push(sh);
  });
  Object.keys(byPC).forEach(function(key){
    var list=byPC[key];
    if(list.length<2)return;
    var fp0=_sheetFingerprint(list[0]);
    for(var i=1;i<list.length;i++){
      if(_sheetFingerprint(list[i])===fp0&&fp0!=='0|0'){
        dup[list[i].name]=true; // 동일 지문(행수+숫자합) → 중복 시트로 판단, 이후 시트를 제외
      }
    }
  });
  return dup;
}

/* ═══════════════════════════════════
   파일 내 중복 "행" 제거 (범용)
   MBC every1 "통합"(월간횟수+콤마날짜) / "일자별"(날짜 1개씩) 처럼 시트 구조 자체가
   달라 findDuplicateSheetNames()의 지문 비교로는 못 잡는 경우를 위한 최종 안전장치.
   같은 파일에서 생성된 최종 행이 채널+프로그램+날짜+시작~종료+CM위치+단가까지 완전히
   같으면(=같은 방송 슬롯을 두 번 만든 것) 물리적으로 동시에 존재할 수 없으므로 뒤 항목을 제거.
   3대 함수(buildPreviewNormRows/mergeFiles/buildPVRows) 모두 파일 단위로 이 키를 적용.
═══════════════════════════════════ */
function _rowDedupKey(row){
  return [row[0],row[2],row[18],row[4],row[5],(row[30]||row[8]),row[9]].join('|');
}
// entries: [{row, sh}] — sh = 원본 시트 인덱스(같은 시트 안에서 나온 반복행은 절대 제거 안 함).
// 스포츠/균등분배 채널 등은 같은 시트 내에서 "1방송=1행" 규칙상 완전히 같은 값의 행이
// 의도적으로 여러 번 나올 수 있음(예: 화요일 8회를 화요일 날짜들에 분배하며 같은 날짜에 2회) —
// 이런 정상 반복은 보존하고, "다른 시트"에서 나온 완전 동일 행만 중복으로 제거.
function dedupFileRowEntries(entries){
  var seen={},out=[];
  entries.forEach(function(e){
    var key=_rowDedupKey(e.row);
    if(seen.hasOwnProperty(key)){
      if(seen[key]!==e.sh)return; // 다른 시트에서 나온 완전 동일 행 → 중복으로 제외
    } else {
      seen[key]=e.sh;
    }
    out.push(e.row);
  });
  return out;
}
/* ──────── [Q-Mate 680–689] 주차 ──────── */
/* ═══════════════════════════════════
   WEEK HELPERS
═══════════════════════════════════ */
function getWeekNum(year,month,day){
  var firstDOW=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7;
  if(firstDOW===0)return Math.floor((day-1)/7)+1;
  var firstMon=1+(7-firstDOW);
  if(day<firstMon)return 1;
  return Math.floor((day-firstMon)/7)+2;
}
/* ──────── [Q-Mate 728–740] 주차 범위 ──────── */
function getWeekRangeStr(year,month,weekNum){
  var firstDOW=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7;
  var daysInMonth=new Date(Date.UTC(year,month,0)).getUTCDate();
  var s,e;
  if(firstDOW===0){s=(weekNum-1)*7+1;e=Math.min(weekNum*7,daysInMonth);}
  else{
    var firstMon=1+(7-firstDOW);
    if(weekNum===1){s=1;e=firstMon-1;}
    else{s=firstMon+(weekNum-2)*7;e=Math.min(s+6,daysInMonth);}
  }
  var ms=month+'/';
  return s===e?(ms+s):(ms+s+'~'+ms+e);
}
/* ──────── [Q-Mate 767–932] 문자열·날짜 도우미 ──────── */
/* ═══════════════════════════════════
   STRING HELPERS
═══════════════════════════════════ */
function log(msg,type){if(typeof console!=="undefined")console.log("[log]",msg);}
var WDAYS=['월','화','수','목','금','토','일'];
var ENG_DAYS={mon:'월',tue:'화',wed:'수',thu:'목',fri:'금',sat:'토',sun:'일'};
var COL_WCH=[
  14, 12, 22, 4, 7, 7, 5, 5, 8, 10, 5,
  3,3,3,3,3,3,3,
  7, 8, 8, 8,
  5,5,5,5,5,5,
  10, 10, 8, 6, 10, 10, 6, 14,
  24, 10, 8, 8, 12, 5, 10, 20,
  6,6,6,6,6,6,
  10, 8, 12, 20, 10, 26, 12
];
var OUT_COLS=['채널','품목','프로그램','요일','시작시간','종료시간','시급','초수','CM위치','단가','횟수','월','화','수','목','금','토','일','날짜','시작일자','종료일자','집행일','1주','2주','3주','4주','5주','6주','품목 카테고리','지상파/케이블 구분','CM위치(보정값)','주중/주말','단가(서비스x)','PP','주차 구분(숫자)','주차 구분(날짜)','값 표시','정기물 여부','행 그룹 내 순서(석진 사용)','해당 그룹의 총 횟수(석진 사용)','해당 프로그램 15초 평단가(석진 사용)','본방여부','15초 단가 환산','품목 풀네임','1W','2W','3W','4W','5W','6W','금액','CM 순서','예산','소재','온보딩일','원본 파일명','CM위치(미보정)','원본 시트명'];
function _todayISO(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
/* 열 설정·피벗 필드에서 아예 빼 버리는 열(내부 계산용).
   ⚠️ 57 '원본 시트명'은 2026-09-23부터 여기서 뺐다 — 고를 수는 있어야 하고,
      다만 _defaultColConfig()에 없으므로 **기본값은 숨김**이다. */
var _HIDDEN_COLS=[28,30,32,37,38,39,40,43,44,45,46,47,48,49,50,51,52];

/* ═══ 프로그램명 태그(<본방>·<생방>·<특집>) 공통 처리 ═══
   방송사 큐시트마다 <본방> ［생방］ (특집) 처럼 표기가 제각각이라 한 번에 정규화하고,
   화면에서는 태그별로 다른 색으로 강조한다. */
var PROG_TAGS=['본방','생방','특집'];
var PROG_TAG_COLORS={'본방':'#e0005a','생방':'#0068b5','특집':'#b45309'};
var PROG_TAG_CLS={'본방':'bon','생방':'live','특집':'sp'};
function _progNormTags(str){
  if(str==null||str==='')return '';
  var t=String(str).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  for(var i=0;i<PROG_TAGS.length;i++){
    var tag=PROG_TAGS[i];
    t=t.replace(new RegExp('[\uFF1C<\u3008\\[\u3010\u300C\u300E(\uFF08]\\s*'+tag+'\\s*[\uFF1E>\u3009\\]\u3011\u300D\u300F)\uFF09]','g'),'<'+tag+'>');
  }
  t=t.replace(/[\uFF1C<\u3008\[\u3010\u300C\u300E(\uFF08]\s*본\s*[\uFF1E>\u3009\]\u3011\u300D\u300F)\uFF09]/g,'<본방>');
  return t;
}
function _progTags(name){
  var t=String(name==null?'':name), out=[];
  for(var i=0;i<PROG_TAGS.length;i++){ if(t.indexOf('<'+PROG_TAGS[i]+'>')>=0)out.push(PROG_TAGS[i]); }
  return out;
}
function _progBase(name){ return String(name==null?'':name).replace(/\s*<(본방|생방|특집)>/g,'').replace(/\s+/g,' ').trim(); }
function _progWithTags(base,tags){
  base=String(base==null?'':base).trim();
  if(!tags||!tags.length)return base;
  var out=[];
  for(var i=0;i<PROG_TAGS.length;i++){ if(tags.indexOf(PROG_TAGS[i])>=0)out.push('<'+PROG_TAGS[i]+'>'); }
  return out.length?(base+' '+out.join(' ')):base;
}
/* 프로그램명에 <본방>이 있으면 본방여부(41열)를 자동으로 1로 맞춘다(2026-08-25 요청).
   반대 방향은 건드리지 않는다 — 체크를 해제하면 _progSetBonbang이 이름의 태그를 지우므로 되살아나지 않는다. */
function _syncBonbangFlag(row){
  if(!row||!row.length)return false;
  if(_progTags(row[2]).indexOf('본방')<0)return false;
  if(+row[41]===1)return false;
  row[41]=1; return true;
}
function _syncBonbangAll(rows){
  if(!rows||!rows.length)return 0;
  var n=0,start=(Array.isArray(rows[0])&&String(rows[0][0])==='채널')?1:0;
  for(var i=start;i<rows.length;i++){ if(_syncBonbangFlag(rows[i]))n++; }
  return n;
}
function _progSetBonbang(name,on){
  var tags=_progTags(name).filter(function(t){return t!=='본방';});
  if(on)tags.push('본방');
  return _progWithTags(_progBase(name),tags);
}
function _progTagHTML(tags){
  if(!tags||!tags.length)return '';
  return tags.map(function(t){
    return '<span class="pv-tag pv-tag-'+PROG_TAG_CLS[t]+'" contenteditable="false" style="color:'+PROG_TAG_COLORS[t]+';font-weight:700;user-select:none"> &lt;'+t+'&gt;</span>';
  }).join('');
}
function _progTagCls(tags){
  if(!tags||!tags.length)return '';
  if(tags.indexOf('본방')>=0)return ' pv-bonbang';
  if(tags.indexOf('생방')>=0)return ' pv-saengbang';
  return ' pv-teukjip';
}

var TM={
  date:{l:'날짜',c:'#22d3ee'},dayofmonth:{l:'일(DD)',c:'#06b6d4'},dayofweek:{l:'요일',c:'#60a5fa'},
  starttime:{l:'시작시간',c:'#fbbf24'},endtime:{l:'종료시간',c:'#fb923c'},time_col:{l:'시간통합',c:'#f59e0b'},
  program:{l:'프로그램명',c:'#c084fc'},cmposition:{l:'CM위치',c:'#f472b6'},cmpos_ex:{l:'CM위치(조선/채널A)',c:'#ec4899'},
  pib_col:{l:'PIB열',c:'#db2777'},grade:{l:'시급',c:'#22d3ee'},duration:{l:'초수',c:'#a78bfa'},
  unitprice:{l:'단가',c:'#4ade80'},count:{l:'횟수',c:'#5b6af5'},
  cheong_unitprice:{l:'청약금액(단가)',c:'#34d399'},amount_split:{l:'금액(방송/보너스)',c:'#94a3b8'},
};
WDAYS.forEach(function(d){TM['wd_'+d]={l:'요일열('+d+')',c:'#6366f1'};});

function T(v){return String(v===null||v===undefined?'':v).trim();}
var _ESC_RE=/[&"<]/g, _ESC_MAP={'&':'&amp;','"':'&quot;','<':'&lt;'};
function esc(s){ s=String(s||''); if(s.indexOf('&')<0&&s.indexOf('"')<0&&s.indexOf('<')<0)return s;
  return s.replace(_ESC_RE,function(c){return _ESC_MAP[c];}); }

function isHHMM(v){return/^\d{1,2}:\d{2}(:\d{2})?$/.test(v);}
function normTime(v){
  v=T(v);
  if(isHHMM(v))return v.replace(/^(\d{1,2}:\d{2}):\d{2}$/,'$1');
  if(/^\d{4}$/.test(v)){var h=v.slice(0,2),m=v.slice(2);return h+':'+m;}
  return v;
}
function isCombTime(v){return/^\d{1,2}:\d{2}[~\-–]\d{1,2}:\d{2}$/.test(T(v));}
function parseComb(v){
  var m=T(v).match(/^(\d{1,2}:\d{2})[~\-–](\d{1,2}:\d{2})$/);
  if(!m)return null;return{s:m[1],e:m[2]};
}
function is4dTime(v){return/^\d{4}$/.test(T(v))&&+v.slice(0,2)<=29&&+v.slice(2)<=59;}
function isMD(v){return /^\d{1,2}\/\d{1,2}$/.test(T(v));}
function isMMDD(v){
  var s=T(v);if(!/^\d{4}$/.test(s))return false;
  var mo=+s.slice(0,2),dd=+s.slice(2);return mo>=1&&mo<=12&&dd>=1&&dd<=31;
}
function isISO(v){return /^\d{4}-\d{2}-\d{2}/.test(T(v));}
function isISODT(v){return /^\d{4}-\d{2}-\d{2}\s/.test(T(v));}

// Parse comma-separated date strings: "1/24, 25, 31" or "1/26, 1/27, 1/28"
// First part may be M/D, subsequent parts may be D-only (YTN style) or full M/D (연합뉴스TV)
function parseMultiDate(rawVal,ctx){
  var parts=rawVal.split(',').map(function(p){return p.trim();}).filter(Boolean);
  if(!parts.length)return[];
  var yr=ctx?ctx.year:new Date().getFullYear();
  var results=[];
  var lastMonth=null;
  parts.forEach(function(part){
    if(isMD(part)){
      // Full M/D format: "1/24"
      var sp=part.split('/');
      lastMonth=+sp[0];
      var dd=+sp[1];
      results.push(yr+'-'+String(lastMonth).padStart(2,'0')+'-'+String(dd).padStart(2,'0'));
    } else if(/^\d{1,2}$/.test(part)){
      // Day-only: "25" → use lastMonth from previous part
      var mo=lastMonth||(ctx?ctx.month:new Date().getMonth()+1);
      var dd2=+part;
      if(dd2>=1&&dd2<=31)results.push(yr+'-'+String(mo).padStart(2,'0')+'-'+String(dd2).padStart(2,'0'));
    } else {
      // Try full normDateFull
      var d=normDateFull(part,ctx);if(d)results.push(d);
    }
  });
  return results;
}

function normDateFull(v,ctx){
  var s=T(v);
  // Strip comma-separated multi-date: take only first date
  if(s.indexOf(',')>=0){s=s.split(',')[0].trim();}
  if(isISO(s)||isISODT(s))return s.slice(0,10);
  if(isMD(s)){var p=s.split('/');var yr=ctx?ctx.year:new Date().getFullYear();return yr+'-'+p[0].padStart(2,'0')+'-'+p[1].padStart(2,'0');}
  if(isMMDD(s)){var yr2=ctx?ctx.year:new Date().getFullYear();return yr2+'-'+s.slice(0,2)+'-'+s.slice(2);}
  // YYYY/MM/DD
  var m2=s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if(m2)return m2[1]+'-'+m2[2].padStart(2,'0')+'-'+m2[3].padStart(2,'0');
  return'';
}
function isDOW(v){v=T(v);return v.length===1&&WDAYS.indexOf(v)>=0;}
function isDur(v){var n=+v;return n>0&&n<=180&&n%15===0;}
function isCMVal(v){var u=T(v).toUpperCase();return u.indexOf('CM')>=0||u.indexOf('PIB')>=0;}
function isSAVal(v){v=T(v);return v.length>0&&/^[A-Za-z0-9\-_]+$/.test(v)&&/SA/i.test(v);}
function isNumNoComma(v){var s=T(v).replace(/\.0*$/,'');return/^\d{5,}$/.test(s);}
function hasAllZeros(v){return T(v).indexOf('00000')>=0;}
/* ──────── [Q-Mate 934–1312] 시트 읽기 · 머리글 감지 · 기간 · 스포츠/SPOTV ──────── */
/* ═══════════════════════════════════
   EXCEL SERIAL → DATE (timezone-free)
═══════════════════════════════════ */
function excelSerialToISO(serial){
  if(!serial||serial<1)return'';
  var n=serial>60?serial-1:serial;
  var jdn=Math.floor(n)+2415020;
  var a=jdn+32044,b=Math.floor((4*a+3)/146097);
  var c=a-Math.floor(b*146097/4);
  var d2=Math.floor((4*c+3)/1461);
  var e=c-Math.floor(1461*d2/4);
  var m2=Math.floor((5*e+2)/153);
  var day=e-Math.floor((153*m2+2)/5)+1;
  var month=m2+3-12*Math.floor(m2/10);
  var year=100*b+d2-4800+Math.floor(m2/10);
  return year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
}

/* ═══════════════════════════════════
   SHEET READER
═══════════════════════════════════ */
function readSheetToArray(ws){
  if(!ws['!ref'])return[];
  var range=XLSX.utils.decode_range(ws['!ref']);
  var rows=[];
  for(var R=range.s.r;R<=range.e.r;R++){
    var row=[];
    for(var C=range.s.c;C<=range.e.c;C++){
      var addr=XLSX.utils.encode_cell({r:R,c:C});
      var cell=ws[addr];
      if(!cell||cell.v===undefined||cell.v===null){row.push('');continue;}
      var val;
      if(cell.t==='n'){
        var fmt=cell.z||'';
        var w=cell.w||'';
        var fmtL=fmt.toLowerCase();
        var isDateFmt=fmtL.indexOf('yy')>=0||(fmtL.indexOf('d')>=0&&fmtL.indexOf('m')>=0)||
                      fmt==='mm\\/dd'||fmt==='mm/dd'||fmt==='yyyy-mm-dd'||fmt==='m/d/yy'||
                      fmtL==='d-mmm'||fmtL==='d-mmm-yy'||fmtL==='mmm-yy'||
                      fmtL==='dd/mm/yy'||fmtL==='dd/mm/yyyy'||
                      (cell.v>40000&&cell.v<55000&&w&&(w.indexOf('/')>=0||w.indexOf('-')>=0||w.indexOf('.')>=0));
        if(isDateFmt){val=excelSerialToISO(cell.v);}
        else if((/[hH]/.test(fmt)&&fmt.indexOf(':')>=0)||/^\d{1,2}:\d{2}/.test(w)){
          val=w.replace(/^(\d{1,2}:\d{2}):\d{2}(:\d{2})?.*$/,'$1')||w;
        } else {val=String(cell.v);}
      } else if(cell.t==='d'){
        var w2=cell.w||'';
        var mF=w2.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
        var mM=w2.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
        if(mF)val=mF[1]+'-'+mF[2].padStart(2,'0')+'-'+mF[3].padStart(2,'0');
        else if(mM){var yy=+mM[3];if(yy<100)yy+=2000;val=yy+'-'+mM[1].padStart(2,'0')+'-'+mM[2].padStart(2,'0');}
        else val=w2;
      } else {val=String(cell.v);}
      row.push(typeof val==='string'?val.trim():String(val).trim());
    }
    rows.push(row);
  }
  return rows;
}

/* ═══════════════════════════════════
   AUTO HEADER DETECTION
═══════════════════════════════════ */
var HEADER_KW=['프로그램','program','채널','channel','시작','종료','요일','day','시급','class','초수','length','단가','cost','cm위치','구분','횟수','비고','소재','날짜','방송일','방영일','kinds','spot','time'];
function scoreRow(row){
  var s=0;
  row.forEach(function(v){
    var vl=T(v).toLowerCase();
    HEADER_KW.forEach(function(k){if(vl.indexOf(k)>=0)s++;});
  });
  return s;
}
function autoDetectHeader(rawData){
  var best=0,bestScore=-1;
  for(var i=0;i<Math.min(20,rawData.length);i++){
    var sc=scoreRow(rawData[i]||[]);
    if(sc>bestScore){bestScore=sc;best=i;}
  }
  return best;
}
function detectSubHeader(rawData,hIdx){
  if(hIdx+1>=rawData.length)return-1;
  var sub=rawData[hIdx+1]||[];
  // Only exact whole-cell matches — prevents false positives from program names containing 월/일/etc.
  var sub_kw=['시작','끝','종료','월','화','수','목','금','토','일',
    'mon','tue','wed','thu','fri','sat','sun'];
  var hits=sub.filter(function(v){var vl=T(v).toLowerCase().trim();return sub_kw.some(function(k){return vl===k;});}).length;
  // Also require that the row has few numeric values (data rows usually have numbers)
  var numCnt=sub.filter(function(v){var s=T(v).replace(/,/g,'');return/^\d{4,}$/.test(s)||/^\d{1,3}$/.test(s);}).length;
  return(hits>=2&&numCnt<=2)?hIdx+1:-1;
}
function mergeHeaders(main,sub){
  return main.map(function(h,i){
    var s=T(sub[i]);
    if(!s||s===T(h))return T(h);
    if(!T(h))return s;
    return T(h)+' '+s;
  });
}
function scanPeriod(preRows,fileName){
  var result={year:0,month:0,startISO:'',endISO:''};
  // 파일명에서 YYYYMM 또는 YYYY-MM 추출 (예: MBC SPORTS+_202507_..., 2603 등)
  // 백업용으로 사용 — 셀에 M/D만 있고 연도/월이 없을 때 fallback
  var fnYear=0, fnMonth=0;
  if(fileName){
    var fn=String(fileName);
    var fm=fn.match(/(20\d{2})[._\-]?(\d{2})/);    // 202507, 2025-07
    if(fm){fnYear=+fm[1]; fnMonth=+fm[2];}
    if(!fm){
      // 짧은 형식: 2603 = 26년 3월 (사내 표기)
      var fm2=fn.match(/(?:^|[\s_\-])((2[5-9]|3\d)(0[1-9]|1[0-2]))(?:[\s_\-]|$)/);
      if(fm2){fnYear=2000+(+fm2[2]); fnMonth=+fm2[3];}
    }
  }
  for(var i=preRows.length-1;i>=0;i--){
    var row=preRows[i]||[];
    for(var j=0;j<row.length;j++){
      var v=T(row[j]);
      // Try to find period range like '2026.01.24 ~ 2026.01.31' or '2026-01-24~2026-01-31'
      var mp=v.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})\s*[~\-–]\s*(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
      if(mp){
        result.year=+mp[1];result.month=+mp[2];
        result.startISO=mp[1]+'-'+mp[2].padStart(2,'0')+'-'+mp[3].padStart(2,'0');
        result.endISO=mp[4]+'-'+mp[5].padStart(2,'0')+'-'+mp[6].padStart(2,'0');
        return result;
      }
      // 한글 기간 표기: '2026년 7월 1일 ~ 7월 31일' / '2026년 7월 1일~2026년 7월 31일'
      var mkr=v.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*[~\-–]\s*(?:(\d{4})년\s*)?(?:(\d{1,2})월\s*)?(\d{1,2})일/);
      if(mkr){
        result.year=+mkr[1];result.month=+mkr[2];
        result.startISO=mkr[1]+'-'+mkr[2].padStart(2,'0')+'-'+mkr[3].padStart(2,'0');
        var _endY=mkr[4]?+mkr[4]:+mkr[1];
        var _endM=mkr[5]?+mkr[5]:+mkr[2];
        result.endISO=_endY+'-'+String(_endM).padStart(2,'0')+'-'+mkr[6].padStart(2,'0');
        return result;
      }
      var m=v.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
      if(m&&!result.year){result.year=+m[1];result.month=+m[2];
        result.startISO=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');}
    }
  }
  // M/D ~ M/D 패턴 (연도 없음) — 스포츠 채널 큐시트 양식
  // 파일명에서 추출한 연도가 있어야 의미가 있음
  if(!result.endISO&&fnYear){
    for(var i2=preRows.length-1;i2>=0;i2--){
      var row2=preRows[i2]||[];
      for(var j2=0;j2<row2.length;j2++){
        var v2=T(row2[j2]);
        // "7/1~7/31" / "7/1 ~ 7/31" / "7/1-7/31"
        var mr=v2.match(/(\d{1,2})\/(\d{1,2})\s*[~\-–]\s*(\d{1,2})\/(\d{1,2})/);
        if(mr){
          var sm=+mr[1], sd=+mr[2], em=+mr[3], ed=+mr[4];
          if(sm>=1&&sm<=12&&sd>=1&&sd<=31&&em>=1&&em<=12&&ed>=1&&ed<=31){
            result.year=fnYear; result.month=sm;
            result.startISO=fnYear+'-'+String(sm).padStart(2,'0')+'-'+String(sd).padStart(2,'0');
            result.endISO=fnYear+'-'+String(em).padStart(2,'0')+'-'+String(ed).padStart(2,'0');
            return result;
          }
        }
      }
    }
  }
  // 셀에 기간 정보 없음 + 파일명에 YYYYMM이 있으면 → 그 달 전체로 가정
  if(!result.endISO&&fnYear&&fnMonth){
    var lastDay=new Date(Date.UTC(fnYear,fnMonth,0)).getUTCDate();
    result.year=fnYear; result.month=fnMonth;
    result.startISO=fnYear+'-'+String(fnMonth).padStart(2,'0')+'-01';
    result.endISO=fnYear+'-'+String(fnMonth).padStart(2,'0')+'-'+String(lastDay).padStart(2,'0');
    return result;
  }
  if(result.year)return result;
  var now=new Date();return{year:now.getFullYear(),month:now.getMonth()+1,startISO:'',endISO:''};
}
// Generate all dates within a period that match given DOW pattern
function genDatesFromDOWInPeriod(wdObj,ctx){
  if(!ctx||!ctx.startISO||!ctx.endISO)return[];
  var WDAYS_EN=['월','화','수','목','금','토','일'];
  var start=new Date(ctx.startISO+'T00:00:00Z');
  var end=new Date(ctx.endISO+'T00:00:00Z');
  if(isNaN(start)||isNaN(end))return[];
  var dates=[];
  for(var d=new Date(start);d<=end;d.setUTCDate(d.getUTCDate()+1)){
    var dow=WDAYS_EN[(d.getUTCDay()+6)%7];
    var cnt=wdObj[dow];
    // Treat any positive value as "this day runs" (1 row per date, not cnt rows)
    if(cnt&&+String(cnt).replace(/\.0*$/,'')>0){
      var iso=d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');
      dates.push(iso);
    }
  }
  return dates;
}

/* ═══════════════════════════════════
   SPORTS CHANNEL HELPERS (MBC SPORTS / MBC SPORTS+)
   - 요일별 월간 횟수를 주차별로 균등 분배(나머지는 앞 주차 우선)
   - 1방송 = 1행 (날짜 중복 허용)
═══════════════════════════════════ */
function isSportsChannelMBC(channel){
  var c=(channel||'').toString().trim().toUpperCase();
  return c==='MBC SPORTS'||c==='MBC SPORTS+';
}
function isKBOLiveProgram(progName){
  var s=(progName||'').toString();
  if(s.indexOf('KBO')<0)return false;
  return s.indexOf('생방')>=0||s.indexOf('리그')>=0;
}
// 요일별 "횟수"만 있고 구체적 날짜가 없는 채널 — 균등분배 대상(MBC SPORTS류 + MBN)
// MBC SPORTS와 달리 KBO 생방 시간 자동 적용 등은 적용하지 않음(isSportsChannelMBC로 별도 관리)
/* ═══════════ SPOTV 큐시트 지원 (2026-09-09) ═══════════════════════
   이 양식의 특징 세 가지:
    ① 채널이 파일명이 아니라 **시트 A열에 행마다** 들어 있고, 같은 채널이
       이어지는 행은 셀 병합으로 비어 있다(직전 값을 물려받아야 한다).
    ② 실제 방송 날짜가 **'비고' 열에 사람이 쓴 문장**으로 들어 있다.
       "9월 4일, 8일~11일, 15일,~18일 22일~25일, 29일~10월 1일, 10월 5일~7일"
       — 월 표시는 바뀔 때만 나오고, 물결(~)은 범위이며 월을 넘길 수도 있고,
         쉼표가 빠지거나 엉뚱한 데 붙기도 한다.
    ③ 횟수는 월~일 요일 칸의 합이다(1일에 2회 이상 나가는 행도 있다).
   → 비고에서 '날짜 풀'을 뽑고, 요일별 횟수를 그 풀의 해당 요일 날짜에
     분배한다(MBC SPORTS 균등분배와 같은 정책, 나머지는 앞 날짜 우선). */
function isBigoDistChannel(pc){
  return !!(pc&&String(pc.pp||'').trim().toUpperCase()==='SPOTV');
}
/* A열 채널 표기 → 사용자가 정한 4가지 채널명 */
function _spotvNormCh(v){
  var raw=String(v==null?'':v).replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim();
  if(!raw)return'';
  var u=raw.toUpperCase();
  if(!/SPOTV/.test(u))return'';
  if(/전\s*채널|外|외/.test(raw))return'SPOTV 전채널 공통';   /* 'SPOTV外 전채널' — PRIME보다 먼저 본다 */
  if(/PRIME/.test(u))return'SPOTV PRIME';
  if(/^SPOTV\s*2\b/.test(u))return'SPOTV2';
  return'SPOTV';
}
/* 비고 문장 → ISO 날짜 목록. ctx.year/month를 기준월로 삼는다. */
function parseBigoDates(raw,ctx){
  var str=String(raw==null?'':raw);
  if(!str.trim())return[];
  str=str.replace(/[∼〜～–—ー]/g,'~');
  var re=/(\d{1,2})\s*월\s*(\d{1,2})\s*일|(\d{1,2})\s*월|(\d{1,2})\s*일|(~)/g;
  var toks=[],m;
  while((m=re.exec(str))!==null){
    if(m[5])toks.push({t:'~'});
    else if(m[1]!==undefined)toks.push({t:'d',mo:+m[1],dy:+m[2]});
    else if(m[3]!==undefined)toks.push({t:'m',mo:+m[3]});          /* '10월' 단독 → 뒤의 일자에 붙인다 */
    else toks.push({t:'d',dy:+m[4]});
  }
  for(var i=0;i<toks.length;i++){
    if(toks[i].t==='m'){
      for(var j=i+1;j<toks.length;j++){
        if(toks[j].t==='d'){ if(toks[j].mo===undefined)toks[j].mo=toks[i].mo; break; }
      }
      toks.splice(i,1); i--;
    }
  }
  var year=(ctx&&ctx.year)||new Date().getFullYear();
  var curMo=(ctx&&ctx.month)||null, curYr=year;
  var out=[],prev=null,pending=false;
  function resolve(tk){
    var mo=tk.mo,yr=curYr;
    if(mo===undefined||mo===null)mo=curMo;
    else{
      if(curMo!==null&&mo<curMo&&(curMo-mo)>=6)yr=curYr+1;         /* 12월 → 1월 해 넘김 */
      curMo=mo; curYr=yr;
    }
    if(mo===null||!tk.dy)return null;
    return{y:yr,m:mo,d:tk.dy};
  }
  function iso(o){return o.y+'-'+String(o.m).padStart(2,'0')+'-'+String(o.d).padStart(2,'0');}
  for(var k=0;k<toks.length;k++){
    var tk=toks[k];
    if(tk.t==='~'){pending=true;continue;}
    var cur=resolve(tk);
    if(!cur){pending=false;continue;}
    if(pending&&prev){
      var a=new Date(Date.UTC(prev.y,prev.m-1,prev.d)),b=new Date(Date.UTC(cur.y,cur.m-1,cur.d)),g=0;
      a=new Date(a.getTime()+86400000);
      while(a<=b&&g++<400){out.push(a.toISOString().slice(0,10));a=new Date(a.getTime()+86400000);}
    } else out.push(iso(cur));
    pending=false; prev=cur;
  }
  var seen={},uniq=[];
  out.forEach(function(d){if(!seen[d]){seen[d]=1;uniq.push(d);}});
  uniq.sort();
  return uniq;
}
/* 요일별 횟수를 '날짜 풀' 안의 해당 요일 날짜들에 분배. 나머지는 앞 날짜 우선.
   (요일 칸 합 = 횟수 이므로 결과 개수 = 횟수가 된다) */
function genDatesFromDOWOverPool(wdObj,pool){
  if(!pool||!pool.length)return[];
  var byDow={};
  pool.forEach(function(d){
    var dt=new Date(d+'T00:00:00Z');
    var w=WDAYS[(dt.getUTCDay()+6)%7];
    (byDow[w]=byDow[w]||[]).push(d);
  });
  var out=[];
  WDAYS.forEach(function(w){
    var need=+String((wdObj&&wdObj[w])||'').replace(/\.0*$/,'')||0;
    if(need<=0)return;
    var days=byDow[w]||[];
    if(!days.length)return;                                        /* 그 요일 날짜가 비고에 없으면 버린다 */
    var base=Math.floor(need/days.length), rem=need%days.length;
    days.forEach(function(d,idx){
      var n=base+(idx<rem?1:0);                                    /* 나머지는 앞 날짜 우선 */
      for(var i=0;i<n;i++)out.push(d);
    });
  });
  out.sort();
  return out;
}
/* 3대 행 생성 함수가 공유하는 진입점 — 로직을 한 곳에 두어 동기화 문제를 없앤다 */
function _bigoPoolDates(row,colInfo,p){
  var raw='';
  (colInfo.types||[]).forEach(function(t,ci){ if(t==='date'&&!raw)raw=T((row||[])[ci]); });
  var pool=parseBigoDates(raw,colInfo.periodCtx);
  if(pool.length)return genDatesFromDOWOverPool(p.wd,pool);
  return colInfo.periodCtx?genDatesFromDOWInPeriodSports(p.wd,colInfo.periodCtx):[];
}

function isEvenDistChannel(channel){
  var c=(channel||'').toString().trim().toUpperCase();
  return c==='MBC SPORTS'||c==='MBC SPORTS+'||c==='MBN';
}
// MBN '일자' 열처럼 "7/1~7/14" 형태로 해당 행에만 적용되는 기간(월 중 일부)을 지정하는 경우 파싱
// 단일 날짜/콤마목록이 아닌 "M/D~M/D" 범위일 때만 override 반환, 아니면 null
function parseDateRangeOverride(raw,ctx){
  var s=T(raw);
  var m=s.match(/^(\d{1,2})\/(\d{1,2})\s*[~\-–]\s*(\d{1,2})\/(\d{1,2})$/);
  if(!m)return null;
  var yr=ctx&&ctx.year?ctx.year:new Date().getFullYear();
  return{
    startISO:yr+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0'),
    endISO:yr+'-'+m[3].padStart(2,'0')+'-'+m[4].padStart(2,'0')
  };
}
// 화수목금 18:30-22:00, 토일 17:00-20:30. 월요일은 경기 없음(null).
function kboLiveTimeForDOW(dow){
  if(dow==='화'||dow==='수'||dow==='목'||dow==='금')return{st:'18:30',et:'22:00'};
  if(dow==='토'||dow==='일')return{st:'17:00',et:'20:30'};
  return null; // 월요일 또는 알 수 없음
}
// 요일별 횟수를 해당 월의 각 요일 날짜에 균등 분배(앞 주차 우선)
// 반환: ISO 날짜 배열 (중복 허용 — 1방송=1행 원칙)
// 예: 화 8회 + 5개 화요일 → [1주차화,1주차화,2주차화,2주차화,3주차화,3주차화,4주차화,5주차화]
function genDatesFromDOWInPeriodSports(wdObj,ctx){
  var dates=[];
  if(!ctx||!ctx.startISO||!ctx.endISO)return dates;
  var WDAYS_EN=['월','화','수','목','금','토','일'];
  var start=new Date(ctx.startISO+'T00:00:00Z');
  var end=new Date(ctx.endISO+'T00:00:00Z');
  if(isNaN(start)||isNaN(end))return dates;
  // 요일별 날짜 목록 수집(시간 순)
  var byDOW={};
  WDAYS_EN.forEach(function(d){byDOW[d]=[];});
  for(var d=new Date(start);d<=end;d.setUTCDate(d.getUTCDate()+1)){
    var dow=WDAYS_EN[(d.getUTCDay()+6)%7];
    var iso=d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');
    byDOW[dow].push(iso);
  }
  // 요일별로 균등 분배
  WDAYS_EN.forEach(function(dow){
    var raw=wdObj[dow];
    var cnt=+(String(raw==null?'':raw).replace(/\.0*$/,''))||0;
    if(cnt<=0||cnt>366)return; // 방어: 비정상적으로 큰 카운트(예: 금액 오분류)로 인한 행 폭주/멈춤 방지
    var dList=byDOW[dow];
    if(!dList.length)return;
    var N=dList.length;
    var base=Math.floor(cnt/N);
    var extra=cnt%N;
    for(var i=0;i<N;i++){
      var perWeek=base+(i<extra?1:0);
      for(var j=0;j<perWeek;j++)dates.push(dList[i]);
    }
  });
  return dates;
}
// KBO 생방 월요일 데이터 수집용 글로벌(merge 시 1회 팝업)
var _kboMondayWarnings=[];
/* ──────── [Q-Mate 1314–1756] 머리글 분류 · 시트 분류 · 행 처리 · 합계행 거르기 ──────── */
/* ═══════════════════════════════════
   HEADER CLASSIFICATION
═══════════════════════════════════ */
/* ── Q-Mate가 내보낸 엑셀(통합 큐시트 / raw 시트) 되읽기 ──
   헤더 행이 OUT_COLS 이름들로만 이뤄져 있으면 정규화를 건너뛰고 값을 그대로 사용한다. */
/* ═══ 이미 정리된 큐시트 엑셀의 헤더 별칭 (2026-09-09) ═══════════════
   Q-Mate가 내보낸 파일뿐 아니라, 사용자가 갖고 있는 '정리된 큐시트'도 그대로
   온보딩할 수 있게 한다. 같은 뜻인데 이름만 다른 헤더를 여기서 흡수한다.
   ⚠ 새 표기를 만나면 규칙을 고치지 말고 여기 한 줄만 추가할 것. */
var _QM_HDR_ALIAS={
  '프로그램명':'프로그램','프로그램 명':'프로그램','편성상품':'프로그램',
  '시작2':'시작시간','시작 시간':'시작시간','시작시각':'시작시간','시작':'시작시간',
  '종료2':'종료시간','종료 시간':'종료시간','종료시각':'종료시간','종료':'종료시간','끝':'종료시간',
  '구분':'CM위치','cm위치':'CM위치','형태':'CM위치',
  '총횟수':'횟수','총 횟수':'횟수','횟수(회)':'횟수',
  '날짜 (일)':'집행일','날짜(일)':'집행일','집행 일':'집행일',
  '시작날짜':'시작일자','종료날짜':'종료일자',
  '시작 날짜':'시작일자','종료 날짜':'종료일자',
  '소재명':'품목','품목명':'품목',
  '채널명':'채널','매체':'PP','매체사':'PP',
  '단가(원)':'단가','금액(원)':'금액',
  '지상파/케이블':'지상파/케이블 구분','지상파케이블 구분':'지상파/케이블 구분',
  '품목카테고리':'품목 카테고리'
};
function _qmHdrIdx(names,cell){
  var k=String(cell==null?'':cell).trim();
  if(!k)return -1;
  if(names[k]!=null)return names[k];
  var a=_QM_HDR_ALIAS[k]||_QM_HDR_ALIAS[k.toLowerCase()];
  if(a!=null&&names[a]!=null)return names[a];
  var sq=k.replace(/\s+/g,'');                       /* 공백만 다른 표기 흡수 */
  if(names[sq]!=null)return names[sq];
  var a2=_QM_HDR_ALIAS[sq];
  if(a2!=null&&names[a2]!=null)return names[a2];
  return -1;
}
function _qmDetectSheet(raw){
  if(!raw||raw.length<2)return null;
  var names={}; OUT_COLS.forEach(function(n,i){ names[String(n).trim()]=i; });
  for(var r=0;r<Math.min(raw.length,5);r++){
    var row=raw[r]||[];
    var cells=row.map(function(c){return String(c==null?'':c).trim();}).filter(function(c){return c!=='';});
    if(cells.length<5)continue;
    var hit=0,core=0;
    cells.forEach(function(c){
      var t=_qmHdrIdx(names,c);
      if(t>=0){ hit++; if(t===0||t===2||t===9||t===10||t===18)core++; }   /* 채널·프로그램·단가·횟수·날짜 */
      });
    /* 헤더 대부분이 매칭되고, 큐시트의 핵심 열이 3개 이상 있어야 '정리된 큐시트'로 본다 */
    if(hit>=cells.length*0.9&&hit>=5&&core>=3){
      var map=(row||[]).map(function(c){ return _qmHdrIdx(names,c); });
      return {headerRow:r,map:map};
    }
  }
  return null;
}
/* 정리된 큐시트를 불러올 때 비어 있는 파생 열을 채워 준다.
   이미 값이 있으면 절대 건드리지 않는다(Q-Mate 자체 내보내기 파일 보호). */
function _qmFillDerived(row){
  try{
    var ch=String(row[0]||'').trim();
    if(ch&&!row[29])row[29]=getBroadcastType(ch);
    if(ch&&!row[33]&&typeof getChannelPP==='function')row[33]=getChannelPP(ch);
    var soae=String(row[1]||'').trim();
    if(soae){
      if(!row[28]&&row[29]!=='지상파')row[28]=getItemLabel(soae);
      if(!row[43])row[43]=getLongName(soae);
    }
    if(!row[30]&&row[8])row[30]=normCM(row[8]);
    var dow=String(row[3]||'').trim();
    if(dow&&!row[31])row[31]=(dow==='토'||dow==='일')?'주말':((['월','화','수','목','금'].indexOf(dow)>=0)?'주중':'');
    if(dow){ for(var d=0;d<7;d++){ if(row[11+d]==='' ||row[11+d]==null)row[11+d]=(WDAYS[d]===dow)?1:''; } }
    /* 날짜(MM/DD)로 주차·집행일 계산 — 연도는 기존 행들에서 역추론 */
    var dm=String(row[18]||'').match(/^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*$/);
    if(dm){
      var mo=+dm[1],dy=+dm[2];
      var yr=(typeof _pvInferYear==='function')?_pvInferYear(mo,dy):(new Date()).getFullYear();
      if(row[19]===''||row[19]==null)row[19]=dy;
      if(row[20]===''||row[20]==null)row[20]=dy;
      if(row[21]===''||row[21]==null)row[21]=dy;
      var wk=getWeekNum(yr,mo,dy);
      if(row[34]===''||row[34]==null)row[34]=wk;
      if(!row[35])row[35]=getWeekRangeStr(yr,mo,wk);
      for(var w=0;w<6;w++){ if(row[22+w]===''||row[22+w]==null)row[22+w]=((w+1)===wk)?1:0; }
      if(soae){ for(var w2=0;w2<6;w2++){ if(!row[44+w2]&&(w2+1)===wk)row[44+w2]=soae; } }
    }
    /* 엑셀에서 문자열로 읽힌 숫자 열을 숫자로 되돌린다(정렬·합계·재내보내기 일관성) */
    [7,9,10,19,20,21,22,23,24,25,26,27,32,34,40,42,50].forEach(function(ci){
      var v=row[ci];
      if(typeof v==='string'&&v.trim()!==''&&/^-?\d+(\.\d+)?$/.test(v.trim()))row[ci]=+v.trim();
    });
    if(!row[36])row[36]=soae+' / '+(row[7]?row[7]+'초':'')+' / '+(row[8]||'');
    if(row[32]===''||row[32]==null)row[32]=row[9];
    /* 금액(50)은 일반 온보딩 경로에서도 비워 두는 열이라 여기서도 채우지 않는다
       — 불러오기한 파일만 값이 생겨 서로 달라 보이는 걸 막기 위함 */
  }catch(e){window._qmSoft&&window._qmSoft('_qmFillDerived',e);}
  return row;
}
/* Q-Mate 시트 → OUT_COLS 길이의 행 배열 */
function _qmSheetRows(sh){
  if(!sh||!sh.qmate)return null;
  var q=sh.qmate,out=[];
  for(var r=q.headerRow+1;r<sh.raw.length;r++){
    var src=sh.raw[r]||[];
    var any=src.some(function(c){ return String(c==null?'':c).trim()!==''; });
    if(!any)continue;
    var row=new Array(OUT_COLS.length);
    for(var i=0;i<OUT_COLS.length;i++)row[i]='';
    for(var c=0;c<q.map.length;c++){ var t=q.map[c]; if(t>=0)row[t]=(src[c]==null?'':src[c]); }
    if(!row[0]&&!row[2])continue;                 /* 채널·프로그램 둘 다 없으면 합계행 등으로 보고 건너뜀 */
    if(row[10]===''||row[10]==null)row[10]=1;     /* 횟수 기본 1 */
    _qmFillDerived(row);
    out.push(row);
  }
  return out;
}
function classifyByHeader(h,fn){
  var hl=T(h).replace(/[\n\r]+/g,' ').toLowerCase().trim();
  if(!hl)return'';
  if(hl==='비고')return'date';
  if(hl==='운행예정일')return'date'; // KBS스포츠: 회차별 정확한 방송일 목록 열
  if(hl==='형태')return'cmposition';
  if(hl==='시작'||hl==='시작시간'||hl==='방영시간 시작')return'starttime';
  if(hl==='끝'||hl==='종료'||hl==='종료시간'||hl==='방영시간 끝'||hl==='방영시간 종료')return'endtime';
  if(hl.indexOf('날짜')>=0||hl.indexOf('방송일')>=0||hl.indexOf('방영일')>=0||hl.indexOf('일자')>=0)return'date';
  if(hl.indexOf('청약시작일')>=0)return'date';
  if(hl==='송출일')return'dayofmonth';
  if(hl==='요일'||hl==='day')return'dayofweek';
  if(hl.indexOf('프로그램')>=0||hl==='program')return'program';
  // 지상파 프로그램명 헤더 (also handles merged headers like '편성명 xxx')
  if(hl.indexOf('편성명')>=0||hl.indexOf('편성상품')>=0)return'program';
  // 지상파 구분 헤더 (중밴드 위치, 중CM위치)
  var hlnsp=hl.replace(/\s+/g,'');
  if(hlnsp==='중밴드위치'||hlnsp==='중cm위치')return'jisangpa_gubn';
  // CM지정위치 → jisangpa_gubn2 (SBS 두 번째 구분 컬럼) / CM지정 → 동일 역할(MBC-TV 지상파, 정확히 일치할 때만 — 'CM지정율'/'CM지정료'와 혼동 방지)
  if(hlnsp==='cm지정위치'||hlnsp==='cm지정')return'jisangpa_gubn2';
  // 청약금액 헤더
  if(hlnsp==='방송금액'||hlnsp==='첫달금액'||hlnsp.indexOf('금액(방송')>=0||hlnsp==='청약금액')return'cheong_amount';
  var fnL=(fn||'').toLowerCase();
  var isJosun=fnL.indexOf('조선')>=0,isChA=fnL.indexOf('채널a')>=0;
  var isKBSJoy=fnL.indexOf('kbs조이')>=0||fnL.indexOf('kbs joy')>=0||fnL.indexOf('kbsjoy')>=0;
  if(hl==='cm위치'){return (isJosun||isChA)&&!isKBSJoy?'cmpos_ex':'cmposition';}
  if(hl==='구분'&&isKBSJoy)return'cmposition'; // KBS Joy uses '구분' for CM position
  if(hl==='pib'&&isChA)return'pib_col';
  if(hl.indexOf('초수')>=0||hl==='length'||hl.indexOf('소재길이')>=0)return'duration';
  if(hl.indexOf('시급')>=0||hl==='class')return'grade';
  if(hl.indexOf('단가')>=0||hl==='cost'||(hl.indexOf('cost')>=0&&hl.indexOf('단위')>=0))return'unitprice';
  if(hl.indexOf('방영시간')>=0||hl==='airtime'||hl==='time')return'time_col';
  var hlc=hl.replace(/\s+/g,'');
  if(hlc.indexOf('집행횟수')>=0)return'count';
  if(hlc.indexOf('총횟수')>=0)return'count';
  if(hlc.indexOf('월간횟수')>=0||hlc.indexOf('주간횟수')>=0)return'count';
  if(hlc==='첫달횟수')return'count';
  if(hlc==='횟수'||hlc==='spotno'||hlc==='spot')return'count';
  // Exact single-char DOW
  if(hl==='월'||hl==='mon')return'wd_월';
  if(hl==='화'||hl==='tue')return'wd_화';
  if(hl==='수'||hl==='wed')return'wd_수';
  if(hl==='목'||hl==='thu')return'wd_목';
  if(hl==='금'||hl==='fri')return'wd_금';
  if(hl==='토'||hl==='sat')return'wd_토';
  if(hl==='일'||hl==='sun')return'wd_일';
  // '구분' — KBS Joy/MBC/KBSN 등 대부분 채널에서 CM위치로 사용
  // 헤더로 강제 분류하지 않고, data-driven heuristic (isCMVal)에 위임
  // 연합뉴스TV는 "구분(채널)" 형태라 여기 매칭 안됨
  // YTN 'Kinds' column = CM위치
  if(hl==='kinds')return'cmposition';
  // YTN 'spot no.' or 'spot no'
  if(hlc==='spotno.'||hlc==='spotno')return'count';
  // YTN 'b order' → ignore (청약구분)
  if(hl==='b order')return'';
  // YTN 'total' → ignore (금액합계)
  if(hl==='total')return'';
  // 연합뉴스TV '소재 길이' / '소재길이' (spaces removed already handled, add with space)
  if(hl==='소재 길이')return'duration';
  // 연합뉴스TV '월간금액' → ignore (금액계산)
  if(hlc==='월간금액')return'';
  // Compound DOW headers: "DAY 월", "day 화", "요일 수", "방영일 월", "DAY Mon" — 병합 헤더
  var _WD=['월','화','수','목','금','토','일'];
  var _WD_EN=['mon','tue','wed','thu','fri','sat','sun'];
  for(var _i=0;_i<_WD.length;_i++){
    if(hl.indexOf(_WD[_i])>=0){
      // must also contain a day/요일 keyword or be short (<=4 chars)
      // '금액'(금)·'토요'(토) 등 오분류 방지: day/요일/방영일 키워드가 있거나, DOW 글자만 남는 헤더일 때만 요일로 인정
      if(hl.indexOf('day')>=0||hl.indexOf('요일')>=0||hlnsp.indexOf('방영일')>=0||hl.split(_WD[_i]).join('').replace(/[\s()\[\]（）.\-_]/g,'')==='')return'wd_'+_WD[_i];
    }
    // 영문 요일 약어가 'DAY'와 함께 병합된 경우 (예: MBN "DAY Mon")
    if(hl.indexOf(_WD_EN[_i])>=0&&hl.indexOf('day')>=0)return'wd_'+_WD[_i];
  }
  return'';
}

/* ═══════════════════════════════════
   SHEET CLASSIFICATION
═══════════════════════════════════ */
function classifySheet(rawData,fileName){
  var SCAN=Math.min(rawData.length,200),THRESH=0.2;
  var fn=fileName||'';
  var isJosun=fn.indexOf('조선')>=0,isChA=fn.toLowerCase().indexOf('채널a')>=0;
  var hIdx=autoDetectHeader(rawData);
  var sIdx=detectSubHeader(rawData,hIdx);
  var mainHdr=(rawData[hIdx]||[]).map(T);
  var subHdr=sIdx>=0?(rawData[sIdx]||[]).map(T):[];
  var headers=sIdx>=0?mergeHeaders(mainHdr,subHdr):mainHdr;
  var dataStart=(sIdx>=0?sIdx:hIdx)+1;
  var preRows=rawData.slice(0,hIdx);
  var dataRows=rawData.slice(dataStart);
  var periodCtx=scanPeriod(preRows,fn);
  var n=headers.length;
  var types=new Array(n).fill('unknown');
  var mults=new Array(n).fill(1);

  for(var ci=0;ci<n;ci++){
    var hb=classifyByHeader(headers[ci],fn);
    if(hb){
      types[ci]=hb;
      if(hb==='unitprice'){
        var fullH=T(headers[ci]);
        if(fullH.indexOf('천원')>=0){mults[ci]=1000;}
        else{for(var pi=0;pi<preRows.length;pi++){if(T((preRows[pi]||[])[ci]).indexOf('천원')>=0){mults[ci]=1000;break;}}}
      }
    }
  }

  /* ═══ SBS 지상파 큐시트: 단가 = '청약금액' (2026-08-27 사용자 확정) ═══
     이 양식에는 금액 열이 셋이다 — 청약금액(정가) = 방송금액(유상분) + 보너스금액(무상분).
     세 열 모두 헤더 판정에서 unitprice가 아니라, 아래 숫자 패턴 폴백이
     '남은 첫 숫자 열'인 **보너스금액**을 단가로 집어가고 있었다
     (그래서 단가 합계가 청약 1,371,000,000이 아니라 보너스 1,254,000,000으로 나왔다).
     → 청약금액을 단가로 명시 지정하고, 방송금액·보너스금액은 폴백이 손대지 못하게 막는다.
     ⚠ 적용 범위는 SBS 지상파 파일로 한정(사용자 확정). 채널 판정은 앱의 매핑 규칙
       (lookupPC)을 그대로 쓰므로 'SBS 플러스' 같은 케이블 계열은 자동으로 제외된다. */
  (function(){
    try{
      if(typeof lookupPC!=='function')return;
      var pc=lookupPC(fn,'');
      if(!pc||pc.channel!=='SBS')return;
      if(typeof getBroadcastType==='function'&&getBroadcastType(pc.channel)!=='지상파')return;
      var iCheong=-1;
      for(var k=0;k<n;k++){
        var hk=T(headers[k]).replace(/\s+/g,'');
        if(hk==='청약금액'){ if(iCheong<0)iCheong=k; }
        else if(hk==='방송금액'||hk==='보너스금액'){ types[k]='amount_split'; }
      }
      if(iCheong<0)return;
      types[iCheong]='cheong_unitprice';
      /* 단가와 동일하게 '천원' 단위 표기도 반영 */
      var fullH=T(headers[iCheong]);
      if(fullH.indexOf('천원')>=0){mults[iCheong]=1000;}
      else{for(var pi=0;pi<preRows.length;pi++){if(T((preRows[pi]||[])[iCheong]).indexOf('천원')>=0){mults[iCheong]=1000;break;}}}
    }catch(e){window._qmSoft&&window._qmSoft('classifySheet-SBS청약금액',e);}
  })();

  /* SPOTV: 채널이 A열에 행마다 있다(헤더가 비어 있어 헤더 판정으로는 못 잡는다) */
  (function(){
    try{
      if(typeof lookupPC!=='function')return;
      var pc0=lookupPC(fn,'');
      if(!isBigoDistChannel(pc0))return;
      for(var k=0;k<n;k++){
        if(types[k]!=='unknown')continue;
        var hit=0,tot=0;
        for(var ri2=0;ri2<Math.min(30,dataRows.length);ri2++){
          var v2=T((dataRows[ri2]||[])[k]); if(!v2)continue;
          tot++; if(_spotvNormCh(v2))hit++;
        }
        /* 맨 아래 'Grand Total' 같은 합계행이 섞여 있으므로 전부 일치까지 요구하지 않는다 */
        if(hit>=2&&hit>=Math.ceil(tot*0.6)){ types[k]='channel_row'; break; }
      }
    }catch(e){window._qmSoft&&window._qmSoft('classifySheet-SPOTV',e);}
  })();

  var smp=headers.map(function(_,ci){
    var arr=[];
    for(var ri=0;ri<Math.min(SCAN,dataRows.length);ri++){var v=T((dataRows[ri]||[])[ci]);if(v)arr.push(v);}
    return arr;
  });
  function sc(ci,fn_){var s=smp[ci];if(!s.length)return 0;return s.filter(fn_).length/s.length;}

  for(var ci=0;ci<n;ci++){
    if(types[ci]!=='unknown')continue;
    if(sc(ci,isCombTime)>=THRESH){types[ci]='time_col';continue;}
    if(sc(ci,function(v){return isMD(v)||isISO(v)||isISODT(v);})>=THRESH){types[ci]='date';continue;}
    if(sc(ci,isMMDD)>=THRESH){
      var hl2=headers[ci].toLowerCase();
      if(hl2.indexOf('시작')<0&&hl2.indexOf('종료')<0&&hl2.indexOf('끝')<0){types[ci]='date';continue;}
    }
    if(sc(ci,isDOW)>=THRESH){types[ci]='dayofweek';continue;}
    if(sc(ci,isDur)>=THRESH){types[ci]='duration';continue;}
    if(!isJosun&&!isChA&&sc(ci,isCMVal)>=THRESH){types[ci]='cmposition';continue;}
    if(!isJosun&&sc(ci,isSAVal)>=THRESH){types[ci]='grade';continue;}
    if(sc(ci,isNumNoComma)>=0.5&&types.indexOf('unitprice')<0){types[ci]='unitprice';continue;}
    if(smp[ci].some(hasAllZeros)&&types.indexOf('unitprice')<0){types[ci]='unitprice';continue;}
  }

  var timeCols=[];
  for(var ci=0;ci<n;ci++){
    if(types[ci]!=='unknown')continue;
    if(sc(ci,function(v){return isHHMM(T(v));})>=THRESH)timeCols.push(ci);
  }
  if(timeCols.length>=1&&types.indexOf('starttime')<0)types[timeCols[0]]='starttime';
  if(timeCols.length>=2&&types.indexOf('endtime')<0)types[timeCols[1]]='endtime';
  if(types.indexOf('starttime')<0){
    for(var ci=0;ci<n;ci++){
      if(types[ci]!=='unknown')continue;
      if(headers[ci].indexOf('시작')>=0&&sc(ci,function(v){return is4dTime(T(v));})>=THRESH){types[ci]='starttime';break;}
    }
  }
  if(types.indexOf('endtime')<0){
    for(var ci=0;ci<n;ci++){
      if(types[ci]!=='unknown')continue;
      var hl3=headers[ci];
      if((hl3.indexOf('종료')>=0||hl3.indexOf('끝')>=0)&&sc(ci,function(v){return is4dTime(T(v));})>=THRESH){types[ci]='endtime';break;}
    }
  }

  return{types:types,mults:mults,headers:headers,dataRows:dataRows,hIdx:hIdx,sIdx:sIdx,periodCtx:periodCtx};
}

/* ═══════════════════════════════════
   ROW PROCESSING
═══════════════════════════════════ */
function processRow(row,colInfo,fileName){
  var fn=(fileName||'').toLowerCase();
  var isJosun=fn.indexOf('조선')>=0,isChA=fn.indexOf('채널a')>=0;
  // Terrestrial file detection (for 청약금액 restriction)
  var isTerrestrialFile= fn.indexOf(' kbs ')>=0||fn.indexOf('_kbs_')>=0||
    fn.indexOf(' sbs ')>=0||fn.indexOf('_sbs_')>=0||
    fn.indexOf(' mbc ')>=0||fn.indexOf('_mbc_')>=0||
    fn.indexOf('kbs_큐시트')>=0||fn.indexOf('sbs_큐시트')>=0||fn.indexOf('mbc_')>=0;
  var types=colInfo.types,mults=colInfo.mults,ctx=colInfo.periodCtx;
  var date='',dow='',st='',et='',dur='',cm='',grade='',price='',prog='',cnt=1;
  var wd={};WDAYS.forEach(function(d){wd[d]='';});
  var pibVal='',cmExVal='',chanRow='';
  var jisangpaGubn='',jisangpaGubn2='',cheongAmt='';

  for(var ci=0;ci<types.length;ci++){
    var v=T((row||[])[ci]);
    if(!v)continue;
    var t=types[ci];
    switch(t){
      case'date':if(!date){date=normDateFull(v,null);
        if(!date&&/^\d{5}$/.test(v)){var s2=+v;if(s2>40000&&s2<55000)date=excelSerialToISO(s2);}
        break;}break;
      case'dayofmonth':if(!date&&ctx){
        var _dv=T(v).replace(/[^\d]/g,'');
        if(_dv&&_dv.length<=2&&+_dv>=1&&+_dv<=31&&ctx.year&&ctx.month){
          date=ctx.year+'-'+String(ctx.month).padStart(2,'0')+'-'+String(+_dv).padStart(2,'0');
        }else{date=normDateFull(v,ctx);}
      }break;
      case'dayofweek':if(!dow&&isDOW(v))dow=v;break;
      case'starttime':if(!st)st=normTime(v);break;
      case'endtime':if(!et)et=normTime(v);break;
      case'time_col':{var ct=parseComb(v);if(ct){if(!st)st=ct.s;if(!et)et=ct.e;}else{var nt=normTime(v);if(!st&&nt)st=nt;}break;}
      case'duration':if(!dur){var dv=v.replace(/[″"\'초\s]/g,'').replace(/\.0*$/,'');if(isDur(dv))dur=dv;}break;
      case'cmpos_ex':if(!cmExVal)cmExVal=v+'CM';break;
      case'pib_col':if(!pibVal)pibVal=v;break;
      case'cmposition':if(!cm)cm=v;break;
      case'grade':if(!grade)grade=v;break;
      case'unitprice':if(price===''){var raw=v.replace(/,/g,'').replace(/\.0*$/,'');if(/^\d+$/.test(raw)){var num=+raw*mults[ci];if(num>0)price=Math.round(num);}}break;
      case'channel':break; // channel is set from mapping table, not from cell
      case'channel_row':if(!chanRow)chanRow=_spotvNormCh(v);break;   /* SPOTV: 행마다 A열에 채널 */
      case'program':if(!prog)prog=v;break;
      case'count':{var cv=+v.replace(/\.0*$/,'').replace(/,/g,'');if(!isNaN(cv)&&cv>1&&cnt===1)cnt=cv;break;}
      case'jisangpa_gubn':if(!jisangpaGubn)jisangpaGubn=v;break;
      case'jisangpa_gubn2':if(!jisangpaGubn2)jisangpaGubn2=v;break;
      case'cheong_amount':if(isTerrestrialFile&&!cheongAmt){var ca=v.replace(/,/g,'').replace(/\.0*$/,'');if(/^\d+$/.test(ca)&&+ca>0)cheongAmt=Math.round(+ca*mults[ci]);}break;
      /* SBS 지상파: 청약금액 = 단가. 편성분석표용 cheongAmt도 같은 값으로 채운다. */
      case'cheong_unitprice':{
        var cu=v.replace(/,/g,'').replace(/\.0*$/,'');
        if(/^\d+$/.test(cu)){
          var cn=Math.round(+cu*mults[ci]);
          if(cn>0){ if(price==='')price=cn; if(!cheongAmt)cheongAmt=cn; }
        }
        break;
      }
      /* 방송금액·보너스금액 = 청약금액을 유상/무상으로 쪼갠 값. 단가가 아니므로 읽지 않는다. */
      case'amount_split':break;
      default:if(t.slice(0,3)==='wd_'){var day=t.slice(3);if(wd.hasOwnProperty(day)&&!wd[day])wd[day]=v;}
    }
  }
  if(isChA){cm=pibVal?'PIB':(cmExVal||cm);}else if(isJosun){if(cmExVal)cm=cmExVal;}
  // Combine SBS dual-column 지상파 구분 (중CM위치 + CM지정위치)
  var jisangpaCombined=jisangpaGubn&&jisangpaGubn2?(jisangpaGubn+'+'+jisangpaGubn2):(jisangpaGubn||jisangpaGubn2||'');
  // For terrestrial: derive 구분(I열) from 지상파 구분 when cm is empty
  if(!cm&&jisangpaCombined)cm=jisangpaCombined;
  if(!dow){for(var i=0;i<WDAYS.length;i++){var wv=T(wd[WDAYS[i]]).replace(/\.0*$/,'');if(wv==='1'){dow=WDAYS[i];break;}}}
  // Derive DOW from date if still not found
  if(!dow&&date){try{var _yr=+date.slice(0,4),_mo=+date.slice(5,7),_dy=+date.slice(8,10);dow=WDAYS[(new Date(Date.UTC(_yr,_mo-1,_dy)).getUTCDay()+6)%7];}catch(e){window._qmSoft&&window._qmSoft('processRow',e);}}
  // Normalize <본방> variants in program name (fullwidth brackets, HTML entities, etc)
  if(prog){
    // Handle HTML entities from XLSX parser
    /* <본방>/<생방>/<특집> 표기 정규화(전각·대괄호·소괄호 등 모든 변형) */
    prog=_progNormTags(prog);
    // Replace tilde with hyphen to avoid Excel errors
    prog=prog.replace(/~/g,'-');
  }
  return{date:date,dow:dow,st:st,et:et,dur:dur,cm:cm,grade:grade,price:price,prog:prog,cnt:cnt,jisangpaGubn:jisangpaCombined,cheongAmt:cheongAmt,wd:wd,chan:chanRow};
}

/* ═══════════════════════════════════
   PROGRAM NAME NORMALIZATION (spacing)
═══════════════════════════════════ */
function normPrograms(normRows){
  var PROG_IDX=2;
  var cnt={};
  normRows.slice(1).forEach(function(row){
    var p=T(row[PROG_IDX]);if(!p)return;
    var k=p.replace(/\s+/g,'');
    if(!cnt[k])cnt[k]={};
    cnt[k][p]=(cnt[k][p]||0)+1;
  });
  var canonical={};
  Object.keys(cnt).forEach(function(k){
    var variants=cnt[k];
    var best=Object.keys(variants).sort(function(a,b){return variants[b]-variants[a];})[0];
    canonical[k]=best;
  });
  normRows.slice(1).forEach(function(row){
    var p=T(row[PROG_IDX]);if(!p)return;
    var k=p.replace(/\s+/g,'');
    if(canonical[k])row[PROG_IDX]=canonical[k];
  });
}

/* ═══════════════════════════════════
   JUNK ROW FILTER
═══════════════════════════════════ */
var JUNK_PROG_PATTERNS=[/합계/,/총계/,/소계/,/subtotal/i,/^total$/i,/^sum$/i,/^합$/,/소합/,
  /^※/,/^No\.?$/i,/^프로그램$/,/^채널$/,/^방송국$/,/^광고주$/,/^편성/,
  /상기\s*운영/,/방송\s*편성/,/일별\s*기입/,/^구분$/,/^비고$/,/^시작$/,/^종료$/];
function isJunkRow(p){
  if(!p.prog)return true;
  var pg=p.prog.trim();
  if(!pg)return true;
  // 글자 사이에 공백이 들어간 합계행 대응 (예: '총          계') — 공백 제거본도 함께 검사
  var pgns=pg.replace(/\s+/g,'');
  for(var i=0;i<JUNK_PROG_PATTERNS.length;i++){if(JUNK_PROG_PATTERNS[i].test(pg)||JUNK_PROG_PATTERNS[i].test(pgns))return true;}
  // purely numeric prog name (likely a sum cell)
  if(/^\d[\d,\.]*$/.test(pg))return true;
  return false;
}

/* ──────── [Q-Mate 1760–1795] 프로그램명 유사도 ──────── */
var progNameMap=progNameMapLocal;
var bonbangChecked={};
var bonbangCandidateList=[];
var _analysisRunning=false;
var progChannelMap={};  // prog → channel name (for sim table display)

function normForSim(name){
  // Strip leading [태그] prefix (e.g. [예능], [드라마], [프리미엄 재방])
  var s=name.replace(/^\[.*?\]/,'');
  // Strip trailing (재), (재방), (재방송) etc.
  s=s.replace(/\([재방복]{1,4}\)$/,'');
  // Strip spaces
  s=s.replace(/\s+/g,'');
  return s;
}

function strSimilarity(a,b){
  var A=normForSim(a),B=normForSim(b);
  if(!A.length||!B.length)return 0;
  // Require minimum length to avoid short-string false positives
  if(A.length<=1||B.length<=1)return 0;
  var common=0,usedB=new Array(B.length).fill(false);
  for(var i=0;i<A.length;i++){
    for(var j=0;j<B.length;j++){
      if(!usedB[j]&&A[i]===B[j]){common++;usedB[j]=true;break;}
    }
  }
  // Use Dice-like: penalize if lengths are very different
  var ratio=Math.min(A.length,B.length)/Math.max(A.length,B.length);
  var rawSim=common/Math.max(A.length,B.length);
  // If length ratio < 0.4, apply extra penalty (e.g. 아는형님 vs 혼자는못해도)
  if(ratio<0.4)rawSim*=ratio;
  return rawSim;
}

function applyProgMap(name){if(!name)return name;var mapped=progNameMap[name];if(mapped&&mapped!==name&&strSimilarity(name,mapped)<0.2)mapped='';return (mapped||name);}
/* ──────── [Q-Mate 1842–1988] 행 만들기 (1행 1송출) ──────── */
function buildPreviewNormRows(){
  var normRows=[OUT_COLS.slice()];
  var loaded=files.filter(function(f){return f.status==='loaded';});
  loaded.forEach(function(f){
    var _dupSheets=findDuplicateSheetNames(f);
    var _fileRows=[];
    f.sheets.forEach(function(sh,_shIdx){
      if(_dupSheets[sh.name])return; // 동일 파일 내 중복 시트(동일 PP/채널+동일 데이터) 제외
      if(sh.qmate){ var _qr=_qmSheetRows(sh); if(_qr)_qr.forEach(function(_q){ if(!_q[55])_q[55]=f.name; if(!_q[57])_q[57]=sh.name||''; _fileRows.push({row:_q,sh:_shIdx});}); return; }   /* Q-Mate 내보낸 엑셀은 정규화 없이 그대로 */
      var pc=lookupPC(f.name,sh.name);
      if(!pc.pp&&!pc.channel)return;
      if(!sh.colInfo||!sh.colInfo.types||!sh.dataRows)return;
      var _isSportsMBC=isSportsChannelMBC(pc.channel);
      var _isEvenDist=isEvenDistChannel(pc.channel);
      var _isBigoDist=isBigoDistChannel(pc);
      sh.dataRows.forEach(function(row,_ri){
        var p=processRow(row,sh.colInfo,f.name);
        /* SPOTV류: 채널이 행마다 A열에 있다. 병합으로 비어 있는 행은 pc를 그대로 두어
           직전 채널을 물려받는다(같은 시트 안에서만 유지된다). */
        if(p.chan&&p.chan!==pc.channel)pc={pp:pc.pp,channel:p.chan};
        // 합계/총계/안내문 등 junk 행 제외 — 합계행의 요일 카운트가 날짜로 확장되는 것 방지 (3대 함수 동기화)
        if(p.prog&&isJunkRow(p))return;
        // Build list of ISO dates to generate rows for
        var allDates=[];
        var hasWD=p.wd&&Object.keys(p.wd).some(function(k){
          var v=p.wd[k];return v&&+String(v).replace(/\.0*$/,'')>0;
        });
        // MBC SPORTS 채널: 요일 카운트가 있으면 비고(date)보다 우선 — 비고는 안내문일 뿐
        var _hasWDSports=_isSportsMBC&&hasWD;
        var _hasWDEvenDist=false;
        if(_isBigoDist&&hasWD){
          /* SPOTV: 비고의 날짜 목록을 풀로 삼아 요일별 횟수를 분배 (3대 함수 동기화) */
          allDates=_bigoPoolDates(row,sh.colInfo,p);
          _hasWDEvenDist=true;
        } else if(_hasWDSports&&sh.colInfo.periodCtx){
          allDates=genDatesFromDOWInPeriodSports(p.wd,sh.colInfo.periodCtx);
        } else if(p.date){
          // Check raw cell for comma-separated multi-dates
          var rawDV='';
          sh.colInfo.types.forEach(function(t,ci){if(t==='date'&&!rawDV)rawDV=T((row||[])[ci]);});
          if(rawDV.indexOf(',')>=0){
            allDates=parseMultiDate(rawDV,sh.colInfo.periodCtx);
          }
          if(!allDates.length)allDates.push(p.date);
          // 명시된 횟수(월간횟수 등)가 실제 나열된 날짜 수보다 많으면 마지막 날짜를 반복해 횟수를 맞춤
          // (방송사 원본에 날짜가 일부 누락된 경우 대응 — 총 횟수를 우선 신뢰)
          if(allDates.length>1&&p.cnt>allDates.length){
            var _lastD=allDates[allDates.length-1];
            while(allDates.length<p.cnt)allDates.push(_lastD);
          }
        } else if(_isEvenDist&&hasWD&&sh.colInfo.periodCtx){
          // MBN류: 구체적 날짜 없이 요일별 "횟수"만 존재 → 균등분배
          // 해당 행에 기간 오버라이드 열(예: MBN '일자'="7/1~7/14")이 있으면 그 기간만 사용
          var _distCtx=sh.colInfo.periodCtx;
          var _rangeOv=null;
          sh.colInfo.types.forEach(function(t,ci){if(t==='date'&&!_rangeOv)_rangeOv=parseDateRangeOverride((row||[])[ci],sh.colInfo.periodCtx);});
          if(_rangeOv)_distCtx=_rangeOv;
          allDates=genDatesFromDOWInPeriodSports(p.wd,_distCtx);
          _hasWDEvenDist=true;
        } else {
          // No explicit date: expand from DOW columns + period range
          if(hasWD&&sh.colInfo.periodCtx){
            allDates=genDatesFromDOWInPeriod(p.wd,sh.colInfo.periodCtx);
          }
        }
        if(!allDates.length)return;
        // Skip rows with no meaningful content (empty prog, no time, no cm)
        if(!p.prog&&!p.st&&!p.cm&&!p.grade)return;
        // 스포츠/균등분배 채널: 이미 중복 횟수 반영된 1방송=1행, 추가 반복 안함
        var _datesFromDOW=!p.date||_hasWDSports||_hasWDEvenDist;
        var _isDistributed=_hasWDSports||_hasWDEvenDist;
        var _rawProgEarly=_progNormTags(p.prog||'');
        var _isKBOLive=_isSportsMBC&&isKBOLiveProgram(applyProgMap(_rawProgEarly));

        allDates.forEach(function(dateISO){
          var yr=+dateISO.slice(0,4),mo=+dateISO.slice(5,7),dy=+dateISO.slice(8,10);
          var mmdd=String(mo).padStart(2,'0')+'/'+String(dy).padStart(2,'0');
          var wk=getWeekNum(yr,mo,dy);
          var isTerrestrial=(pc.channel==='KBS'||pc.channel==='MBC'||pc.channel==='SBS');
          var dow=p.dow;
          // 스포츠 분배 모드일 때는 dow를 날짜에서 강제 도출(소스 row의 단일 dow를 신뢰하지 않음)
          if(_isDistributed||!dow){try{var _dd=new Date(Date.UTC(yr,mo-1,dy));dow=WDAYS[(_dd.getUTCDay()+6)%7]||'';}catch(e){window._qmSoft&&window._qmSoft('buildPreviewNormRows',e);}}
          // KBO 생방: 월요일이면 행 생성 생략(경기 없음 — 미리보기에서는 조용히 스킵)
          if(_isKBOLive&&dow==='월')return;
          // KBO 생방: 요일별 시작/종료 시간 자동 적용
          var stOver=p.st, etOver=p.et;
          if(_isKBOLive){
            var t=kboLiveTimeForDOW(dow);
            if(t){stOver=t.st; etOver=t.et;}
          }
          var wkCols=['','','','','',''];
          if(wk>=1&&wk<=6)wkCols[wk-1]=1;
          var dowCols=WDAYS.map(function(d){return dow===d?1:'';});
          var _rawProg=p.prog||'';
          // Extra normalization for <본방> in case processRow didn't catch it
          _rawProg=_rawProg.replace(/&lt;/g,'<').replace(/&gt;/g,'>');
          _rawProg=_progNormTags(_rawProg);
          var progNameRaw=applyProgMap(_rawProg);
          var _oTags=_progTags(progNameRaw);
          var origHasBonbang=_oTags.indexOf('본방')>=0;
          var progName=_progBase(progNameRaw);
          var bonbangKey=pc.channel+'|'+progName+'|'+dow+'|'+stOver+'|'+etOver;
          progName=_progWithTags(progName,(bonbangChecked[bonbangKey]||origHasBonbang)?_oTags.concat(['본방']):_oTags);
          var soaeName=getSoakedLabel(f.name);
          if(isTerrestrial)soaeName='미지정';
          var cmNormed=normCM(p.cm);
          var price=p.price===''?'':p.price;
          var dur=p.dur||'';
          var price15=price===''?'':(dur==='30'?Math.round(+price/2):(+price));
          var wkLabels=['','','','','',''];
          if(wk>=1&&wk<=6)wkLabels[wk-1]=soaeName;
          var baseRow=[
            pc.channel,soaeName,progName,dow,stOver,etOver,p.grade,
            dur?+dur:'',cmNormed,price,1,
            dowCols[0],dowCols[1],dowCols[2],dowCols[3],dowCols[4],dowCols[5],dowCols[6],
            mmdd,dy,dy,dy,
            wkCols[0]||0,wkCols[1]||0,wkCols[2]||0,wkCols[3]||0,wkCols[4]||0,wkCols[5]||0,
            isTerrestrial?'':getItemLabel(soaeName),
            getBroadcastType(pc.channel),cmNormed,
            (dow==='토'||dow==='일')?'주말':(['월','화','수','목','금'].indexOf(dow)>=0?'주중':''),
            price,getPPVal(pc.pp),wk,getWeekRangeStr(yr,mo,wk),
            soaeName+' / '+(dur?dur+'초':'')+' / '+cmNormed,
            '',0,0,0,0,price15,getLongName(soaeName),0,
            wkLabels[0],wkLabels[1],wkLabels[2],wkLabels[3],wkLabels[4],wkLabels[5],
            '','',''
          ];
          var reps=(allDates.length>1||_datesFromDOW)?1:Math.max(1,Math.round(p.cnt));
          baseRow[55]=f.name;
          baseRow[56]=String(p.cm==null?'':p.cm).trim();   /* CM위치(미보정) */
          baseRow[57]=sh.name||'';  baseRow[58]=_ri;   /* [앱] 원본 데이터 행 번호 */                          /* 원본 시트명 — 매핑 재적용용 */
          for(var ri=0;ri<reps;ri++)_fileRows.push({row:baseRow.slice(),sh:_shIdx});
        }); // end allDates.forEach
      });
    });
    // 파일 내 "다른 시트"에서 나온 완전 동일 방송 슬롯만 중복 제거(같은 시트 내 정상 반복은 보존)
    // — "통합"/"일자별"처럼 레이아웃은 다르지만 같은 스케줄을 담은 시트 쌍 대응
    dedupFileRowEntries(_fileRows).forEach(function(row){normRows.push(row);});
  });
  var _obD=_todayISO(); for(var _oi=1;_oi<normRows.length;_oi++){ if(!normRows[_oi][54])normRows[_oi][54]=_obD; }
  if(false){
    var _merged=[normRows[0]];
    window._consolidatedRows.forEach(function(_cr){_merged.push(_cr);});
    for(var _mi=1;_mi<normRows.length;_mi++)_merged.push(normRows[_mi]);
    return _merged;
  }
  return normRows;
}
  // 엑셀 파일 1개 → { name, sheets:[{name, raw, colInfo, dataRows, qmate}], hiddenSheets }
  function parseWorkbook(data, name) {
    var entry = { name: name, status: 'loaded', sheets: [], hiddenSheets: [] };
    var wb = XLSX.read(data, { type: 'array', cellFormula: false, cellHTML: false, cellNF: true, cellDates: false });
    var hidden = {};
    try { var wbs = (wb.Workbook && wb.Workbook.Sheets) || null; if (wbs && wbs.length) for (var i = 0; i < wbs.length; i++) { var si = wbs[i] || {}; var nm = si.name != null ? si.name : wb.SheetNames[i]; if (nm != null && +(si.Hidden || 0) > 0) hidden[String(nm)] = 1; } } catch (e) { }
    entry.hiddenSheets = Object.keys(hidden);
    wb.SheetNames.forEach(function (sname) {
      if (hidden.hasOwnProperty(String(sname))) return;            // 숨김 시트는 읽지 않음 (이전 달 잔재·계산용)
      var raw = readSheetToArray(wb.Sheets[sname]);
      if (!raw.length) return;
      var qm = _qmDetectSheet(raw);
      if (qm && /^(summary|캘린더|raw)$/i.test(String(sname).trim()) && entry.sheets.some(function (s) { return s.qmate; })) return;
      if (qm) entry.sheets.push({ name: sname, raw: raw, colInfo: { types: {}, dataRows: [] }, dataRows: [], qmate: qm });
      else { var ci = classifySheet(raw, entry.name); entry.sheets.push({ name: sname, raw: raw, colInfo: ci, dataRows: ci.dataRows }); }
    });
    return entry;
  }
  // 파일들 → OUT_COLS 모양 행(1행 1송출). 0번 행은 머리글
  function buildRows(entries) { files = entries; try { return buildPreviewNormRows(); } finally { files = []; } }
  return {
    hooks: HOOKS, parseWorkbook: parseWorkbook, buildRows: buildRows, OUT_COLS: OUT_COLS, normCM: normCM,
    strSimilarity: strSimilarity, classifySheet: classifySheet, readSheetToArray: readSheetToArray, isJunkRow: isJunkRow, processRow: processRow,
    TYPE_LABEL: TM,
  };
})();
