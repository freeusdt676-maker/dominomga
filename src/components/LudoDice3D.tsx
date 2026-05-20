import { memo } from "react";

type Props = {
  face: number; // 1..6
  size?: number; // px
  idle?: boolean;
  rolling?: boolean;
};

// Pip layouts on a 3x3 grid (cx, cy in 0..1 coords)
const PIPS: Record<number, Array<[number, number]>> = {
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.28, 0.22], [0.72, 0.22], [0.28, 0.5], [0.72, 0.5], [0.28, 0.78], [0.72, 0.78]],
};

function LudoDice3DBase({ face, size = 64, idle = false, rolling = false }: Props) {
  const pips = PIPS[Math.max(1, Math.min(6, face))] ?? PIPS[1];
  const s = size;
  return (
    <svg
      viewBox="0 0 100 100"
      width={s}
      height={s}
      className={`${rolling ? "dice-cube-rolling" : ""} ${idle ? "opacity-70" : ""} drop-shadow-[0_6px_8px_rgba(0,0,0,0.45)]`}
      style={{ display: "block" }}
      aria-label={`dice-${face}`}
    >
      <defs>
        <linearGradient id="dieFill" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#f4efe3" />
          <stop offset="100%" stopColor="#c9bfa6" />
        </linearGradient>
        <radialGradient id="dieGloss" cx="30%" cy="22%" r="55%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="pipGrad" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#5a2bd6" />
          <stop offset="60%" stopColor="#2c1356" />
          <stop offset="100%" stopColor="#0d0420" />
        </radialGradient>
        <filter id="pipShade" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.6" />
        </filter>
      </defs>
      {/* Body */}
      <rect x="5" y="5" width="90" height="90" rx="18" ry="18" fill="url(#dieFill)" stroke="#2c1356" strokeWidth="3" />
      {/* Top highlight */}
      <rect x="10" y="10" width="80" height="36" rx="14" ry="14" fill="url(#dieGloss)" />
      {/* Inner bevel */}
      <rect x="8" y="8" width="84" height="84" rx="16" ry="16" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.2" />
      <rect x="8" y="8" width="84" height="84" rx="16" ry="16" fill="none" stroke="#000" strokeOpacity="0.15" strokeWidth="1.2" transform="translate(0 1)" />
      {/* Pips */}
      {pips.map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx * 100} cy={cy * 100 + 1.5} r="8" fill="#000" opacity="0.18" filter="url(#pipShade)" />
          <circle cx={cx * 100} cy={cy * 100} r="8" fill="url(#pipGrad)" />
          <circle cx={cx * 100 - 2} cy={cy * 100 - 2.5} r="2.6" fill="#ffffff" opacity="0.55" />
        </g>
      ))}
    </svg>
  );
}

export const LudoDice3D = memo(LudoDice3DBase);
export default LudoDice3D;