import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Trophy } from "lucide-react";

type GT = "domino" | "ludo" | "petanque";
const LABELS: Record<GT, string> = { domino: "Domino", ludo: "Ludo", petanque: "Pétanque" };

function fmtRemaining(ms: number) {
  if (ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}J`);
  if (d || h) parts.push(`${h}h`);
  parts.push(`${m}min`);
  parts.push(`${sec}s`);
  return parts.join(" ");
}

function fmtMG(iso: string) {
  const mg = new Date(new Date(iso).getTime() + 3 * 3600_000);
  const days = ["Alahady", "Alatsinainy", "Talata", "Alarobia", "Alakamisy", "Zoma", "Sabotsy"];
  return `${days[mg.getUTCDay()]} ${String(mg.getUTCDate()).padStart(2, "0")}/${String(mg.getUTCMonth() + 1).padStart(2, "0")}/${mg.getUTCFullYear()} • ${String(mg.getUTCHours()).padStart(2, "0")}:${String(mg.getUTCMinutes()).padStart(2, "0")}`;
}

export default function TournamentCountdown() {
  const [items, setItems] = useState<{ gt: GT; qf_at: string; status: string }[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const load = async () => {
      const gts: GT[] = ["domino", "ludo", "petanque"];
      const results = await Promise.all(
        gts.map(async (gt) => {
          const { data } = await supabase.rpc("tournament_get_current" as any, { _game_type: gt });
          const t = (data as any)?.tournament;
          return t?.qf_at ? { gt, qf_at: t.qf_at, status: t.status } : null;
        }),
      );
      setItems(results.filter(Boolean) as any);
    };
    load();
    const itv = setInterval(load, 60_000);
    return () => clearInterval(itv);
  }, []);

  useEffect(() => {
    const itv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(itv);
  }, []);

  const upcoming = items.filter((i) => i.status !== "finished" && i.status !== "cancelled");
  if (upcoming.length === 0) return null;

  return (
    <div className="space-y-2">
      {upcoming.map((it) => {
        const ms = new Date(it.qf_at).getTime() - now;
        const live = ms <= 0 || it.status === "running";
        return (
          <Link
            to="/tournament"
            key={it.gt}
            className="block rounded-xl border-2 border-red-500/70 bg-gradient-to-br from-red-950/80 via-red-900/60 to-black/60 p-4 shadow-[0_0_24px_-4px_rgba(239,68,68,0.5)] animate-pulse"
          >
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="w-4 h-4 text-red-300" />
              <p className="text-[10px] tracking-[0.25em] uppercase text-red-200 font-bold">
                Tornoi du Semaine — {LABELS[it.gt]}
              </p>
            </div>
            {live ? (
              <p className="font-serif-luxe text-2xl text-red-100 leading-tight">
                🔴 EN DIRECT — Mandeha izao!
              </p>
            ) : (
              <>
                <p className="text-xs text-red-200/90">Hanomboka amin'ny:</p>
                <p className="font-serif-luxe text-lg text-red-50 leading-tight mt-0.5">
                  {fmtMG(it.qf_at)}
                </p>
                <p className="mt-2 font-mono text-2xl font-bold text-white tabular-nums tracking-wider">
                  ⏱ {fmtRemaining(ms)}
                </p>
              </>
            )}
          </Link>
        );
      })}
    </div>
  );
}