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
  const pad = 12;
  const gap = 2;
  const maxRowW = Math.max(long * 2, vp.w - pad * 2);

  const items: Item[] = [];
  let x = 0;
  let y = 0;
  let row = 0;
  let dir: 1 | -1 = 1;
  let rowExtent = 0;

  for (let i = 0; i < board.length; i++) {
    const p = board[i];
    const [aa, bb] = p.tile;
    const a = p.flipped ? bb : aa;
    const b = p.flipped ? aa : bb;
    const isDouble = a === b;
    const horizontal = !isDouble;
    const w = horizontal ? long : unit;
    const h = horizontal ? unit : long;

    const projectedRight = dir === 1 ? x + w : x;
    const projectedLeft = dir === 1 ? x : x - w;
    const needsWrap = i > 0 && (projectedRight > maxRowW || projectedLeft < 0);

    if (needsWrap) {
      row += 1;
      y += rowExtent + gap;
      dir = row % 2 === 0 ? 1 : -1;
      x = dir === 1 ? 0 : maxRowW;
      rowExtent = 0;
    }

    const left = dir === 1 ? x : x - w;
    items.push({
      x: left,
      y,
      w,
      h,
      a,
      b,
      horizontal,
      isDouble,
    });

    x = dir === 1 ? left + w + gap : left - gap;
    rowExtent = Math.max(rowExtent, h);
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
  const safeChainW = Math.max(chainW, long);
  const safeChainH = Math.max(chainH, unit);
  const scale = items.length === 0
    ? 1
    : Math.min(1, availW / safeChainW, availH / safeChainH);

  const scaledW = safeChainW * scale;
  const scaledH = safeChainH * scale;
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
