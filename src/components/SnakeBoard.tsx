import { useEffect, useRef, useState } from "react";
import { DominoTile } from "./DominoTile";
import type { Placed } from "@/lib/dominoEngine";

const SHORT = { xs: 44, sm: 56, md: 72 } as const;
type Sz = keyof typeof SHORT;

type Item = {
  x: number;
  y: number;
  w: number;
  h: number;
  a: number;
  b: number;
  horizontal: boolean;
  isDouble: boolean;
};

export function SnakeBoard({ board, tileSize = "sm" }: { board: Placed[]; tileSize?: Sz }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ w: 360, h: 240 });

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(() => {
      if (!wrapRef.current) return;
      setVp({
        w: Math.max(200, wrapRef.current.clientWidth),
        h: Math.max(200, wrapRef.current.clientHeight),
      });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const unit = SHORT[tileSize];
  const long = unit * 2;
  const pad = 8;
  // Available row width inside the felt; turn when exceeding
  const rowMax = Math.max(unit * 6, vp.w - pad * 2 - unit); // leave room for fab buttons

  // Snake layout in "chain space" — we'll translate to fit later.
  const items: Item[] = [];
  let dir: "R" | "D" | "L" | "U" = "R";
  let cx = 0; // chain pointer (next tile center)
  let cy = 0;
  let rowStartCx = 0;
  let placedInRow = 0;

  const place = (a: number, b: number) => {
    const isDouble = a === b;

    const compute = (d: typeof dir) => {
      const horiz = d === "R" || d === "L";
      const tileLong = isDouble ? unit : long;
      const tileShort = isDouble ? long : unit;
      const w = horiz ? tileLong : tileShort;
      const h = horiz ? tileShort : tileLong;
      const step = (isDouble ? unit : long) / 2;
      let centerX = cx;
      let centerY = cy;
      if (d === "R") centerX = cx + step;
      if (d === "L") centerX = cx - step;
      if (d === "D") centerY = cy + step;
      if (d === "U") centerY = cy - step;
      const x = centerX - w / 2;
      const y = centerY - h / 2;
      return { horiz, w, h, x, y, centerX, centerY, step };
    };

    // Decide if we should turn before placing
    if (items.length > 0 && (dir === "R" || dir === "L")) {
      const probe = compute(dir);
      const rowSpan = Math.abs(probe.centerX - rowStartCx);
      if (rowSpan > rowMax) {
        // turn down then reverse direction => U-turn (zig-zag)
        dir = "D";
        // step down by long to leave space for next row
        cy += long;
        // now flip horizontal direction for the new row
        const next = compute(dir); // not used directly; we instead do row break:
        void next;
        dir = dir === "D" ? (placedInRow % 2 === 0 ? "L" : "R") : dir;
        // Easier: alternate based on row count
        const newRow = Math.round(cy / long);
        dir = newRow % 2 === 1 ? "L" : "R";
        rowStartCx = cx;
        placedInRow = 0;
      }
    }

    const r = compute(dir);

    items.push({
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      a,
      b,
      horizontal: r.horiz ? !isDouble : isDouble,
      isDouble,
    });
    cx = r.centerX + (dir === "R" ? r.step : dir === "L" ? -r.step : 0);
    cy = r.centerY + (dir === "D" ? r.step : dir === "U" ? -r.step : 0);
    placedInRow += 1;
  };

  for (const p of board) {
    const [aa, bb] = p.tile;
    const a = p.flipped ? bb : aa;
    const b = p.flipped ? aa : bb;
    place(a, b);
  }

  // Translate everything to positive coords with padding
  let dx = pad, dy = pad, innerW = vp.w, innerH = vp.h;
  if (items.length > 0) {
    const minX = Math.min(...items.map((i) => i.x));
    const maxX = Math.max(...items.map((i) => i.x + i.w));
    const minY = Math.min(...items.map((i) => i.y));
    const maxY = Math.max(...items.map((i) => i.y + i.h));
    const chainW = maxX - minX;
    const chainH = maxY - minY;
    innerW = Math.max(vp.w, chainW + pad * 2);
    innerH = Math.max(vp.h, chainH + pad * 2);
    dx = (innerW - chainW) / 2 - minX;
    dy = (innerH - chainH) / 2 - minY;
  }

  return (
    <div
      ref={wrapRef}
      className="relative w-full h-full overflow-auto"
      style={{ scrollbarWidth: "thin" }}
    >
      <div ref={innerRef} className="relative" style={{ width: innerW, height: innerH }}>
        {items.map((it, i) => (
          <div
            key={i}
            className="absolute animate-scale-in"
            style={{
              left: it.x + dx,
              top: it.y + dy,
              width: it.w,
              height: it.h,
              transition: "left 280ms ease, top 280ms ease",
            }}
          >
            <DominoTile
              a={it.a}
              b={it.b}
              size={tileSize}
              horizontal={it.horizontal}
              variant="white"
              fluid
            />
          </div>
        ))}
      </div>
    </div>
  );
}
