// Server-side Ludo auto-play: advances any in_progress game whose 10s turn
// timer has expired — even when all players are offline.
// Invoked every 5 seconds by pg_cron (and harmless if called more often:
// per-game row locking via RPC + idempotent turn checks).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TURN_LIMIT_MS = 10_000;
const SKEW_MS = 500; // fire from 9.5s to tolerate clock skew

type Pawn = { seat: number; idx: number; pos: number };

const SEAT_START: Record<number, number> = { 1: 39, 2: 0, 3: 13, 4: 26 };
const SAFE_INDICES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

function activeSeats(playersCount: number): number[] {
  if (playersCount === 2) return [1, 3];
  if (playersCount === 3) return [1, 2, 3];
  return [1, 2, 3, 4];
}

function pawnTrackIdx(p: Pawn): number | null {
  if (p.pos >= 1 && p.pos <= 51) {
    return (SEAT_START[p.seat] - 1 + p.pos + 52) % 52;
  }
  return null;
}

function legalMoves(pawns: Pawn[], seat: number, dice: number): number[] {
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

function applyMove(pawns: Pawn[], seat: number, pawnIdx: number, dice: number) {
  const next = pawns.map((p) => ({ ...p }));
  const me = next.find((p) => p.seat === seat && p.idx === pawnIdx)!;
  let captured = 0;
  if (me.pos <= 0) me.pos = 1;
  else me.pos += dice;
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
  return { pawns: next, captured, finishedPawn: me.pos === 57 };
}

function seatHasFinished(pawns: Pawn[], seat: number): boolean {
  return pawns.filter((p) => p.seat === seat).every((p) => p.pos === 57);
}

function rollBalancedDice(pawns: Pawn[], seat: number): number {
  // FAIR uniform dice — mirror client ludoEngine.rollBalancedDice.
  void pawns; void seat;
  return 1 + Math.floor(Math.random() * 6);
}

function pickAutoMove(pawns: Pawn[], seat: number, dice: number) {
  const moves = legalMoves(pawns, seat, dice);
  if (!moves.length) return null;
  const ranked = moves
    .map((pawnIdx) => {
      const before = pawns.find((p) => p.seat === seat && p.idx === pawnIdx);
      const res = applyMove(pawns, seat, pawnIdx, dice);
      const after = res.pawns.find((p) => p.seat === seat && p.idx === pawnIdx);
      let score = res.captured * 1000;
      if (res.finishedPawn) score += 500;
      if ((before?.pos ?? 0) <= 0) score += 60;
      score += (after?.pos ?? 0) * 1.2;
      const tIdx = after ? pawnTrackIdx(after) : null;
      if (tIdx !== null && after) {
        if (SAFE_INDICES.has(tIdx)) score += 35;
        const ownOnCell = res.pawns.filter(
          (p) => p.seat === seat && p !== after && pawnTrackIdx(p) === tIdx,
        ).length;
        if (ownOnCell >= 1) score += 45;
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
      if (after && after.pos >= 52 && after.pos < 57) score += 25;
      score += Math.random() * 0.5;
      return { pawnIdx, res, score };
    })
    .sort((a, b) => b.score - a.score);
  return ranked[0] ?? null;
}

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: games, error } = await supabase
    .from("ludo_games")
    .select("*")
    .eq("status", "in_progress")
    .limit(50);
  if (error) {
    console.error("scan error", error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
  }

  const nowMs = Date.now();
  let advanced = 0;

  for (const g of games ?? []) {
    try {
      const turnStartMs = g.turn_started_at
        ? new Date(g.turn_started_at).getTime()
        : (g.updated_at ? new Date(g.updated_at).getTime() : 0);
      if (!turnStartMs) continue;
      if (nowMs - turnStartMs < TURN_LIMIT_MS - SKEW_MS) continue;

      const pawns: Pawn[] = Array.isArray(g.pawns) ? g.pawns : [];
      const liveSeats: number[] =
        Array.isArray(g.seat_assignment) && g.seat_assignment.length
          ? g.seat_assignment
          : activeSeats(g.players_count ?? 4);
      if (!liveSeats.length) continue;

      const currentSeat: number = g.current_turn_seat;
      const rotateSeat = (seat: number) => {
        const i = liveSeats.indexOf(seat);
        return liveSeats[(i + 1) % liveSeats.length];
      };
      const seatToUid = (seat: number): string | null => {
        const slot = liveSeats.indexOf(seat);
        if (slot < 0) return null;
        const players = [g.player1_id, g.player2_id, g.player3_id, g.player4_id];
        return players[slot] ?? null;
      };

      const runRpc = async (payload: Record<string, unknown>) => {
        const { error: rpcErr } = await supabase.rpc("ludo_update_state", payload);
        if (rpcErr) throw rpcErr;
      };

      const resolveMove = async (dice: number, basePawns: Pawn[], rolledSixes: number) => {
        const picked = pickAutoMove(basePawns, currentSeat, dice);
        const nextTurnAt = new Date().toISOString();
        if (!picked) {
          // Pro rule: a 6 with no playable move still grants a re-roll (max 3 sixes).
          const keepSeat = dice === 6 && rolledSixes < 3;
          await runRpc({
            _game_id: g.id,
            _current_turn_seat: keepSeat ? currentSeat : rotateSeat(currentSeat),
            _dice_rolled: false,
            _last_dice: null,
            _consecutive_sixes: keepSeat ? rolledSixes : 0,
            _turn_started_at: nextTurnAt,
          });
          return;
        }
        const { res } = picked;
        if (seatHasFinished(res.pawns, currentSeat)) {
          await runRpc({
            _game_id: g.id,
            _pawns: res.pawns,
            _last_dice: null,
            _dice_rolled: false,
          });
          const winnerUid = seatToUid(currentSeat);
          if (winnerUid) {
            const { error: settleErr } = await supabase.rpc("ludo_settle", {
              _game_id: g.id,
              _winner: winnerUid,
            });
            if (settleErr) throw settleErr;
          }
          return;
        }
        const gotBonus = (dice === 6 && rolledSixes < 3) || res.finishedPawn || res.captured > 0;
        const ns = gotBonus ? currentSeat : rotateSeat(currentSeat);
        const resetSixes = gotBonus ? dice !== 6 : true;
        await runRpc({
          _game_id: g.id,
          _pawns: res.pawns,
          _current_turn_seat: ns,
          _last_dice: null,
          _dice_rolled: false,
          _consecutive_sixes: resetSixes ? 0 : rolledSixes,
          _turn_started_at: nextTurnAt,
        });
      };

      if (!g.dice_rolled) {
        const dice = rollBalancedDice(pawns, currentSeat);
        const rolledSixes = dice === 6 ? (g.consecutive_sixes ?? 0) + 1 : 0;
        if (dice === 6 && (g.consecutive_sixes ?? 0) >= 2) {
          await runRpc({
            _game_id: g.id,
            _last_dice: dice,
            _dice_rolled: false,
            _current_turn_seat: rotateSeat(currentSeat),
            _consecutive_sixes: 0,
            _turn_started_at: new Date().toISOString(),
          });
        } else {
          await resolveMove(dice, pawns, rolledSixes);
        }
      } else {
        await resolveMove(g.last_dice ?? 1, pawns, g.last_dice === 6 ? (g.consecutive_sixes ?? 0) : 0);
      }
      advanced += 1;
    } catch (e) {
      console.error(`autoplay failed for game ${g.id}`, e);
    }
  }

  return new Response(JSON.stringify({ ok: true, scanned: games?.length ?? 0, advanced }), {
    headers: { "Content-Type": "application/json" },
  });
});