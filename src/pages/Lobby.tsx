import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { STAKE_LEVELS, fmtAr } from "@/lib/constants";
import { ArrowLeft, Loader2, Coins, Users, X } from "lucide-react";
import { toast } from "sonner";

type WaitingGame = {
  id: string; player1_id: string; stake: number; created_at: string;
  _name?: string;
};

export default function Lobby() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [stake, setStake] = useState(STAKE_LEVELS[0]);
  const [waiting, setWaiting] = useState<WaitingGame[]>([]);
  const [myWaiting, setMyWaiting] = useState<WaitingGame | null>(null);
  const [placing, setPlacing] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    // Fallback: raha vao nanomboka (60s farany) misy lalao in_progress dia tonga dia mankany
    const since = new Date(Date.now() - 60_000).toISOString();
    const { data: mine } = await supabase
      .from("games")
      .select("id, updated_at")
      .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
      .eq("status", "in_progress")
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (mine && mine.length > 0) {
      nav(`/game/${mine[0].id}`);
      return;
    }
    const { data: gs } = await supabase
      .from("games")
      .select("id, player1_id, stake, created_at")
      .eq("status", "waiting")
      .is("player2_id", null)
      .order("created_at", { ascending: true });
    const list = (gs ?? []) as WaitingGame[];
    const ids = Array.from(new Set(list.map((g) => g.player1_id)));
    let nameMap: Record<string, string> = {};
    if (ids.length) {
      const { data: ps } = await supabase.from("profiles").select("user_id, mvola_name").in("user_id", ids);
      (ps ?? []).forEach((p: any) => { nameMap[p.user_id] = p.mvola_name; });
    }
    const enriched = list.map((g) => ({ ...g, _name: nameMap[g.player1_id] ?? "Mpilalao" }));
    setWaiting(enriched.filter((g) => g.player1_id !== user.id));
    setMyWaiting(enriched.find((g) => g.player1_id === user.id) ?? null);
  };

  useEffect(() => {
    if (!user) return;
    load();
    const ch = supabase.channel("lobby-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "games" }, () => load())
      .subscribe();
    const itv = setInterval(load, 2000);
    return () => { supabase.removeChannel(ch); clearInterval(itv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Raha misy mihantsy ny mise nataoko (player2 niditra) → tonga dia mankany amin'ny lalao
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("my-games-rt")
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "games", filter: `player1_id=eq.${user.id}` },
        (p: any) => {
          if (p.new?.status === "in_progress" && p.new?.id) {
            nav(`/game/${p.new.id}`);
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, nav]);

  const placeMise = async () => {
    if (!user) return;
    if (myWaiting) return toast.error("Efa manana mise vonona ianao");
    const { data: w } = await supabase.from("wallets").select("balance").eq("user_id", user.id).single();
    if (Number(w?.balance ?? 0) < stake) return toast.error("Tsy ampy ny solde");
    setPlacing(true);
    const { error } = await supabase.from("games").insert({ player1_id: user.id, stake, status: "waiting" });
    setPlacing(false);
    if (error) return toast.error(error.message);
    toast.success("Vonona — miandry mpifanandrina mitovy mise");
    load();
  };

  const cancelMyWaiting = async () => {
    if (!myWaiting) return;
    const { error } = await supabase.rpc("cancel_waiting_game", { _game_id: myWaiting.id });
    if (error) return toast.error(error.message);
    toast("Nesorina");
    load();
  };

  const joinWaiting = async (g: WaitingGame) => {
    if (!user) return;
    const { data: w } = await supabase.from("wallets").select("balance").eq("user_id", user.id).single();
    if (Number(w?.balance ?? 0) < Number(g.stake)) return toast.error("Tsy ampy ny solde amin'io mise io");
    setJoining(g.id);
    const { error } = await supabase.rpc("join_and_start_game", { _game_id: g.id, _player2: user.id });
    setJoining(null);
    if (error) return toast.error(error.message === "already_taken" ? "Efa nalain'ny hafa" : error.message);
    nav(`/game/${g.id}`);
  };

  const grouped = useMemo(() => {
    const m: Record<number, WaitingGame[]> = {};
    waiting.forEach((g) => { (m[Number(g.stake)] = m[Number(g.stake)] || []).push(g); });
    return m;
  }, [waiting]);

  return (
    <div className="min-h-screen felt-bg">
      <header className="p-4 flex items-center gap-3 border-b border-primary/20">
        <Button variant="ghost" size="icon" onClick={() => nav("/")}><ArrowLeft /></Button>
        <h1 className="font-display text-xl font-bold gold-text">Lobby Domino</h1>
      </header>

      <div className="p-4 max-w-lg mx-auto space-y-4">
        <div className="card-felt rounded-2xl p-4">
          <p className="text-sm text-muted-foreground mb-2">Safidio ny mise</p>
          <div className="grid grid-cols-5 gap-2">
            {STAKE_LEVELS.map((s) => (
              <button key={s} onClick={() => setStake(s)}
                className={`py-2 rounded-lg text-xs font-semibold border ${stake === s ? "btn-gold border-primary" : "border-primary/30 text-foreground"}`}>
                {s/1000}k
              </button>
            ))}
          </div>
          <p className="mt-3 text-center text-sm">
            Mise: <b className="gold-text">{fmtAr(stake)}</b> · Gain net: <b className="gold-text">{fmtAr(Math.round(stake*1.8))}</b>
          </p>
          {myWaiting ? (
            <div className="mt-3 p-3 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-between">
              <div className="text-sm">
                <p className="font-bold gold-text">Misy mise vonona ianao</p>
                <p className="text-xs text-muted-foreground">Mise: {fmtAr(myWaiting.stake)} — miandry mpifanandrina</p>
              </div>
              <Button size="sm" variant="destructive" onClick={cancelMyWaiting}><X className="w-4 h-4" /></Button>
            </div>
          ) : (
            <Button className="btn-gold w-full mt-3" onClick={placeMise} disabled={placing}>
              {placing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Coins className="w-4 h-4 mr-2" />}
              Place mise {fmtAr(stake)}
            </Button>
          )}
        </div>

        <div className="card-felt rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-primary" />
            <h3 className="font-display font-bold">Mpilalao vonona ({waiting.length})</h3>
          </div>
          <p className="text-[11px] text-muted-foreground mb-2">Tsindrio izay mitovy mise aminao — izay malaky no tafiditra.</p>
          {waiting.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">Tsy mbola misy vonona</p>}
          <div className="space-y-3">
            {Object.keys(grouped).sort((a,b) => Number(a)-Number(b)).map((k) => (
              <div key={k}>
                <p className="text-[10px] uppercase text-muted-foreground mb-1">Mise {fmtAr(Number(k))}</p>
                <div className="space-y-1.5">
                  {grouped[Number(k)].map((g) => {
                    const same = Number(g.stake) === stake;
                    return (
                      <button
                        key={g.id}
                        onClick={() => joinWaiting(g)}
                        disabled={joining === g.id}
                        className={`w-full flex items-center justify-between p-3 rounded-lg border transition ${same ? "border-primary bg-primary/5 hover:bg-primary/10" : "border-primary/20 bg-muted/20 hover:bg-muted/30"}`}
                      >
                        <div className="text-left">
                          <p className="font-bold text-sm">{g._name}</p>
                          <p className="text-[11px] text-muted-foreground">mise <b className="gold-text">{fmtAr(g.stake)}</b> · vonona</p>
                        </div>
                        {joining === g.id ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                          <span className="text-xs font-bold text-primary">Hiditra ▶</span>
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
