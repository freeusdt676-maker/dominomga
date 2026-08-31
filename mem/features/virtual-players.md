---
name: Joueurs virtuels (AI bots) Domino
description: Virtual Domino players — pool, presence, expert AI, no real money, admin-only visibility
type: feature
---
- Registry: `public.virtual_players` (name, phone, level, games_played, wins). Pool 30–50, no duplicate name/phone.
- Orchestrator: edge function `virtual-players` (cron every minute) — presence ramp by time of day, min 5 online; keeps LIVE Domino rooms between 4 and 8; real players' rooms have priority, surplus virtual `waiting` rooms are deleted; bots join open rooms only after a 30–60s wait.
- Moves: edge function `domino-autoplay` — virtual turns act with a 1–5s delay and ALWAYS use `chooseBestBotMove` (strong expert play, fair info only: own hand + board + opponent tile counts). No weak-slip, no win-rate rigging.
- MONEY (critical): bots pay nothing. `start_game_deduct` skips virtual players; commission = 10%×stake×REAL players, `cash_pool` = (stake−commission)×REAL players. Example 2P real-vs-bot at 1000 Ar → commission 100, pot 900. `enforce_domino_settle_integrity` validates commission with real-player count. `settle_game` tolerates pot=0 (bot-only games). `admin_cancel_domino_game` refunds real players only.
- Admin totals: `admin_total_player_balance` excludes admin AND virtual wallets. Helper `public.is_virtual_player(uuid)`.
- SECRET: virtual status is admin-only (`admin_list_virtual_players`, Admin → 🤖 Bots tab). Never reveal it to players.
- Presence UI shows only a count ("N en ligne" + green dot), never names.
