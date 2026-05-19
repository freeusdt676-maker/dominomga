import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { STAKE_LEVELS, fmtAr } from "@/lib/constants";
import { ArrowLeft, Loader2, Coins, Users, X } from "lucide-react";
import { toast } from "sonner";
import { sfx } from "@/lib/sfx";

type WaitingGame = {
  id: string; player1_id: string; stake: number; created_at: string;
  players_count: number; player2_id?: string | null; player3_id?: string | null; player4_id?: string | null; status?: string;
  _name?: string;
};

export default function LudoLobby() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [stake, setStake] = useState(STAKE_LEVELS[0]);
  const [playersCount, setPlayersCount] = useState<2 | 3 | 4>(4);
  const [confirmed, setConfirmed] = useState(false);
  const [waiting, setWaiting] = useState<WaitingGame[]>([]);
  const [myWaiting, setMyWaiting] = useState<WaitingGame | null>(null);
  const [placing, setPlacing] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    // Auto-redirect raha efa miditra in_progress
    const { data: mine } = await supabase
      .from("ludo_games" as any)
      .select("id")
      .or(`player1_id.eq.${user.id},player2_id.eq.${user.id},player3_id.eq.${user.id},player4_id.eq.${user.id}`)
      .eq("status", "in_progress")
      .order("updated_at", { ascending: false })
      .limit(1);
    const m: any = mine?.[0];
    if (m?.id) { nav(`/ludo/${m.id}`); return; }

    const { data: gs } = await supabase
      .from("ludo_games" as any)
      .select("id, player1_id, player2_id, player3_id, player4_id, stake, created_at, players_count, status")
      .or("status.eq.waiting,and(status.eq.in_progress,player4_id.is.null)")
      .order("created_at", { ascending: true });
    const list = ((gs ?? []) as unknown) as WaitingGame[];
    const open = list.filter((g) => {
      const pc = Number(g.players_count ?? 4);
      const filled = [g.player1_id, g.player2_id, g.player3_id, g.player4_id].filter(Boolean).length;
      return filled < pc;
    });
    const ids = Array.from(new Set(open.map((g) => g.player1_id)));
    const nameMap: Record<string, string> = {};
    if (ids.length) {
      const { data: ps } = await supabase.from("profiles").select("user_id, mvola_name").in("user_id", ids);
      (ps ?? []).forEach((p: any) => { nameMap[p.user_id] = p.mvola_name; });
    }
    const enriched = open.map((g) => ({ ...g, _name: nameMap[g.player1_id] ?? "Mpilalao" }));
    const me = enriched.find((g) => g.player1_id === user.id) ?? null;
    setMyWaiting(me);
    setWaiting(enriched.filter((g) => ![g.player1_id, g.player2_id, g.player3_id, g.player4_id].includes(user.id)));
  };

  useEffect(() => {
    if (!user) return;
    load();
    let t: any = null;
    const debounced = () => { if (t) clearTimeout(t); t = setTimeout(load, 250); };
    const ch = supabase.channel("ludo-lobby-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "ludo_games", filter: "status=eq.waiting" }, debounced)
      .subscribe();
    const itv = setInterval(load, 5000);
    return () => { supabase.removeChannel(ch); clearInterval(itv); if (t) clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Auto-redirect mahalaky rehefa misy mpifanandrina niditra ny mise nataoko
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("my-ludo-games-rt")
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "ludo_games", filter: `player1_id=eq.${user.id}` },
        (p: any) => {
          if (p.new?.status === "in_progress" && p.new?.id) {
            sfx.notify();
            nav(`/ludo/${p.new.id}`);
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, nav]);

  const placeMise = async () => {
    if (!user || placing) return;
    setPlacing(true);
    // Strict 1-room/user check straight from the DB to defeat double-clicks & stale state.
    const { data: existing } = await supabase
      .from("ludo_games" as any)
      .select("id, status")
      .or(`player1_id.eq.${user.id},player2_id.eq.${user.id},player3_id.eq.${user.id},player4_id.eq.${user.id}`)
      .in("status", ["waiting", "in_progress"])
      .limit(1);
    if (existing && existing.length > 0) {
      setPlacing(false);
      toast.error("Efa manana lalao mandeha ianao — tsy mahazo Room vaovao");
      load();
      return;
    }
    const { data: w } = await supabase.from("wallets").select("balance").eq("user_id", user.id).single();
    if (Number(w?.balance ?? 0) < stake) { setPlacing(false); return toast.error("Tsy ampy ny solde"); }
    // 2P: random variant Maitso vs Manga ([1,3]) NA Mena vs Mavo ([2,4])
    let seat_assignment: number[] | null = null;
    if (playersCount === 2) {
      seat_assignment = Math.random() < 0.5 ? [1, 3] : [2, 4];
    } else if (playersCount === 3) {
      seat_assignment = [1, 2, 3];
    } else {
      seat_assignment = [1, 2, 3, 4];
    }
    const { data: g, error } = await supabase
      .from("ludo_games" as any)
      .insert({ player1_id: user.id, stake, status: "waiting", players_count: playersCount, seat_assignment } as any)
      .select("id")
      .single();
    setPlacing(false);
    if (error || !g) return toast.error(error?.message ?? "Tsy nahomby");
    toast.success("Vonona — miandry mpifanandrina");
    nav(`/ludo/${(g as any).id}`);
  };

  const cancelMyWaiting = async () => {
    if (!myWaiting) return;
    const { error } = await supabase.rpc("ludo_cancel_waiting" as any, { _game_id: myWaiting.id });
    if (error) return toast.error(error.message);
    toast("Nesorina");
    load();
  };

  const joinWaiting = async (g: WaitingGame) => {
    if (!user) return;
    const { data: w } = await supabase.from("wallets").select("balance").eq("user_id", user.id).single();
    if (Number(w?.balance ?? 0) < Number(g.stake)) return toast.error("Tsy ampy ny solde");
    setJoining(g.id);
    const { error } = await supabase.rpc("ludo_join_and_start" as any, { _game_id: g.id, _user: user.id });
    setJoining(null);
    if (error) return toast.error(error.message);
    nav(`/ludo/${g.id}`);
  };

  const grouped = useMemo(() => {
    const m: Record<number, WaitingGame[]> = {};
    waiting.forEach((g) => { (m[Number(g.stake)] = m[Number(g.stake)] || []).push(g); });
    return m;
  }, [waiting]);

  return (
    <div className="min-h-screen ludo-bg">
      <header className="p-4 flex items-center gap-3 border-b border-yellow-500/30">
        <Button variant="ghost" size="icon" onClick={() => nav("/")}><ArrowLeft /></Button>
        <h1 className="font-display text-xl font-bold ludo-title">LUDO MASTER</h1>
      </header>

      <div className="p-4 max-w-lg mx-auto space-y-4">
        <div className="ludo-panel rounded-2xl p-4">
          <p className="text-sm text-yellow-200/80 mb-2">1. Mpilalao</p>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => { setPlayersCount(n as 2 | 3 | 4); setConfirmed(false); }}
                className={`py-3 rounded-lg text-sm font-bold ${playersCount === n ? "ludo-btn" : "ludo-btn-outline"}`}
              >
                {n}P
              </button>
            ))}
          </div>

          <p className="text-sm text-yellow-200/80 mb-2">2. Mise</p>
          <div className="grid grid-cols-5 gap-2 mb-4">
            {STAKE_LEVELS.map((s) => (
              <button key={s} onClick={() => { setStake(s); setConfirmed(false); }}
                className={`py-2 rounded-lg text-xs font-semibold ${stake === s ? "ludo-btn" : "ludo-btn-outline"}`}>
                {s/1000}k
              </button>
            ))}
          </div>

          <p className="text-center text-sm text-yellow-100/90">
            <b>{playersCount}P</b> · Mise <b>{fmtAr(stake)}</b> · Gain <b>{fmtAr(Math.round(stake * 0.9 * playersCount))}</b>
          </p>

          {myWaiting ? (
            <div className="mt-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/40 flex items-center justify-between">
              <div className="text-sm">
                <p className="font-bold text-yellow-200">Misy mise vonona ianao</p>
                <p className="text-xs text-yellow-100/70">Mise: {fmtAr(myWaiting.stake)} — miandry</p>
              </div>
              <Button size="sm" variant="destructive" onClick={cancelMyWaiting}><X className="w-4 h-4" /></Button>
            </div>
          ) : (
            <Button
              className="ludo-btn w-full mt-3"
              onClick={placeMise}
              disabled={placing}
            >
              {placing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Coins className="w-4 h-4 mr-2" />}
              {placing ? "Andraso..." : `3. Confirmer le demande — ${fmtAr(stake)}`}
            </Button>
          )}
        </div>

        <div className="ludo-panel rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-yellow-300" />
            <h3 className="font-display font-bold text-yellow-200">Mpilalao vonona ({waiting.length})</h3>
          </div>
          {waiting.length === 0 && <p className="text-center text-sm text-yellow-100/60 py-6">Tsy mbola misy</p>}
          <div className="space-y-3">
            {Object.keys(grouped).sort((a,b) => Number(a)-Number(b)).map((k) => (
              <div key={k}>
                <p className="text-[10px] uppercase text-yellow-200/60 mb-1">Mise {fmtAr(Number(k))}</p>
                <div className="space-y-1.5">
                  {grouped[Number(k)].map((g) => {
                    const filled = [g.player1_id, g.player2_id, g.player3_id, g.player4_id].filter(Boolean).length;
                    return (
                      <button
                        key={g.id}
                        onClick={() => joinWaiting(g)}
                        disabled={joining === g.id}
                        className="w-full flex items-center justify-between p-3 rounded-lg border border-yellow-500/30 bg-purple-900/30 hover:bg-purple-900/50 transition"
                      >
                        <div className="text-left">
                          <p className="font-bold text-sm text-yellow-100">{g._name}</p>
                          <p className="text-[11px] text-yellow-100/70">
                            <b>{g.players_count}P</b> · {filled}/{g.players_count} · mise <b>{fmtAr(g.stake)}</b>
                          </p>
                        </div>
                        {joining === g.id ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                          <span className="text-xs font-bold text-yellow-300">Hiditra ▶</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}