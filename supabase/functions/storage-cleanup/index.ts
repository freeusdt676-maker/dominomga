// Scheduled maintenance: fafana ny selfie orphelin (tsy misy profil mampiasa azy) mihoatra ny 30 andro
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "selfies";
const MAX_AGE_DAYS = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) DB retention + archivage
    const { data: dbRes, error: dbErr } = await admin.rpc("cleanup_old_data");
    if (dbErr) console.error("cleanup_old_data", dbErr.message);

    // 2) Referenced selfie paths
    const referenced = new Set<string>();
    for (const table of ["profiles", "password_reset_requests", "profile_change_requests"]) {
      const col = table === "profile_change_requests" ? "proposed_selfie_url" : "selfie_url";
      const { data } = await admin.from(table).select(col);
      (data ?? []).forEach((r: any) => {
        const url = r[col];
        if (!url) return;
        const i = String(url).indexOf(`/${BUCKET}/`);
        if (i >= 0) referenced.add(String(url).substring(i + BUCKET.length + 2));
      });
    }

    // 3) List bucket and delete orphans older than MAX_AGE_DAYS
    // ?all=1 => fafana daholo ny sary (tsy mampiasa sary intsony ny profil)
    const purgeAll = new URL(req.url).searchParams.get("all") === "1";
    const cutoff = purgeAll ? Date.now() + 86400_000 : Date.now() - MAX_AGE_DAYS * 86400_000;
    const orphans: string[] = [];

    const scan = async (prefix: string) => {
      let offset = 0;
      while (true) {
        const { data: files, error } = await admin.storage
          .from(BUCKET)
          .list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
        if (error) throw error;
        if (!files || files.length === 0) break;
        for (const f of files) {
          if (!f.name) continue;
          const full = prefix ? `${prefix}/${f.name}` : f.name;
          // Dossier (tsy misy id) => midina ao anatiny
          if (!(f as any).id) {
            await scan(full);
            continue;
          }
          if (!purgeAll && referenced.has(full)) continue;
          const created = new Date(f.created_at ?? f.updated_at ?? Date.now()).getTime();
          if (created < cutoff) orphans.push(full);
        }
        if (files.length < 1000) break;
        offset += files.length;
      }
    };
    await scan("");


    let removed = 0;
    for (let i = 0; i < orphans.length; i += 100) {
      const chunk = orphans.slice(i, i + 100);
      const { error } = await admin.storage.from(BUCKET).remove(chunk);
      if (!error) removed += chunk.length;
    }

    return new Response(JSON.stringify({ ok: true, db: dbRes ?? null, storage_removed: removed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
