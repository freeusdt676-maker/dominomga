import { TRACK, HOME_COL, BASE_SPOTS, SEAT_COLOR, SAFE_INDICES, type Pawn, pawnXY, SEAT_START, activeSeats } from "@/lib/ludoEngine";

type Props = {
  pawns: Pawn[];
  playersCount: number;
  movableSeat?: number | null;
  movablePawns?: number[];
  onPawnClick?: (pawnIdx: number) => void;
  activeSeatList?: number[];
};

const SIZE = 600; // SVG viewport
const N = 15;
const CELL = SIZE / N;

function cellRect(col: number, row: number, fill: string, stroke = "#1c1235") {
  return (
    <rect x={col * CELL} y={row * CELL} width={CELL} height={CELL} fill={fill} stroke={stroke} strokeWidth={1.2} />
  );
}

export default function LudoBoard({ pawns, playersCount, movableSeat, movablePawns, onPawnClick, activeSeatList }: Props) {
  // Base areas (6x6 squares at corners)
  const bases = [
    { seat: 1, x: 0, y: 9, color: SEAT_COLOR[1] },
    { seat: 2, x: 0, y: 0, color: SEAT_COLOR[2] },
    { seat: 3, x: 9, y: 0, color: SEAT_COLOR[3] },
    { seat: 4, x: 9, y: 9, color: SEAT_COLOR[4] },
  ];
  const activeSeatsArr = activeSeatList ?? activeSeats(playersCount);

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
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-full block" preserveAspectRatio="xMidYMid meet" style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #0b1d5c 100%)" }}>
      {/* Outer ornate frame — Ludo Master style */}
      <rect x={3} y={3} width={SIZE - 6} height={SIZE - 6} fill="none" stroke="#6ea8ff" strokeWidth={4} rx={10} />
      <rect x={10} y={10} width={SIZE - 20} height={SIZE - 20} fill="none" stroke="#1a3580" strokeWidth={1.5} rx={6} />

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
          <rect x={b.x * CELL} y={b.y * CELL} width={6 * CELL} height={6 * CELL} fill={b.color} stroke="#0b1d5c" strokeWidth={2} />
          <rect x={(b.x + 1) * CELL} y={(b.y + 1) * CELL} width={4 * CELL} height={4 * CELL} fill="#fafafa" stroke="#0b1d5c" />
          {/* 4 pawn slots */}
          {BASE_SPOTS[b.seat].map(([cx, cy], i) => (
            <circle key={i} cx={cx * CELL} cy={cy * CELL} r={CELL * 0.6} fill={b.color} stroke="#0b1d5c" strokeWidth={1.5} />
          ))}
          {/* PLAYER label (top base = upside-down like reference) */}
          {(() => {
            const cx = (b.x + 3) * CELL;
            const isTop = b.y === 0;
            const cy = isTop ? (b.y + 0.7) * CELL : (b.y + 5.6) * CELL;
            const rot = isTop ? 180 : 0;
            return (
              <text x={cx} y={cy} fontSize={CELL * 0.55} fontWeight={900} textAnchor="middle"
                    fill="#fff" stroke="#0b1d5c" strokeWidth={1.2}
                    transform={`rotate(${rot} ${cx} ${cy})`}
                    style={{ fontFamily: "'Playfair Display', serif", letterSpacing: 1 }}>
                PLAYER{b.seat}
              </text>
            );
          })()}
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
          // Bowling-pin / bottle proportions — taller than wide
          const W = CELL * 0.78;     // overall width
          const H = CELL * 1.25;     // overall height
          const id = `pgrad-${i}`;
          const idShine = `pshine-${i}`;
          const idBody = `pbody-${i}`;
          const stableKey = `pawn-${p.seat}-${p.idx}`;
          // Lift the pawn up so the BASE sits on the cell center (cy)
          // body anchor = bottom of the pawn
          return (
            <g
              key={stableKey}
              className="pawn-group"
              transform={`translate(${x} ${y})`}
              onClick={() => movable && onPawnClick?.(p.idx)}
              style={{ cursor: movable ? "pointer" : "default" }}
            >
              <defs>
                {/* Vertical glossy fill — light on left, dark on right */}
                <linearGradient id={idBody} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.55" />
                  <stop offset="22%"  stopColor={color} />
                  <stop offset="60%"  stopColor={color} />
                  <stop offset="100%" stopColor="#000000" stopOpacity="0.55" />
                </linearGradient>
                {/* Top head highlight */}
                <radialGradient id={id} cx="35%" cy="30%" r="70%">
                  <stop offset="0%"  stopColor="#ffffff" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </radialGradient>
                <radialGradient id={idShine} cx="50%" cy="50%" r="50%">
                  <stop offset="0%"  stopColor="#ffffff" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </radialGradient>
              </defs>
              {/* Floor shadow */}
              <ellipse cx={0} cy={H * 0.42} rx={W * 0.55} ry={W * 0.16} fill="#000" opacity={0.5} />
              {/* Bottle / bowling-pin silhouette built with a path:
                  - wide round base
                  - narrow neck
                  - small round head on top */}
              <path
                d={`
                  M ${-W*0.50} ${ H*0.38}
                  C ${-W*0.62} ${ H*0.20}, ${-W*0.62} ${ H*0.05}, ${-W*0.40} ${-H*0.05}
                  C ${-W*0.28} ${-H*0.12}, ${-W*0.22} ${-H*0.22}, ${-W*0.22} ${-H*0.32}
                  C ${-W*0.42} ${-H*0.40}, ${-W*0.42} ${-H*0.55}, ${-W*0.18} ${-H*0.58}
                  C ${-W*0.06} ${-H*0.62},  ${ W*0.06} ${-H*0.62}, ${ W*0.18} ${-H*0.58}
                  C ${ W*0.42} ${-H*0.55},  ${ W*0.42} ${-H*0.40}, ${ W*0.22} ${-H*0.32}
                  C ${ W*0.22} ${-H*0.22},  ${ W*0.28} ${-H*0.12}, ${ W*0.40} ${-H*0.05}
                  C ${ W*0.62} ${ H*0.05},  ${ W*0.62} ${ H*0.20}, ${ W*0.50} ${ H*0.38}
                  Z
                `}
                fill={`url(#${idBody})`}
                stroke="#1c1235"
                strokeWidth={1.4}
              />
              {/* Glossy head highlight */}
              <ellipse cx={-W*0.05} cy={-H*0.50} rx={W*0.18} ry={H*0.10} fill={`url(#${id})`} />
              {/* Body specular streak */}
              <ellipse cx={-W*0.18} cy={ H*0.10} rx={W*0.10} ry={H*0.22} fill={`url(#${idShine})`} opacity={0.7} />
              {/* Crisp tiny highlight on head */}
              <circle cx={-W*0.10} cy={-H*0.52} r={W*0.06} fill="#ffffff" opacity={0.95} />
              {/* Movable indicator: gold ring + pulse around the base */}
              {movable && (
                <>
                  <ellipse cx={0} cy={H*0.30} rx={W*0.55} ry={W*0.20} fill="none" stroke="#ffe27a" strokeWidth={2.5} opacity={0.95} />
                  <ellipse cx={0} cy={H*0.30} rx={W*0.55} ry={W*0.20} fill="none" stroke="#ffe27a" strokeWidth={2} className="pulse-ring" />
                </>
              )}
            </g>
          );
        });
      })()}
    </svg>
  );
}