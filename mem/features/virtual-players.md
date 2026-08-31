---
name: Joueurs virtuels (AI bots) Domino
description: Virtual Domino players — pool, presence schedule, expert AI, fair play, admin-only visibility
type: feature
---
- Registry: `public.virtual_players` (name, phone, level expert/avance/faible, games_played, wins). Pool 30–50, no duplicate name/phone.
- Orchestrator: edge function `virtual-players` (cron `virtual-players-tick`, every minute) — presence ramp down 23:00→00:00 MG, ramp up 05:00→06:00, min 5 online; creates and joins 2P/3P Domino rooms after a 30–60s wait so real players get priority.
- Moves: edge function `domino-autoplay` — virtual turns act with a variable 0–7s delay; expert level uses `chooseBestBotMove` (fair info only: own hand + board + opponent tile counts).
- FAIRNESS: no 65/35 win-rate rigging, no pre-decided winners, no special deals. Level only changes decision quality.
- Money: bots are funded by `virtual_topup` (system), never from real players' wallets; no deposits/withdrawals.
- SECRET: virtual status is admin-only (`admin_list_virtual_players`, Admin → 🤖 Bots tab). Never reveal it to players.
