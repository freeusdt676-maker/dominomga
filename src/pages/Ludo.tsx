import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { RadioPlayer } from "@/components/RadioPlayer";
import { MessageCircle, Send, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { fmtAr } from "@/lib/constants";

/* =========================================================
   LUDO — offline solo vs 3 bots
   Board & tokens & dice modeled after the classic reference.
   ========================================================= */

type ColorKey = "red" | "green" | "yellow" | "blue";
const COLORS: ColorKey[] = ["red", "green", "yellow", "blue"];
// Seat number (1..4) → color mapping. seats 1=red, 2=green, 3=yellow, 4=blue.
const SEAT_COLOR: Record<number, ColorKey> = { 1: "red", 2: "green", 3: "yellow", 4: "blue" };
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
type Player = { color: ColorKey; seat: number; userId: string | null; name: string; pawns: Pawn[] };

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
  // Finished — sit inside this color's own triangle within the center square,
  // so each color has its own "home" instead of stacking on top of one another.
  const spread = (slotIdx - 1.5) * 0.42;
  switch (color) {
    case "red":    return [7 + spread, 6.35];
    case "green":  return [6.35, 7 + spread];
    case "yellow": return [7 + spread, 7.65];
    case "blue":   return [7.65, 7 + spread];
  }
  return [7, 7];
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
  leave: () => { beep(520, 0.06, "square", 0.18); setTimeout(() => beep(780, 0.09, "triangle", 0.18), 55); },
  step: () => beep(1200, 0.025, "triangle", 0.10),
  enterHome: () => { beep(700, 0.07, "sine", 0.18); setTimeout(() => beep(1050, 0.09, "sine", 0.2), 70); setTimeout(() => beep(1400, 0.12, "sine", 0.2), 150); },
  capture: () => { beep(220, 0.12, "sawtooth", 0.22); setTimeout(() => beep(160, 0.18, "sawtooth", 0.22), 90); setTimeout(() => beep(110, 0.22, "sawtooth", 0.22), 190); },
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
      {/* Slightly tinted inner area (color echo) instead of pure white */}
      <rect x={col*S+S*0.6} y={row*S+S*0.6} width={4.8*S} height={4.8*S}
            fill={HEX[c].light} opacity={0.55}
            stroke={HEX[c].dark} strokeWidth={1.5} rx={6}/>
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
      const SCALE = 1.30;
      // tip local y in path = 16 → after scale = 16*SCALE.
      // We want the pointed tip to land exactly at the cell center.
      const offset = arr.length > 1 ? (i - (arr.length - 1) / 2) * 10 : 0;
      const cellCx = p.c * S + S / 2 + offset;
      const cellCy = p.r * S + S / 2;
      const x = cellCx;
      const y = cellCy - 16 * SCALE; // anchor tip at cell center
      const active = p.color === activeColor && movable.has(p.pIdx);
      pawnEls.push(
        <g key={`p-${p.color}-${p.pIdx}`}
           style={{
             cursor: active ? "pointer" : "default",
             transform: `translate(${x}px, ${y}px) scale(${SCALE})`,
             transition: "transform 110ms cubic-bezier(0.4, 0.0, 0.2, 1)",
             transformBox: "fill-box",
           }}
           onClick={() => active && onPickPawn(p.color, p.pIdx)}>
          {/* GPS localisation pin — teardrop head with center hole + ripple base */}
          {/* Ripple rings at ground */}
          <ellipse cx={0} cy={16} rx={13} ry={3.4} fill="none" stroke={HEX[p.color].dark} strokeWidth={1} opacity={0.55}/>
          <ellipse cx={0} cy={16} rx={9} ry={2.4} fill="none" stroke={HEX[p.color].dark} strokeWidth={1} opacity={0.75}/>
          <ellipse cx={0} cy={16} rx={5} ry={1.4} fill={HEX[p.color].dark} opacity={0.55}/>
          {/* Teardrop pin body: round top, pointed bottom */}
          <path d={`M 0 16
                    C -3 10, -10 6, -10 -4
                    A 10 10 0 1 1 10 -4
                    C 10 6, 3 10, 0 16 Z`}
                fill={`url(#grad-${p.color})`}
                stroke={HEX[p.color].dark} strokeWidth={1.4}
                strokeLinejoin="round"/>
          {/* Center hole */}
          <circle cx={0} cy={-4} r={3.6} fill="#fff" stroke={HEX[p.color].dark} strokeWidth={1.2}/>
          {/* Highlight */}
          <ellipse cx={-3} cy={-8} rx={2.2} ry={1.4} fill="rgba(255,255,255,0.75)"/>
          {active && (
            <circle cx={0} cy={0} r={17} fill="none" stroke="#fff" strokeWidth={2}
                    strokeDasharray="3 3" opacity={0.9}>
              <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="3s" repeatCount="indefinite"/>
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

/* ==================== Local Chat (offline) ==================== */
const CHAT_EMOJIS: { e: string; anim: string }[] = [
  { e: "😂", anim: "emo-laugh" },
  { e: "😭", anim: "emo-cry" },
  { e: "😱", anim: "emo-shock" },
  { e: "😡", anim: "emo-shake" },
  { e: "❤️", anim: "emo-beat" },
  { e: "👏", anim: "emo-clap" },
  { e: "🔥", anim: "emo-fire" },
  { e: "🎉", anim: "emo-spin" },
  { e: "👍", anim: "emo-beat" },
  { e: "🙏", anim: "emo-beat" },
];
const QUICKS = ["👋 Salama", "🔥 Tsara!", "😂", "👍", "💪 Mazoto e!", "🎉 Bravo!"];

function LudoChat() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<{ id: string; who: "me" | "bot"; content: string }[]>([]);
  const [bursts, setBursts] = useState<{ id: string; e: string; anim: string; left: string; top: string }[]>([]);
  const [floaters, setFloaters] = useState<{ id: string; content: string }[]>([]);

  const beep = (f: number, d = 0.1) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "triangle"; o.frequency.value = f; g.gain.value = 0.18;
      o.connect(g).connect(ctx.destination);
      o.start(); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + d);
      o.stop(ctx.currentTime + d);
    } catch {}
  };

  const pushBurst = (e: string, anim: string) => {
    const id = crypto.randomUUID();
    const left = `${10 + Math.random() * 80}%`;
    const top = `${20 + Math.random() * 50}%`;
    setBursts((b) => [...b, { id, e, anim, left, top }]);
    setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 2200);
  };

  const pushFloater = (content: string) => {
    const id = crypto.randomUUID();
    setFloaters((f) => [...f, { id, content }]);
    setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 3000);
  };

  const send = (content: string) => {
    if (!content.trim()) return;
    setMsgs((m) => [...m.slice(-30), { id: crypto.randomUUID(), who: "me", content }]);
    pushFloater(content);
    beep(880, 0.08);
    setText("");
  };

  const sendEmoji = (e: string, anim: string) => {
    pushBurst(e, anim);
    setMsgs((m) => [...m.slice(-30), { id: crypto.randomUUID(), who: "me", content: e }]);
    beep(1200, 0.1);
  };

  return (
    <>
      {/* On-screen emoji bursts (global) */}
      <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
        {bursts.map((b) => (
          <div key={b.id} className={`absolute text-5xl ${b.anim}`} style={{ left: b.left, top: b.top }}>
            {b.e}
          </div>
        ))}
        {floaters.map((f, i) => (
          <div key={f.id}
               className="absolute left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/70 text-white text-sm font-semibold shadow-lg animate-fade-in"
               style={{ top: `${8 + i * 40}px` }}>
            {f.content}
          </div>
        ))}
      </div>

      {!open && (
        <button onClick={() => setOpen(true)}
                className="fixed bottom-4 right-4 z-[60] w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center hover:scale-105 transition">
          <MessageCircle className="w-6 h-6" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-4 right-4 z-[60] w-[90vw] max-w-[320px] rounded-2xl bg-slate-900/95 border border-white/10 shadow-2xl backdrop-blur flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <div className="text-sm font-bold text-white">Chat</div>
            <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="max-h-40 overflow-y-auto p-2 space-y-1 text-sm">
            {msgs.length === 0 && (
              <div className="text-white/50 italic text-xs">Manombohana ny resaka…</div>
            )}
            {msgs.map((m) => (
              <div key={m.id} className="px-2 py-1 rounded-lg bg-white/10 text-white w-fit max-w-full break-words">
                {m.content}
              </div>
            ))}
          </div>

          <div className="px-2 py-1 flex flex-wrap gap-1 border-t border-white/10">
            {CHAT_EMOJIS.map((x) => (
              <button key={x.e} onClick={() => sendEmoji(x.e, x.anim)}
                      className="text-xl hover:scale-125 transition">
                {x.e}
              </button>
            ))}
          </div>

          <div className="px-2 py-1 flex flex-wrap gap-1 border-t border-white/10">
            {QUICKS.map((q) => (
              <button key={q} onClick={() => send(q)}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white hover:bg-white/20">
                {q}
              </button>
            ))}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(text); }}
                className="flex items-center gap-1 p-2 border-t border-white/10">
            <input value={text} onChange={(e) => setText(e.target.value)}
                   placeholder="Soraty…"
                   className="flex-1 bg-white/10 text-white text-sm rounded-full px-3 py-1.5 outline-none placeholder:text-white/40" />
            <button type="submit" className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

/* ==================== Main page (ONLINE multiplayer) ==================== */
const TURN_TIMEOUT_S = 15;
const labelOf = (c: ColorKey) => ({ red: "Mena", green: "Maitso", yellow: "Mavo", blue: "Manga" }[c]);

type ServerRow = {
  id: string; status: string; players_count: number; stake: number;
  player1_id: string | null; player2_id: string | null; player3_id: string | null; player4_id: string | null;
  seat_assignment: number[] | null; pawns: Array<{ seat: number; idx: number; pos: number }> | null;
  current_turn_seat: number | null; last_dice: number | null; dice_rolled: boolean;
  consecutive_sixes: number; turn_started_at: string | null; winner_id: string | null;
};

function rowToPlayers(row: ServerRow, names: Record<string, string>): Player[] {
  const seats = row.seat_assignment ?? [];
  const userBySeat: Record<number, string | null> = {
    1: row.player1_id, 2: row.player2_id, 3: row.player3_id, 4: row.player4_id,
  };
  // Pair players with seats by join order = seats order
  const seatToUser: Record<number, string | null> = {};
  const orderedUids = [row.player1_id, row.player2_id, row.player3_id, row.player4_id].filter(Boolean) as string[];
  seats.forEach((s, i) => { seatToUser[s] = orderedUids[i] ?? null; });
  // Fallback: if seat_assignment absent, use raw
  if (seats.length === 0) {
    ([1, 2, 3, 4] as const).forEach((s) => { seatToUser[s] = userBySeat[s]; });
  }
  const activeSeats = seats.length ? seats : ([1, 2, 3, 4] as number[]).filter((s) => userBySeat[s]);
  return activeSeats.map((seat) => {
    const color = SEAT_COLOR[seat];
    const uid = seatToUser[seat] ?? null;
    const pawns: Pawn[] = [0, 1, 2, 3].map((i) => {
      const rec = (row.pawns ?? []).find((r) => r.seat === seat && r.idx === i);
      return { progress: rec?.pos ?? 0 };
    });
    return { color, seat, userId: uid, name: uid ? (names[uid] ?? "Mpilalao") : "…", pawns };
  });
}

function playersToPawnsJson(players: Player[]) {
  const out: Array<{ seat: number; idx: number; pos: number }> = [];
  players.forEach((pl) => pl.pawns.forEach((p, i) => out.push({ seat: pl.seat, idx: i, pos: p.progress })));
  return out;
}

export default function LudoPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const nav = useNavigate();
  const [row, setRow] = useState<ServerRow | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [rolling, setRolling] = useState(false);
  const [diceDisplay, setDiceDisplay] = useState(1);
  const [movable, setMovable] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<string>("Miandry lalao…");
  const [countdown, setCountdown] = useState<number>(TURN_TIMEOUT_S);
  const rpcBusy = useRef(false);
  const autoTapDone = useRef<string>("");

  // --- Load + realtime subscribe ---
  const applyRow = useCallback(async (r: any) => {
    const uids = [r.player1_id, r.player2_id, r.player3_id, r.player4_id].filter(Boolean) as string[];
    const missing = uids.filter((u) => !names[u]);
    if (missing.length) {
      const { data } = await supabase.from("profiles").select("user_id, mvola_name").in("user_id", missing);
      if (data) {
        setNames((prev) => {
          const nx = { ...prev };
          (data as any[]).forEach((p) => { nx[p.user_id] = p.mvola_name ?? "Mpilalao"; });
          return nx;
        });
      }
    }
    setRow(r as ServerRow);
    if (typeof r.last_dice === "number") setDiceDisplay(r.last_dice || 1);
  }, [names]);

  useEffect(() => {
    if (!id || !user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("ludo_games").select("*").eq("id", id).maybeSingle();
      if (error || !data) { toast.error("Tsy hita ny lalao"); nav("/ludo"); return; }
      if (cancelled) return;
      await applyRow(data);
    })();
    const ch = supabase.channel(`ludo-game-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "ludo_games", filter: `id=eq.${id}` }, (p: any) => {
        applyRow(p.new);
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [id, user, applyRow, nav]);

  // --- Derived state ---
  const players = useMemo<Player[]>(() => (row ? rowToPlayers(row, names) : []), [row, names]);
  const currentSeat = row?.current_turn_seat ?? 0;
  const current = players.find((p) => p.seat === currentSeat) ?? players[0];
  const mySeat = useMemo(() => {
    if (!user || !row) return null;
    const idx = [row.player1_id, row.player2_id, row.player3_id, row.player4_id].indexOf(user.id);
    const seats = row.seat_assignment ?? [1, 2, 3, 4];
    return idx >= 0 ? seats[idx] ?? null : null;
  }, [user, row]);
  const myColor = mySeat ? SEAT_COLOR[mySeat] : null;
  const isMyTurn = !!row && row.status === "in_progress" && currentSeat === mySeat && !row.winner_id;
  const canRoll = isMyTurn && row?.dice_rolled === false;

  // Legal moves once dice is rolled and it's my turn
  useEffect(() => {
    if (!row || !isMyTurn || !row.dice_rolled || row.winner_id) { setMovable(new Set()); return; }
    const me = players.find((p) => p.seat === mySeat);
    if (!me) return;
    const legal = legalMoves(me, row.last_dice ?? 0);
    setMovable(new Set(legal));
  }, [row, isMyTurn, players, mySeat]);

  // Countdown driven by server turn_started_at
  useEffect(() => {
    if (!row?.turn_started_at || row.status !== "in_progress" || row.winner_id) { setCountdown(TURN_TIMEOUT_S); return; }
    const started = new Date(row.turn_started_at).getTime();
    const tick = () => {
      const remain = Math.max(0, Math.ceil((started + TURN_TIMEOUT_S * 1000 - Date.now()) / 1000));
      setCountdown(remain);
    };
    tick();
    const iv = setInterval(tick, 250);
    return () => clearInterval(iv);
  }, [row?.turn_started_at, row?.status, row?.winner_id]);

  // Vibrate/beep on last 3s of my turn
  useEffect(() => {
    if (!isMyTurn) return;
    if (countdown > 0 && countdown <= 3) {
      try { navigator.vibrate?.([200, 80, 200]); } catch {}
      beep(880, 0.12, "square", 0.22);
    }
  }, [countdown, isMyTurn]);

  // ---- Actions ----
  const nextSeatOf = (seat: number): number => {
    const seats = row?.seat_assignment ?? [1, 2, 3, 4];
    const i = seats.indexOf(seat);
    return seats[(i + 1) % seats.length];
  };

  const commit = async (patch: {
    pawns?: any; current_turn_seat?: number; last_dice?: number | null; dice_rolled?: boolean;
    consecutive_sixes?: number; turn_started_at?: string;
  }) => {
    if (!id) return;
    const payload: any = { _game_id: id };
    if (patch.pawns !== undefined) payload._pawns = patch.pawns;
    if (patch.current_turn_seat !== undefined) payload._current_turn_seat = patch.current_turn_seat;
    if (patch.last_dice !== undefined && patch.last_dice !== null) payload._last_dice = patch.last_dice;
    if (patch.dice_rolled !== undefined) payload._dice_rolled = patch.dice_rolled;
    if (patch.consecutive_sixes !== undefined) payload._consecutive_sixes = patch.consecutive_sixes;
    if (patch.turn_started_at !== undefined) payload._turn_started_at = patch.turn_started_at;
    const { error } = await supabase.rpc("ludo_update_state" as any, payload);
    if (error) toast.error(error.message);
  };

  const rollDice = async () => {
    if (!canRoll || rolling || rpcBusy.current || !row || !current) return;
    rpcBusy.current = true;
    setRolling(true);
    sfx.dice();
    const v = 1 + Math.floor(Math.random() * 6);
    let frames = 0;
    await new Promise<void>((res) => {
      const iv = setInterval(() => {
        setDiceDisplay(1 + Math.floor(Math.random() * 6));
        if (++frames > 6) { clearInterval(iv); setDiceDisplay(v); res(); }
      }, 70);
    });
    setRolling(false);
    const newSix = v === 6 ? (row.consecutive_sixes ?? 0) + 1 : 0;
    // 3 sixes → skip
    if (newSix >= 3) {
      await commit({
        last_dice: v, dice_rolled: false, consecutive_sixes: 0,
        current_turn_seat: nextSeatOf(current.seat), turn_started_at: new Date().toISOString(),
      });
      rpcBusy.current = false;
      return;
    }
    const legal = legalMoves(current, v);
    if (legal.length === 0) {
      // No move — if it was a 6 keep the turn but let re-roll; otherwise pass
      if (v === 6) {
        await commit({ last_dice: v, dice_rolled: false, consecutive_sixes: newSix, turn_started_at: new Date().toISOString() });
      } else {
        await commit({
          last_dice: v, dice_rolled: false, consecutive_sixes: 0,
          current_turn_seat: nextSeatOf(current.seat), turn_started_at: new Date().toISOString(),
        });
      }
      rpcBusy.current = false;
      return;
    }
    // Legal moves exist — mark rolled, wait for pick
    await commit({ last_dice: v, dice_rolled: true, consecutive_sixes: newSix });
    rpcBusy.current = false;
  };

  const movePawn = async (pawnIdx: number) => {
    if (!row || !current || !isMyTurn || !row.dice_rolled) return;
    if (rpcBusy.current) return;
    if (!movable.has(pawnIdx)) return;
    rpcBusy.current = true;
    setMovable(new Set());
    const dv = row.last_dice ?? 0;
    // Compute new pawns state
    const next = players.map((p) => ({ ...p, pawns: p.pawns.map((x) => ({ ...x })) }));
    const me = next.find((p) => p.seat === current.seat)!;
    const pw = me.pawns[pawnIdx];
    const startProg = pw.progress;
    pw.progress = startProg === 0 ? 1 : startProg + dv;
    // Capture
    let didCapture = false, didFinish = pw.progress === 57;
    const oi = outerIndex(me.color, pw.progress);
    if (oi != null && !SAFE.has(oi)) {
      next.forEach((op) => {
        if (op.seat === me.seat) return;
        op.pawns.forEach((opw) => {
          const ooi = outerIndex(op.color, opw.progress);
          if (ooi === oi) { opw.progress = 0; didCapture = true; }
        });
      });
    }
    if (startProg === 0) sfx.leave();
    else if (pw.progress === 52) sfx.enterHome();
    else sfx.step();
    if (didCapture) sfx.capture();
    if (didFinish) sfx.home();
    const pawnsJson = playersToPawnsJson(next);
    const iAmWinner = me.pawns.every((x) => x.progress === 57);
    const extra = dv === 6 || didCapture || didFinish;
    const nextSeat = extra ? current.seat : nextSeatOf(current.seat);
    await commit({
      pawns: pawnsJson, current_turn_seat: nextSeat, dice_rolled: false,
      consecutive_sixes: extra ? (row.consecutive_sixes ?? 0) : 0,
      turn_started_at: new Date().toISOString(),
    });
    if (iAmWinner && user) {
      sfx.win();
      await supabase.rpc("ludo_settle" as any, { _game_id: id, _winner: user.id });
    }
    rpcBusy.current = false;
  };

  // Auto-tap on countdown expiry (my turn only) — fallback if watchdog delayed.
  useEffect(() => {
    if (!isMyTurn || !row) return;
    if (autoTapDone.current === row.turn_started_at) return;
    if (countdown > 0) return;
    autoTapDone.current = row.turn_started_at ?? "";
    if (canRoll) { rollDice(); return; }
    if (row.dice_rolled && movable.size > 0) {
      const choice = botChoose(current!, row.last_dice ?? 0, players.filter((p) => p.seat !== current!.seat));
      if (choice != null) movePawn(choice);
    }
    // eslint-disable-next-line
  }, [countdown, isMyTurn, row?.turn_started_at, row?.dice_rolled, movable]);

  const scores = useMemo(() => players.map((p) => ({ color: p.color, done: p.pawns.filter((x) => x.progress === 57).length })), [players]);
  const winner: ColorKey | null = row?.winner_id
    ? players.find((p) => p.userId === row.winner_id)?.color ?? null
    : null;

  // ---- Status message ----
  useEffect(() => {
    if (!row) return;
    if (row.status === "waiting") { setMessage(`Miandry mpilalao (${(row.seat_assignment ?? []).length || 0}/${row.players_count})…`); return; }
    if (winner) { setMessage(`${labelOf(winner)} no mpandresy! 🏆`); return; }
    if (!current) return;
    if (isMyTurn) setMessage(canRoll ? "Tour-nao — kitiho ny dés!" : `Safidio ny pion halefa (${row.last_dice ?? "?"}).`);
    else setMessage(`Miandry ${current.name} (${labelOf(current.color)})…`);
  }, [row, winner, current, isMyTurn, canRoll]);

  if (!row) {
    return <div className="min-h-screen bg-[#0b1a2e] text-white flex items-center justify-center">Miandry…</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b1a2e] via-[#123055] to-[#0b1a2e] text-white">
      <header className="relative flex items-center justify-between px-4 py-3 border-b border-white/10">
        <Link to="/ludo" className="inline-flex items-center gap-2 text-white/80 hover:text-white">
          <ArrowLeft className="w-5 h-5" /> Miverina
        </Link>
        <h1 className="text-xl font-bold tracking-wide">LUDO · {fmtAr(Number(row.stake))}</h1>
        <div className="w-6" />
        <RadioPlayer />
      </header>

      <div className="max-w-2xl mx-auto p-3 space-y-3 min-h-[calc(100vh-56px)] flex flex-col justify-center">
        <div className="text-center text-xs text-white/70">{message}</div>
        {(() => {
          const cornerFor: Record<ColorKey, string> = {
            red: "justify-self-start",
            green: "justify-self-end",
            blue: "justify-self-start",
            yellow: "justify-self-end",
          };
          const DiceCell = ({ c }: { c: ColorKey }) => {
            const seat = (Object.entries(SEAT_COLOR).find(([, v]) => v === c)?.[0] ?? "0") as unknown as number;
            const pl = players.find((p) => p.color === c);
            if (!pl) return <div className={cornerFor[c]} />;
            const isActive = current?.color === c;
            const align = (c === "red" || c === "blue") ? "items-start" : "items-end";
            const urgent = isActive && !winner && countdown > 0 && countdown <= 3;
            const iAmThisCell = myColor === c;
            return (
              <div className={`flex flex-col ${align} gap-1 ${cornerFor[c]}`}>
                <div className="text-[10px] font-bold uppercase tracking-wider leading-tight text-center"
                     style={{ color: HEX[c].light }}>
                  {pl.name}
                  <div className="text-[9px] opacity-80">🏠 {pl.pawns.filter((x) => x.progress === 57).length}/4</div>
                </div>
                <Dice
                  value={isActive ? diceDisplay : (pl.pawns.length ? (row.last_dice && current?.color === c ? row.last_dice : 1) : 1)}
                  rolling={isActive && rolling}
                  disabled={!(iAmThisCell && canRoll) || rolling}
                  onRoll={rollDice}
                  color={c}
                />
                {isActive && !winner && (
                  <div
                    className={`font-black tabular-nums px-2 py-0.5 rounded-md ${urgent ? "text-lg animate-pulse" : "text-[11px]"}`}
                    style={{
                      background: urgent ? "#dc2626" : "rgba(0,0,0,0.55)",
                      color: "#fff",
                      border: `1px solid ${urgent ? "#fff" : HEX[c].light}`,
                      boxShadow: urgent ? "0 0 12px rgba(220,38,38,0.9)" : "none",
                    }}
                  >
                    ⏱ {countdown}s
                  </div>
                )}
              </div>
            );
          };
          return (
            <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center">
              <DiceCell c="red" />
              <div /> {/* top spacer */}
              <DiceCell c="green" />
              <div className="col-span-3">
                <Board players={players} activeColor={current?.color ?? "red"}
                       onPickPawn={(color, idx) => {
                         if (!myColor || color !== myColor) return;
                         movePawn(idx);
                       }}
                       movable={isMyTurn ? movable : new Set()} />
              </div>
              <DiceCell c="blue" />
              <div />
              <DiceCell c="yellow" />
            </div>
          );
        })()}

        {winner && (
          <div className="rounded-xl p-4 text-center font-bold text-lg"
               style={{ background: HEX[winner].base, color: winner === "yellow" ? "#111" : "#fff" }}>
            🏆 {labelOf(winner)} no mpandresy!
            <button onClick={() => nav("/ludo")}
                    className="block mx-auto mt-3 px-4 py-2 rounded-lg bg-black/30 text-white text-sm">
              Miverina any Lobby
            </button>
          </div>
        )}
      </div>

      <LudoChat />
    </div>
  );
}