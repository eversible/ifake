import sys
from collections import Counter
j = dict(l.rstrip('\n').split('\t') for l in open(sys.argv[1]))
k = dict(l.rstrip('\n').split('\t') for l in open(sys.argv[2]))
diff = [(s, j[s], k[s]) for s in j if j[s] != k[s]]
print("total", len(j), "| julia errors", sum(v=="ERROR" for v in j.values()), "| js errors", sum(v=="ERROR" for v in k.values()), "| mismatches", len(diff))
kinds = Counter(("jERR" if a=="ERROR" else "jOK") + "/" + ("kERR" if b=="ERROR" else "kOK") for s,a,b in diff)
print(kinds)
for s, a, b in diff[:30]: print(f"  {s:24} julia: {a:30} js: {b}")
