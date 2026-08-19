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
  void points;
  return !!lastTile
    && lastTile[0] === 6
    && lastTile[1] === 6;
}

// DATINANDRO: raha mitovy TSOTRA amin'ny isan'ny andro (1..31) any Antananarivo
// ny isa azo tamin'ny TOUR iray dia mandresy ny lalao avy hatrany.
export function getDominoDayNumber(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Indian/Antananarivo",
    day: "numeric",
  }).format(now);
  return Number(parts);
}

export function isDominoDateWin(points: number, now: Date = new Date()): boolean {
  return Number(points ?? 0) === getDominoDayNumber(now);
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

// Fanazavana MAZAVA ho an'ny mpilalao: sokajy iray ihany no aseho, mifanaraka
// tsara amin'ny antony tena nahafaty ny domy.
export type DominoWinKind = "double6" | "date" | "solo" | "forty" | "target" | "round";

export function getDominoWinKind(params: {
  doubleSix: boolean;
  dateWin: boolean;
  soloWin: boolean;
  fortyRound: boolean;
  targetReached: boolean;
}): DominoWinKind {
  if (params.doubleSix) return "double6";
  if (params.dateWin) return "date";
  if (params.soloWin) return "solo";
  if (params.fortyRound) return "forty";
  if (params.targetReached) return "target";
  return "round";
}

function formatMgDate(now: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Indian/Antananarivo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(now);
}

export function buildDominoWinExplanation(params: {
  kind: DominoWinKind;
  winnerName: string;
  mode?: string | null;
  points: number;
  winnerScore: number;
  dayNum?: number;
  opponents?: Array<{ name: string; pips: number }>;
  now?: Date;
}): string {
  const {
    kind, winnerName, mode, points, winnerScore,
    dayNum = getDominoDayNumber(params.now), opponents = [], now = new Date(),
  } = params;
  const target = getDominoTarget(mode);

  switch (kind) {
    case "double6":
      return `Maty ny domy ${winnerName} doble (6) enina`;
    case "date":
      return `Maty ny domy ${winnerName} nahazo datinandro ${dayNum} androany ${formatMgDate(now)}`;
    case "solo":
      return `Maty ny domy ${winnerName} ${getDominoSoloThreshold(mode)} mandeha irery — vato azo ${points}`;
    case "forty": {
      const detail = opponents.length
        ? `${opponents.map((o) => `${o.name} ${o.pips}`).join(" + ")} = ${points}`
        : `${points}`;
      return `Maty ny domy ${winnerName} 40 indray maka — ${detail}, noho izany mihoatra ny 40 indray maka`;
    }
    case "target":
      return `Maty ny domy ${winnerName} nahazo ny isa ${winnerScore} — tratra ny tanjona ${target} (D${target})`;
    default:
      return points > 0
        ? `Vita ny tour — ${winnerName} nahazo +${points} isa`
        : `Vita ny tour — ${winnerName}`;
  }
}