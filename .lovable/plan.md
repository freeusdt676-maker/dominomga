## Vinavina

Onglet vaovao "TOURNOI DU SEMAINE" (logo coupe d'or) eo amin'ny Home, manelanelana ny lalao Domino sy ny lalao hafa. Ny rafitra:

1. **TOURNOI DU SEMAINE** (page miverina avy amin'ny ongles)
2. **RÉGLER** (lalàna feno, emoji)
3. **HANDRAY ANJARA** (formulaire: NOM, TÉL, ID, MISE 5000Ar → CONFIRMER → PIN)

## Lalàna (tena hatao mazava amin'ny "RÉGLER")

- 🎮 Lalao: Domino 2 mpilalao (tena mitovy amin'ny lalao tsotra)
- 👥 Mpandray anjara: **8 ihany** (raha feno dia mikatona)
- 💰 Mise: **5 000 Ar / olona** (alaina avy hatrany rehefa CONFIRMER)
- 🏆 Loka: 1<sup>er</sup> **30 000 Ar** · 2<sup>è</sup> **6 000 Ar** · Admin **4 000 Ar**
- 🗓️ Inscription: **Latsinainy 00:00** ka hatramin'ny **Sabotsy 00:00** (ora MG)
- 🪙 Wallet iray = inscription iray (tsy azo soratana indroa)
- 🧩 Bracket: apahavalon-dalana avy hatrany. Group A/B/C/D (olona 2 isaky ny groupe), arahan'ny fahatongavana ny fizarana.
- ⏰ Fandaharana (ora MG):
  - 14:00 — ¼ finale (A1vA2, B1vB2, C1vC2, D1vD2)
  - 14:40 — ½ finale (Mpandresy A vs B, C vs D)
  - 15:20 — Petite finale (faharoa)
  - 16:00 — Finale
- ❌ Ny ADMINISTRATIF irery no afaka manafoana mpandray anjara na ny tournoi manontolo (PIN 2583, miverina ny vola)
- 🔄 Alahady 00:00: mifafa ho azy ny tournoi taloha, manomboka indray ny inscription vaovao
- 🚫 Tsy misy halatra: snapshot atao isaky ny round, audit log, integrity trigger

## Fototra teknika

### Base données (migration)
- `tournaments` — week_start, week_end, status (registration / running / finished / cancelled), winner_id, runner_up_id, total_collected
- `tournament_registrations` — tournament_id, user_id (UNIQUE), nom, tel, id_card, paid_amount, group_letter, slot, cancelled_at
- `tournament_matches` — tournament_id, round (qf/sf/3rd/final), match_index, player1_id, player2_id, winner_id, game_id, scheduled_at, started_at, finished_at

### RPC vaovao
- `tournament_get_current()` — manome ny tournoi mandeha (na manamboatra azy raha tsy misy)
- `tournament_register(_nom, _tel, _id_card, _pin)` — manamarina PIN, manala 5000, mametraka groupe/slot, mikatona raha 8
- `tournament_admin_cancel_registration(_reg_id, _pin)` — miverina 5000
- `tournament_admin_cancel_tournament(_pin)` — miverina ny vola rehetra
- `tournament_advance()` — idempotent, antsoina any amin'ny client. Mamorona ny lalao Domino isaky ny round rehefa tonga ny ora
- `tournament_record_match_winner(_match_id, _winner)` — antsoina avy ao @Game.tsx amin'ny faran'ny lalao tournoi
- `tournament_settle()` — mizara ny loka rehefa vita ny finale & petite finale

### Sary / Pages
- `src/pages/Tournament.tsx` — ongles 3 (Tournoi / Règler / Handray anjara)
- `src/components/TournamentBracket.tsx` — sary bracket tsara tarehy (Lucide Trophy icon)
- `src/components/TournamentRegisterDialog.tsx` — formulaire + PIN modal
- `src/components/admin/TournamentAdmin.tsx` — vinavina ho an'ny ADM (lisitra, total, bokotra annuler)
- Home.tsx — bokotra vaovao + logo Trophy
- Admin.tsx — bokotra "TORNOI DU SEMAINE"
- Game.tsx — raha `tournament_match_id` dia tsy miala mise indray fa antsoina `tournament_record_match_winner` rehefa vita

### Vola — invariant
Total tafiditra = 8 × 5000 = **40 000 Ar**. Fizarana = 30 000 + 6 000 + 4 000 = **40 000 Ar**. Net delta = 0. ✓
- Inscription: wallet -5000, tournament.total_collected +5000
- Annulation: wallet +5000, total_collected -5000
- Settle: wallet[winner] +30000, wallet[runner_up] +6000, admin_wallet +4000

### Ora
Ampiasaina `Africa/Antananarivo` (UTC+3) amin'ny calcul rehetra ny week_start / round_scheduled_at.

### Tsy hovàna
- Aza kitihina ny lalao Domino misy (engine), Ludo, Pétanque, Spectator.
- Aza kitihina ny rafitra wallet/admin_wallets.
- Ny RPC `start_game_deduct` tsy antsoina amin'ny lalao tournoi (efa nandoa mialoha amin'ny inscription).
