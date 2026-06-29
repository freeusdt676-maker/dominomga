// Ludo MGA — moteur lalao classique (2P/3P/4P)
// Pawn progress: 0 = base, 1..51 = on main track, 52..57 = home column, 57 = finished
// Seats: 1=blue (bottom-left), 2=red (top-left), 3=green (top-right), 4=yellow (bottom-right)

export type Pawn = { seat: number; idx: number; pos: number };
export type Seat = 1 | 2 | 3 | 4;

export const SEAT_START: Record<number, number> = { 1: 39, 2: 0, 3: 13, 4: 26 };
export const SEAT_COLOR: Record<number, string> = {
  1: "#1f7fd6", // blue (PLAYER1, bottom-left) — Ludo Master classic
  2: "#e63946", // red (PLAYER2, top-left)
  3: "#2ecc71", // green (PLAYER3, top-right)
  4: "#f4c419", // yellow (PLAYER4, bottom-right)
};
export const SEAT_NAME: Record<number, string> = { 1: "PLAYER1", 2: "PLAYER2", 3: "PLAYER3", 4: "PLAYER4" };

// 52 track cells in order, [col,row] on a 15x15 grid (row 0 = top)
export const TRACK: Array<[number, number]> = [
  [1,6],[2,6],[3,6],[4,6],[5,6],
  [6,5],[6,4],[6,3],[6,2],[6,1],[6,0],
  [7,0],
  [8,0],[8,1],[8,2],[8,3],[8,4],[8,5],
  [9,6],[10,6],[11,6],[12,6],[13,6],[14,6],
  [14,7],
  [14,8],[13,8],[12,8],[11,8],[10,8],[9,8],
  [8,9],[8,10],[8,11],[8,12],[8,13],[8,14],
  [7,14],
  [6,14],[6,13],[6,12],[6,11],[6,10],[6,9],
  [5,8],[4,8],[3,8],[2,8],[1,8],[0,8],
  [0,7],
  [0,6],
];

