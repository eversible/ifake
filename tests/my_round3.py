import asyncio
from playwright.async_api import async_playwright
URL = "http://127.0.0.1:8766/index.html"
COUNT = """(() => { const AC = window.AudioContext; const P = AC.prototype; window.__osc = 0; window.__buf = 0;
  const o = P.createOscillator, s = P.createBufferSource;
  P.createOscillator = function () { __osc++; return o.call(this); }; P.createBufferSource = function () { __buf++; return s.call(this); }; })()"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--autoplay-policy=no-user-gesture-required"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        await ctx.add_init_script(COUNT)
        async def slow(route):
            await asyncio.sleep(1.5); await route.continue_()
        await ctx.route("**/samples/piano.json", slow)
        page = await ctx.new_page(); errs = []
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append(str(e)))
        J = page.evaluate
        await page.goto(URL); await page.wait_for_function("window.__chordpad"); await page.wait_for_timeout(200)
        # 1. tap before the piano has loaded
        await page.tap('#grid .cell[data-i="0"]'); await page.wait_for_timeout(300)
        print("1. tap before load -> synth oscillators:", await J("__osc"), "| sample sources:", await J("__buf"), "| piano loaded:", await J("!!__chordpad.engine.samples.piano"))
        await page.wait_for_timeout(2000)
        print("   after load -> synth oscillators:", await J("__osc"), "| sample sources:", await J("__buf"), "(the tap played once loaded)")
        # 2. loop on, single cell in bar 3 -> whole song from bar 3, no bracket
        await J("Object.assign(__chordpad.S.settings, {tempo:120, compPattern:'beats', loop:true, countIn:0})")
        await page.tap('#grid .cell[data-i="9"]'); await page.wait_for_timeout(100)
        print("2. chip:", (await page.inner_text('#loop-chip')).replace('\n', ' / '), "| bracket cells:", await J("document.querySelectorAll('#grid .lp').length"), "| layer hidden:", await J("document.querySelector('#loop-layer').hidden"))
        await page.tap('#btn-play'); await page.wait_for_timeout(700)
        print("   playing range:", await J("JSON.stringify(__chordpad.seq.range)"), "| first playhead cell:", await J("[...document.querySelectorAll('#grid .playing')].map(e=>+e.dataset.i)"))
        # 3. quick sideways drag (no hold) across cells 20..23 -> section loop at next bar
        box20 = await page.locator('#grid .cell[data-i="20"]').bounding_box(); box23 = await page.locator('#grid .cell[data-i="23"]').bounding_box()
        y = box20['y'] + 20
        await J(f"""(() => {{ const g = document.querySelector('#grid'); const c = document.querySelector('#grid .cell[data-i="20"]');
          c.dispatchEvent(new PointerEvent('pointerdown', {{bubbles:true, clientX:{box20['x']+5}, clientY:{y}}}));
          for (const x of [{box20['x']+20}, {box20['x']+50}, {box23['x']+10}]) g.dispatchEvent(new PointerEvent('pointermove', {{bubbles:true, clientX:x, clientY:{y}}}));
          g.dispatchEvent(new PointerEvent('pointerup', {{bubbles:true}})); }})()""")
        await page.wait_for_timeout(50)
        print("3. after quick drag: sel", await J("JSON.stringify(__chordpad.S.sel)"), "| chip:", (await page.inner_text('#loop-chip')).replace('\n', ' / '), "| pending:", await J("JSON.stringify(__chordpad.seq.pending)"))
        await page.wait_for_timeout(2300)
        print("   then range:", await J("JSON.stringify(__chordpad.seq.range)"), "| bracket cells:", await J("[...document.querySelectorAll('#grid .lp')].map(e=>+e.dataset.i).join(',')"))
        await page.screenshot(path="/home/claude/shots/50_section_loop.png")
        # 4. tap a single cell -> back to the whole song without jumping
        before = await J("__chordpad.seq.range.start + __chordpad.seq.beat")
        await page.tap('#grid .cell[data-i="2"]'); await page.wait_for_timeout(60)
        after = await J("__chordpad.seq.range.start + __chordpad.seq.beat")
        print("4. tap one cell -> range:", await J("JSON.stringify(__chordpad.seq.range)"), "| position before/after:", before, after, "| chip:", (await page.inner_text('#loop-chip')).replace('\n', ' / '))
        await page.tap('#btn-play')
        # 5. count-in from bar 3
        await J("__chordpad.S.settings.countIn = 1"); await page.tap('#grid .cell[data-i="8"]')
        await J("""(() => { const e=__chordpad.engine; window.__log=[]; const on=e.note.bind(e), oc=e.click.bind(e); e.note=(i,m,t,d,v,bus)=>{ __log.push({k:'n',m,t}); return on(i,m,t,d,v,bus); }; e.click=(t,a)=>{ __log.push({k:'c',t,a}); return oc(t,a); }; })()""")
        await page.tap('#btn-play'); await page.wait_for_timeout(2600); await page.tap('#btn-play')
        log = await J("__log"); t0 = log[0]['t'] if log else 0
        names = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B']
        print("5. count-in then bar 3:", [(x['k'] + ('' if x['k']=='c' else ':' + names[x['m']%12]), round(x['t']-t0, 2)) for x in log][:9])
        print("errors:", errs or "none")
        await b.close()
asyncio.run(main())
