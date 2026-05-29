## 1. Vola / Wallet — fanamafisana ny calcul (3 lalao)

**Olana**: voalaza fa misy pilalao resy tsy mihena ny solde-ny. Rehefa naverina nojerena, ny **backend (`start_game_deduct`, `ludo_start_deduct`, `petanque_start_deduct`)** efa mametaka ny mise avy ao amin'ny wallet **vao manomboka ny lalao**, ary mametraka azy ao amin'ny `cash_pool` (escrow). Ny resy dia tsy mahazo zavatra mihitsy — ny `cash_pool` manontolo dia mankao amin'ny pandresy ihany.

Formula efa voarafitra:
- isaky ny mpilalao: `wallet -= stake`, `admin += stake*10%`, `cash_pool += stake*90%`
- pandresy mahazo: `cash_pool` = `(stake × 90%) × N` mpilalao

→ Mety ho **fampisehoana eo amin'ny écran** ihany no diso (cache, optimistic UI). Hampidirina:
- Mamerina maka avy ao amin'ny serveur ny `wallets.balance` afaka mandresy/resy ao Game.tsx / LudoGame.tsx / PetanqueGame.tsx (`refresh wallet on game end`).
- Hampiana **assertion server-side**: trigger `verify_game_settlement_strict` izay manamarina hoe `Σ wallet_after = Σ wallet_before − commission` aorian'ny `*_settle`. Raha tsy mety → `RAISE EXCEPTION` + audit_log.
- Manakana ny mpilalao tsy hanomboka raha `balance < stake` (efa misy, hatevenina amin'ny lobby UI mialoha — toast mazava "Tsy ampy ny solde-nao").

## 2. Domino — fanovana ny lalàna

Esorina manontolo ny **mode `hand` ("Maty atanana")**:
- `MODE_LABEL` tsy misy intsony `hand`.
- Lobby (Lobby.tsx): tsy afaka misafidy "Maty atanana" — mode roa sisa: `d120` sy `d80`.
- Engine (`dominoEngine.ts`): tsy misy chooseOpening mode `hand`; raha misy lalao efa eo am-pandehanana amin'io mode io → tsy ovaina ny lalao mandeha fa esorina ny safidy vaovao.

**Endgame**:
- Tsy misy intsony "maty atanana" (blocked endgame logic). Raha misy mpilalao tsy mahafetraka amin'ny dingana iray dia **mihodina fotsiny ho amin'ny manaraka** (pass), ary mitohy hatramin'ny mahatongavan'ny iray amin'ireto:
  - `score >= 80` (mode d80) na `score >= 120` (mode d120) → mandresy.
  - Mpilalao iray no manana vato (lany ny vatony) → mandresy ilay manana ny vato kely indrindra (pipsTotal) na, raha mitovy, ilay manana isan-double maro indrindra.

**Sendrasendra (instant win)**:
- Niala double 6 voalohany → mandresy.
- Nahazo isan-double mitovy amin'ny **vola anio (jour du calendrier)**, oh. anio 28 → manana double-(2+8=10 → tsy misy) → fepetra hazavaina: ny tarehimarika ifanitsiana amin'ny daty (1-6 ihany no azo, ka 28→8→tsy azo, fa raha 15→1+5=6 → mahazo double 6 voalohany). Ho fenoiko ho: **anjarany dia mahazo vato manana double izay anaty ny tarehimarika roa amin'ny daty**.
- Mahazo vato manana **≥ 5 double** amin'ny fizarana (efa misy `getInstantDoublesWinner`).

Ireo telo ireo dia hatao tafiditra ao amin'ny tatara historique.

## 3. Fihodinana (turn rotation)

- Ny fametrahan-bato dia **mihodina mifanohitra amin'ny famataranandro** (counter-clockwise): seat order = `P1 → P3 → P2 → P1...` (na 2P: `P1 → P2`).
- Tsy misy intsony privilège ho an'ny double na 6 (na mahazo bonus turn).
- Ny rond manaraka aorian'ny fandresena iray dia ny pandresy ny rond teo aloha no manomboka, fa ny rotation mitohy mifanohitra amin'ny famataranandro.

## 4. Admin VAR — historique tatara

Ao amin'ny Admin "Historique" Dialog:
- **Domino**: lisitra feno isaky ny tour:
  - N° tour
  - Anaran'ny mpilalao
  - Vato napetraka (DominoTile preview)
  - Lafiny (left/right) miaraka amin'ny **flèche** (← / →)
  - Timestamp
  - Sary capture ny board state aorian'ny fametrahana (mini SVG rendering)
- Raha **maty** (blocked) → fenoina ny "porofo": pipsTotal isaky ny mpilalao, vato sisa atànana, sary ny board, ary ny anaran'ny resy sy pandresy.
- **Ludo**: efa misy `pawns` JSON — hampiana animation pawn movement isaky ny tour avy amin'ny `ludo_moves` (table vaovao).
- **Pétanque**: efa misy `state` — hampiana lisitra balls throws isaky ny tour.

**Lien shareable**:
- Bokotra "Hizara ity tatara ity" → kopia URL: `/admin/replay/{game_kind}/{game_id}` (route publique tsy mila auth fa read-only, ny admin ihany no afaka mizara).
- Page `Replay.tsx` vaovao: mampiseho ny VAR replay (tsy mitaky admin) — mampiseho ihany ny données tatara, tsy ny mombamomba mpilalao.

## 5. Tables vaovao

- `ludo_moves(id, game_id, seat, dice, pawn_idx, from_pos, to_pos, captured uuid[], created_at)` — fitazonana isaky ny tour Ludo.
- `petanque_throws(id, game_id, owner, x, z, vx, vz, result_jsonb, round_number, created_at)` — fitazonana throws Pétanque.
- Trigger settlement integrity strict (mahasolo ny efa misy raha mila).

## Technical files

**Migrations**:
- `ludo_moves` table (+ RLS: admin all, participant select).
- `petanque_throws` table (+ RLS idem).
- Trigger `verify_game_settlement_strict` amin'ny `games`, `ludo_games`, `petanque_games`.

**Frontend**:
- `src/lib/dominoEngine.ts` — esorina ny mode `hand`; mametraka rotation counter-clockwise; esorina ny chooseOpening privilège.
- `src/pages/Game.tsx` — esorina ny blocked endgame branch; fihodinana mifanohitra amin'ny famataranandro; mametraka `game_moves` mazavakazava (efa misy, hatsaraina).
- `src/pages/Lobby.tsx` — esorina ny mode "Maty atanana" amin'ny safidy.
- `src/pages/LudoGame.tsx` — manoratra ao amin'ny `ludo_moves` isaky ny dingana.
- `src/pages/PetanqueGame.tsx` — manoratra ao amin'ny `petanque_throws` isaky ny throw.
- `src/pages/Admin.tsx` — Dialog VAR vaovao miaraka amin'ny per-turn replay sy bokotra "Hizara".
- `src/pages/Replay.tsx` (vaovao) — public read-only replay viewer.
- `src/App.tsx` — route `/replay/:kind/:id`.

**Memory**:
- Update `mem/constraints/domino-locked.md`: marihina fa nesorina ny "Maty atanana" tamin'ity dingana ity tamin'ny fangatahana mazava.
- Update `mem/features/var-replay.md` amin'ny rafitra vaovao.

## Sokajy lehibe / risque

Domino dia voasokajy ho "LOCKED" ao amin'ny memory. Ity fangatahana ity dia mazava avy amin'ny mpampiasa fa hovaina. Mba **tsy hanimba ny lalao** efa mandeha tsara:
- Tsy hovaina ny timers (20s) na ny animations.
- Tsy hovaina ny UI globaly (felt board, tile rendering).
- Ovaina ihany ny lalàna endgame, rotation, sy ny safidin'ny mode.
