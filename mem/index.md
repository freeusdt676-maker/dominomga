# Project Memory

## Core
Domino is LOCKED — do not modify game logic, timers, UI, or parameters unless the user explicitly requests a Domino change.
Ludo and Wallet are stable — only touch when explicitly requested.
TURN_TIMEOUT_SEC=10 (Ludo), Domino timer=20s, Lobby waiting expiry=2min. Do not change without explicit prompt.
Money is immutable: never add UI to delete wallets/admin_wallets. Mutations only via documented RPCs.
Commission is enforced server-side: round(stake*0.10)*players_count for all 3 games via BEFORE UPDATE triggers.
Toasts: top-center, 7s duration, richColors (Sonner) — configured in src/App.tsx.

## Memories
- [Domino lock](mem://constraints/domino-locked) — Files frozen unless user prompts a Domino change
- [Money immutable](mem://constraints/money-immutable) — Wallet/admin_wallets rows never deletable
- [VAR replay](mem://features/var-replay) — Admin history dialog structure per game type
