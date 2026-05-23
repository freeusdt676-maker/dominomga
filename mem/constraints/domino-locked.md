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