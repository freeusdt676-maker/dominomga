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

  // Single-row HORIZONTAL chain (no zig-zag). The chain grows to the right;
  // overflow scrolls horizontally and we auto-scroll to keep the latest tile in view.
  const items: Item[] = [];
  let cx = 0; // running x cursor (left edge of next tile)
  const cy = 0;

  for (const p of board) {
    const [aa, bb] = p.tile;
    const a = p.flipped ? bb : aa;
    const b = p.flipped ? aa : bb;
    const isDouble = a === b;
    // Horizontal row: doubles are drawn vertical (perpendicular), non-doubles horizontal
    const horiz = !isDouble;
    const w = horiz ? long : unit;
    const h = horiz ? unit : long;
    items.push({ x: cx, y: cy - h / 2, w, h, a, b, horizontal: horiz, isDouble });
    cx += w;
  }

  // Auto-scroll so the last (newest) tile stays visible.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
    });
  }, [board.length]);

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
    // Left-align with padding so chain reads left→right; vertical centered.
    dx = pad - minX;
    dy = (innerH - chainH) / 2 - minY;
  }

  return (
    <div
      ref={wrapRef}
      className="relative w-full h-full overflow-x-auto overflow-y-hidden"
      style={{ scrollbarWidth: "thin" }}
    >
      <div ref={innerRef} className="relative" style={{ width: innerW, height: innerH }}>
        {items.map((it, i) => {
          const isHead = i === 0; // vody (premier vato napetraka)
          const isTail = items.length > 1 && i === items.length - 1; // rambony
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
                left: it.x + dx,
                top: it.y + dy,
                width: it.w,
                height: it.h,
                transition: "left 280ms ease, top 280ms ease",
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
              {(isHead || isTail) && (
                <span
                  className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide pointer-events-none"
                  style={{
                    background: isHead ? "rgb(34,197,94)" : "rgb(244,63,94)",
                    color: "white",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                  }}
                >
                  {isHead ? "Vody" : "Rambony"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
