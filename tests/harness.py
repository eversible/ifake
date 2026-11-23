import asyncio, json
from playwright.async_api import async_playwright
URL = "http://127.0.0.1:8766/index.html"
async def new_page(p, vp=(390, 844), mobile=True, init=None, browser=None):
    b = browser or await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--autoplay-policy=no-user-gesture-required"])
    ctx = await b.new_context(viewport={"width": vp[0], "height": vp[1]}, device_scale_factor=2, is_mobile=mobile, has_touch=mobile)
    if init: await ctx.add_init_script(init)
    page = await ctx.new_page()
    errs = []
    page.on("console", lambda m: errs.append(f"{m.type}: {m.text}") if m.type in ("error",) else None)
    page.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
    await page.goto(URL); await page.wait_for_function("window.__chordpad"); await page.wait_for_timeout(300)
    return b, ctx, page, errs
KEY = """(label) => { const b=[...document.querySelectorAll('#keyboard .key')].find(x=>x.textContent===label); if(!b) throw new Error('no key '+label); b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true})); }"""
CELLS = """(r) => { const {S} = window.__chordpad; const [a,b] = r || [0, S.chart.cells.length]; return S.chart.cells.slice(a,b).map(c => c ? (c.nc ? 'NC' : window.__ct(c)) : '.').join(' '); }"""
INIT = "import('./js/chords.js').then(m => { window.__ct = m.chordText; window.__C = m; });"
