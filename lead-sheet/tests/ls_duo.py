# iPhone Duo, inner display, half-folded like a laptop: 951x585 with a horizontal fold (Chrome display-feature emulation)
import asyncio, base64
from playwright.async_api import async_playwright
async def tap_write(page):
    r = await page.evaluate("(() => { const b = document.querySelector('#bigpiano [data-bp=write]').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()")
    await page.touchscreen.tap(*r); await page.wait_for_timeout(80)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--autoplay-policy=no-user-gesture-required"])
        ctx = await b.new_context(viewport={"width": 951, "height": 585}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page(); errs = []
        page.on("pageerror", lambda e: errs.append(str(e))); page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        cdp = await ctx.new_cdp_session(page)
        await cdp.send("Emulation.setDeviceMetricsOverride", {"width": 951, "height": 585, "deviceScaleFactor": 2, "mobile": True,
                                                                "displayFeature": {"orientation": "horizontal", "offset": 289, "maskLength": 7}})
        try: await cdp.send("Emulation.setDevicePostureOverride", {"posture": {"type": "folded"}})
        except Exception as e: print("posture override:", e)
        await page.goto("http://127.0.0.1:8767/index.html"); await page.wait_for_timeout(2000)
        J = page.evaluate
        async def shot(path):   # via CDP: Playwright's own screenshot resets the emulated fold
            r = await cdp.send("Page.captureScreenshot", {"format": "png"}); open(path, "wb").write(base64.b64decode(r["data"]))
        print("segments:", await J("JSON.stringify((window.viewport && window.viewport.segments || []).map(r => [r.top, r.height]))"),
              "| posture:", await J("navigator.devicePosture && navigator.devicePosture.type"),
              "| split:", await J("document.body.classList.contains('split')"))
        print("score bottom / piano top:", await J("[Math.round(document.querySelector('#transport').getBoundingClientRect().bottom), Math.round(document.querySelector('#bigpiano').getBoundingClientRect().top), Math.round(document.querySelector('#bigpiano').getBoundingClientRect().bottom)]"))
        await shot("/home/claude/shots/104_duo_melody.png")
        # chords: select bar 2 beat 1 (A7b9) → piano shows it
        await J("__ls.S.settings.pianoMode = 'edit'")
        await J("__ls.setLayer('chords')"); await J("(() => { __ls.S.cs = {m: 2, beat: 0, k: 0}; __ls.render(); })()")
        print("layer:", await J("__ls.S.layer"))
        print("A7(b9) keys lit:", await J("[...document.querySelectorAll('#bigpiano .pk.on')].map(k => +k.dataset.midi).join(',')"), "| name:", await page.inner_text('#bigpiano .bp-name'))
        await shot("/home/claude/shots/105_duo_chords.png")
        # build a chord on an empty slot: bar 2 beat 3 → D, F, A, C (D-7)
        await J("(() => { __ls.S.cs = {m: 2, beat: 2, k: 0}; __ls.render(); })()")
        async def tap(midi):
            r = await J(f"(() => {{ const k = document.querySelector('#bigpiano .pk[data-midi=\"{midi}\"]'); const b = k.getBoundingClientRect(); return {{x: b.x + b.width/2, y: b.y + b.height * (k.classList.contains('b') ? 0.5 : 0.85)}}; }})()")
            await page.touchscreen.tap(r['x'], r['y']); await page.wait_for_timeout(80)
        for m in [50, 53]:
            await tap(m)
        print("after D F:", await page.inner_text('#bigpiano .bp-name'), "| slot:", await J("(async () => { const s = await import('./js/song.js'); const c = s.getSlot(__ls.S.song.measures[2], 2, 0); return c ? (await import('./js/chords.js')).chordText(c) : null; })()"))
        for m in [57, 60]:
            await tap(m)
        await tap_write(page)
        print("after D F A C:", await page.inner_text('#bigpiano .bp-name'), "| info:", await page.inner_text('#info-main'))
        await tap(64)
        await tap_write(page)
        print("+E:", await page.inner_text('#bigpiano .bp-name'))
        await shot("/home/claude/shots/106_duo_build.png")
        # fold opened flat: no segments → normal layout
        await cdp.send("Emulation.setDeviceMetricsOverride", {"width": 951, "height": 585, "deviceScaleFactor": 2, "mobile": True}); await page.wait_for_timeout(700)
        print("unfolded split:", await J("document.body.classList.contains('split')"))
        print("errors:", errs or "none")
        await b.close()
asyncio.run(main())
