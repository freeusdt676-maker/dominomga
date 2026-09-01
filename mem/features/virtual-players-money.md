---
name: Calcul vola amin'ny lalao misy bot (Domino)
description: How stakes, pot and commission work when virtual players are in a Domino game
type: feature
---
- `start_game_deduct`: bots pay nothing. Commission = 10%×stake × REAL players (admin wallet). **Pot (`cash_pool`) = (stake − 10%) × players_count** — mitovy amin'ny lalao 100% olona.
- `settle_game`:
  - winner REAL → mahazo ny pot manontolo (mitovy amin'ny teo aloha).
  - winner VIRTUAL → tsy misy wallet mahazo; `(stake − 10%) × real_count` mankany amin'ny `admin_wallets` (ny vola very an'ny mpilalao tena izy dia mankany amin'ny trano).
- `admin_total_locked_cash_pool`: domino only counts the REAL-funded share `(stake − 10%) × real_count`; bot share never displayed.
- `admin_total_player_balance` excludes admin + virtual wallets.
