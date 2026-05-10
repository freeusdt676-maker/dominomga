// Piesy domino lehibe sy mazava (mitovy amin'ny sary fototra)
import { CSSProperties } from "react";

const dotPos: Record<string, CSSProperties> = {
  c:  { top: "50%", left: "50%", transform: "translate(-50%,-50%)" },
  tl: { top: "22%", left: "22%", transform: "translate(-50%,-50%)" },
  tr: { top: "22%", left: "78%", transform: "translate(-50%,-50%)" },
  bl: { top: "78%", left: "22%", transform: "translate(-50%,-50%)" },
  br: { top: "78%", left: "78%", transform: "translate(-50%,-50%)" },
  ml: { top: "50%", left: "22%", transform: "translate(-50%,-50%)" },
  mr: { top: "50%", left: "78%", transform: "translate(-50%,-50%)" },
};
const layouts: Record<number, string[]> = {
  0: [], 1: ["c"], 2: ["tl","br"], 3: ["tl","c","br"],
  4: ["tl","tr","bl","br"], 5: ["tl","tr","c","bl","br"],
  6: ["tl","tr","ml","mr","bl","br"],
};

const SIZES = {
  xs: { w: 28, h: 56, dot: 6 },
  sm: { w: 44, h: 88, dot: 9 },
  md: { w: 72, h: 144, dot: 14 },
  lg: { w: 92, h: 184, dot: 18 },
  xl: { w: 110, h: 220, dot: 22 },
};

export function DominoFace({ value, dotSize }: { value: number; dotSize: number }) {
  return (
    <div className="relative flex-1" style={{ background: "#fafaf2" }}>
      {layouts[value]?.map((p) => (
        <span
          key={p}
          className="absolute rounded-full"
          style={{
            ...dotPos[p],
            width: dotSize,
            height: dotSize,
            background: "#1a1a1a",
            boxShadow: "inset 0 1px 1px rgba(255,255,255,.4), inset 0 -1px 1px rgba(0,0,0,.3)",
          }}
        />
      ))}
    </div>
  );
}

export function DominoTile({
  a,
  b,
  size = "md",
  horizontal = false,
  onClick,
  selected = false,
  disabled = false,
}: {
  a: number;
  b: number;
  size?: keyof typeof SIZES;
  horizontal?: boolean;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
}) {
  const { w, h, dot } = SIZES[size];
  const tileW = horizontal ? h : w;
  const tileH = horizontal ? w : h;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      className={`relative shrink-0 rounded-md overflow-hidden transition ${
        onClick && !disabled ? "cursor-pointer hover:scale-105 active:scale-95" : "cursor-default"
      } ${selected ? "ring-2 ring-primary -translate-y-2" : ""} ${disabled ? "opacity-50" : ""}`}
      style={{
        width: tileW,
        height: tileH,
        background: "#fafaf2",
        border: "1px solid rgba(0,0,0,.35)",
        boxShadow: "0 4px 8px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.6), inset 0 -1px 2px rgba(0,0,0,.2)",
      }}
    >
      <div className={`flex w-full h-full ${horizontal ? "flex-row" : "flex-col"}`}>
        <DominoFace value={a} dotSize={dot} />
        <div className={horizontal ? "w-px h-full bg-black/40" : "h-px w-full bg-black/40"} />
        <DominoFace value={b} dotSize={dot} />
      </div>
    </button>
  );
}

export function DominoBack({ size = "md", horizontal = false }: { size?: keyof typeof SIZES; horizontal?: boolean }) {
  const { w, h } = SIZES[size];
  const tileW = horizontal ? h : w;
  const tileH = horizontal ? w : h;
  return (
    <div
      className="shrink-0 rounded-md"
      style={{
        width: tileW,
        height: tileH,
        background: "linear-gradient(135deg, #1a1f2e, #0a0f1a)",
        border: "1px solid rgba(212,175,55,.3)",
        boxShadow: "0 4px 8px rgba(0,0,0,.6), inset 0 1px 0 rgba(212,175,55,.2)",
      }}
    />
  );
}
