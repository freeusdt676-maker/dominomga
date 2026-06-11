---
name: Ludo server-side auto-play
description: 10s expired turns are auto-played by the backend (edge function ludo-autoplay + pg_cron every 5s), even when all players are offline
type: feature
---
Ludo turn timeout (10s) is enforced server-side:
- Edge function `ludo-autoplay` (verify_jwt=false) scans all `in_progress` ludo_games and auto-plays any turn whose `turn_started_at` is ≥9.5s old (roll via balanced dice + best-move heuristic, same engine logic as client).
- Triggered by pg_cron job `ludo-autoplay-tick` every 5 seconds via net.http_post.
- `ludo_update_state` and `ludo_settle` accept `service_role` callers (auth.role()='service_role'); money math unchanged.
- Client-side auto-play in LudoGame.tsx remains as a faster fallback when a player is online.
- The engine logic is duplicated in supabase/functions/ludo-autoplay/index.ts — keep in sync with src/lib/ludoEngine.ts when rules change.