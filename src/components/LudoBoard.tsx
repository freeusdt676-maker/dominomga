import { TRACK, HOME_COL, BASE_SPOTS, SEAT_COLOR, SAFE_INDICES, type Pawn, pawnXY, SEAT_START, activeSeats } from "@/lib/ludoEngine";

type Props = {
  pawns: Pawn[];
  playersCount: number;
  movableSeat?: number | null;
  movablePawns?: number[];
  onPawnClick?: (pawnIdx: number) => void;
  activeSeatList?: number[];
  legalTargets?: Array<[number, number]>;
  poofs?: Array<{ id: string; x: number; y: number }>;
};

const SIZE = 600; // SVG viewport
const N = 15;
const CELL = SIZE / N;

function cellRect(col: number, row: number, fill: string, stroke = "#1c1235", key?: string) {
  const x = col * CELL;
  const y = row * CELL;
  return (
    <g key={key}>
      <rect x={x} y={y} width={CELL} height={CELL} fill={fill} stroke={stroke} strokeWidth={1.2} />
      {/* glossy top highlight inside each cell */}
      <rect x={x + 1.5} y={y + 1.5} width={CELL - 3} height={(CELL - 3) * 0.45} fill="url(#cellGloss)" pointerEvents="none" />
      {/* subtle inner bottom shade */}
      <rect x={x + 1.5} y={y + (CELL - 3) * 0.5} width={CELL - 3} height={(CELL - 3) * 0.5} fill="url(#cellShade)" pointerEvents="none" />
    </g>
  );
}

