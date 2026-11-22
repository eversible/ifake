import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--autoplay-policy=no-user-gesture-required"])
        for (W, H, tag) in [(390, 844, "p"), (844, 390, "l")]:
            ctx = await b.new_context(viewport={"width": W, "height": H}, device_scale_factor=2, is_mobile=True, has_touch=True)
            page = await ctx.new_page(); errs = []
            page.on("pageerror", lambda e: errs.append(str(e)))
            await page.goto("http://127.0.0.1:8767/index.html"); await page.wait_for_timeout(2000)
            await page.evaluate("__ls.setLayer('chords')")
            # loop bars 28-31 and scroll to the endings
            await page.evaluate("(() => { const S = __ls.S; S.bars = {a: 28, b: 31}; __ls.renderOverlay ? __ls.renderOverlay() : null; })()")
            await page.evaluate("(() => { const M = __ls.S.layout.measures[29]; document.querySelector('#score-wrap').scrollTop = M.sysTop - 20; })()")
            await page.wait_for_timeout(200)
            # start playback from the loop
            await page.click("#btn-play") if await page.query_selector("#btn-play") else None
            await page.wait_for_timeout(2500)
            print(tag, "lp cells:", await page.evaluate("document.querySelectorAll('#chordgrid .cell.lp').length"), "| playing:", await page.evaluate("[...document.querySelectorAll('#chordgrid .cell.playing')].map(e=>e.dataset.m+':'+e.dataset.b).join(',')"))
            await page.screenshot(path=f"/home/claude/shots/87_grid_end_{tag}.png")
            print(tag, "errors:", errs or "none")
            await ctx.close()
        await b.close()
asyncio.run(main())
