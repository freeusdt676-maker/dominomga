import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RotateCcw } from "lucide-react";

/* =========================================================
   LUDO — offline solo vs 3 bots
   Board & tokens & dice modeled after the classic reference.
   ========================================================= */

type ColorKey = "red" | "green" | "yellow" | "blue";
const COLORS: ColorKey[] = ["red", "green", "yellow", "blue"];
const HEX: Record<ColorKey, { base: string; dark: string; light: string; ring: string }> = {
  red:    { base: "#e53935", dark: "#8e1414", light: "#ff7a75", ring: "#c62828" },
  green:  { base: "#2ea84a", dark: "#0f5b26", light: "#77e08d", ring: "#1f7a34" },
  yellow: { base: "#fdd835", dark: "#9c7b0b", light: "#fff28a", ring: "#c8a91b" },
  blue:   { base: "#1e88e5", dark: "#0b3d75", light: "#79b8ff", ring: "#125fb0" },
};

// 52-cell outer track — (row, col) on 15x15 grid. Clockwise starting at RED entry.
const TRACK: [number, number][] = [
  [6,1],[6,2],[6,3],[6,4],[6,5],
  [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
  [0,7],
  [0,8],[1,8],[2,8],[3,8],[4,8],[5,8],
  [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
  [7,14],
  [8,14],[8,13],[8,12],[8,11],[8,10],[8,9],
  [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
  [14,7],
  [14,6],[13,6],[12,6],[11,6],[10,6],[9,6],
  [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
  [7,0],
  [6,0],
];

// Entry index per color on the outer track
const ENTRY: Record<ColorKey, number> = { red: 0, green: 13, yellow: 26, blue: 39 };
// Safe cells (start + star)
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// Home column (6 cells) per color — from just-after-outer to just-before-center
const HOME_COL: Record<ColorKey, [number, number][]> = {
  red:    [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
  green:  [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
  yellow: [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
  blue:   [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],
};

// Yard slots (4 pawn positions inside each corner house)
const YARD_SLOTS: Record<ColorKey, [number, number][]> = {
  red:    [[1.5,1.5],[1.5,3.5],[3.5,1.5],[3.5,3.5]],
  green:  [[1.5,10.5],[1.5,12.5],[3.5,10.5],[3.5,12.5]],
  yellow: [[10.5,10.5],[10.5,12.5],[12.5,10.5],[12.5,12.5]],
  blue:   [[10.5,1.5],[10.5,3.5],[12.5,1.5],[12.5,3.5]],
};

// progress: 0 = yard, 1..51 outer, 52..57 home column, 57 = finished (center)
type Pawn = { progress: number };
type Player = { color: ColorKey; isBot: boolean; pawns: Pawn[] };

function initialPlayers(): Player[] {
  return COLORS.map((c) => ({
    color: c,
    isBot: c !== "red",
    pawns: [{ progress: 0 }, { progress: 0 }, { progress: 0 }, { progress: 0 }],
  }));
}

// Compute (row,col) for a pawn given color and progress
function pawnCell(color: ColorKey, progress: number, slotIdx: number): [number, number] {
  if (progress === 0) return YARD_SLOTS[color][slotIdx];
  if (progress <= 51) {
    const idx = (ENTRY[color] + progress - 1) % 52;
    return TRACK[idx];
  }
  if (progress < 57) {
    return HOME_COL[color][progress - 52];
  }
  return [7, 7]; // center
}

function outerIndex(color: ColorKey, progress: number): number | null {
  if (progress >= 1 && progress <= 51) return (ENTRY[color] + progress - 1) % 52;
  return null;
}

// ==== Sound helpers ====
const audioCtxRef: { c?: AudioContext } = {};
function beep(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.15) {
  try {
    const ctx = (audioCtxRef.c ||= new (window.AudioContext || (window as any).webkitAudioContext)());
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.stop(ctx.currentTime + dur);
  } catch {}
}
const sfx = {
  dice: () => { beep(720, 0.08, "square"); setTimeout(() => beep(520, 0.09, "square"), 60); },
  step: () => beep(880, 0.04, "triangle", 0.12),
  capture: () => { beep(220, 0.12, "sawtooth", 0.18); setTimeout(() => beep(160, 0.16, "sawtooth", 0.18), 100); },
  home: () => { beep(660, 0.1, "sine", 0.2); setTimeout(() => beep(990, 0.16, "sine", 0.2), 110); },
  win: () => [0,120,240,360].forEach((d,i) => setTimeout(() => beep(660 + i*110, 0.18, "triangle", 0.2), d)),
};

/* ==================== Dice component ==================== */
function Dice({ value, rolling, disabled, onRoll, color }: {
  value: number; rolling: boolean; disabled: boolean; onRoll: () => void; color: ColorKey;
}) {
  const pip = (cx: number, cy: number) => (
    <circle cx={cx} cy={cy} r={5.5} fill="#111" />
  );
  const faces: Record<number, JSX.Element> = {
    1: <>{pip(30,30)}</>,
    2: <>{pip(16,16)}{pip(44,44)}</>,
    3: <>{pip(14,14)}{pip(30,30)}{pip(46,46)}</>,
    4: <>{pip(16,16)}{pip(44,16)}{pip(16,44)}{pip(44,44)}</>,
    5: <>{pip(16,16)}{pip(44,16)}{pip(30,30)}{pip(16,44)}{pip(44,44)}</>,
    6: <>{pip(16,14)}{pip(44,14)}{pip(16,30)}{pip(44,30)}{pip(16,46)}{pip(44,46)}</>,
  };
  return (
    <button
      onClick={onRoll}
      disabled={disabled}
      className={`relative w-16 h-16 rounded-xl shadow-xl transition-transform ${rolling ? "animate-[spin_0.55s_ease-in-out]" : "hover:scale-105"} ${disabled ? "opacity-70 cursor-not-allowed" : "cursor-pointer"}`}
      style={{
        background: "linear-gradient(135deg,#fff 0%,#f0f0f0 55%,#d6d6d6 100%)",
        boxShadow: `0 6px 0 ${HEX[color].ring}, 0 10px 22px rgba(0,0,0,0.45), inset 0 2px 0 #fff, inset 0 -2px 0 rgba(0,0,0,0.15)`,
        border: `2px solid ${HEX[color].dark}`,
      }}
      aria-label="Roll dice"
    >
      <svg viewBox="0 0 60 60" className="w-full h-full">{faces[value] ?? faces[1]}</svg>
    </button>
  );
}

/* ==================== Board (SVG) ==================== */
function Board({ players, activeColor, onPickPawn, movable }: {
  players: Player[]; activeColor: ColorKey;
  onPickPawn: (color: ColorKey, pawnIdx: number) => void;
  movable: Set<number>;
}) {
  const S = 40; // cell size px
  const N = 15;
  const size = S * N;

  // Yard corner (6x6) rendering
  const yard = (row: number, col: number, c: ColorKey) => (
    <g key={`yard-${c}`}>
      <rect x={col*S} y={row*S} width={6*S} height={6*S} fill={HEX[c].base} stroke="#111" strokeWidth={2} />
      <rect x={col*S+S*0.6} y={row*S+S*0.6} width={4.8*S} height={4.8*S} fill="#fff" stroke="#111" strokeWidth={1.5} rx={6}/>
      {YARD_SLOTS[c].map((_, i) => {
        const [r, cc] = YARD_SLOTS[c][i];
        return (
          <circle key={i} cx={cc*S+S/2} cy={r*S+S/2} r={S*0.42} fill="#fff" stroke={HEX[c].dark} strokeWidth={2.5} />
        );
      })}
    </g>
  );

  // Track cells
  const trackCells: JSX.Element[] = [];
  TRACK.forEach(([r, c], idx) => {
    let fill = "#fff";
    // Color the entry cells and home column entries
    if (idx === ENTRY.red) fill = HEX.red.light;
    if (idx === ENTRY.green) fill = HEX.green.light;
    if (idx === ENTRY.yellow) fill = HEX.yellow.light;
    if (idx === ENTRY.blue) fill = HEX.blue.light;
    trackCells.push(
      <g key={`t-${idx}`}>
        <rect x={c*S} y={r*S} width={S} height={S} fill={fill} stroke="#111" strokeWidth={1} />
        {SAFE.has(idx) && (
          <text x={c*S+S/2} y={r*S+S/2+4} textAnchor="middle" fontSize={16} fill="#333">★</text>
        )}
      </g>
    );
  });

  // Home column cells (colored)
  const homeCells: JSX.Element[] = [];
  (Object.keys(HOME_COL) as ColorKey[]).forEach((col) => {
    HOME_COL[col].forEach(([r, c], i) => {
      homeCells.push(
        <rect key={`h-${col}-${i}`} x={c*S} y={r*S} width={S} height={S} fill={HEX[col].base} stroke="#111" strokeWidth={1} />
      );
    });
  });

  // Center (triangles pointing to each color)
  const cx = 7*S + S/2, cy = 7*S + S/2;
  const center = (
    <g>
      <rect x={6*S} y={6*S} width={3*S} height={3*S} fill="#fff" stroke="#111" strokeWidth={2}/>
      <polygon points={`${6*S},${6*S} ${9*S},${6*S} ${cx},${cy}`} fill={HEX.green.base} stroke="#111"/>
      <polygon points={`${9*S},${6*S} ${9*S},${9*S} ${cx},${cy}`} fill={HEX.yellow.base} stroke="#111"/>
      <polygon points={`${9*S},${9*S} ${6*S},${9*S} ${cx},${cy}`} fill={HEX.blue.base} stroke="#111"/>
      <polygon points={`${6*S},${9*S} ${6*S},${6*S} ${cx},${cy}`} fill={HEX.red.base} stroke="#111"/>
      <text x={cx} y={cy+6} textAnchor="middle" fontSize={22} fontWeight="900" fill="#fff" style={{ paintOrder: "stroke", stroke: "#000", strokeWidth: 3 }}>HOME</text>
    </g>
  );

  // Pawns
  // Bucket pawns by cell to spread them
  const pawns: Array<{ color: ColorKey; pIdx: number; r: number; c: number; progress: number }> = [];
  players.forEach(pl => pl.pawns.forEach((pw, pIdx) => {
    const [r, cc] = pawnCell(pl.color, pw.progress, pIdx);
    pawns.push({ color: pl.color, pIdx, r, c: cc, progress: pw.progress });
  }));

  // Group by cell for stacking
  const groups = new Map<string, typeof pawns>();
  pawns.forEach(p => {
    const key = `${p.r.toFixed(2)},${p.c.toFixed(2)}`;
    if (!groups.has(key)) groups.set(key, [] as any);
    groups.get(key)!.push(p);
  });

  const pawnEls: JSX.Element[] = [];
  groups.forEach((arr, key) => {
    arr.forEach((p, i) => {
      const offset = arr.length > 1 ? (i - (arr.length - 1) / 2) * 8 : 0;
      const x = p.c * S + S/2 + offset;
      const y = p.r * S + S/2;
      const active = p.color === activeColor && movable.has(p.pIdx);
      pawnEls.push(
        <g key={`p-${p.color}-${p.pIdx}-${key}`}
           transform={`translate(${x}, ${y})`}
           onClick={() => active && onPickPawn(p.color, p.pIdx)}
           style={{ cursor: active ? "pointer" : "default" }}>
          {/* Pawn: GPS-pin (teardrop with hole) + ripple base */}
          <ellipse cx={0} cy={17} rx={13} ry={3} fill="none"
                   stroke={HEX[p.color].base} strokeWidth={1.4} opacity={0.85} />
          <ellipse cx={0} cy={17} rx={9} ry={2} fill="none"
                   stroke={HEX[p.color].base} strokeWidth={1.2} opacity={0.7} />
          <ellipse cx={0} cy={17} rx={5} ry={1.2} fill="none"
                   stroke={HEX[p.color].base} strokeWidth={1} opacity={0.55} />
          {/* Teardrop body */}
          <path d={`M 0 15 C -13 4 -13 -10 0 -18 C 13 -10 13 4 0 15 Z`}
                fill={`url(#grad-${p.color})`}
                stroke={HEX[p.color].dark} strokeWidth={1.3} />
          {/* Hole */}
          <circle cx={0} cy={-7} r={5} fill="#fff"
                  stroke={HEX[p.color].dark} strokeWidth={1.2} />
          {/* Gloss highlight */}
          <path d={`M -6 -12 Q -9 -4 -6 4`} fill="none"
                stroke="rgba(255,255,255,0.55)" strokeWidth={1.6} strokeLinecap="round" />
          {active && (
            <circle cx={0} cy={-2} r={18} fill="none" stroke="#fff" strokeWidth={2}
                    strokeDasharray="3 3" opacity={0.9}>
              <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="3s" repeatCount="indefinite"/>
            </circle>
          )}
        </g>
      );
    });
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-auto rounded-2xl shadow-2xl"
         style={{ background: "#fff", border: "4px solid #111" }}>
      <defs>
        {COLORS.map(c => (
          <radialGradient key={c} id={`grad-${c}`} cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor={HEX[c].light}/>
            <stop offset="55%" stopColor={HEX[c].base}/>
            <stop offset="100%" stopColor={HEX[c].dark}/>
          </radialGradient>
        ))}
      </defs>
      {yard(0,0,"red")}
      {yard(0,9,"green")}
      {yard(9,9,"yellow")}
      {yard(9,0,"blue")}
      {trackCells}
      {homeCells}
      {center}
      {pawnEls}
    </svg>
  );
}

/* ==================== Game logic ==================== */
function legalMoves(player: Player, dice: number): number[] {
  const legal: number[] = [];
  player.pawns.forEach((p, i) => {
    if (p.progress === 0) {
      if (dice === 6) legal.push(i);
    } else if (p.progress < 57) {
      if (p.progress + dice <= 57) legal.push(i);
    }
  });
  return legal;
}

function botChoose(player: Player, dice: number, others: Player[]): number | null {
  const opts = legalMoves(player, dice);
  if (!opts.length) return null;
  // Score: capture > finish > enter home column > leave yard > advance
  let best = -Infinity, choice = opts[0];
  for (const i of opts) {
    const cur = player.pawns[i];
    const nextProg = cur.progress === 0 ? 1 : cur.progress + dice;
    let score = nextProg; // prefer advanced
    if (nextProg === 57) score += 100;
    if (cur.progress === 0) score += 25;
    if (nextProg > 51) score += 40;
    // capture?
    if (nextProg <= 51) {
      const targetIdx = (ENTRY[player.color] + nextProg - 1) % 52;
      if (!SAFE.has(targetIdx)) {
        for (const opp of others) {
          for (const op of opp.pawns) {
            const oi = outerIndex(opp.color, op.progress);
            if (oi === targetIdx) score += 90;
          }
        }
      }
    }
    if (score > best) { best = score; choice = i; }
  }
  return choice;
}

function winnerOf(p: Player): boolean {
  return p.pawns.every((pw) => pw.progress === 57);
}

/* ==================== Main page ==================== */
export default function LudoPage() {
  const [players, setPlayers] = useState<Player[]>(initialPlayers);
  const [turnIdx, setTurnIdx] = useState(0); // 0=red,1=green,2=yellow,3=blue
  const [dice, setDice] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [canRoll, setCanRoll] = useState(true);
  const [movable, setMovable] = useState<Set<number>>(new Set());
  const [winner, setWinner] = useState<ColorKey | null>(null);
  const [message, setMessage] = useState<string>("Mianjera ny dés, ry Mena!");
  const consecSix = useRef(0);

  const current = players[turnIdx];

  const nextTurn = (extra: boolean) => {
    setMovable(new Set());
    setCanRoll(true);
    if (extra) {
      setMessage(`${labelOf(current.color)}: dés fanampiny!`);
      return;
    }
    consecSix.current = 0;
    setTurnIdx((i) => (i + 1) % 4);
  };

  const labelOf = (c: ColorKey) => ({ red: "Mena", green: "Maitso", yellow: "Mavo", blue: "Manga" }[c]);

  const rollDice = () => {
    if (!canRoll || rolling || winner) return;
    setRolling(true);
    setCanRoll(false);
    sfx.dice();
    const v = 1 + Math.floor(Math.random() * 6);
    let frames = 0;
    const iv = setInterval(() => {
      setDice(1 + Math.floor(Math.random() * 6));
      if (++frames > 6) {
        clearInterval(iv);
        setDice(v);
        setRolling(false);
        handleRoll(v);
      }
    }, 70);
  };

  const handleRoll = (v: number) => {
    if (v === 6) consecSix.current += 1;
    if (consecSix.current === 3) {
      setMessage(`${labelOf(current.color)}: telo 6 nifanesy — very ny tour!`);
      setTimeout(() => nextTurn(false), 900);
      return;
    }
    const legal = legalMoves(current, v);
    if (legal.length === 0) {
      setMessage(`${labelOf(current.color)}: tsy misy azo alefa.`);
      setTimeout(() => nextTurn(v === 6), 900);
      return;
    }
    if (current.isBot) {
      const others = players.filter((_, i) => i !== turnIdx);
      const choice = botChoose(current, v, others);
      if (choice != null) setTimeout(() => movePawn(turnIdx, choice, v), 500);
    } else {
      setMovable(new Set(legal));
      setMessage(`${labelOf(current.color)}: safidio ny pion halefa (${v}).`);
    }
  };

  const movePawn = (playerIdx: number, pawnIdx: number, dv: number) => {
    let didCapture = false;
    let didFinish = false;
    setPlayers((prev) => {
      const next = prev.map((p) => ({ ...p, pawns: p.pawns.map((x) => ({ ...x })) }));
      const pl = next[playerIdx];
      const pw = pl.pawns[pawnIdx];
      pw.progress = pw.progress === 0 ? 1 : pw.progress + dv;
      if (pw.progress === 57) didFinish = true;
      // Capture check
      const oi = outerIndex(pl.color, pw.progress);
      if (oi != null && !SAFE.has(oi)) {
        for (let i = 0; i < next.length; i++) {
          if (i === playerIdx) continue;
          for (const opw of next[i].pawns) {
            const ooi = outerIndex(next[i].color, opw.progress);
            if (ooi === oi) {
              opw.progress = 0;
              didCapture = true;
            }
          }
        }
      }
      return next;
    });
    sfx.step();
    if (didCapture) { sfx.capture(); setMessage(`${labelOf(current.color)}: nahazo fahavalo!`); }
    if (didFinish) sfx.home();
    // Check winner
    setTimeout(() => {
      setPlayers((cur) => {
        const w = cur.find(winnerOf);
        if (w) { setWinner(w.color); sfx.win(); setMessage(`${labelOf(w.color)} no mpandresy! 🏆`); }
        return cur;
      });
      const extra = dv === 6 || didCapture || didFinish;
      nextTurn(extra && !winner);
    }, 260);
  };

  // Auto-play bots
  useEffect(() => {
    if (winner) return;
    if (current.isBot && canRoll) {
      const t = setTimeout(() => rollDice(), 700);
      return () => clearTimeout(t);
    }
  }, [turnIdx, canRoll, winner]); // eslint-disable-line

  const reset = () => {
    setPlayers(initialPlayers());
    setTurnIdx(0);
    setDice(1);
    setRolling(false);
    setCanRoll(true);
    setMovable(new Set());
    setWinner(null);
    consecSix.current = 0;
    setMessage("Mianjera ny dés, ry Mena!");
  };

  const scores = useMemo(() => players.map(p => ({
    color: p.color,
    done: p.pawns.filter(x => x.progress === 57).length,
  })), [players]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b1a2e] via-[#123055] to-[#0b1a2e] text-white">
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <Link to="/" className="inline-flex items-center gap-2 text-white/80 hover:text-white">
          <ArrowLeft className="w-5 h-5" /> Miverina
        </Link>
        <h1 className="text-xl font-bold tracking-wide">LUDO</h1>
        <button onClick={reset} className="inline-flex items-center gap-1 text-white/80 hover:text-white">
          <RotateCcw className="w-5 h-5" /> Vaovao
        </button>
      </header>

      <div className="max-w-2xl mx-auto p-3 space-y-3">
        {/* Scoreboard */}
        <div className="grid grid-cols-4 gap-2">
          {players.map((p, i) => (
            <div key={p.color}
                 className={`rounded-lg p-2 text-center transition ${i === turnIdx ? "ring-2 ring-white scale-105" : "opacity-70"}`}
                 style={{ background: HEX[p.color].base, color: p.color === "yellow" ? "#111" : "#fff" }}>
              <div className="text-[10px] uppercase tracking-wider">{p.isBot ? "Bot" : "You"}</div>
              <div className="font-bold text-sm">{labelOf(p.color)}</div>
              <div className="text-xs mt-1">🏠 {scores[i].done}/4</div>
            </div>
          ))}
        </div>

        {/* Board with corner dice */}
        <div className="relative">
          <Board players={players} activeColor={current.color}
                 onPickPawn={(color, idx) => {
                   if (color !== current.color || current.isBot) return;
                   if (!movable.has(idx)) return;
                   movePawn(turnIdx, idx, dice);
                 }}
                 movable={current.isBot ? new Set() : movable} />
          {(["red","green","blue","yellow"] as ColorKey[]).map((c) => {
            const pos: Record<ColorKey,string> = {
              red: "top-1 left-1",
              green: "top-1 right-1",
              blue: "bottom-1 left-1",
              yellow: "bottom-1 right-1",
            };
            const isActive = current.color === c;
            return (
              <div key={c} className={`absolute ${pos[c]} z-10`}>
                <Dice
                  value={isActive ? dice : 1}
                  rolling={isActive && rolling}
                  disabled={!isActive || !canRoll || current.isBot || !!winner}
                  onRoll={rollDice}
                  color={c}
                />
              </div>
            );
          })}
        </div>

        {/* Bottom status */}
        <div className="rounded-xl bg-black/40 p-3 border border-white/10">
          <p className="text-[11px] uppercase tracking-wider opacity-70">Tour</p>
          <p className="font-bold" style={{ color: HEX[current.color].light }}>
            {labelOf(current.color)} {current.isBot ? "(Bot)" : "(Ianao)"}
          </p>
          <p className="text-xs opacity-80 mt-1">{message}</p>
        </div>

        {winner && (
          <div className="rounded-xl p-4 text-center font-bold text-lg"
               style={{ background: HEX[winner].base, color: winner === "yellow" ? "#111" : "#fff" }}>
            🏆 {labelOf(winner)} no mpandresy!
            <button onClick={reset} className="block mx-auto mt-3 px-4 py-2 rounded-lg bg-black/30 text-white text-sm">
              Lalao vaovao
            </button>
          </div>
        )}
      </div>
    </div>
  );
}