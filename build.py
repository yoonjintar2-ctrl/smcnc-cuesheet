# SM C&C TV 큐시트 — 단일 HTML 빌드
# 사용: python build.py  →  dist/코웨이TV큐시트.html (이 컴퓨터에 저장하는 오프라인판)
#                          dist/web/index.html     (온라인판: 같은 폴더의 config.js 로 Supabase 연결 — GitHub Pages에 올림)
import pathlib, re, sys

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / 'src'
LIB = ROOT / 'lib'
OUT = ROOT / 'dist'
OUT.mkdir(exist_ok=True)

def read(p):
    return pathlib.Path(p).read_text(encoding='utf-8')

def safe(js, name):
    if re.search(r'</script', js, re.I):
        sys.exit(f'{name} 안에 </script 문자열이 있어요 — 빌드를 멈춥니다')
    return js

libs = {
    'lib-chart': LIB / 'chart.umd.js',
    'lib-xlsx': LIB / 'xlsx.bundle.js',
}
css_app = read(SRC / 'app.css')
app_js = '\n'.join(read(p) for p in sorted(SRC.glob('*.js')))
app_js = safe(app_js, 'app')

parts = [
    '<!doctype html><html lang="ko"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>SM C&C TV 큐시트</title>',
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">',
    f'<style id="css-app">{css_app}</style>',
]
for sid, p in libs.items():
    parts.append(f'<script id="{sid}">{safe(read(p), sid)}</script>')
head = '\n'.join(parts)
app = f'<script id="app-js">{app_js}</script>'
tail = '</head><body><div id="root"></div></body></html>'
html = '\n'.join([head, app, tail])
out = OUT / '코웨이TV큐시트.html'
out.write_text(html, encoding='utf-8')
print(out, f'{len(html.encode("utf-8"))/1024/1024:.2f} MB')
# 온라인판: config.js(Supabase 주소·공개 키·관리자 계정 이메일)를 먼저 읽음
WEB = OUT / 'web'; WEB.mkdir(exist_ok=True)
web = '\n'.join([head, '<script src="config.js"></script>', app, tail])
(WEB / 'index.html').write_text(web, encoding='utf-8')
print(WEB / 'index.html')
