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
- SECRET risk engine (server only, never shown in UI): `crash_new_round()` reads the last 24h of `crash_bets` (wagered vs paid). Baseline k=0.95 / tail=0.58 ⇒ ~10% instant bust, ~72% under ×2, ~81% under ×2.5, ~5.5% ≥×5. If players are collectively ahead (RTP high / negative platform PnL) it tightens (down to k 0.70 / tail 0.48); if the platform is far ahead it loosens slightly (k 1.02 / tail 0.66). Anti-frustration: 6 of last 7 rounds under ×1.60 forces a relaxed round. Mixing is probabilistic, never a fixed rule: depending on how many of the last 4 rounds were ≥×2 (1/2/3+), the next round is forced below ×2 with 15%/45%/70% chance, plus ±8% random jitter on k/tail each round. Never expose this logic, the ratios, or the PnL in the app.
