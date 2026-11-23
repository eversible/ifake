import itertools, random
random.seed(1)
roots = [l+a for l in "CDEFGAB" for a in ["", "♯", "♭"]] + ["C𝄪", "F𝄫", "B♯", "E♯", "C♭", "F♭", "G𝄪", "A𝄫"]
quals = ["", "-", "m", "min", "Δ", "M", "Maj", "maj", "+", "aug", "ø", "o/", "0", "o", "dim", "-Δ", "-+", "+Δ", "mMaj", "minMaj", "mΔ"]
nums = ["", "6", "6/9", "7", "9", "11", "13"]
exts = ["", "(sus)", "(sus2)", "(sus4)", "(add9)", "(♭9)", "(♯9)", "(♯11)", "(♭13)", "(♭5)", "(♯5)", "(omit5)", "(omit3)",
        "(♭9, ♯11)", "(sus4, ♭9)", "(add♭9)", "(sus♭2)", "(9)", "(add11, omit5)", "(♯9, ♭13)", "(add#11)", "(b9)"]
out = []
for r, q, n in itertools.product(roots, quals, nums):
    out.append(r + q + n)
    for e in random.sample(exts[1:], 3):
        out.append(r + q + n + e)
open("corpus.txt", "w").write("\n".join(out) + "\n")
print(len(out))