export default function LudoBoard({ pawns, playersCount, movableSeat, movablePawns, onPawnClick, activeSeatList, legalTargets, poofs }: Props) {
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
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-full block" preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id="boardBg" cx="50%" cy="42%" r="75%">
          <stop offset="0%" stopColor="#2d56c4" />
          <stop offset="55%" stopColor="#143a8c" />
          <stop offset="100%" stopColor="#050d2c" />
        </radialGradient>
        <linearGradient id="boardFrame" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffe27a" />
          <stop offset="50%" stopColor="#d4a52c" />
          <stop offset="100%" stopColor="#8a5a0a" />
        </linearGradient>
        <linearGradient id="cellGloss" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="cellShade" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.18" />
        </linearGradient>
        <radialGradient id="boardVignette" cx="50%" cy="50%" r="70%">
          <stop offset="60%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
        </radialGradient>
        <filter id="frameShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" floodOpacity="0.45" />
        </filter>
      </defs>
      {/* Board backdrop */}
      <rect x={0} y={0} width={SIZE} height={SIZE} fill="url(#boardBg)" />
      <rect x={0} y={0} width={SIZE} height={SIZE} fill="url(#boardVignette)" pointerEvents="none" />
      {/* Outer ornate frame — gold Ludo Master style */}
      <rect x={4} y={4} width={SIZE - 8} height={SIZE - 8} fill="none" stroke="url(#boardFrame)" strokeWidth={6} rx={14} filter="url(#frameShadow)" />
      <rect x={11} y={11} width={SIZE - 22} height={SIZE - 22} fill="none" stroke="#0b1d5c" strokeWidth={1.5} rx={8} />
      <rect x={14} y={14} width={SIZE - 28} height={SIZE - 28} fill="none" stroke="#ffffff" strokeOpacity="0.08" strokeWidth={1} rx={6} />

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

      {/* Legal landing cell highlights */}
      {legalTargets?.map(([col, row], i) => (
        <rect
          key={`legal-${i}`}
          x={col * CELL + 1}
          y={row * CELL + 1}
          width={CELL - 2}
          height={CELL - 2}
          fill="none"
          stroke="#ffe27a"
          strokeWidth={3}
          rx={3}
          className="cell-legal"
          pointerEvents="none"
        />
      ))}

      {/* Bases */}
      {bases.map((b) => (
        <g key={`b-${b.seat}`}>
          <rect x={b.x * CELL} y={b.y * CELL} width={6 * CELL} height={6 * CELL} fill={b.color} stroke="#0b1d5c" strokeWidth={2} />
          <rect x={(b.x + 1) * CELL} y={(b.y + 1) * CELL} width={4 * CELL} height={4 * CELL} fill="#fafafa" stroke="#0b1d5c" />
          {/* 4 pawn slots */}
          {BASE_SPOTS[b.seat].map(([cx, cy], i) => (
            <g key={i}>
              {/* Ornate frame around each parked pawn */}
              <rect
                x={cx * CELL - CELL * 0.78}
                y={cy * CELL - CELL * 0.78}
                width={CELL * 1.56}
                height={CELL * 1.56}
                rx={CELL * 0.22}
                fill="none"
                stroke="url(#boardFrame)"
                strokeWidth={2.4}
                opacity={0.95}
              />
              <circle cx={cx * CELL} cy={cy * CELL} r={CELL * 0.72} fill={b.color} stroke="#0b1d5c" strokeWidth={1.5} />
            </g>
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
        const scales: Record<number, number> = {};
        groups.forEach((idxs) => {
          // Stable order across renders → no jiggle when polling updates.
          idxs.sort((a, b) => (pawns[a].seat - pawns[b].seat) || (pawns[a].idx - pawns[b].idx));
          const n = idxs.length;
          if (n === 1) {
            offsets[idxs[0]] = [0, 0];
            scales[idxs[0]] = 1;
          } else {
            // Fan in a small circle so pieces don't overlap
            // Tighter ring + scale-down so the whole stack still fits inside one cell
            const ring = CELL * 0.22;
            const s = n === 2 ? 0.78 : n === 3 ? 0.66 : 0.58;
            idxs.forEach((idx, k) => {
              const ang = (-Math.PI / 2) + (k * 2 * Math.PI) / n;
              offsets[idx] = [Math.cos(ang) * ring, Math.sin(ang) * ring];
              scales[idx] = s;
            });
          }
        });
        return pawns.map((p, i) => {
          const [cx, cy] = pawnXY(p);
          const [ox, oy] = offsets[i] ?? [0, 0];
          const sc = scales[i] ?? 1;
          const x = cx * CELL + ox;
          const y = cy * CELL + oy;
          const movable = movableSeat === p.seat && movablePawns?.includes(p.idx);
          const color = SEAT_COLOR[p.seat];
          // Classic Halma-style pion — cone base + ball head (like the reference photo)
          const W = CELL * 1.05;
          const H = CELL * 1.7;
          const idBody = `pbody-${i}`;
          const idHead = `phead-${i}`;
          const idBase = `pbase-${i}`;
          const idShine = `pshine-${i}`;
          const stableKey = `pawn-${p.seat}-${p.idx}`;
          // Lift the pawn up so the BASE sits on the cell center (cy)
          // body anchor = bottom of the pawn
          return (
            <g
              key={stableKey}
              className="pawn-group"
              transform={`translate(${x} ${y}) scale(${sc})`}
              onClick={() => movable && onPawnClick?.(p.idx)}
              style={{
                cursor: movable ? "pointer" : "default",
              }}
            >
              <defs>
                {/* Glossy plastic body (cone) — bright top-left highlight, deep bottom shade */}
                <linearGradient id={idBody} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%"   stopColor="#000" stopOpacity="0.55" />
                  <stop offset="18%"  stopColor={color} />
                  <stop offset="55%"  stopColor="#ffffff" stopOpacity="0.35" />
                  <stop offset="60%"  stopColor={color} />
                  <stop offset="100%" stopColor="#000" stopOpacity="0.6" />
                </linearGradient>
                {/* Ball head — 3D sphere */}
                <radialGradient id={idHead} cx="32%" cy="28%" r="78%">
                  <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.95" />
                  <stop offset="18%"  stopColor={color} stopOpacity="0.85" />
                  <stop offset="70%"  stopColor={color} />
                  <stop offset="100%" stopColor="#000" stopOpacity="0.7" />
                </radialGradient>
                {/* Base disc */}
                <radialGradient id={idBase} cx="50%" cy="30%" r="70%">
                  <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.6" />
                  <stop offset="45%"  stopColor={color} />
                  <stop offset="100%" stopColor="#000" stopOpacity="0.75" />
                </radialGradient>
                <radialGradient id={idShine} cx="50%" cy="30%" r="55%">
                  <stop offset="0%"  stopColor="#ffffff" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </radialGradient>
              </defs>
              {/* Ground shadow ellipse */}
              <ellipse cx={0} cy={H*0.48} rx={W*0.44} ry={W*0.09} fill="#000" opacity={0.5} />
              {/* Base disc (wide flat foot) */}
              <ellipse cx={0} cy={H*0.44} rx={W*0.48} ry={W*0.14} fill={`url(#${idBase})`} stroke="#0f0820" strokeWidth={1.4} />
              {/* Cone body: wide bottom → narrow neck under the ball head */}
              {(() => {
                const bx = W*0.46;          // half-width at base
                const nx = W*0.18;          // half-width at neck (below ball)
                const bottomY = H*0.44;
                const neckY   = -H*0.05;
                return (
                  <path
                    d={`
                      M ${-bx} ${bottomY}
                      L ${-nx} ${neckY}
                      Q 0 ${neckY - H*0.02} ${nx} ${neckY}
                      L ${bx} ${bottomY}
                      Q 0 ${bottomY + W*0.14} ${-bx} ${bottomY}
                      Z
                    `}
                    fill={`url(#${idBody})`}
                    stroke="#0f0820"
                    strokeWidth={1.6}
                    strokeLinejoin="round"
                  />
                );
              })()}
              {/* Vertical highlight streak on the cone (plastic sheen) */}
              <path
                d={`M ${-W*0.20} ${H*0.38} L ${-W*0.08} ${-H*0.04} L ${-W*0.02} ${-H*0.04} L ${-W*0.10} ${H*0.38} Z`}
                fill="#ffffff"
                opacity={0.28}
              />
              {/* Small neck ring under the ball */}
              <ellipse cx={0} cy={-H*0.05} rx={W*0.19} ry={W*0.06} fill="#000" opacity={0.35} />
              {/* Ball head — 3D sphere sitting on the neck */}
              <circle cx={0} cy={-H*0.22} r={W*0.26} fill={`url(#${idHead})`} stroke="#0f0820" strokeWidth={1.4} />
              {/* Highlight glare on the ball */}
              <ellipse cx={-W*0.09} cy={-H*0.29} rx={W*0.10} ry={W*0.07} fill={`url(#${idShine})`} opacity={0.95} />
              <circle cx={-W*0.12} cy={-H*0.31} r={W*0.03} fill="#ffffff" opacity={0.95} />
              {/* Movable indicator: gold pulse ring at the tip */}
              {movable && (
                <>
                  <ellipse cx={0} cy={H*0.48} rx={W*0.56} ry={W*0.15} fill="none" stroke="#ffe27a" strokeWidth={2.5} opacity={0.95} />
                  <ellipse cx={0} cy={H*0.48} rx={W*0.56} ry={W*0.15} fill="none" stroke="#ffe27a" strokeWidth={2} className="pulse-ring" />
                </>
              )}
            </g>
          );
        });
      })()}

      {/* Capture poof effects */}
      {poofs?.map((p) => (
        <g key={p.id} transform={`translate(${p.x * CELL} ${p.y * CELL})`} pointerEvents="none">
          <circle r={CELL * 0.7} fill="#ffe27a" className="poof" />
          <circle r={CELL * 0.45} fill="#fff" className="poof" />
        </g>
      ))}
    </svg>
  );
}