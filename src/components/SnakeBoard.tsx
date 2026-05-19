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
  const gap = 4;
  const availW = Math.max(80, vp.w - pad * 2);
  const availH = Math.max(80, vp.h - pad * 2);
  const cellW = long + gap;
  const cellH = long + gap;

  const maxColumns = Math.max(1, Math.floor((availW + gap) / cellW));
  const columns = Math.max(1, Math.min(board.length || 1, maxColumns));
  const rows = Math.max(1, Math.ceil((board.length || 1) / columns));

  const scale = Math.min(
    1,
    availW / Math.max(long, columns * cellW - gap),
    availH / Math.max(long, rows * cellH - gap),
  );

  const layoutW = Math.max(long * scale, columns * cellW * scale - gap * scale);
  const layoutH = Math.max(long * scale, rows * cellH * scale - gap * scale);
  const offsetX = (vp.w - layoutW) / 2;
  const offsetY = (vp.h - layoutH) / 2;

  const items: Item[] = board.map((p, i) => {
    const [aa, bb] = p.tile;
    const a = p.flipped ? bb : aa;
    const b = p.flipped ? aa : bb;
    const isDouble = a === b;
    const horizontal = !isDouble;
    const w = horizontal ? long : unit;
    const h = horizontal ? unit : long;
    const row = Math.floor(i / columns);
    const indexInRow = i % columns;
    const countInRow = Math.min(columns, board.length - row * columns);
    const snakeCol = row % 2 === 0 ? indexInRow : countInRow - 1 - indexInRow;
    const rowWidth = countInRow * cellW - gap;
    const rowOffsetX = (layoutW / scale - rowWidth) / 2;
    const cellX = rowOffsetX + snakeCol * cellW;
    const cellY = row * cellH;

    return {
      x: cellX + (long - w) / 2,
      y: cellY + (long - h) / 2,
      w,
      h,
      a,
      b,
      horizontal,
      isDouble,
    };
  });

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
