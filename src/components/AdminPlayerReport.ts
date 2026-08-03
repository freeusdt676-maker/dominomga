import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";

type Player = {
  user_id: string;
  mvola_name?: string | null;
  phone?: string | null;
  player_number?: number | null;
  _balance?: number | null;
  created_at?: string | null;
  last_seen?: string | null;
  account_status?: string | null;
};

const money = (value: number) => `${Number(value || 0).toLocaleString("fr-FR")} Ar`;

export async function downloadPlayerInformation(player: Player) {
  const [recentResult, totalsResult] = await Promise.all([
    supabase
    .from("transactions")
    .select("type, amount, status, mvola_reference, created_at")
    .eq("user_id", player.user_id)
    .order("created_at", { ascending: false })
    .limit(20),
    supabase
      .from("transactions")
      .select("type, amount, status, mvola_reference")
      .eq("user_id", player.user_id)
      .in("status", ["approved", "completed"]),
  ]);
  if (recentResult.error) throw recentResult.error;
  if (totalsResult.error) throw totalsResult.error;

  const rows = recentResult.data ?? [];
  const allRows = totalsResult.data ?? [];
  const deposits = allRows
    .filter((tx) => tx.type === "deposit" && ["approved", "completed"].includes(tx.status))
    .reduce((sum, tx) => sum + Number(tx.amount ?? 0), 0);
  const withdrawals = allRows
    .filter((tx) => tx.type === "withdrawal" && ["approved", "completed"].includes(tx.status))
    .reduce((sum, tx) => sum + Number(tx.amount ?? 0), 0);
  const wins = allRows
    .filter((tx) => tx.type === "game_win" && tx.status === "completed")
    .reduce((sum, tx) => sum + Number(tx.amount ?? 0), 0);
  const stakes = allRows
    .filter((tx) => ["game_stake", "game_loss"].includes(tx.type) && tx.status === "completed")
    .reduce((sum, tx) => sum + Number(tx.amount ?? 0), 0);
  const bonuses = allRows
    .filter((tx) => tx.type === "game_win" && /bonus/i.test(tx.mvola_reference ?? ""))
    .reduce((sum, tx) => sum + Number(tx.amount ?? 0), 0);
  const refunds = allRows
    .filter((tx) => tx.type === "refund")
    .reduce((sum, tx) => sum + Number(tx.amount ?? 0), 0);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFillColor(12, 43, 27);
  doc.rect(0, 0, 210, 36, "F");
  doc.setTextColor(246, 208, 96);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("DOMINO MGA", 14, 16);
  doc.setFontSize(11);
  doc.text("Fiche professionnelle du joueur", 14, 25);

  doc.setTextColor(30, 30, 30);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const downloadedAt = new Date().toLocaleString("fr-FR");
  autoTable(doc, {
    startY: 44,
    theme: "grid",
    head: [["Information", "Valeur"]],
    body: [
      ["Nom", player.mvola_name || "—"],
      ["Téléphone", player.phone || "—"],
      ["ID joueur", player.player_number != null ? `#${String(player.player_number).padStart(4, "0")}` : player.user_id],
      ["ID compte", player.user_id],
      ["Création du compte", player.created_at ? new Date(player.created_at).toLocaleString("fr-FR") : "—"],
      ["Dernière activité", player.last_seen ? new Date(player.last_seen).toLocaleString("fr-FR") : "—"],
      ["Statut", player.account_status || "—"],
      ["Solde actuel", money(Number(player._balance ?? 0))],
      ["Téléchargé le", downloadedAt],
    ],
    headStyles: { fillColor: [12, 43, 27], textColor: [246, 208, 96] },
  });

  const firstTable = doc as jsPDF & { lastAutoTable?: { finalY: number } };
  autoTable(doc, {
    startY: (firstTable.lastAutoTable?.finalY ?? 90) + 8,
    theme: "grid",
    head: [["Résumé comptable global", "Montant"]],
    body: [
      ["Dépôts approuvés", money(deposits)],
      ["Retraits approuvés", money(withdrawals)],
      ["Gains de jeu", money(wins)],
      ["Mises / pertes", money(stakes)],
      ["Bonus", money(bonuses)],
      ["Remboursements", money(refunds)],
      ["Flux net observé", money(deposits + wins + refunds - withdrawals - stakes)],
      ["Solde actuel", money(Number(player._balance ?? 0))],
    ],
    headStyles: { fillColor: [166, 118, 22], textColor: [255, 255, 255] },
  });

  const secondTable = doc as jsPDF & { lastAutoTable?: { finalY: number } };
  autoTable(doc, {
    startY: (secondTable.lastAutoTable?.finalY ?? 145) + 8,
    theme: "striped",
    head: [["Date", "Type", "Statut", "Montant", "Référence"]],
    body: rows.length
      ? rows.map((tx) => [
          new Date(tx.created_at).toLocaleString("fr-FR"),
          tx.type,
          tx.status,
          money(Number(tx.amount ?? 0)),
          tx.mvola_reference || "—",
        ])
      : [["—", "Aucune transaction", "—", "—", "—"]],
    styles: { fontSize: 7.5 },
    headStyles: { fillColor: [12, 43, 27], textColor: [246, 208, 96] },
  });

  const safeName = (player.mvola_name || "joueur").replace(/[^a-zA-Z0-9_-]+/g, "-");
  doc.save(`Domino-MGA-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`);
}