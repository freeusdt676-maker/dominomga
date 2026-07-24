export type DominoGameMode = "d120" | "d80" | "hand";

export const DOMINO_TARGET_BY_MODE: Record<DominoGameMode, number> = {
  d120: 120,
  d80: 80,
  hand: 120,
};

export type DominoTileLike = [number, number] | readonly [number, number];

export function getDominoTarget(mode?: string | null): number {
  if (mode === "d80") return DOMINO_TARGET_BY_MODE.d80;
  return DOMINO_TARGET_BY_MODE.d120;
}

export function isDominoGameWin(score: number, mode?: string | null): boolean {
  return Number(score ?? 0) >= getDominoTarget(mode);
}

export function getDominoSoloThreshold(mode?: string | null): number {
  return mode === "d80" ? 40 : 60;
}

export function areDominoOpponentScoresZero(
  opponentScores: Array<number | string | null | undefined>,
): boolean {
  return opponentScores.every((score) => Number(score ?? 0) === 0);
}

export function isDominoSoloWin(
  score: number,
  mode?: string | null,
  opponentScores: Array<number | string | null | undefined> = [],
): boolean {
  return Number(score ?? 0) >= getDominoSoloThreshold(mode)
    && areDominoOpponentScoresZero(opponentScores);
}

export function isDominoDoubleSixOut(lastTile?: DominoTileLike | null, points = 0): boolean {
  return !!lastTile
    && lastTile[0] === 6
    && lastTile[1] === 6
    && Number(points ?? 0) > 0;
}

// LOW-TILE KNOCKOUT: raha lany vato ny mpandresy ary ny vato rehetra sisa
// amin'ny mpanohitra dia ao anatin'ny { [0|0], [0|1] } ihany (ohatra 2P: [0|0]
// na [0|1]; 3P: B=[0|0] ary C=[0|1]) → mandresy avy hatrany ny lalao.
export function isDominoLowTileKnockout(
  opponentHands: Array<Array<DominoTileLike> | null | undefined>,
): boolean {
  const hands = opponentHands.map((h) => h ?? []);
  if (hands.length === 0) return false;
  // Tsy maintsy mbola manana vato daholo ny mpanohitra rehetra (raha lany
  // koa izy ireo dia tsy mihatra ilay fitsipika).
  if (hands.some((h) => h.length === 0)) return false;
  const allowed = (t: DominoTileLike) => {
    const a = t[0];
    const b = t[1];
    return (a === 0 && b === 0) || (a === 0 && b === 1) || (a === 1 && b === 0);
  };
  return hands.every((h) => h.every(allowed));
}

// TOUR NAHAVOA 40+: raha nahazo 40 isa mihoatra ao anatin'ny TOUR TOKANA iray
// (fa tsy cumul) dia mandresy avy hatrany ny lalao. Mihatra amin'ny D80 sy
// D120 mitovy — ny isa AZO AMIN'NY TOUR ihany no jerena.
export function isDominoSingleRoundKO(points: number): boolean {
  return Number(points ?? 0) >= 40;
}

export function getDominoRoundReason(params: {
  winnerName: string;
  mode?: string | null;
  winnerScore: number;
  points: number;
  reasonOverride?: string;
}): string {
  const { winnerName, mode, winnerScore, points, reasonOverride } = params;
  const target = getDominoTarget(mode);

  if (isDominoGameWin(winnerScore, mode)) {
    return `MANDRESY NY LALAO — ${winnerName} tonga ${target}`;
  }

  if (reasonOverride) return reasonOverride;
  if (points > 0) return `Tour vita — ${winnerName} nahazo +${points} isa`;
  return `Tour vita — ${winnerName}`;
}