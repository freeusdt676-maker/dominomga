---
name: Crash MGA
description: Server-authoritative crash game — rounds, bets, cashout, provably fair, no admin commission
type: feature
---
Route `/crash` (src/pages/CrashGame.tsx). Backend is fully server-authoritative:
- `crash_rounds` (public: hash, status, timings; crash_point revealed only after crash), `crash_round_secrets` (server_seed + crash_point, admin-only after crash), `crash_bets` (own rows only).
- `crash_tick()` is the state machine (betting 10s → running → crashed → next round after 6s). Any client may call it; it is idempotent and advisory-locked.
- Multiplier curve: `m(t) = floor(exp(0.08*t)*100)/100`, min ×1.00, max ×999.00.
- Crash point: HMAC-SHA256(server_seed, nonce) → e in [0,1); `c = floor(0.88 / power(1-e, 0.70) * 100) / 100`, c<1.01 ⇒ ×1.00 bust, clamped to 999. Tail tuned so ~8% of rounds reach ×5+ and 100+ is capped by daily rarity. House/player ratio stays secret in the UI.
- `crash_place_bet(_amount,_auto_cashout)`: 100–10 000 Ar, up to two bets per round (two independent UI slots; crash_cashout(_bet_id) cashes one slot), betting phase only, active account, respects `game_blocks('crash')`.
- `crash_place_bet_multi(_amount1,_auto1,_amount2,_auto2)`: places both slots atomically in one call (blue "MISE 1 + 2 MIARAKA" button).
- Clock sync: the client derives the multiplier from `started_at` + a latency-compensated (NTP-style, median of lowest-RTT samples) server offset, so slow Wi-Fi/data devices show the exact same live round.
- UI: airplane emoji flies along the curve, explosion emoji + Web Audio boom & vibration on crash.
- `crash_cashout()`: server recomputes multiplier from `started_at`; too late ⇒ bet lost.
- Money: Crash MGA NEVER touches `admin_wallets` (no 10% commission). Bet debits the player wallet only; payout credits the player wallet only. The 10% admin commission applies to Domino, Pétanque and Ludo only.
- UI: never display the house/player win ratio in the app (user-mandated secret). Sound has a mute toggle (localStorage 'crash_muted').
- SECRET engine (server only): each round is an INDEPENDENT draw from HMAC uniforms (`crash_uniform`) mapped to buckets — ~11% ×1.00, ~57% 1.01–1.99, ~19% 2.00–2.49, ~8.5% 2.50–4.99, ~3.1% 5.00–9.99, ~1.2% 10.00–29.99, ~0.2% 30+. No streak/pattern/memory logic at all, so results cannot be studied or predicted. A hidden 24h RTP shift (±0.04–0.07 on bucket bounds) tightens odds when players are ahead. Never expose this in the UI.
