import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { STAKE_LEVELS, fmtAr } from "@/lib/constants";
import { ArrowLeft, Circle, Zap, Swords, Loader2, Bot, Target, Dice5, Spade } from "lucide-react";
import { toast } from "sonner";

export default function Lobby() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [stake, setStake] = useState(STAKE_LEVELS[0]);
  const [online, setOnline] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [waitingGames, setWaitingGames] = useState<any[]>([]);
  const [tab, setTab] = useState<"online"|"members">("online");
  const [filterByStake, setFilterByStake] = useState(false);
  const [searching, setSearching] = useState(false);
  const [botDiff, setBotDiff] = useState<"easy"|"medium"|"hard">("medium");

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const since = new Date(Date.now() - 60_000).toISOString();
      const { data: on } = await supabase.from("profiles").select("user_id, mvola_name, last_seen, is_online").gte("last_seen", since).neq("user_id", user.id).order("last_seen", { ascending: false }).limit(50);
      setOnline(on ?? []);
      const { data: all } = await supabase.from("profiles").select("user_id, mvola_name, last_seen").neq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
      setMembers(all ?? []);
      let q = supabase.from("games").select("*").eq("status", "waiting").is("player2_id", null).neq("player1_id", user.id);
      if (filterByStake) q = q.eq("stake", stake);
      const { data: wg } = await q;
      setWaitingGames(wg ?? []);
    };
    load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
  }, [user, filterByStake, stake]);

  // Quick match: jereo raha misy efa miandry mitovy stake → join, raha tsy misy → ampidiro queue
  const quickMatch = async () => {
    if (!user) return;
    const { data: w } = await supabase.from("wallets").select("balance").eq("user_id", user.id).single();
    if (Number(w?.balance ?? 0) < stake) return toast.error("Tsy ampy ny solde");

    setSearching(true);
    // Mitady latabatra efa misy mitovy stake
    const { data: existing } = await supabase.from("games").select("*").eq("status","waiting").is("player2_id", null).eq("stake", stake).neq("player1_id", user.id).limit(1);
    if (existing && existing.length > 0) {
      await joinGame(existing[0].id, Number(existing[0].stake));
      setSearching(false);
      return;
    }
    // Tsy nahita — mamorona latabatra vaovao
    const { data, error } = await supabase.from("games").insert({ player1_id: user.id, stake, status: "waiting" }).select().single();
    setSearching(false);
    if (error) return toast.error(error.message);
    toast.success("Latabatra noforonina, miandry adversaire...");
    nav(`/game/${data.id}`);
  };

  const challenge = async (toUser: string, name: string) => {
    if (!user) return;
    const { data: w } = await supabase.from("wallets").select("balance").eq("user_id", user.id).single();
    if (Number(w?.balance ?? 0) < stake) return toast.error("Tsy ampy ny solde");
    const { error } = await supabase.from("challenges").insert({ from_user: user.id, to_user: toUser, stake, status: "pending" });
    if (error) return toast.error(error.message);
    toast.success(`Fanasana nalefa amin'i ${name}`);
  };

  const createGame = async () => {
    if (!user) return;
    const { data: w } = await supabase.from("wallets").select("balance").eq("user_id", user.id).single();
    if (Number(w?.balance ?? 0) < stake) return toast.error("Tsy ampy ny solde");
    const { data, error } = await supabase.from("games").insert({ player1_id: user.id, stake, status: "waiting" }).select().single();
    if (error) return toast.error(error.message);
    toast.success("Latabatra noforonina, miandry mpilalao...");
    nav(`/game/${data.id}`);
  };

  const joinGame = async (gameId: string, gameStake: number) => {
    if (!user) return;
    const { data: w } = await supabase.from("wallets").select("balance").eq("user_id", user.id).single();
    if (Number(w?.balance ?? 0) < gameStake) return toast.error("Tsy ampy ny solde");
    const { error } = await supabase.from("games").update({ player2_id: user.id, status: "in_progress", current_turn: user.id, turn_started_at: new Date().toISOString() }).eq("id", gameId).is("player2_id", null);
    if (error) return toast.error(error.message);
    // Sintonana ny mise sy ny commission 10%
    await supabase.rpc("start_game_deduct", { _game_id: gameId });
    nav(`/game/${gameId}`);
  };

  return (
    <div className="min-h-screen felt-bg">
      <header className="p-4 flex items-center gap-3 border-b border-primary/20">
        <Button variant="ghost" size="icon" onClick={() => nav("/")}><ArrowLeft /></Button>
        <h1 className="font-display text-xl font-bold gold-text">Lobby</h1>
      </header>

      <div className="p-4 max-w-lg mx-auto space-y-4">
        <div className="card-felt rounded-2xl p-4">
          <p className="text-sm text-muted-foreground mb-2">Mise</p>
          <div className="grid grid-cols-5 gap-2">
            {STAKE_LEVELS.map((s) => (
              <button key={s} onClick={() => setStake(s)} className={`py-2 rounded-lg text-xs font-semibold border ${stake === s ? "btn-gold border-primary" : "border-primary/30 text-foreground"}`}>
                {s/1000}k
              </button>
            ))}
          </div>
          <p className="mt-3 text-center text-sm">Mise: <span className="gold-text font-bold">{fmtAr(stake)}</span> · Commission 10% · Gain net = <span className="gold-text font-bold">{fmtAr(Math.round(stake*1.8))}</span></p>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Button className="btn-gold" onClick={quickMatch} disabled={searching}>
              {searching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
              Lalao haingana
            </Button>
            <Button variant="outline" onClick={createGame}>Mamorona latabatra</Button>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground mt-3 cursor-pointer">
            <input type="checkbox" checked={filterByStake} onChange={(e) => setFilterByStake(e.target.checked)} />
            Sivana ny lisitra arakaraka ny mise voafaritra
          </label>
        </div>

        {/* === LALAO VS BOT === */}
        <div className="card-felt rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bot className="w-5 h-5 text-primary" />
            <h3 className="font-display font-bold gold-text">Lalao manohitra ny Bot</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Mise mitovy ihany koa, esorina ao amin'ny wallet — commission 10% ho an'ny ADMIN. Mandresy = +80%.</p>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {(["easy","medium","hard"] as const).map(d => (
              <button key={d} onClick={() => setBotDiff(d)} className={`py-2 rounded-lg text-xs font-semibold border ${botDiff===d?"btn-gold border-primary":"border-primary/30"}`}>
                {d === "easy" ? "Mora" : d === "medium" ? "Antonony" : "Sarotra"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Button className="btn-gold flex-col h-auto py-3" onClick={() => nav(`/bot/billiard?stake=${stake}&d=${botDiff}`)}>
              <Target className="w-5 h-5 mb-1" />
              <span className="text-xs">Billard</span>
            </Button>
            <Button className="btn-gold flex-col h-auto py-3" onClick={() => nav(`/bot/ludo?stake=${stake}&d=${botDiff}`)}>
              <Dice5 className="w-5 h-5 mb-1" />
              <span className="text-xs">Ludo</span>
            </Button>
            <Button className="btn-gold flex-col h-auto py-3" onClick={() => nav(`/bot/poker?stake=${stake}&d=${botDiff}`)}>
              <Spade className="w-5 h-5 mb-1" />
              <span className="text-xs">Poker</span>
            </Button>
          </div>
        </div>

        {waitingGames.length > 0 && (
          <div className="card-felt rounded-2xl p-4">
            <h3 className="font-display font-bold mb-2">Latabatra miandry</h3>
            <div className="space-y-2">
              {waitingGames.map((g) => (
                <div key={g.id} className="flex justify-between items-center bg-muted/30 rounded-lg p-3">
                  <span className="text-sm">Mise: <b className="gold-text">{fmtAr(g.stake)}</b></span>
                  <Button size="sm" className="btn-gold" onClick={() => joinGame(g.id, Number(g.stake))}>Hiditra</Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card-felt rounded-2xl p-4">
          <div className="flex gap-2 mb-3">
            <button onClick={() => setTab("online")} className={`flex-1 py-2 rounded-lg text-sm ${tab==="online"?"btn-gold":"bg-muted/30"}`}>En ligne ({online.length})</button>
            <button onClick={() => setTab("members")} className={`flex-1 py-2 rounded-lg text-sm ${tab==="members"?"btn-gold":"bg-muted/30"}`}>Membre ({members.length})</button>
          </div>
          <div className="space-y-1 max-h-[40vh] overflow-y-auto">
            {(tab === "online" ? online : members).map((p) => (
              <div key={p.user_id} className="flex items-center gap-2 p-2 hover:bg-muted/20 rounded">
                <Circle className={`w-2 h-2 ${tab==="online" ? "fill-success text-success" : "fill-muted text-muted"}`} />
                <span className="flex-1 text-sm">{p.mvola_name}</span>
                {tab === "online" && (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => challenge(p.user_id, p.mvola_name)}>
                    <Swords className="w-3 h-3 mr-1" /> Hihantsy
                  </Button>
                )}
              </div>
            ))}
            {(tab === "online" ? online : members).length === 0 && <p className="text-center text-xs text-muted-foreground py-4">Tsy misy</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
