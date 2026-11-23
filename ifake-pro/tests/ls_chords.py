import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--autoplay-policy=no-user-gesture-required"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page(); errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        await page.goto("http://127.0.0.1:8767/index.html?nosongs"); await page.wait_for_timeout(2000)
        # tap the A7(b9) chord symbol on the score (real tap at its position)
        box = await page.evaluate("(() => { const t = document.querySelector('.chord-sym[data-cell=\"2:0\"]').getBoundingClientRect(); return {x: t.x + 8, y: t.y + t.height / 2}; })()")
        await page.touchscreen.tap(box['x'], box['y']); await page.wait_for_timeout(300)
        print("layer:", await page.evaluate("__ls.S.layer"), "| cell:", await page.evaluate("JSON.stringify(__ls.S.cs)"), "| info:", await page.inner_text("#info-main"), "|", await page.inner_text("#info-sub"))
        await page.screenshot(path="/home/claude/shots/83_ls_chords.png")
        # tap a real note on the staff and check selection
        await page.evaluate("__ls.setLayer('melody')")
        nb = await page.evaluate("(() => { const M = __ls.S.layout.measures[4]; const n = M.notes[2]; const r = document.querySelector('#score').getBoundingClientRect(); return {x: r.x + n.x + 5, y: r.y + n.y}; })()")
        await page.touchscreen.tap(nb['x'], nb['y']); await page.wait_for_timeout(200)
        print("tapped note:", await page.evaluate("JSON.stringify(__ls.S.sel)"), "|", await page.inner_text("#info-main"))
        print("errors:", errs or "none")
        await b.close()
asyncio.run(main())