// Home column cells per seat (6 cells, outer → center)
export const HOME_COL: Record<number, Array<[number, number]>> = {
  1: [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
  2: [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
  3: [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
  4: [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],
};

// Base squares (4 spots inside each base) in 15x15 coordinates
export const BASE_SPOTS: Record<number, Array<[number, number]>> = {
  1: [[1.5,10.5],[3.5,10.5],[1.5,12.5],[3.5,12.5]],
  2: [[1.5,1.5],[3.5,1.5],[1.5,3.5],[3.5,3.5]],
  3: [[10.5,1.5],[12.5,1.5],[10.5,3.5],[12.5,3.5]],
  4: [[10.5,10.5],[12.5,10.5],[10.5,12.5],[12.5,12.5]],
};

// Safe squares (start cells + star cells offset +8)
export const SAFE_INDICES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

export function activeSeats(playersCount: number): number[] {
  // 2P → diagonale Blue (bottom-left) ↔ Green (top-right)
  if (playersCount === 2) return [1, 3];
  if (playersCount === 3) return [1, 2, 3];
  return [1, 2, 3, 4];
}

export function rollDice(): number {
  return 1 + Math.floor(Math.random() * 6);
}

export function rollBalancedDice(pawns: Pawn[], seat: number): number {
  // FAIR uniform dice — 1/6 probabilité tsirairay (1..6), tsy misy bias na
  // catch-up. Ny pilalao rehetra dia mahazo chance mitovy hahazo 6 (~16.7%).
  void pawns; void seat;
  return 1 + Math.floor(Math.random() * 6);
 }

// Get absolute track index for a pawn on track, or null if base/home/finished
export function pawnTrackIdx(p: Pawn): number | null {
  if (p.pos >= 1 && p.pos <= 51) {
    return (SEAT_START[p.seat] - 1 + p.pos + 52) % 52;
  }
  return null;
}

// Compute pixel position [col, row] (cell center on 15x15 grid)
export function pawnXY(p: Pawn): [number, number] {
  if (p.pos <= 0) {
    return BASE_SPOTS[p.seat][p.idx];
  }
  if (p.pos >= 52 && p.pos <= 57) {
    if (p.pos === 57) return [7.5, 7.5]; // center
    const c = HOME_COL[p.seat][p.pos - 52];
    return [c[0] + 0.5, c[1] + 0.5];
  }
  const idx = pawnTrackIdx(p)!;
  const c = TRACK[idx];
  return [c[0] + 0.5, c[1] + 0.5];
}

// Returns indices of pawns (within seat) that can move
export function legalMoves(pawns: Pawn[], seat: number, dice: number): number[] {
  const seatPawns = pawns.filter((p) => p.seat === seat);
  const moves: number[] = [];
  for (const p of seatPawns) {
    if (p.pos <= 0) {
      if (dice === 6) moves.push(p.idx);
    } else if (p.pos >= 1 && p.pos < 57) {
      if (p.pos + dice <= 57) moves.push(p.idx);
    }
  }
  return moves;
}

export type ApplyResult = { pawns: Pawn[]; captured: number; finishedPawn: boolean };

export function applyMove(pawns: Pawn[], seat: number, pawnIdx: number, dice: number): ApplyResult {
  const next = pawns.map((p) => ({ ...p }));
  const me = next.find((p) => p.seat === seat && p.idx === pawnIdx)!;
  let captured = 0;
  if (me.pos <= 0) {
    me.pos = 1;
  } else {
    me.pos += dice;
  }
  // Check capture (only if on track and not on safe square)
  const tIdx = pawnTrackIdx(me);
  if (tIdx !== null && !SAFE_INDICES.has(tIdx)) {
    // Pro rule: 2+ pawns of the SAME color on a cell form a "block" — safe.
    const bySeat = new Map<number, Pawn[]>();
    for (const other of next) {
      if (other.seat === me.seat) continue;
      if (pawnTrackIdx(other) === tIdx) {
        const arr = bySeat.get(other.seat) ?? [];
        arr.push(other);
        bySeat.set(other.seat, arr);
      }
    }
    bySeat.forEach((arr) => {
      if (arr.length === 1) {
        arr[0].pos = 0;
        captured += 1;
      }
    });
  }
  const finishedPawn = me.pos === 57;
  return { pawns: next, captured, finishedPawn };
}

export function seatHasFinished(pawns: Pawn[], seat: number): boolean {
  return pawns.filter((p) => p.seat === seat).every((p) => p.pos === 57);
}

// PRO heuristic — score a candidate move for the auto-player.
// Higher score = better move. Used by client auto-play AND by the server
// edge function (logic mirrored). Goals:
//  - Maximize captures and finishes
//  - Get pawns out of base whenever possible
//  - Prefer landing on safe squares / forming blocks with own color
//  - Avoid landing in capture range (1..6 behind) of an opponent
//  - Slightly prefer pawns that are already advanced (push the leader)
export function scoreCandidateMove(
  pawns: Pawn[],
  seat: number,
  pawnIdx: number,
  dice: number,
): number {
  const before = pawns.find((p) => p.seat === seat && p.idx === pawnIdx);
  const res = applyMove(pawns, seat, pawnIdx, dice);
  const after = res.pawns.find((p) => p.seat === seat && p.idx === pawnIdx)!;

  let score = 0;
  score += res.captured * 1000;
  if (res.finishedPawn) score += 500;
  if ((before?.pos ?? 0) <= 0) score += 60; // get out of base
  score += (after.pos ?? 0) * 1.2; // progress

  const tIdx = pawnTrackIdx(after);
  if (tIdx !== null) {
    // Safe square bonus
    if (SAFE_INDICES.has(tIdx)) score += 35;

    // Block formation: another own pawn on the same cell → safe block
    const ownOnCell = res.pawns.filter(
      (p) => p.seat === seat && p !== after && pawnTrackIdx(p) === tIdx,
    ).length;
    if (ownOnCell >= 1) score += 45;

    // Danger penalty: any opponent pawn 1..6 squares behind can capture next turn
    if (!SAFE_INDICES.has(tIdx) && ownOnCell === 0) {
      let danger = 0;
      for (const op of res.pawns) {
        if (op.seat === seat) continue;
        const oIdx = pawnTrackIdx(op);
        if (oIdx === null) continue;
        const diff = (tIdx - oIdx + 52) % 52;
        if (diff >= 1 && diff <= 6) danger += 1;
      }
      score -= danger * 80;
    }
  }
  // Home column → very safe
  if (after.pos >= 52 && after.pos < 57) score += 25;

  return score + Math.random() * 0.5;
}

export function nextSeat(currentSeat: number, playersCount: number, gotSix: boolean, captured: number, consecutiveSixes: number) {
  // bonus turn if rolled 6 (and not 3 in a row) or captured
  const bonus = (gotSix && consecutiveSixes < 3) || captured > 0;
  if (bonus && gotSix && consecutiveSixes >= 3) return { seat: rotate(currentSeat, playersCount), resetSixes: true };
  if (bonus) return { seat: currentSeat, resetSixes: false };
  return { seat: rotate(currentSeat, playersCount), resetSixes: true };
}

function rotate(seat: number, playersCount: number): number {
  const seats = activeSeats(playersCount);
  const i = seats.indexOf(seat);
  return seats[(i + 1) % seats.length];
}

// Variant-aware rotation that uses an explicit seats list (e.g. [1,3] or [2,4] for 2P).
export function nextSeatFromList(currentSeat: number, seats: number[], gotSix: boolean, captured: number, consecutiveSixes: number) {
  const rotateList = (s: number) => {
    const i = seats.indexOf(s);
    return seats[(i + 1) % seats.length];
  };
  const bonus = (gotSix && consecutiveSixes < 3) || captured > 0;
  if (bonus && gotSix && consecutiveSixes >= 3) return { seat: rotateList(currentSeat), resetSixes: true };
  if (bonus) return { seat: currentSeat, resetSixes: false };
  return { seat: rotateList(currentSeat), resetSixes: true };
}