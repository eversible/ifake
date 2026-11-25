# chord-layer subdivisions: split beats, enter chords on the new slots, check grid, text, undo and playback timing
import asyncio, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--autoplay-policy=no-user-gesture-required"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page(); errs = []
        page.on("pageerror", lambda e: errs.append(str(e))); page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await page.goto("http://127.0.0.1:8767/index.html?nosongs"); await page.wait_for_timeout(2000)
        J = page.evaluate
        # beat splits have no keys any more (typed as [C F] groups); the action is still there underneath
        key = lambda a, arg=None: (page.evaluate(f"__ls.keyAction('div', {arg!r})") if a == 'div' else page.click(f'#panel .key[data-action="{a}"]' + (f'[data-arg="{arg}"]' if arg is not None else '')))
        await J("__ls.setLayer('chords')")
        print("panel rows:", await J("[...document.querySelectorAll('#panel .krow')].map(r => r.children.length).join(',')"), "| panel h:", await J("Math.round(document.querySelector('#panel').getBoundingClientRect().height)"))
        # 1) bar 4 (F7), beat 4: split in two, put G♭7 on the "and"
        await J("(() => { const S = __ls.S; S.cs = {m: 4, beat: 3, k: 0}; __ls.render(); })()")
        await key('div', '2')
        print("1 split →", await J("JSON.stringify(__ls.S.cs)"), "| info:", await page.inner_text('#info-sub'))
        await key('root', 'G'); await key('cacc', '-1'); await key('q', 'dom7')
        print("  bar 4:", await J("(async () => (await import('./js/song.js')).barChordText(__ls.S.song.measures[4]))()"), "| info:", await page.inner_text('#info-main'), '/', await page.inner_text('#info-sub'))
        # 2) bar 6, beat 3: 8th-note triplet with three chords
        await J("(() => { const S = __ls.S; S.cs = {m: 6, beat: 2, k: 0}; __ls.render(); })()")
        await key('div', '3')
        for r in ['D', 'E', 'F']:
            await key('root', r); await key('q', 'min'); await key('cnext')
        print("2 triplet bar 6:", await J("(async () => (await import('./js/song.js')).barChordText(__ls.S.song.measures[6]))()"))
        # 3) bar 8, beats 1-2: quarter-note triplet
        await J("(() => { const S = __ls.S; S.cs = {m: 8, beat: 0, k: 0}; __ls.render(); })()")
        await key('div', 't')
        await J("(() => { __ls.S.cs.k = 0; __ls.render(); })()")
        for r in ['C', 'D', 'E']:
            await key('root', r); await key('cnext')
        print("3 quarter triplet bar 8:", await J("(async () => (await import('./js/song.js')).barChordText(__ls.S.song.measures[8]))()"), "| 't' on last beat dimmed:",
              await J("(() => { __ls.S.cs = {m: 8, beat: 3, k: 0}; __ls.render(); const before = JSON.stringify(__ls.S.song.measures[8].div || {}); __ls.keyAction('div', 't'); return JSON.stringify(__ls.S.song.measures[8].div || {}) === before; })()"))
        # grid: cells, sub dividers, triplet brackets
        print("grid cells:", await J("document.querySelectorAll('#chordgrid .cell').length"), "| sub:", await J("document.querySelectorAll('#chordgrid .cell.sub').length"), "| triplet brackets:", await J("document.querySelectorAll('#chordgrid .tup3').length"))
        # tap the "and" of beat 4 in bar 4 on the grid (real touch)
        c = await J("(() => { const el = document.querySelector('#chordgrid .cell[data-m=\"4\"][data-b=\"3\"][data-k=\"1\"]'); el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2}; })()")
        await page.touchscreen.tap(c['x'], c['y']); await page.wait_for_timeout(150)
        print("tap and-of-4 →", await J("JSON.stringify(__ls.S.cs)"), await page.inner_text('#info-main'))
        await page.screenshot(path="/home/claude/shots/89_sub.png")
        # melody mode symbols at sub positions
        await J("__ls.setLayer('melody')")
        print("melody-mode symbols at slots:", await J("[...document.querySelectorAll('.chord-sym')].filter(e => e.dataset.cell.split(':').length === 3).map(e => e.dataset.cell).join(' ')"))
        await page.screenshot(path="/home/claude/shots/90_sub_melody.png")
        await J("__ls.setLayer('chords')")
        # undo the last root (E) then redo via storage round trip
        before = await J("(async () => (await import('./js/song.js')).songToText(__ls.S.song))()")
        rt = await J("(async () => { const s = await import('./js/song.js'); return s.songToText(s.deserialiseSong(JSON.parse(JSON.stringify(s.serialiseSong(__ls.S.song))))); })()")
        print("storage round trip identical:", before == rt)
        # merge bar 6 beat 3 back to one slot: keeps the first chord, drops the others (toast)
        await J("(() => { __ls.S.cs = {m: 6, beat: 2, k: 1}; __ls.render(); })()")
        await key('div', '1')
        print("merge →", await J("(async () => (await import('./js/song.js')).barChordText(__ls.S.song.measures[6]))()"), "| toast:", await J("(document.querySelector('#toast')||{}).textContent || ''"))
        await key('undo')
        print("undo →", await J("(async () => (await import('./js/song.js')).barChordText(__ls.S.song.measures[6]))()"))
        # playback timing: chord hits relative to beat start
        await J("""(() => { const e=__ls.engine; window.__log=[]; const on=e.note.bind(e); e.note=(i,m,t,d,v,bus)=>{ __log.push({m,t,bus,d}); return on(i,m,t,d,v,bus); }; })()""")
        await J("__ls.S.song.tempo = 120; __ls.S.settings.swing = 0; __ls.S.settings.compPattern = 'once'; __ls.S.settings.bassPattern = 'root'; __ls.S.bars = {a: 4, b: 8}; __ls.renderOverlay()")
        await page.click('#btn-play'); await page.wait_for_timeout(5 * 2000 + 2500)
        log = await J("__log"); await page.click('#btn-play')
        ch = sorted(set(round(x['t'], 3) for x in log if x['bus'] == 'chord'))
        t0 = ch[0]
        rel = [round((t - t0) / 0.5, 3) for t in ch]      # in beats from bar 4 beat 1
        print("chord onsets (beats from bar 4):", rel[:14])
        print("errors:", errs or "none")
        await b.close()
asyncio.run(main())
