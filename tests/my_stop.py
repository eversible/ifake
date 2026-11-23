import asyncio
from harness import *
SETCHART = """(txt) => { const {S} = __chordpad; const C = __C; S.chart.cells = txt.split(/\\s+/).filter(Boolean).filter(t => t !== '|').map(t => t === '.' ? null : C.parseChord(t)); while (S.chart.cells.length % S.chart.cpl) S.chart.cells.push(null); S.tl = null; __chordpad.setSel(0); }"""
async def main():
    async with async_playwright() as p:
        b, ctx, page, errs = await new_page(p, vp=(390, 844))
        J = page.evaluate
        await J(INIT); await page.wait_for_timeout(300)
        await J("""(() => { const e = __chordpad.engine; e.setReverb(0); window.__an = e.ctx.createAnalyser(); __an.fftSize = 2048; e.comp.connect(__an);
          window.__rms = () => { const d = new Float32Array(2048); __an.getFloatTimeDomainData(d); return Math.sqrt(d.reduce((s, x) => s + x * x, 0) / d.length); }; })()""")
        for inst in ['syn-pad', 'piano']:
            await J(f"Object.assign(__chordpad.S.settings, {{tempo:60, compPattern:'once', bassPattern:'root', chordInst:'{inst}', bassInst:'syn-bass', loop:false, countIn:0, reverb:0}})")
            await J(SETCHART, "| C . . . | . . . . | . . . . | . . . . |")
            await page.wait_for_timeout(300)
            await J("document.querySelector('#btn-play').click()"); await page.wait_for_timeout(900)
            playing = await J("__rms()")
            await J("document.querySelector('#btn-play').click()")
            res = []
            for ms in (60, 150, 300, 600):
                await page.wait_for_timeout(ms - (res[-1][0] if res else 0)); res.append((ms, await J("__rms()")))
            print(f"{inst:8} RMS while playing {playing:.4f}; after Stop:", ", ".join(f"{ms} ms {v:.5f}" for ms, v in res))
        print("errors:", errs)
        await b.close()
asyncio.run(main())
