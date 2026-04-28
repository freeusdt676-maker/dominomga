import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { fmtAr } from "@/lib/constants";
import { toast } from "sonner";

export default function Wallet() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [balance, setBalance] = useState(0);
  const [txs, setTxs] = useState<any[]>([]);
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  const [pin, setPin] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawPhone, setWithdrawPhone] = useState("");

  const load = async () => {
    if (!user) return;
    const { data: w } = await supabase.from("wallets").select("balance").eq("user_id", user.id).single();
    setBalance(Number(w?.balance ?? 0));
    const { data: t } = await supabase.from("transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
    setTxs(t ?? []);
  };
  useEffect(() => { load(); }, [user]);

  const submitDeposit = async () => {
    const a = Number(amount);
    if (a < 1000) return toast.error("Min 1000 Ar");
    if (!ref.trim()) return toast.error("Référence MVOLA ilaina");
    const { error } = await supabase.from("transactions").insert({ user_id: user!.id, type: "deposit", amount: a, mvola_reference: ref.trim(), status: "pending" });
    if (error) return toast.error(error.message);
    toast.success("Demande alefa amin'ny admin");
    setAmount(""); setRef(""); load();
  };

  const submitWithdraw = async () => {
    const a = Number(withdrawAmount);
    if (a < 1000) return toast.error("Min 1000 Ar");
    if (a > balance) return toast.error("Solde tsy ampy");
    if (!/^03[2-48]\d{7}$/.test(withdrawPhone)) return toast.error("Numéro Telma diso (034 na 038)");
    if (!/^\d{4,6}$/.test(pin)) return toast.error("PIN diso");

    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch(`https://taucobvazpwzzhmapekh.supabase.co/functions/v1/wallet-pin`, {
      method: "POST", headers: { "Content-Type":"application/json", Authorization:`Bearer ${session!.access_token}` },
      body: JSON.stringify({ action: "verify", pin }),
    });
    const j = await r.json();
    if (!j.ok) return toast.error("PIN diso");

    const { error } = await supabase.from("transactions").insert({
      user_id: user!.id, type: "withdrawal", amount: a, mvola_phone: withdrawPhone, status: "pending"
    });
    if (error) return toast.error(error.message);
    toast.success("Demande retrait alefa");
    setWithdrawAmount(""); setWithdrawPhone(""); setPin(""); load();
  };

  return (
    <div className="min-h-screen felt-bg">
      <header className="p-4 flex items-center gap-3 border-b border-primary/20">
        <Button variant="ghost" size="icon" onClick={() => nav("/")}><ArrowLeft /></Button>
        <h1 className="font-display text-xl font-bold gold-text">Wallet</h1>
      </header>

      <div className="p-4 max-w-lg mx-auto space-y-4">
        <div className="card-felt rounded-2xl p-6 text-center">
          <p className="text-xs text-muted-foreground">Solde ankehitriny</p>
          <p className="text-4xl font-display gold-text font-bold">{fmtAr(balance)}</p>
        </div>

        <Tabs defaultValue="deposit" className="card-felt rounded-2xl p-4">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="deposit"><ArrowDownToLine className="w-4 h-4 mr-2" />Dépôt</TabsTrigger>
            <TabsTrigger value="withdraw"><ArrowUpFromLine className="w-4 h-4 mr-2" />Retrait</TabsTrigger>
          </TabsList>

          <TabsContent value="deposit" className="space-y-3 mt-4">
            <p className="text-xs text-muted-foreground">
              1. Mandefa MVOLA mankamin'ny numéro admin<br/>
              2. Mametraka ny montant sy référence MVOLA eto ambany<br/>
              3. Ny admin no manamarina (mahazo notification ianao)
            </p>
            <div><Label>Montant (Ar)</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1000" /></div>
            <div><Label>Référence transaction MVOLA</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="MP..." /></div>
            <Button className="w-full btn-gold" onClick={submitDeposit}>Mandefa demande</Button>
          </TabsContent>

          <TabsContent value="withdraw" className="space-y-3 mt-4">
            <div><Label>Montant (Ar)</Label><Input type="number" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} /></div>
            <div><Label>Numéro Telma</Label><Input value={withdrawPhone} onChange={(e) => setWithdrawPhone(e.target.value)} placeholder="034XXXXXXX" /></div>
            <div><Label>Code PIN</Label><Input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value)} /></div>
            <Button className="w-full btn-gold" onClick={submitWithdraw}>Mangataka retrait</Button>
          </TabsContent>
        </Tabs>

        <div className="card-felt rounded-2xl p-4">
          <h3 className="font-display font-bold mb-3">Tantara</h3>
          <div className="space-y-2 max-h-[40vh] overflow-y-auto">
            {txs.map((t) => (
              <div key={t.id} className="flex justify-between items-center text-sm border-b border-border/30 pb-2">
                <div>
                  <p className="font-medium">{labelType(t.type)}</p>
                  <p className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString("fr-FR")}</p>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${["deposit","game_win","refund"].includes(t.type) ? "text-success" : "text-destructive"}`}>
                    {["deposit","game_win","refund"].includes(t.type) ? "+" : "-"}{fmtAr(t.amount)}
                  </p>
                  <p className="text-xs">{labelStatus(t.status)}</p>
                </div>
              </div>
            ))}
            {txs.length === 0 && <p className="text-center text-xs text-muted-foreground py-4">Tsy misy transaction</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function labelType(t: string) {
  return { deposit:"Dépôt", withdrawal:"Retrait", game_win:"Gain", game_loss:"Perte", game_stake:"Mise", refund:"Remboursement" }[t] ?? t;
}
function labelStatus(s: string) {
  return { pending:"⏳ En attente", approved:"✓ Approuvé", rejected:"✗ Refusé", completed:"✓ Vita" }[s] ?? s;
}
