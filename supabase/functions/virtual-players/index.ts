// Orchestrateur "mpilalao virtuel" — mitantana ny pool 30–50 kaonty
// virtuel: presence (en ligne), famoronana salle, fidirana amin'ny salle
// nataon'ny olona tena izy, ary famatsiam-bola avy amin'ny système.
// TSY misy vola avy amin'ny mpilalao tena izy no lany amin'izy ireo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const POOL_MAX = 50;
const POOL_MIN = 30;
const MIN_LIVE = 5;
const BOT_BALANCE = 500_000;
const STAKES = [500, 1000, 2000, 3000, 5000];
const MODES = ["d80", "d120"];

const FIRST = [
  "Rado", "Tiana", "Fenohasina", "Nirina", "Mamy", "Hery", "Njaka", "Fanjava",
  "Toky", "Lova", "Miora", "Sitraka", "Rija", "Haja", "Onja", "Fifaliana",
  "Tsanta", "Andry", "Faniry", "Tahina", "Nomena", "Zo", "Fitia", "Aina",
  "Soa", "Kanto", "Manda", "Sedra", "Herizo", "Voahangy", "Rivo", "Lalaina",
  "Tojo", "Fandresena", "Mahefa", "Solofo", "Tsiory", "Ando", "Mahery", "Diary",
  "Vonjy", "Domoina", "Fara", "Iharena", "Jaona", "Koto", "Lanto", "Nofy",
  "Patrick", "Riana", "Sahaza", "Tantely", "Valisoa", "Zafy", "Ny Aina", "Tsilavina",
  "Fabrice", "Herilala", "Mialy", "Vero",
];
const LAST = ["R", "Rk", "Rz", "Ny", "Mg", "Jr", "Be", "Za"];

const PREFIX = ["032", "033", "034", "037", "038"];

function rnd<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }
function rndInt(min: number, max: number) { return min + Math.floor(Math.random() * (max - min + 1)); }

function hashSeed(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

// Ora Madagasikara (UTC+3)
function mgNow() {
  const d = new Date(Date.now() + 3 * 3600_000);
  return { h: d.getUTCHours(), m: d.getUTCMinutes() };
}

/** Isan'ny mpilalao virtuel tokony ho en ligne amin'izao fotoana izao. */
function targetOnline(): number {
  const { h, m } = mgNow();
  // Fiovaova mora (tsy fixe) — mihodina isaky ny ~10 minitra.
  const slot = Math.floor(Date.now() / 600_000);
  const wobble = hashSeed(`vp:${slot}`) % (POOL_MAX - POOL_MIN + 1); // 0..20
  const day = POOL_MIN + wobble; // 30..50
  if (h >= 6 && h < 23) return day;
  if (h === 23) {
    // 23:00 → 00:00 : miala tsikelikely
    const ratio = 1 - m / 60;
    return Math.max(MIN_LIVE, Math.round(MIN_LIVE + (day - MIN_LIVE) * ratio));
  }
  if (h >= 0 && h < 5) return MIN_LIVE; // matory
  // 05:00 → 06:00 : mifoha tsikelikely
  const ratio = m / 60;
  return Math.max(MIN_LIVE, Math.round(MIN_LIVE + (day - MIN_LIVE) * ratio));
}

const LEVELS = ["expert", "expert", "expert", "avance", "faible"];

async function ensurePool(supabase: any, existing: any[]) {
  const missing = POOL_MAX - existing.length;
  if (missing <= 0) return 0;
  const usedNames = new Set<string>(existing.map((p: any) => p.name));
  const usedPhones = new Set<string>(existing.map((p: any) => p.phone));
  const toCreate = Math.min(missing, 3);
  let created = 0;
  for (let i = 0; i < toCreate; i += 1) {
    let name = "";
    for (let t = 0; t < 20; t += 1) {
      const c = `${rnd(FIRST)} ${rnd(LAST)}`.slice(0, 10).trim();
      if (!usedNames.has(c)) { name = c; break; }
    }
    if (!name) continue;
    let phone = "";
    for (let t = 0; t < 20; t += 1) {
      const c = `${rnd(PREFIX)}${rndInt(1000000, 9999999)}`;
      if (!usedPhones.has(c)) { phone = c; break; }
    }
    if (!phone) continue;
    const email = `vp.${crypto.randomUUID().slice(0, 12)}@virtual.local`;
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: crypto.randomUUID(),
      email_confirm: true,
      user_metadata: {
        mvola_name: name,
        phone,
        birth_date: "1995-01-01",
        gender: Math.random() < 0.5 ? "male" : "female",
      },
    });
    if (error || !data?.user) continue;
    const uid = data.user.id;
    const { error: insErr } = await supabase
      .from("virtual_players")
      .insert({ user_id: uid, name, phone, level: rnd(LEVELS) });
    if (insErr) continue;
    usedNames.add(name);
    usedPhones.add(phone);
    await supabase.rpc("virtual_topup", { _user: uid, _min: BOT_BALANCE });
    created += 1;
  }
  return created;
}


