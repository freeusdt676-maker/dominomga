import { useEffect, useRef, useState } from "react";
import { PasswordInput } from "@/components/PasswordInput";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { phoneToEmail } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
import logoDomino from "@/assets/logo-domino.png";
import logoPetanque from "@/assets/logo-petanque.png";
import { Camera, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import LiveSpectatorButton from "@/components/LiveSpectatorButton";
import ForgotPasswordDialog from "@/components/ForgotPasswordDialog";

const LOGIN_STEP_TIMEOUT_MS = 2500;
const PASSWORD_LOGIN_TIMEOUT_MS = 8000;

type PasswordLoginResult = {
  data: { session: any; user: any } | null;
  error: { message?: string } | null;
  timedOut?: boolean;
};

const withTimeout = async <T,>(promise: PromiseLike<T>, ms = LOGIN_STEP_TIMEOUT_MS): Promise<T | null> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const runQuietly = (task: PromiseLike<unknown>) => {
  Promise.resolve(task).catch(() => undefined);
};

const directPasswordLogin = async (email: string, password: string): Promise<PasswordLoginResult> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PASSWORD_LOGIN_TIMEOUT_MS);

  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
        "x-client-info": "domino-mga-fast-login",
      },
      body: JSON.stringify({ email, password }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { data: null, error: { message: payload?.error_description || payload?.msg || payload?.message || "Login failed" } };
    }

    if (!payload?.access_token || !payload?.refresh_token) {
      return { data: null, error: { message: "Session tsy voaray" } };
    }

    const session = {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      expires_in: payload.expires_in,
      expires_at: payload.expires_at ?? Math.floor(Date.now() / 1000) + Number(payload.expires_in ?? 3600),
      token_type: payload.token_type ?? "bearer",
      user: payload.user,
    };

    const setResult = await withTimeout(
      supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token }),
      2500
    );

    if (setResult?.error) {
      return { data: { session, user: session.user }, error: null };
    }

    // Fallback WebView: raha mihantona ny client auth, soratana mivantana ny session
    // dia reload kely mba hiditra avy hatrany amin'ny compte.
    if (!setResult) {
      return { data: { session, user: session.user }, error: null };
    }

    return { data: { session: setResult.data.session ?? session, user: setResult.data.user ?? session.user }, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err?.name === "AbortError" ? "timeout" : String(err?.message ?? err) }, timedOut: err?.name === "AbortError" };
  } finally {
    clearTimeout(timer);
  }
};

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
  const [sPin, setSPin] = useState("");
  const [acceptRules, setAcceptRules] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  const clearErr = (k: string) => setErr((p) => (p[k] ? { ...p, [k]: "" } : p));



  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phone.trim().replace(/\s/g, "");
    const cleanPwd = password.trim();
    if (!cleanPhone || !cleanPwd) return toast.error("Fenoy ny numéro sy mot de passe");

    setLoading(true);
    try {
      // Anti-brute-force: tsy avela hanakana login ela be raha miadana ny backend.
      const lockResult = await withTimeout(
        supabase.rpc("check_login_lockout", { _phone: cleanPhone }),
        1200
      );
      const lockData = lockResult?.data;
      if (lockData && typeof lockData === "object" && (lockData as any).locked) {
        setLoading(false);
        return toast.error("Voasakana 15 min noho ny fanandramana diso be loatra. Andraso.");
      }

      const email = phoneToEmail(cleanPhone);
      const clientResult = await withTimeout(
        supabase.auth.signInWithPassword({ email, password: cleanPwd }),
        8000,
      );
      let authResult: PasswordLoginResult = clientResult
        ? { data: { session: clientResult.data.session, user: clientResult.data.user }, error: clientResult.error }
        : { data: null, error: { message: "timeout" }, timedOut: true };

      // WebView fallback only: import the returned refresh token through the official
      // client and wait until it is durably persisted before entering the app.
      if (authResult.timedOut) authResult = await directPasswordLogin(email, cleanPwd);

      if (!authResult.data && (authResult.timedOut || authResult.error?.message === "timeout")) {
        setLoading(false);
        return toast.error("Connexion mbola miadana. Jereo réseau dia avereno tsindriana.");
      }

      const { data, error } = authResult;
      if (error) {
        setLoading(false);
        runQuietly(supabase.rpc("record_login_attempt", { _phone: cleanPhone, _success: false }));
        if (error.message?.toLowerCase().includes("not confirmed")) {
          return toast.error("Mbola eo am-panamarinana ny mombamomba anao ny Admin.");
        }
        return toast.error("Numéro na mot de passe diso");
      }

      if (!data.session) {
        setLoading(false);
        return toast.error("Session tsy voatahiry. Avereno ny connexion.");
      }
      setLoading(false);
      toast.success("Tonga soa!");
      nav("/", { replace: true });

      runQuietly(supabase.rpc("record_login_attempt", { _phone: cleanPhone, _success: true }));

      // Fanamarinana compte atao haingana fa tsy mampihantona ny fidirana.
      if (data.user) {
        runQuietly((async () => {
          const profileResult = await withTimeout(
            supabase.from("profiles").select("account_status").eq("user_id", data.user.id).maybeSingle(),
            1800
          );
          const status = profileResult?.data?.account_status;
          if (status === "pending") {
            await supabase.auth.signOut();
            toast.error("Mbola eo am-panamarinana ny mombamomba anao ny Admin.");
            nav("/", { replace: true });
          } else if (status === "blocked") {
            await supabase.auth.signOut();
            toast.error("Voasakana ny kaontinao. Mifandraisa amin'ny Admin.");
            nav("/", { replace: true });
          }
        })());
      }
    } catch (err) {
      setLoading(false);
      toast.error("Tsy tafiditra. Jereo ny connexion dia avereno.");
    }
  };

  const ageOK = (iso: string) => {
    if (!iso) return false;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return false;
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age >= 18;
  };

  const focusErr = (key: string) => {
    const map: Record<string, string> = {
      phone: "signup-phone", name: "signup-name", birth: "signup-birth",
      pwd: "signup-pwd", pin: "signup-pin",
    };
    const el = document.getElementById(map[key] ?? "");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = sPhone.replace(/\D/g, "");
    const name = sName.trim();
    const next: Record<string, string> = {};

    if (!/^0(32|33|34|35|37|38)\d{7}$/.test(cleanPhone))
      next.phone = "Numéro tsy mety: Telma 034/038 · Orange 032/037 · Airtel 033/035 (10 chiffres)";
    if (!NAME_RE.test(name))
      next.name = "Anarana: litera ihany (tsy misy chiffre, symbole na emoji), 2–10 litera";
    if (!sBirth || !ageOK(sBirth) || Number(sBirth.slice(0, 4)) > 2008)
      next.birth = "Tsy maintsy 18 taona no ho miakatra (taona ≤ 2008)";
    if (sPwd.length < 6 || !/[A-Za-z]/.test(sPwd) || !/\d/.test(sPwd))
      next.pwd = "Mot de passe: 6 farafahakeliny, misy litera sy chiffre mifangaro";
    if (!/^\d{4}$/.test(sPin)) next.pin = "PIN: 4 chiffres";
    if (!acceptRules) next.rules = "Tsy maintsy ekena ny fitsipika";

    setErr(next);
    const keys = Object.keys(next);
    if (keys.length) {
      focusErr(keys[0]);
      toast.error(next[keys[0]]);
      return;
    }

    setLoading(true);
    try {
      const email = phoneToEmail(cleanPhone);
      const { data, error } = await supabase.functions.invoke("signup-kyc", {
        body: {
          email,
          password: sPwd.trim(),
          mvola_name: name,
          phone: cleanPhone,
          birth_date: sBirth,
          gender: sGender,
          pin: sPin,
        },
      });
      const errMsg = (data as any)?.error || (error as any)?.message;
      if (errMsg) {
        setLoading(false);
        setErr({ phone: String(errMsg) });
        return toast.error(String(errMsg));
      }

      toast.success("Vita ny fisoratana anarana! Tafiditra ianao.");
      // Connexion automatique
      const login = await withTimeout(supabase.auth.signInWithPassword({ email, password: sPwd.trim() }), 8000);
      let session = login?.data?.session ?? null;
      if (!session) {
        const fallback = await directPasswordLogin(email, sPwd.trim());
        session = fallback.data?.session ?? null;
      }
      setLoading(false);
      if (!session) {
        setTab("login");
        setPhone(cleanPhone);
        return toast.info("Midira amin'ny numéro sy mot de passe vaovao.");
      }
      setSName(""); setSBirth(""); setSPhone(""); setSPwd(""); setSPin(""); setAcceptRules(false);
      nav("/", { replace: true });
    } catch (err2: any) {
      setLoading(false);
      toast.error(String(err2?.message ?? err2));
    }
  };


  return (
    <div className="min-h-screen felt-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <img src={logo} alt="DOMINO MGA" className="w-20 h-20 mb-2" />
          <h1 className="text-3xl font-display font-bold gold-text">DOMINO MGA</h1>
          <p className="text-[11px] tracking-[0.3em] uppercase text-muted-foreground mt-1">Domino · Pétanque</p>
          <div className="flex items-center justify-center gap-4 mt-4">
            <img src={logoDomino} alt="Domino" className="w-14 h-14 drop-shadow-[0_2px_8px_rgba(212,175,55,0.4)]" loading="lazy" />
            <img src={logoPetanque} alt="Pétanque" className="w-14 h-14 drop-shadow-[0_2px_8px_rgba(212,175,55,0.4)]" loading="lazy" />
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
                  <Label>Numéro téléphone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="032 / 033 / 034 / 035 / 037 / 038 XXXXXXX" inputMode="tel" />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    <b>Yas/MVola</b>: 034 · 038 &nbsp;·&nbsp; <b>Airtel</b>: 033 · 035 &nbsp;·&nbsp; <b>Orange</b>: 032 · 037
                  </p>
                </div>
                <div>
                  <Label>Mot de passe</Label>
                  <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" disabled={loading} className="w-full btn-gold">Hiditra</Button>
                <p className="text-xs text-muted-foreground text-center">
                  Hadinoanao ny mot de passe? Mifandraisa amin'ny ADMINISTRATIF aorian'ny fidirana.
                </p>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <div className="mvola-banner mb-3 text-sm">
                💛❤️ INSCRIPTION haingana — fenoy tsara dia tafiditra avy hatrany ianao
              </div>
              <form onSubmit={handleSignup} className="space-y-3" noValidate>
                <div className={err.phone ? "field-error" : ""}>
                  <Label className="text-xs font-bold uppercase tracking-wide">Numéro téléphone</Label>
                  <Input value={sPhone} onChange={(e) => { setSPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); clearErr("phone"); }}
                    placeholder="032/033/034/035/037/038 XXXXXXX" inputMode="tel" maxLength={10} />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    <b>Telma</b>: 034 · 038 &nbsp;·&nbsp; <b>Orange</b>: 032 · 037 &nbsp;·&nbsp; <b>Airtel</b>: 033 · 035 — 10 chiffres
                  </p>
                  {err.phone && <p className="text-[10px] text-destructive font-bold mt-1">{err.phone}</p>}
                </div>
                <div className={err.name ? "field-error" : ""}>
                  <Label className="text-xs font-bold uppercase tracking-wide">Nom profil (litera ihany, ≤ 10)</Label>
                  <Input value={sName} onChange={(e) => { setSName(e.target.value.slice(0, 10)); clearErr("name"); }} placeholder="Jean" maxLength={10} />
                  {err.name && <p className="text-[10px] text-destructive font-bold mt-1">{err.name}</p>}
                </div>
                <div className={err.birth ? "field-error" : ""}>
                  <Label className="text-xs font-bold uppercase tracking-wide">Daty nahaterahana (18 taona +)</Label>
                  <Input type="date" max={MAX_BIRTH_DATE} value={sBirth} onChange={(e) => { setSBirth(e.target.value); clearErr("birth"); }} />
                  {err.birth && <p className="text-[10px] text-destructive font-bold mt-1">{err.birth}</p>}
                </div>
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wide">Sexe (LAHY/VAVY/HAFA)</Label>
                  <Select value={sGender} onValueChange={(v: any) => setSGender(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">LAHY</SelectItem>
                      <SelectItem value="female">VAVY</SelectItem>
                      <SelectItem value="other">HAFA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className={err.pwd ? "field-error" : ""}>
                  <Label className="text-xs font-bold uppercase tracking-wide">Mot de passe (litera + chiffre, ≥ 6)</Label>
                  <PasswordInput value={sPwd} onChange={(e) => { setSPwd(e.target.value); clearErr("pwd"); }} placeholder="domino24" />
                  {err.pwd && <p className="text-[10px] text-destructive font-bold mt-1">{err.pwd}</p>}
                </div>
                <div className={err.pin ? "field-error" : ""}>
                  <Label className="text-xs font-bold uppercase tracking-wide">PIN (4 chiffres)</Label>
                  <PasswordInput inputMode="numeric" maxLength={4} value={sPin}
                    onChange={(e) => { setSPin(e.target.value.replace(/\D/g, "").slice(0, 4)); clearErr("pin"); }} placeholder="1234" />
                  {err.pin && <p className="text-[10px] text-destructive font-bold mt-1">{err.pin}</p>}
                </div>
                <Button type="submit" disabled={loading} className="w-full btn-mvola text-base py-6">
                  {loading ? "Andraso..." : "HISORATRA ANARANA"}
                </Button>
                <div className={`flex items-start gap-2 pt-2 border-t border-primary/10 ${err.rules ? "field-error" : ""}`}>
                  <div className="field-box rounded mt-1 border border-transparent">
                    <Checkbox id="accept" checked={acceptRules} onCheckedChange={(v) => { setAcceptRules(!!v); clearErr("rules"); }} />
                  </div>
                  <label htmlFor="accept" className="text-xs leading-relaxed cursor-pointer">
                    Manaiky aho ny <Link to="/rules" target="_blank" className="text-primary underline font-bold">Fitsipika sy Règle du jeu</Link>: fitondran-tena mendrika, fahamatorana, 18 taona+, compte tokana, fanajana ny ADMINISTRATIF.
                  </label>
                </div>
                <p className="text-[11px] text-muted-foreground text-center mt-2">
                  Raha marina daholo ny mombamomba anao dia tafiditra avy hatrany ianao — tsy mila miandry validation.
                </p>
              </form>
            </TabsContent>

          </Tabs>
        </div>
      </div>




      <LiveSpectatorButton position="auth" />

      <button
        type="button"
        onClick={() => setForgotOpen(true)}
        className="fixed bottom-20 right-4 z-50 px-3 py-2 rounded-xl bg-card/90 border border-primary/40 text-primary text-xs font-bold shadow-xl hover:bg-card"
        aria-label="Mot de passe oublié"
      >
        🔑 Mot de passe oublié
      </button>
      <ForgotPasswordDialog open={forgotOpen} onClose={() => setForgotOpen(false)} />

    </div>
  );
}
