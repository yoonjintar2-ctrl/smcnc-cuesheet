// ===== 03-schema.js : 시트(입력 표) 정의 =====
// 각 시트는 '배열의 배열'로 저장한다. 열 순서가 곧 엑셀 붙여넣기 순서다.
// 15차: 입력 일시는 표에서 짧게 (10/6 14:53) — 저장·엑셀은 2026-10-06 14:53 그대로
function stampShort(v) { const m = /^\d{4}-(\d\d)-(\d\d) (\d\d:\d\d)/.exec(String(v || '')); return m ? `${+m[1]}/${+m[2]} ${m[3]}` : v; }
const SHEETS = {
  지상파: {
    label: '지상파', group: 'input', media: '지상파',
    hint: '1행 = 1송출 · 금액 0이면 보너스 · 구분(정기물 등)은 행마다 적어요. 엑셀에서 복사해 바로 붙여넣기(머리글째 OK) · 방송사 원본은 상단 ‘방송사 큐시트 온보딩’ · 행 삭제는 행 번호를 고르고 우클릭',
    cols: [
      { k: 'ch', t: '채널', w: 58 },
      { k: 'kind', t: '구분', w: 56 },
      { k: 'prog', t: '프로그램', w: 170, left: 1 },
      { k: 'dow', t: '요일', w: 50 },
      { k: 'start', t: '시작', w: 56 },
      { k: 'end', t: '종료', w: 56 },
      { k: 'grade', t: '시급', w: 52 },
      { k: 'sec', t: '초수', w: 52, num: 1 },
      { k: 'price', t: '단가', w: 90, num: 1, money: 1, sum: 1 },
      { k: 'amount', t: '금액', w: 90, num: 1, money: 1, sum: 1 },
      { k: 'date', t: '날짜', w: 56 },
      { k: 'item', t: '품목', w: 96 },
      { k: 'cre', t: '소재', w: 84 },
      { k: 'cm', t: 'CM지정', w: 78 },
      { k: 'rate', t: '지정율', w: 52, num: 1 },
      { k: 'ar', t: 'A.R(%)', w: 56, num: 1 },
      { k: 'note', t: '비고', w: 70 },
      { k: 'obAt', t: '입력 일시', w: 86, auto: 1, disp: stampShort },
      { k: 'obBy', t: '입력자', w: 52, auto: 1 },
    ],
  },
  케이블: {
    label: '케이블', group: 'input', media: '케이블',
    hint: '케이블raw A~S열(채널~날짜) 순서. 엑셀에서 복사해 바로 붙여넣기(머리글째면 열 순서 달라도 OK) · 방송사 원본은 상단 ‘방송사 큐시트 온보딩’ · 행 삭제는 행 번호를 고르고 우클릭',
    cols: [
      { k: 'ch', t: '채널', w: 88 },
      { k: 'item', t: '품목', w: 96 },
      { k: 'prog', t: '프로그램명', w: 170, left: 1 },
      { k: 'dow', t: '요일', w: 50 },
      { k: 'start', t: '시작', w: 56 },
      { k: 'end', t: '종료', w: 56 },
      { k: 'grade', t: '시급', w: 52 },
      { k: 'sec', t: '초수', w: 52, num: 1 },
      { k: 'cm', t: '구분', w: 62 },
      { k: 'price', t: '단가', w: 92, num: 1, money: 1, sum: 1, sumW: 'cnt' },
      { k: 'cnt', t: '총횟수', w: 60, num: 1, sum: 1 },
      { k: 'd1', t: '월', w: 28, sum: 1 }, { k: 'd2', t: '화', w: 28, sum: 1 }, { k: 'd3', t: '수', w: 28, sum: 1 }, { k: 'd4', t: '목', w: 28, sum: 1 },
      { k: 'd5', t: '금', w: 28, sum: 1 }, { k: 'd6', t: '토', w: 28, sum: 1 }, { k: 'd7', t: '일', w: 28, sum: 1 },
      { k: 'date', t: '날짜', w: 56 },
      { k: 'cre', t: '소재', w: 88 },
      { k: 'note', t: '비고', w: 70 },
      { k: 'obAt', t: '입력 일시', w: 86, auto: 1, disp: stampShort },
      { k: 'obBy', t: '입력자', w: 52, auto: 1 },
    ],
  },
  예산: {
    label: '예산', group: 'input', letters: 13,
    hint: '1행은 품목명, A열은 채널명. 당월 운영의 채널×품목 예산표를 그대로 붙여넣으면 됩니다(원 단위).',
    cols: Array.from({ length: 13 }, (_, i) => ({ k: 'c' + i, t: String.fromCharCode(65 + i), w: i === 0 ? 110 : 104, num: i > 0 ? 1 : 0, money: i > 0 ? 1 : 0 })),
  },
  소재: {
    label: '소재', group: 'input',
    hint: '품목별 운영 소재. 품목·운영기간은 위 행과 같으면 비워도 됩니다. 비중은 0.5 또는 50% 모두 가능.',
    cols: [
      { k: 'item', t: '품목', w: 100 },
      { k: 'period', t: '운영기간', w: 80 },
      { k: 'sec', t: '초수', w: 44, num: 1 },
      { k: 'cre', t: '소재', w: 110, left: 1 },
      { k: 'share', t: '금액비중', w: 64, num: 1 },
      { k: 'cshare', t: '횟수비중', w: 64, num: 1 },
      { k: 'reg', t: '심의번호', w: 110 },
      { k: 'note', t: '비고', w: 220, left: 1 },
    ],
  },
  품목: {
    label: '품목', group: 'master',
    hint: '약칭이 큐시트·예산표·소재에 쓰는 유일한 이름입니다(별칭 없음). 정식명은 운영 요약에, 비고는 작업자끼리 보는 메모. 색상은 #RRGGBB.',
    cols: [
      { k: 'key', t: '약칭', w: 100 },
      { k: 'full', t: '정식명', w: 130 },
      { k: 'cat', t: '카테고리', w: 90 },
      { k: 'color', t: '색상', w: 80 },
      { k: 'note', t: '비고', w: 300, left: 1 },
    ],
  },
  채널: {
    label: '채널', group: 'master',
    hint: '매체는 지상파/케이블. 요약그룹은 운영 요약의 방송사 묶음(KBS·MBC·SBS·CJ ENM·JTBC·기타). MPP는 목표 CPRP를 찾는 키입니다.',
    cols: [
      { k: 'name', t: '채널', w: 130 },
      { k: 'alias', t: '별칭', w: 160, left: 1 },
      { k: 'media', t: '매체', w: 62 },
      { k: 'mpp', t: 'MPP', w: 110 },
      { k: 'group', t: '요약그룹', w: 80 },
      { k: 'by', t: '수정한 사람', w: 70 },
      { k: 'at', t: '수정 일시', w: 110 },
    ],
  },
  CM위치: {
    label: 'CM위치', group: 'master',
    hint: '큐시트에 적힌 CM위치 표현 → 구분(중CM / PIB / 전후CM). 없는 표현은 규칙(중→중CM, TOP·END·PIB→PIB)으로 추정하고 검증 탭에 표시합니다.',
    cols: [
      { k: 'expr', t: '표현', w: 120 },
      { k: 'cls', t: '구분', w: 90 },
      { k: 'by', t: '수정한 사람', w: 70 },
      { k: 'at', t: '수정 일시', w: 110 },
    ],
  },
  매칭규칙: {
    label: '매칭 규칙', group: 'master',
    hint: '방송사 원본 큐시트를 가져올 때 쓰는 규칙. 파일명·시트명에 이 글자가 있으면 그 채널/품목으로 맞춰요(위에서부터 첫 일치). 종류: 채널 · 품목 · 제외',
    cols: [
      { k: 'kind', t: '종류', w: 60 },
      { k: 'file', t: '파일명에 포함', w: 180, left: 1 },
      { k: 'sheet', t: '시트명에 포함', w: 140, left: 1 },
      { k: 'val', t: '채널/품목', w: 130 },
    ],
  },
  목표CPRP: {
    label: '목표 CPRP', group: 'master',
    hint: 'GRP = 예산 ÷ 목표 CPRP(15초 기준) × 초수 환산. 매체 + PP(MPP)로 찾습니다(케이블은 채널 이름 행이 있으면 그 채널만 그 값).',
    cols: [
      { k: 'media', t: '매체', w: 70 },
      { k: 'pp', t: 'PP', w: 130 },
      { k: 'cprp', t: 'CPRP(원)', w: 100, num: 1, money: 1 },
      { k: 'by', t: '수정한 사람', w: 70 },
      { k: 'at', t: '수정 일시', w: 110 },
    ],
  },
};
const INPUT_SHEETS = ['지상파', '케이블', '예산', '소재'];
const MASTER_SHEETS = ['품목', '채널', 'CM위치', '목표CPRP', '매칭규칙'];
const ALL_SHEETS = INPUT_SHEETS.concat(MASTER_SHEETS);
const REACH_GROUPS = ['지상파케이블', '케이블', 'CJ ENM', 'JTBC', '기타', 'KBS', 'MBC', 'SBS'];
const SUM_GROUPS = ['KBS', 'MBC', 'SBS', 'CJ ENM', 'JTBC', '기타'];
const CM_CLASSES = ['중CM', 'PIB', '전후CM', '일반'];

function colIndex(sheet, k) { return SHEETS[sheet].cols.findIndex(c => c.k === k); }

function emptyWorkspace(ym) {
  const p = parseYM(ym) || { y: new Date().getFullYear(), m: new Date().getMonth() + 1 };
  const ymStr = `${p.y}-${pad2(p.m)}`;
  return {
    v: 1, ym: ymStr, start: 1, end: daysInMonth(p.y, p.m),
    sheets: {
      지상파: [], 케이블: [], 예산: [['채널']], 소재: [],
      품목: DEFAULT_MASTER.품목.map(r => r.slice()),
      채널: DEFAULT_MASTER.채널.map(r => r.slice()),
      CM위치: DEFAULT_MASTER.CM위치.map(r => r.slice()),
      목표CPRP: DEFAULT_MASTER.목표CPRP.map(r => r.slice()),
      매칭규칙: [],
    },
    reach: {}, reachMeta: {}, hidden: {}, cueOrder: {}, opsNotes: {},
    savedAt: Date.now(), palV: 3, itemV: 2, kindV: 1, itemLegacy: {}, opsReach: {}, view: {},
  };
}
