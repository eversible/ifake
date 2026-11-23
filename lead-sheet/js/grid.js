// grid.js — the even chord grid (as in Chord Pad): equal-width bars, equal beats, divided beats split evenly.
// Used for chord charts and for the Chords tab's "Even" view. It returns a layout shaped like renderScore's,
// so the chord cells, overlays, taps and playhead work the same in both views.
//
// A pickup bar sits in a left margin, before bar 1's bar line (as on printed charts): every bar has the same
// width, bar lines line up down the page, bars 1, 5, 9… start the lines, and the pickup's beats are as wide as
// any other beat. On the other lines the margin holds the bar numbers.
import { slotList } from './song.js';

const LINE_H = 66, CELL_Y = 14, CELL_H = 50, MARGIN = 8;

export function layoutGrid(song, width, barsPerLine) {
  const per = Math.max(1, barsPerLine), inner = Math.max(120, width - 2 * MARGIN), num = song.time.num;
  const first = song.measures[0], pick = song.pickup && first && first.ch.length < num ? first.ch.length : 0;
  const barW = inner / (per + pick / num), gutter = pick ? barW * (pick / num) : 0;
  const measures = [];
  let lines = 1;
  song.measures.forEach((meas, m) => {
    const beats = meas.ch.length, isPick = pick && m === 0;
    const i = m - (pick ? 1 : 0), line = isPick ? 0 : Math.floor(i / per);
    const x = isPick ? MARGIN : MARGIN + gutter + (i % per) * barW, w = isPick ? gutter : barW;
    const top = line * LINE_H + CELL_Y + 17, bottom = top + CELL_H - 34;   // cells span top − 17 … bottom + 17
    lines = Math.max(lines, line + 1);
    measures.push({
      m, line, x, w, top, bottom, sysTop: line * LINE_H, sysH: LINE_H, startX: x + 10, endX: x + w,
      notes: [], beatX: Array.from({ length: beats }, (_, b) => x + (b / beats) * w + 6),
      slots: slotList(meas).map((q) => ({ b: q.b, k: q.k, pos: q.pos, n: q.n, x: x + (q.pos / beats) * w + 6 })),
      grid: true,
    });
  });
  return { measures, height: lines * LINE_H + 10, scale: 1, grid: true, gutter };
}
