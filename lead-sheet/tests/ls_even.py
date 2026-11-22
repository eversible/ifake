# Even chord grid (Chords tab), chord charts with no melody, and the bar / bars-per-line / beats settings
import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--autoplay-policy=no-user-gesture-required"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page(); errs = []
        page.on("pageerror", lambda e: errs.append(str(e))); page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await page.goto("http://127.0.0.1:8767/index.html"); await page.wait_for_timeout(1500)
        J = page.evaluate
        cells = """(() => { const c = [...document.querySelectorAll('#chordgrid .cell')].filter(e => e.dataset.m === '%s').map(e => Math.round(e.getBoundingClientRect().width)); return c.join(','); })()"""
        # 1) Chords tab: Even switch
        await J("__ls.setLayer('chords')")
        print("Even button visible in Chords:", await J("!document.querySelector('#btn-even').hidden"))
        await page.click('#btn-even'); await page.wait_for_timeout(200)
        print("grid view:", await J("__ls.S.view"), "| svg hidden:", await J("getComputedStyle(document.querySelector('#score svg') || document.body).display === 'none' || !document.querySelector('#score svg')"),
              "| bar 3 cell widths:", await J(cells % 3), "| bar 1 (pickup line):", await J(cells % 1))
        lines = await J("(() => { const L = __ls.S.layout.measures; const by = {}; L.forEach(M => by[M.line] = (by[M.line] || 0) + 1); return JSON.stringify(by); })()")
        print("bars per line:", lines)
        await page.screenshot(path="/home/claude/shots/113_even.png")
        # subdivided beat is split evenly in the grid
        await J("(async () => { const s = await import('./js/song.js'); s.setDivision(__ls.S.song.measures[4], 3, 2); __ls.S.tl = null; __ls.render(); })()")
        print("bar 4 with beat 4 halved:", await J(cells % 4))
        # tap a cell in the grid selects it
        r = await J("(() => { const e = document.querySelector('#chordgrid .cell[data-m=\"5\"][data-b=\"2\"]'); const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()")
        await page.touchscreen.tap(*r); await page.wait_for_timeout(150)
        print("tap bar 5 beat 3 →", await J("JSON.stringify(__ls.S.cs)"))
        # Melody tab: back to the score
        await J("__ls.setLayer('melody')")
        print("melody tab view:", await J("__ls.S.view"), "| Even hidden:", await J("document.querySelector('#btn-even').hidden"))
        # 2) grid bars per line 2 / 6
        for n in [2, 6]:
            await J(f"(() => {{ __ls.S.settings.gridBars = {n}; __ls.setLayer('chords'); __ls.render(); }})()")
            print(f"gridBars {n} → per line:", await J("(() => { const by = {}; __ls.S.layout.measures.forEach(M => by[M.line] = (by[M.line] || 0) + 1); return Object.values(by).slice(0, 3).join(','); })()"))
        # 3) score bars per line exact 4 on a phone
        await J("(() => { __ls.S.settings.evenChords = false; __ls.S.settings.scoreBars = '4'; __ls.setLayer('melody'); __ls.render(); })()")
        print("score, 4 per line on a phone:", await J("(() => { const by = {}; __ls.S.layout.measures.forEach(M => by[M.line] = (by[M.line] || 0) + 1); return Object.values(by).slice(0, 4).join(','); })()"))
        await J("(() => { __ls.S.settings.scoreBars = 'auto'; __ls.render(); })()")
        # 4) new chord chart: no melody tab, grid, 16 bars
        await page.click('#btn-charts'); await page.wait_for_timeout(200); await page.click('#ch-new-chart'); await page.wait_for_timeout(300)
        print("chord chart: view", await J("__ls.S.view"), "| layer", await J("__ls.S.layer"), "| melody tab hidden:", await J("document.querySelector('#tabs [data-layer=\"melody\"]').hidden"),
              "| bars:", await J("__ls.S.song.measures.length"), "| Even hidden:", await J("document.querySelector('#btn-even').hidden"))
        # enter chords by typing keys: C, then ▶, F7
        await page.click('#panel .key[data-action="root"][data-arg="C"]'); await page.click('#panel .key[data-action="cnext"]')
        await page.click('#panel .key[data-action="cnext"]'); await page.click('#panel .key[data-action="root"][data-arg="F"]'); await page.click('#panel .key[data-action="q"][data-arg="dom7"]')
        print("typed:", await J("(async () => (await import('./js/song.js')).barChordText(__ls.S.song.measures[0]))()"))
        # settings: bars 16 → 24, time 3/4
        await page.click('#btn-settings'); await page.wait_for_timeout(200)
        await page.fill('#st-nbars', '24'); await page.dispatch_event('#st-nbars', 'change'); await page.wait_for_timeout(150)
        await page.select_option('#st-num', '3'); await page.wait_for_timeout(150)
        print("after settings: bars", await J("__ls.S.song.measures.length"), "| beats per bar", await J("__ls.S.song.measures[1].ch.length"), "| cells in bar 2:", await J("document.querySelectorAll('#chordgrid .cell[data-m=\"1\"]').length"))
        await page.fill('#st-nbars', '12'); await page.dispatch_event('#st-nbars', 'change'); await page.wait_for_timeout(150)
        print("bars → 12:", await J("__ls.S.song.measures.length"))
        await page.click('#sheet-settings [data-close]'); await page.wait_for_timeout(150)
        # export has no melody; reimport keeps it a chord chart
        txt = await J("(async () => (await import('./js/song.js')).songToText(__ls.S.song))()")
        print("export mentions melody:", 'Melody:' in txt, "| type line:", 'Type: chord chart' in txt)
        back = await J(f"(async () => {{ const s = await import('./js/song.js'); return s.songFromText({txt!r}).chartOnly; }})()")
        print("reimported is a chord chart:", back)
        # playback: chords play, no melody
        await J("""(() => { const e = __ls.engine; window.__bus = {}; const on = e.note.bind(e); e.note = (i, m, t, d, v, bus) => { __bus[bus] = (__bus[bus] || 0) + 1; return on(i, m, t, d, v, bus); }; })()""")
        await page.click('#btn-play'); await page.wait_for_timeout(1500); await page.click('#btn-play')
        print("played:", await J("JSON.stringify(__bus)"))
        await page.screenshot(path="/home/claude/shots/114_chart.png")
        print("errors:", errs or "none")
        await b.close()
asyncio.run(main())
