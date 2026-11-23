# the controls start at the hinge: (1) inside the Claude app (framed page under its 82 pt bar; the page can't see
# the screen), (2) Safari with the fold reported
import asyncio
from playwright.async_api import async_playwright
SCREEN_H, BAR = 951, 82
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome")
        # 1) Claude app: the web view is the screen minus the bar, and it reports that as the screen
        ctx = await b.new_context(viewport={"width": 669, "height": SCREEN_H - BAR}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page(); errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        cdp = await ctx.new_cdp_session(page)
        await cdp.send("Emulation.setDeviceMetricsOverride", {"width": 669, "height": SCREEN_H - BAR, "deviceScaleFactor": 2, "mobile": True, "screenWidth": 669, "screenHeight": SCREEN_H - BAR})
        await page.goto("http://127.0.0.1:8767/tests/host.html"); await page.wait_for_timeout(2000)
        f = page.frames[1]
        await f.evaluate("(() => { __ls.S.settings.split = 'on'; __ls.S.settings.evenChords = true; __ls.renderAll(); __ls.setLayer('chords'); })()"); await page.wait_for_timeout(300)
        top = await f.evaluate("document.querySelector('#topbar').getBoundingClientRect().top")
        chart = await f.evaluate("document.querySelector('#score-wrap').getBoundingClientRect().bottom")
        print(f"Claude app: chart ends {BAR + chart:.1f}, controls start {BAR + top:.1f} on screen | hinge {SCREEN_H / 2}  → off by {BAR + top - SCREEN_H / 2:+.1f}")
        print("  piano bottom = page bottom:", await f.evaluate("Math.round(document.querySelector('#bigpiano .bp-keys').getBoundingClientRect().bottom) === innerHeight"),
              "| key rows min height:", await f.evaluate("Math.round(Math.min(...[...document.querySelectorAll('#panel .key')].map(k => k.getBoundingClientRect().height)))"),
              "| piano keys height:", await f.evaluate("Math.round(document.querySelector('#bigpiano .bp-keys').getBoundingClientRect().height)"))
        await page.screenshot(path="/home/claude/shots/117_hinge.png")
        await ctx.close()
        # 2) Safari, fold reported by the browser (segments)
        ctx = await b.new_context(viewport={"width": 669, "height": 951}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        cdp = await ctx.new_cdp_session(page)
        await cdp.send("Emulation.setDeviceMetricsOverride", {"width": 669, "height": 951, "deviceScaleFactor": 2, "mobile": True, "displayFeature": {"orientation": "horizontal", "offset": 472, "maskLength": 7}})
        await page.goto("http://127.0.0.1:8767/index.html"); await page.wait_for_timeout(1500)
        seg = await page.evaluate("JSON.stringify(window.viewport.segments.map(r => [r.top, r.height]))")
        top = await page.evaluate("document.querySelector('#topbar').getBoundingClientRect().top")
        chart = await page.evaluate("document.querySelector('#score-wrap').getBoundingClientRect().bottom")
        print(f"Safari fold {seg}: chart ends {chart:.1f}, controls start {top:.1f}")
        print("errors:", errs or "none")
        await b.close()
asyncio.run(main())
