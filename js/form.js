// form.js — repeats and endings: turn bar marks into the order bars are played in.
// marks: { [barIndex]: { start: true, end: times (2 = play twice), ending: 1 | 2 | 3 } }

const mk = (marks, b) => (marks && marks[b]) || {};

export function unrollBars(nBars, marks) {
  const order = [];
  let i = 0, sectionStart = 0, pass = 1, jumped = false, guard = 0;
  while (i < nBars && guard++ < 20000) {
    const m = mk(marks, i);
    if (m.start && !jumped) { sectionStart = i; pass = 1; }
    jumped = false;
    if (m.ending && m.ending !== pass) { i++; continue; }          // an ending for another pass
    order.push(i);
    if (m.end) {
      let again;
      if (m.ending) {
        // repeat sign inside an ending: go round again only if a later ending is still to come
        again = false;
        for (let j = i + 1; j < nBars; j++) { const mj = mk(marks, j); if (mj.start || !mj.ending) break; if (mj.ending > pass) { again = true; break; } }
      } else again = pass < Math.max(2, m.end);
      if (again) { pass++; i = sectionStart; jumped = true; continue; }
      pass = 1; sectionStart = i + 1;
    } else if (m.ending && !mk(marks, i + 1).ending) {
      pass = 1; sectionStart = i + 1;                                // last ending finished
    }
    i++;
  }
  return order;
}

export function barsToCells(barOrder, bpb, nCells) {
  const out = [];
  for (const b of barOrder) for (let k = b * bpb; k < Math.min((b + 1) * bpb, nCells); k++) out.push(k);
  return out;
}

// shift marks when bars are inserted (count > 0) or removed (count < 0) at bar index `at`
export function shiftMarks(marks, at, count) {
  const out = {};
  for (const [k, v] of Object.entries(marks || {})) {
    const b = +k;
    if (b < at) out[b] = { ...v };
    else if (count < 0 && b < at - count) continue;                  // removed bar
    else out[b + count] = { ...v };
  }
  return out;
}
