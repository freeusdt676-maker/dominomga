import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fmtAr, ADMIN_CODE, ADMIN_CODE_ALT } from "@/lib/constants";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Wallet, Users, Trophy, MessageCircle, LogOut, Shield, MessagesSquare, User as UserIcon, Download } from "lucide-react";
import logo from "@/assets/logo.png";
import MessageInbox from "@/components/MessageInbox";

const ABANDONED_GAME_KEY = "domino_abandoned_game_id";

export default function Home() {
  const { user, isAdmin, signOut } = useAuth();
  const nav = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [balance, setBalance] = useState(0);
  const [tapCount, setTapCount] = useState(0);
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState("");
  const [incoming, setIncoming] = useState<any[]>([]);
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  useEffect(() => {
    const onBip = (e: any) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  const installApp = async () => {
    if (!installPrompt) {
      toast.info("Hampidirana ny app: tsindrio ny menu navigateur → 'Ajouter à l'écran d'accueil'");
      return;
    }
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") toast.success("Voapetraka ny app!");
    setInstallPrompt(null);
  };

  useEffect(() => {
    if (!user) return;

    const redirectToActiveGame = async () => {
      const abandonedGameId = sessionStorage.getItem(ABANDONED_GAME_KEY);
      const { data } = await supabase
        .from("games")
        .select("id, status, updated_at")
        .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
        .eq("status", "in_progress")
        .order("updated_at", { ascending: false })
        .limit(1);

      const nextActiveGame = data?.find((g) => g.id !== abandonedGameId);

      if (nextActiveGame?.id) {
        nav(`/game/${nextActiveGame.id}`);
      }
    };

    redirectToActiveGame();

    const ch = supabase.channel(`home-games-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games" },
        () => redirectToActiveGame(),
      )
      .subscribe();

    const itv = setInterval(redirectToActiveGame, 2500);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(itv);
    };
  }, [user, nav]);

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
    const { data, error } = await supabase.rpc("accept_challenge_start_game", { _challenge_id: c.id });
    const gameId = data && typeof data === "object" && "game_id" in data ? String((data as any).game_id ?? "") : "";
    if (error || !gameId) return toast.error(error?.message ?? "Hadisoana");
    nav(`/game/${gameId}`);
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
    const c = code.trim();
    if (c === ADMIN_CODE || c === ADMIN_CODE_ALT) {
      setShowCode(false);
      setCode("");
      sessionStorage.setItem("admin_code_ok", "1");
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
        <div className="flex items-center gap-2">
          <MessageInbox />
          <Button variant="ghost" size="icon" onClick={signOut}><LogOut className="w-5 h-5" /></Button>
        </div>
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
          <div className="rounded-2xl p-6 hover:scale-[1.01] transition cursor-pointer domino-panel">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🁫</span>
              <div className="flex-1">
                <h3 className="font-display text-xl font-bold domino-title">DOMINO</h3>
                <p className="text-sm text-yellow-100/80">2P · 3P — Mise sy Gain mitovy</p>
              </div>
            </div>
          </div>
        </Link>

        <button
          type="button"
          onClick={() => toast.info("Mbola eo tsy mandeha ny ludo tompoko 🙏")}
          className="w-full text-left rounded-2xl p-6 hover:scale-[1.01] transition cursor-pointer ludo-panel"
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎲</span>
            <div className="flex-1">
              <h3 className="font-display text-xl font-bold ludo-title">LUDO MASTER</h3>
              <p className="text-sm text-yellow-100/80">2P · 3P · 4P — mise sy gain mitovy</p>
            </div>
          </div>
        </button>

        <div className="grid grid-cols-3 gap-3">
          <Link to="/lobby"><div className="card-felt rounded-xl p-4 text-center"><Users className="w-6 h-6 mx-auto mb-2 text-primary" /><p className="text-sm">En ligne</p></div></Link>
          <Link to="/discussions"><div className="card-felt rounded-xl p-4 text-center"><MessagesSquare className="w-6 h-6 mx-auto mb-2 text-primary" /><p className="text-sm">Discussions</p></div></Link>
          <Link to="/admin-chat"><div className="card-felt rounded-xl p-4 text-center"><MessageCircle className="w-6 h-6 mx-auto mb-2 text-primary" /><p className="text-sm">Chat Admin</p></div></Link>
        </div>

        <Link to="/profile">
          <div className="card-felt rounded-xl p-4 flex items-center gap-3">
            <UserIcon className="w-6 h-6 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-bold">Profile sy Historique</p>
              <p className="text-xs text-muted-foreground">Hijery ny lalao vita sy ny score</p>
            </div>
            <Trophy className="w-5 h-5 text-primary/60" />
          </div>
        </Link>

        <Link to="/rules"><div className="card-felt rounded-xl p-4 text-center text-sm text-muted-foreground">Règle du jeu</div></Link>

        <button onClick={installApp} className="w-full card-felt rounded-xl p-4 flex items-center justify-center gap-2 text-sm border border-primary/30 hover:border-primary transition">
          <Download className="w-4 h-4 text-primary" />
          <span className="font-bold">Hampiditra ny app amin'ny finday</span>
        </button>

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
