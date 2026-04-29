import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Check, X, Megaphone, Wallet as WalletIcon, UserCheck, Eye, EyeOff, MessageSquare, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
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

    // 4) Password resets
    const { data: r } = await supabase
      .from("password_reset_requests")
      .select("*")
      .eq("status", "pending");
    setResets((r ?? []).map((rr: any) => ({ ...rr, profiles: profMap[rr.user_id] ?? null })));

    if (user?.id) {
      const { data: aw } = await supabase.from("admin_wallets").select("balance").eq("admin_id", user.id).maybeSingle();
      setAdminBalance(Number(aw?.balance ?? 0));
    }
  };

  useEffect(() => { if (allowed) load(); }, [allowed, user]);

  useEffect(() => {
    if (allowed && !isAdmin) {
      toast.warning("Mba ahafahana mampiasa ny ADM dia mila miditra amin'ny kaonty admin (0345023006)", { duration: 5000 });
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
    if (!user?.id) return toast.error("Mila miditra ny kaonty admin aloha");
    const { error } = await supabase.rpc("approve_user_with_message", { _user_id: uid, _admin_id: user.id });
    if (error) return toast.error(error.message);
    toast.success("Nankatoavina + hafatra nalefa");
    setSelectedUser(null);
    load();
  };

  const submitReject = async () => {
    if (!rejectFor || !user?.id) return;
    if (!rejectMsg.trim()) return toast.error("Soraty ny antony");
    const { error } = await supabase.rpc("reject_user_with_message", {
      _user_id: rejectFor.user_id, _admin_id: user.id, _message: rejectMsg.trim()
    });
    if (error) return toast.error(error.message);
    toast.success("Nolavina + hafatra nalefa");
    setRejectFor(null); setRejectMsg(""); setSelectedUser(null);
    load();
  };

  const approveTx = async (tx: any) => {
    if (!user?.id) return toast.error("Mila miditra ny kaonty admin aloha");
    const { data: w } = await supabase.from("wallets").select("balance").eq("user_id", tx.user_id).single();
    const cur = Number(w?.balance ?? 0);
    const amt = Number(tx.amount);
    let newBal = cur;
    if (tx.type === "deposit") newBal = cur + amt;
    else if (tx.type === "withdrawal") {
      if (cur < amt) return toast.error("Solde tsy ampy");
      newBal = cur - amt;
    }
    await supabase.from("wallets").update({ balance: newBal }).eq("user_id", tx.user_id);
    await supabase.from("transactions").update({ status: "approved", processed_by: user.id, processed_at: new Date().toISOString() }).eq("id", tx.id);
    await supabase.from("chat_messages").insert({
      sender_id: user.id, recipient_id: tx.user_id,
      content: `${tx.type === "deposit" ? "Dépôt" : "Retrait"} ${fmtAr(amt)} nankatoavina ✓`,
      is_admin_broadcast: false,
    });
    toast.success("Nankatoavina");
    load();
  };

  const rejectTx = async (tx: any) => {
    if (!user?.id) return toast.error("Mila miditra ny kaonty admin aloha");
    await supabase.from("transactions").update({ status: "rejected", processed_by: user.id, processed_at: new Date().toISOString() }).eq("id", tx.id);
    await supabase.from("chat_messages").insert({
      sender_id: user.id, recipient_id: tx.user_id,
      content: `${tx.type === "deposit" ? "Dépôt" : "Retrait"} ${fmtAr(tx.amount)} tsy nekena. Mba hamarino ny mombamomba ny transaction ataonao.`,
      is_admin_broadcast: false,
    });
    toast.error("Nolavina");
    load();
  };

  const sendBroadcast = async () => {
    if (!broadcast.trim()) return;
    if (!user?.id) return toast.error("Mila miditra ny kaonty admin aloha");
    await supabase.from("chat_messages").insert({ sender_id: user.id, content: broadcast.trim(), is_admin_broadcast: true });
    toast.success("Hafatra alefa amin'ny rehetra");
    setBroadcast("");
  };

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
          <TabsList className="grid grid-cols-4 w-full text-xs">
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
              <Row label="Solde" value={fmtAr(selectedUser.wallets?.[0]?.balance ?? 0)} />
              <Row label="Situation" value={
                selectedUser.account_status === "pending" ? "Miandry fakatoavana" :
                selectedUser.account_status === "active" ? "✓ Approuvé" : "✗ Bloqué"
              } />
              <Row label="En ligne" value={selectedUser.is_online ? "🟢 Oui" : "⚫ Non"} />

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
