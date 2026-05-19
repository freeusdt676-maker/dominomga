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
    <div className="min-h-screen luxe-bg">
      <header className="relative z-10 px-5 py-4 flex items-center justify-between hairline-b">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute -inset-1 rounded-full bg-[hsl(var(--gold-1)/0.15)] blur-md" />
            <img src={logo} alt="DOMINO MGA" className="relative w-10 h-10 rounded-full ring-1 ring-[hsl(var(--gold-1)/0.4)]" />
          </div>
          <div className="leading-none">
            <p className="eyebrow">Maison de jeu</p>
            <h1 className="font-serif-luxe gold-luxe-text text-2xl mt-1">Domino MGA</h1>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <MessageInbox />
          <Button variant="ghost" size="icon" onClick={signOut} className="text-[hsl(var(--gold-1))] hover:bg-[hsl(var(--gold-1)/0.08)]"><LogOut className="w-5 h-5" /></Button>
        </div>
      </header>

      <div className="relative z-10 px-4 pt-5 pb-32 space-y-5 max-w-lg mx-auto">
        {incoming.length > 0 && (
          <div className="luxe-card p-4 ring-1 ring-[hsl(var(--gold-1)/0.5)] animate-pulse">
            <p className="eyebrow mb-1">Défi</p>
            <p className="font-serif-luxe gold-luxe-text text-xl mb-2">⚔️ Misy fanasana</p>
            {incoming.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 py-2 hairline-t first:border-t-0">
                <div className="text-sm">
                  <p className="font-bold">{c.profiles?.mvola_name ?? "?"}</p>
                  <p className="text-xs text-muted-foreground">Mise: {fmtAr(c.stake)}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => acceptChallenge(c)} className="btn-luxe !py-2 !px-4 text-[11px]">Eny</button>
                  <button onClick={() => declineChallenge(c)} className="btn-luxe-ghost !py-2 !px-3 text-[11px]">Tsia</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Hero wallet card */}
        <div className="luxe-hero p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="eyebrow">Tonga soa</p>
              <h2 className="font-serif-luxe text-3xl mt-1 gold-luxe-text leading-none">{profile?.mvola_name ?? "..."}</h2>
              <p className="text-[11px] text-muted-foreground mt-2 tracking-wider">{profile?.phone}</p>
            </div>
            <span className="text-[10px] font-sans-pro tracking-[0.2em] uppercase text-[hsl(var(--gold-1))] border border-[hsl(var(--gold-1)/0.4)] rounded-full px-2 py-1">VIP</span>
          </div>

          <div className="my-5 h-px bg-gradient-to-r from-transparent via-[hsl(var(--gold-1)/0.4)] to-transparent" />

          <div className="flex items-end justify-between">
            <div>
              <p className="eyebrow">Solde MVOLA</p>
              <p className="font-serif-luxe text-[40px] leading-none gold-luxe-text mt-2">{fmtAr(balance)}</p>
            </div>
            <Link to="/wallet">
              <button className="btn-luxe inline-flex items-center gap-2"><Wallet className="w-3.5 h-3.5" />MVola</button>
            </Link>
          </div>
        </div>

        <div className="crest-divider px-2">
          <span className="text-[10px] tracking-[0.4em] uppercase">— Salles —</span>
        </div>

        {/* Game rooms */}
        <div className="space-y-3">
          <Link to="/lobby" className="block luxe-card p-5 group transition hover:border-[hsl(var(--gold-1)/0.5)]">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-gradient-to-br from-[hsl(150_55%_22%)] to-[hsl(155_65%_10%)] border border-[hsl(var(--gold-1)/0.3)] text-3xl">🁫</div>
              <div className="flex-1">
                <p className="eyebrow">Classique</p>
                <h3 className="font-serif-luxe text-2xl gold-luxe-text leading-tight">Domino</h3>
                <p className="text-xs text-muted-foreground mt-1">2P · 3P — Mise sy gain mitovy</p>
              </div>
              <span className="text-[hsl(var(--gold-1))] opacity-50 group-hover:opacity-100 transition text-xl">→</span>
            </div>
          </Link>

          <Link to="/ludo" className="block luxe-card p-5 group transition hover:border-[hsl(var(--gold-1)/0.5)]">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#4a2580] to-[#2c1356] border border-[hsl(var(--gold-1)/0.3)] text-3xl">🎲</div>
              <div className="flex-1">
                <p className="eyebrow">Royale</p>
                <h3 className="font-serif-luxe text-2xl gold-luxe-text leading-tight">Ludo Master</h3>
                <p className="text-xs text-muted-foreground mt-1">2P · 3P · 4P — Mise sy gain mitovy</p>
              </div>
              <span className="text-[hsl(var(--gold-1))] opacity-50 group-hover:opacity-100 transition text-xl">→</span>
            </div>
          </Link>
        </div>

        <div className="crest-divider px-2">
          <span className="text-[10px] tracking-[0.4em] uppercase">— Conciergerie —</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Link to="/lobby" className="stat-tile text-center">
            <Users className="w-5 h-5 mx-auto mb-1.5 text-[hsl(var(--gold-1))]" />
            <p className="text-[11px] font-sans-pro tracking-wide">En ligne</p>
          </Link>
          <Link to="/discussions" className="stat-tile text-center">
            <MessagesSquare className="w-5 h-5 mx-auto mb-1.5 text-[hsl(var(--gold-1))]" />
            <p className="text-[11px] font-sans-pro tracking-wide">Discussions</p>
          </Link>
          <Link to="/admin-chat" className="stat-tile text-center">
            <MessageCircle className="w-5 h-5 mx-auto mb-1.5 text-[hsl(var(--gold-1))]" />
            <p className="text-[11px] font-sans-pro tracking-wide">Chat Admin</p>
          </Link>
        </div>

        <Link to="/profile" className="block luxe-card p-4 group">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[hsl(var(--gold-1)/0.1)] border border-[hsl(var(--gold-1)/0.3)] flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-[hsl(var(--gold-1))]" />
            </div>
            <div className="flex-1">
              <p className="font-serif-luxe text-lg leading-none">Profile</p>
              <p className="text-xs text-muted-foreground mt-1">Historique sy score</p>
            </div>
            <Trophy className="w-4 h-4 text-[hsl(var(--gold-1))] opacity-60 group-hover:opacity-100 transition" />
          </div>
        </Link>

        <Link to="/rules" className="block text-center hairline rounded-xl p-3 text-xs tracking-[0.2em] uppercase text-muted-foreground hover:text-[hsl(var(--gold-1))] hover:border-[hsl(var(--gold-1)/0.5)] transition">
          Règle du jeu
        </Link>

        <button onClick={installApp} className="w-full luxe-card p-3.5 flex items-center justify-center gap-2 text-xs font-sans-pro tracking-wide hover:border-[hsl(var(--gold-1)/0.6)] transition">
          <Download className="w-4 h-4 text-[hsl(var(--gold-1))]" />
          <span className="font-semibold">Hampiditra ny app amin'ny finday</span>
        </button>

        <p className="text-center text-[10px] tracking-[0.35em] uppercase text-muted-foreground/50 pt-4">Domino MGA · Maison de jeu · v1</p>

        {isAdmin && (
          <Link to="/admin"><button className="w-full btn-luxe-ghost">Tableau Admin</button></Link>
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
