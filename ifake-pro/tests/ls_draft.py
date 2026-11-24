# big piano: Draft (play freely, multi-touch hold, glide, tap the name to use it) vs Edit (build the selected chord)
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
        await page.goto("http://127.0.0.1:8767/index.html?nosongs"); await page.wait_for_timeout(2000)
        J = page.evaluate
        async def shot(path):
            r = await cdp.send("Page.captureScreenshot", {"format": "png"}); open(path, "wb").write(base64.b64decode(r["data"]))
        await J("""(() => { const e = __ls.engine; window.__log = []; const on = e.note.bind(e);
          e.note = (i, m, t, d, v, bus) => { const h = on(i, m, t, d, v, bus); __log.push({ m, bus, rel: null }); const k = __log.length - 1;
            if (h) { const r = h.release.bind(h); h.release = (tt) => { __log[k].rel = tt; return r(tt); }; } return h; }; })()""")
        await J("__ls.S.settings.draftLatch = false")      # hold-to-play first
        await J("__ls.setLayer('chords')"); await J("(() => { __ls.S.cs = {m: 2, beat: 2, k: 0}; __ls.render(); })()")
        mode = await J("[...document.querySelectorAll('#bigpiano .bp-mode button.on')].map(b => b.textContent).join()")
        print("default mode:", mode, "| name:", await page.inner_text('#bigpiano .bp-name'))
        async def center(midi):
            return await J(f"(() => {{ const k = document.querySelector('#bigpiano .pk[data-midi=\"{midi}\"]'); const b = k.getBoundingClientRect(); return {{x: b.x + b.width/2, y: b.y + b.height * (k.classList.contains('b') ? 0.5 : 0.85), id: {midi}}}; }})()")
        pts = [await center(m) for m in [50, 53, 57, 60]]
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": q['x'], "y": q['y'], "id": i} for i, q in enumerate(pts)]})
        await page.wait_for_timeout(250)
        print("holding D F A C → name:", await page.inner_text('#bigpiano .bp-name'), "| lit:", await J("[...document.querySelectorAll('#bigpiano .pk.on')].map(k => +k.dataset.midi).join(',')"),
              "| sounding:", await J("__log.filter(x => x.rel === null).map(x => x.m).join(',')"),
              "| slot still empty:", await J("(async () => { const s = await import('./js/song.js'); return s.getSlot(__ls.S.song.measures[2], 2, 0) === null; })()"))
        await shot("/home/claude/shots/107_draft.png")
        # Write (with a spare finger) while still holding
        nb = await J("(() => { const b = document.querySelector('#bigpiano [data-bp=write]').getBoundingClientRect(); return {x: b.x + b.width/2, y: b.y + b.height/2}; })()")
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": q['x'], "y": q['y'], "id": i} for i, q in enumerate(pts)] + [{"x": nb['x'], "y": nb['y'], "id": 9}]})
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": [{"x": q['x'], "y": q['y'], "id": i} for i, q in enumerate(pts)]})
        await page.wait_for_timeout(150)
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        await page.wait_for_timeout(200)
        print("after Write → slot:", await J("(async () => { const s = await import('./js/song.js'); const c = s.getSlot(__ls.S.song.measures[2], 2, 0); return c ? (await import('./js/chords.js')).chordText(c) : null; })()"),
              "| released:", await J("__log.filter(x => x.rel === null).length === 0"), "| lit after release:", await J("document.querySelectorAll('#bigpiano .pk.on').length"))
        # glide: one finger from C3 across to G3
        a, z = await center(48), await center(55)
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": a['x'], "y": a['y'], "id": 1}]})
        n0 = await J("__log.length")
        for s_ in range(1, 9):
            x = a['x'] + (z['x'] - a['x']) * s_ / 8
            await cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": a['y'], "id": 1}]}); await page.wait_for_timeout(30)
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); await page.wait_for_timeout(100)
        print("glide C3→G3 played:", await J(f"__log.slice({n0} - 1).map(x => x.m).join(',')"), "| all released:", await J("__log.filter(x => x.rel === null).length === 0"))
        # Draft + Latch: tap the Latch switch, then keys toggle; ▶ replays; Clear; Write
        async def tapb(w):
            if w in ('clear', 'follow', 'latch'):          # these live in the piano bar's ⋯ menu
                m = await J("(() => { const b = document.querySelector('#bigpiano [data-bp=\"more\"]').getBoundingClientRect(); return [b.x + b.width/2, b.y + b.height/2]; })()")
                await page.touchscreen.tap(*m); await page.wait_for_timeout(80)
            r = await J(f"(() => {{ const b = document.querySelector('#bigpiano [data-bp={w}]').getBoundingClientRect(); return [b.x + b.width/2, b.y + b.height/2]; }})()")
            await page.touchscreen.tap(*r); await page.wait_for_timeout(80)
        await tapb('latch')
        print("latch on:", await J("__ls.S.settings.draftLatch"), "| ▶/Clear shown:", await J("!document.querySelector('#bigpiano [data-bp=strike]').hidden && !document.querySelector('#bigpiano [data-bp=clear]').hidden"))
        await J("(() => { __ls.S.cs = {m: 3, beat: 2, k: 0}; __ls.render(); })()")
        for m in [53, 57, 60, 64]:
            q = await center(m); await page.touchscreen.tap(q['x'], q['y']); await page.wait_for_timeout(60)
        print("latched F A C E:", await J("[...document.querySelectorAll('#bigpiano .pk.on')].map(k => +k.dataset.midi).join(',')"), "|", await page.inner_text('#bigpiano .bp-name'),
              "| still down after lifting:", await J("__ls.S.ck.notes.length"), "| slot untouched:", await J("(async () => { const s = await import('./js/song.js'); return s.getSlot(__ls.S.song.measures[3], 2, 0) === null; })()"))
        await tapb('write')
        print("Write → slot:", await J("(async () => { const s = await import('./js/song.js'); const c = s.getSlot(__ls.S.song.measures[3], 2, 0); return c ? (await import('./js/chords.js')).chordText(c) : null; })()"), "| keys kept:", await J("__ls.S.ck.notes.length"))
        # selecting a chord in the chart (Draft): its keys come up toggled
        await J("(() => { __ls.S.cs = {m: 2, beat: 0, k: 0}; __ls.render(); })()")
        print("select A7(b9) in Draft → keys:", await J("[...document.querySelectorAll('#bigpiano .pk.on')].map(k => +k.dataset.midi).join(',')"), "|", await page.inner_text('#bigpiano .bp-name'))
        await J("(() => { __ls.S.cs = {m: 3, beat: 2, k: 0}; __ls.render(); })()")
        await tapb('clear')
        print("Clear:", await J("document.querySelectorAll('#bigpiano .pk.on').length"), "|", await page.inner_text('#bigpiano .bp-name'))
        # edit mode: taps build the selected chord (bar 2 beat 4, empty)
        await page.touchscreen.tap(*(await J("(() => { const b = document.querySelector('#bigpiano [data-bp=\"edit\"]').getBoundingClientRect(); return [b.x + b.width/2, b.y + b.height/2]; })()")))
        await J("(() => { __ls.S.cs = {m: 2, beat: 3, k: 0}; __ls.render(); })()")
        for m in [55, 59, 62, 65]:
            q = await center(m); await page.touchscreen.tap(q['x'], q['y']); await page.wait_for_timeout(60)
        await tap_write(page)
        print("edit mode G B D F → slot:", await J("(async () => { const s = await import('./js/song.js'); const c = s.getSlot(__ls.S.song.measures[2], 3, 0); return c ? (await import('./js/chords.js')).chordText(c) : null; })()"),
              "| mode saved:", await J("__ls.S.settings.pianoMode"))
        # melody tab in draft: plays, doesn't enter
        await page.touchscreen.tap(*(await J("(() => { const b = document.querySelector('#bigpiano [data-bp=\"draft\"]').getBoundingClientRect(); return [b.x + b.width/2, b.y + b.height/2]; })()")))
        await J("__ls.setLayer('melody')")
        before = await J("(async () => (await import('./js/melody.js')).melodyText(__ls.S.song, 0, 35))()")
        q = await center(60); await page.touchscreen.tap(q['x'], q['y']); await page.wait_for_timeout(100)
        after = await J("(async () => (await import('./js/melody.js')).melodyText(__ls.S.song, 0, 35))()")
        print("melody draft tap leaves the song alone:", before == after)
        print("errors:", errs or "none")
        await b.close()
asyncio.run(main())
