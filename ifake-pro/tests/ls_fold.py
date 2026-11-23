# Split forced on inside an embedded viewer (page shorter than the screen): the line goes to the screen's middle,
# can be aligned by dragging, and the keys reach the bottom edge
import asyncio, base64
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome")
        ctx = await b.new_context(viewport={"width": 951, "height": 560}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page(); errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        cdp = await ctx.new_cdp_session(page)
        await cdp.send("Emulation.setDeviceMetricsOverride", {"width": 951, "height": 560, "deviceScaleFactor": 2, "mobile": True,
            "screenWidth": 951, "screenHeight": 669, "screenOrientation": {"type": "landscapePrimary", "angle": 90}})
        await page.goto("http://127.0.0.1:8767/index.html?nosongs"); await page.wait_for_timeout(1500)
        J = page.evaluate
        async def shot(path):
            r = await cdp.send("Page.captureScreenshot", {"format": "png"}); open(path, "wb").write(base64.b64decode(r["data"]))
        print("screen:", await J("[screen.width, screen.height, innerHeight]"))
        await J("(() => { __ls.S.settings.split = 'on'; __ls.renderAll ? __ls.renderAll() : null; })()")
        await J("window.dispatchEvent(new Event('resize'))"); await page.wait_for_timeout(400)
        line = "Math.round(document.querySelector('#topbar').getBoundingClientRect().top)"
        print("split:", await J("document.body.classList.contains('split')"), "| line at:", await J(line), "(hinge 226; 50% would be 280)")
        print("piano keys bottom:", await J("Math.round(document.querySelector('#bigpiano .bp-keys').getBoundingClientRect().bottom)"),
              "| last chord key bottom:", await J("Math.round(Math.max(...[...document.querySelectorAll('#panel .key')].map(k => k.getBoundingClientRect().bottom)))"), "| page bottom: 560")
        # align: open the line and drag it up 20 px
        await J("__ls.alignFold()"); await page.wait_for_timeout(100)
        await J("(() => { window.__ev = []; const fl = document.querySelector('#foldline'); ['pointerdown','pointermove','pointerup','pointercancel'].forEach(t => fl.addEventListener(t, e => __ev.push(t + ':' + Math.round(e.clientY) + ':' + e.pointerId), true)); })()")
        fl = await J("(() => { const r = document.querySelector('#foldline').getBoundingClientRect(); return {x: 200, y: r.y + r.height / 2}; })()")
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": fl['x'], "y": fl['y'], "id": 1}]})
        for d in range(1, 6):
            await cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": fl['x'], "y": fl['y'] - 4 * d, "id": 1}]})
        await shot("/home/claude/shots/108_align.png")
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); await page.wait_for_timeout(200)
        print("events:", await J("__ev.join(' ')"))
        print("after dragging up 20: adjust", await J("__ls.S.settings.foldAdjust"), "| line at:", await J(line))
        await page.evaluate("document.querySelector('#foldline button').click()"); await page.wait_for_timeout(900)
        print("aligner hidden:", await J("document.querySelector('#foldline').hidden"), "| saved:", await J("(Object.keys(localStorage).map(k => localStorage.getItem(k)).join('').match(/splitAdjust.:(-?[0-9]+)/) || [])[1]"))
        await shot("/home/claude/shots/109_fold.png")
        print("errors:", errs or "none")
        await b.close()
asyncio.run(main())
