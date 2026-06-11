# Project Memory

## Core
Domino is LOCKED — do not modify game logic, timers, UI, or parameters unless the user explicitly requests a Domino change.
Ludo and Wallet are stable — only touch when explicitly requested.
TURN_TIMEOUT_SEC=10 (Ludo), Domino timer=20s, Lobby waiting expiry=2min. Do not change without explicit prompt.
Money is immutable: never add UI to delete wallets/admin_wallets. Mutations only via documented RPCs.
Commission is enforced server-side: round(stake*0.10)*players_count for all 3 games via BEFORE UPDATE triggers.
Wallet+admin+cash_pool total is conserved — only deposits add, withdrawals remove. NEVER add credit paths.
Domino win = target reached (80/120) OR datinandro (hand pip total at deal = day-of-month) OR mandeha irery (single-round points ≥ 40 D80 / ≥ 60 D120) OR double-6 out (ending the round by playing [6|6] as the last tile in hand).
Toasts: top-center, 7s duration, richColors (Sonner) — configured in src/App.tsx.

## Memories
- [Domino lock](mem://constraints/domino-locked) — Files frozen unless user prompts a Domino change
- [Money immutable](mem://constraints/money-immutable) — Wallet/admin_wallets rows never deletable
- [Money accounting](mem://constraints/money-accounting) — Invariant: wallet+admin+cash_pool conserved except deposits/withdrawals
- [VAR replay](mem://features/var-replay) — Admin history dialog structure per game type
- [Ludo server auto-play](mem://features/ludo-server-autoplay) — Backend cron auto-plays expired 10s turns even if all players offline
