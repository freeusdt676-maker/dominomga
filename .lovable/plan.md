# Fanovana lehibe — Domino MGA

## 1. Lobby vaovao (4 dingana + Confirmer)
Ao amin'ny `src/pages/Lobby.tsx`, soloana ny UI tononkalo amin'ireto safidy ireto:

1. **Players** — boutons 2 toy ny tab: `2P (1vs1)` na `3P (1vs2vs3)`.
2. **Mise** — chip 1k → 10k (efa misy).
3. **Mode** — `Maty 120` / `Maty 80` / `Maty atanana` (efa misy).
4. **Confirmer le demande** — bokotra lehibe gold. Tsy mandefa lalao raha tsy voakitika.

Aorian'ny Confirmer:
- Mamorona `games` row vaovao misy `players_count`, `stake`, `game_mode`, `status='waiting'`.
- Lasa miditra avy hatrany amin'ny `/game/:id` ny mpamorona.
- Eo amin'ny lisitry ny lalao vonona, hipoitra amin'ny adversaire rehetra ireo info: anaran'ny mpamorona, players (2P/3P), mise, mode. Raha mety aminy → kitiha → join → manomboka avy hatrany.
- Asehoy Nº TICKET amin'ny mpilalao rehetra rehefa manomboka.

## 2. 3P mode
- Engine: 3 mpilalao, samy 7 vato (28 - 21 = 7 sisa tsy zaraina raha 2P efa 14 sisa, fa 3P dia 7 sisa lasa boneyard fotsy — tsy ampiasaina satria tsy misy fakana).
- Tour: rotation `p1 → p2 → p3 → p1`.
- Bloqué: raha samy tsy afaka ny 3, izay kely indrindra mahazo ny diff (point = sum of others - own).
- Round end: rehefa misy mahalany dia mahazo `sum of remaining of 2 others`.
- Instant win conditions mitoetra: double-6 final, total = anio date, target reached.

## 3. Opening rules araka ny mode
- `d120` (Maty 120) → mpamoaka voalohany = manana **double 0** (0,0). Tsy misy → double 1, 2, 3, 4, 5, 6 (kely → lehibe).
- `d80` (Maty 80) → manana **double 6** voalohany. Tsy misy → 5, 4, 3, 2, 1, 0 (lehibe → kely).
- `hand` (atanana) → mitovy amin'ny d120 (kely → lehibe).
- Alaina ny mpilalao manana ilay double, lasa first turn azy, ary apetraka ho voalohany ny vato.

## 4. Tableau — anarana
Ao amin'ny `src/pages/Game.tsx`, asehoy eo amin'ny tsirairay (header + areny ny tanana) ny `mvola_name` (avy amin'ny `profiles`). Ho 3P, asehoy avokoa ny anaran'ny telo.

## 5. Vato HD
Avaozina ny `DominoTile.tsx`:
- SVG misy gradient ivory, shadow lalina, double border (gold inset + dark outset).
- Pip = circle radius lehibe kokoa, gradient noir → charcoal, inner highlight.
- Spine (rezika afovoany) gold thin line.
- Sizes: `sm` 40×80, `md` 56×112, `lg` 72×144.

## 6. Database
Ampiana `players_count` (smallint, default 2) sy `player3_id` (uuid, nullable) sy `player3_hand` (jsonb default `[]`) sy `score_p3` (numeric default 0) ao amin'ny `games`.
Ampiana `players_count` (smallint default 2) ao amin'ny `challenges` sy `matchmaking_queue` (raha mbola ampiasaina).
Asiana update ny RLS games_select_participant + games_update_participant mba hampidirana `player3_id`.
Asiana update `join_and_start_game` RPC mba handraisana 3P (raha efa feno player2 fa mbola players_count=3, mametraka player3 ary 'in_progress' rehefa feno).
Mety mila RPC vaovao `start_game_deduct` mihevitra player3 koa.

## Sehatry ny asa
1. Migration database (ampiana column + update RPC).
2. `src/lib/dominoEngine.ts` — ampiana 3P + opening rule.
3. `src/components/DominoTile.tsx` — HD redesign.
4. `src/pages/Lobby.tsx` — UI vaovao 4 dingana.
5. `src/pages/Game.tsx` — 3P support, anarana, ticket display, opening logic.

## Fanontaniana mialoha
- Ny commission: ho 3P, samy mandoa `stake` ny telo, ary ny pot = `(stake - 10%) × 3` ho an'ny mpandresy iray. **OK ve?**
- Ny "Maty atanana" amin'ny 3P → izay vita atanana voalohany no mandresy, sa izay manana isa kely indrindra raha bloqué? **Raisiko: izay vita voalohany na izay kely indrindra raha bloqué.**

Tafiditra anaty migration sy code rehetra ireto. Ekena ve?
