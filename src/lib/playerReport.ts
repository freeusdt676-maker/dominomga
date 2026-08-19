import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";

const money = (v: number) => `${Number(v || 0).toLocaleString("fr-FR")} Ar`;
const dt = (v?: string | null) => (v ? new Date(v).toLocaleString("fr-FR") : "—");

export type ReportProfile = {
  user_id: string;
  mvola_name?: string | null;
  phone?: string | null;
  player_number?: number | null;
  account_status?: string | null;
  created_at?: string | null;
};

export type ReportStats = { wins: number; losses: number; played: number; net: number };

/** Rapport PRO du joueur : identité, statistiques, parties, mouvements d'argent, détail par tour. */
export async function downloadMyPlayerReport(profile: ReportProfile, stats: ReportStats) {
  const [txRes, ledgerRes, walletRes] = await Promise.all([
    supabase
      .from("transactions")
      .select("type, amount, status, mvola_reference, created_at")
      .eq("user_id", profile.user_id)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("round_ledger" as any)
      .select("game_kind, ticket_number, round_number, points, cumulative, stake, amount, is_final, is_winner, created_at")
      .eq("player_id", profile.user_id)
      .order("created_at", { ascending: false })
      .limit(80),
    supabase.from("wallets").select("balance").eq("user_id", profile.user_id).maybeSingle(),
  ]);

  const txs = (txRes.data ?? []) as any[];
  const ledger = (ledgerRes.data ?? []) as any[];
  const balance = Number((walletRes.data as any)?.balance ?? 0);

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  doc.setFillColor(14, 46, 30);
  doc.rect(0, 0, W, 76, "F");
  doc.setTextColor(233, 196, 106);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("DOMINO GASY — Rapport Joueur", 40, 34);
  doc.setFontSize(10);
  doc.setTextColor(230, 230, 230);
  doc.setFont("helvetica", "normal");
  doc.text(`Généré le ${new Date().toLocaleString("fr-FR")}`, 40, 54);

  doc.setTextColor(20, 20, 20);
  autoTable(doc, {
    startY: 96,
    head: [["Informations joueur", ""]],
    body: [
      ["Nom MVola", profile.mvola_name ?? "—"],
      ["Téléphone", profile.phone ?? "—"],
      ["ID joueur", profile.player_number != null ? `Nº ${String(profile.player_number).padStart(4, "0")}` : "—"],
      ["Statut du compte", profile.account_status ?? "—"],
      ["Inscription", dt(profile.created_at)],
      ["Solde actuel", money(balance)],
    ],
    theme: "grid",
    headStyles: { fillColor: [14, 46, 30], textColor: [233, 196, 106] },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: { 0: { cellWidth: 160, fontStyle: "bold" } },
  });

  const deposits = txs.filter((t) => t.type === "deposit" && ["approved", "completed"].includes(t.status)).reduce((s, t) => s + Number(t.amount || 0), 0);
  const withdrawals = txs.filter((t) => t.type === "withdrawal" && ["approved", "completed"].includes(t.status)).reduce((s, t) => s + Number(t.amount || 0), 0);

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 18,
    head: [["Statistiques", ""]],
    body: [
      ["Parties jouées", String(stats.played)],
      ["Victoires", String(stats.wins)],
      ["Défaites", String(stats.losses)],
      ["Taux de victoire", stats.played ? `${Math.round((stats.wins / stats.played) * 100)} %` : "—"],
      ["Gain net (jeux)", money(stats.net)],
      ["Dépôts validés", money(deposits)],
      ["Retraits validés", money(withdrawals)],
    ],
    theme: "grid",
    headStyles: { fillColor: [14, 46, 30], textColor: [233, 196, 106] },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: { 0: { cellWidth: 160, fontStyle: "bold" } },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 18,
    head: [["Date", "Type", "Montant", "Statut", "Référence"]],
    body: txs.length
      ? txs.map((t) => [dt(t.created_at), t.type, money(Number(t.amount || 0)), t.status, t.mvola_reference ?? "—"])
      : [["—", "Aucun mouvement", "—", "—", "—"]],
    theme: "striped",
    headStyles: { fillColor: [14, 46, 30], textColor: [233, 196, 106] },
    styles: { fontSize: 8, cellPadding: 3 },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 18,
    head: [["Date", "Jeu", "Ticket", "Tour", "Points", "Cumul", "Mise", "Gain/Perte"]],
    body: ledger.length
      ? ledger.map((r) => [
          dt(r.created_at),
          String(r.game_kind).toUpperCase(),
          r.ticket_number ? `#${r.ticket_number}` : "—",
          String(r.round_number),
          String(Number(r.points || 0)),
          String(Number(r.cumulative || 0)),
          money(Number(r.stake || 0)),
          r.is_final ? `${Number(r.amount) >= 0 ? "+" : ""}${money(Number(r.amount || 0))}` : "—",
        ])
      : [["—", "Aucun tour enregistré", "—", "—", "—", "—", "—", "—"]],
    theme: "striped",
    headStyles: { fillColor: [14, 46, 30], textColor: [233, 196, 106] },
    styles: { fontSize: 8, cellPadding: 3 },
  });

  const name = (profile.mvola_name ?? "joueur").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  doc.save(`rapport_${name}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
