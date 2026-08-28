/* =========================================================
   LUDO — fitsipika ofisialy iraisan'ny client sy ny serveur.
   progress: 0 = yard, 1..51 = outer track, 52..56 = home column,
             57 = tonga ao afovoany (finished).
   ========================================================= */

export type PawnRec = { seat: number; idx: number; pos: number };

/** Entry cell of each seat on the shared 52-cell outer track. */
export const ENTRY_BY_SEAT: Record<number, number> = { 1: 0, 2: 13, 3: 26, 4: 39 };

/** Start cells + star cells — tsy azo hanaovana capture. */
export const SAFE_CELLS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

export const HOME_ENTRY = 51; // last outer step
export const FINISH = 57;

export function outerIdx(seat: number, pos: number): number | null {
  if (pos >= 1 && pos <= HOME_ENTRY) return (ENTRY_BY_SEAT[seat] + pos - 1) % 52;
  return null;
}

/**
 * Outer cells occupied by a BLOCK (2+ pawns of the same seat) belonging to
 * another seat. Ny block dia tsy azo dinganina na hidirana (fitsipika ofisialy).
 */
export function blockedCellsFor(pawns: PawnRec[], seat: number): Set<number> {
  const count = new Map<string, number>();
  for (const p of pawns) {
    if (p.seat === seat) continue;
    const oi = outerIdx(p.seat, p.pos);
    if (oi == null) continue;
    const k = `${p.seat}:${oi}`;
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  const blocked = new Set<number>();
  count.forEach((n, k) => { if (n >= 2) blocked.add(Number(k.split(":")[1])); });
  return blocked;
}

/** Marina raha azo ampandehanina io pion io amin'io isa io. */
export function canMovePawn(pawns: PawnRec[], seat: number, idx: number, dice: number): boolean {
  const pw = pawns.find((p) => p.seat === seat && p.idx === idx);
  if (!pw) return false;
  if (dice < 1 || dice > 6) return false;
  if (pw.pos >= FINISH) return false;

  const blocked = blockedCellsFor(pawns, seat);

  // Mivoaka ny trano: mila 6, ary tsy azo raha voatampina ny entry cell.
  if (pw.pos === 0) {
    if (dice !== 6) return false;
    const entry = outerIdx(seat, 1);
    return entry == null || !blocked.has(entry);
  }

  const target = pw.pos + dice;
  if (target > FINISH) return false; // mila isa marina hidirana ao afovoany

  // Tsy mahazo mandingana block ny lalana rehetra andalovana.
  for (let step = pw.pos + 1; step <= Math.min(target, HOME_ENTRY); step++) {
    const oi = outerIdx(seat, step);
    if (oi != null && blocked.has(oi)) return false;
  }
  return true;
}

export function legalMovesFor(pawns: PawnRec[], seat: number, dice: number): number[] {
  return pawns
    .filter((p) => p.seat === seat && canMovePawn(pawns, seat, p.idx, dice))
    .map((p) => p.idx);
}

export type MoveResult = {
  pawns: PawnRec[];
  captured: boolean;
  finished: boolean;
  extraTurn: boolean;
  won: boolean;
};

/** Mampihatra ny move (miaraka amin'ny capture) ary mamerina state vaovao. */
export function applyMove(pawns: PawnRec[], seat: number, idx: number, dice: number): MoveResult | null {
  if (!canMovePawn(pawns, seat, idx, dice)) return null;
  const next = pawns.map((p) => ({ ...p }));
  const pw = next.find((p) => p.seat === seat && p.idx === idx)!;
  pw.pos = pw.pos === 0 ? 1 : pw.pos + dice;

  let captured = false;
  const oi = outerIdx(seat, pw.pos);
  if (oi != null && !SAFE_CELLS.has(oi)) {
    for (const op of next) {
      if (op.seat === seat) continue;
      if (outerIdx(op.seat, op.pos) === oi) { op.pos = 0; captured = true; }
    }
  }
  const finished = pw.pos === FINISH;
  const won = next.filter((p) => p.seat === seat).every((p) => p.pos === FINISH);
  return { pawns: next, captured, finished, extraTurn: dice === 6 || captured || finished, won };
}

/** AI/watchdog: misafidy ny move tsara indrindra. */
export function chooseBestMove(pawns: PawnRec[], seat: number, dice: number): number | null {
  const opts = legalMovesFor(pawns, seat, dice);
  if (!opts.length) return null;
  let best = -Infinity;
  let choice = opts[0];
  for (const i of opts) {
    const res = applyMove(pawns, seat, i, dice);
    if (!res) continue;
    const cur = pawns.find((p) => p.seat === seat && p.idx === i)!;
    const after = res.pawns.find((p) => p.seat === seat && p.idx === i)!;
    let score = after.pos;
    if (res.captured) score += 90;
    if (res.finished) score += 100;
    if (after.pos > HOME_ENTRY) score += 40;   // tafiditra amin'ny home column
    if (cur.pos === 0) score += 25;            // mamoaka pion vaovao
    const oi = outerIdx(seat, after.pos);
    if (oi != null && SAFE_CELLS.has(oi)) score += 15;
    // Sazy raha tavela amin'ny toerana azo tratrarina
    if (oi != null && !SAFE_CELLS.has(oi)) {
      for (const op of res.pawns) {
        if (op.seat === seat) continue;
        const ooi = outerIdx(op.seat, op.pos);
        if (ooi == null) continue;
        const gap = (oi - ooi + 52) % 52;
        if (gap >= 1 && gap <= 6) score -= 12;
      }
    }
    if (score > best) { best = score; choice = i; }
  }
  return choice;
}

export function nextSeatOf(seats: number[], seat: number): number {
  const i = seats.indexOf(seat);
  if (i < 0) return seats[0];
  return seats[(i + 1) % seats.length];
}

/* =========================================================
   Dés MIFANDANJA (2P / 3P / 4P)
   Mitovy ny tahan'ny fandresena — tsy misy mpilalao mijanona
   ela be ao an-trano noho ny tsy fahazoana 6.
   ========================================================= */

function weightedPick(w: number[]): number {
  const total = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return i + 1;
  }
  return 6;
}

