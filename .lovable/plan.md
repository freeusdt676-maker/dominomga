# Ludo MGA — fanampiana lalao vaovao

Hampidirina ao amin'ny site ny Ludo (mitovy paompy amin'ny Ludo Master) miaraka amin'ny mise sy commission mitovy amin'ny Domino.

## 1. Database (migration vaovao)

Tafy `ludo_games` table mitokana (mba tsy hanakorontana ny `games` an'ny Domino):

```
ludo_games
- id uuid pk
- players_count smallint (2 | 3 | 4)
- stake numeric
- status game_status (waiting | in_progress | finished)
- player1_id .. player4_id uuid (player1 NOT NULL, hafa nullable)
- current_turn_seat smallint (1..players_count)
- last_dice smallint (1..6, nullable)
- dice_rolled bool
- consecutive_sixes smallint
- pawns jsonb  -- [{seat:1, idx:0, pos:-1, home:false}, ...]  (pos: -1=base, 0..51=track, 100..105=home column, 200=finished)
- winner_id uuid
- ticket_number text
- commission numeric default 0
- created_at, updated_at, finished_at, turn_started_at
```

RLS:
- `select`: participant na `waiting` na admin
- `insert`: own waiting
- `update`: participant
- `delete`: own waiting tsy mbola misy player2

Functions vaovao (mitovy paompy amin'ny Domino):
- `ludo_join_and_start(_game_id, _user)` — mametraka amin'ny seat malalaka, raha feno → `in_progress`, current_turn_seat=1, manomboka ny pawns avy hatrany.
- `ludo_start_deduct(_game_id)` — manala mise tamin'ny mpilalao rehetra, mandefa commission 10% × N any amin'ny `admin_wallets`, mametraka `commission` ao amin'ny game.
- `ludo_settle(_game_id, _winner)` — mandoa pot = (stake − 10%) × N.
- `ludo_cancel_waiting(_game_id)` — mitovy amin'ny `cancel_waiting_game`.
- `ludo_update_state(...)` — anokafan'ny client manavao `pawns`, `current_turn_seat`, `last_dice`, `dice_rolled`, `consecutive_sixes`, `status`, `winner_id`.

## 2. Engine (`src/lib/ludoEngine.ts` vaovao)

Lalao Ludo classique:
- Track 52 case (0..51), seat start positions: seat1=0, seat2=13, seat3=26, seat4=39.
- Home column 6 case isaky ny seat.
- Pawn 4 isaky ny seat (16 raha 4P, 12 raha 3P, 8 raha 2P).
- Roll dice 1–6.
- Mivoaka tao base mila 6.
- Mahazo 6 → mividy tour iray hafa (max 3 consecutive sixes → tsy maintsy mandalo).
- Capture: raha mipetraka amin'ny case efa misy pion an'ny hafa (tsy safe square) → ny pion tratra miverina any base.
- Safe squares: 8 case mahazatra (start squares + star squares).
- Tonga home column → tsy maintsy roll exact mba hahatongavana 200 (finished).
- Mandresy = pion 4 vita home daholo voalohany.

Helpers:
- `legalMoves(state, seat, dice)` → list of pawn indices afaka mihetsika.
- `applyMove(state, seat, pawnIdx, dice)` → state vaovao + capture info.
- `nextTurn(state)` → mandeha amin'ny seat manaraka raha tsy 6 (na 3 sixes).

## 3. Pages vaovao

### `src/pages/LudoLobby.tsx` (route `/ludo`)
- Mitovy paompy amin'ny `Lobby.tsx` (Domino) fa misafidy: `Players (2P/3P/4P)` + `Mise`. Tsy misy "Mode" (tsy ilaina amin'ny Ludo).
- Confirmer le demande → Mise vonona → mamorona `ludo_games` row → mankany `/ludo/:id`.
- Lisitra mpilalao vonona (waiting + 3P/4P misy seat malalaka).

### `src/pages/LudoGame.tsx` (route `/ludo/:id`)
- Header: ticket, mise, scores, anaran'ny mpilalao (`profiles.mvola_name`).
- Board SVG 15×15 ornate purple/gold (manakaiky ny screenshot 3rd image).
  - 4 home base (red, green, yellow, blue) any an-joro.
  - Cross track 52 case.
  - Center home triangle 4 colors.
  - Star/safe squares.
- Seat → loko :
  - 2P: seat1=blue, seat2=red.
  - 3P: blue, red, green.
  - 4P: blue, red, green, yellow (mitovy amin'ny Ludo Master).
- Dice 3D ornate gold border. Click to roll (raha turn anao + tsy mbola voakitika).
- Pawn click → animation move.
- Realtime sync via supabase channel.
- Turn timer 30s.
- Rehefa misy mahalany pion 4 daholo → call `ludo_settle`.

### Theme/UI
- Ny LudoLobby sy LudoGame ihany no manana style "Ludo Master" (purple panel + gold ornate frame). Ampiana `.ludo-panel`, `.ludo-frame`, `.ludo-btn` ao amin'ny `index.css` mba tsy hanapotika ny Domino UI.
- Background: deep purple gradient + ornate gold border SVG.
- Bouton: gold gradient pill miaraka amin'ny shadow.

## 4. Routing (`src/App.tsx`)
- Ampiana `/ludo` → LudoLobby
- Ampiana `/ludo/:id` → LudoGame

## 5. Home (`src/pages/Home.tsx`)
- Asiana "card" iray vaovao "LUDO MASTER" miaraka amin'ny lobby Domino, mba ahafahan'ny user misafidy lalao roa.

## 6. Types
Aorian'ny migration, ny `src/integrations/supabase/types.ts` dia havaozina automatique.

## Sehatry ny asa
1. Migration: `ludo_games` table + 4 RPC + RLS.
2. `src/lib/ludoEngine.ts`.
3. `src/components/LudoBoard.tsx` (SVG board + pawns + dice).
4. `src/pages/LudoLobby.tsx`.
5. `src/pages/LudoGame.tsx`.
6. `src/App.tsx` (routes) + `src/pages/Home.tsx` (entry point).
7. `src/index.css` (ludo theme tokens).

## Fanontaniana
- Tsy ilaina ny "double dice" na "missed turn penalty" (ataoko classic). **OK ve?**
- "Capture": miverina any base ny pion tratra fa tsy mahazo bonus turn ho an'izay nanao capture (classic). **OK ve?**
- 3P → seat 1, 2, 3 (blue, red, green) — tsy misy yellow.

Raha mitombina daholo, ataoko avy hatrany ny implémentation.
