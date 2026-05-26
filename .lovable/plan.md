
## Drafan'asa hamafisina ny app

### 1. Toaster milatsaka avy any ambony (7s)
- Fanovana ny `<Sonner />` ao @ `src/App.tsx` mba ho `position="top-center"`, `duration={7000}`, `richColors`
- Ny `toast.success` (maitso) sy `toast.error` (mena) efa hampiasaina manerana app
- Tsy mila manova ny `toast.*` calls efa misy

### 2. Bokotra "Mbola manana lalao mandeha" mihetsiketsika (Lobby/LudoLobby/PetanqueLobby)
- Esorina ny hafatra teny fotsiny
- Solo: bokotra mistari-pasiha (floating) miaraka amin'ny animation `animate-pulse` + glow gold
- Mikitika dia mandeha avy hatrany amin'ny `/game/:id` na `/ludo/:id` na `/petanque/:id`
- Query: alaina ny lalao misy ny user amin'ny status `in_progress` na `waiting` (player2_id NOT NULL ho azy)

### 3. Historique du jeu ao amin'ny Admin + VAR Replay
- Ao @ `src/pages/Admin.tsx`: vaovao tab "Tantaran'ny lalao" misy lalao 3 (Domino / Ludo / Pétanque)
- Lisitra: ticket, daty, mpilalao, mise, commission, pandresy, montant gain, status
- Bokotra "VAR Replay" — modal mampiseho:
  - Domino: `game_moves` rehetra (piece + side + player + timestamp) + state finale
  - Ludo: `pawns` history (avy amin'ny `updated_at` snapshots) + last_dice — afaka mampiseho fotsiny ny état farany sy moves raha tsy misy snapshots
  - Pétanque: `state.balls` + jack + scores per round
- Bokotra "Mamafa" (mena) — mamafa ilay game record + moves (efa misy `admin_delete_game` ho an'ny domino; hampiana ho an'ny ludo & petanque)

### 4. Bokotra "Mamafa" ny transactions ao amin'ny Admin
- Efa misy `admin_delete_transaction` (pending fotsiny) — ampiana fanazavana mazava
- Ny vola (`wallets.balance`) sy `admin_wallets.balance`: TSY misy bokotra mamafa mihitsy
- Garde-fou: tsy maintsy `pending` no azo fafàna (efa eo)

### 5. Hamafisina ny calcul commission 10% sy gain
- Trigger SQL `enforce_settle_integrity` amin'ny `games`/`ludo_games`/`petanque_games`:
  - Raha `status = 'finished'` sy `winner_id IS NOT NULL`: hamarinina hoe ny `commission = round(stake*0.10) * players_count` ary ny gain natao `INSERT` amin'ny `transactions` (`type='game_win'`) dia mitovy amin'ny `(stake - round(stake*0.10)) * players_count`
- Function `verify_game_settlement(_game_id)` — admin tool mampiseho raha misy diso
- Audit log entry isaky ny settle

### 6. Mémoire fitazomana hatsarana
- Mametraka memory `mem://constraints/money-immutable.md` — tsy azo asiana bokotra mamafa wallet/admin_wallets
- Memory `mem://features/var-replay.md` — VAR replay structure

### Fanavaozana fichier
- `src/App.tsx` — Sonner top + 7s
- `src/pages/Lobby.tsx`, `LudoLobby.tsx`, `PetanqueLobby.tsx` — floating active-game button
- `src/pages/Admin.tsx` — tab Tantaran'ny lalao + VAR modal + delete buttons
- Migration vaovao:
  - `admin_delete_ludo_game`, `admin_delete_petanque_game`
  - `verify_game_settlement` + trigger integrity
  - Audit logging on settle

### Antony tsy idirana
- Tsy ovaina ny `wallets`/`admin_wallets` schema na RLS (vola voaaro)
- Tsy ovaina ny engine ny lalao (engine.ts) — tsy hanimba ny gameplay tsara efa misy

Aorian'ny fanekena dia atao migration aloha, dia code.
