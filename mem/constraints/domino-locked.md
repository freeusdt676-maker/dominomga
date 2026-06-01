---
name: Domino locked
description: Domino game is frozen — no changes without explicit user prompt
type: constraint
---
The Domino game is considered finished and stable. Do NOT modify any Domino-related code, parameters, timers, animations, UI, or engine logic unless the user explicitly asks for a Domino change in a prompt.

Frozen files (do not edit unless explicitly requested):
- src/pages/Game.tsx (Domino game page)
- src/pages/Lobby.tsx (Domino lobby)
- src/lib/dominoEngine.ts
- src/components/DominoTile.tsx
- Domino-related sections of src/index.css (felt board, domino arena, sad/win animations, button active feedback)

Frozen parameters (do not change without explicit prompt):
- Domino turn timeout: 20s
- Lobby waiting room expiry: 2 minutes
- Auto-place behavior at 20s timeout

**Why:** The user confirmed Domino is "tena tsara be" (perfect) and asked for an explicit lock so nothing changes automatically. Any drift breaks the validated UX.

**How to apply:** If a user request would require touching Domino code as a side effect (refactors, cross-cutting cleanup, security sweeps, design system changes), either skip the Domino portion or ask the user before proceeding.

## Explicit revisions (2026-05-29)
- Removed "Maty atànana" mode (`hand`) from Lobby + Game. Only `d120` and `d80` remain selectable; legacy `hand` rows fall back to 120-target behaviour.
- Removed "maty atànana" as an instant-win reason in `finishRound`. Blocked endgame still resolves by lowest pipsTotal via `finishBlocked` (no mode renaming).
- Turn rotation is now **counter-clockwise**: in 3P the order is P1 → P3 → P2. Applied to `nextTurnId`, opener selection in `initializeGameHands`, `finishRound` next-round, and `finishBlocked` tie re-deal.

## Domino WIN conditions (LOCKED — 2026-06-01)
Exactly FOUR conditions make a player WIN THE GAME (settle_game). Nothing else does:
1. **Target**: score ≥ target (D120 → 120, D80 → 80).
2. **Solo (mandeha irery)**: score ≥ target/2 (60 for D120, 40 for D80) while ALL opponents are still at 0.
3. **Double 6**: placing the 6/6 tile during any turn.
4. **Datinandro**: placing ANY tile (not necessarily a double) whose pip total (a+b) equals the day of the month (e.g. June 1 → tile with 1 pip [0/1] wins; June 2 → tile with 2 pips [0/2 or 1/1] wins; June 12 → tile with 12 pips [6/6 — also triggers Double 6]).

Running out of tiles ("lany vato") and blocage ONLY end the round and award points; they do NOT win the game unless the resulting score crosses condition (1) or (2).

History label `last_reason` MUST be prefixed `MANDRESY NY LALAO — ...` for those four categories and `Tour vita — ...` / `Blocage` otherwise. Profile.tsx `parseReason` depends on the keywords: `6/6`, `datinandro`, `mandeha irery`, `tonga`.