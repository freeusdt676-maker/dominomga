## Tanjona

Hampidirina ny fanatsarana 10 voatanisa ho an'ny tornoi (Domino / Ludo / Pétanque) sy hisy pejy "Fitsipika mazava" hahafahan'ny mpilalao mahafantatra ny lalàna rehetra.

---

## 1) Fampahafantarana (notifications)

**Backend** — fonction `tournament_notify_phase()` antsoina ao anaty cron isaky ny minitra:
- 60mn alohan'ny `reg_close` → broadcast amin'ny mpisoratra anarana: "Mikatona ato anatin'ny 1h ny inscription"
- 10mn alohan'ny `qf_at` → broadcast amin'ny 8 mpilalao: "Hanomboka ato anatin'ny 10mn ny QF"
- Rehefa misy match vaovao vonona → chat ho an'ny mpilalao (efa mafofona ho azy izy fa misy notification)

Idempotent: hampiana column `notified_phases jsonb` ao amin'ny `tournaments` mba tsy averina indroa.

## 2) Fitsipika no-show / forfait

**Backend** — fonction `tournament_check_forfeit()` antsoina amin'ny cron:
- Raha tsy nanao move ny mpilalao iray anatin'ny 3 minitra aorian'ny `started_at` ny match → forfait, ny iray hafa lasa winner
- Mampiasa: 
  - Domino: `games.updated_at` + `current_turn`
  - Ludo: `ludo_games.turn_started_at` (efa misy)
  - Pétanque: `petanque_games.updated_at` + `state.turn`
- Atao `winner_id` ny match, antsoina `tournament_advance` mba handroso

## 3) Tantara & Palmarès

**Database**: `tournament_history` view miorina amin'ny `tournaments` finished + `tournament_matches`.

**Pejy vaovao** `/tournament/history`:
- Lisitra herinandro lasa (Domino / Ludo / Pétanque) miaraka amin'ny mpandresy (avatar + anarana) sy loka azony
- Filtre game_type + volana

**Pejy `/tournament/leaderboard`**:
- Top 10 mpilalao isan-jeu sy global, miaraka amin'ny:
  - Isan'ny trono azo (🏆)
  - Isan'ny matches nandresena
  - Vola loka azo

**Profil**: hampiana badge "🏆 × N" sy "🥈 × N" raha nahazo tornoi.

## 4) Mpijery (spectators)

- Eo amin'ny tab "Tornoi" → manampy seksiona "🔴 Matchs an-dalana" misy bokotra "Jereo" mitarika any amin'ny `/spectate-domino/:id`, `/spectate-ludo/:id`, na `/spectate-petanque/:id` (efa misy)
- Badge "LIVE" miaraka amin'ny count mpijery raha azo

## 5) Fanatsarana UI

- **Countdown live** eo ambonin'ny bracket: ⏱️ "QF anatin'ny 14:32" / "Finale anatin'ny 1h12mn"
- **Bracket visuel** 8 → 4 → 2 → 1 amin'ny endrika sary mazava (mpilalao, score, mpandresy)
- **Badge** isaky ny mpilalao ao amin'ny bracket: `MIANDRY`, `MILALAO`, `NANDRESY`, `RESY`, `MPANDRESY`
- **Animation** kely (`framer-motion` na CSS) rehefa miakatra ho amin'ny dingana manaraka

## 6) Fiarovana

