import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Check, X, Megaphone, Wallet as WalletIcon, UserCheck, Eye, EyeOff, MessageSquare, ArrowDownToLine, ArrowUpFromLine, History, Search, Unlock } from "lucide-react";
import { fmtAr } from "@/lib/constants";
import { toast } from "sonner";

export default function Admin() {
  const { user, isAdmin } = useAuth();
  const nav = useNavigate();
  const codeOk = typeof window !== "undefined" && sessionStorage.getItem("admin_code_ok") === "1";
  const allowed = isAdmin || codeOk;
  const [pending, setPending] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [resets, setResets] = useState<any[]>([]);
  const [broadcast, setBroadcast] = useState("");
  const [adminBalance, setAdminBalance] = useState(0);
  const [showSecrets, setShowSecrets] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [rejectFor, setRejectFor] = useState<any | null>(null);
  const [rejectMsg, setRejectMsg] = useState("");
  const [txSubTab, setTxSubTab] = useState<"deposit" | "withdrawal">("deposit");
  const [resolvedAdminId, setResolvedAdminId] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  const [allTx, setAllTx] = useState<any[]>([]);
  const [adminNames, setAdminNames] = useState<Record<string, string>>({});
  const adminId = user?.id ?? resolvedAdminId;

  useEffect(() => {
    if (!user?.id && codeOk && !resolvedAdminId) {
      supabase.rpc("get_admin_id").then(({ data }) => {
        if (data) setResolvedAdminId(data as string);
      });
    }
  }, [user?.id, codeOk, resolvedAdminId]);

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
    }

    // Historique ny lalao rehetra
    const { data: hg } = await supabase
      .from("games")
      .select("id, ticket_number, stake, player1_id, player2_id, winner_id, status, created_at, finished_at, turn_started_at")
      .not("ticket_number", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);
    setHistory((hg ?? []).map((g: any) => ({
      ...g,
      _p1: profMap[g.player1_id]?.mvola_name ?? "?",
      _p2: profMap[g.player2_id]?.mvola_name ?? "?",
    })));
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
    const { error } = await supabase.rpc("reject_user_with_message", {
      _user_id: rejectFor.user_id, _admin_id: adminId, _message: rejectMsg.trim()
    });
    if (error) return toast.error(error.message);
    toast.success("Nolavina + hafatra nalefa");
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

  const filteredHistory = history.filter((h) => {
    if (!historySearch.trim()) return true;
    const q = historySearch.trim().toLowerCase();
    return (
      (h.ticket_number ?? "").toLowerCase().includes(q) ||
      (h._p1 ?? "").toLowerCase().includes(q) ||
      (h._p2 ?? "").toLowerCase().includes(q)
    );
  });

  const deposits = pending.filter(t => t.type === "deposit");
  const withdrawals = pending.filter(t => t.type === "withdrawal");
  const pendingUsersCount = users.filter(u => u.account_status === "pending").length;
  const txCount = pending.length;

  return (
    <div className="min-h-screen felt-bg">
      <header className="p-4 flex items-center gap-3 border-b border-primary/20">
        <Button variant="ghost" size="icon" onClick={() => nav("/")}><ArrowLeft /></Button>
        <h1 className="font-display text-xl font-bold gold-text">ADMINISTRATIF</h1>
      </header>
      <div className="p-4 max-w-2xl mx-auto">
        <div className="card-felt rounded-2xl p-4 mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><WalletIcon className="w-3 h-3" />Wallet Admin (commission 10%)</p>
            <p className="text-2xl font-display gold-text font-bold">{fmtAr(adminBalance)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">10% alaina automatique vao manomboka ny match</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowSecrets(s => !s)}>
            {showSecrets ? <><EyeOff className="w-4 h-4 mr-1" />Hafenina</> : <><Eye className="w-4 h-4 mr-1" />Code</>}
          </Button>
        </div>

        <Tabs defaultValue="users">
          <TabsList className="grid grid-cols-5 w-full text-[10px]">
            <TabsTrigger value="users" className="relative">
              Mpilalao
              {pendingUsersCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-5 h-5 text-[10px] flex items-center justify-center font-bold">{pendingUsersCount}</span>
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
          </TabsList>

          {/* MPILALAO */}
          <TabsContent value="users" className="space-y-2 mt-3 max-h-[70vh] overflow-y-auto">
            <div className="card-felt rounded-xl p-3 mb-2 border-l-4 border-primary">
              <p className="text-xs text-foreground/80">👥 <b>Lisitra ny mpilalao.</b> Tsindrio ny anarana hijery ny mombamomba azy. Marika mena = miandry fakatoavana.</p>
            </div>
            {users.length === 0 && <p className="text-center text-muted-foreground py-6">Tsy mbola misy mpilalao</p>}
            {users.map((u) => (
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
              <p className="text-xs text-foreground/80 flex items-center gap-1"><History className="w-3 h-3" /><b>Historique ny lalao.</b> Karohy araka ny Numéro Ticket na anaran'ny mpilalao.</p>
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
              const winnerName = h.winner_id === h.player1_id ? h._p1 : h.winner_id === h.player2_id ? h._p2 : null;
              const loserName = h.winner_id === h.player1_id ? h._p2 : h.winner_id === h.player2_id ? h._p1 : null;
              const start = h.turn_started_at ?? h.created_at;
              return (
                <div key={h.id} className="card-felt rounded-xl p-3 text-xs space-y-1">
                  <div className="flex justify-between items-start">
                    <p className="font-mono font-bold gold-text">Nº{h.ticket_number}</p>
                    <span className={`px-2 py-0.5 rounded text-[10px] ${h.status === "finished" ? "bg-success/20 text-success" : h.status === "blocked" ? "bg-destructive/20 text-destructive" : "bg-muted/40"}`}>
                      {h.status}
                    </span>
                  </div>
                  <p><b>{h._p1}</b> vs <b>{h._p2}</b></p>
                  <p>Mise: <b className="gold-text">{fmtAr(h.stake)}</b></p>
                  {winnerName && <p>🏆 Pandresy: <b className="text-success">{winnerName}</b> · Resy: {loserName}</p>}
                  <p className="text-[10px] text-muted-foreground">
                    Niatomboka: {new Date(start).toLocaleString()}<br />
                    {h.finished_at && <>Niafarany: {new Date(h.finished_at).toLocaleString()}</>}
                  </p>
                </div>
              );
            })}
            {filteredHistory.length === 0 && <p className="text-center text-muted-foreground py-6">Tsy misy historique</p>}
          </TabsContent>
        </Tabs>
      </div>

      {/* DETAILS MODAL */}
      <Dialog open={!!selectedUser} onOpenChange={(o) => !o && setSelectedUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="gold-text">Profil mpilalao</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-2 text-sm">
              <Row label="Nom utilisateur" value={selectedUser.mvola_name} />
              <Row label="Numéro téléphone" value={selectedUser.phone} />
              <Row label="Date de naissance" value={selectedUser.birth_date ?? "—"} />
              <Row label="Sexe" value={selectedUser.gender ?? "—"} />
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
            </div>
          )}
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
