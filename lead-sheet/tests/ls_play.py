import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--autoplay-policy=no-user-gesture-required"])
        ctx = await b.new_context(viewport={"width": 844, "height": 390}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page(); errs = []
        page.on("pageerror", lambda e: errs.append(str(e))); page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await page.goto("http://127.0.0.1:8767/index.html"); await page.wait_for_timeout(2500)
        J = page.evaluate
        await page.screenshot(path="/home/claude/shots/82_ls_landscape.png")
        # whole-song playback of the test chart: count melody notes through the repeat
        await J("""(() => { const e=__ls.engine; window.__log=[]; const on=e.note.bind(e); e.note=(i,m,t,d,v,bus)=>{ __log.push({m,t,bus}); return on(i,m,t,d,v,bus); }; })()""")
        await J("__ls.S.song.tempo = 320; __ls.S.settings.loop = false; __ls.S.settings.bassPattern = 'walk'")
        expected = await J("(async () => { const m = await import('./js/melody.js'); const s = await import('./js/song.js'); const notes = m.playableNotes(__ls.S.song); const order = s.playOrder(__ls.S.song); const cm = s.cellMap(__ls.S.song); const bars = []; for (const c of order) { const b = cm.ofCell[c]; if (bars[bars.length-1] !== b || (c - cm.start[b]) === 0 && bars.length && order[order.indexOf(c)-1] !== c-1) bars.push(b); } let n = 0; const seen = new Set(); let k = 0; for (const c of order) { const b = cm.ofCell[c]; if (c === cm.start[b]) n += notes.filter(x => x.m === b).length; } return { n, beats: order.length }; })()")
        print("expected melody notes through the repeat:", expected)
        await page.click("#btn-play")
        secs = expected['beats'] * 60 / 320 + 2
        await page.wait_for_timeout(int(secs * 1000))
        log = await J("__log")
        mel = [x for x in log if x['bus'] == 'melody']; bass = [x for x in log if x['bus'] == 'bass']; ch = [x for x in log if x['bus'] == 'chord']
        print("played: melody", len(mel), "| bass", len(bass), "| chord notes", len(ch), "| still playing:", await J("__ls.seq.playing"))
        print("errors:", errs or "none")
        await b.close()
asyncio.run(main())
