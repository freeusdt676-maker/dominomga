import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fmtAr, ADMIN_CODE } from "@/lib/constants";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Wallet, Users, Trophy, MessageCircle, LogOut, Shield } from "lucide-react";
import logo from "@/assets/logo.png";

export default function Home() {
  const { user, isAdmin, signOut } = useAuth();
  const nav = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [balance, setBalance] = useState(0);
  const [tapCount, setTapCount] = useState(0);
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState("");
  const [incoming, setIncoming] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: p } = await supabase.from("profiles").select("*").eq("user_id", user.id).single();
      setProfile(p);
      const { data: w } = await supabase.from("wallets").select("balance").eq("user_id", user.id).single();
      setBalance(Number(w?.balance ?? 0));
      // mark online
      await supabase.from("profiles").update({ is_online: true, last_seen: new Date().toISOString() }).eq("user_id", user.id);
    })();

    const interval = setInterval(() => {
      supabase.from("profiles").update({ last_seen: new Date().toISOString(), is_online: true }).eq("user_id", user.id);
    }, 20_000);

    return () => {
      clearInterval(interval);
      supabase.from("profiles").update({ is_online: false }).eq("user_id", user.id);
    };
  }, [user]);

  // Mandray fanasana (challenges) miditra
  useEffect(() => {
    if (!user) return;
    const loadCh = async () => {
      const { data } = await supabase
        .from("challenges")
        .select("*, profiles!challenges_from_user_fkey(mvola_name)")
        .eq("to_user", user.id).eq("status","pending")
        .gt("expires_at", new Date().toISOString());
      setIncoming(data ?? []);
    };
    loadCh();
    const ch = supabase.channel("ch-"+user.id)
      .on("postgres_changes",{event:"*",schema:"public",table:"challenges",filter:`to_user=eq.${user.id}`}, () => loadCh())
      .subscribe();
    const itv = setInterval(loadCh, 10000);
    return () => { supabase.removeChannel(ch); clearInterval(itv); };
  }, [user]);

  const acceptChallenge = async (c: any) => {
    if (!user) return;
    const { data: w } = await supabase.from("wallets").select("balance").eq("user_id", user.id).single();
    if (Number(w?.balance ?? 0) < Number(c.stake)) return toast.error("Tsy ampy ny solde");
    // Mamorona game
    const { data: g, error } = await supabase.from("games").insert({
      player1_id: c.from_user, player2_id: user.id, stake: c.stake,
      status: "in_progress", current_turn: c.from_user, turn_started_at: new Date().toISOString()
    }).select().single();
    if (error || !g) return toast.error(error?.message ?? "Hadisoana");
    await supabase.from("challenges").update({ status: "accepted", game_id: g.id }).eq("id", c.id);
    await supabase.rpc("start_game_deduct", { _game_id: g.id });
    nav(`/game/${g.id}`);
  };
  const declineChallenge = async (c: any) => {
    await supabase.from("challenges").update({ status: "declined" }).eq("id", c.id);
  };

  const handleAdminTap = () => {
    const next = tapCount + 1;
    setTapCount(next);
    if (next >= 3) {
      setTapCount(0);
      setShowCode(true);
    }
    setTimeout(() => setTapCount(0), 1500);
  };

  const handleAdminCode = () => {
    if (code === ADMIN_CODE) {
      setShowCode(false);
      setCode("");
      nav("/admin");
    } else {
      toast.error("Code diso");
    }
  };

  return (
    <div className="min-h-screen felt-bg">
      <header className="p-4 flex items-center justify-between border-b border-primary/20">
        <div className="flex items-center gap-2">
          <img src={logo} alt="Logo" className="w-10 h-10" />
          <h1 className="font-display font-bold gold-text text-xl">DOMINO MGA</h1>
        </div>
        <Button variant="ghost" size="icon" onClick={signOut}><LogOut className="w-5 h-5" /></Button>
      </header>

      <div className="p-4 space-y-4 max-w-lg mx-auto pb-32">
        {incoming.length > 0 && (
          <div className="card-felt rounded-2xl p-4 border-2 border-primary animate-pulse">
            <p className="font-display font-bold gold-text mb-2">⚔️ Misy fanasana!</p>
            {incoming.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 py-2">
                <div className="text-sm">
                  <p className="font-bold">{c.profiles?.mvola_name ?? "?"}</p>
                  <p className="text-xs text-muted-foreground">Mise: {fmtAr(c.stake)}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" className="btn-gold" onClick={() => acceptChallenge(c)}>Eny</Button>
                  <Button size="sm" variant="destructive" onClick={() => declineChallenge(c)}>Tsia</Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="card-felt rounded-2xl p-5">
          <p className="text-xs text-muted-foreground">Tonga soa</p>
          <h2 className="text-2xl font-display font-bold">{profile?.mvola_name ?? "..."}</h2>
          <p className="text-xs text-muted-foreground mt-1">{profile?.phone}</p>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Solde</p>
              <p className="text-3xl font-display gold-text font-bold">{fmtAr(balance)}</p>
            </div>
            <Link to="/wallet"><Button className="btn-gold"><Wallet className="w-4 h-4 mr-2" />Wallet</Button></Link>
          </div>
        </div>

        <Link to="/lobby">
          <div className="card-felt rounded-2xl p-6 hover:scale-[1.01] transition cursor-pointer">
            <div className="flex items-center gap-3">
              <Trophy className="w-10 h-10 text-primary" />
              <div className="flex-1">
                <h3 className="font-display text-xl font-bold">Milalao</h3>
                <p className="text-sm text-muted-foreground">Mitady adversaire (cote x2)</p>
              </div>
            </div>
          </div>
        </Link>

        <div className="grid grid-cols-2 gap-3">
          <Link to="/lobby"><div className="card-felt rounded-xl p-4 text-center"><Users className="w-6 h-6 mx-auto mb-2 text-primary" /><p className="text-sm">En ligne</p></div></Link>
          <Link to="/admin-chat"><div className="card-felt rounded-xl p-4 text-center"><MessageCircle className="w-6 h-6 mx-auto mb-2 text-primary" /><p className="text-sm">Chat Admin</p></div></Link>
        </div>

        <Link to="/rules"><div className="card-felt rounded-xl p-4 text-center text-sm text-muted-foreground">Règle du jeu</div></Link>

        <p className="text-center text-xs text-muted-foreground/60 pt-4">Hiditra · DOMINO MGA · v1</p>

        {isAdmin && (
          <Link to="/admin"><Button variant="outline" className="w-full">Tableau Admin</Button></Link>
        )}
      </div>

      {/* Bokotra ADMINISTRATIF — FAB amin'ny zorony havanana ambany — triple click */}
      <button
        onClick={handleAdminTap}
        aria-label="Administratif"
        className="fixed bottom-4 right-4 w-14 h-14 rounded-full bg-card/40 border border-primary/20 backdrop-blur flex items-center justify-center shadow-lg active:scale-95 transition select-none z-50"
      >
        <Shield className="w-5 h-5 text-primary/40" />
        {tapCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-bold">{tapCount}</span>
        )}
      </button>

      <Dialog open={showCode} onOpenChange={setShowCode}>
        <DialogContent>
          <DialogHeader><DialogTitle>Code Administratif</DialogTitle></DialogHeader>
          <Input type="password" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code" />
          <Button onClick={handleAdminCode} className="btn-gold">Hampiditra</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
