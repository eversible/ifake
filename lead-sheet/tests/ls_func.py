import asyncio, json
from playwright.async_api import async_playwright
URL = "http://127.0.0.1:8767/index.html"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--autoplay-policy=no-user-gesture-required"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page(); errs = []
        page.on("console", lambda m: errs.append(f"{m.type}: {m.text}") if m.type in ("error",) else None)
        page.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
        await page.goto(URL); await page.wait_for_timeout(2000)
        J = page.evaluate
        mt = lambda a, b2: J(f"(async () => {{ const m = await import('./js/melody.js'); return m.melodyText(__ls.S.song, {a}, {b2}); }})()")
        key = lambda action, arg=None: J(f"""(() => {{ const b=[...document.querySelectorAll('#panel .key')].find(x=>x.dataset.action==={json.dumps(action)} && ({json.dumps(arg)}===null || x.dataset.arg==={json.dumps(str(arg) if arg is not None else None)})); if(!b) throw new Error('no key '+{json.dumps(action)}); b.dispatchEvent(new PointerEvent('pointerdown',{{bubbles:true,cancelable:true}})); }})()""")
        piano = lambda midi: J(f"document.querySelector('#piano-strip .pk[data-midi=\"{midi}\"]').dispatchEvent(new PointerEvent('pointerdown',{{bubbles:true,cancelable:true}}))")
        # new empty song to test entry
        await J("document.querySelector('#btn-charts').click()"); await page.wait_for_timeout(200)
        await J("document.querySelector('#ch-new').click()"); await page.wait_for_timeout(300)
        print("new song bars:", await J("__ls.S.song.measures.length"), "| key fifths kept:", await J("__ls.S.song.key.fifths"))
        await key('dur', 8)
        for m in [70, 72, 74, 77]: await piano(m)                 # Bb C D F eighths
        await key('dur', 4); await key('dot', None); await piano(79)  # dotted quarter G
        await key('dur', 8); await key('dot', None); await key('dot', None); await piano(81)  # dot cycles 1->2->0: eighth A
        print("1. entry:", await mt(0, 2))
        print("   info:", await page.inner_text("#info-main"), "|", await page.inner_text("#info-sub"))
        # tap the 2nd note (C) and change it to a quarter
        await J("__ls.tapScore({ m: 0, i: 1, beat: 0, above: false })")
        await key('dur', 4)
        print("2. retime tapped note:", await mt(0, 1))
        # tuplet: 3 eighth-triplets into bar 2
        await J("__ls.tapScore({ m: 1, i: 0, beat: 0, above: false })")
        await key('dur', 8); await key('tup', None)
        for m in [74, 75, 77]: await piano(m)
        await key('tup', None); await key('tup', None); await key('tup', None); await key('tup', None)   # back to off
        await key('dur', 2); await piano(82); await key('tie', None)
        print("3. triplet + half + tie:", await mt(1, 3))
        # semitone up on selected, accidentals, octave
        await key('up', None); await key('oct', 1)
        print("4. up + 8va on last note:", await page.inner_text("#info-main"))
        await key('del', None)
        print("5. delete ->", await mt(1, 3))
        await key('undo', None); print("   undo ->", await mt(1, 3))
        # typed bar
        await J("__ls.tapScore({ m: 3, i: 0, beat: 0, above: false })")
        await J("[...document.querySelectorAll('#panel .key')].find(x=>x.dataset.action==='type').click()"); await page.wait_for_timeout(100)
        await page.fill("#type-input", "16:F5 16:G5 16:A5 16:Bb5 5[16:C6 16:Bb5 16:A5 16:G5 16:F5] 2:D5 | 1:r")
        await page.wait_for_timeout(50); print("6. type preview:", await page.inner_text("#type-msg"))
        await page.press("#type-input", "Enter"); await page.wait_for_timeout(200)
        print("   typed ->", await mt(3, 5))
        # chords: tap chord row, add a chord with keys
        await J("__ls.tapScore({ m: 0, i: 0, beat: 0, above: true })")
        print("7. layer after tapping chord row:", await J("__ls.S.layer"))
        for k, a in [('root', 'B'), ('cacc', '-1'), ('q', 'maj')]: await key(k, a)
        await J("__ls.keyAction('cnext'); __ls.keyAction('cnext')")
        for k, a in [('root', 'G'), ('q', 'min'), ('q', 'dom7')]: await key(k, a)
        print("   chords bar 1:", await J("__ls.S.song.measures[0].ch.map(c=>c? (c.root? 'CDEFGAB'[c.root.letter]+(c.root.acc<0?'b':'')+c.quals.join('+'):'NC') :'.').join(' ')"))
        # bars: repeat around bars 1-2, endings
        await J("__ls.setLayer('bars')"); await J("__ls.tapScore({ m: 0, i: 0, beat: 0, above: false })"); await key('rstart', None)
        await J("__ls.tapScore({ m: 1, i: 0, beat: 0, above: false })"); await key('rend', None); await key('ending', 1)
        await J("__ls.tapScore({ m: 2, i: 0, beat: 0, above: false })"); await key('ending', 2)
        print("8. marks:", await J("JSON.stringify(__ls.S.song.marks)"))
        await key('insbar', None); print("   +bar after bar 3 -> bars:", await J("__ls.S.song.measures.length"), "| marks:", await J("JSON.stringify(__ls.S.song.marks)"))
        await page.screenshot(path="/home/claude/shots/81_ls_edit.png")
        # playback: whole song, log melody + chord events
        await J("""(() => { const e=__ls.engine; window.__log=[]; const on=e.note.bind(e); e.note=(i,m,t,d,v,bus)=>{ __log.push({i,m,t:+t.toFixed(3),d:+d.toFixed(3),bus}); return on(i,m,t,d,v,bus); }; })()""")
        await J("__ls.S.song.tempo = 240; __ls.S.settings.loop = false; __ls.setLayer('melody'); __ls.tapScore({ m: 0, i: 0, beat: 0, above: false })")
        await page.tap("#btn-play"); await page.wait_for_timeout(5600)
        log = await J("__log"); await J("if (__ls.seq.playing) document.querySelector('#btn-play').click()")
        mel = [x for x in log if x['bus'] == 'melody']; ch = [x for x in log if x['bus'] == 'chord']
        t0 = mel[0]['t'] if mel else 0
        print("9. melody notes:", len(mel), "| first 8 (midi@beats):", [(x['m'], round((x['t'] - t0) * 4, 2)) for x in mel[:8]])
        print("   chord notes:", len(ch), "| playing still:", await J("__ls.seq.playing"))
        # drag-select bars 3-4 by setting bars and loop
        await J("__ls.S.bars = {a: 2, b: 3}; __ls.S.settings.loop = true;")
        print("10. play range with bars:", await J("JSON.stringify(__ls.playRange().meta)"), "| order length:", await J("__ls.playRange().order.length"))
        print("errors:", errs or "none")
        await b.close()
asyncio.run(main())
