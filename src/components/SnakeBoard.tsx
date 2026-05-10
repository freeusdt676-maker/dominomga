import { useEffect, useRef, useState } from "react";
import { DominoTile } from "./DominoTile";
import type { Placed } from "@/lib/dominoEngine";

const SHORT = { xs: 28, sm: 44, md: 72 } as const;
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
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 360, h: 360 });

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(() => {
      if (!ref.current) return;
      setBox({ w: ref.current.clientWidth, h: ref.current.clientHeight });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const unit = SHORT[tileSize];
  const long = unit * 2;
  const pad = 10;
  const W = Math.max(box.w, unit * 4);
  const H = Math.max(box.h, unit * 4);

  // Snake layout
  const items: Item[] = [];
  let dir: "R" | "D" | "L" | "U" = "R";
  // start near left, vertically centered
  let cx = pad + long / 2; // chain center x
  let cy = H / 2; // chain center y

  const place = (a: number, b: number) => {
    const isDouble = a === b;

    const compute = (d: typeof dir) => {
      const horiz = d === "R" || d === "L";
      const tileLong = isDouble ? unit : long;
      const tileShort = isDouble ? long : unit;
      const w = horiz ? tileLong : tileShort;
      const h = horiz ? tileShort : tileLong;
      // half-step from chain center along direction
      const step = (isDouble ? unit : long) / 2;
      let centerX = cx;
      let centerY = cy;
      if (d === "R") centerX = cx + step;
      if (d === "L") centerX = cx - step;
      if (d === "D") centerY = cy + step;
      if (d === "U") centerY = cy - step;
      const x = centerX - w / 2;
      const y = centerY - h / 2;
      const fits = x >= pad && y >= pad && x + w <= W - pad && y + h <= H - pad;
      return { horiz, w, h, x, y, centerX, centerY, fits, step };
    };

    let r = compute(dir);
    if (!r.fits && items.length > 0) {
      // try clockwise turn
      const cw: Record<typeof dir, typeof dir> = { R: "D", D: "L", L: "U", U: "R" };
      dir = cw[dir];
      r = compute(dir);
      // if still doesn't fit, try one more turn
      if (!r.fits) {
        dir = cw[dir];
        r = compute(dir);
      }
    }

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
  };

  for (const p of board) {
    const [aa, bb] = p.tile;
    const a = p.flipped ? bb : aa;
    const b = p.flipped ? aa : bb;
    place(a, b);
  }

  // Center the chain bounding box
  let dx = 0, dy = 0;
  if (items.length > 0) {
    const minX = Math.min(...items.map((i) => i.x));
    const maxX = Math.max(...items.map((i) => i.x + i.w));
    const minY = Math.min(...items.map((i) => i.y));
    const maxY = Math.max(...items.map((i) => i.y + i.h));
    dx = (W - (maxX - minX)) / 2 - minX;
    dy = (H - (maxY - minY)) / 2 - minY;
  }

  return (
    <div ref={ref} className="relative w-full h-full overflow-hidden">
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
  );
}
