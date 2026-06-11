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

## Domino WIN conditions (LOCKED — 2026-06-03, FINAL)
Three conditions make a player WIN THE GAME (settle_game):
1. **Target reached**: score ≥ target (D120 → 120, D80 → 80).
2. **Datinandro**: at deal time, a player's hand pip total equals today's day-of-month (1–31). Triggers instant settle_game; all hands are written to DB so spectators/opponents can verify. A center-screen overlay announces the winner.
3. **Mandeha irery**: in a single round, a player earns points ≥ 60 (D120) or ≥ 40 (D80). Triggers instant settle_game. Winner score is forced to target for history.

ALL of these are removed and MUST NOT be reintroduced — even partially, even as an opt-in:
- ❌ Double 6 instant win
- ❌ "5+ double atànana" deal-time instant win
- ❌ Auto-play branch that settles when tile = [6,6]
- ❌ "Maty atànana" / running out of tiles instant win
- ❌ Blocage instant win
- ❌ Endgame vote / continue-stop flow after target

Running out of tiles, blocage and "mitovy vato" only end the ROUND and may add points. They only win the GAME if the resulting score crosses the target.

History label `last_reason` MUST be prefixed `MANDRESY NY LALAO — …`. Target wins use `… tonga {target}`; datinandro wins use `… DATINANDRO {day} • {name} tonga datinandro`. Profile.tsx `parseReason` detects `datinandro` first, then falls back to `tonga`.

**Why:** The user repeatedly demanded that ONLY the target wins ("ny akoatrizay tsimisy"). Any re-introduction of bonus win conditions is a regression. If a future task asks for a new win category, push back and ask for explicit confirmation that this lock is being intentionally lifted.