// Server-side Pétanque auto-throw: when 20s expire on a turn, the backend
// computes a deterministic throw straight toward the cochonnet, simulates the
// physics (EXACT mirror of src/lib/petanqueEngine.ts), then commits the final
// state. Triggered every 5s by pg_cron. Idempotent via fresh row checks.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TURN_LIMIT_MS = 20_000;
const SKEW_MS = 500;
const TARGET_SCORE = 13;
const FANI_SCORE = 6;
const BALLS_PER_PLAYER = 4;

// ---- Constants identiques au moteur client (src/lib/petanqueEngine.ts) ----
const COURT = {
  minX: -1.8, maxX: 1.8, minZ: -1.4, maxZ: 10.8,
  ballR: 0.18, jackR: 0.08,
  friction: 0.978, restitution: 0.55,
  minSpeed: 0.14,
};
const THROW_Z = -1.3;
const JACK_VALID = {
  minZ: THROW_Z + 6,
  maxZ: Math.min(COURT.maxZ - 0.5, THROW_Z + 10),
  maxAbsX: COURT.maxX - 0.5,
};

type Ball = { id: string; owner: "p1" | "p2"; x: number; z: number; vx: number; vz: number };
type Jack = { x: number; z: number };

function isJackOnCourt(j: Jack | null): boolean {
  if (!j) return false;
  return j.x >= COURT.minX && j.x <= COURT.maxX && j.z >= COURT.minZ && j.z <= COURT.maxZ;
}
function randomValidJack(): Jack {
  return {
    x: (Math.random() - 0.5) * 2 * (JACK_VALID.maxAbsX * 0.7),
    z: JACK_VALID.minZ + Math.random() * (JACK_VALID.maxZ - JACK_VALID.minZ),
  };
}

function distance(a: { x: number; z: number }, b: { x: number; z: number }) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function stepPhysics(balls: Ball[], jack: Jack | null, dt: number): boolean {
  let moving = false;
  for (const b of balls) {
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    const f = Math.pow(COURT.friction, dt * 60);
    b.vx *= f; b.vz *= f;
    const sp = Math.hypot(b.vx, b.vz);
    if (sp < COURT.minSpeed) { b.vx = 0; b.vz = 0; } else moving = true;
  }
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], c = balls[j];
      const dx = c.x - a.x, dz = c.z - a.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const min = COURT.ballR * 2;
      if (d > 0 && d < min) {
        const nx = dx / d, nz = dz / d;
        const overlap = (min - d) / 2;
        a.x -= nx * overlap; a.z -= nz * overlap;
        c.x += nx * overlap; c.z += nz * overlap;
        const dvx = c.vx - a.vx, dvz = c.vz - a.vz;
        const dot = dvx * nx + dvz * nz;
        if (dot < 0) {
          const e = COURT.restitution;
          const imp = -(1 + e) * dot / 2;
          a.vx -= imp * nx; a.vz -= imp * nz;
          c.vx += imp * nx; c.vz += imp * nz;
        }
      }
    }
  }
  if (jack) {
    for (const b of balls) {
      const dx = jack.x - b.x, dz = jack.z - b.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const min = COURT.ballR + COURT.jackR;
      if (d > 0 && d < min) {
        const nx = dx / d, nz = dz / d;
        const overlap = (min - d);
        jack.x += nx * overlap; jack.z += nz * overlap;
        const sp = Math.hypot(b.vx, b.vz);
        jack.x += nx * sp * 0.02; jack.z += nz * sp * 0.02;
        b.vx *= 0.7; b.vz *= 0.7;
        // Pas de clamp: le cochonnet peut sortir → round nul.
      }
    }
  }
  return moving;
}

function detectForfeits(balls: Ball[]): string[] {
  const out: string[] = [];
  for (const b of balls) {
    if (b.x < COURT.minX || b.x > COURT.maxX || b.z < COURT.minZ || b.z > COURT.maxZ) {
      out.push(b.id);
    }
  }
  return out;
}

