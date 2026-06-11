## Tanjona

Hampidirina ny **Tornoi Ludo** sy **Tornoi Pétanque** miaraka amin'ny Tornoi Domino efa misy ao amin'ny pejy "Tournoi du Semaine". Tornoi 3 samihafa, mitovy rafitra tanteraka:
- 8 mpilalao isaky ny tornoi
- 5 000 Ar mise
- Loka mitovy: 30 000 / 6 000 / 4 000 Ar
- Sabotsy 14h00 (¼) → 14h40 (½) → 15h20 (3è) → 16h00 (Finale)

Ny mpilalao iray dia afaka misoratra anarana amin'ny 1, 2 na 3 tornoi miaraka (samy manana wallet deduction azy).

## Endrika UI

Onglet vaovao mahitsy ao **ambonin'ny** "Tournoi / Règler / Handray":
```text
[ 🁫 DOMINO ] [ 🎲 LUDO ] [ 🎯 PÉTANQUE ]
       └── 🏆 Tournoi   📖 Règler   ✍️ Handray
```
Ny safidy iray dia mamadika ny rehetra (count, bracket, regs, formulaire, lalàna). Mitazona ny endrika "luxe-card" misy efa eo.

Bracket-na Ludo: 2 mpilalao isaky ny lalao (mode 2P). Pétanque: 2 mpilalao. Domino: tsy miova.

Bouton "▶️ Miditra amin'ny lalao-ko" mandeha amin'ny route mety:
- Domino → `/game/:id`
- Ludo → `/ludo/:id`
- Pétanque → `/petanque/:id`

## Backend (migration tokana)

### Database
1. ENUM vaovao `tournament_game_type` ('domino','ludo','petanque').
2. `tournaments.game_type` (default 'domino' ho an'ny rakitra efa misy). Esorina ny UNIQUE(week_start), apetraka UNIQUE(week_start, game_type).
3. Atao seeded ny tournoi Ludo + Pétanque ho an'ny herinandro misy ankehitriny.
4. Atao `ludo_games.tournament_match_id` + `is_tournament`, toy izany koa `petanque_games`.

### RPC novaina (rehetra mandray `_game_type text` parameter)
- `tournament_ensure_current(_game_type)` → mahazo na mamorona herinandro misy ny game_type.
- `tournament_get_current(_game_type)` → mamerina tournoi + regs + matches ho an'ny game_type.
- `tournament_register(_game_type, _nom, _tel, _id_card, _pin)` → manesotra 5000 amin'ny wallet, manisy groupe + slot ao amin'ny game_type tiana.
- `tournament_admin_cancel(_game_type, _pin)` sy `tournament_admin_cancel_registration(_reg_id, _pin)` (efa scoped amin'ny reg).
- `tournament_advance(_game_type)` → mamorona matches: 
  - domino → `games` (efa misy)
  - ludo → `ludo_games` (players_count=2, status='in_progress', stake=0)
  - petanque → `petanque_games` (stake=0)
- `tournament_create_match_game(_tid, _game_type, _p1, _p2)` → branch isaky ny game_type.
- `ludo_settle` sy `petanque_settle`: ampiana branch "if is_tournament" toy ny efa misy ao amin'ny `settle_game` — tsy misy vola mifindra, tsy mila cash_pool, fa manamarika winner_id + mamerina amin'ny `tournament_matches`.
- `tournament_settle_prizes(_tid)` mitovy.

### Compatibility
Ny RPC efa misy tsy mandray parameter (`tournament_get_current()`) dia tehirizina ho overload mamerina ilay tournoi 'domino' mba tsy hahatapaka ny code efa misy ankehitriny (TournamentAdmin.tsx atomboka manaitra azy ireo amin'ny `_game_type='domino'`).

## Frontend

### `src/pages/Tournament.tsx`
- State vaovao `gameType: 'domino' | 'ludo' | 'petanque'`.
- Segmented control eo ambony (chip 3 misy logo + anarana).
- Antsoina `tournament_get_current` miaraka amin'ny `_game_type`.
- Antsoina `tournament_register` sy `tournament_advance` miaraka amin'ny `_game_type`.
- Subscription realtime: filter amin'ny `tournament_id` ankehitriny mba tsy ho be loatra ny load.
- `myActiveMatch` route adika arakaraka ny game_type.

### `src/components/TournamentAdmin.tsx`
- Segmented control mitovy. Mahatazona ny PIN 2583.

### `src/pages/Home.tsx` (kely fotsiny)
- Ny bokotra Trophy efa mitondra amin'ny `/tournament` — tsy miova. (Ny safidin'ny game_type ao anatin'ny pejy.)

## Sary teknika (txt diagram)

```text
tournaments
 ├─ (week_start, game_type) UNIQUE   ← NEW composite key
 └─ game_type: domino | ludo | petanque

tournament_matches
 └─ game_id   ── (game_type) ──►   games  /  ludo_games  /  petanque_games
                                   (is_tournament=true, cash_pool=0)

tournament_advance(_game_type)
 ├─ ensure_current(_game_type)
 ├─ close registration / cancel-if-not-8
 ├─ create QF (4) → SF (2) → 3rd + Final
 └─ settle_prizes (30k / 6k / 4k Ar)
```

## Tsy hovàna

- Engine Domino (LOCKED): tsy kitihina.
- Engine Ludo / Pétanque: tsy kitihina mihitsy ny logique lalao; ny `is_tournament` branch dia ao amin'ny settle RPC fotsiny mba tsy misy vola mifindra (efa nandoa amin'ny inscription).
- Wallet/admin_wallets: tsy ovàna ny invariant. 8×5000 = 40 000 = 30 000+6 000+4 000.
- Tsy misy ovàna ny tournoi Domino efa mandeha izao (game_type='domino' ho azy).

## Dingana

1. Mamorona migration miaraka amin'ny ENUM, ALTER tabilao, sy ny RPC rehetra (~250 andalana SQL).
2. Mamboatra `src/pages/Tournament.tsx` (manampy game_type selector + nampifanaraka ny appel RPC).
3. Mamboatra `src/components/TournamentAdmin.tsx` (mitovy).
4. QA: jereo ny console + network rehefa misafidy game_type, register, advance.

Ho lava ny migration fa tokana — tsy hokitihina ny code lalao Domino/Ludo/Pétanque.