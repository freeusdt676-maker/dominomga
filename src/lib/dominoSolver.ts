// Internal exact-play engine (not user facing).
import { canPlace, ends, place, pipsTotal, type Placed, type Tile } from "@/lib/dominoEngine";

export type SolveResult = { index: number; side: "left" | "right"; value: number } | null;

const WIN = 100000;
const NODE_CAP = 220000;

type Move = { index: number; side: "left" | "right" };

function movesFor(hand: Tile[], board: Placed[]): Move[] {
  const out: Move[] = [];
  for (let i = 0; i < hand.length; i++) {
    const can = canPlace(board, hand[i]);
    if (can === null) continue;
    if (can === "either") {
      out.push({ index: i, side: "left" });
      const e = ends(board);
      if (!e || e.left !== e.right) out.push({ index: i, side: "right" });
    } else out.push({ index: i, side: can });
  }
  return out;
}

/** Value (bot perspective) when the round terminates. */
function terminalValue(hands: Tile[][], winner: number | null): number {
  if (winner === 0) {
    let others = 0;
    for (let i = 1; i < hands.length; i++) others += pipsTotal(hands[i]);
    return WIN + others;
  }
  if (winner !== null) return -WIN - pipsTotal(hands[0]);
  // Blocked: lowest pips wins.
  const pips = hands.map((h) => pipsTotal(h));
  const min = Math.min(...pips);
  const winners = pips.filter((p) => p === min).length;
  if (pips[0] === min && winners === 1) {
    return WIN + (pips.reduce((s, p) => s + p, 0) - pips[0]);
  }
  return -WIN - pips[0];
}

/** Static estimate when the depth budget runs out. */
function heuristic(hands: Tile[][]): number {
  let others = 0;
  for (let i = 1; i < hands.length; i++) others += pipsTotal(hands[i]);
  const sizePenalty = hands[0].length * 12;
  return others / Math.max(1, hands.length - 1) - pipsTotal(hands[0]) - sizePenalty;
}

/**
 * Exact minimax over the full known distribution of tiles (block game, no draw).
 * Bot = seat 0; every opponent is assumed to play optimally against it.
 */
export function solveDomino(
  hands: Tile[][],
  board: Placed[],
  turn: number,
  passes: number,
  depth: number,
  nodes: { n: number },
  alpha = -Infinity,
  beta = Infinity,
): { value: number; move: Move | null } {
  nodes.n += 1;
  const n = hands.length;
  for (let i = 0; i < n; i++) {
    if (hands[i].length === 0) return { value: terminalValue(hands, i), move: null };
  }
  if (passes >= n) return { value: terminalValue(hands, null), move: null };
  if (depth <= 0 || nodes.n > NODE_CAP) return { value: heuristic(hands), move: null };

  const moves = movesFor(hands[turn], board);
  const maximizing = turn === 0;

  if (moves.length === 0) {
    const r = solveDomino(hands, board, (turn + 1) % n, passes + 1, depth - 1, nodes, alpha, beta);
    return { value: r.value, move: null };
  }

  // Move ordering: heavy tiles first for the bot, cheap ones for opponents.
  moves.sort((a, b) => {
    const pa = hands[turn][a.index][0] + hands[turn][a.index][1];
    const pb = hands[turn][b.index][0] + hands[turn][b.index][1];
    return maximizing ? pb - pa : pa - pb;
  });

  let best: Move | null = null;
  let value = maximizing ? -Infinity : Infinity;

  for (const m of moves) {
    const tile = hands[turn][m.index];
    const nb = place(board, tile, m.side);
    const nh = hands.map((h, i) => (i === turn ? h.filter((_, k) => k !== m.index) : h));
    const r = solveDomino(nh, nb, (turn + 1) % n, 0, depth - 1, nodes, alpha, beta);
    if (maximizing) {
      if (r.value > value) { value = r.value; best = m; }
      alpha = Math.max(alpha, value);
    } else {
      if (r.value < value) { value = r.value; best = m; }
      beta = Math.min(beta, value);
    }
    if (beta <= alpha) break;
    if (nodes.n > NODE_CAP) break;
  }
  return { value, move: best };
}

/** Entry point: returns the strongest move with full knowledge, or null. */
export function bestExactMove(
  myHand: Tile[],
  orderedOpponentHands: Tile[][],
  board: Placed[],
  passes: number,
): SolveResult {
  if (!myHand.length) return null;
  const hands = [myHand, ...orderedOpponentHands];
  const total = hands.reduce((s, h) => s + h.length, 0);
  // Deeper search when few tiles remain; still bounded by the node cap.
  const depth = total <= 10 ? 40 : total <= 14 ? 20 : total <= 18 ? 14 : 10;
  const nodes = { n: 0 };
  const r = solveDomino(hands, board, 0, passes, depth, nodes);
  if (!r.move) return null;
  return { index: r.move.index, side: r.move.side, value: r.value };
}
