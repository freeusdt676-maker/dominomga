import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { STAKE_LEVELS, fmtAr } from "@/lib/constants";
import { ArrowLeft, Users, Circle } from "lucide-react";
import { toast } from "sonner";

export default function Lobby() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [stake, setStake] = useState(STAKE_LEVELS[0]);
  const [online, setOnline] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [waitingGames, setWaitingGames] = useState<any[]>([]);
  const [tab, setTab] = useState<"online"|"members">("online");

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const since = new Date(Date.now() - 60_000).toISOString();
      const { data: on } = await supabase.from("profiles").select("user_id, mvola_name, last_seen, is_online").gte("last_seen", since).neq("user_id", user.id).order("last_seen", { ascending: false }).limit(50);
      setOnline(on ?? []);
      const { data: all } = await supabase.from("profiles").select("user_id, mvola_name, last_seen").neq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
      setMembers(all ?? []);
      const { data: wg } = await supabase.from("games").select("*").eq("status", "waiting").is("player2_id", null).neq("player1_id", user.id);
      setWaitingGames(wg ?? []);
    };
    load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
  }, [user]);

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
          <p className="mt-3 text-center text-sm">Mise: <span className="gold-text font-bold">{fmtAr(stake)}</span> · Cote x2 = <span className="gold-text font-bold">{fmtAr(stake*2)}</span></p>
          <Button className="w-full mt-3 btn-gold" onClick={createGame}>Mamorona latabatra</Button>
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
              </div>
            ))}
            {(tab === "online" ? online : members).length === 0 && <p className="text-center text-xs text-muted-foreground py-4">Tsy misy</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
