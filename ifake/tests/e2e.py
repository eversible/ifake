import asyncio, json, sys
from playwright.async_api import async_playwright
URL = "http://127.0.0.1:8766/index.html"
SHOTS = "/home/claude/shots"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--autoplay-policy=no-user-gesture-required"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        errors = []
        page.on("console", lambda m: errors.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        await page.goto(URL); await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{SHOTS}/01_initial.png")
        J = lambda s: page.evaluate(s)
        print("cells with chords:", await J("__chordpad.S.chart.cells.filter(Boolean).length"))
        print("piano loaded:", await J("!!__chordpad.engine.samples.piano"), "| index:", await J("__chordpad.engine.index.length"))
        # tap first cell
        await page.tap('#grid .cell[data-i="0"]'); await page.wait_for_timeout(200)
        print("info after tap:", await page.inner_text("#info-chord"), "|", await page.inner_text("#info-notes"))
        # build a chord with the keyboard on an empty cell (line 3)
        await page.tap('#grid .cell[data-i="32"]')
        async def key(label):
            await page.locator("#keyboard .key", has_text=label).filter(has_text=label).first.dispatch_event("pointerdown")
        for k in ["F", "♯", "–", "7"]: await page.evaluate(f"""(() => {{ const b=[...document.querySelectorAll('#keyboard .key')].find(x=>x.textContent==={json.dumps(k)}); b.dispatchEvent(new PointerEvent('pointerdown',{{bubbles:true}})); }})()""")
        await page.evaluate("""(() => { const b=[...document.querySelectorAll('#keyboard .key')].find(x=>x.textContent==='♭5'); b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); })()""")
        print("cell 32 after keys:", await J("(await import('./js/chords.js')).chordText(__chordpad.S.chart.cells[32])") if False else await J("document.querySelector('#info-chord').textContent"))
        # slash chord: next bar, C, '/', E
        await page.tap('#grid .cell[data-i="36"]')
        for k in ["C", "Δ", "/", "E"]:
            await page.evaluate(f"""(() => {{ const b=[...document.querySelectorAll('#keyboard .key')].find(x=>x.textContent==={json.dumps(k)}); b.dispatchEvent(new PointerEvent('pointerdown',{{bubbles:true}})); }})()""")
        print("cell 36:", await page.inner_text("#info-chord"), "|", await page.inner_text("#info-notes"))
        # typed progression from bar 11 (cell 40)
        await page.tap('#grid .cell[data-i="40"]')
        await page.evaluate("""(() => { const b=[...document.querySelectorAll('#keyboard .key')].find(x=>x.textContent==='⌨'); b.click(); })()""")
        await page.fill("#type-input", "E-7b5 A7b9 | D-7 G7 | %")
        await page.wait_for_timeout(100)
        print("type preview:", await page.inner_text("#type-msg"))
        await page.press("#type-input", "Enter"); await page.wait_for_timeout(150)
        print("cells 40-51:", await J("__chordpad.S.chart.cells.slice(40,52).map(c=>c?(c.nc?'NC':c.root.letter+':'+c.quals.join('+')):'.').join(' ')"))
        await page.screenshot(path=f"{SHOTS}/02_edited.png")
        # undo / redo
        await page.evaluate("__chordpad.keyAction('undo')"); u = await J("__chordpad.S.chart.cells.slice(40,52).filter(Boolean).length")
        await page.evaluate("__chordpad.keyAction('redo')"); r = await J("__chordpad.S.chart.cells.slice(40,52).filter(Boolean).length")
        print("undo/redo chords in bars:", u, r)
        # long press range: from cell 0 to cell 7
        await page.tap('#grid .cell[data-i="0"]')
        box = await page.locator('#grid .cell[data-i="7"]').bounding_box()
        await page.evaluate(f"""(() => {{ const el=document.querySelector('#grid .cell[data-i="7"]'); el.dispatchEvent(new PointerEvent('pointerdown',{{bubbles:true,clientX:{box['x']+5},clientY:{box['y']+5}}})); }})()""")
        await page.wait_for_timeout(600)
        await page.evaluate("""document.querySelector('#grid').dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))""")
        print("selection after long press:", await J("JSON.stringify(__chordpad.S.sel)"))
        # instrument note scheduling and play the range
        await page.evaluate("""(() => { const e=__chordpad.engine; window.__log=[]; const orig=e.note.bind(e); e.note=(inst,m,t,d,v,bus)=>{ window.__log.push({inst,m,t:+t.toFixed(3),d:+d.toFixed(3),bus}); return orig(inst,m,t,d,v,bus); }; })()""")
        await page.evaluate("__chordpad.S.settings.tempo=120; __chordpad.S.settings.bassPattern='walk'; __chordpad.S.settings.compPattern='charleston'")
        await page.tap("#btn-play"); await page.wait_for_timeout(4300)
        await page.screenshot(path=f"{SHOTS}/03_playing.png")
        await page.tap("#btn-play"); await page.wait_for_timeout(200)
        log = await J("window.__log")
        bass = [x for x in log if x["bus"] == "bass"]; chord = [x for x in log if x["bus"] == "chord"]
        bt = [x["t"] for x in bass]
        print("events:", len(log), "| bass notes:", len(bass), "| bass gaps:", sorted(set(round(b2-b1,3) for b1,b2 in zip(bt,bt[1:])))[:6])
        print("bass midi:", [x["m"] for x in bass][:16])
        print("chord onset times:", sorted(set(x["t"] for x in chord))[:8])
        print("still playing?", await J("__chordpad.seq.playing"))
        # settings + charts sheets
        await page.tap("#btn-settings"); await page.wait_for_timeout(200); await page.screenshot(path=f"{SHOTS}/04_settings.png")
        await page.select_option("#st-chord", "vibes"); await page.wait_for_timeout(1500)
        print("vibes loaded:", await J("!!__chordpad.engine.samples.vibes"))
        await page.tap("#sheet-settings [data-close]")
        await page.tap("#btn-charts"); await page.wait_for_timeout(200); await page.screenshot(path=f"{SHOTS}/05_charts.png")
        txt = await page.input_value("#ch-export"); print("export:\n" + txt[:400])
        await page.tap("#sheet-charts [data-close]")
        # all packs decode
        res = await J("""(async () => { const e=__chordpad.engine; const out={}; for (const x of e.index) { try { await e.load(x.id); out[x.id]=e.samples[x.id].notes.length+' notes, onset '+Math.round(e.samples[x.id].notes[5].onset*1000)+'ms'; } catch(err) { out[x.id]='FAIL '+err; } } return out; })()""")
        for k, v in res.items(): print(f"  {k:10} {v}")
        await page.set_viewport_size({"width": 844, "height": 390}); await page.wait_for_timeout(300)
        await page.screenshot(path=f"{SHOTS}/06_landscape.png")
        print("console problems:", errors if errors else "none")
        await b.close()
asyncio.run(main())
