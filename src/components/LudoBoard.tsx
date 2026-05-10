import { TRACK, HOME_COL, BASE_SPOTS, SEAT_COLOR, SAFE_INDICES, type Pawn, pawnXY, SEAT_START } from "@/lib/ludoEngine";

type Props = {
  pawns: Pawn[];
  playersCount: number;
  movableSeat?: number | null;
  movablePawns?: number[];
  onPawnClick?: (pawnIdx: number) => void;
};

const SIZE = 600; // SVG viewport
const N = 15;
const CELL = SIZE / N;

function cellRect(col: number, row: number, fill: string, stroke = "#1c1235") {
  return (
    <rect x={col * CELL} y={row * CELL} width={CELL} height={CELL} fill={fill} stroke={stroke} strokeWidth={1.2} />
  );
}

export default function LudoBoard({ pawns, playersCount, movableSeat, movablePawns, onPawnClick }: Props) {
  // Base areas (6x6 squares at corners)
  const bases = [
    { seat: 1, x: 0, y: 9, color: SEAT_COLOR[1] },
    { seat: 2, x: 0, y: 0, color: SEAT_COLOR[2] },
    { seat: 3, x: 9, y: 0, color: SEAT_COLOR[3] },
    { seat: 4, x: 9, y: 9, color: SEAT_COLOR[4] },
  ];
  const activeSeatsArr = playersCount === 2 ? [1, 3] : playersCount === 3 ? [1, 2, 3] : [1, 2, 3, 4];

  // Determine cell color (white default, or seat-colored for start/home column)
  const cellFill = (col: number, row: number): string => {
    // Home columns
    for (const seat of [1, 2, 3, 4]) {
      if (HOME_COL[seat].some(([c, r]) => c === col && r === row)) {
        return SEAT_COLOR[seat];
      }
    }
    // Start cells get seat tint
    for (const seat of [1, 2, 3, 4]) {
      const startIdx = SEAT_START[seat];
      const [c, r] = TRACK[startIdx];
      if (c === col && r === row) return SEAT_COLOR[seat] + "55";
    }
    return "#fafafa";
  };

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-auto rounded-xl shadow-2xl" style={{ background: "linear-gradient(135deg, #2a1a4a, #1a0d2e)" }}>
      {/* Outer ornate frame */}
      <rect x={3} y={3} width={SIZE - 6} height={SIZE - 6} fill="none" stroke="#d4a52c" strokeWidth={6} rx={12} />
      <rect x={10} y={10} width={SIZE - 20} height={SIZE - 20} fill="none" stroke="#7a5a14" strokeWidth={1.5} rx={8} />

      {/* Track cells */}
      {TRACK.map(([col, row], i) => (
        <g key={`t-${i}`}>
          {cellRect(col, row, cellFill(col, row))}
          {SAFE_INDICES.has(i) && (
            <text x={col * CELL + CELL / 2} y={row * CELL + CELL / 2 + 4} fontSize={14} textAnchor="middle" fill="#7a5a14">★</text>
          )}
        </g>
      ))}
      {/* Home column cells */}
      {[1, 2, 3, 4].flatMap((seat) =>
        HOME_COL[seat].map(([col, row], i) => (
          <g key={`h-${seat}-${i}`}>{cellRect(col, row, SEAT_COLOR[seat])}</g>
        ))
      )}

      {/* Bases */}
      {bases.map((b) => (
        <g key={`b-${b.seat}`}>
          <rect x={b.x * CELL} y={b.y * CELL} width={6 * CELL} height={6 * CELL} fill={b.color} stroke="#1c1235" strokeWidth={2} />
          <rect x={(b.x + 1) * CELL} y={(b.y + 1) * CELL} width={4 * CELL} height={4 * CELL} fill="#fafafa" stroke="#1c1235" />
          {/* 4 pawn slots */}
          {BASE_SPOTS[b.seat].map(([cx, cy], i) => (
            <circle key={i} cx={cx * CELL} cy={cy * CELL} r={CELL * 0.6} fill={b.color} stroke="#1c1235" strokeWidth={1.5} />
          ))}
          {/* Inactive seat overlay */}
          {!activeSeatsArr.includes(b.seat) && (
            <rect x={b.x * CELL} y={b.y * CELL} width={6 * CELL} height={6 * CELL} fill="#000" opacity={0.55} />
          )}
        </g>
      ))}

      {/* Center home triangle */}
      <g>
        <rect x={6 * CELL} y={6 * CELL} width={3 * CELL} height={3 * CELL} fill="#fafafa" stroke="#1c1235" />
        <polygon points={`${6 * CELL},${6 * CELL} ${7.5 * CELL},${7.5 * CELL} ${9 * CELL},${6 * CELL}`} fill={SEAT_COLOR[3]} />
        <polygon points={`${9 * CELL},${6 * CELL} ${7.5 * CELL},${7.5 * CELL} ${9 * CELL},${9 * CELL}`} fill={SEAT_COLOR[4]} />
        <polygon points={`${9 * CELL},${9 * CELL} ${7.5 * CELL},${7.5 * CELL} ${6 * CELL},${9 * CELL}`} fill={SEAT_COLOR[1]} />
        <polygon points={`${6 * CELL},${9 * CELL} ${7.5 * CELL},${7.5 * CELL} ${6 * CELL},${6 * CELL}`} fill={SEAT_COLOR[2]} />
      </g>

      {/* Pawns — glossy 3D spheres, fanned when stacked, hop-animated between cells */}
      {(() => {
        // Group pawns sharing the same cell so we can fan them out
        const groups = new Map<string, number[]>();
        pawns.forEach((p, i) => {
          const [cx, cy] = pawnXY(p);
          const key = `${cx.toFixed(2)}_${cy.toFixed(2)}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(i);
        });
        const offsets: Record<number, [number, number]> = {};
        groups.forEach((idxs) => {
          const n = idxs.length;
          if (n === 1) {
            offsets[idxs[0]] = [0, 0];
          } else {
            // Fan in a small circle so pieces don't overlap
            const ring = CELL * 0.32;
            idxs.forEach((idx, k) => {
              const ang = (-Math.PI / 2) + (k * 2 * Math.PI) / n;
              offsets[idx] = [Math.cos(ang) * ring, Math.sin(ang) * ring];
            });
          }
        });
        return pawns.map((p, i) => {
          const [cx, cy] = pawnXY(p);
          const [ox, oy] = offsets[i] ?? [0, 0];
          const x = cx * CELL + ox;
          const y = cy * CELL + oy;
          const movable = movableSeat === p.seat && movablePawns?.includes(p.idx);
          const color = SEAT_COLOR[p.seat];
          const r = CELL * 0.36;     // sphere radius
          const id = `pgrad-${i}`;
          const idShine = `pshine-${i}`;
          // Use a stable id so React keeps the same DOM node when pawn moves → CSS transition runs
          const stableKey = `pawn-${p.seat}-${p.idx}`;
          return (
            <g
              key={stableKey}
              className="pawn-group"
              transform={`translate(${x} ${y})`}
              onClick={() => movable && onPawnClick?.(p.idx)}
              style={{ cursor: movable ? "pointer" : "default" }}
            >
              <defs>
                {/* Glossy sphere fill */}
                <radialGradient id={id} cx="35%" cy="30%" r="75%">
                  <stop offset="0%"  stopColor="#ffffff" stopOpacity="1" />
                  <stop offset="18%" stopColor={color}   stopOpacity="1" />
                  <stop offset="70%" stopColor={color}   stopOpacity="1" />
                  <stop offset="100%" stopColor="#000000" stopOpacity="0.85" />
                </radialGradient>
                {/* Top-light shine */}
                <radialGradient id={idShine} cx="35%" cy="25%" r="35%">
                  <stop offset="0%"  stopColor="#ffffff" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </radialGradient>
              </defs>
              {/* Soft drop shadow on the floor */}
              <ellipse cx={0} cy={r * 0.95} rx={r * 0.85} ry={r * 0.22} fill="#000" opacity={0.45} />
              {/* Glossy sphere body */}
              <circle cx={0} cy={0} r={r} fill={`url(#${id})`} stroke="#1c1235" strokeWidth={1.2} />
              {/* Top specular highlight */}
              <ellipse cx={-r * 0.28} cy={-r * 0.34} rx={r * 0.42} ry={r * 0.26} fill={`url(#${idShine})`} />
              {/* Tiny crisp highlight dot */}
              <circle cx={-r * 0.32} cy={-r * 0.38} r={r * 0.10} fill="#ffffff" opacity={0.9} />
              {/* Movable indicator: gold ring + pulse */}
              {movable && (
                <>
                  <circle cx={0} cy={0} r={r + 3} fill="none" stroke="#ffe27a" strokeWidth={2.5} opacity={0.95} />
                  <circle cx={0} cy={0} r={r + 3} fill="none" stroke="#ffe27a" strokeWidth={2} className="pulse-ring" />
                </>
              )}
            </g>
          );
        });
      })()}
    </svg>
  );
}