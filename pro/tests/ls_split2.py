# split layout on iPhone Duo sizes: piano full width along the bottom, keys above it, line at the hinge
import asyncio, base64
from playwright.async_api import async_playwright
CASES = [
  ("A_claude_669", {"width": 669, "height": 860, "screenWidth": 669, "screenHeight": 951, "screenOrientation": {"type": "portraitPrimary", "angle": 0}}, "on"),
  ("B_claude_951", {"width": 951, "height": 560, "screenWidth": 951, "screenHeight": 669, "screenOrientation": {"type": "landscapePrimary", "angle": 90}}, "on"),
  ("C_safari_fold", {"width": 669, "height": 951, "displayFeature": {"orientation": "horizontal", "offset": 472, "maskLength": 7}}, "auto"),
]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome")
        for name, metrics, mode in CASES:
            ctx = await b.new_context(viewport={"width": metrics["width"], "height": metrics["height"]}, device_scale_factor=2, is_mobile=True, has_touch=True)
            page = await ctx.new_page(); errs = []
            page.on("pageerror", lambda e: errs.append(str(e)))
            cdp = await ctx.new_cdp_session(page)
            await cdp.send("Emulation.setDeviceMetricsOverride", {**metrics, "deviceScaleFactor": 2, "mobile": True})
            await page.goto("http://127.0.0.1:8767/index.html?nosongs"); await page.wait_for_timeout(1500)
            J = page.evaluate
            if mode == "on":
                await J("(() => { __ls.S.settings.split = 'on'; __ls.renderAll(); })()"); await page.wait_for_timeout(300)
            await J("__ls.setLayer('chords')"); await J("(() => { __ls.S.cs = {m: 2, beat: 0, k: 0}; __ls.render(); })()"); await page.wait_for_timeout(200)
            m = await J("""(() => { const R = (s) => document.querySelector(s).getBoundingClientRect();
              const w = [...document.querySelectorAll('#bigpiano .pk.w')]; const keys = R('#bigpiano .bp-keys'), pn = R('#panel'), tr = R('#transport');
              return { split: document.body.classList.contains('split'), line: Math.round(document.querySelector('#topbar').getBoundingClientRect().top), whiteKeys: w.length, whiteW: Math.round(w[0].getBoundingClientRect().width),
                       pianoTop: Math.round(R('#bigpiano').top), keysH: Math.round(keys.height), pianoL: Math.round(R('#bigpiano').left), pianoR: Math.round(R('#bigpiano').right),
                       keysBottom: Math.round(keys.bottom), panelTop: Math.round(pn.top), panelBottom: Math.round(pn.bottom), minKeyH: Math.round(Math.min(...[...document.querySelectorAll('#panel .key')].map(k => k.getBoundingClientRect().height))) }; })()""")
            print(name, m, "| errors:", errs or "none")
            r = await cdp.send("Page.captureScreenshot", {"format": "png"}); open(f"/home/claude/shots/110_{name}.png", "wb").write(base64.b64decode(r["data"]))
            await ctx.close()
        await b.close()
asyncio.run(main())
