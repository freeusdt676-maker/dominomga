// Edge function: inscription auto-confirmed + auto-approved (tsy mila validation admin)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ]{2,10}(?:[ '-][A-Za-zÀ-ÖØ-öø-ÿ]{1,10})*$/;
const PHONE_RE = /^0(32|33|34|35|37|38)\d{7}$/;

const adult = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 18;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { email, password, mvola_name, phone, birth_date, gender, pin } = await req.json();

    if (!email || !password || !mvola_name || !phone || !pin) {
      return new Response(JSON.stringify({ error: "Mila daty rehetra" }), { status: 400, headers: corsHeaders });
    }
    const name = String(mvola_name).trim();
    if (!NAME_RE.test(name) || name.length > 10) {
      return new Response(JSON.stringify({ error: "Anarana tsy mety: litera ihany, 10 farafahabetsany" }), { status: 400, headers: corsHeaders });
    }
    if (!PHONE_RE.test(String(phone))) {
      return new Response(JSON.stringify({ error: "Numéro tsy mety (Telma 034/038 · Orange 032/037 · Airtel 033/035)" }), { status: 400, headers: corsHeaders });
    }
    if (!birth_date || !adult(String(birth_date)) || Number(String(birth_date).slice(0, 4)) > 2008) {
      return new Response(JSON.stringify({ error: "Tsy maintsy 18 taona no ho miakatra" }), { status: 400, headers: corsHeaders });
    }
    const pwd = String(password);
    if (pwd.length < 6 || !/[A-Za-z]/.test(pwd) || !/\d/.test(pwd)) {
      return new Response(JSON.stringify({ error: "Mot de passe: 6+ misy litera sy chiffre" }), { status: 400, headers: corsHeaders });
    }
    if (!/^\d{4}$/.test(String(pin))) {
      return new Response(JSON.stringify({ error: "PIN tsy ara-dalàna (4 chiffres)" }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Numéro iray = compte iray
    const { data: dup } = await admin
      .from("profiles")
      .select("id")
      .eq("phone", String(phone))
      .maybeSingle();
    if (dup) {
      return new Response(JSON.stringify({ error: "Efa misy compte amin'io numéro io — numéro iray = compte iray" }), { status: 400, headers: corsHeaders });
    }

    // Create user (auto-confirmed)
    const { data: created, error: cerr } = await admin.auth.admin.createUser({
      email,
      password: pwd,
      email_confirm: true,
      user_metadata: {
        mvola_name: name,
        phone,
        birth_date: birth_date || null,
        gender: gender || null,
      },
    });
    if (cerr || !created.user) {
      const msg = cerr?.message ?? "Hadisoana";
      const friendly = msg.toLowerCase().includes("already") || msg.toLowerCase().includes("registered")
        ? "Efa misy compte amin'io numéro io"
        : msg;
      return new Response(JSON.stringify({ error: friendly }), { status: 400, headers: corsHeaders });
    }

    // Approbation automatique
    await admin
      .from("profiles")
      .update({ account_status: "active", approved_at: new Date().toISOString(), selfie_url: null, avatar_url: null })
      .eq("user_id", created.user.id);

    // Hash PIN dia tehirizo ao amin'ny wallet
    const pinHashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin + created.user.id));
    const pinHash = Array.from(new Uint8Array(pinHashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    await admin.from("wallets").update({ pin_hash: pinHash }).eq("user_id", created.user.id);

    return new Response(JSON.stringify({ ok: true, user_id: created.user.id }), { headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
