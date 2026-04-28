import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Check, X, Megaphone, Wallet as WalletIcon, UserCheck, Eye, EyeOff, Ban } from "lucide-react";
import { fmtAr } from "@/lib/constants";
import { toast } from "sonner";

export default function Admin() {
  const { user, isAdmin } = useAuth();
  const nav = useNavigate();
  const codeOk = typeof window !== "undefined" && sessionStorage.getItem("admin_code_ok") === "1";
  const allowed = isAdmin || codeOk;
  const [pending, setPending] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [resets, setResets] = useState<any[]>([]);
  const [broadcast, setBroadcast] = useState("");
  const [adminBalance, setAdminBalance] = useState(0);
  const [showSecrets, setShowSecrets] = useState(false);

  const load = async () => {
    const { data: p } = await supabase.from("transactions").select("*, profiles!transactions_user_id_fkey(mvola_name, phone)").eq("status", "pending").order("created_at", { ascending: false });
    setPending(p ?? []);
    const { data: u } = await supabase.from("profiles").select("*, wallets(balance)").order("created_at", { ascending: false }).limit(100);
    setUsers(u ?? []);
    const { data: pu } = await supabase.from("profiles").select("*, wallets(balance)").eq("account_status", "pending").order("created_at", { ascending: false });
    setPendingUsers(pu ?? []);
    const { data: r } = await supabase.from("password_reset_requests").select("*, profiles!password_reset_requests_user_id_fkey(mvola_name, phone)").eq("status", "pending");
    setResets(r ?? []);
    if (user?.id) {
      const { data: aw } = await supabase.from("admin_wallets").select("balance").eq("admin_id", user.id).maybeSingle();
      setAdminBalance(Number(aw?.balance ?? 0));
    }
  };

  useEffect(() => { if (allowed) load(); }, [allowed, user]);

  const approveUser = async (uid: string) => {
    const { error } = await supabase.rpc("approve_user", { _user_id: uid });
    if (error) return toast.error(error.message);
    toast.success("Mpilalao nankatoavina");
    load();
  };
  const blockUser = async (uid: string) => {
    const { error } = await supabase.rpc("block_user", { _user_id: uid });
    if (error) return toast.error(error.message);
    toast.success("Mpilalao voasakana");
    load();
  };

  if (!allowed) return (
    <div className="min-h-screen felt-bg flex items-center justify-center text-center p-6">
      <div className="card-felt p-6 rounded-2xl">
        <p className="text-destructive mb-2">Tsy mahazo miditra ianao</p>
        <Button onClick={() => nav("/")}>Hiverina</Button>
      </div>
    </div>
  );

  const approve = async (tx: any) => {
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
    toast.success("Vita");
    load();
  };
  const reject = async (tx: any) => {
    if (!user?.id) return toast.error("Mila miditra ny kaonty admin aloha");
    await supabase.from("transactions").update({ status: "rejected", processed_by: user.id, processed_at: new Date().toISOString() }).eq("id", tx.id);
    load();
  };

  const sendBroadcast = async () => {
    if (!broadcast.trim()) return;
    if (!user?.id) return toast.error("Mila miditra ny kaonty admin aloha");
    await supabase.from("chat_messages").insert({ sender_id: user.id, content: broadcast.trim(), is_admin_broadcast: true });
    toast.success("Hafatra alefa amin'ny rehetra");
    setBroadcast("");
  };

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
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowSecrets(s => !s)}>
            {showSecrets ? <><EyeOff className="w-4 h-4 mr-1" />Hafenina</> : <><Eye className="w-4 h-4 mr-1" />Code</>}
          </Button>
        </div>
        <Tabs defaultValue="tx">
          <TabsList className="grid grid-cols-5 w-full text-xs">
            <TabsTrigger value="kyc">KYC ({pendingUsers.length})</TabsTrigger>
            <TabsTrigger value="tx">Transactions</TabsTrigger>
            <TabsTrigger value="users">Mpilalao</TabsTrigger>
            <TabsTrigger value="reset">Reset PWD</TabsTrigger>
            <TabsTrigger value="broadcast">Annonce</TabsTrigger>
          </TabsList>

          <TabsContent value="kyc" className="space-y-2 mt-3">
            {pendingUsers.length === 0 && <p className="text-center text-muted-foreground py-6">Tsy misy KYC miandry</p>}
            {pendingUsers.map((u) => (
              <div key={u.user_id} className="card-felt rounded-xl p-3">
                <div className="flex gap-3">
                  {u.selfie_url ? (
                    <img src={u.selfie_url} alt="selfie" className="w-20 h-20 rounded-lg object-cover border border-primary/30" />
                  ) : (
                    <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground">No selfie</div>
                  )}
                  <div className="flex-1 text-sm">
                    <p className="font-bold">{u.mvola_name}</p>
                    <p className="text-xs text-muted-foreground">{u.phone}</p>
                    <p className="text-xs">{u.gender ?? "?"} · {u.birth_date ?? "?"}</p>
                    {showSecrets && (
                      <p className="text-xs mt-1 font-mono bg-card/40 px-2 py-1 rounded">
                        PWD: <b>{u.password_plain ?? "?"}</b> · PIN: <b>{u.pin_plain ?? "?"}</b>
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <Button size="sm" className="btn-gold flex-1" onClick={() => approveUser(u.user_id)}>
                    <UserCheck className="w-4 h-4 mr-1" />APPROUVER
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => blockUser(u.user_id)}>
                    <Ban className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="tx" className="space-y-2 mt-3">
            {pending.length === 0 && <p className="text-center text-muted-foreground py-6">Tsy misy en attente</p>}
            {pending.map((t) => (
              <div key={t.id} className="card-felt rounded-xl p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold">{t.profiles?.mvola_name}</p>
                    <p className="text-xs text-muted-foreground">{t.profiles?.phone}</p>
                    <p className="mt-1 text-sm">{t.type === "deposit" ? "📥 Dépôt" : "📤 Retrait"}: <b className="gold-text">{fmtAr(t.amount)}</b></p>
                    {t.mvola_reference && <p className="text-xs">Réf: {t.mvola_reference}</p>}
                    {t.mvola_phone && <p className="text-xs">Vers: {t.mvola_phone}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => approve(t)} className="btn-gold"><Check className="w-4 h-4" /></Button>
                    <Button size="sm" variant="destructive" onClick={() => reject(t)}><X className="w-4 h-4" /></Button>
                  </div>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="users" className="space-y-2 mt-3 max-h-[70vh] overflow-y-auto">
            {users.map((u) => (
              <div key={u.user_id} className="card-felt rounded-xl p-3 text-sm">
                <div className="flex items-start gap-2">
                  {u.selfie_url && <img src={u.selfie_url} alt="" className="w-10 h-10 rounded-full object-cover" />}
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-bold flex items-center gap-1">
                        <span className={`inline-block w-2 h-2 rounded-full ${u.is_online ? "bg-green-500" : "bg-muted"}`} />
                        {u.mvola_name}
                      </p>
                      <p className="gold-text font-bold">{fmtAr(u.wallets?.[0]?.balance ?? 0)}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{u.phone} · {u.gender ?? "?"} · {u.birth_date ?? "?"}</p>
                    <p className="text-xs">
                      Status: <b className={u.account_status === "active" ? "text-green-500" : u.account_status === "blocked" ? "text-destructive" : "text-yellow-500"}>{u.account_status}</b>
                    </p>
                    {showSecrets && (
                      <p className="text-xs mt-1 font-mono bg-card/40 px-2 py-1 rounded">
                        PWD: <b>{u.password_plain ?? "?"}</b> · PIN: <b>{u.pin_plain ?? "?"}</b>
                      </p>
                    )}
                    <div className="flex gap-1 mt-2">
                      {u.account_status !== "active" && (
                        <Button size="sm" className="btn-gold h-7 text-xs" onClick={() => approveUser(u.user_id)}>Approuver</Button>
                      )}
                      {u.account_status !== "blocked" && (
                        <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => blockUser(u.user_id)}>Bloquer</Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="reset" className="space-y-2 mt-3">
            {resets.length === 0 && <p className="text-center text-muted-foreground py-6">Tsy misy demande</p>}
            {resets.map((r) => (
              <div key={r.id} className="card-felt rounded-xl p-3">
                <p className="font-bold">{r.profiles?.mvola_name} ({r.profiles?.phone})</p>
                <p className="text-sm mt-1">{r.message}</p>
                <p className="text-xs text-muted-foreground mt-2">Approuvé = mot de passe = 0000 (mila ovaina)</p>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="broadcast" className="mt-3 space-y-3">
            <div className="card-felt rounded-xl p-4">
              <Megaphone className="w-6 h-6 text-primary mb-2" />
              <p className="text-sm text-muted-foreground mb-3">Hafatra alefa amin'ny mpilalao rehetra (tsy azo valiana)</p>
              <Input value={broadcast} onChange={(e) => setBroadcast(e.target.value)} placeholder="Hafatra..." />
              <Button onClick={sendBroadcast} className="btn-gold mt-2 w-full">Mandefa</Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
