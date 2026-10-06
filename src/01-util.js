// ===== 01-util.js : 공통 유틸 =====
const APP_VERSION = '1.0';
const DOW = ['월', '화', '수', '목', '금', '토', '일'];

function norm(s) {
  return String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase();
}
function str(v) {
  if (v == null) return '';
  return String(v).trim();
}
function num(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).replace(/[,\s원₩]/g, '');
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); } // 엑셀 회계 서식 음수 (1,000)
  let pct = false;
  if (s.endsWith('%')) { pct = true; s = s.slice(0, -1); }
  if (s === '' || s === '-') return null;
  const n = Number(s);
  if (!isFinite(n)) return null;
  return (neg ? -1 : 1) * (pct ? n / 100 : n);
}
function isBlankRow(r) {
  if (!r) return true;
  for (const v of r) if (v != null && String(v).trim() !== '') return false;
  return true;
}
function trimRows(rows) {
  const out = (rows || []).map(r => (r || []).map(v => (v == null ? '' : v)));
  while (out.length && isBlankRow(out[out.length - 1])) out.pop();
  return out;
}
function pad2(n) { return (n < 10 ? '0' : '') + n; }

// 'HH:MM' 정규화 (엑셀 시간 소수, 1810, '18:10', '25:00' 허용)
function normTime(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') {
    if (v > 0 && v < 2) { // 엑셀 시간(하루=1)
      const mins = Math.round(v * 24 * 60);
      return pad2(Math.floor(mins / 60)) + ':' + pad2(mins % 60);
    }
    if (v >= 100 && v < 3000) return pad2(Math.floor(v / 100)) + ':' + pad2(v % 100);
    return String(v);
  }
  const s = String(v).trim();
  // 오전/오후 · AM/PM 표기 (엑셀 시간 서식을 그대로 복사한 경우)
  const ap = s.match(/^(오전|오후|AM|PM)?\s*(\d{1,2})[:시.](\d{2})(?::\d{2})?\s*(AM|PM|오전|오후)?$/i);
  if (ap && (ap[1] || ap[4])) { let h = +ap[2]; const pm = /오후|PM/i.test(ap[1] || ap[4]); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; return pad2(h) + ':' + ap[3]; }
  const m = s.match(/^(\d{1,2})[:시.](\d{2})/);
  if (m) return pad2(+m[1]) + ':' + m[2];
  const m2 = s.match(/^(\d{3,4})$/);
  if (m2) { const n = +m2[1]; return pad2(Math.floor(n / 100)) + ':' + pad2(n % 100); }
  return s;
}
function timeToMin(t) {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? (+m[1]) * 60 + (+m[2]) : 9999;
}

// 엑셀 일련번호 → {y,m,d}
function serialToYMD(n) {
  const ms = Math.round((n - 25569) * 86400000);
  const d = new Date(ms);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}
// 날짜 값 → {y?, m, d} 또는 null
function parseDateVal(v, ym) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return { y: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate() };
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) return serialToYMD(v);
    if (v >= 1 && v <= 31 && ym) return { y: ym.y, m: ym.m, d: Math.round(v) };
    return null;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };
  m = s.match(/^(\d{2})[-./](\d{1,2})[-./](\d{1,2})$/); // 26-10-06
  if (m && +m[2] <= 12) return { y: 2000 + +m[1], m: +m[2], d: +m[3] };
  m = s.match(/^(\d{1,2})[/.\-월]\s*(\d{1,2})/);
  if (m) return { y: ym ? ym.y : null, m: +m[1], d: +m[2] };
  m = s.match(/^(\d{2})(\d{2})$/);   // '0301' (월일 네 자리)
  if (m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31) return { y: ym ? ym.y : null, m: +m[1], d: +m[2] };
  m = s.match(/^(\d{1,2})일?$/);
  if (m && ym) return { y: ym.y, m: ym.m, d: +m[1] };
  return null;
}
function dowOf(y, m, d) {
  const w = new Date(y, m - 1, d).getDay(); // 0=일
  return DOW[(w + 6) % 7];
}
function parseYM(ym) {
  const m = String(ym || '').match(/(\d{4})-(\d{1,2})/);
  return m ? { y: +m[1], m: +m[2] } : null;
}
function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }

