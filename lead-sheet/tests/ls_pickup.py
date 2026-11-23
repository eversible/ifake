# even grid with a pickup: bars line up in columns, every line spans the full width, pickup in the left margin
import asyncio, base64
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome")
        ctx = await b.new_context(viewport={"width": 538, "height": 900}, device_scale_factor=3, is_mobile=True, has_touch=True)
        page = await ctx.new_page(); errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        await page.goto("http://127.0.0.1:8767/index.html?nosongs"); await page.wait_for_timeout(1500)
        J = page.evaluate
        await J("(() => { const S = __ls.S; S.settings.split = 'on'; S.settings.evenChords = true; S.settings.gridBars = 4; __ls.renderAll(); __ls.setLayer('chords'); S.cs = {m: 8, beat: 3, k: 0}; __ls.render(); })()")
        await page.wait_for_timeout(300)
        rows = await J("""(() => { const L = __ls.S.layout; const by = {};
          L.measures.forEach(M => { (by[M.line] = by[M.line] || []).push(Math.round(M.x) + '-' + Math.round(M.x + M.w)); }); return JSON.stringify(by); })()""")
        print("bar spans per line:", rows)
        print("gutter:", await J("Math.round(__ls.S.layout.gutter)"), "| bar numbers in margin:", await J("[...document.querySelectorAll('#chordgrid .barno.gut')].map(e => e.textContent).slice(0, 5).join(',')"))
        # beat width in the pickup vs a normal bar
        print("pickup cell / normal beat cell:", await J("[document.querySelector('#chordgrid .cell[data-m=\"0\"]'), document.querySelector('#chordgrid .cell[data-m=\"5\"][data-b=\"1\"]')].map(e => Math.round(e.getBoundingClientRect().width)).join(' / ')"))
        r = await J("(() => { const b = document.querySelector('#score-wrap').getBoundingClientRect(); return [b.y, b.height]; })()")
        await page.screenshot(path="/home/claude/shots/115_pickup.png", clip={"x": 0, "y": r[0], "width": 538, "height": min(r[1], 420)})
        # no pickup: no margin
        await J("(async () => { const S = __ls.S; S.settings.split = 'off'; __ls.renderAll(); })()")
        await J("(() => { __ls.S.song.pickup = 0; __ls.S.song.measures.shift(); __ls.S.tl = null; __ls.render(); })()")
        print("no pickup → gutter:", await J("__ls.S.layout.gutter"), "| line 1:", await J("__ls.S.layout.measures.filter(M => M.line === 0).map(M => Math.round(M.x)).join(',')"))
        print("errors:", errs or "none")
        await b.close()
asyncio.run(main())
