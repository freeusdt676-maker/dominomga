import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { phoneToEmail } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { DominoTile } from "@/components/DominoTile";
import logo from "@/assets/logo.png";
import { Shield, Camera } from "lucide-react";
import { ADMIN_CODE, ADMIN_CODE_ALT } from "@/lib/constants";

export default function Auth() {
  const nav = useNavigate();
  const [tab, setTab] = useState("login");

  // login
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  // signup
  const [sName, setSName] = useState("");
  const [sBirth, setSBirth] = useState("");
  const [sGender, setSGender] = useState<"male"|"female"|"other">("male");
  const [sPhone, setSPhone] = useState("");
  const [sPwd, setSPwd] = useState("");
  const [sPwd2, setSPwd2] = useState("");
  const [sPin, setSPin] = useState("");
  const [sPin2, setSPin2] = useState("");
  const [sSelfie, setSSelfie] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminCode, setAdminCode] = useState("");

  const handleAdminAccess = () => {
    const c = adminCode.trim();
    if (c === ADMIN_CODE || c === ADMIN_CODE_ALT) {
      sessionStorage.setItem("admin_code_ok", "1");
      toast.success("Code marina");
      setAdminOpen(false);
      setAdminCode("");
      nav("/admin");
    } else {
      toast.error("Code diso");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const cleanPhone = phone.trim().replace(/\s/g, "");
    const cleanPwd = password.trim();
    const { data, error } = await supabase.auth.signInWithPassword({ email: phoneToEmail(cleanPhone), password: cleanPwd });
    setLoading(false);
    if (error) {
      if (error.message?.toLowerCase().includes("not confirmed")) {
        return toast.error("Mbola eo am-panamarinana ny mombamomba anao ny Admin.");
      }
      return toast.error("Numéro na mot de passe diso");
    }
    // Mijery raha pending
    if (data.user) {
      const { data: prof } = await supabase.from("profiles").select("account_status").eq("user_id", data.user.id).maybeSingle();
      if (prof?.account_status === "pending") {
        await supabase.auth.signOut();
        return toast.error("Mbola eo am-panamarinana ny mombamomba anao ny Admin.");
      }
      if (prof?.account_status === "blocked") {
        await supabase.auth.signOut();
        return toast.error("Voasakana ny kaontinao. Mifandraisa amin'ny Admin.");
      }
    }
    toast.success("Tonga soa!");
    nav("/");
  };

  const handleSelfie = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5_000_000) return toast.error("Sary lehibe loatra (>5MB)");
    const r = new FileReader();
    r.onload = () => setSSelfie(String(r.result));
    r.readAsDataURL(f);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sName.trim()) return toast.error("Anarana MVOLA ilaina");
    if (!/^03[2-48]\d{7}$/.test(sPhone.replace(/\s/g, ""))) return toast.error("Numéro Telma diso (034 na 038)");
    if (sPwd.length < 6) return toast.error("Mot de passe ≥ 6 caractères");
    if (sPwd !== sPwd2) return toast.error("Mot de passe tsy mitovy");
    if (!/^\d{4,6}$/.test(sPin)) return toast.error("Code PIN: 4-6 chiffres");
    if (sPin !== sPin2) return toast.error("Code PIN tsy mitovy");
    if (!sSelfie) return toast.error("Aka sary selfie aloha");

    setLoading(true);
    const cleanPhone = sPhone.replace(/\s/g, "");
    try {
      const res = await fetch(`https://taucobvazpwzzhmapekh.supabase.co/functions/v1/signup-kyc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: phoneToEmail(cleanPhone),
          password: sPwd.trim(),
          mvola_name: sName.trim(),
          phone: cleanPhone,
          birth_date: sBirth || null,
          gender: sGender,
          selfie_base64: sSelfie,
          pin: sPin,
        }),
      });
      const json = await res.json();
      setLoading(false);
      if (!res.ok || !json.ok) return toast.error(json.error ?? "Hadisoana");
      toast.success("Inscription vita! Miandry ny fankatoavan'ny Admin.");
      setTab("login");
      // reset
      setSName(""); setSBirth(""); setSPhone(""); setSPwd(""); setSPwd2(""); setSPin(""); setSPin2(""); setSSelfie(null);
    } catch (err: any) {
      setLoading(false);
      toast.error(String(err?.message ?? err));
    }
  };

  return (
    <div className="min-h-screen felt-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <img src={logo} alt="DOMINO MGA" className="w-24 h-24 mb-2" />
          <h1 className="text-3xl font-display font-bold gold-text">DOMINO MGA</h1>
          <div className="flex gap-1 mt-3">
            <DominoTile a={6} b={6} size="sm" />
            <DominoTile a={5} b={3} size="sm" />
          </div>
        </div>

        <div className="card-felt rounded-2xl p-6">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid grid-cols-2 w-full mb-4">
              <TabsTrigger value="login">Connexion</TabsTrigger>
              <TabsTrigger value="signup">Inscription</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-3">
                <div>
                  <Label>Numéro Telma</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="034 XX XXX XX" inputMode="tel" />
                </div>
                <div>
                  <Label>Mot de passe</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" disabled={loading} className="w-full btn-gold">Hiditra</Button>
                <p className="text-xs text-muted-foreground text-center">
                  Hadinoanao ny mot de passe? Mifandraisa amin'ny ADMINISTRATIF aorian'ny fidirana.
                </p>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-3">
                <div>
                  <Label>Anarana ao amin'ny MVOLA</Label>
                  <Input value={sName} onChange={(e) => setSName(e.target.value)} placeholder="RAKOTO Jean" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Daty nahaterahana</Label>
                    <Input type="date" value={sBirth} onChange={(e) => setSBirth(e.target.value)} />
                  </div>
                  <div>
                    <Label>Lahy/Vavy</Label>
                    <Select value={sGender} onValueChange={(v: any) => setSGender(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Lahy</SelectItem>
                        <SelectItem value="female">Vavy</SelectItem>
                        <SelectItem value="other">Hafa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Numéro Telma</Label>
                  <Input value={sPhone} onChange={(e) => setSPhone(e.target.value)} placeholder="034 na 038 XXXXXXX" inputMode="tel" maxLength={10} />
                </div>
                <div>
                  <Label>Sary selfie (KYC)</Label>
                  <div className="flex items-center gap-3 mt-1">
                    <label className="flex items-center justify-center w-20 h-20 rounded-xl border-2 border-dashed border-primary/40 bg-card/40 cursor-pointer overflow-hidden">
                      {sSelfie ? (
                        <img src={sSelfie} alt="selfie" className="w-full h-full object-cover" />
                      ) : (
                        <Camera className="w-6 h-6 text-primary" />
                      )}
                      <input type="file" accept="image/*" capture="user" className="hidden" onChange={handleSelfie} />
                    </label>
                    <p className="text-xs text-muted-foreground flex-1">
                      Aka sary mazava amin'ny tavanao mba ho fanamarinana. Tsy hisy fidirana raha tsy misy.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Mot de passe</Label>
                    <Input type="password" value={sPwd} onChange={(e) => setSPwd(e.target.value)} />
                  </div>
                  <div>
                    <Label>Avereno</Label>
                    <Input type="password" value={sPwd2} onChange={(e) => setSPwd2(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Code PIN (retrait)</Label>
                    <Input type="password" inputMode="numeric" maxLength={6} value={sPin} onChange={(e) => setSPin(e.target.value)} />
                  </div>
                  <div>
                    <Label>Avereno</Label>
                    <Input type="password" inputMode="numeric" maxLength={6} value={sPin2} onChange={(e) => setSPin2(e.target.value)} />
                  </div>
                </div>
                <Button type="submit" disabled={loading || !sSelfie} className="w-full btn-gold">
                  {loading ? "Andraso..." : "Hisoratra anarana"}
                </Button>
                {!sSelfie && (
                  <p className="text-xs text-destructive text-center">Mila selfie vao afaka manindry "Hisoratra anarana"</p>
                )}
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setAdminOpen(true)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl btn-gold shadow-2xl font-display font-bold text-sm"
        aria-label="ADMINISTRATIF"
      >
        <Shield className="w-4 h-4" />
        ADMINISTRATIF
      </button>

      {adminOpen && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={() => setAdminOpen(false)}>
          <div className="card-felt rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-lg font-bold gold-text mb-3 flex items-center gap-2">
              <Shield className="w-5 h-5" /> Code ADMINISTRATIF
            </h2>
            <Input
              type="password"
              value={adminCode}
              onChange={(e) => setAdminCode(e.target.value)}
              placeholder="Code..."
              onKeyDown={(e) => e.key === "Enter" && handleAdminAccess()}
              autoFocus
            />
            <div className="grid grid-cols-2 gap-2 mt-3">
              <Button variant="outline" onClick={() => { setAdminOpen(false); setAdminCode(""); }}>Hiala</Button>
              <Button className="btn-gold" onClick={handleAdminAccess}>Hiditra</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
