// Server-side Domino watchdog: prevents permanent hangs.
// Every 2s (via pg_cron), advances the turn of any in_progress Domino game
// whose 20s timer has been expired for at least 10s (i.e. >30s since
// turn_started_at) — guaranteeing rotation even if every player went offline.
// Rotates clockwise (P1→P2→P3→P1). Idempotent: only fires when
// turn_started_at hasn't changed since detection.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HANG_THRESHOLD_MS = 30_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getPlayerIds(g: any): string[] {
  const pc = Number(g?.players_count ?? 2);
  return pc === 3
    ? [g.player1_id, g.player2_id, g.player3_id].filter(Boolean)
    : [g.player1_id, g.player2_id].filter(Boolean);
}

function nextTurnId(g: any, current: string): string {
  const ids = getPlayerIds(g);
  const i = ids.indexOf(current);
  if (i < 0) return ids[0];
  return ids[(i + 1) % ids.length];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const cutoff = new Date(Date.now() - HANG_THRESHOLD_MS).toISOString();
  const { data: games, error } = await supabase
    .from("games")
    .select("id, players_count, player1_id, player2_id, player3_id, current_turn, turn_started_at, status, passes")
    .eq("status", "in_progress")
    .not("current_turn", "is", null)
    .not("turn_started_at", "is", null)
    .lt("turn_started_at", cutoff)
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let advanced = 0;
  for (const g of games ?? []) {
    if (!g.current_turn) continue;
    const nextId = nextTurnId(g, g.current_turn as string);
    if (!nextId || nextId === g.current_turn) continue;
    const { error: upErr, count } = await supabase
      .from("games")
      .update({
        current_turn: nextId,
        turn_started_at: new Date().toISOString(),
        passes: ((g as any).passes ?? 0) + 1,
      }, { count: "exact" })
      .eq("id", g.id)
      .eq("turn_started_at", g.turn_started_at)
      .eq("status", "in_progress");
    if (!upErr && (count ?? 0) > 0) advanced += 1;
  }

  return new Response(JSON.stringify({ scanned: games?.length ?? 0, advanced }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
