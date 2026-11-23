# inversions on the big piano: draft E A C → A-/E, write it, see it in the chart, reopen it in Edit, play it
import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--autoplay-policy=no-user-gesture-required"])
        ctx = await b.new_context(viewport={"width": 669, "height": 860}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page(); errs = []
        page.on("pageerror", lambda e: errs.append(str(e))); page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await page.goto("http://127.0.0.1:8767/index.html?nosongs"); await page.wait_for_timeout(1500)
        J = page.evaluate
        await J("(() => { __ls.S.settings.split = 'on'; __ls.S.settings.pianoMode = 'draft'; __ls.S.settings.draftLatch = true; __ls.renderAll(); __ls.setLayer('chords'); __ls.S.cs = {m: 2, beat: 2, k: 0}; __ls.render(); })()")
        async def tapk(midi):
            r = await J(f"(() => {{ const k = document.querySelector('#bigpiano .pk[data-midi=\"{midi}\"]'); const b = k.getBoundingClientRect(); return [b.x + b.width/2, b.y + b.height * (k.classList.contains('b') ? 0.5 : 0.85)]; }})()")
            await page.touchscreen.tap(*r); await page.wait_for_timeout(60)
        async def tapb(w):
            r = await J(f"(() => {{ const b = document.querySelector('#bigpiano [data-bp={w}]').getBoundingClientRect(); return [b.x + b.width/2, b.y + b.height/2]; }})()")
            await page.touchscreen.tap(*r); await page.wait_for_timeout(80)
        for m in [52, 57, 60]: await tapk(m)
        print("draft E A C →", await page.inner_text('#bigpiano .bp-name'))
        await tapb('write')
        print("chart cell:", await J("document.querySelector('#chordgrid .cell[data-m=\"2\"][data-b=\"2\"] .ch').textContent"), "| info:", await page.inner_text('#info-main'))
        await tapb('edit')
        await J("(() => { __ls.S.cs = {m: 2, beat: 0, k: 0}; __ls.render(); __ls.S.cs = {m: 2, beat: 2, k: 0}; __ls.render(); })()")
        print("edit loads A-/E as:", await J("[...document.querySelectorAll('#bigpiano .pk.on')].map(k => +k.dataset.midi).join(',')"))
        # playback: the bass under A-/E is E
        await J("""(() => { const e = __ls.engine; window.__bass = []; const on = e.note.bind(e); e.note = (i, m, t, d, v, bus) => { if (bus === 'bass') __bass.push(m % 12); return on(i, m, t, d, v, bus); }; })()""")
        await J("(() => { const S = __ls.S; S.settings.bassPattern = 'root'; S.song.tempo = 200; S.bars = {a: 2, b: 2}; __ls.renderOverlay(); })()")
        await page.click('#btn-play'); await page.wait_for_timeout(1600); await page.click('#btn-play')
        print("bass pitch classes in bar 2:", await J("__bass.slice(0, 4).join(',')"), "(A=9 on beat 1, E=4 under A-/E on beat 3)")
        print("errors:", errs or "none")
        await b.close()
asyncio.run(main())
