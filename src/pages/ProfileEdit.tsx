import { useEffect, useState } from "react";
import InitialsAvatar from "@/components/InitialsAvatar";
import { PasswordInput } from "@/components/PasswordInput";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

export default function ProfileEdit() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [pending, setPending] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [mvolaName, setMvolaName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: p } = await supabase.from("profiles").select("user_id,mvola_name,phone,selfie_url,avatar_url").eq("user_id", user.id).single();
      setProfile(p);
      // Préremplir les champs avec les infos d'inscription actuelles pour que
      // l'utilisateur n'ait qu'à modifier ce qu'il veut changer, puis "Envoyer".
      if (p) {
        setMvolaName(p.mvola_name ?? "");
        setPhone(p.phone ?? "");
        setPassword("");
        setPin("");
      }
      const { data: req } = await supabase
        .from("profile_change_requests")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setPending(req);
      setLoading(false);
    })();
  }, [user]);

  const submit = async () => {
    if (!user) return;
    // Considérer un champ comme "changement" uniquement s'il diffère de la valeur actuelle.
    const diffName = mvolaName && mvolaName !== (profile?.mvola_name ?? "");
    const diffPhone = phone && phone !== (profile?.phone ?? "");
    const diffPwd = password.length > 0;
    const diffPin = pin.length > 0;
    const hasChange = diffName || diffPhone || diffPwd || diffPin;
    if (!hasChange) {
      toast.error("Tsy nisy fanovana");
      return;
    }
    setSubmitting(true);
    try {
      const selfieUrl: string | null = null;
      const { error } = await supabase.rpc("submit_profile_change_request" as any, {
        _mvola_name: diffName ? mvolaName : null,
        _phone: diffPhone ? phone : null,
        _password: diffPwd ? password : null,
        _pin: diffPin ? pin : null,
        _selfie_url: selfieUrl,
      });
      if (error) throw error;
      toast.success("Nalefa amin'ny ADMINISTRATIF — miandry validation");
      nav("/");
    } catch (err: any) {
      toast.error(err?.message ?? "Tsy tafita");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center luxe-bg">
        <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--gold-1))]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen luxe-bg">
      <header className="px-4 py-3 flex items-center gap-3 hairline-b">
        <Button variant="ghost" size="icon" onClick={() => nav("/")}><ArrowLeft className="w-5 h-5" /></Button>
        <h1 className="font-serif-luxe gold-luxe-text text-xl">Remplir les informations</h1>
      </header>

      <div className="max-w-md mx-auto px-4 py-5 space-y-4 pb-32">
        {pending && (
          <div className="luxe-card p-3 border-l-4 border-yellow-500">
            <p className="text-xs font-semibold text-yellow-300">⏳ Misy fangatahana miandry validation</p>
            <p className="text-[11px] text-muted-foreground mt-1">Hofoanan'io fangatahana taloha io raha mandefa vaovao ianao.</p>
          </div>
        )}

        <div className="luxe-card p-4 space-y-3">
          <p className="eyebrow">Mombamomba ankehitriny</p>
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-full overflow-hidden border border-[hsl(var(--gold-1)/0.4)] bg-black/40 flex items-center justify-center">
              <InitialsAvatar name={profile?.mvola_name} className="w-full h-full text-base" />
            </div>
            <div className="text-xs">
              <p className="font-bold">{profile?.mvola_name}</p>
              <p className="text-muted-foreground">{profile?.phone}</p>
              <p className="text-muted-foreground">ID #{profile?.player_number ?? "—"}</p>
            </div>
          </div>
        </div>

        <div className="luxe-card p-4 space-y-4">
          <p className="eyebrow">Fanovana vaovao</p>

          <div>
            <Label className="text-xs">Anarana vaovao (Nom)</Label>
            <Input value={mvolaName} onChange={(e) => setMvolaName(e.target.value)} placeholder={profile?.mvola_name ?? ""} />
          </div>
          <div>
            <Label className="text-xs">Numéro téléphone vaovao</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={profile?.phone ?? ""} inputMode="tel" />
          </div>
          <div>
            <Label className="text-xs">Password vaovao</Label>
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" />
          </div>
          <div>
            <Label className="text-xs">PIN vaovao (4 chiffres)</Label>
            <PasswordInput value={pin} onChange={(e) => setPin(e.target.value)} maxLength={4} inputMode="numeric" placeholder="••••" />
          </div>

        </div>

        <Button
          onClick={submit}
          disabled={submitting}
          className="w-full btn-luxe h-12 text-base"
        >
          {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          Envoyer ADMINISTRATIF
        </Button>

        <p className="text-[10px] text-center text-muted-foreground">
          Ny fanovana dia tsy hihatra mandra-pankatoavan'ny ADMINISTRATIF.
        </p>
      </div>
    </div>
  );
}