- **Backend**: ao amin'ny `tournament_register` → fanampin-tsivana: raha misy match `in_progress` ny mpilalao anatin'ny tornoi mbola tsy vita → `error: has_active_tournament_match`
- **Anti-multi-account**: amin'ny inscription, jereo raha misy `id_card` mitovy efa nisoratra anarana — mihantona raha mitovy (manakana account duplicata)
- **Log table** `tournament_audit_log` (efa misy `audit_log` general — hampiasaina amin'ny event "register", "cancel", "forfeit", "settle", "advance")

## 7) Admin tools fanampiny

Ao amin'ny `TournamentAdmin.tsx`:
- Bokotra **"Force advance"** (mampandeha `tournament_advance` manual avy hatrany)
- Bokotra **"Force forfait"** isaky ny match (safidio izay mpilalao resy)
- Bokotra **"Famerenana vola"** ho an'ny match tsy tafita (refund mpilalao roa)
- Tabilao "Audit log" misy ny event 50 farany

## 8) Inscription mialoha + waiting list

**Database** `tournaments`:
- Akarina ny `reg_open` ho Sabotsy 18h00 (herinandro mialoha)
- Hampiana column `waiting_list` (boolean) ao amin'ny `tournament_registrations` — raha feno ny 8, mafiditra ho waiting list (tsy alaina vola)
- Raha misy mihemotra → automatique manatona ilay voalohany ao amin'ny waiting list (vola halaina rehefa lasa active)

## 9) Loka manokana

**Tornoi manokana isam-bolana** (Sabotsy farany):
- 16 mpilalao, 10 000 Ar mise = 160 000 Ar pool
- Loka: 100 000 / 30 000 / 15 000 — Admin 15 000
- Game type `tournament_game_type` mbola mitovy, fa `tournaments.is_special boolean`
- Bracket: R16 (8 matches) → QF → SF → 3rd + Final

**Mpandresy ny taona** (Desambra 31):
- Mpilalao manana trono be indrindra amin'ny taona → bonus 200 000 Ar avy amin'ny ADM pool

## 10) Pejy Fitsipika mazava

Pejy vaovao `/tournament/rules` (sy bokotra "📖 Fitsipika" ao amin'ny pejy Tornoi):

**Atiny — section mazava amin'ny teny malagasy:**

```text
1. INSCRIPTION
   • Misokatra Sabotsy 18h00 → mikatona Sabotsy 13h45
   • Mise: 5 000 Ar (10 000 Ar amin'ny tornoi manokana)
   • Mila manana 5 000 Ar ao amin'ny solde
   • Mila manana PIN voamboatra
   • 8 mpilalao isaky ny tornoi
   • Raha feno → afaka miditra ao amin'ny waiting list

2. FANDAMINANA ORA
   • Sabotsy 14h00 — Quart de finale (4 lalao)
   • Sabotsy 14h40 — Demi-finale (2 lalao)
   • Sabotsy 15h20 — 3ème place + Finale fiomanana
   • Sabotsy 16h00 — Finale

3. LALAO
   • Mafofona automatique ao anaty table du jeu ianao
   • Tsy mila mipiana bokotra
   • Domino → règle 2 mpilalao
   • Ludo → règle 2 mpilalao (diagonale Blue ↔ Green)
   • Pétanque → règle 2 mpilalao

4. FORFAIT
   • Raha tsy manao move anatin'ny 3 minitra → forfait
   • Lasa resy → mihintsana avy hatrany

5. LOKA
   • Mpandresy: 30 000 Ar (tafiditra automatique amin'ny solde)
   • 2ème place: 6 000 Ar
   • Admin (frais d'organisation): 4 000 Ar
   • Total: 40 000 Ar = 8 × 5 000 Ar

6. AUTO-CANCEL
   • Raha latsaky ny 8 mpilalao amin'ny 13h45 → cancel
   • Vola averina ho an'ny rehetra (automatique)

7. ANTI-CHEAT
   • Tsy afaka misoratra anarana ianao raha mbola misy match tsy vita
   • Account duplicata voasakana (id_card mitovy)
   • Logs admin amin'ny event rehetra

8. MPIJERY
   • Afaka jerena mivantana ny matchs rehetra
   • Tsy afaka miditra amin'ny lalao ny mpijery

9. PALMARÈS
   • Tantara feno azo jerena ao /tournament/history
   • Classement ao /tournament/leaderboard

10. ADMIN
    • PIN admin = 2583
    • Force advance / forfait / refund azo
```

---

## Tsy hovàna (LOCKED)

- Engine Domino, Ludo, Pétanque
- Logique vola (5 000 mise, 30k/6k/4k loka — tsy ovàna invariant)
- Tournament_advance core flow (fa hampiana sub-functions)

## Dingana

1. **Migration 1** (Backend automation):
   - `tournament_notify_phase()`, `tournament_check_forfeit()`, audit_log entries
   - Schedule 2 cron job vaovao
2. **Migration 2** (Inscription mialoha + waiting list + anti-duplicate):
   - ALTER `tournaments` (reg_open Sabotsy), ALTER `tournament_registrations` (waiting_list)
   - Update `tournament_register` (jereo active match + id_card)
3. **Migration 3** (Tornoi special isam-bolana):
   - ALTER `tournaments` (is_special), update `tournament_ensure_current` + `tournament_settle_prizes`
4. **Migration 4** (History + leaderboard views):
   - View `tournament_history` + RPC `tournament_leaderboard(_game_type, _period)`
5. **Frontend**:
   - `src/pages/Tournament.tsx` — countdown, bracket visuel, badge, live matches section
   - `src/pages/TournamentHistory.tsx` (vaovao)
   - `src/pages/TournamentLeaderboard.tsx` (vaovao)
   - `src/pages/TournamentRules.tsx` (vaovao)
   - `src/components/TournamentAdmin.tsx` — Force advance/forfait/refund + audit log
   - `src/pages/Profile.tsx` — badge palmarès
   - `src/App.tsx` — route 3 vaovao

Ho lava ny migration fa atao 4 madinika (clean rollback). Tsy hokitihina ny lalao engine.

## Sary teknika

```text
Cron (every minute)
 ├─ tournament_advance(NULL)         ← efa misy
 ├─ tournament_notify_phase()        ← VAOVAO
 └─ tournament_check_forfeit()       ← VAOVAO

Tournament page
 ├─ Countdown live (⏱️)
 ├─ Bracket visuel (badge state)
 ├─ Live matches (🔴 Jereo)
 ├─ Auto-redirect rehefa myActiveMatch (efa misy)
 └─ Link: 📖 Rules · 🏆 History · 📊 Leaderboard
```
