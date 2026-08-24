import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type Room = {
  id: string;
  player1_id: string;
  player2_id?: string | null;
  player3_id?: string | null;
  stake: number;
  created_at: string;
  game_mode?: string | null;
  players_count?: number | null;
  status?: string;
  _name?: string;
};

const EXPIRY_MS = 2 * 60 * 1000;

export function seatsOf(g: Room) {
  const total = Number(g.players_count ?? 2);
  const filled = [g.player1_id, g.player2_id, g.player3_id].filter(Boolean).length;
  return { total, filled };
}

/**
 * Salles Domino vonona — mipoitra avy hatrany (temps réel) eo amin'ny fenêtre
 * chat: menamena mihetsiketsika, misy statut mazava "2P 1/2" na "3P 2/3",
 * ary azo idirana avy hatrany.
 */
export default function LiveDominoRooms() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [joining, setJoining] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("games")
      .select("id, player1_id, player2_id, player3_id, stake, created_at, game_mode, players_count, status")
      .or("status.eq.waiting,and(status.eq.in_progress,player3_id.is.null)")
      .order("created_at", { ascending: true })
      .limit(40);
    const now = Date.now();
    const open = ((data ?? []) as Room[]).filter((g) => {
      const pc = Number(g.players_count ?? 2);
      const age = now - new Date(g.created_at).getTime();
      if (age > EXPIRY_MS && g.status === "waiting") return false;
      if ([g.player1_id, g.player2_id, g.player3_id].includes(user.id)) return false;
      if (pc === 2) return g.status === "waiting" && !g.player2_id;
      return !g.player3_id && (g.status === "waiting" || g.status === "in_progress");
    });
    const ids = Array.from(new Set(open.map((g) => g.player1_id)));
    const names: Record<string, string> = {};
    if (ids.length) {
      const { data: ps } = await supabase.rpc("get_public_profiles" as any, { _ids: ids });
      (ps ?? []).forEach((p: any) => { names[p.user_id] = p.mvola_name; });
    }
    setRooms(open.map((g) => ({ ...g, _name: names[g.player1_id] ?? "Mpilalao" })));
  };

  useEffect(() => {
    if (!user) return;
    load();
    let t: any = null;
    const debounced = () => { if (t) clearTimeout(t); t = setTimeout(load, 250); };
    const ch = supabase
      .channel(`live-rooms-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "games" }, debounced)
      .subscribe();
    const itv = setInterval(() => { if (document.visibilityState === "visible") load(); }, 20000);
    return () => { supabase.removeChannel(ch); clearInterval(itv); if (t) clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const join = async (g: Room) => {
    if (!user || joining) return;
    const { data: w } = await supabase.from("wallets").select("balance").eq("user_id", user.id).single();
    if (Number(w?.balance ?? 0) < Number(g.stake)) return toast.error("Tsy ampy ny solde amin'io mise io");
    setJoining(g.id);
    const pc = Number(g.players_count ?? 2);
    const isThird = pc === 3 && g.player2_id && !g.player3_id;
    const { error } = isThird
      ? await supabase.rpc("join_3p_start" as any, { _game_id: g.id, _player3: user.id })
      : await supabase.rpc("join_and_start_game", { _game_id: g.id, _player2: user.id });
    setJoining(null);
    if (error) {
      load();
      return toast.error(error.message === "already_taken" ? "Efa nalain'ny hafa" : error.message);
    }
    nav(`/game/${g.id}`);
  };

  if (!user || rooms.length === 0) return null;

  return (
    <div className="px-2.5 py-2 hairline-b bg-black/40">
      <p className="eyebrow flex items-center gap-1.5 tracking-[0.18em] mb-1.5">
        <span className="relative inline-flex">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
          <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-70" />
        </span>
        🎲 Salles vonona ({rooms.length})
      </p>
      <div className="space-y-1 max-h-24 overflow-y-auto">
        {rooms.map((g) => {
          const { total, filled } = seatsOf(g);
          const mode = (g.game_mode ?? "d120") === "d80" ? "Maty 80" : "Maty 120";
          return (
            <button
              key={g.id}
              onClick={() => join(g)}
              disabled={joining === g.id}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border border-red-500/45 bg-red-600/15 hover:bg-red-600/25 animate-pulse shadow-[0_0_14px_rgba(239,68,68,0.35)] transition active:scale-[0.98]"
            >
              <span className="flex items-baseline gap-1.5 min-w-0">
                <span className="font-display text-[12px] font-extrabold text-red-200 truncate">{g._name}</span>
                <span className="text-[10px] font-bold text-red-100/80 tabular-nums shrink-0">
                  {total}P {filled}/{total} · {Number(g.stake).toLocaleString("fr-FR")} Ar · {mode}
                </span>
              </span>
              {joining === g.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-red-200 shrink-0" />
              ) : (
                <span className="text-[10px] font-extrabold text-red-100 shrink-0">Hiditra ▶</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
