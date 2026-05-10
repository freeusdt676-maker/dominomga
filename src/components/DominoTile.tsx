// Vato Domino HD — SVG, gradient ivory, gold spine, pip ronds gradient noirs

const SIZES = {
  xs: { w: 28, h: 56 },
  sm: { w: 44, h: 88 },
  md: { w: 72, h: 144 },
  lg: { w: 92, h: 184 },
  xl: { w: 110, h: 220 },
} as const;

// pip positions on a 100×100 unit half-face
const PIPS: Record<number, [number, number][]> = {
  0: [],
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 25], [72, 25], [28, 50], [72, 50], [28, 75], [72, 75]],
};

function FaceSVG({ value, x, y, w, h, pipFill }: { value: number; x: number; y: number; w: number; h: number; pipFill: string }) {
  const pips = PIPS[value] ?? [];
  return (
    <g transform={`translate(${x} ${y})`}>
      {pips.map(([px, py], i) => {
        const cx = (px / 100) * w;
        const cy = (py / 100) * h;
        const r = Math.min(w, h) * 0.085;
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={r} fill={pipFill} />
            <circle cx={cx - r * 0.3} cy={cy - r * 0.3} r={r * 0.35} fill="rgba(255,255,255,0.18)" />
            <circle cx={cx + r * 0.25} cy={cy + r * 0.3} r={r * 0.5} fill="rgba(0,0,0,0.25)" opacity={0.5} />
          </g>
        );
      })}
    </g>
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
  fluid = false,
}: {
  a: number;
  b: number;
  size?: keyof typeof SIZES;
  horizontal?: boolean;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  fluid?: boolean;
}) {
  const { w, h } = SIZES[size];
  const tileW = horizontal ? h : w;
  const tileH = horizontal ? w : h;
  // SVG viewBox dimensions (use tileW × tileH)
  const half = horizontal ? { w: tileW / 2, h: tileH } : { w: tileW, h: tileH / 2 };
  const uid = `g${a}${b}${size}${horizontal ? "h" : "v"}`;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      className={`relative ${fluid ? "w-full" : "shrink-0"} transition ${
        onClick && !disabled ? "cursor-pointer hover:-translate-y-1 active:scale-95" : "cursor-default"
      } ${selected ? "ring-2 ring-primary -translate-y-2" : ""} ${disabled ? "opacity-50" : ""}`}
      style={{
        width: fluid ? "100%" : tileW,
        height: fluid ? "auto" : tileH,
        aspectRatio: fluid ? (horizontal ? "2 / 1" : "1 / 2") : undefined,
        filter: "drop-shadow(0 4px 6px rgba(0,0,0,.55)) drop-shadow(0 1px 0 rgba(255,255,255,.15))",
      }}
    >
      <svg
        viewBox={`0 0 ${tileW} ${tileH}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        style={{ display: "block" }}
      >
        <defs>
          <linearGradient id={`face-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fffdf3" />
            <stop offset="50%" stopColor="#f4eed8" />
            <stop offset="100%" stopColor="#e6dcb8" />
          </linearGradient>
          <linearGradient id={`spine-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#8a6a1a" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#d4af37" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#8a6a1a" stopOpacity="0.2" />
          </linearGradient>
          <radialGradient id={`pip-${uid}`} cx="0.35" cy="0.35" r="0.7">
            <stop offset="0%" stopColor="#3a3a3a" />
            <stop offset="60%" stopColor="#0d0d0d" />
            <stop offset="100%" stopColor="#000" />
          </radialGradient>
        </defs>
        <rect x="0.5" y="0.5" width={tileW - 1} height={tileH - 1} rx={Math.min(tileW, tileH) * 0.08} fill={`url(#face-${uid})`} stroke="rgba(0,0,0,0.55)" strokeWidth="1" />
        {/* inner gold inset */}
        <rect x={2} y={2} width={tileW - 4} height={tileH - 4} rx={Math.min(tileW, tileH) * 0.06} fill="none" stroke="rgba(212,175,55,0.35)" strokeWidth="0.8" />
        {/* spine */}
        {horizontal ? (
          <rect x={tileW / 2 - 0.6} y={4} width={1.2} height={tileH - 8} fill={`url(#spine-${uid})`} />
        ) : (
          <rect x={4} y={tileH / 2 - 0.6} width={tileW - 8} height={1.2} fill={`url(#spine-${uid})`} />
        )}
        <FaceSVG value={a} x={0} y={0} w={half.w} h={half.h} pipFill={`url(#pip-${uid})`} />
        <FaceSVG
          value={b}
          x={horizontal ? tileW / 2 : 0}
          y={horizontal ? 0 : tileH / 2}
          w={half.w}
          h={half.h}
          pipFill={`url(#pip-${uid})`}
        />
      </svg>
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
        background: "linear-gradient(135deg, #1a2030 0%, #0a0f1a 100%)",
        border: "1px solid rgba(212,175,55,.4)",
        boxShadow: "0 4px 8px rgba(0,0,0,.6), inset 0 1px 0 rgba(212,175,55,.25), inset 0 0 0 2px rgba(212,175,55,.1)",
        backgroundImage:
          "linear-gradient(135deg, rgba(212,175,55,.12) 0%, transparent 40%), linear-gradient(135deg, #1a2030 0%, #0a0f1a 100%)",
      }}
    />
  );
}
