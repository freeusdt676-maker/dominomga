# Project Memory

## Core
Money invariant: wallets + admin_wallets + cash_pool is conserved; never add credit paths without a matching debit.
Retention jobs must never delete wallets, transactions, round_ledger, profiles, or active games.

## Memories
- [Money accounting](mem://constraints/money-accounting) — wallet/admin/cash_pool invariant and allowed RPCs
- [Money immutable](mem://constraints/money-immutable) — no destructive wallet UI, allowed money RPCs
- [Domino locked](mem://constraints/domino-locked) — domino rules/stakes that must not change
- [Crash MGA](mem://features/crash-mga) — crash multiplier scheduling and payout rules
- [VAR replay](mem://features/var-replay) — replay feature notes
- [Data retention](mem://features/data-retention) — automatic cleanup, game archiving, selfie storage purge
