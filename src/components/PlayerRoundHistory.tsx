import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtAr } from "@/lib/constants";
import { Loader2 } from "lucide-react";

type Row = {
  id: string; game_kind: string; game_id: string; ticket_number: string | null;
  round_number: number; points: number; cumulative: number; stake: number;
  amount: number; is_final: boolean; is_winner: boolean; created_at: string;
};

export default function PlayerRoundHistory({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("round_ledger" as any)
        .select("id, game_kind, game_id, ticket_number, round_number, points, cumulative, stake, amount, is_final, is_winner, created_at")
        .eq("player_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (alive) setRows((data ?? []) as any);
    })();
    return () => { alive = false; };
  }, [userId]);

  if (!rows) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  if (!rows.length) {
    return (
      <div className="card-felt rounded-xl p-6 text-center text-sm text-muted-foreground">
        Mbola tsy misy tour voarakitra. Ny lalao manaraka rehetra dia ho voarakitra tour-tour eto.
      </div>
    );
  }

  // Groupement par partie
  const groups = new Map<string, Row[]>();
  rows.forEach((r) => {
    const k = `${r.game_kind}:${r.game_id}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  });

  return (
    <div className="space-y-3">
      {Array.from(groups.entries()).map(([k, list]) => {
        const first = list[0];
        const sorted = [...list].sort((a, b) => a.round_number - b.round_number);
        const finalRow = list.find((r) => r.is_final);
        const net = Number(finalRow?.amount ?? 0);
        return (
          <div key={k} className="card-felt rounded-xl p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {first.game_kind} · {first.ticket_number ? `#${first.ticket_number}` : "—"}
              </span>
              <span className="text-[10px] text-muted-foreground">{new Date(first.created_at).toLocaleDateString("fr-FR")}</span>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left px-2 py-1">Tour</th>
                  <th className="text-right px-2 py-1">Points</th>
                  <th className="text-right px-2 py-1">Cumul</th>
                  <th className="text-right px-2 py-1">Mise</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id} className="border-t border-border/30">
                    <td className="px-2 py-1 font-bold">T{r.round_number}</td>
                    <td className="px-2 py-1 text-right font-mono">{Number(r.points)}</td>
                    <td className="px-2 py-1 text-right font-mono">{Number(r.cumulative)}</td>
                    <td className="px-2 py-1 text-right font-mono">{fmtAr(Number(r.stake))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {finalRow && (
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className={`px-2 py-0.5 rounded border ${finalRow.is_winner ? "bg-green-500/20 text-green-300 border-green-500/40" : "bg-red-500/20 text-red-300 border-red-500/40"}`}>
                  {finalRow.is_winner ? "NANDRESY" : "RESY"}
                </span>
                <span className={`font-bold ${net >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {net >= 0 ? "+" : "-"}{fmtAr(Math.abs(net))}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
