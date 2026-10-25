"""
Real-browser checks (WebKitGTK via Selenium) of what unit tests cannot see:
  * how the production build behaves when served under a GitHub-Pages-style path,
  * how a browser treats CORS toward an Ollama-like server (the opaque "Failed to fetch"),
  * how the manuscript, equations (KaTeX fonts), tables and the citation section actually render.

Requirements: webkit2gtk-driver, xvfb, selenium.  Run:  npm run test:browser
Usage: browser_checks.py <harness-dist> <data.json> <shots-dir>
"""
import sys, os, json, threading, http.server, socketserver, time
from selenium import webdriver
from selenium.webdriver.webkitgtk.options import Options

dist, data_path, shots = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(shots, exist_ok=True)
PREFIX = '/SciMetro/'
failures = []
def check(name, cond, info=''):
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{info}]' if info and not cond else ''))
    if not cond: failures.append(name)

class Quiet:
    def log_message(self, *a): pass

# ---- static server under a project-site prefix ------------------------------------------------
class Web(Quiet, http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = path.split('?')[0]
        return os.path.join(dist, path[len(PREFIX):]) if path.startswith(PREFIX) else '/nonexistent'
class TS(socketserver.ThreadingTCPServer): allow_reuse_address = True; daemon_threads = True
web = TS(('127.0.0.1', 0), Web); web_port = web.server_address[1]
threading.Thread(target=web.serve_forever, daemon=True).start()
PAGE_ORIGIN = f'http://127.0.0.1:{web_port}'

# ---- an Ollama-like server: strict origin allow-list, 403 without CORS headers otherwise ------
def make_ollama(allowed, models):
    class O(Quiet, http.server.BaseHTTPRequestHandler):
        def _cors_ok(self):
            origin = self.headers.get('Origin')
            return origin is None or origin in allowed
        def _send(self, code, body=b'', ctype='application/json'):
            self.send_response(code)
            origin = self.headers.get('Origin')
            if origin and origin in allowed:
                self.send_header('Access-Control-Allow-Origin', origin)
                self.send_header('Access-Control-Allow-Headers', 'content-type')
                self.send_header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
            self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(body)))
            self.end_headers(); self.wfile.write(body)
        def do_OPTIONS(self):
            self._send(204 if self._cors_ok() else 403)
        def do_GET(self):
            if not self._cors_ok(): return self._send(403)
            if self.path == '/api/tags': return self._send(200, json.dumps({'models': [{'name': m} for m in models]}).encode())
            self._send(200, b'Ollama is running', 'text/plain')
        def do_POST(self):
            if not self._cors_ok(): return self._send(403)
            n = int(self.headers.get('Content-Length', 0)); body = json.loads(self.rfile.read(n) or b'{}')
            if body.get('model') not in models: return self._send(404, json.dumps({'error': f"model '{body.get('model')}' not found"}).encode())
            self._send(200, json.dumps({'response': ' generated text '}).encode())
    s = TS(('127.0.0.1', 0), O); threading.Thread(target=s.serve_forever, daemon=True).start()
    return s
def url_of(s): return f'http://127.0.0.1:{s.server_address[1]}'

