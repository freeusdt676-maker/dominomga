import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtAr } from "@/lib/constants";
import { ArrowDownLeft, ArrowUpRight, Loader2 } from "lucide-react";

const LABELS: Record<string, string> = {
  deposit: "Dépôt",
  withdrawal: "Retrait",
  game_win: "Fandresena",
  game_loss: "Faharesena",
  game_stake: "Mise",
  refund: "Refund",
};

export default function PlayerMoneyHistory({ userId }: { userId: string }) {
  const [rows, setRows] = useState<any[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("transactions")
        .select("id, type, amount, status, mvola_reference, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (alive) setRows(data ?? []);
    })();
    return () => { alive = false; };
  }, [userId]);

  if (!rows) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  if (!rows.length) return <div className="card-felt rounded-xl p-6 text-center text-sm text-muted-foreground">Mbola tsy misy mouvement vola.</div>;

  const credit = (t: string) => ["deposit", "game_win", "refund"].includes(t);

  return (
    <div className="space-y-2">
      {rows.map((t) => {
        const isCredit = credit(t.type);
        return (
          <div key={t.id} className="card-felt rounded-xl p-3 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${isCredit ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
              {isCredit ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{LABELS[t.type] ?? t.type}</p>
              <p className="text-[10px] text-muted-foreground truncate">
                {new Date(t.created_at).toLocaleString("fr-FR")}
                {t.mvola_reference ? ` · ${t.mvola_reference}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className={`font-bold text-sm ${isCredit ? "text-green-400" : "text-red-400"}`}>
                {isCredit ? "+" : "-"}{fmtAr(Number(t.amount ?? 0))}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase">{t.status}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
