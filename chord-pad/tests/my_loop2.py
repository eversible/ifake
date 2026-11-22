import asyncio
from harness import *
async def main():
    async with async_playwright() as p:
        b, ctx, page, errs = await new_page(p, vp=(390, 844))
        J = page.evaluate
        await J(INIT); await page.wait_for_timeout(300)
        await J("""(() => { const e=__chordpad.engine; window.__log=[]; const on=e.note.bind(e); e.note=(i,m,t,d,v,bus)=>{ __log.push({m,t,bus}); return on(i,m,t,d,v,bus); }; })()""")
        await J("Object.assign(__chordpad.S.settings, {tempo:120, compPattern:'beats', loop:true})")
        # single cell, loop on -> just that bar
        await page.tap('#grid .cell[data-i="9"]'); await page.wait_for_timeout(100)
        print("loop on, cell 9 selected -> range:", await J("JSON.stringify(__chordpad.playRange())"), "| chip:", (await page.inner_text('#loop-chip')).replace('\n', ' / '))
        print("   highlighted loop cells:", await J("[...document.querySelectorAll('#grid .lp')].map(e=>+e.dataset.i).join(',')"))
        await page.tap("#btn-play"); await page.wait_for_timeout(2600)
        cells = await J("JSON.stringify(__chordpad.S.playRange)")
        await page.screenshot(path="/home/claude/shots/30_loop_bar.png")
        await page.tap("#btn-play")
        print("   playing range:", cells, "| sequencer looped bar 3 only:", await J("__chordpad.seq.range ? JSON.stringify([__chordpad.seq.range.start, __chordpad.seq.range.end]) : 'stopped'"))
        # loop off -> to the end
        await page.tap("#loop-chip"); await page.wait_for_timeout(100)
        print("loop off, cell 9 -> range:", await J("JSON.stringify(__chordpad.playRange())"), "| chip:", (await page.inner_text('#loop-chip')).replace('\n', ' / '), "| bracket cells:", await J("document.querySelectorAll('#grid .lp').length"))
        await page.tap("#loop-chip")
        # empty bar with nothing sounding
        await J("__chordpad.S.chart.cells.fill(null, 0, 4); __chordpad.S.tl=null; __chordpad.setSel(1)")
        await page.tap("#btn-play"); await page.wait_for_timeout(200)
        print("empty first bar -> playing?", await J("__chordpad.seq.playing"), "| toast:", await page.inner_text('#toast'))
        # tap the chord strip
        await J("__chordpad.setSel(8)"); await J("__log.length = 0")
        await page.tap("#info"); await page.wait_for_timeout(100)
        log = await J("__log")
        print("tap chord strip -> notes played:", len(log), "| chord:", await page.inner_text('#info-chord'))
        print("errors:", errs)
        await b.close()
asyncio.run(main())
