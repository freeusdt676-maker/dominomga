---
name: Data retention & storage cleanup
description: Automatic 3-day retention rules, archiving of finished games, and selfie storage cleanup
type: feature
---
**Cron `cleanup-old-data`** (every 6h, `public.cleanup_old_data()`), logs each run into `public.maintenance_log` (admin-only, kept 30 days). RÈGLE (demandée par l'utilisateur): **tout l'historique est purgé après 3 jours**, l'argent n'est jamais touché.

Purgé à 3 jours: `game_moves` (parties non actives), historique crash (`crash_bets`, `crash_round_secrets`, `crash_rounds` crashed, `crash_schedule`), `login_attempts`, `rate_limits`, `chat_messages`, `lobby_messages`, `audit_log`, `game_audit`, `round_ledger`, `games_archive`, `fraud_alerts` résolus, demandes de récupération/changement de profil traitées, et `transactions` avec statut approved/rejected/completed. Puis `archive_old_games(3)`.

`push_subscriptions` idle > 60 jours.

**`archive_old_games(days)`** (min 1 jour) déplace les parties `finished`/`cancelled` domino/ludo/petanque dans `games_archive` (snapshot jsonb) et supprime les originaux + moves/chat. Les parties `waiting`/`in_progress` ne sont jamais touchées.

**Cron `storage-cleanup-daily`** (03:20) → edge function `storage-cleanup`: `cleanup_old_data()` puis suppression des selfies non référencés.

**NEVER purge**: `wallets`, `admin_wallets`, transactions `pending`, `profiles`, `user_roles`, parties actives, demandes en attente.
