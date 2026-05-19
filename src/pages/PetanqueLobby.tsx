import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fmtAr } from "@/lib/constants";
import { ArrowLeft, Loader2, Coins, Users, X } from "lucide-react";
import { toast } from "sonner";
import { useThemeClass } from "@/hooks/use-theme-class";

const PETANQUE_STAKES = [1000, 2000, 3000, 5000, 10000];

type WaitingGame = {
  id: string; player1_id: string; stake: number; created_at: string;
  player2_id?: string | null; status?: string; _name?: string;
};

type ResumeGame = { id: string; stake: number };

export default function PetanqueLobby() {
  useThemeClass("petanque");
  const { user } = useAuth();
  const nav = useNavigate();
  const [stake, setStake] = useState(PETANQUE_STAKES[0]);
  const [waiting, setWaiting] = useState<WaitingGame[]>([]);
  const [myWaiting, setMyWaiting] = useState<WaitingGame | null>(null);
  const [activeGame, setActiveGame] = useState<ResumeGame | null>(null);
  const [placing, setPlacing] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const ABANDONED_GAME_KEY = "petanque_abandoned_game_id";

  const load = async () => {
    if (!user) return;
    const abandonedGameId = sessionStorage.getItem(ABANDONED_GAME_KEY);
    const { data: mine } = await supabase
      .from("petanque_games" as any)
      .select("id, stake")
      .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
      .eq("status", "in_progress")
      .order("updated_at", { ascending: false })
      .limit(1);
    const m: any = mine?.find((row: any) => row.id !== abandonedGameId) ?? mine?.[0] ?? null;
    setActiveGame(m ? { id: m.id, stake: Number(m.stake ?? 0) } : null);

    const { data: gs } = await supabase
      .from("petanque_games" as any)
      .select("id, player1_id, player2_id, stake, created_at, status")
      .eq("status", "waiting")
      .order("created_at", { ascending: true });
    const list = ((gs ?? []) as unknown) as WaitingGame[];
    const ids = Array.from(new Set(list.map((g) => g.player1_id)));
    const nameMap: Record<string, string> = {};
    if (ids.length) {
      const { data: ps } = await supabase.from("profiles").select("user_id, mvola_name").in("user_id", ids);
      (ps ?? []).forEach((p: any) => { nameMap[p.user_id] = p.mvola_name; });
    }
    const enriched = list.map((g) => ({ ...g, _name: nameMap[g.player1_id] ?? "Mpilalao" }));
    const me = enriched.find((g) => g.player1_id === user.id) ?? null;
    setMyWaiting(me);
    setWaiting(enriched.filter((g) => g.player1_id !== user.id));
  };

  useEffect(() => {
    if (!user) return;
    load();
    let t: any = null;
    const debounced = () => { if (t) clearTimeout(t); t = setTimeout(load, 250); };
    const ch = supabase.channel("petanque-lobby-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "petanque_games" }, debounced)
      .subscribe();
    const itv = setInterval(load, 5000);
    return () => { supabase.removeChannel(ch); clearInterval(itv); if (t) clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`my-petanque-${user.id}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "petanque_games", filter: `player1_id=eq.${user.id}` },
        (p: any) => {
          if (p.new?.status === "in_progress" && p.new?.id) {
            setActiveGame({ id: p.new.id, stake: Number(p.new.stake ?? 0) });
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const placeMise = async () => {
    if (!user || placing) return;
    setPlacing(true);
    const { data: existing } = await supabase
      .from("petanque_games" as any)
      .select("id")
      .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
      .in("status", ["waiting", "in_progress"])
      .limit(1);
    if (existing && existing.length > 0) {
      setPlacing(false);
      toast.error("Efa manana lalao mandeha ianao");
      load();
      return;
    }
    const { data: w } = await supabase.from("wallets").select("balance").eq("user_id", user.id).single();
    if (Number(w?.balance ?? 0) < stake) { setPlacing(false); return toast.error("Tsy ampy ny solde"); }
    const { data: g, error } = await supabase
      .from("petanque_games" as any)
      .insert({ player1_id: user.id, stake, status: "waiting" } as any)
      .select("id")
      .single();
    setPlacing(false);
    if (error || !g) return toast.error(error?.message ?? "Tsy nahomby");
    toast.success("Vonona — miandry mpifanandrina");
    nav(`/petanque/${(g as any).id}`);
  };

  const cancelMyWaiting = async () => {
    if (!myWaiting) return;
    const { error } = await supabase.rpc("petanque_cancel_waiting" as any, { _game_id: myWaiting.id });
    if (error) return toast.error(error.message);
    toast("Nesorina");
    load();
  };

  const joinWaiting = async (g: WaitingGame) => {
    if (!user) return;
    const { data: w } = await supabase.from("wallets").select("balance").eq("user_id", user.id).single();
    if (Number(w?.balance ?? 0) < Number(g.stake)) return toast.error("Tsy ampy ny solde");
    setJoining(g.id);
    const { error } = await supabase.rpc("petanque_join_and_start" as any, { _game_id: g.id, _user: user.id });
    setJoining(null);
    if (error) return toast.error(error.message);
    nav(`/petanque/${g.id}`);
  };

  const grouped = useMemo(() => {
    const m: Record<number, WaitingGame[]> = {};
    waiting.forEach((g) => { (m[Number(g.stake)] = m[Number(g.stake)] || []).push(g); });
    return m;
  }, [waiting]);

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #0a2e1c 0%, #052113 60%, #021008 100%)" }}>
      <header className="p-4 flex items-center gap-3 border-b border-emerald-500/30">
        <Button variant="ghost" size="icon" onClick={() => nav("/")}><ArrowLeft className="text-emerald-200" /></Button>
        <h1 className="font-display text-xl font-bold text-emerald-200 tracking-wider">PÉTANQUE MGA</h1>
      </header>

      <div className="p-4 max-w-lg mx-auto space-y-4">
        <div className="rounded-2xl p-4 border border-emerald-500/30 bg-emerald-950/40 backdrop-blur">
          <p className="text-sm text-emerald-100/80 mb-2">1. Mise</p>
          <div className="grid grid-cols-5 gap-2 mb-4">
            {PETANQUE_STAKES.map((s) => (
              <button key={s} onClick={() => setStake(s)}
                className={`py-2 rounded-lg text-xs font-semibold transition ${stake === s
                  ? "bg-emerald-500 text-emerald-950 shadow-lg shadow-emerald-500/40"
                  : "border border-emerald-500/40 text-emerald-100 hover:bg-emerald-500/10"}`}>
                {s/1000}k
              </button>
            ))}
          </div>

          <p className="text-center text-sm text-emerald-100/90">
            Duel 2P · Mise <b>{fmtAr(stake)}</b> · Gain <b>{fmtAr(Math.round(stake * 0.9 * 2))}</b>
          </p>

          {myWaiting ? (
            <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/40 flex items-center justify-between">
              <div className="text-sm">
                <p className="font-bold text-emerald-200">Misy mise vonona ianao</p>
                <p className="text-xs text-emerald-100/70">Mise: {fmtAr(myWaiting.stake)} — miandry</p>
              </div>
              <Button size="sm" variant="destructive" onClick={cancelMyWaiting}><X className="w-4 h-4" /></Button>
            </div>
          ) : (
            <Button
              className="w-full mt-3 bg-emerald-500 text-emerald-950 hover:bg-emerald-400 font-bold"
              onClick={placeMise}
              disabled={placing}
            >
              {placing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Coins className="w-4 h-4 mr-2" />}
              {placing ? "Andraso..." : `2. Confirmer le demande — ${fmtAr(stake)}`}
            </Button>
          )}
        </div>

        <div className="rounded-2xl p-4 border border-emerald-500/30 bg-emerald-950/40 backdrop-blur">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-emerald-300" />
            <h3 className="font-display font-bold text-emerald-200">Mpilalao vonona ({waiting.length})</h3>
          </div>
          {waiting.length === 0 && <p className="text-center text-sm text-emerald-100/60 py-6">Tsy mbola misy</p>}
          <div className="space-y-3">
            {Object.keys(grouped).sort((a,b) => Number(a)-Number(b)).map((k) => (
              <div key={k}>
                <p className="text-[10px] uppercase text-emerald-200/60 mb-1">Mise {fmtAr(Number(k))}</p>
                <div className="space-y-1.5">
                  {grouped[Number(k)].map((g) => (
                    <button
                      key={g.id}
                      onClick={() => joinWaiting(g)}
                      disabled={joining === g.id}
                      className="w-full flex items-center justify-between p-3 rounded-lg border border-emerald-500/30 bg-emerald-900/30 hover:bg-emerald-900/60 transition"
                    >
                      <div className="text-left">
                        <p className="font-bold text-sm text-emerald-100">{g._name}</p>
                        <p className="text-[11px] text-emerald-100/70">Mise <b>{fmtAr(g.stake)}</b></p>
                      </div>
                      {joining === g.id ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                        <span className="text-xs font-bold text-emerald-300">Hiditra ▶</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}