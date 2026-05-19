import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, ArrowDownToLine, ArrowUpFromLine, Copy, ShieldAlert } from "lucide-react";
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
  const [withdrawName, setWithdrawName] = useState("");

  const ADMIN_PHONE = "0345023006";
  const ADMIN_NAME = "Jean Rolland";

  const copy = async (txt: string, label: string) => {
    try {
      await navigator.clipboard.writeText(txt);
      toast.success(`${label} voakopia ✓`);
    } catch {
      toast.error("Tsy afaka nikopia");
    }
  };

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
    // Block: at most ONE pending deposit/withdrawal per user.
    const { data: pendings } = await supabase
      .from("transactions")
      .select("id, type")
      .eq("user_id", user!.id)
      .eq("status", "pending")
      .in("type", ["deposit", "withdrawal"])
      .limit(1);
    if (pendings && pendings.length > 0) {
      return toast.error("Mbola misy demande tsy mbola voavaha — andraso mialoha");
    }
    const { error } = await supabase.from("transactions").insert({ user_id: user!.id, type: "deposit", amount: a, mvola_reference: ref.trim(), status: "pending" });
    if (error) return toast.error(error.message);
    toast.success("Demande alefa amin'ny admin");
    setAmount(""); setRef(""); load();
  };

  const submitWithdraw = async () => {
    if (!user) return toast.error("Tsy nahita compte");
    // Rate limit: 3 demandes / 10 min
    const { data: rl } = await supabase.rpc("check_rate_limit", { _action: "withdraw_request", _max: 3, _window_seconds: 600 });
    if (rl === false) return toast.error("Be loatra ny demande. Andraso 10 min.");
    const a = Number(withdrawAmount);
    if (a < 1000) return toast.error("Min 1000 Ar");
    if (a > balance) return toast.error("Solde tsy ampy");
    const cleanPhone = withdrawPhone.replace(/\s/g, "");
    if (!/^0\d{9}$/.test(cleanPhone)) return toast.error("Numéro téléphone diso (10 chiffres)");
    if (!withdrawName.trim()) return toast.error("Anarana certifié MVOLA ilaina");
    if (!/^\d{4,6}$/.test(pin)) return toast.error("PIN diso");
    // Block: at most ONE pending deposit/withdrawal per user.
    const { data: pendings } = await supabase
      .from("transactions")
      .select("id, type")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .in("type", ["deposit", "withdrawal"])
      .limit(1);
    if (pendings && pendings.length > 0) {
      return toast.error("Mbola misy demande tsy mbola voavaha — andraso mialoha");
    }

    // Verify PIN against profiles.pin_plain (set during signup)
    const { data: prof, error: pErr } = await supabase
      .from("profiles").select("pin_plain").eq("user_id", user.id).maybeSingle();
    if (pErr) return toast.error("Tsy nahita profile: " + pErr.message);
    if (!prof?.pin_plain) return toast.error("Tsy mbola voafaritra ny PIN-nao");
    if (prof.pin_plain !== pin) return toast.error("PIN diso");

    const { error } = await supabase.from("transactions").insert({
      user_id: user.id,
      type: "withdrawal",
      amount: a,
      mvola_phone: cleanPhone,
      mvola_reference: withdrawName.trim(),
      status: "pending",
    });
    if (error) return toast.error("Erreur: " + error.message);
    await supabase.rpc("log_audit", { _action: "withdraw_request", _meta: { amount: a, mvola_phone: cleanPhone } });
    toast.success("Demande retrait alefa");
    setWithdrawAmount(""); setWithdrawPhone(""); setWithdrawName(""); setPin(""); load();
  };

  return (
    <div className="min-h-screen felt-bg">
      <header className="p-4 flex items-center gap-3 border-b border-primary/20">
        <Button variant="ghost" size="icon" onClick={() => nav("/")}><ArrowLeft /></Button>
        <h1 className="font-display text-xl font-bold gold-text">MVOLA</h1>
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
            <div className="rounded-xl bg-primary/10 border border-primary/30 p-3 text-xs space-y-2">
              <p className="font-bold gold-text">📥 Famolavolana Dépôt</p>
              <p>1. Mandefa MVOLA amin'ny numéro administratif eto ambany.</p>
              <div className="flex items-center justify-between bg-card/60 rounded-lg p-2 border border-primary/20">
                <div>
                  <p className="text-[10px] text-muted-foreground">Numéro téléphone</p>
                  <p className="font-mono font-bold gold-text">{ADMIN_PHONE}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => copy(ADMIN_PHONE, "Numéro")}>
                  <Copy className="w-3 h-3 mr-1" />Copier
                </Button>
              </div>
              <div className="flex items-center justify-between bg-card/60 rounded-lg p-2 border border-primary/20">
                <div>
                  <p className="text-[10px] text-muted-foreground">Anarana certifié MVOLA</p>
                  <p className="font-bold gold-text">{ADMIN_NAME}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => copy(ADMIN_NAME, "Anarana")}>
                  <Copy className="w-3 h-3 mr-1" />Copier
                </Button>
              </div>
              <p>2. Avereno eto amin'ny formulaire ny montant sy référence MVOLA.</p>
              <p>3. Ny administratif no hanamarina (mahazo notification ianao).</p>
            </div>
            <div><Label>Montant (Ar)</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100000" /></div>
            <div><Label>Référence transaction MVOLA</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="MP..." /></div>
            <Button className="w-full btn-gold" onClick={submitDeposit}>Mandefa demande</Button>
          </TabsContent>

          <TabsContent value="withdraw" className="space-y-3 mt-4">
            <div className="rounded-xl bg-primary/10 border border-primary/30 p-3 text-xs">
              <p className="font-bold gold-text mb-1">📤 Famolavolana Retrait</p>
              <p>Soraty ny numéro téléphone sy ny anarana certifié MVOLA handefasana ny vola, dia ampidiro ny PIN-nao.</p>
            </div>
            <div><Label>Montant (Ar)</Label><Input type="number" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="10000" /></div>
            <div><Label>Numéro téléphone (handefasana ny vola)</Label><Input inputMode="tel" value={withdrawPhone} onChange={(e) => setWithdrawPhone(e.target.value)} placeholder="034XXXXXXX" /></div>
            <div><Label>Anarana certifié MVOLA</Label><Input value={withdrawName} onChange={(e) => setWithdrawName(e.target.value)} placeholder="Jean Claude" /></div>
            <div><Label>Code PIN</Label><Input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value)} placeholder="1234" /></div>
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
