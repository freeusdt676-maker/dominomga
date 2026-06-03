import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Check, X, Megaphone, Wallet as WalletIcon, UserCheck, Eye, EyeOff, MessageSquare, ArrowDownToLine, ArrowUpFromLine, History, Search, Unlock, Trash2, RotateCcw, ShieldAlert, Share2 } from "lucide-react";
import { fmtAr } from "@/lib/constants";
import { toast } from "sonner";
import { DominoTile } from "@/components/DominoTile";
import PendingProfileApprovals from "@/components/PendingProfileApprovals";
export default function Admin() {
  const { user, isAdmin } = useAuth();
  const nav = useNavigate();
  const codeOk = typeof window !== "undefined" && sessionStorage.getItem("admin_code_ok") === "1";
  const allowed = isAdmin || codeOk;
  const [pending, setPending] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [resets, setResets] = useState<any[]>([]);
  const [broadcast, setBroadcast] = useState("");
  const [adminBalance, setAdminBalance] = useState(0);
  const [totalPlayerBalance, setTotalPlayerBalance] = useState<number | null>(null);
  const [lockedCashPool, setLockedCashPool] = useState<number | null>(null);
  const [showTotal, setShowTotal] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [rejectFor, setRejectFor] = useState<any | null>(null);
  const [rejectMsg, setRejectMsg] = useState("");
  const [txSubTab, setTxSubTab] = useState<"deposit" | "withdrawal">("deposit");
  const [resolvedAdminId, setResolvedAdminId] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  const [commissions, setCommissions] = useState<any[]>([]);
  const [allTx, setAllTx] = useState<any[]>([]);
  const [adminNames, setAdminNames] = useState<Record<string, string>>({});
  const [selectedGame, setSelectedGame] = useState<any | null>(null);
  const [gameMoves, setGameMoves] = useState<any[]>([]);
  const [resetTarget, setResetTarget] = useState<any | null>(null);
  const [resetPin, setResetPin] = useState("");
  const [commissionResetOpen, setCommissionResetOpen] = useState(false);
  const [commissionPin, setCommissionPin] = useState("");
  const [cancelTicketInput, setCancelTicketInput] = useState("");
  const [cancelPin, setCancelPin] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelAllOpen, setCancelAllOpen] = useState(false);
  const [cancelAllPin, setCancelAllPin] = useState("");
  const [blockAllOpen, setBlockAllOpen] = useState(false);
  const [blockAllPin, setBlockAllPin] = useState("");
  const [unblockAllOpen, setUnblockAllOpen] = useState(false);
  const [unblockAllPin, setUnblockAllPin] = useState("");
  const [pendingProfileCount, setPendingProfileCount] = useState(0);
  const adminId = user?.id ?? resolvedAdminId;
  const normalizeTicket = (value: string) => value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const detectedCancelGame = history.find((item) => normalizeTicket(item.ticket_number ?? "") === normalizeTicket(cancelTicketInput));

  useEffect(() => {
    if (!user?.id && codeOk && !resolvedAdminId) {
      supabase.rpc("get_admin_id").then(({ data }) => {
        if (data) setResolvedAdminId(data as string);
      });
    }
  }, [user?.id, codeOk, resolvedAdminId]);

  // Pending profile approvals count + realtime
  useEffect(() => {
    if (!allowed) return;
    const loadCount = async () => {
      const { count } = await supabase
        .from("profile_change_requests" as any)
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      setPendingProfileCount(count ?? 0);
    };
    loadCount();
    const ch = supabase
      .channel("admin-pcr-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "profile_change_requests" }, () => loadCount())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [allowed]);

  const load = async () => {
    // 1) Profiles (rehetra)
    const { data: u, error: uErr } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (uErr) console.error("profiles load err", uErr);
    const profiles = u ?? [];

    // 2) Wallets — manual map
    const ids = profiles.map((p: any) => p.user_id);
    let walletMap: Record<string, number> = {};
    if (ids.length) {
      const { data: ws } = await supabase.from("wallets").select("user_id,balance").in("user_id", ids);
      (ws ?? []).forEach((w: any) => { walletMap[w.user_id] = Number(w.balance ?? 0); });
    }
    setUsers(profiles.map((p: any) => ({ ...p, _balance: walletMap[p.user_id] ?? 0 })));

    // 3) Pending transactions + manual profile join
    const { data: p, error: pErr } = await supabase
      .from("transactions")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (pErr) console.error("tx load err", pErr);
    const profMap: Record<string, any> = {};
    profiles.forEach((pr: any) => { profMap[pr.user_id] = pr; });
    setPending((p ?? []).map((t: any) => ({ ...t, profiles: profMap[t.user_id] ?? null })));

    // All processed transactions (approved/rejected) — anaty profil
    const { data: at } = await supabase
      .from("transactions")
      .select("*")
      .in("status", ["approved", "rejected"])
      .in("type", ["deposit", "withdrawal"])
      .order("processed_at", { ascending: false })
      .limit(2000);
    setAllTx(at ?? []);

    // Anaran'ny admin (processed_by)
    const adminIds = Array.from(new Set((at ?? []).map((t: any) => t.processed_by).filter(Boolean)));
    if (adminIds.length) {
      const map: Record<string, string> = {};
      adminIds.forEach((id: string) => {
        if (profMap[id]) map[id] = profMap[id].mvola_name;
      });
      // Fetch missing
      const missing = adminIds.filter((id: string) => !map[id]);
      if (missing.length) {
        const { data: ap } = await supabase.from("profiles").select("user_id,mvola_name").in("user_id", missing);
        (ap ?? []).forEach((pr: any) => { map[pr.user_id] = pr.mvola_name; });
      }
      setAdminNames(map);
    }

    // 4) Password resets
    const { data: r } = await supabase
      .from("password_reset_requests")
      .select("*")
      .eq("status", "pending");
    setResets((r ?? []).map((rr: any) => ({ ...rr, profiles: profMap[rr.user_id] ?? null })));

    const aid = user?.id ?? resolvedAdminId;
    if (aid) {
      const { data: aw } = await supabase.from("admin_wallets").select("balance").eq("admin_id", aid).maybeSingle();
      setAdminBalance(Number(aw?.balance ?? 0));
      const { data: tot } = await supabase.rpc("admin_total_player_balance", { _admin_id: aid });
      setTotalPlayerBalance(Number(tot ?? 0));
      const { data: lp } = await supabase.rpc("admin_total_locked_cash_pool" as any, { _admin_id: aid });
      setLockedCashPool(Number(lp ?? 0));
    }

    // Historique Domino + Ludo
    const { data: hg } = await supabase
      .from("games")
      .select("id, ticket_number, stake, player1_id, player2_id, player3_id, winner_id, status, created_at, finished_at, turn_started_at, players_count")
      .not("ticket_number", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);
    const { data: lg } = await supabase
      .from("ludo_games" as any)
      .select("id, ticket_number, stake, player1_id, player2_id, player3_id, player4_id, winner_id, status, created_at, finished_at, turn_started_at, players_count")
      .not("ticket_number", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);
    const { data: pg } = await supabase
      .from("petanque_games" as any)
      .select("id, ticket_number, stake, player1_id, player2_id, winner_id, status, created_at, finished_at, turn_started_at, score_p1, score_p2, round_number")
      .not("ticket_number", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);

    const dominoHistory = (hg ?? []).map((game: any) => ({
      ...game,
      game_kind: "domino",
      _players: [game.player1_id, game.player2_id, game.player3_id]
        .filter(Boolean)
        .map((id: string) => profMap[id]?.mvola_name ?? "?"),
      _winnerName: game.winner_id ? (profMap[game.winner_id]?.mvola_name ?? "?") : null,
    }));
    const ludoHistory = (lg ?? []).map((game: any) => ({
      ...game,
      game_kind: "ludo",
      _players: [game.player1_id, game.player2_id, game.player3_id, game.player4_id]
        .filter(Boolean)
        .map((id: string) => profMap[id]?.mvola_name ?? "?"),
      _winnerName: game.winner_id ? (profMap[game.winner_id]?.mvola_name ?? "?") : null,
    }));
    const petHistory = (pg ?? []).map((game: any) => ({
      ...game,
      game_kind: "petanque",
      players_count: 2,
      _players: [game.player1_id, game.player2_id]
        .filter(Boolean)
        .map((id: string) => profMap[id]?.mvola_name ?? "?"),
      _winnerName: game.winner_id ? (profMap[game.winner_id]?.mvola_name ?? "?") : null,
    }));

    setHistory(
      [...dominoHistory, ...ludoHistory, ...petHistory].sort(
        (a: any, b: any) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
      ),
    );

    // Commissions Admin (10%) — entrées issues des parties finies
    const commissionRows = [...dominoHistory, ...ludoHistory, ...petHistory]
      .filter((g: any) => g.status === "finished" && Number(g.stake ?? 0) > 0)
      .map((g: any) => {
        const pc = Number(g.players_count ?? 2);
        const stake = Number(g.stake ?? 0);
        const commission = Math.round(stake * 0.1) * pc;
        return {
          id: g.id,
          game_kind: g.game_kind,
          ticket_number: g.ticket_number,
          stake,
          players_count: pc,
          commission,
          finished_at: g.finished_at ?? g.created_at,
          players: g._players ?? [],
          winner: g._winnerName,
        };
      })
      .sort((a, b) => new Date(b.finished_at ?? 0).getTime() - new Date(a.finished_at ?? 0).getTime());
    setCommissions(commissionRows);
  };

  useEffect(() => { if (allowed) load(); }, [allowed, user, resolvedAdminId]);

  useEffect(() => {
    if (allowed && !isAdmin) {
      // Admin via code: full access granted through SECURITY DEFINER RPCs
    }
  }, [allowed, isAdmin]);

  useEffect(() => {
    if (!allowed) return;
    const ch = supabase
      .channel("admin-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "password_reset_requests" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "wallets" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "games" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "ludo_games" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "petanque_games" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [allowed]);

  if (!allowed) return (
    <div className="min-h-screen felt-bg flex items-center justify-center text-center p-6">
      <div className="card-felt p-6 rounded-2xl">
        <p className="text-destructive mb-2">Tsy mahazo miditra ianao</p>
        <Button onClick={() => nav("/")}>Hiverina</Button>
      </div>
    </div>
  );

  const approveUser = async (uid: string) => {
    if (!adminId) return toast.error("Mbola tsy vita ny fanamarinana admin, andraso kely");
    const { error } = await supabase.rpc("approve_user_with_message", { _user_id: uid, _admin_id: adminId });
    if (error) return toast.error(error.message);
    toast.success("Nankatoavina + hafatra nalefa");
    setSelectedUser(null);
    load();
  };

  const submitReject = async () => {
    if (!rejectFor || !adminId) return;
    if (!rejectMsg.trim()) return toast.error("Soraty ny antony");
    // Bloquer (et garder le compte) au lieu de supprimer: l'admin peut le rouvrir
    // ensuite via "Débloquer". L'utilisateur reçoit le message d'explication.
    const { error } = await supabase.rpc("admin_block_user_with_message" as any, {
      _user_id: rejectFor.user_id,
      _admin_id: adminId,
      _message: rejectMsg.trim(),
    });
    if (error) return toast.error(error.message);
    toast.success("Voasakana ny compte. Afaka avahana indray rehefa tian'ny admin.");
    setRejectFor(null); setRejectMsg(""); setSelectedUser(null);
    load();
  };

  const approveTx = async (tx: any) => {
    if (!adminId) return toast.error("Mbola tsy vita ny fanamarinana admin, andraso kely");
    const { error } = await supabase.rpc("admin_approve_tx", { _tx_id: tx.id, _admin_id: adminId });
    if (error) return toast.error(error.message);
    toast.success("Nankatoavina");
    load();
  };

  const rejectTx = async (tx: any) => {
    if (!adminId) return toast.error("Mbola tsy vita ny fanamarinana admin, andraso kely");
    const { error } = await supabase.rpc("admin_reject_tx", { _tx_id: tx.id, _admin_id: adminId });
    if (error) return toast.error(error.message);
    toast.error("Nolavina");
    load();
  };

  const sendBroadcast = async () => {
    if (!broadcast.trim()) return;
    if (!adminId) return toast.error("Mbola tsy vita ny fanamarinana admin, andraso kely");
    const { error } = await supabase.rpc("admin_send_broadcast", { _admin_id: adminId, _content: broadcast.trim() });
    if (error) return toast.error(error.message);
    toast.success("Hafatra alefa amin'ny rehetra");
    setBroadcast("");
  };

  const unblockUser = async (uid: string) => {
    if (!adminId) return toast.error("Andraso kely...");
    const { error } = await supabase.rpc("admin_unblock_user", { _user_id: uid, _admin_id: adminId });
    if (error) return toast.error(error.message);
    toast.success("Voavaha ny compte");
    setSelectedUser(null);
    load();
  };

  const deleteTx = async (tx: any) => {
    if (!adminId) return;
    if (!confirm("Hamafa ity transaction ity?")) return;
    const { error } = await supabase.rpc("admin_delete_transaction", { _tx_id: tx.id, _admin_id: adminId });
    if (error) return toast.error(error.message);
    toast.success("Voafafa");
    load();
  };

  const cancelGameByTicket = async () => {
    if (!adminId) return toast.error("Mbola tsy vita ny fanamarinana admin, andraso kely");
    const ticket = (detectedCancelGame?.ticket_number ?? cancelTicketInput).trim();
    if (!ticket) return toast.error("Ampidiro ny numéro ticket");
    const { data, error } = await supabase.rpc("admin_cancel_game_by_ticket", { _ticket: ticket, _admin_id: adminId, _pin: cancelPin });
    if (error) {
      const msg = error.message.includes("pin_diso")
        ? "Code administratif diso"
        : error.message.includes("ticket_not_found")
          ? "Tsy hita io ticket io"
          : error.message.includes("already_closed")
            ? "Efa vita na efa annulé io lalao io"
            : error.message;
      return toast.error(msg);
    }
    toast.success(`Voa-annulé ny ${String((data as any)?.kind ?? "jeu").toUpperCase()} Nº${ticket}`);
    setCancelOpen(false);
    setCancelPin("");
    setCancelTicketInput("");
    await load();
  };

  const cancelAllActiveGames = async () => {
    if (!adminId) return toast.error("Mbola tsy vita ny fanamarinana admin, andraso kely");
    const { data, error } = await supabase.rpc("admin_cancel_all_active_games", { _admin_id: adminId, _pin: cancelAllPin });
    if (error) {
      const msg = error.message.includes("pin_diso") ? "Code administratif diso" : error.message;
      return toast.error(msg);
    }
    toast.success(`Jeux annulés: ${Number((data as any)?.total_cancelled ?? 0)}`);
    setCancelAllOpen(false);
    setCancelAllPin("");
    await load();
  };

  const blockAllAccounts = async () => {
    if (!adminId) return toast.error("Mbola tsy vita ny fanamarinana admin");
    const { data, error } = await supabase.rpc("admin_block_all_accounts" as any, { _admin_id: adminId, _pin: blockAllPin });
    if (error) {
      const msg = error.message.includes("pin_diso") ? "Code administratif diso" : error.message;
      return toast.error(msg);
    }
    toast.success(`Voasakana ny compte rehetra: ${Number((data as any)?.blocked ?? 0)}`);
    setBlockAllOpen(false); setBlockAllPin(""); await load();
  };

  const unblockAllAccounts = async () => {
    if (!adminId) return toast.error("Mbola tsy vita ny fanamarinana admin");
    const { data, error } = await supabase.rpc("admin_unblock_all_accounts" as any, { _admin_id: adminId, _pin: unblockAllPin });
    if (error) {
      const msg = error.message.includes("pin_diso") ? "Code administratif diso" : error.message;
      return toast.error(msg);
    }
    toast.success(`Nosokafana indray ny compte rehetra: ${Number((data as any)?.unblocked ?? 0)}`);
    setUnblockAllOpen(false); setUnblockAllPin(""); await load();
  };

  const submitReset = async () => {
    if (!resetTarget || !adminId) return;
    const { error } = await supabase.rpc("admin_reset_user_balance", {
      _user_id: resetTarget.user_id, _admin_id: adminId, _pin: resetPin
    });
    if (error) {
      const msg = error.message.includes("pin_diso") ? "PIN diso" : error.message;
      return toast.error(msg);
    }
    toast.success("Solde nampody amin'ny 0");
    setResetTarget(null); setResetPin(""); setSelectedUser(null);
    load();
  };

  const submitCommissionReset = async () => {
    if (!adminId) return;
    const { error } = await supabase.rpc("admin_reset_commission", { _admin_id: adminId, _pin: commissionPin });
    if (error) {
      const msg = error.message.includes("pin_diso") ? "PIN diso" : error.message;
      return toast.error(msg);
    }
    toast.success("Wallet Admin nampody amin'ny 0 Ar");
    setCommissionResetOpen(false); setCommissionPin("");
    load();
  };

  const filteredHistory = history.filter((h) => {
    if (!historySearch.trim()) return true;
    const q = historySearch.trim().toLowerCase();
    return (
      (h.ticket_number ?? "").toLowerCase().includes(q) ||
      (h.game_kind ?? "").toLowerCase().includes(q) ||
      (h._winnerName ?? "").toLowerCase().includes(q) ||
      (h._players ?? []).join(" ").toLowerCase().includes(q)
    );
  });

  const openGameDetails = async (h: any) => {
    setSelectedGame(h);
    setGameMoves([]);
    if (h.game_kind === "domino") {
      const { data: mv } = await supabase
        .from("game_moves")
        .select("*")
        .eq("game_id", h.id)
        .order("created_at", { ascending: true });
      setGameMoves(mv ?? []);
    } else if (h.game_kind === "ludo") {
      const { data: lg } = await supabase.from("ludo_games" as any).select("*").eq("id", h.id).maybeSingle();
      if (lg) setSelectedGame({ ...h, _ludoState: lg });
    } else if (h.game_kind === "petanque") {
      const { data: pg } = await supabase.from("petanque_games" as any).select("*").eq("id", h.id).maybeSingle();
      if (pg) setSelectedGame({ ...h, _petState: pg });
    }
    // VAR verify
    try {
      const { data: v } = await supabase.rpc("verify_game_settlement" as any, { _kind: h.game_kind, _game_id: h.id });
      setSelectedGame((prev: any) => prev ? { ...prev, _verify: v } : prev);
    } catch {}
  };

  const deleteGame = async (h: any) => {
    if (!adminId) return toast.error("Andraso kely...");
    if (h.status === "in_progress" || h.status === "waiting") {
      return toast.error("Tsy azo fafàna ny lalao mbola mandeha. Annuler aloha.");
    }
    if (!confirm(`Hamafa ny lalao Nº${h.ticket_number} (${h.game_kind})? Tsy azo averina.`)) return;
    const rpc = h.game_kind === "ludo" ? "admin_delete_ludo_game"
              : h.game_kind === "petanque" ? "admin_delete_petanque_game"
              : "admin_delete_game";
    const { error } = await supabase.rpc(rpc as any, { _game_id: h.id, _admin_id: adminId });
    if (error) return toast.error(error.message);
    toast.success("Voafafa ny tantaran'ny lalao");
    setSelectedGame(null);
    load();
  };

  const deposits = pending.filter(t => t.type === "deposit");
  const withdrawals = pending.filter(t => t.type === "withdrawal");
  const pendingUsersCount = users.filter(u => u.account_status === "pending").length;
  const txCount = pending.length;

  return (
    <div className="min-h-screen felt-bg">
      <header className="p-4 flex items-center gap-3 border-b border-primary/20">
        <Button variant="ghost" size="icon" onClick={() => nav("/")}><ArrowLeft /></Button>
        <h1 className="font-display text-xl font-bold gold-text flex-1">ADMINISTRATIF</h1>
        <Button size="sm" variant="outline" onClick={() => nav("/admin/security")} className="gap-1">
          <ShieldAlert className="w-4 h-4" /> Sécurité
        </Button>
      </header>
      <div className="p-4 max-w-2xl mx-auto">
        <div className="card-felt rounded-2xl p-4 mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><WalletIcon className="w-3 h-3" />Wallet Admin (commission 10%)</p>
            <p className="text-2xl font-display gold-text font-bold">{fmtAr(adminBalance)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">10% alaina automatique vao manomboka ny match</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 h-7 text-[11px] border-destructive/50 text-destructive hover:bg-destructive/10"
              onClick={() => { setCommissionResetOpen(true); setCommissionPin(""); }}
            >
              <RotateCcw className="w-3 h-3 mr-1" />Réinitialiser solde commission
            </Button>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowSecrets(s => !s)}>
            {showSecrets ? <><EyeOff className="w-4 h-4 mr-1" />Hafenina</> : <><Eye className="w-4 h-4 mr-1" />Code</>}
          </Button>
        </div>

        {/* Block / Unblock TOUT les comptes (admin 0345023006 ihany no afaka manao) */}
        <div className="card-felt rounded-2xl p-3 mb-4 flex flex-col sm:flex-row gap-2">
          <Button
            variant="destructive"
            className="flex-1 font-bold"
            onClick={() => { setBlockAllOpen(true); setBlockAllPin(""); }}
          >
            🔒 Bloqué tout le compte
          </Button>
          <Button
            className="flex-1 font-bold bg-green-600 hover:bg-green-700 text-white"
            onClick={() => { setUnblockAllOpen(true); setUnblockAllPin(""); }}
          >
            🔓 Débloquer tout le compte
          </Button>
        </div>

        <button
          onClick={() => setShowTotal((v) => !v)}
          className="card-felt rounded-xl p-3 mb-4 w-full text-left border border-primary/30 hover:bg-primary/5 transition"
        >
          <p className="text-xs text-muted-foreground">💰 Solde mpilalao azo ampiasaina (kitiho hijery)</p>
          {showTotal ? (
            <p className="text-2xl font-display gold-text font-bold">
              {fmtAr(totalPlayerBalance ?? 0)}
            </p>
          ) : (
            <p className="text-2xl font-display gold-text font-bold tracking-widest">••••••</p>
          )}
          <p className="text-[10px] text-muted-foreground mt-1">Wallet an'ny mpilalao rehetra, nesorina ny vola mbola mihidy ao anaty lalao mandeha</p>
        </button>

        <div className="card-felt rounded-xl p-3 mb-4 border border-amber-500/30">
          <p className="text-xs text-muted-foreground">🔒 Vola voafihina amin'ny lalao mandeha (cash_pool)</p>
          <p className="text-xl font-display gold-text font-bold">{fmtAr(lockedCashPool ?? 0)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">Tsy tafiditra ao amin'ny solde mpilalao — averina amin'ny pandresy rehefa vita ny lalao</p>
        </div>

        {/* Fanazavana mazava ny calcul — mba tsy hisalasalana */}
        <div className="card-felt rounded-xl p-3 mb-4 border border-primary/20">
          <p className="text-[11px] font-bold text-primary mb-1">📊 Fanazavana calcul vola</p>
          <div className="text-[10px] text-muted-foreground space-y-1 leading-relaxed">
            <p><b>Total système</b> = Wallet mpilalao + Wallet Admin + Cash pool mihidy.</p>
            <p>Manodidina: <b className="gold-text">{fmtAr((totalPlayerBalance ?? 0) + adminBalance + (lockedCashPool ?? 0))}</b></p>
            <p>► Mitombo IHANY raha misy <b>dépôt nankatoavina</b>.</p>
            <p>► Mihena IHANY raha misy <b>retrait nankatoavina</b>.</p>
            <p>► Isaky ny lalao vita: solde mpilalao MIHENA -{`{commission}`} Ar (lasa ao amin'ny Admin), ny totalin'ny système tsy miova.</p>
          </div>
        </div>

        <Tabs defaultValue="users">
          <TabsList className="grid grid-cols-7 w-full text-[10px]">
            <TabsTrigger value="users" className="relative">
              Mpilalao
              {pendingUsersCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-5 h-5 text-[10px] flex items-center justify-center font-bold">{pendingUsersCount}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="profiles" className="relative">
              Profils
              {pendingProfileCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full min-w-[22px] h-[22px] px-1.5 text-[10px] flex items-center justify-center font-bold ring-2 ring-red-300 animate-pulse shadow-lg shadow-red-500/60">
                  {pendingProfileCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="tx" className="relative">
              Transactions
              {txCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-destructive rounded-full w-2.5 h-2.5" />
              )}
            </TabsTrigger>
            <TabsTrigger value="reset">Reset</TabsTrigger>
            <TabsTrigger value="broadcast">Annonce</TabsTrigger>
            <TabsTrigger value="history">Historique</TabsTrigger>
            <TabsTrigger value="commissions">Commission</TabsTrigger>
          </TabsList>

          {/* MPILALAO */}
          <TabsContent value="users" className="space-y-2 mt-3 max-h-[70vh] overflow-y-auto">
            <div className="card-felt rounded-xl p-3 mb-2 border-l-4 border-primary">
              <p className="text-xs text-foreground/80">👥 <b>Lisitra ny mpilalao.</b> Tsindrio ny anarana hijery ny mombamomba azy. Marika mena = miandry fakatoavana.</p>
              <div className="relative mt-2">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="ID (0001…), anarana, na numéro"
                  className="pl-9"
                />
              </div>
            </div>
            {users.length === 0 && <p className="text-center text-muted-foreground py-6">Tsy mbola misy mpilalao</p>}
            {users
              .filter((u) => {
                const q = userSearch.trim().toLowerCase();
                if (!q) return true;
                const idStr = u.player_number != null ? String(u.player_number).padStart(4, "0") : "";
                return (
                  idStr.includes(q) ||
                  String(u.player_number ?? "").includes(q) ||
                  (u.mvola_name ?? "").toLowerCase().includes(q) ||
                  (u.phone ?? "").toLowerCase().includes(q)
                );
              })
              .map((u) => (
              <button
                key={u.user_id}
                onClick={() => setSelectedUser(u)}
                className="w-full card-felt rounded-xl p-3 text-sm text-left hover:bg-primary/5 transition relative"
              >
                {u.account_status === "pending" && (
                  <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-5 h-5 text-[10px] flex items-center justify-center font-bold">!</span>
                )}
                <div className="flex items-center justify-between">
                  <p className="font-bold flex items-center gap-2">
                    <span className={`inline-block w-2 h-2 rounded-full ${u.is_online ? "bg-green-500" : "bg-muted"}`} />
                    {u.player_number != null && (
                      <span className="font-mono text-[10px] gold-text bg-primary/15 border border-primary/30 px-1.5 py-0.5 rounded">
                        #{String(u.player_number).padStart(4, "0")}
                      </span>
                    )}
                    {u.mvola_name}
                  </p>
                  <p className="gold-text font-bold text-xs">{fmtAr(u._balance ?? 0)}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {u.phone} ·{" "}
                  <span className={u.account_status === "active" ? "text-green-500" : u.account_status === "blocked" ? "text-destructive" : "text-yellow-500"}>
                    {u.account_status === "pending" ? "Miandry" : u.account_status === "active" ? "Active" : "Bloqué"}
                  </span>
                </p>
              </button>
            ))}
          </TabsContent>

          {/* PROFILS — pending profile change requests */}
          <TabsContent value="profiles" className="space-y-2 mt-3 max-h-[70vh] overflow-y-auto">
            <div className="card-felt rounded-xl p-3 mb-2 border-l-4 border-red-500">
              <p className="text-xs text-foreground/80">
                🔴 <b>Fanovana mombamomba miandry validation.</b> Jereo tsara ny "taloha vs vaovao" alohan'ny mankatò.
              </p>
            </div>
            <PendingProfileApprovals onChange={() => undefined} />
          </TabsContent>

          {/* TRANSACTIONS */}
          <TabsContent value="tx" className="space-y-2 mt-3">
            <div className="card-felt rounded-xl p-3 mb-2 border-l-4 border-primary">
              <p className="text-xs text-foreground/80">💰 <b>Transactions miandry.</b> Sokafy: Dépôt na Retrait. Hamarino tsara aloha vao Approuver.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={txSubTab === "deposit" ? "default" : "outline"}
                onClick={() => setTxSubTab("deposit")}
                className="relative"
              >
                <ArrowDownToLine className="w-4 h-4 mr-1" />Dépôt
                {deposits.length > 0 && <span className="absolute -top-1 -right-1 bg-destructive rounded-full w-2.5 h-2.5" />}
              </Button>
              <Button
                variant={txSubTab === "withdrawal" ? "default" : "outline"}
                onClick={() => setTxSubTab("withdrawal")}
                className="relative"
              >
                <ArrowUpFromLine className="w-4 h-4 mr-1" />Retrait
                {withdrawals.length > 0 && <span className="absolute -top-1 -right-1 bg-destructive rounded-full w-2.5 h-2.5" />}
              </Button>
            </div>

            {(txSubTab === "deposit" ? deposits : withdrawals).length === 0 && (
              <p className="text-center text-muted-foreground py-6">Tsy misy en attente</p>
            )}
            {(txSubTab === "deposit" ? deposits : withdrawals).map((t) => (
              <div key={t.id} className="card-felt rounded-xl p-3 relative">
                <span className="absolute -top-1 -right-1 bg-destructive rounded-full w-2.5 h-2.5" />
                <div className="flex justify-between items-start">
                  <div className="text-sm">
                    <p className="font-bold">{t.profiles?.mvola_name}</p>
                    <p className="text-xs text-muted-foreground">Compte: {t.profiles?.phone}</p>
                    <p className="mt-1">Vola: <b className="gold-text">{fmtAr(t.amount)}</b></p>
                    {t.mvola_phone && <p className="text-xs">Numéro MVola: <b>{t.mvola_phone}</b></p>}
                    {t.mvola_reference && <p className="text-xs">Réf: <b>{t.mvola_reference}</b></p>}
                    <p className="text-[10px] text-muted-foreground mt-1">{new Date(t.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button size="sm" onClick={() => approveTx(t)} className="btn-gold"><Check className="w-4 h-4" /></Button>
                    <Button size="sm" variant="destructive" onClick={() => rejectTx(t)}><X className="w-4 h-4" /></Button>
                    <Button size="sm" variant="outline" onClick={() => deleteTx(t)} title="Suprimer"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="reset" className="space-y-2 mt-3">
            <div className="card-felt rounded-xl p-3 mb-2 border-l-4 border-primary">
              <p className="text-xs text-foreground/80">🔑 <b>Reset PWD.</b> Demande hanovana mot de passe.</p>
            </div>
            {resets.length === 0 && <p className="text-center text-muted-foreground py-6">Tsy misy demande</p>}
            {resets.map((r) => (
              <div key={r.id} className="card-felt rounded-xl p-3">
                <p className="font-bold">{r.profiles?.mvola_name} ({r.profiles?.phone})</p>
                <p className="text-sm mt-1">{r.message}</p>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="broadcast" className="mt-3 space-y-3">
            <div className="card-felt rounded-xl p-3 border-l-4 border-primary">
              <p className="text-xs text-foreground/80">📢 <b>Annonce.</b> Hafatra alefa amin'ny mpilalao rehetra.</p>
            </div>
            <div className="card-felt rounded-xl p-4">
              <Megaphone className="w-6 h-6 text-primary mb-2" />
              <Input value={broadcast} onChange={(e) => setBroadcast(e.target.value)} placeholder="Hafatra..." />
              <Button onClick={sendBroadcast} className="btn-gold mt-2 w-full">Mandefa</Button>
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-3 space-y-2 max-h-[70vh] overflow-y-auto">
            <div className="card-felt rounded-xl p-3 mb-2 border-l-4 border-primary">
              <p className="text-xs text-foreground/80 flex items-center gap-1"><History className="w-3 h-3" /><b>Historique jeux Domino + Ludo + Pétanque.</b> Karohy araka ny Numéro Ticket, sokajy, na anaran'ny mpilalao.</p>
            </div>
            <div className="card-felt rounded-xl p-3 space-y-3 border border-destructive/30">
              <div>
                <p className="text-xs font-bold text-destructive">Annuler du jeu</p>
                <p className="text-[11px] text-muted-foreground">Colle numéro ticket, hiseho automatique ny sokajy sy ny status, dia afaka averina amin'ny mpilalao ny mise rehetra.</p>
              </div>
              <Input
                value={cancelTicketInput}
                onChange={(e) => setCancelTicketInput(e.target.value)}
                placeholder="Colle numéro ticket..."
              />
              {cancelTicketInput.trim() && (
                detectedCancelGame ? (
                  <div className="rounded-lg border border-primary/20 bg-card/40 p-3 text-xs space-y-1">
                    <p><b>Type:</b> {detectedCancelGame.game_kind === "ludo" ? "Ludo" : detectedCancelGame.game_kind === "petanque" ? "Pétanque" : "Domino"}</p>
                    <p><b>Status:</b> {detectedCancelGame.status}</p>
                    <p><b>Ticket:</b> Nº{detectedCancelGame.ticket_number}</p>
                    <p><b>Mpilalao:</b> {(detectedCancelGame._players ?? []).join(" · ")}</p>
                  </div>
                ) : (
                  <p className="text-xs text-destructive">Tsy hita io numéro ticket io.</p>
                )
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button
                  variant="destructive"
                  disabled={!detectedCancelGame || !["waiting", "in_progress", "blocked"].includes(detectedCancelGame.status)}
                  onClick={() => { setCancelPin(""); setCancelOpen(true); }}
                >
                  Annulé confirmer
                </Button>
                <Button
                  variant="outline"
                  className="border-destructive/50 text-destructive hover:bg-destructive/10"
                  onClick={() => { setCancelAllPin(""); setCancelAllOpen(true); }}
                >
                  Annuler jeux en cours
                </Button>
              </div>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="TICKET Nº na anarana..."
                className="pl-9"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">{filteredHistory.length} / {history.length} lalao</p>
            {filteredHistory.map((h) => {
              const start = h.turn_started_at ?? h.created_at;
              const isCancelable = ["waiting", "in_progress", "blocked"].includes(h.status);
              return (
                <button
                  key={h.id}
                  onClick={() => openGameDetails(h)}
                  className="w-full text-left card-felt rounded-xl p-3 text-xs space-y-1 hover:bg-primary/5 transition"
                >
                  <div className="flex justify-between items-start">
                    <p className="font-mono font-bold gold-text uppercase">{h.game_kind} · Nº{h.ticket_number}</p>
                    <span className={`px-2 py-0.5 rounded text-[10px] ${h.status === "finished" ? "bg-success/20 text-success" : h.status === "blocked" ? "bg-destructive/20 text-destructive" : "bg-muted/40"}`}>
                      {h.status}
                    </span>
                  </div>
                  <p><b>{(h._players ?? []).join(" · ")}</b></p>
                  <p>Mise: <b className="gold-text">{fmtAr(h.stake)}</b></p>
                  {h._winnerName && <p>🏆 Pandresy: <b className="text-success">{h._winnerName}</b></p>}
                  <p className="text-[10px] text-muted-foreground">
                    Niatomboka: {new Date(start).toLocaleString()}<br />
                    {h.finished_at && <>Niafarany: {new Date(h.finished_at).toLocaleString()}</>}
                  </p>
                  <p className="text-[10px] text-primary mt-1">▶ Tsindrio hijery filaharana...</p>
                  <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                    {isCancelable && (
                      <Button size="sm" variant="destructive" className="text-[10px] h-7" onClick={(e) => { e.stopPropagation(); setCancelTicketInput(h.ticket_number ?? ""); setCancelPin(""); setCancelOpen(true); }}>
                        Annuler
                      </Button>
                    )}
                    {(h.status === "finished" || h.status === "cancelled") && (
                      <Button size="sm" variant="outline" className="text-[10px] h-7 ml-2 border-destructive/50 text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); deleteGame(h); }}>
                        <Trash2 className="w-3 h-3 mr-1" /> Mamafa
                      </Button>
                    )}
                  </div>
                </button>
              );
            })}
            {filteredHistory.length === 0 && <p className="text-center text-muted-foreground py-6">Tsy misy historique</p>}
          </TabsContent>

          {/* COMMISSIONS ADMIN */}
          <TabsContent value="commissions" className="mt-3 space-y-2 max-h-[70vh] overflow-y-auto">
            <div className="card-felt rounded-xl p-3 mb-2 border-l-4 border-amber-500">
              <p className="text-xs text-foreground/80">
                <b>Lisitra ny commission 10% azon'ny Admi</b> isaky ny lalao vita (Domino · Ludo · Pétanque).
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Fitambarany: <b className="gold-text">{fmtAr(commissions.reduce((s, c) => s + c.commission, 0))}</b>
                {" · "}{commissions.length} lalao
              </p>
            </div>
            {commissions.map((c) => (
              <div key={`${c.game_kind}-${c.id}`} className="card-felt rounded-xl p-3 text-xs space-y-1">
                <div className="flex justify-between items-start">
                  <p className="font-mono font-bold gold-text uppercase">{c.game_kind} · Nº{c.ticket_number}</p>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-600 font-bold">
                    +{fmtAr(c.commission)}
                  </span>
                </div>
                <p><b>{(c.players ?? []).join(" · ")}</b></p>
                <p>
                  Mise: <b>{fmtAr(c.stake)}</b> × {c.players_count} mpilalao
                  {" → "}10% = <b className="gold-text">{fmtAr(c.commission)}</b>
                </p>
                {c.winner && <p>🏆 Pandresy: <b className="text-success">{c.winner}</b></p>}
                <p className="text-[10px] text-muted-foreground">
                  {c.finished_at ? new Date(c.finished_at).toLocaleString() : ""}
                </p>
              </div>
            ))}
            {commissions.length === 0 && (
              <p className="text-center text-muted-foreground py-6">Tsy mbola misy commission</p>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* DETAILS LALAO — filaharan'ny vato napetraka */}
      <Dialog open={!!selectedGame} onOpenChange={(o) => !o && setSelectedGame(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="gold-text font-mono">Nº{selectedGame?.ticket_number}</DialogTitle>
          </DialogHeader>
          {selectedGame && (
            <div className="space-y-2 text-sm">
              <Row label="Sokajy" value={selectedGame.game_kind === "ludo" ? "Ludo" : selectedGame.game_kind === "petanque" ? "Pétanque" : "Domino"} />
              <Row label="Mpilalao" value={(selectedGame._players ?? []).join(" · ")} />
              <Row label="Mise" value={fmtAr(selectedGame.stake)} />
              <Row label="Pandresy" value={selectedGame._winnerName ?? "—"} />
              <Row label="Status" value={selectedGame.status} />
              <Row label="Niatomboka" value={new Date(selectedGame.turn_started_at ?? selectedGame.created_at).toLocaleString()} />
              <Row label="Niafarany" value={selectedGame.finished_at ? new Date(selectedGame.finished_at).toLocaleString() : "—"} />
              {selectedGame.game_kind === "domino" && <div className="pt-2">
                <p className="text-xs font-bold gold-text mb-2">Filaharan'ny vato napetraka ({gameMoves.length}) — flèche = lafiny nametrahana</p>
                <div className="max-h-72 overflow-y-auto space-y-1">
                  {gameMoves.length === 0 && <p className="text-[11px] text-muted-foreground text-center py-3">Tsy misy hetsika voarakitra</p>}
                  {gameMoves.map((m, i) => {
                    const piece = m.piece as { tile?: [number, number]; flipped?: boolean } | null;
                    const tile = piece?.tile;
                    const playerName = (selectedGame._players ?? [])[m.player_id === selectedGame.player1_id ? 0 : m.player_id === selectedGame.player2_id ? 1 : 2] ?? "?";
                    const prevPlayer = i > 0 ? (selectedGame._players ?? [])[gameMoves[i-1].player_id === selectedGame.player1_id ? 0 : gameMoves[i-1].player_id === selectedGame.player2_id ? 1 : 2] : null;
                    return (
                      <div key={m.id} className="flex items-center gap-2 rounded-lg border border-primary/20 p-2 bg-card/40">
                        <span className="text-[10px] font-mono text-muted-foreground w-6">{i + 1}.</span>
                        {tile ? <DominoTile a={tile[0]} b={tile[1]} size="sm" horizontal /> : <span className="text-xs">—</span>}
                        <div className="flex-1 text-[11px]">
                          <p className="font-bold">
                            {prevPlayer && <span className="text-muted-foreground font-normal">{prevPlayer} → </span>}
                            {playerName}
                          </p>
                          <p className="text-muted-foreground">
                            {m.side === "left" ? "⬅ napetraka havia" : m.side === "right" ? "napetraka havanana ➡" : "—"}
                            {(m.piece as any)?.auto ? " · ⏱ auto (timeout)" : ""}
                            {" · "}
                            {new Date(m.created_at).toLocaleTimeString(undefined, { hour12: false })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>}
              {selectedGame.game_kind === "ludo" && selectedGame._ludoState && (
                <div className="pt-2">
                  <p className="text-xs font-bold gold-text mb-2">VAR — État farany Ludo</p>
                  <div className="rounded-lg border border-primary/20 p-2 bg-card/40 text-[11px] space-y-1">
                    <p>Seat amperinasa: <b>{selectedGame._ludoState.current_turn_seat}</b> · Dice farany: <b>{selectedGame._ludoState.last_dice ?? "—"}</b></p>
                    <p>Mpilalao: <b>{(selectedGame._players ?? []).join(" · ")}</b></p>
                    <details>
                      <summary className="cursor-pointer text-primary">Pawns (JSON)</summary>
                      <pre className="text-[10px] whitespace-pre-wrap break-all max-h-48 overflow-y-auto">{JSON.stringify(selectedGame._ludoState.pawns, null, 2)}</pre>
                    </details>
                  </div>
                </div>
              )}
              {selectedGame.game_kind === "petanque" && selectedGame._petState && (
                <div className="pt-2">
                  <p className="text-xs font-bold gold-text mb-2">VAR — État farany Pétanque</p>
                  <div className="rounded-lg border border-primary/20 p-2 bg-card/40 text-[11px] space-y-1">
                    <p>Score: <b>P1 {selectedGame._petState.score_p1} — P2 {selectedGame._petState.score_p2}</b> · Round: <b>{selectedGame._petState.round_number}</b></p>
                    <details>
                      <summary className="cursor-pointer text-primary">Balls + Jack (JSON)</summary>
                      <pre className="text-[10px] whitespace-pre-wrap break-all max-h-48 overflow-y-auto">{JSON.stringify(selectedGame._petState.state, null, 2)}</pre>
                    </details>
                  </div>
                </div>
              )}
              {selectedGame._verify && (
                <div className="pt-2">
                  <p className="text-xs font-bold gold-text mb-1">Fanamarinana calcul</p>
                  <div className={`rounded-lg border p-2 text-[11px] ${selectedGame._verify.commission_ok && selectedGame._verify.pot_ok ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5"}`}>
                    <p>Commission attendue: <b>{fmtAr(selectedGame._verify.expected_commission)}</b> · réelle: <b>{fmtAr(selectedGame._verify.actual_commission ?? 0)}</b> {selectedGame._verify.commission_ok ? "✓" : "✗"}</p>
                    <p>Pot attendu: <b>{fmtAr(selectedGame._verify.expected_pot)}</b> · payé: <b>{fmtAr(selectedGame._verify.pot_paid ?? 0)}</b> {selectedGame._verify.pot_ok ? "✓" : "✗"}</p>
                  </div>
                </div>
              )}
              {(selectedGame.status === "finished" || selectedGame.status === "cancelled") && (
                <Button variant="outline" className="w-full mt-3 border-destructive/50 text-destructive hover:bg-destructive/10" onClick={() => deleteGame(selectedGame)}>
                  <Trash2 className="w-4 h-4 mr-1" /> Mamafa ny tantaran'ity lalao ity
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full mt-2 border-primary/50 text-primary hover:bg-primary/10"
                onClick={async () => {
                  const kind = selectedGame.game_kind;
                  const url = `${window.location.origin}/replay/${kind}/${selectedGame.id}`;
                  const movesText = kind === "domino" ? gameMoves.map((m, i) => {
                    const piece = m.piece as any;
                    const tile = piece?.tile;
                    const pName = (selectedGame._players ?? [])[m.player_id === selectedGame.player1_id ? 0 : m.player_id === selectedGame.player2_id ? 1 : 2] ?? "?";
                    return `${i + 1}. ${pName} → [${tile?.[0]}|${tile?.[1]}] ${m.side === "left" ? "⬅" : "➡"}`;
                  }).join("\n") : "";
                  const summary =
                    `🎴 ${kind?.toUpperCase()} · Nº${selectedGame.ticket_number}\n` +
                    `Mpilalao: ${(selectedGame._players ?? []).join(" · ")}\n` +
                    `Mise: ${fmtAr(selectedGame.stake)}\n` +
                    `🏆 Pandresy: ${selectedGame._winnerName ?? "—"}\n` +
                    `Status: ${selectedGame.status}\n` +
                    (movesText ? `\n— Filaharana —\n${movesText}\n` : "") +
                    `\n🔗 ${url}`;
                  try {
                    if (navigator.share) {
                      await navigator.share({ title: `Tatara lalao Nº${selectedGame.ticket_number}`, text: summary });
                    } else {
                      await navigator.clipboard.writeText(summary);
                      toast.success("Voakopia — azonao apetaka any amin'ny reseau sociaux");
                    }
                  } catch {
                    try {
                      await navigator.clipboard.writeText(summary);
                      toast.success("Voakopia ny tatara");
                    } catch {
                      toast.error("Tsy nahomby ny fanakopiana");
                    }
                  }
                }}
              >
                <Share2 className="w-4 h-4 mr-1" /> Hizara ity tatara ity
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={(o) => !o && setCancelOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annuler du jeu</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Annulation administrative: tsimisy resy, tsimisy pandresy, miverina avokoa ny mise ary esorina koa ny commission 10%.</p>
            <Row label="Ticket" value={detectedCancelGame?.ticket_number ? `Nº${detectedCancelGame.ticket_number}` : cancelTicketInput || "—"} mono />
            <Row label="Sokajy" value={detectedCancelGame ? (detectedCancelGame.game_kind === "ludo" ? "Ludo" : detectedCancelGame.game_kind === "petanque" ? "Pétanque" : "Domino") : "—"} />
            <Row label="Status" value={detectedCancelGame?.status ?? "—"} />
            <Input type="password" inputMode="numeric" maxLength={6} value={cancelPin} onChange={(e) => setCancelPin(e.target.value)} placeholder="Codé ADMINISTRATIF 2583" />
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelOpen(false)}>Annuler</Button>
              <Button variant="destructive" disabled={!detectedCancelGame} onClick={cancelGameByTicket}>OK voafafa avy hatrany</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelAllOpen} onOpenChange={(o) => !o && setCancelAllOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annuler tous les jeux en cours</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Foanana daholo ny Domino sy Ludo mbola mandeha na miandry amin'izao fotoana izao, ary averina amin'ny mpilalao tsirairay ny volany.</p>
            <Input type="password" inputMode="numeric" maxLength={6} value={cancelAllPin} onChange={(e) => setCancelAllPin(e.target.value)} placeholder="Codé ADMINISTRATIF 2583" />
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelAllOpen(false)}>Annuler</Button>
              <Button variant="destructive" onClick={cancelAllActiveGames}>Confirmer</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={blockAllOpen} onOpenChange={(o) => !o && setBlockAllOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">🔒 Bloqué tout le compte</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Hosakanana daholo ny compte mpilalao rehetra eto amin'ny app (afa-tsy ny compte administratif). Tsy hisy afaka miditra intsony.</p>
            <Input type="password" inputMode="numeric" maxLength={6} value={blockAllPin} onChange={(e) => setBlockAllPin(e.target.value)} placeholder="Codé ADMINISTRATIF 2583" />
            <DialogFooter>
              <Button variant="outline" onClick={() => setBlockAllOpen(false)}>Hialana</Button>
              <Button variant="destructive" onClick={blockAllAccounts}>Hamarino — Sakàno daholo</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={unblockAllOpen} onOpenChange={(o) => !o && setUnblockAllOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-green-500">🔓 Débloquer tout le compte</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Hosokafana daholo ny compte mpilalao voasakana rehetra. Afaka miverina milalao avokoa izy ireo.</p>
            <Input type="password" inputMode="numeric" maxLength={6} value={unblockAllPin} onChange={(e) => setUnblockAllPin(e.target.value)} placeholder="Codé ADMINISTRATIF 2583" />
            <DialogFooter>
              <Button variant="outline" onClick={() => setUnblockAllOpen(false)}>Hialana</Button>
              <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={unblockAllAccounts}>Hamarino — Sokafy daholo</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* DETAILS MODAL */}
      <Dialog open={!!selectedUser} onOpenChange={(o) => !o && setSelectedUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="gold-text">Profil mpilalao</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-2 text-sm">
              {selectedUser.selfie_url && (
                <div className="flex justify-center mb-2">
                  <a href={selectedUser.selfie_url} target="_blank" rel="noreferrer">
                    <img
                      src={selectedUser.selfie_url}
                      alt="selfie"
                      className="w-32 h-32 rounded-xl object-cover border-2 border-primary/50 shadow-lg"
                    />
                  </a>
                </div>
              )}
              <Row label="Nom utilisateur" value={selectedUser.mvola_name} />
              <Row label="Numéro téléphone" value={selectedUser.phone} />
              <Row label="Date de naissance" value={selectedUser.birth_date ?? "—"} />
              <Row label="Sexe" value={
                selectedUser.gender === "male" ? "LAHY" :
                selectedUser.gender === "female" ? "VAVY" :
                selectedUser.gender === "other" ? "HAFA" : "—"
              } />
              <Row label="Mot de passe" value={selectedUser.password_plain ?? "—"} mono />
              <Row label="PIN" value={selectedUser.pin_plain ?? "—"} mono />
              <Row label="Solde" value={fmtAr(selectedUser._balance ?? 0)} />
              <Row label="Situation" value={
                selectedUser.account_status === "pending" ? "Miandry fakatoavana" :
                selectedUser.account_status === "active" ? "✓ Approuvé" : "✗ Bloqué"
              } />
              <Row label="En ligne" value={selectedUser.is_online ? "🟢 Oui" : "⚫ Non"} />

              {/* Historique transactions an'ity mpilalao ity */}
              <div className="pt-3">
                <p className="text-xs font-bold gold-text mb-1 flex items-center gap-1"><History className="w-3 h-3" />Historique Transactions</p>
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {allTx.filter((t) => t.user_id === selectedUser.user_id).length === 0 && (
                    <p className="text-[11px] text-muted-foreground text-center py-2">Tsy mbola misy</p>
                  )}
                  {allTx.filter((t) => t.user_id === selectedUser.user_id).map((t) => (
                    <div key={t.id} className="rounded-lg border border-primary/20 p-2 text-[11px] bg-card/40">
                      <div className="flex justify-between items-center">
                        <span className="font-bold uppercase">
                          {t.type === "deposit" ? <span className="text-green-500">Dépôt</span> : <span className="text-yellow-500">Retrait</span>}
                          {" · "}
                          {t.status === "approved" ? <span className="text-success">Accepté ✓</span> : <span className="text-destructive">Refusé ✗</span>}
                        </span>
                        <span className="gold-text font-bold">{fmtAr(t.amount)}</span>
                      </div>
                      <p className="text-muted-foreground mt-0.5">
                        {t.processed_at ? new Date(t.processed_at).toLocaleString(undefined, { hour12: false }) : "—"}
                      </p>
                      <p className="text-muted-foreground">
                        Par: <b className="text-foreground">{adminNames[t.processed_by] ?? "Admin"}</b>
                        {t.mvola_reference && <> · Réf: <b className="text-foreground">{t.mvola_reference}</b></>}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {selectedUser.account_status === "pending" && (
                <div className="flex gap-2 pt-3">
                  <Button className="btn-gold flex-1" onClick={() => approveUser(selectedUser.user_id)}>
                    <UserCheck className="w-4 h-4 mr-1" />APPROUVER
                  </Button>
                  <Button variant="destructive" className="flex-1" onClick={() => { setRejectFor(selectedUser); setRejectMsg(""); }}>
                    <X className="w-4 h-4 mr-1" />REFUSER
                  </Button>
                </div>
              )}
              {selectedUser.account_status === "active" && (
                <Button variant="destructive" className="w-full mt-3" onClick={() => { setRejectFor(selectedUser); setRejectMsg(""); }}>
                  <X className="w-4 h-4 mr-1" />Bloquer + hafatra
                </Button>
              )}
              {selectedUser.account_status === "blocked" && (
                <Button className="btn-gold w-full mt-3" onClick={() => unblockUser(selectedUser.user_id)}>
                  <Unlock className="w-4 h-4 mr-1" />Débloquer
                </Button>
              )}
              <Button variant="outline" className="w-full mt-2 border-destructive/50 text-destructive hover:bg-destructive/10" onClick={() => { setResetTarget(selectedUser); setResetPin(""); }}>
                <RotateCcw className="w-4 h-4 mr-1" />Réinitialiser solde (PIN)
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* RESET BALANCE — mila PIN 2583 */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Réinitialiser solde — {resetTarget?.mvola_name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Ny solde dia hiverina 0 Ar. Ampidiro ny PIN administratif (2583) hanamafisana.</p>
          <Input type="password" inputMode="numeric" maxLength={6} value={resetPin} onChange={(e) => setResetPin(e.target.value)} placeholder="PIN" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>Aoka</Button>
            <Button variant="destructive" onClick={submitReset}>Hamafa solde</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RESET COMMISSION ADMIN — mila PIN 2583 */}
      <Dialog open={commissionResetOpen} onOpenChange={(o) => { if (!o) { setCommissionResetOpen(false); setCommissionPin(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Réinitialiser solde commission</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Ny solde Wallet Admin (commission) dia hiverina 0 Ar. Ampidiro ny PIN administratif (2583) hanamafisana.
          </p>
          <Input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={commissionPin}
            onChange={(e) => setCommissionPin(e.target.value)}
            placeholder="PIN"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCommissionResetOpen(false); setCommissionPin(""); }}>Annulé</Button>
            <Button variant="destructive" onClick={submitCommissionReset}>Confirmer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* REJECT WITH MESSAGE */}
      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hafatra hanazavana ny antony</DialogTitle>
          </DialogHeader>
          <Textarea
            value={rejectMsg}
            onChange={(e) => setRejectMsg(e.target.value)}
            placeholder="Ohatra: Mbola tsy feno taona ianao... na anarana MVola tsy mifanaraka..."
            rows={5}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)}>Aoka</Button>
            <Button variant="destructive" onClick={submitReject}>
              <MessageSquare className="w-4 h-4 mr-1" />Mandefa + Refuser
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div className="flex justify-between border-b border-primary/10 py-1.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`font-bold text-right ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
