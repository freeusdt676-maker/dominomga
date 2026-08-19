---
name: Crash MGA
description: Server-authoritative crash game — rounds, bets, cashout, provably fair, house = admin wallet
type: feature
---
Route `/crash` (src/pages/CrashGame.tsx). Backend is fully server-authoritative:
- `crash_rounds` (public: hash, status, timings; crash_point revealed only after crash), `crash_round_secrets` (server_seed + crash_point, admin-only after crash), `crash_bets` (own rows only).
- `crash_tick()` is the state machine (betting 8s → running → crashed → next round after 6s). Any client may call it; it is idempotent and advisory-locked.
- Multiplier curve: `m(t) = floor(exp(0.08*t)*100)/100`, min ×1.00, max ×999.00.
- Crash point: HMAC-SHA256(server_seed, nonce) → e in [0,1); `c = floor(0.80/(1-e)*100)/100`, c<1.01 ⇒ ×1.00 bust (~20%), clamped to 999. So P(c ≥ 2) = 40% → house 60% / player 40% (user-mandated ratio, do not change).
- `crash_place_bet(_amount,_auto_cashout)`: 100–10 000 Ar, one bet per round, betting phase only, active account, respects `game_blocks('crash')`.
- UI: airplane emoji flies along the curve, explosion emoji + Web Audio boom & vibration on crash.
- `crash_cashout()`: server recomputes multiplier from `started_at`; too late ⇒ bet lost.
- Money: bet debits wallet → credits admin_wallets (house is counterparty); payout debits admin_wallets → credits wallet. Total conserved. Never add other credit paths.
