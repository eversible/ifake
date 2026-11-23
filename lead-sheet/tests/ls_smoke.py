import asyncio, json
from playwright.async_api import async_playwright
URL = "http://127.0.0.1:8767/index.html?nosongs"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--autoplay-policy=no-user-gesture-required"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page(); errs = []
        page.on("console", lambda m: errs.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
        await page.goto(URL); await page.wait_for_timeout(2500)
        print("boot errors:", errs or "none")
        print("title:", await page.inner_text("#title"), "| bars:", await page.evaluate("__ls.S.song.measures.length"), "| info:", await page.inner_text("#info-main"))
        await page.screenshot(path="/home/claude/shots/80_ls_boot.png")
        print("instruments loaded:", await page.evaluate("Object.keys(__ls.engine.samples)"))
        await b.close()
asyncio.run(main())