async function syncPresence(supabase: any, players: any[], busyIds: Set<string>) {
  const target = targetOnline();
  const online = players.filter((p) => p.online);
  const offline = players.filter((p) => !p.online);
  if (online.length < target) {
    const need = Math.min(target - online.length, offline.length);
    // Miditra tsikelikely (2–4 isaky ny tick) mba tsy hisy "poka" tampoka.
    const batch = offline.sort(() => Math.random() - 0.5).slice(0, Math.min(need, rndInt(2, 4)));
    if (batch.length) {
      const ids = batch.map((p) => p.user_id);
      await supabase.from("virtual_players").update({ online: true }).in("user_id", ids);
      await supabase.rpc("virtual_set_online", { _ids: ids, _online: true });
    }
  } else if (online.length > target) {
    // Izay tsy manao lalao ihany no afaka miala (mahavita ny lalao aloha).
    const free = online.filter((p) => !busyIds.has(p.user_id));
    const batch = free.sort(() => Math.random() - 0.5).slice(0, Math.min(online.length - target, rndInt(1, 3)));
    if (batch.length) {
      const ids = batch.map((p) => p.user_id);
      await supabase.from("virtual_players").update({ online: false }).in("user_id", ids);
      await supabase.rpc("virtual_set_online", { _ids: ids, _online: false });
    }
  }
  // Heartbeat: tazomina "en ligne" ny presence
  const stillOnline = players.filter((p) => p.online).map((p) => p.user_id);
  if (stillOnline.length) await supabase.rpc("virtual_set_online", { _ids: stillOnline, _online: true });
  return target;
}

