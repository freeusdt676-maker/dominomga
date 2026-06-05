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
  // PRO fairness policy (tena mifandanja):
  // - Baseline: 6 mipoitra matetika ho an'ny tsirairay (fun).
  // - Raha mbola ato anaty trano daholo ny pion ny pilalao IRAY nefa efa
  //   nivoaka na efa tafiditra ny an'ny hafa → quasi-tsy maintsy 6 (tsy ho
  //   tavela mihitsy ilay adverse).
  // - Trailing-catchup: arakaraka ny halaviran-dàlana ny mpitarika no
  //   itombon'ny chance hahazo 6.
  const seatPawns = pawns.filter((p) => p.seat === seat);
  const outCount = seatPawns.filter((p) => p.pos > 0 && p.pos < 57).length;
  const finishedCount = seatPawns.filter((p) => p.pos === 57).length;
  const allInBase = seatPawns.length > 0 && seatPawns.every((p) => p.pos <= 0);

  // Progress totals across opponents (out + finished pawns).
  const otherSeats = Array.from(new Set(pawns.filter((p) => p.seat !== seat).map((p) => p.seat)));
  let leaderFinished = 0;
  let opponentsProgress = 0; // pawns that have left base (anywhere)
  for (const s of otherSeats) {
    const f = pawns.filter((p) => p.seat === s && p.pos === 57).length;
    if (f > leaderFinished) leaderFinished = f;
    opponentsProgress += pawns.filter((p) => p.seat === s && p.pos > 0).length;
  }
  const trailing = leaderFinished - finishedCount;

  // Baseline: 6s appear often for every player.
  const weights = [1, 1, 1, 1, 1, 2.8];

  if (allInBase) {
    // Tena STUCK. Raha efa nivoaka ny adverse → quasi-tsy maintsy 6.
    if (opponentsProgress >= 4) weights[5] = 24;      // very strong rescue
    else if (opponentsProgress >= 2) weights[5] = 14; // strong rescue
    else if (opponentsProgress >= 1) weights[5] = 8;  // moderate
    else weights[5] = 4.5;                             // game just started
  } else if (outCount === 0) {
    weights[5] = 4.5; // finished or in-base only
  }

  if (trailing >= 3) weights[5] = Math.max(weights[5], 5.5);
  else if (trailing >= 2) weights[5] = Math.max(weights[5], 4.2);
  else if (trailing === 1) weights[5] = Math.max(weights[5], 3.4);

  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  let pick = Math.random() * totalWeight;
  for (let face = 1; face <= 6; face += 1) {
    pick -= weights[face - 1];
    if (pick <= 0) return face;
  }
  return 6;
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
    for (const other of next) {
      if (other.seat === me.seat) continue;
      const oIdx = pawnTrackIdx(other);
      if (oIdx === tIdx) {
        other.pos = 0;
        captured += 1;
      }
    }
  }
  const finishedPawn = me.pos === 57;
  return { pawns: next, captured, finishedPawn };
}

export function seatHasFinished(pawns: Pawn[], seat: number): boolean {
  return pawns.filter((p) => p.seat === seat).every((p) => p.pos === 57);
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