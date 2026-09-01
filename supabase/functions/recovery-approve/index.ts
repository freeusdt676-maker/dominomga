import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const genPassword = () => {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return "mga" + String(n[0] % 1000000).padStart(6, "0");
};
const genPin = () => {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return String(n[0] % 10000).padStart(4, "0");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // Verify caller is an admin
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await caller.auth.getUser();
    const uid = userRes?.user?.id;
    if (!uid) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
    const { data: isAdmin } = await caller.rpc("has_role", { _user_id: uid, _role: "admin" });
    if (isAdmin !== true) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: corsHeaders });

    const { request_id } = await req.json();
    if (!request_id) return new Response(JSON.stringify({ error: "missing request_id" }), { status: 400, headers: corsHeaders });

    const admin = createClient(url, service);
    const { data: reqRow, error: rErr } = await admin
      .from("password_reset_requests")
      .select("id,user_id,status")
      .eq("id", request_id)
      .maybeSingle();
    if (rErr || !reqRow) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: corsHeaders });
    if (!reqRow.user_id) return new Response(JSON.stringify({ error: "no_user" }), { status: 400, headers: corsHeaders });

    const { data: prof } = await admin
      .from("profiles")
      .select("password_plain,pin_plain")
      .eq("user_id", reqRow.user_id)
      .maybeSingle();

    let pwd = (prof?.password_plain ?? "").trim();
    let pin = (prof?.pin_plain ?? "").trim();
    let regenerated = false;

    // Password is hashed in auth — if we have no stored copy, issue a fresh one
    // and apply it to the account so what we reveal really works.
    if (!pwd) {
      pwd = genPassword();
      regenerated = true;
      const { error: uErr } = await admin.auth.admin.updateUserById(reqRow.user_id, { password: pwd });
      if (uErr) return new Response(JSON.stringify({ error: uErr.message }), { status: 400, headers: corsHeaders });
    }
    if (!/^\d{4}$/.test(pin)) {
      pin = genPin();
      regenerated = true;
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin + reqRow.user_id));
      const pinHash = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
      await admin.from("wallets").update({ pin_hash: pinHash }).eq("user_id", reqRow.user_id);
    }

    await admin
      .from("profiles")
      .update({ password_plain: pwd, pin_plain: pin })
      .eq("user_id", reqRow.user_id);

    await admin
      .from("password_reset_requests")
      .update({
        status: "approved",
        reveal_password: pwd,
        reveal_pin: pin,
        processed_at: new Date().toISOString(),
        revealed_at: null,
        expires_at: null,
      })
      .eq("id", request_id);

    return new Response(JSON.stringify({ ok: true, regenerated }), { headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
