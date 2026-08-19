// Server-side Ludo watchdog: 10s turn limit. Plays a legal move (or rolls
// & passes) on behalf of any player whose turn has expired, so the game keeps
// moving even if everyone disconnects.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TURN_LIMIT_MS = 10_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Board constants — mirror of client
const ENTRY: Record<number, number> = { 1: 0, 2: 13, 3: 26, 4: 39 };
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

type PawnRec = { seat: number; idx: number; pos: number };

const HOME_ENTRY = 51;
const FINISH = 57;

function outerIndex(seat: number, pos: number): number | null {
  if (pos >= 1 && pos <= HOME_ENTRY) return (ENTRY[seat] + pos - 1) % 52;
  return null;
}

/** Cells held by a block (2+ pawns of another seat) — impassable. */
function blockedCellsFor(pawns: PawnRec[], seat: number): Set<number> {
  const count = new Map<string, number>();
  for (const p of pawns) {
    if (p.seat === seat) continue;
    const oi = outerIndex(p.seat, p.pos);
    if (oi == null) continue;
    const k = `${p.seat}:${oi}`;
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  const blocked = new Set<number>();
  count.forEach((n, k) => { if (n >= 2) blocked.add(Number(k.split(":")[1])); });
  return blocked;
}

function canMovePawn(pawns: PawnRec[], seat: number, idx: number, dice: number): boolean {
  const pw = pawns.find((p) => p.seat === seat && p.idx === idx);
  if (!pw || dice < 1 || dice > 6 || pw.pos >= FINISH) return false;
  const blocked = blockedCellsFor(pawns, seat);
  if (pw.pos === 0) {
    if (dice !== 6) return false;
    const entry = outerIndex(seat, 1);
    return entry == null || !blocked.has(entry);
  }
  const target = pw.pos + dice;
  if (target > FINISH) return false;
  for (let step = pw.pos + 1; step <= Math.min(target, HOME_ENTRY); step++) {
    const oi = outerIndex(seat, step);
    if (oi != null && blocked.has(oi)) return false;
  }
  return true;
}

function legalMoves(pawns: PawnRec[], seat: number, dv: number): number[] {
  return pawns.filter((p) => p.seat === seat && canMovePawn(pawns, seat, p.idx, dv)).map((p) => p.idx);
}

function applyMove(pawns: PawnRec[], seat: number, idx: number, dice: number) {
  if (!canMovePawn(pawns, seat, idx, dice)) return null;
  const next = pawns.map((p) => ({ ...p }));
  const pw = next.find((p) => p.seat === seat && p.idx === idx)!;
  pw.pos = pw.pos === 0 ? 1 : pw.pos + dice;
  let captured = false;
  const oi = outerIndex(seat, pw.pos);
  if (oi != null && !SAFE.has(oi)) {
    for (const op of next) {
      if (op.seat === seat) continue;
      if (outerIndex(op.seat, op.pos) === oi) { op.pos = 0; captured = true; }
    }
  }
  const finished = pw.pos === FINISH;
  const won = next.filter((p) => p.seat === seat).every((p) => p.pos === FINISH);
  return { pawns: next, captured, finished, extraTurn: dice === 6 || captured || finished, won };
}

function botChoose(pawns: PawnRec[], seat: number, dice: number): number | null {
  const opts = legalMoves(pawns, seat, dice);
  if (!opts.length) return null;
  let best = -Infinity, choice = opts[0];
  for (const i of opts) {
    const res = applyMove(pawns, seat, i, dice);
    if (!res) continue;
    const cur = pawns.find((p) => p.seat === seat && p.idx === i)!;
    const after = res.pawns.find((p) => p.seat === seat && p.idx === i)!;
    let score = after.pos;
    if (res.captured) score += 90;
    if (res.finished) score += 100;
    if (after.pos > HOME_ENTRY) score += 40;
    if (cur.pos === 0) score += 25;
    const oi = outerIndex(seat, after.pos);
    if (oi != null && SAFE.has(oi)) score += 15;
    if (oi != null && !SAFE.has(oi)) {
      for (const op of res.pawns) {
        if (op.seat === seat) continue;
        const ooi = outerIndex(op.seat, op.pos);
        if (ooi == null) continue;
        const gap = (oi - ooi + 52) % 52;
        if (gap >= 1 && gap <= 6) score -= 12;
      }
    }
    if (score > best) { best = score; choice = i; }
  }
  return choice;
}

function nextSeat(seats: number[], seat: number): number {
  const i = seats.indexOf(seat);
  return seats[(i + 1) % seats.length];
}

function userIdBySeat(g: any, seat: number): string | null {
  const seats: number[] = g.seat_assignment ?? [];
  const orderedUids = [g.player1_id, g.player2_id, g.player3_id, g.player4_id].filter(Boolean);
  const i = seats.indexOf(seat);
  return i >= 0 ? (orderedUids[i] ?? null) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );
  const cutoff = new Date(Date.now() - TURN_LIMIT_MS).toISOString();
  const { data: games, error } = await sb.from("ludo_games")
    .select("*").eq("status", "in_progress")
    .lt("turn_started_at", cutoff).limit(20);
  if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: corsHeaders });

  const results: any[] = [];
  for (const g of games ?? []) {
    try {
      const seat = Number(g.current_turn_seat);
      const seats: number[] = g.seat_assignment ?? [1, 2, 3, 4];
      const pawns: PawnRec[] = (g.pawns ?? []).slice();
      let dice = Number(g.last_dice ?? 0);
      const cs = Number(g.consecutive_sixes ?? 0);

      if (!g.dice_rolled) {
        dice = 1 + Math.floor(Math.random() * 6);
        const newSix = dice === 6 ? cs + 1 : 0;
        if (newSix >= 3) {
          await sb.rpc("ludo_update_state", {
            _game_id: g.id, _last_dice: dice, _dice_rolled: false, _consecutive_sixes: 0,
            _current_turn_seat: nextSeat(seats, seat), _turn_started_at: new Date().toISOString(),
          });
          results.push({ id: g.id, action: "three-sixes-skip" });
          continue;
        }
        const legal = legalMoves(pawns, seat, dice);
        if (legal.length === 0) {
          if (dice === 6) {
            await sb.rpc("ludo_update_state", {
              _game_id: g.id, _last_dice: dice, _dice_rolled: false,
              _consecutive_sixes: newSix, _turn_started_at: new Date().toISOString(),
            });
            results.push({ id: g.id, action: "no-move-reroll" });
          } else {
            await sb.rpc("ludo_update_state", {
              _game_id: g.id, _last_dice: dice, _dice_rolled: false, _consecutive_sixes: 0,
              _current_turn_seat: nextSeat(seats, seat), _turn_started_at: new Date().toISOString(),
            });
            results.push({ id: g.id, action: "no-move-pass" });
          }
          continue;
        }
        // Roll only — mark rolled so pick can happen next tick
        await sb.rpc("ludo_update_state", {
          _game_id: g.id, _last_dice: dice, _dice_rolled: true, _consecutive_sixes: newSix,
          _turn_started_at: new Date().toISOString(),
        });
        // Continue in same tick to apply move immediately
      }

      // Pick move
      const pick = botChoose(pawns, seat, dice);
      if (pick == null) {
        await sb.rpc("ludo_update_state", {
          _game_id: g.id, _dice_rolled: false, _consecutive_sixes: 0,
          _current_turn_seat: nextSeat(seats, seat), _turn_started_at: new Date().toISOString(),
        });
        results.push({ id: g.id, action: "no-legal-after-roll" });
        continue;
      }
      const res = applyMove(pawns, seat, pick, dice);
      if (!res) {
        await sb.rpc("ludo_update_state", {
          _game_id: g.id, _dice_rolled: false, _consecutive_sixes: 0,
          _current_turn_seat: nextSeat(seats, seat), _turn_started_at: new Date().toISOString(),
        });
        results.push({ id: g.id, action: "illegal-skip" });
        continue;
      }
      await sb.rpc("ludo_update_state", {
        _game_id: g.id, _pawns: res.pawns, _last_dice: dice,
        _current_turn_seat: res.extraTurn ? seat : nextSeat(seats, seat),
        _dice_rolled: false, _consecutive_sixes: res.extraTurn && dice === 6 ? cs : 0,
        _turn_started_at: new Date().toISOString(),
      });
      if (res.won) {
        const uid = userIdBySeat(g, seat);
        if (uid) await sb.rpc("ludo_settle", { _game_id: g.id, _winner: uid });
      }
      results.push({ id: g.id, action: "auto-move", seat, dice, pick });
    } catch (e) {
      results.push({ id: g.id, error: String(e) });
    }
  }
  return new Response(JSON.stringify({ ok: true, count: results.length, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});