---
name: Fiarovana tsiambaratelo bot
description: Bot/virtual-player internals must never be reachable outside admin
type: constraint
---
- `admin_list_virtual_players`, `admin_set_bot_skill`, `admin_set_bots_enabled`, `admin_bot_config` : EXECUTE ho an'ny `authenticated` + `service_role` ihany (anon revoked); admin check anaty function.
- `bots_enabled`, `is_virtual_player`, `purge_bot_only_games`, `domino_guard_instant_win`, `expire_stale_withdrawals` : `service_role` ihany.
- `public.virtual_players` : tsy misy grant ho an'ny `anon` intsony; RLS admin-only.
- Public ihany: `virtual_online_count()` sy `virtual_online_players()` (anarana fotsiny).
- Admin pages (`/admin`, `/admin/security`, `/admin-chat`) lazy-loaded — tsy ao anaty bundle voalohany.