/** Isa (1..6) mifandanja arakaraka ny toe-javatra misy ny mpilalao. */
export function rollBalancedDice(pawns: PawnRec[], seat: number, seats: number[]): number {
  const w = [1, 1, 1, 1, 1, 1]; // uniform base

  const mine = pawns.filter((p) => p.seat === seat);
  const myOut = mine.filter((p) => p.pos > 0).length;
  const myProgress = mine.reduce((a, p) => a + p.pos, 0);

  const others = seats.filter((s) => s !== seat);
  const otherProgress = others.map((s) =>
    pawns.filter((p) => p.seat === s).reduce((a, p) => a + p.pos, 0),
  );
  const avgOther = otherProgress.length
    ? otherProgress.reduce((a, b) => a + b, 0) / otherProgress.length
    : 0;
  const bestOther = otherProgress.length ? Math.max(...otherProgress) : 0;
  const allOutOthers = others.every((s) =>
    pawns.filter((p) => p.seat === s).every((p) => p.pos > 0),
  );

  // 1) Tsy misy pion mivoaka mihitsy → tokony ho azo mora ny 6.
  if (myOut === 0) {
    w[5] += allOutOthers ? 2.6 : 1.6;
  } else if (myOut === 1 && mine.length - myOut >= 2) {
    w[5] += 0.7;
  }

  // 2) Fandanjana arakaraka ny elanelana (mitovy ny fomba fiasa na 2P/3P/4P).
  const gap = bestOther - myProgress;
  if (gap > 25) {
    // Tara be → isa avo matetika kokoa.
    w[5] += 0.8; w[4] += 0.5; w[3] += 0.3;
  } else if (gap > 10) {
    w[5] += 0.35; w[4] += 0.2;
  } else if (myProgress - avgOther > 25) {
    // Mialoha be → ahena kely ny 6 mba hifandanja ny lalao.
    w[5] = Math.max(0.45, w[5] - 0.45);
    w[4] = Math.max(0.6, w[4] - 0.25);
  }

  return weightedPick(w);
}