// 월요일 시작 주차
function buildWeeks(ymStr, startDay, endDay) {
  const ym = parseYM(ymStr);
  if (!ym) return [];
  const last = daysInMonth(ym.y, ym.m);
  let d = Math.max(1, startDay || 1);
  const end = Math.min(last, endDay || last);
  const weeks = [];
  let n = 1;
  while (d <= end) {
    const dow = (new Date(ym.y, ym.m - 1, d).getDay() + 6) % 7; // 월=0
    const to = Math.min(d + (6 - dow), end);
    weeks.push({ n, from: d, to, label: `${n}주`, range: `${ym.m}/${d}~${to}`, full: `${n}주 (${ym.m}/${d}~${ym.m}/${to})` });
    d = to + 1; n++;
  }
  return weeks;
}
function weekOfDay(weeks, d) {
  if (d == null) return null;
  for (const w of weeks) if (d >= w.from && d <= w.to) return w.n;
  return null;
}

// 색
function hexToRgb(h) {
  const s = String(h || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(s)) return null;
  const n = parseInt(s, 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
function tint(h, amt) { // amt: 0=원색, 1=흰색
  const c = hexToRgb(h) || [111, 118, 128];
  const m = c.map(x => Math.round(x + (255 - x) * amt));
  return '#' + m.map(x => x.toString(16).padStart(2, '0')).join('');
}
function rgba(h, a) {
  const c = hexToRgb(h) || [111, 118, 128];
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

// 포맷
const fmt = {
  int: v => (v == null || isNaN(v)) ? '-' : Math.round(v).toLocaleString('ko-KR'),
  won: v => (v == null || isNaN(v)) ? '-' : Math.round(v).toLocaleString('ko-KR'),
  eok: (v, d = 1) => (v == null || isNaN(v)) ? '-' : (Math.round(v / 1e8 * Math.pow(10, d)) / Math.pow(10, d)).toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: d }) + '억',
  eokN: (v, d = 2) => (v == null || isNaN(v)) ? '' : Math.round(v / 1e8 * Math.pow(10, d)) / Math.pow(10, d),
  pct: (v, d = 0) => (v == null || !isFinite(v)) ? '-' : (v * 100).toFixed(d) + '%',
  dec: (v, d = 1) => (v == null || isNaN(v)) ? '-' : (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }),
  time: d => { const x = new Date(d); return `${x.getMonth() + 1}/${x.getDate()} ${pad2(x.getHours())}:${pad2(x.getMinutes())}`; },
  stamp: d => { const x = new Date(d || Date.now()); return `${String(x.getFullYear()).slice(2)}${pad2(x.getMonth() + 1)}${pad2(x.getDate())}_${pad2(x.getHours())}${pad2(x.getMinutes())}`; },
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function groupBy(arr, fn) {
  const m = new Map();
  for (const x of arr) { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
}
function sum(arr, fn) { let s = 0; for (const x of arr) { const v = fn ? fn(x) : x; if (v) s += v; } return s; }
function debounce(fn, ms) {
  let t = null;
  const f = function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
  f.flush = () => { clearTimeout(t); fn(); };
  return f;
}
function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

// 프로그램명 정리 (주요 프로그램 요약용)
function cleanProg(p) {
  let s = String(p || '');
  s = s.replace(/^\s*(\[[^\]]*\]\s*)+/, '');      // 앞쪽 [예능] [월화] 태그
  s = s.replace(/<[^>]*>/g, ' ');                   // <중CM> <본방>
  s = s.replace(/【([^】]*)】/g, '($1)');
  s = s.replace(/\((월|화|수|목|금|토|일|월화|수목|금토|토일)\)/g, '');
  s = s.replace(/★|☆/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// 비슷한 이름 추천: 공백·대소문자 무시, 포함 관계·글자 편집 거리로 점수 (14차: 채널 확인 팝업)
// 포함 보너스는 길이 비율만큼 (짧은 이름 'tvN'이 'tvN Shw' 안에 들어 있다고 'tvN Show'보다 앞에 오지 않게)
function nameSuggest(raw, list, n = 5) {
  const N = x => String(x || '').replace(/\s+/g, '').toLowerCase(); const q = N(raw); if (!q) return [];
  const lev = (a, b) => { const m = a.length, k = b.length; if (!m) return k; if (!k) return m; let prev = Array.from({ length: k + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= k; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } return prev[k]; };
  return list.map(x => { const t = N(x); let sc = lev(q, t) / Math.max(q.length, t.length); if (t.includes(q) || q.includes(t)) sc -= 0.5 * Math.min(q.length, t.length) / Math.max(q.length, t.length); if (t[0] === q[0]) sc -= 0.1; return { x, sc }; })
    .filter(o => o.sc < 0.7).sort((a, b) => a.sc - b.sc).slice(0, n).map(o => o.x);
}
