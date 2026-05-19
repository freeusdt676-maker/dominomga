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
  const [vp, setVp] = useState({ w: 360, h: 240 });

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(() => {
      if (!wrapRef.current) return;
      setVp({
        w: Math.max(200, wrapRef.current.clientWidth),
        h: Math.max(160, wrapRef.current.clientHeight),
      });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const unit = SHORT[tileSize];
  const long = unit * 2;
  const pad = 6;

  // SNAKE LAYOUT — tiles always TOUCH (no stacking above/below each other).
  // Direction +1 = right, -1 = left. When the next tile would exceed the
  // container width, we drop down by one row and reverse direction (U-turn).
  // Doubles are drawn perpendicular to the running direction.
  const maxRowW = Math.max(long * 2, vp.w - pad * 2);

  const items: Item[] = [];
  let cx = 0;
  let cy = 0;
  let dir: 1 | -1 = 1;

  for (let i = 0; i < board.length; i++) {
    const p = board[i];
    const [aa, bb] = p.tile;
    const a = p.flipped ? bb : aa;
    const b = p.flipped ? aa : bb;
    const isDouble = a === b;
    const horiz = !isDouble; // doubles drawn vertical
    const w = horiz ? long : unit;
    const h = horiz ? unit : long;

    // edge of THIS tile if placed in current direction
    const tileLeft = dir === 1 ? cx : cx - w;
    const tileRight = tileLeft + w;

    const overflowRight = dir === 1 && tileRight > maxRowW && i > 0;
    const overflowLeft = dir === -1 && tileLeft < 0 && i > 0;

    if (overflowRight || overflowLeft) {
      // U-turn: place this tile rotated (vertical, perpendicular) at the edge,
      // then continue back in the opposite direction on the next row.
      const cornerW = unit;
      const cornerH = long;
      const cornerX = dir === 1 ? Math.min(cx, maxRowW - cornerW) : Math.max(cx - cornerW, 0);
      const cornerY = cy - unit / 2;
      items.push({
        x: cornerX,
        y: cornerY,
        w: cornerW,
        h: cornerH,
        a,
        b,
        horizontal: false,
        isDouble,
      });
      cy += cornerH - unit / 2 + 2;
      dir = (dir === 1 ? -1 : 1) as 1 | -1;
      // Start the new row from the corner column
      cx = dir === 1 ? cornerX + cornerW : cornerX;
      continue;
    }

    items.push({
      x: tileLeft,
      y: cy - h / 2,
      w,
      h,
      a,
      b,
      horizontal: horiz,
      isDouble,
    });
    cx = dir === 1 ? cx + w : cx - w;
  }

  // Bounding box
  let chainW = 0, chainH = unit;
  let minX = 0, minY = 0;
  if (items.length > 0) {
    minX = Math.min(...items.map((it) => it.x));
    const maxX = Math.max(...items.map((it) => it.x + it.w));
    minY = Math.min(...items.map((it) => it.y));
    const maxY = Math.max(...items.map((it) => it.y + it.h));
    chainW = maxX - minX;
    chainH = maxY - minY;
  }

  // Scale to ALWAYS fit inside the container — never overflow / never hide.
  const availW = Math.max(80, vp.w - pad * 2);
  const availH = Math.max(80, vp.h - pad * 2);
  const scale = items.length === 0
    ? 1
    : Math.min(1, availW / chainW, availH / chainH);

  const scaledW = chainW * scale;
  const scaledH = chainH * scale;
  const offsetX = (vp.w - scaledW) / 2 - minX * scale;
  const offsetY = (vp.h - scaledH) / 2 - minY * scale;

  return (
    <div
      ref={wrapRef}
      className="relative w-full h-full overflow-hidden"
    >
      <div className="absolute inset-0">
        {items.map((it, i) => {
          const isHead = i === 0;
          const isTail = items.length > 1 && i === items.length - 1;
          const ringColor = isHead
            ? "0 0 0 3px rgba(34,197,94,0.95), 0 0 14px 4px rgba(34,197,94,0.55)"
            : isTail
            ? "0 0 0 3px rgba(244,63,94,0.95), 0 0 14px 4px rgba(244,63,94,0.55)"
            : undefined;
          return (
            <div
              key={i}
              className="absolute animate-scale-in"
              style={{
                left: it.x * scale + offsetX,
                top: it.y * scale + offsetY,
                width: it.w * scale,
                height: it.h * scale,
                transition: "left 280ms ease, top 280ms ease, width 200ms ease, height 200ms ease",
                borderRadius: 6,
                boxShadow: ringColor,
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
          );
        })}
      </div>
    </div>
  );
}
