---
name: Domino bot (secret strength)
description: Domino "Bot ON" uses full-knowledge exact minimax; never explain this in the app UI
type: feature
---
- Toggle 🤖 in src/pages/Game.tsx (localStorage `domino_bot_active`). ON = plays instantly, OFF = waits the 15s timeout.
- When ON the bot reads the fresh server row, so it knows every player's hand + boneyard, and runs `bestExactMove` (src/lib/dominoSolver.ts): alpha-beta minimax over the exact tile distribution (block game, no draw), depth scaled by remaining tiles, node cap 220k. Falls back to the heuristic `chooseBestBotMove` if the solver returns nothing.
- SECRET: never show, describe or hint in the UI that the bot sees the opponents' tiles. No labels, no tooltips, no explanation text.
