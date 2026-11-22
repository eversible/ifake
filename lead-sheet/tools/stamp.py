#!/usr/bin/env python3
"""Stamp the app so browsers always load the current files after an update.

1. index.html: every script/stylesheet URL gets ?v=<hash of its contents>, and an import map does the same
   for the modules app.js imports (./song.js, ./chords.js, ...). A file that didn't change keeps its URL,
   so it can still come from the cache; a changed file gets a new URL and is fetched fresh.
2. sw.js (the offline cache for the GitHub Pages build): BUILD becomes a hash of this build and CORE the
   list of stamped files to keep offline, so each update installs a fresh code cache.

Run before every publish or push:  python3 tools/stamp.py   (rewrites both files; safe to repeat)
"""
import hashlib, json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent

def v(rel):
    return hashlib.sha1((ROOT / rel).read_bytes()).hexdigest()[:10]

# ---- index.html
html_path = ROOT / 'index.html'
html = html_path.read_text()
html = re.sub(r'href="(css/[\w.-]+\.css)(\?v=\w+)?"', lambda m: f'href="{m[1]}?v={v(m[1])}"', html)
html = re.sub(r'src="((?:lib|js)/[\w.-]+\.js)(\?v=\w+)?"', lambda m: f'src="{m[1]}?v={v(m[1])}"', html)
imports = {f'./js/{p.name}': f'./js/{p.name}?v={v("js/" + p.name)}' for p in sorted((ROOT / 'js').glob('*.js'))}
block = '<script type="importmap">' + json.dumps({'imports': imports}, ensure_ascii=False) + '</script>'
html = re.sub(r'<script type="importmap">.*?</script>\n?', '', html, flags=re.S)
html = html.replace('<script type="module"', block + '\n<script type="module"', 1)
html_path.write_text(html)

# ---- sw.js
sw_path = ROOT / 'sw.js'
if sw_path.exists():
    stamped = re.findall(r'(?:href|src)="((?:css|lib|js)/[\w.-]+\.(?:css|js)\?v=\w+)"', html)
    stamped += [u[2:] for u in imports.values()]
    extra = [p for p in ('manifest.webmanifest', 'samples/index.json', 'icons/icon-180.png', 'icons/icon-192.png') if (ROOT / p).exists()]
    core = ['./', 'index.html'] + sorted(set(stamped)) + extra
    build = hashlib.sha1(''.join([html] + [(ROOT / p).read_text(errors='ignore') for p in extra[:2]]).encode()).hexdigest()[:10]
    sw = sw_path.read_text()
    sw = re.sub(r"const BUILD = '[^']*';", f"const BUILD = '{build}';", sw)
    sw = re.sub(r"const CORE = \[.*?\];", 'const CORE = ' + json.dumps(core, indent=0).replace('\n', ' ') + ';', sw, flags=re.S)
    sw_path.write_text(sw)

print('stamped', len(imports), 'modules' + (f'; sw build {build}, {len(core)} files' if sw_path.exists() else ''))
