import json, os, re, subprocess, sys, tempfile, shutil, base64
SW = "/home/claude/samplework"
OUT = "/home/claude/lead-sheet/samples"
MEL = list(range(48, 97, 3))          # C3..C7
INST = [("altosax", "Alto sax", 65, 3.0, 0.3), ("tenorsax", "Tenor sax", 66, 3.0, 0.3), ("trumpet", "Trumpet", 56, 3.0, 0.3),
        ("flute", "Flute", 73, 3.0, 0.3), ("clarinet", "Clarinet", 71, 3.0, 0.3), ("violin", "Violin", 40, 3.0, 0.4)]
def peak_db(path):
    r = subprocess.run(["ffmpeg","-hide_banner","-i",path,"-af","volumedetect","-f","null","-"], capture_output=True, text=True).stderr
    return float(re.search(r"max_volume: (-?[\d.]+) dB", r)[1])
os.makedirs(OUT, exist_ok=True)
idx = json.load(open(f"{OUT}/index.json")) if os.path.exists(f"{OUT}/index.json") else []
for iid, label, prog, hold, tail in INST:
    tmp = tempfile.mkdtemp()
    subprocess.run(["node", f"{SW}/render.mjs", tmp, str(prog), str(hold), str(tail), ",".join(map(str, MEL))], cwd=SW, check=True, capture_output=True)
    gain = -1.0 - max(peak_db(f"{tmp}/{n}.wav") for n in MEL)
    notes = []
    for n in MEL:
        mp3 = f"{tmp}/{n}.mp3"
        subprocess.run(["ffmpeg","-v","error","-y","-i",f"{tmp}/{n}.wav","-t",str(hold+tail),"-af",
            f"pan=mono|c0=0.5*c0+0.5*c1,volume={gain}dB,afade=t=out:st={hold+tail-0.25}:d=0.25","-ar","44100","-c:a","libmp3lame","-b:a","64k",mp3], check=True)
        notes.append([n, base64.b64encode(open(mp3,'rb').read()).decode()])
    data = json.dumps({"id": iid, "notes": notes}, separators=(",", ":"))
    open(f"{OUT}/{iid}.json", "w").write(data)
    idx = [x for x in idx if x["id"] != iid] + [{"id": iid, "label": label, "group": "Melody", "notes": MEL, "bass": False, "bytes": len(data)}]
    shutil.rmtree(tmp); print("built", iid, round(len(data)/1e6, 2), "MB", flush=True)
json.dump(idx, open(f"{OUT}/index.json", "w"), indent=1)
