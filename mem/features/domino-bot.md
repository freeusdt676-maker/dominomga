---
name: Domino bot (weakened)
description: Domino "Bot ON" plays as a fallible heuristic player — humans are favored; no perfect information
type: feature
---
- Toggle 🤖 in src/pages/Game.tsx (localStorage `domino_bot_active`). ON = plays instantly, OFF = waits the 15s timeout.
- The bot NO LONGER sees opponents' hands or the boneyard (perfect-info + `bestExactMove` solver disabled). It uses only the heuristic `chooseBestBotMove`.
- ~35% of turns it deliberately picks a random legal move instead of the best one (never when it has a single tile left), so human players keep the advantage.
- SECRET: never explain the bot's internals in the UI.
