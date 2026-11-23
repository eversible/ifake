import asyncio
from harness import *
SETCHART = """(txt) => { const {S} = __chordpad; const C = __C; S.chart.cells = txt.split(/\\s+/).filter(Boolean).filter(t => t !== '|').map(t => t === '.' ? null : C.parseChord(t)); while (S.chart.cells.length % S.chart.cpl) S.chart.cells.push(null); S.tl = null; __chordpad.setSel(0); }"""
RMS = """(() => { const e = __chordpad.engine; if (!window.__an) { window.__an = e.ctx.createAnalyser(); window.__an.fftSize = 2048; e.comp.connect(window.__an); }
  const d = new Float32Array(2048); window.__an.getFloatTimeDomainData(d); return Math.sqrt(d.reduce((s, x) => s + x * x, 0) / d.length); })()"""
async def main():
    async with async_playwright() as p:
        b, ctx, page, errs = await new_page(p, vp=(390, 844))
        J = page.evaluate
        await J(INIT); await page.wait_for_timeout(300)
        await J("Object.assign(__chordpad.S.settings, {tempo:60, compPattern:'once', bassPattern:'root', chordInst:'syn-pad', bassInst:'syn-bass', loop:false, countIn:0})")
        await J(SETCHART, "| C . . . | . . . . | . . . . | . . . . |")
        # B1: does Stop actually silence the output?
        await J("document.querySelector('#btn-play').click()"); await page.wait_for_timeout(900)
        before = await J(RMS)
        await J("document.querySelector('#btn-play').click()"); await page.wait_for_timeout(350)
        after = await J(RMS)
        print(f"B1 output RMS while playing {before:.4f} -> 350 ms after Stop {after:.5f}")
        for _ in range(3):
            await J("document.querySelector('#btn-play').click()"); await page.wait_for_timeout(150)
            await J("document.querySelector('#btn-play').click()"); await page.wait_for_timeout(50)
        await page.wait_for_timeout(350)
        print(f"B1 RMS 350 ms after 3 quick play/stop cycles: {await J(RMS):.5f}")
        # B15: loop markers survive an edit while playing
        await J("Object.assign(__chordpad.S.settings, {tempo:120, compPattern:'beats', loop:true})")
        await J(SETCHART, "| C . . . | F . . . | G . . . | C . . . |")
        await J("__chordpad.setSel(0, 7)"); await J("document.querySelector('#btn-play').click()"); await page.wait_for_timeout(400)
        a = await J("document.querySelectorAll('#grid .lp').length")
        await J("__chordpad.setSel(2)"); await J("__chordpad.setSel(0, 7)"); await J("__chordpad.keyAction('q', 'min')"); await page.wait_for_timeout(300)
        bb = await J("document.querySelectorAll('#grid .lp').length")
        pl = await J("document.querySelectorAll('#grid .playing').length")
        print("B15 loop cells before edit:", a, "| after edit while playing:", bb, "| playhead cells:", pl)
        # loop follows selection: select bars 3–4 while bars 1–2 loop
        await J("""(() => { const e=__chordpad.engine; window.__log=[]; const on=e.note.bind(e); e.note=(i,m,t,d,v,bus)=>{ __log.push({m,t,bus}); return on(i,m,t,d,v,bus); }; })()""")
        t_sel = await J("(() => { __chordpad.setSel(8, 15); return __chordpad.engine.ctx.currentTime; })()")
        chip = await page.inner_text("#loop-chip")
        await page.wait_for_timeout(2600)
        log = await J("__log"); names = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B']
        seqd = [(round(x['t'] - t_sel, 2), names[x['m'] % 12]) for x in log if x['bus'] == 'chord']
        roots = []
        for t, n in seqd:
            if not roots or roots[-1][0] != t: roots.append((t, n))
        print("Loop follows selection — chip:", chip.replace('\n', ' / '))
        print("   first note of each beat after selecting bars 3–4 (s, note):", roots[:9])
        print("   playRange now:", await J("JSON.stringify(__chordpad.S.playRange)"))
        await J("document.querySelector('#btn-play').click()")
        # loop toggle mid-play doesn't restart
        print("errors:", errs)
        await b.close()
asyncio.run(main())