function computeRoundScore(balls: Ball[], jack: Jack): { winner: "p1" | "p2" | null; points: number } {
  if (!jack || balls.length === 0) return { winner: null, points: 0 };
  const withDist = balls.map(b => ({ owner: b.owner, d: distance(b, jack) })).sort((a, b) => a.d - b.d);
  const winner = withDist[0].owner;
  const opp = winner === "p1" ? "p2" : "p1";
  const oppClosest = withDist.find(x => x.owner === opp);
  if (!oppClosest) return { winner, points: withDist.filter(x => x.owner === winner).length };
  const points = withDist.filter(x => x.owner === winner && x.d < oppClosest.d).length;
  return { winner, points: Math.max(1, points) };
}

function computeRoundOutcome(balls: Ball[], jack: Jack | null) {
  if (!isJackOnCourt(jack)) return { winner: null as "p1" | "p2" | null, points: 0, nul: true };
  const inCourt = balls.filter(
    (b) => b.x >= COURT.minX && b.x <= COURT.maxX && b.z >= COURT.minZ && b.z <= COURT.maxZ,
  );
  if (inCourt.length === 0) return { winner: null as "p1" | "p2" | null, points: 0, nul: true };
  const r = computeRoundScore(inCourt, jack as Jack);
  if (!r.winner || r.points <= 0) return { winner: null as "p1" | "p2" | null, points: 0, nul: true };
  return { winner: r.winner, points: Math.min(BALLS_PER_PLAYER, r.points), nul: false };
}

function nextThrower(
  balls: Ball[], jack: Jack | null,
  remaining: { p1: number; p2: number },
  lastThrower: "p1" | "p2",
): "p1" | "p2" | null {
  if (remaining.p1 <= 0 && remaining.p2 <= 0) return null;
  if (!jack) return lastThrower;
  const sorted = balls.map(b => ({ owner: b.owner, d: distance(b, jack) })).sort((a, b) => a.d - b.d);
  const holder = sorted[0]?.owner ?? null;
  const opp: "p1" | "p2" = holder === "p1" ? "p2" : holder === "p2" ? "p1" : (lastThrower === "p1" ? "p2" : "p1");
  if (remaining[opp] > 0) return opp;
  const other: "p1" | "p2" = opp === "p1" ? "p2" : "p1";
  if (remaining[other] > 0) return other;
  return null;
}

function resolveWinnerId(
  g: { player1_id: string; player2_id: string | null },
  s1: number, s2: number,
): string | null {
  if (s1 >= TARGET_SCORE) return g.player1_id;
  if (s2 >= TARGET_SCORE) return g.player2_id;
  if (s1 >= FANI_SCORE && s2 === 0) return g.player1_id;
  if (s2 >= FANI_SCORE && s1 === 0) return g.player2_id;
  return null;
}

// Mapping identique à runThrow() côté client:
//   speed = 5 + (force/100)^1.25 * 21
function speedFromForce(force: number) {
  const t = Math.max(0, Math.min(1, force / 100));
  return 5 + Math.pow(t, 1.25) * 21;
}
function forceForDistance(dist: number) {
  const targetSpeed = Math.max(5.5, Math.min(26, dist * 1.34));
  const tNorm = Math.pow(Math.max(0, (targetSpeed - 5) / 21), 1 / 1.25);
  return Math.round(Math.max(10, Math.min(100, tNorm * 100)));
}

