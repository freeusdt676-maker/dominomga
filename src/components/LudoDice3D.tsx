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
          <stop offset="40%" stopColor="#fbf6e8" />
          <stop offset="75%" stopColor="#e9dfbf" />
          <stop offset="100%" stopColor="#a8956b" />
        </linearGradient>
        <linearGradient id="dieEdge" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffe27a" />
          <stop offset="50%" stopColor="#d4a52c" />
          <stop offset="100%" stopColor="#7a5a14" />
        </linearGradient>
        <radialGradient id="dieGloss" cx="30%" cy="20%" r="60%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dieCorner" cx="100%" cy="100%" r="80%">
          <stop offset="0%" stopColor="#000" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="pipGrad" cx="35%" cy="28%" r="75%">
          <stop offset="0%" stopColor="#7d4dff" />
          <stop offset="55%" stopColor="#3a1a78" />
          <stop offset="100%" stopColor="#0a0218" />
        </radialGradient>
        <filter id="dieDrop" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.2" floodOpacity="0.55" />
        </filter>
        <filter id="pipShade" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.6" />
        </filter>
      </defs>
      {/* Body w/ gold edge */}
      <rect x="4" y="4" width="92" height="92" rx="20" ry="20" fill="url(#dieEdge)" filter="url(#dieDrop)" />
      <rect x="7" y="7" width="86" height="86" rx="17" ry="17" fill="url(#dieFill)" stroke="#3a2410" strokeWidth="1.2" />
      {/* Corner shade for 3D depth */}
      <rect x="7" y="7" width="86" height="86" rx="17" ry="17" fill="url(#dieCorner)" />
      {/* Top highlight */}
      <rect x="12" y="11" width="76" height="34" rx="14" ry="14" fill="url(#dieGloss)" />
      {/* Inner bevels */}
      <rect x="9" y="9" width="82" height="82" rx="15" ry="15" fill="none" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="1.1" />
      <rect x="9" y="10" width="82" height="82" rx="15" ry="15" fill="none" stroke="#000" strokeOpacity="0.18" strokeWidth="1.1" />
      {/* Pips */}
      {pips.map(([cx, cy], i) => (
        <g key={i}>
          {/* Recessed socket */}
          <circle cx={cx * 100} cy={cy * 100 + 1.8} r="9" fill="#000" opacity="0.22" filter="url(#pipShade)" />
          <circle cx={cx * 100} cy={cy * 100} r="8.5" fill="url(#pipGrad)" stroke="#0a0218" strokeWidth="0.6" />
          <circle cx={cx * 100 - 2.4} cy={cy * 100 - 2.8} r="2.8" fill="#ffffff" opacity="0.7" />
          <circle cx={cx * 100 + 2.4} cy={cy * 100 + 2.6} r="1.2" fill="#ffffff" opacity="0.35" />
        </g>
      ))}
    </svg>
  );
}

export const LudoDice3D = memo(LudoDice3DBase);
export default LudoDice3D;