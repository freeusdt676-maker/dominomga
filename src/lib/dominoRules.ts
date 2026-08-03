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

export function getDominoSoloThreshold(_mode?: string | null): number {
  return 40;
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

// 40 Indray Maka: 40+ points earned in one round ends the match immediately.
export function isDominoFortyInstantWin(points: number): boolean {
  return Number(points ?? 0) >= 40;
}

export const isDominoFortyRound = isDominoFortyInstantWin;

export function getBlockedRoundResult(
  players: Array<{ id: string; pips: number }>,
): { winnerId: string | null; points: number; tied: boolean } {
  if (players.length < 2) return { winnerId: null, points: 0, tied: true };
  const ordered = players
    .map((player) => ({ ...player, pips: Math.max(0, Number(player.pips) || 0) }))
    .sort((a, b) => a.pips - b.pips);
  if (ordered[0].pips === ordered[1].pips) return { winnerId: null, points: 0, tied: true };
  return {
    winnerId: ordered[0].id,
    points: ordered.slice(1).reduce((sum, player) => sum + player.pips, 0),
    tied: false,
  };
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