function simulateThrow(
  baseBalls: Ball[], baseJack: Jack | null,
  thrower: "p1" | "p2", angleDeg: number, force: number,
): { balls: Ball[]; jack: Jack | null } {
  const rad = (angleDeg * Math.PI) / 180;
  const speed = speedFromForce(force);
  const vx = Math.sin(rad) * speed;
  const vz = Math.cos(rad) * speed;
  const ballId = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const newBall: Ball = { id: ballId, owner: thrower, x: 0, z: THROW_Z, vx, vz };
  const balls: Ball[] = [...baseBalls.map(b => ({ ...b, vx: 0, vz: 0 })), newBall];
  const jack: Jack | null = baseJack ? { ...baseJack } : null;
  const dt = 1 / 60;
  for (let i = 0; i < 480; i++) {
    const moving = stepPhysics(balls, jack, dt);
    if (!moving) break;
  }
  const out = detectForfeits(balls);
  return { balls: balls.filter(b => !out.includes(b.id)), jack };
}

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: games, error } = await supabase
    .from("petanque_games")
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
      const phase = g.state?.phase;
      if (phase !== "aim" && phase !== "throw_jack") continue;
      const turnStartMs = g.turn_started_at
        ? new Date(g.turn_started_at).getTime()
        : (g.updated_at ? new Date(g.updated_at).getTime() : 0);
      if (!turnStartMs) continue;
      if (nowMs - turnStartMs < TURN_LIMIT_MS - SKEW_MS) continue;

      const throwSide: "p1" | "p2" | null =
        g.current_turn === g.player1_id ? "p1" :
        g.current_turn === g.player2_id ? "p2" : null;
      if (!throwSide) continue;
      const throwerUid = throwSide === "p1" ? g.player1_id : g.player2_id;
      const jackThrower: "p1" | "p2" = g.state?.jackThrower ?? throwSide;
      const jackThrowerUid = jackThrower === "p1" ? g.player1_id : g.player2_id;

      if (phase === "throw_jack") {
        const { error: rpcErr } = await supabase.rpc("petanque_update_state", {
          _game_id: g.id,
          _state: {
            balls: [],
            jack: randomValidJack(),
            phase: "aim",
            remaining: { p1: BALLS_PER_PLAYER, p2: BALLS_PER_PLAYER },
            lastThrower: throwSide,
            jackThrower: throwSide,
            jackAttempts: 0,
          },
          _current_turn: throwerUid,
          _turn_started_at: new Date().toISOString(),
          _score_p1: g.score_p1,
          _score_p2: g.score_p2,
          _round_number: g.round_number,
        });
        if (rpcErr) throw rpcErr;
        advanced += 1;
        continue;
      }

      // aim phase: throw straight toward the jack
      const jk = g.state?.jack ?? { x: 0, z: 8 };
      const dxJ = jk.x - 0;
      const dzJ = jk.z - THROW_Z;
      const angleDeg = Math.round((Math.atan2(dxJ, dzJ) * 180) / Math.PI);
      const force = forceForDistance(Math.hypot(dxJ, dzJ));

      const prevRemaining = g.state?.remaining ?? { p1: BALLS_PER_PLAYER, p2: BALLS_PER_PLAYER };
      if (prevRemaining[throwSide] <= 0) continue;

      const baseBalls: Ball[] = Array.isArray(g.state?.balls) ? g.state.balls : [];
      const baseJack: Jack | null = g.state?.jack ?? null;
      const sim = simulateThrow(baseBalls, baseJack, throwSide, angleDeg, force);
      const sanitized = sim.balls.map(b => ({ ...b, vx: 0, vz: 0 }));
      const finalJack = sim.jack;
      const remaining = { ...prevRemaining, [throwSide]: Math.max(0, prevRemaining[throwSide] - 1) };

      let newScoreP1 = g.score_p1;
      let newScoreP2 = g.score_p2;
      let newRound = g.round_number;
      let newPhase: "aim" | "settle" | "throw_jack" = "aim";
      let nextTurnUser: string | null = null;
      let newBalls: Ball[] = sanitized;
      let newJack: Jack | null = finalJack;
      let newRemaining = remaining;
      let newJackThrower: "p1" | "p2" = jackThrower;

      // Cochonnet sorti du terrain → round nul, on rejoue le même round.
      if (!isJackOnCourt(finalJack)) {
        const { error: nulErr } = await supabase.rpc("petanque_update_state", {
          _game_id: g.id,
          _state: {
            balls: [], jack: null, phase: "throw_jack",
            remaining: { p1: BALLS_PER_PLAYER, p2: BALLS_PER_PLAYER },
            lastThrower: throwSide, jackThrower, jackAttempts: 0,
          },
          _current_turn: jackThrowerUid,
          _turn_started_at: new Date().toISOString(),
          _score_p1: g.score_p1, _score_p2: g.score_p2, _round_number: g.round_number,
        });
        if (nulErr) throw nulErr;
        advanced += 1;
        continue;
      }

      if (remaining.p1 <= 0 && remaining.p2 <= 0) {
        const r = computeRoundOutcome(sanitized, finalJack);
        if (r.nul) {
          const { error: nulErr } = await supabase.rpc("petanque_update_state", {
            _game_id: g.id,
            _state: {
              balls: [], jack: null, phase: "throw_jack",
              remaining: { p1: BALLS_PER_PLAYER, p2: BALLS_PER_PLAYER },
              lastThrower: throwSide, jackThrower, jackAttempts: 0,
            },
            _current_turn: jackThrowerUid,
            _turn_started_at: new Date().toISOString(),
            _score_p1: g.score_p1, _score_p2: g.score_p2, _round_number: g.round_number,
          });
          if (nulErr) throw nulErr;
          advanced += 1;
          continue;
        }
        if (r.winner === "p1") newScoreP1 += r.points;
        if (r.winner === "p2") newScoreP2 += r.points;
        newRound += 1;
        const winnerId = resolveWinnerId(g, newScoreP1, newScoreP2);

        if (winnerId) {
          const finalState = {
            balls: sanitized, jack: finalJack, phase: "settle" as const,
            remaining, lastThrower: throwSide, jackThrower, jackAttempts: 0,
          };
          const { error: updErr } = await supabase.rpc("petanque_update_state", {
            _game_id: g.id, _state: finalState, _current_turn: null,
            _turn_started_at: new Date().toISOString(),
            _score_p1: newScoreP1, _score_p2: newScoreP2, _round_number: newRound,
          });
          if (updErr) throw updErr;
          const { error: settleErr } = await supabase.rpc("petanque_settle", {
            _game_id: g.id, _winner: winnerId,
          });
          if (settleErr) throw settleErr;
          advanced += 1;
          continue;
        }

        // Next round — round winner throws the jack
        newBalls = [];
        newJack = null;
        newRemaining = { p1: BALLS_PER_PLAYER, p2: BALLS_PER_PLAYER };
        newPhase = "throw_jack";
        newJackThrower = r.winner as "p1" | "p2";
        nextTurnUser = r.winner === "p1" ? g.player1_id : g.player2_id;
      } else {
        const nx = nextThrower(sanitized, finalJack, remaining, throwSide);
        const chosen: "p1" | "p2" = nx ?? (throwSide === "p1" ? "p2" : "p1");
        nextTurnUser = chosen === "p1" ? g.player1_id : g.player2_id;
      }

      const newState = {
        balls: newBalls, jack: newJack, phase: newPhase,
        remaining: newRemaining, lastThrower: throwSide,
        jackThrower: newJackThrower, jackAttempts: 0,
      };
      const { error: upd2Err } = await supabase.rpc("petanque_update_state", {
        _game_id: g.id, _state: newState, _current_turn: nextTurnUser,
        _turn_started_at: new Date().toISOString(),
        _score_p1: newScoreP1, _score_p2: newScoreP2, _round_number: newRound,
      });
      if (upd2Err) throw upd2Err;
      advanced += 1;
    } catch (e) {
      console.error(`petanque autoplay failed for game ${g.id}`, e);
    }
  }

  return new Response(JSON.stringify({ ok: true, scanned: games?.length ?? 0, advanced }), {
    headers: { "Content-Type": "application/json" },
  });
});