async function lobbyStep(supabase: any, players: any[], virtualIds: Set<string>) {
  const { data: rooms } = await supabase
    .from("games")
    .select("id, player1_id, player2_id, player3_id, players_count, stake, status, created_at, updated_at, game_mode")
    .in("status", ["waiting", "in_progress"])
    .limit(200);
  const all = rooms ?? [];
  // Fanafoanana: lalao mandeha nefa tsy misy mpilalao tena izy ao — foanana.
  try { await supabase.rpc("purge_bot_only_games"); } catch { /* ignore */ }

  const busy = new Set<string>();
  for (const g of all) {
    [g.player1_id, g.player2_id, g.player3_id].forEach((id: string | null) => { if (id) busy.add(id); });
  }
  const freeOnline = players.filter((p) => p.online && !busy.has(p.user_id));

  // 1) Fidirana amin'ny salle misokatra (na an'olona na an'ny virtuel)
  const open = all.filter((g) => {
    const pc = Number(g.players_count ?? 2);
    if (pc === 2) return g.status === "waiting" && !g.player2_id;
    return !g.player3_id && (g.status === "waiting" || g.status === "in_progress");
  });
  let joined = 0;
  for (const g of open) {
    if (!freeOnline.length) break;
    const seat = g.player2_id ? 3 : 2;
    const since = new Date(seat === 3 ? (g.updated_at ?? g.created_at) : g.created_at).getTime();
    // 30–60s fiandrasana mba homena vahana ny mpilalao tena izy
    const wait = 30_000 + (hashSeed(`${g.id}:${seat}`) % 30_000);
    // FITSIPIKA: tsy misy lalao mandeha raha tsy misy mpilalao TENA IZY ao.
    // Ka ny bot dia tsy miditra afa-tsy amin'ny salle misy olona tena izy.
    const hasReal = !virtualIds.has(g.player1_id) || (!!g.player2_id && !virtualIds.has(g.player2_id));
    if (!hasReal) continue;
    if (Date.now() - since < wait) continue;

    const cand = freeOnline.find((p) => Number(g.stake) <= BOT_BALANCE && p.user_id !== g.player1_id && p.user_id !== g.player2_id);
    if (!cand) continue;
    await supabase.rpc("virtual_topup", { _user: cand.user_id, _min: BOT_BALANCE });
    const fn = seat === 3 && g.player2_id ? "join_3p_start" : "join_and_start_game";
    const args = seat === 3 && g.player2_id
      ? { _game_id: g.id, _player3: cand.user_id }
      : { _game_id: g.id, _player2: cand.user_id };
    const { error } = await supabase.rpc(fn, args);
    if (!error) {
      joined += 1;
      busy.add(cand.user_id);
      const idx = freeOnline.indexOf(cand);
      if (idx >= 0) freeOnline.splice(idx, 1);
    }
  }

  // 2) Fitantanana ny SALLE MISOKATRA: tsy latsaka ny 5 foana ny lobby vonona.
  const LIVE_MIN = 5;
  const LIVE_MAX = 10;
  const OPEN_MIN = 5;
  const liveAll = all.filter((g) => g.status === "waiting" || g.status === "in_progress");
  const realLive = liveAll.filter((g) => !virtualIds.has(g.player1_id));
  const virtualWaiting = all.filter((g) => g.status === "waiting" && virtualIds.has(g.player1_id));
  const liveCount = liveAll.length;
  // Salle mbola azo idirana (misy toerana malalaka)
  const openNow = all.filter((g) => {
    const pc = Number(g.players_count ?? 2);
    if (pc === 2) return g.status === "waiting" && !g.player2_id;
    return !g.player3_id && (g.status === "waiting" || g.status === "in_progress");
  }).length;

  let created = 0;
  const need = Math.max(OPEN_MIN - openNow, liveCount < LIVE_MIN ? LIVE_MIN - liveCount : 0);
  for (let i = 0; i < Math.min(need, 3); i += 1) {
    const host = freeOnline[i];
    if (!host) break;
    const stake = rnd(STAKES);
    await supabase.rpc("virtual_topup", { _user: host.user_id, _min: BOT_BALANCE });
    const { error } = await supabase.from("games").insert({
      player1_id: host.user_id,
      stake,
      status: "waiting",
      game_mode: rnd(MODES),
      players_count: Math.random() < 0.7 ? 2 : 3,
    });
    if (!error) { created += 1; busy.add(host.user_id); }
  }

  // 3) Fanadiovana: salle virtuel ela loatra (>8 min) na mihoatra ny fetra —
  //    fa tsy mamela ny salle misokatra ho latsaka ny 5.
  const removable = Math.max(0, openNow + created - OPEN_MIN);
  const stale = virtualWaiting
    .filter((g) => !g.player2_id && Date.now() - new Date(g.created_at).getTime() > 8 * 60_000)
    .slice(0, removable);
  const surplusCount = Math.max(
    0,
    Math.min(removable - stale.length, Math.max(0, liveCount - LIVE_MAX) + Math.max(0, realLive.length - LIVE_MIN)),
  );
  const surplus = virtualWaiting
    .filter((g) => !g.player2_id && !stale.includes(g))
    .slice(0, surplusCount);
  for (const g of [...stale, ...surplus]) {
    await supabase.from("games").delete().eq("id", g.id).eq("status", "waiting");
  }

  return { joined, created, cleaned: stale.length + surplus.length, busy };

}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const started = Date.now();
  const stats = { created: 0, joined: 0, rooms: 0, cleaned: 0, target: 0, online: 0 };
  try {
    // Tick isaky ny 5s mandritra ~50s (cron isaky ny 1 minitra)
    while (Date.now() - started < 50_000) {
      const { data: players } = await supabase
        .from("virtual_players")
        .select("user_id, name, phone, level, online, active")
        .eq("active", true);
      const list = players ?? [];
      if (list.length < POOL_MAX) stats.created += await ensurePool(supabase, list);
      const virtualIds = new Set<string>(list.map((p: any) => p.user_id));
      const res = await lobbyStep(supabase, list, virtualIds);
      stats.joined += res.joined;
      stats.rooms += res.created;
      stats.cleaned += res.cleaned;
      stats.target = await syncPresence(supabase, list, res.busy);
      stats.online = list.filter((p: any) => p.online).length;
      await new Promise((r) => setTimeout(r, 5000));
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e), stats }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify(stats), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
