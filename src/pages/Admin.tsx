import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Check, X, Megaphone } from "lucide-react";
import { fmtAr } from "@/lib/constants";
import { toast } from "sonner";

export default function Admin() {
  const { user, isAdmin } = useAuth();
  const nav = useNavigate();
  const [pending, setPending] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [resets, setResets] = useState<any[]>([]);
  const [broadcast, setBroadcast] = useState("");

  const load = async () => {
    const { data: p } = await supabase.from("transactions").select("*, profiles!transactions_user_id_fkey(mvola_name, phone)").eq("status", "pending").order("created_at", { ascending: false });
    setPending(p ?? []);
    const { data: u } = await supabase.from("profiles").select("*, wallets(balance)").order("created_at", { ascending: false }).limit(100);
    setUsers(u ?? []);
    const { data: r } = await supabase.from("password_reset_requests").select("*, profiles!password_reset_requests_user_id_fkey(mvola_name, phone)").eq("status", "pending");
    setResets(r ?? []);
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  if (!isAdmin) return (
    <div className="min-h-screen felt-bg flex items-center justify-center text-center p-6">
      <div className="card-felt p-6 rounded-2xl">
        <p className="text-destructive mb-2">Tsy mahazo miditra ianao</p>
        <Button onClick={() => nav("/")}>Hiverina</Button>
      </div>
    </div>
  );

  const approve = async (tx: any) => {
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
    await supabase.from("transactions").update({ status: "approved", processed_by: user!.id, processed_at: new Date().toISOString() }).eq("id", tx.id);
    toast.success("Vita");
    load();
  };
  const reject = async (tx: any) => {
    await supabase.from("transactions").update({ status: "rejected", processed_by: user!.id, processed_at: new Date().toISOString() }).eq("id", tx.id);
    load();
  };

  const sendBroadcast = async () => {
    if (!broadcast.trim()) return;
    await supabase.from("chat_messages").insert({ sender_id: user!.id, content: broadcast.trim(), is_admin_broadcast: true });
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
        <Tabs defaultValue="tx">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="tx">Transactions</TabsTrigger>
            <TabsTrigger value="users">Mpilalao</TabsTrigger>
            <TabsTrigger value="reset">Reset PWD</TabsTrigger>
            <TabsTrigger value="broadcast">Annonce</TabsTrigger>
          </TabsList>

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
              <div key={u.user_id} className="card-felt rounded-xl p-3 flex justify-between text-sm">
                <div>
                  <p className="font-bold">{u.mvola_name}</p>
                  <p className="text-xs text-muted-foreground">{u.phone} · {u.gender ?? "?"} · {u.birth_date ?? "?"}</p>
                </div>
                <p className="gold-text font-bold">{fmtAr(u.wallets?.[0]?.balance ?? 0)}</p>
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
