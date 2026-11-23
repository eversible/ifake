# Chords + Edit on the big piano: keys latch, each toggle plays what's down, ▶ replays, Write writes
import asyncio, base64
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--autoplay-policy=no-user-gesture-required"])
        ctx = await b.new_context(viewport={"width": 669, "height": 860}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page(); errs = []
        page.on("pageerror", lambda e: errs.append(str(e))); page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        cdp = await ctx.new_cdp_session(page)
        await cdp.send("Emulation.setDeviceMetricsOverride", {"width": 669, "height": 860, "deviceScaleFactor": 2, "mobile": True,
            "screenWidth": 669, "screenHeight": 951, "screenOrientation": {"type": "portraitPrimary", "angle": 0}})
        await page.goto("http://127.0.0.1:8767/index.html?nosongs"); await page.wait_for_timeout(1500)
        J = page.evaluate
        await J("(() => { __ls.S.settings.split = 'on'; __ls.S.settings.pianoMode = 'edit'; __ls.renderAll(); })()")
        await J("""(() => { const e = __ls.engine; window.__strikes = []; let t0 = -1; const on = e.note.bind(e);
          e.note = (i, m, t, d, v, bus) => { if (bus === 'chord') { if (Math.abs(t - t0) > 0.001) { __strikes.push([]); t0 = t; } __strikes[__strikes.length - 1].push(m); } return on(i, m, t, d, v, bus); }; })()""")
        await J("__ls.setLayer('chords')"); await J("(() => { __ls.S.cs = {m: 2, beat: 2, k: 0}; __ls.render(); })()")   # bar 2 beat 3: empty
        slot = "(async () => { const s = await import('./js/song.js'); const c = s.getSlot(__ls.S.song.measures[2], 2, 0); return c ? (await import('./js/chords.js')).chordText(c) : null; })()"
        name = lambda: page.inner_text('#bigpiano .bp-name')
        async def tapk(midi):
            r = await J(f"(() => {{ const k = document.querySelector('#bigpiano .pk[data-midi=\"{midi}\"]'); const b = k.getBoundingClientRect(); return [b.x + b.width/2, b.y + b.height * (k.classList.contains('b') ? 0.5 : 0.85)]; }})()")
            await page.touchscreen.tap(*r); await page.wait_for_timeout(60)
        async def tapb(w):
            r = await J(f"(() => {{ const b = document.querySelector('#bigpiano [data-bp=\"{w}\"]').getBoundingClientRect(); return [b.x + b.width/2, b.y + b.height/2]; }})()")
            await page.touchscreen.tap(*r); await page.wait_for_timeout(80)
        for m in [50, 53, 57]: await tapk(m)
        print("D F A latched:", await J("[...document.querySelectorAll('#bigpiano .pk.on')].map(k => +k.dataset.midi).join(',')"), "| name:", await name(), "| slot:", await J(slot))
        print("each toggle played:", await J("JSON.stringify(__strikes)"))
        await tapk(60)
        print("+C:", await name(), "| played:", await J("JSON.stringify(__strikes.at(-1))"))
        await tapk(53)
        print("F off:", await name(), "| played (remaining):", await J("JSON.stringify(__strikes.at(-1))"))
        await tapk(53)
        await tapb('strike')
        print("▶ replays:", await J("JSON.stringify(__strikes.at(-1))"), "| write ready:", await J("document.querySelector('#bigpiano [data-bp=\"write\"]').classList.contains('ready')"))
        r = await cdp.send("Page.captureScreenshot", {"format": "png"}); open("/home/claude/shots/111_latch.png", "wb").write(base64.b64decode(r["data"]))
        await tapb('write')
        print("Write → slot:", await J(slot), "| write now:", await J("document.querySelector('#bigpiano [data-bp=\"write\"]').disabled"))
        # move to the next (empty) slot: keys stay, Write puts the same chord there
        await J("(() => { __ls.S.cs = {m: 2, beat: 3, k: 0}; __ls.render(); })()")
        print("next empty slot starts empty:", await J("[...document.querySelectorAll('#bigpiano .pk.on')].map(k => +k.dataset.midi).join(',')"), "| write ready:", await J("document.querySelector('#bigpiano [data-bp=\"write\"]').classList.contains('ready')"))
        # select a slot with a chord (bar 2 beat 1, A7b9): loads it (nothing unwritten)
        await J("(() => { __ls.S.cs = {m: 2, beat: 0, k: 0}; __ls.render(); })()")
        print("A7(b9) slot loads:", await J("[...document.querySelectorAll('#bigpiano .pk.on')].map(k => +k.dataset.midi).join(',')"), "|", await name())
        # build something, don't write, move: it stays
        await tapk(70)
        await J("(() => { __ls.S.cs = {m: 3, beat: 0, k: 0}; __ls.render(); })()")
        print("unwritten keys stay on another chord's slot:", await J("[...document.querySelectorAll('#bigpiano .pk.on')].map(k => +k.dataset.midi).join(',')"), "|", await name())
        await tapb('clear')
        print("Clear:", await J("document.querySelectorAll('#bigpiano .pk.on').length"), "| slot C-7 untouched:", await J("(async () => { const s = await import('./js/song.js'); return (await import('./js/chords.js')).chordText(s.getSlot(__ls.S.song.measures[3], 0, 0)); })()"))
        print("errors:", errs or "none")
        await b.close()
asyncio.run(main())
