// Moteur Domino tsotra: zara 7 piesy isaky ny mpilalao, mametraka raha mifanaraka tendro
export type Tile = [number, number];
export type Placed = { tile: Tile; flipped: boolean };

export function buildDeck(): Tile[] {
  const d: Tile[] = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) d.push([a, b]);
  return d;
}
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function deal() {
  const deck = shuffle(buildDeck());
  const p1 = deck.slice(0, 7);
  const p2 = deck.slice(7, 14);
  const boneyard = deck.slice(14);
  return { p1, p2, boneyard };
}
export function ends(board: Placed[]): { left: number; right: number } | null {
  if (board.length === 0) return null;
  const first = board[0];
  const last = board[board.length - 1];
  const left = first.flipped ? first.tile[1] : first.tile[0];
  const right = last.flipped ? last.tile[0] : last.tile[1];
  return { left, right };
}
export function canPlace(board: Placed[], tile: Tile): "left" | "right" | "either" | null {
  const e = ends(board);
  if (!e) return "either";
  const [a, b] = tile;
  const onLeft = a === e.left || b === e.left;
  const onRight = a === e.right || b === e.right;
  if (onLeft && onRight) return "either";
  if (onLeft) return "left";
  if (onRight) return "right";
  return null;
}
export function place(board: Placed[], tile: Tile, side: "left" | "right"): Placed[] {
  const e = ends(board);
  if (!e) return [{ tile, flipped: false }];
  if (side === "left") {
    // ny atsy havia dia tokony hifanaraka amin'ny tendrony havanana an'ny piesy vaovao
    const flipped = tile[1] !== e.left; // raha b !== left, mila avadika mba ny b ho any havanana
    return [{ tile, flipped }, ...board];
  } else {
    const flipped = tile[0] !== e.right;
    return [...board, { tile, flipped }];
  }
}
export function pipsTotal(hand: Tile[]): number {
  return hand.reduce((s, [a, b]) => s + a + b, 0);
}
export function hasMove(hand: Tile[], board: Placed[]): boolean {
  return hand.some((t) => canPlace(board, t) !== null);
}
