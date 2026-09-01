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

/**
 * Sorabola PDF — tsy ampiasaina ny "narrow no-break space" (U+202F/U+00A0)
 * satria misy police PDF mampiseho azy ho "/" na tsipika. Espace tsotra ihany.
 */
export const money = (value: number) => {
  const v = Number(value || 0);
  const s = Math.abs(v)
    .toLocaleString("fr-FR", { maximumFractionDigits: 0 })
    .replace(/[\u202f\u00a0\u2009\s]/g, " ");
  return `${v < 0 ? "-" : ""}${s} Ar`;
};

const dt = (v?: string | null) => (v ? new Date(v).toLocaleString("fr-FR") : "—");

const TYPE_LABEL: Record<string, string> = {
  deposit: "Dépôt",
  withdrawal: "Retrait",
  game_stake: "Mise (jeu)",
  game_loss: "Perte (jeu)",
  game_win: "Gain (jeu)",
  refund: "Remboursement",
};

const GAME_LABEL: Record<string, string> = {
  domino: "Domino",
  ludo: "Ludo",
  petanque: "Pétanque",
  crash: "Crash",
};

/** Signe réel du mouvement sur le solde du joueur. */
function signedAmount(tx: any): number {
  const a = Number(tx.amount ?? 0);
  switch (tx.type) {
    case "deposit":
      return ["approved", "completed"].includes(tx.status) ? a : 0;
    case "withdrawal":
      return tx.status === "rejected" ? 0 : -a;
    case "game_stake":
    case "game_loss":
      return -a;
    case "game_win":
    case "refund":
      return a;
    default:
      return 0;
  }
}

/** Mamerina map game_id -> karazana lalao (domino / ludo / petanque). */
async function loadGameKinds(gameIds: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (!gameIds.length) return map;
  const [d, l, p] = await Promise.all([
    supabase.from("games").select("id").in("id", gameIds),
    supabase.from("ludo_games" as any).select("id").in("id", gameIds),
    supabase.from("petanque_games" as any).select("id").in("id", gameIds),
  ]);
  (d.data ?? []).forEach((g: any) => { map[g.id] = "domino"; });
  ((l.data ?? []) as any[]).forEach((g: any) => { map[g.id] = "ludo"; });
  ((p.data ?? []) as any[]).forEach((g: any) => { map[g.id] = "petanque"; });
  return map;
}

