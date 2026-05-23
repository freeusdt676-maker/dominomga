import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fmtAr } from "@/lib/constants";
import { ArrowLeft, Loader2, Coins, X, Clock } from "lucide-react";
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
  const [myWaiting, setMyWaiting] = useState<WaitingGame | null>(null);
  const [activeGame, setActiveGame] = useState<ResumeGame | null>(null);
  const [placing, setPlacing] = useState(false);
  const [nowTs, setNowTs] = useState(Date.now());
  const ABANDONED_GAME_KEY = "petanque_abandoned_game_id";

  const load = async () => {
    if (!user) return;
    // Expire stale (>2 min) waiting rooms across all game types
    try { await supabase.rpc("expire_stale_waiting_games" as any); } catch {}
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

    const { data: mineWait } = await supabase
      .from("petanque_games" as any)
      .select("id, player1_id, player2_id, stake, created_at, status")
      .eq("status", "waiting")
      .eq("player1_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1);
    const me = ((mineWait ?? [])[0] as unknown) as WaitingGame | undefined ?? null;
    setMyWaiting(me);
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
    const tick = setInterval(() => setNowTs(Date.now()), 1000);
    return () => { supabase.removeChannel(ch); clearInterval(itv); clearInterval(tick); if (t) clearTimeout(t); };
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

  // Countdown 2 min hoan'ny myWaiting
  const remainingSec = useMemo(() => {
    if (!myWaiting) return 0;
    const created = new Date(myWaiting.created_at).getTime();
    const left = Math.max(0, 120 - Math.floor((nowTs - created) / 1000));
    return left;
  }, [myWaiting, nowTs]);
  useEffect(() => {
    if (myWaiting && remainingSec === 0) {
      // Auto-cancel rehefa lany ny 2 min
      supabase.rpc("petanque_cancel_waiting" as any, { _game_id: myWaiting.id }).then(() => {
        toast.info("Tsy nahita mpifanandrina — afaka mametraka demande indray");
        load();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSec, myWaiting?.id]);

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #0a2e1c 0%, #052113 60%, #021008 100%)" }}>
      <header className="p-4 flex items-center gap-3 border-b border-emerald-500/30">
        <Button variant="ghost" size="icon" onClick={() => nav("/")}><ArrowLeft className="text-emerald-200" /></Button>
        <h1 className="font-display text-xl font-bold text-emerald-200 tracking-wider">PÉTANQUE MGA</h1>
      </header>

      <div className="p-4 max-w-lg mx-auto space-y-4">
        {activeGame && (
          <div className="rounded-2xl p-4 border border-emerald-400/50 bg-emerald-500/10 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-bold text-emerald-200 text-sm">Mbola misy partie Pétanque tsy vita</p>
                <p className="text-xs text-emerald-100/70">Duel 2P · {fmtAr(activeGame.stake)}</p>
              </div>
              <Button className="shrink-0 bg-emerald-500 text-emerald-950 hover:bg-emerald-400 font-bold" size="sm" onClick={() => nav(`/petanque/${activeGame.id}`)}>
                Hanohy <span className="ml-1">🔵</span>
              </Button>
            </div>
          </div>
        )}

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
                <p className="text-xs text-emerald-100/70 inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {Math.floor(remainingSec/60)}:{String(remainingSec%60).padStart(2,"0")} — miandry mpifanandrina
                </p>
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

        <div className="rounded-2xl p-4 border border-emerald-500/30 bg-emerald-950/40 backdrop-blur text-center text-xs text-emerald-100/70 leading-relaxed">
          Mametraha mise — raha misy mpilalao mametra mise mitovy, hifampitohy automatique ianareo ao anatin'ny 2 minitra. Raha tsy mahita mpifanandrina, foanana ho azy ny demande ka afaka mametraka indray ianao.
        </div>
      </div>
    </div>
  );
}