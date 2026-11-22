import asyncio, sys
from playwright.async_api import async_playwright
W, H = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (390, 844)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--autoplay-policy=no-user-gesture-required"])
        ctx = await b.new_context(viewport={"width": W, "height": H}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page(); errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errs.append(m.text))
        await page.goto("http://127.0.0.1:8767/index.html"); await page.wait_for_timeout(2000)
        # real tap on the A7(b9) symbol switches to chords mode
        box = await page.evaluate("(() => { const t = document.querySelector('.chord-sym[data-cell=\"2:0\"]').getBoundingClientRect(); return {x: t.x + 8, y: t.y + t.height / 2}; })()")
        await page.touchscreen.tap(box['x'], box['y']); await page.wait_for_timeout(300)
        print("layer:", await page.evaluate("__ls.S.layer"), "| cell:", await page.evaluate("JSON.stringify(__ls.S.cs)"), "| info:", await page.inner_text("#info-main"))
        print("grid cells:", await page.evaluate("document.querySelectorAll('#chordgrid .cell').length"), "| symbols:", await page.evaluate("document.querySelectorAll('#chordgrid .ch').length"), "| cut:", await page.evaluate("document.querySelectorAll('#chordgrid .ch.cut').length"))
        await page.screenshot(path=f"/home/claude/shots/86_grid_{W}.png")
        # tap the middle of bar 3's third cell (beat 3) on the staff
        c = await page.evaluate("(() => { const el = document.querySelector('#chordgrid .cell[data-m=\"3\"][data-b=\"2\"]').getBoundingClientRect(); return {x: el.x + el.width/2, y: el.y + el.height/2}; })()")
        await page.touchscreen.tap(c['x'], c['y']); await page.wait_for_timeout(200)
        print("tap cell 3:2 ->", await page.evaluate("JSON.stringify(__ls.S.cs)"), "| sel cells:", await page.evaluate("[...document.querySelectorAll('#chordgrid .cell.sel')].map(e=>e.dataset.m+':'+e.dataset.b).join(',')"))
        # back to melody: grid hidden, symbols back
        await page.evaluate("__ls.setLayer('melody')")
        print("melody mode: chords-mode class:", await page.evaluate("document.querySelector('#score-wrap').classList.contains('chords-mode')"), "| grid html len:", await page.evaluate("document.querySelector('#chordgrid').innerHTML.length"))
        print("errors:", errs or "none")
        await b.close()
asyncio.run(main())
