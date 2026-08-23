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
- Domino turn timeout: 15s
- Lobby waiting room expiry: 2 minutes
- Auto-place behavior at 15s timeout

**Why:** The user confirmed Domino is "tena tsara be" (perfect) and asked for an explicit lock so nothing changes automatically. Any drift breaks the validated UX.

**How to apply:** If a user request would require touching Domino code as a side effect (refactors, cross-cutting cleanup, security sweeps, design system changes), either skip the Domino portion or ask the user before proceeding.

## Explicit revisions (2026-05-29)
- Removed "Maty atànana" mode (`hand`) from Lobby + Game. Only `d120` and `d80` remain selectable; legacy `hand` rows fall back to 120-target behaviour.
- Removed "maty atànana" as an instant-win reason in `finishRound`. Blocked endgame still resolves by lowest pipsTotal via `finishBlocked` (no mode renaming).
- Turn rotation is **contraire montre / mankany ANKAVIA** as understood from the live table order (3P: P1 → P2 → P3 → P1). Explicitly corrected by user on 2026-07-04. Opener rotates round-robin per round (round N opener = ids[(N-1) % count]) — direction unchanged.

## Domino official rules (LOCKED — 2026-08-02)
- **Match victory:** only when accumulated score reaches the selected target (D80=80, D120=120).
- **Blocked round:** the player with the lowest remaining pip total wins the round. Their own pips are not counted; awarded points equal the sum of all opponents' remaining pips. A blocked round never bypasses the match target.
- **Opening (revised 2026-08-23):** NO forced tile. The round opener (rotation by round number) plays any tile they choose on the empty board. The [6|6] forced opening is removed.
- **40 prend tout:** a 40+ point round receives the full round points but does not bypass the 80/120 target.
- **Ray sy Fotsy / [0|0]-[0|1] rule:** completely removed and must never be reintroduced.
- Running out, Double 6 out, a block, or a tied block only end the round unless the resulting accumulated score reaches target.

**Why:** These requirements supersede all older contradictory Domino win-condition memories.

## Anti-skip invariant (2026-06-28)
Never advance/pass a Domino turn while the current player has at least one legal tile for the board ends. This applies to:
- manual pass
- 15s client autoplay
- background watchdog / cron autoplay
- any future admin or repair scripts

The backend must be the final guard: pass-only updates must raise/block when `domino_hand_has_move(current_player_hand, board_state)` is true. If a player is offline but has a legal tile, autoplay should place a legal tile, not skip them.

**Why:** The user repeatedly saw 3P matches where one player with playable tiles was skipped while only the other two played.

## 3P turn ownership invariant (2026-07-03)
For Domino 3P, the turn order is permanently **contraire montre / makany ANKAVIA** in the live table order: P1 → P2 → P3 → P1. Round openers still rotate fairly by round number: Round 1=P1, Round 2=P2, Round 3=P3, then repeat.

Only the client logged in as `current_turn` may perform local timeout/bot auto-action. Other players' clients must never auto-play or auto-pass on behalf of that player; if that player leaves/offline, the backend watchdog is the only fallback.

The database must reject any update that advances `current_turn` to anything other than `domino_next_turn_id(old_game, old.current_turn)`, and must reject pass-only turn advances while the old current player has a legal move.

**Why:** Customers reported 3P games where A and B kept playing while C was skipped. Cross-client auto-action can race against stale views and make the skip look permanent.

## Board endpoint colors (2026-07-10)
Do not color every placed domino red. Only the left/vodiny endpoint tile is red, only the right/lohany endpoint tile is green, and all middle tiles keep black pips.

## 15s autoplay/vibration invariant (2026-07-10)
Domino turn deadline is 15s. At 0s the backend watchdog must auto-play a legal tile or pass if no legal tile exists, even when every player leaves or loses data. The 5s remaining vibration must run only on the device of the current-turn player, never on opponents' devices.
## Domino stake range (2026-08-23)
Domino mise is free input from 200 Ar to 100 000 Ar (fixed 1K/2K/3K/5K buttons removed). Admin commission stays 10%. Ludo/Petanque stakes unchanged.
