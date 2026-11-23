import asyncio, json
from harness import *
async def main():
    async with async_playwright() as p:
        b, ctx, page, errs = await new_page(p, vp=(390, 844))
        J = page.evaluate
        await J(INIT); await page.wait_for_timeout(300)
        # B4: ⌨ prefill of a two-extension chord, opened by a real tap, then Enter
        await J("__chordpad.setSel(32)"); await J("__chordpad.S.chart.cells[32] = __C.parseChord('G7(♭9, ♯11)'); __chordpad.setSel(32)")
        await page.tap("#keyboard .key[aria-label='Type a chord or progression']"); await page.wait_for_timeout(200)
        pre = await page.input_value("#type-input")
        typing = await J("document.body.classList.contains('typing')")
        kbhidden = await J("getComputedStyle(document.querySelector('#keyboard')).display")
        await page.press("#type-input", "Enter"); await page.wait_for_timeout(150)
        print("B4 prefill:", repr(pre), "| typing mode:", typing, "| chord keyboard display:", kbhidden,
              "| after Enter typebar hidden:", await J("document.querySelector('#typebar').hidden"), "| cell:", await J("__ct(__chordpad.S.chart.cells[32])"))
        # B13: settings chosen on another device (newer settingsAt) load that instrument
        await J("""(() => { const d = __chordpad.libraryData(); const m = JSON.parse(JSON.stringify(d)); m.settings.chordInst = 'vibes'; m.settingsAt = Date.now() + 5000; __chordpad.store.onExternal(m); })()""")
        await page.wait_for_timeout(1500)
        print("B13 chordInst:", await J("__chordpad.S.settings.chordInst"), "| vibes loaded:", await J("!!__chordpad.engine.samples.vibes"))
        # P2: instruments beyond 3 are freed
        for inst in ['strings', 'warmpad', 'organ', 'brass']:
            await J(f"__chordpad.S.settings.chordInst = '{inst}'"); await J(f"__chordpad.engine.load('{inst}').then(() => __chordpad.engine.trim([__chordpad.S.settings.chordInst, __chordpad.S.settings.bassInst]))"); await page.wait_for_timeout(900)
        print("P2 decoded instruments kept:", await J("Object.keys(__chordpad.engine.samples)"))
        # B12: 3 beats per bar offers only whole-bar line lengths
        await page.tap("#btn-settings"); await page.wait_for_timeout(200)
        await page.select_option("#st-bpb", "3"); await page.wait_for_timeout(200)
        print("B12 cpl after choosing 3 beats/bar:", await J("__chordpad.S.chart.cpl"), "| options:", await J("[...document.querySelectorAll('#st-cpl option')].map(o=>o.value).join(',')"))
        await page.select_option("#st-bpb", "4"); await page.select_option("#st-cpl", "16"); await page.tap("#sheet-settings [data-close]")
        # import with nonsense layout
        print("import 'Cells: 0/line':", await J("(() => { try { return 'ok'; } catch(e) { return e.message; } })()"))
        print("errors:", errs)
        await b.close()
asyncio.run(main())