export async function downloadPlayerInformation(player: Player) {
  const [txResult, walletResult] = await Promise.all([
    supabase
      .from("transactions")
      .select("type, amount, status, mvola_reference, mvola_phone, game_id, created_at, processed_at, admin_note")
      .eq("user_id", player.user_id)
      .order("created_at", { ascending: false })
      .limit(400),
    supabase.from("wallets").select("balance").eq("user_id", player.user_id).maybeSingle(),
  ]);
  if (txResult.error) throw txResult.error;

  const desc = (txResult.data ?? []) as any[];
  const asc = [...desc].reverse();
  const currentBalance = Number((walletResult.data as any)?.balance ?? player._balance ?? 0);

  // Solde avant / après isaky ny mouvement — averina mianotra avy amin'ny solde ankehitriny.
  const after: number[] = new Array(asc.length).fill(0);
  const before: number[] = new Array(asc.length).fill(0);
  let running = currentBalance;
  for (let i = asc.length - 1; i >= 0; i--) {
    after[i] = running;
    before[i] = running - signedAmount(asc[i]);
    running = before[i];
  }

  const kinds = await loadGameKinds(
    Array.from(new Set(asc.map((t) => t.game_id).filter(Boolean))) as string[],
  );

  const sum = (fn: (t: any) => boolean) =>
    asc.filter(fn).reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const deposits = sum((t) => t.type === "deposit" && ["approved", "completed"].includes(t.status));
  const withdrawals = sum((t) => t.type === "withdrawal" && ["approved", "completed"].includes(t.status));
  const wins = sum((t) => t.type === "game_win");
  const stakes = sum((t) => ["game_stake", "game_loss"].includes(t.type));
  const refunds = sum((t) => t.type === "refund");

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFillColor(12, 43, 27);
  doc.rect(0, 0, 210, 36, "F");
  doc.setTextColor(246, 208, 96);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("DOMINO GASY", 14, 16);
  doc.setFontSize(11);
  doc.text("Relevé de compte professionnel du joueur", 14, 25);

  doc.setTextColor(30, 30, 30);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  autoTable(doc, {
    startY: 44,
    theme: "grid",
    head: [["Information", "Valeur"]],
    body: [
      ["Nom", player.mvola_name || "—"],
      ["Téléphone", player.phone || "—"],
      ["ID joueur", player.player_number != null ? `Nº ${String(player.player_number).padStart(4, "0")}` : player.user_id],
      ["ID compte", player.user_id],
      ["Création du compte", dt(player.created_at)],
      ["Dernière activité", dt(player.last_seen)],
      ["Statut", player.account_status || "—"],
      ["Solde actuel", money(currentBalance)],
      ["Édité le", dt(new Date().toISOString())],
    ],
    styles: { fontSize: 9, cellPadding: 2.2 },
    headStyles: { fillColor: [12, 43, 27], textColor: [246, 208, 96] },
  });

  autoTable(doc, {
    startY: ((doc as any).lastAutoTable?.finalY ?? 90) + 8,
    theme: "grid",
    head: [["Situation comptable", "Montant"]],
    body: [
      ["Dépôts validés", money(deposits)],
      ["Retraits validés", money(withdrawals)],
      ["Gains de jeu", money(wins)],
      ["Mises / pertes", money(stakes)],
      ["Remboursements", money(refunds)],
      ["Flux net observé", money(deposits + wins + refunds - withdrawals - stakes)],
      ["Solde final", money(currentBalance)],
    ],
    styles: { fontSize: 9, cellPadding: 2.2 },
    columnStyles: { 1: { halign: "right" } },
    headStyles: { fillColor: [166, 118, 22], textColor: [255, 255, 255] },
  });

  autoTable(doc, {
    startY: ((doc as any).lastAutoTable?.finalY ?? 145) + 8,
    theme: "striped",
    head: [[
      "Date", "Transaction", "Jeu", "Statut", "Mouvement",
      "Solde avant", "Solde après", "Référence",
    ]],
    body: desc.length
      ? desc.map((tx) => {
          const i = asc.indexOf(tx);
          const mv = signedAmount(tx);
          return [
            dt(tx.created_at),
            TYPE_LABEL[tx.type] ?? tx.type,
            tx.game_id ? (GAME_LABEL[kinds[tx.game_id] ?? ""] ?? "Jeu") : "—",
            tx.status,
            `${mv > 0 ? "+" : ""}${money(mv)}`,
            money(before[i] ?? 0),
            money(after[i] ?? 0),
            tx.mvola_reference || tx.mvola_phone || "—",
          ];
        })
      : [["—", "Aucune transaction", "—", "—", "—", "—", "—", "—"]],
    styles: { fontSize: 7, cellPadding: 1.6 },
    columnStyles: {
      4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" },
    },
    headStyles: { fillColor: [12, 43, 27], textColor: [246, 208, 96] },
  });

  const safeName = (player.mvola_name || "joueur").replace(/[^a-zA-Z0-9_-]+/g, "-");
  doc.save(`Domino-Gasy-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function downloadAllPlayersInformation(players: Player[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  doc.setFillColor(12, 43, 27);
  doc.rect(0, 0, 297, 30, "F");
  doc.setTextColor(246, 208, 96);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("DOMINO GASY — RELEVÉ DE TOUS LES JOUEURS", 14, 13);
  doc.setFontSize(9);
  doc.text(`Généré le ${new Date().toLocaleString("fr-FR")} · ${players.length} comptes`, 14, 21);
  autoTable(doc, {
    startY: 36,
    theme: "grid",
    head: [["ID", "Nom complet", "Téléphone", "ID compte", "Création", "Dernière activité", "Statut", "Solde"]],
    body: players.map((player) => [
      player.player_number != null ? `#${String(player.player_number).padStart(4, "0")}` : "—",
      player.mvola_name || "—",
      player.phone || "—",
      player.user_id,
      player.created_at ? new Date(player.created_at).toLocaleDateString("fr-FR") : "—",
      player.last_seen ? new Date(player.last_seen).toLocaleString("fr-FR") : "—",
      player.account_status || "—",
      money(Number(player._balance ?? 0)),
    ]),
    styles: { fontSize: 7, cellPadding: 1.8 },
    columnStyles: { 3: { cellWidth: 56 }, 7: { halign: "right" } },
    headStyles: { fillColor: [12, 43, 27], textColor: [246, 208, 96] },
  });
  doc.save(`Domino-Gasy-Tous-les-joueurs-${new Date().toISOString().slice(0, 10)}.pdf`);
}
