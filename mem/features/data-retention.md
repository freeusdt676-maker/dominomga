---
name: Data retention & storage cleanup
description: Automatic retention rules, archiving of finished games, and selfie storage cleanup
type: feature
---
**Cron `cleanup-old-data`** (every 6h, `public.cleanup_old_data()`), logs each run into `public.maintenance_log` (admin-only, kept 90 days):
- `game_moves` > 30 days — only when the parent game is NOT `waiting`/`in_progress`
- crash history (`crash_bets`, `crash_round_secrets`, `crash_rounds` with status `crashed`, `crash_schedule`) > 30 days
- `login_attempts`, `rate_limits`, `chat_messages` > 30 days; `lobby_messages` > 7 days
- `audit_log`, `game_audit`, resolved `fraud_alerts`, processed recovery/profile-change requests > 90 days
- `push_subscriptions` idle > 60 days
- then `public.archive_old_games(90)`

**`archive_old_games(days)`** moves `finished`/`cancelled` domino/ludo/petanque rows older than 90 days into `public.games_archive` (jsonb snapshot: scores, mode, ticket, players, stake, commission) and deletes the originals plus their moves/chat. Active games (`waiting`, `in_progress`) are never touched.

**Cron `storage-cleanup-daily`** (03:20) calls edge function `storage-cleanup`: runs `cleanup_old_data()` then removes selfie files in the `selfies` bucket that are older than 30 days and not referenced by `profiles.selfie_url`, `password_reset_requests.selfie_url`, or `profile_change_requests.proposed_selfie_url`.

**NEVER purge**: `wallets`, `admin_wallets`, `transactions`, `round_ledger`, `profiles`, `user_roles`, active games, pending requests.