o = Options()
o.binary_location = '/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser'
o.add_argument('--automation')
o.set_capability('webkitgtk:browserOptions', {'binary': o.binary_location, 'args': ['--automation']})
d = webdriver.WebKitGTK(options=o)
try:
    d.set_window_size(1100, 1000)
    d.get(f'{PAGE_ORIGIN}{PREFIX}tests/browser/harness.html')
    for _ in range(40):
        if d.execute_script('return !!window.__ready'): break
        time.sleep(0.25)
    check('production bundle boots under a project-site path (/SciMetro/)', d.execute_script('return !!window.__ready'))

    # ---------------------------------------------------------------- Ollama behaviour in a browser
    ctx = lambda url, model='qwen2.5:7b': {'pageOrigin': PAGE_ORIGIN, 'ollamaUrl': url, 'model': model}
    probe = lambda c: d.execute_async_script('const done = arguments[arguments.length-1]; window.__probe(arguments[0]).then(done, e => done({code:"js-error", title:String(e)}))', c)
    call = lambda s: d.execute_async_script('const done = arguments[arguments.length-1]; window.__call(arguments[0]).then(done)', s)

    ok = make_ollama([PAGE_ORIGIN], ['qwen2.5:7b'])
    refused = make_ollama([], ['qwen2.5:7b'])
    nomodel = make_ollama([PAGE_ORIGIN], ['llama3:8b'])
    gone = make_ollama([], []); gone_url = url_of(gone); gone.shutdown(); gone.server_close()

    r = probe(ctx(url_of(ok)));            check('allowed origin: probe ok', r['code'] == 'ok', r)
    r = probe(ctx(url_of(refused)));       check('refused origin: opaque browser error is diagnosed as an origin problem', r['code'] == 'cors' and 'OLLAMA_ORIGINS' in ' '.join(r['steps']) and PAGE_ORIGIN in r['steps'][0], r)
    r = probe(ctx(gone_url));              check('nothing listening: diagnosed as unreachable', r['code'] == 'unreachable', r)
    r = probe(ctx(url_of(nomodel)));       check('missing model: diagnosed with the pull command', r['code'] == 'model-missing' and 'ollama pull qwen2.5:7b' in r['steps'][0], r)

    base = {'md': 'qwen2.5:7b', 'llmProvider': 'ollama'}
    r = call({**base, 'ol': url_of(ok)});       check('generation through the preflight succeeds', r['ok'] and r['text'] == 'generated text', r)
    r = call({**base, 'ol': url_of(refused)});  check('generation refused: message tells how to allow the origin', (not r['ok']) and 'OLLAMA_ORIGINS' in r['text'], r)
    r = call({**base, 'ol': gone_url});         check('generation, server down: message says nothing answered', (not r['ok']) and 'Nothing answered' in r['text'], r)
    r = call({**base, 'ol': url_of(nomodel)});  check('generation, model missing: message says how to pull it', (not r['ok']) and 'ollama pull' in r['text'], r)
    for s in (ok, refused, nomodel): s.shutdown()

    # ---------------------------------------------------------------- how the manuscript renders
    data = json.load(open(data_path))
    d.set_window_size(1100, 1400)
    d.execute_async_script('const done = arguments[arguments.length-1]; window.__mount("manuscript", arguments[0]).then(done)', data)
    time.sleep(1.5)
    m = d.execute_script("""
      const hs = [...document.querySelectorAll('h1,h2,h3,h4')].map(h => h.textContent.length);
      const fonts = [...document.fonts].filter(f => f.status === 'loaded' && /KaTeX/.test(f.family)).map(f => f.family);
      const k = document.querySelector('.katex');
      return { headings: hs.length, longestHeading: Math.max(...hs), katex: document.querySelectorAll('.katex').length,
               display: document.querySelectorAll('.katex-display').length, errors: document.querySelectorAll('.katex-error').length,
               loadedKatexFonts: [...new Set(fonts)], tables: document.querySelectorAll('table').length,
               lists: document.querySelectorAll('ol li, ul li').length, marks: document.querySelectorAll('mark').length,
               rawMarkers: /\\*\\*[A-Za-z]|\\$\\$|\\\\tag|\\\\frac/.test(document.body.innerText),
               katexFontFamily: k ? getComputedStyle(k).fontFamily.slice(0, 40) : '',
               figures: document.querySelectorAll('svg').length };
    """)
    print(json.dumps(m))
    check('headings contain only titles (no merged paragraphs)', m['headings'] > 20 and m['longestHeading'] < 140, m)
    check('equations are typeset (13 displayed, no errors)', m['display'] >= 13 and m['katex'] > 40 and m['errors'] == 0, m)
    check('KaTeX fonts were actually loaded by the browser from the sub-path', len(m['loadedKatexFonts']) >= 2, m['loadedKatexFonts'])
    check('no raw markdown or TeX visible', not m['rawMarkers'], m)
    check('tables, lists and author placeholders render', m['tables'] >= 15 and m['lists'] >= 5 and m['marks'] >= 5, m)

    def shot(text, name, offset=-80):
        el = d.execute_script("""
          const t = arguments[0]; const all = [...document.querySelectorAll('h1,h2,h3,h4,div,p')];
          const e = all.find(x => x.children.length < 6 && x.textContent.trim().startsWith(t)); if (!e) return false;
          window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY + arguments[1]); return true;""", text, offset)
        time.sleep(0.4); d.save_screenshot(os.path.join(shots, name)); return el
    shot('Abstract', 'manuscript_abstract.png', -40)
    check('screenshot: equations section', shot('3.2 Indicators', 'manuscript_equations.png'))
    shot('Table 28.', 'manuscript_benchmark_table.png', -20) or shot('Hypotheses derived', 'manuscript_benchmark_table.png', -20)
    d.execute_script('window.scrollTo(0, 0)'); d.save_screenshot(os.path.join(shots, 'manuscript_top.png'))

    # ---------------------------------------------------------------- the citation section and the Ollama help
    d.execute_async_script('const done = arguments[arguments.length-1]; window.__mount("cite").then(done)')
    c = d.execute_script("""return { badges: document.querySelectorAll('span.uppercase').length,
        links: [...document.querySelectorAll('#cite-tool a[href^="https://doi.org"]')].length, copy: [...document.querySelectorAll('button')].filter(b => /Copy/.test(b.textContent)).length }""")
    check('citation section: 7 type badges, DOI links and copy buttons', c['badges'] == 7 and c['links'] >= 10 and c['copy'] >= 4, c)
    d.set_window_size(1100, 1800); time.sleep(0.4); d.save_screenshot(os.path.join(shots, 'cite_tool.png'))

    diag = probe(ctx(url_of(refused)) | {'ollamaUrl': 'http://127.0.0.1:1'})
    d.set_window_size(1000, 900)
    d.execute_async_script('const done = arguments[arguments.length-1]; window.__mount("help", {origin: "https://someuser.github.io", diag: arguments[0]}).then(done)', diag)
    d.save_screenshot(os.path.join(shots, 'ollama_help.png'))
finally:
    d.quit(); web.shutdown()
print('\nFAILED: ' + ', '.join(failures) if failures else '\nALL BROWSER CHECKS PASSED')
sys.exit(1 if failures else 0)
