---
name: Calcul vola amin'ny lalao misy bot (Domino)
description: How stakes, pot and commission work when virtual players are in a Domino game
type: feature
---
- `start_game_deduct`: bots pay nothing. **Calcul mitovy 100% amin'ny teo aloha**: `games.commission = 10%×stake × players_count` (na bot na olona), **pot (`cash_pool`) = (stake − 10%) × players_count**. Ohatra 3P 1000 Ar → commission 300, pot 2700.
- Wallet admin kosa dia mandray ny anjaran'ny mpilalao TENA IZY ihany (`10%×stake × real_count`) — mba tsy hita eo amin'ny affichage ny vola noforonin'ny rafitra ho an'ny bot.
- `settle_game`:
  - winner REAL → mahazo ny pot manontolo (ohatra 3P 1000 → 2700, tombony +1700).
  - winner VIRTUAL → tsy misy wallet mahazo; `(stake − 10%) × real_count` mankany amin'ny `admin_wallets`.
- `admin_cancel_domino_game`: refund mise feno ho an'ny olona tena izy; manala `10%×stake × real_count` amin'ny wallet admin.
- `enforce_domino_settle_integrity`: expected commission = `10%×stake × players_count`.
- `admin_total_locked_cash_pool`: domino only counts the REAL-funded share `(stake − 10%) × real_count`; bot share never displayed.
- `admin_total_player_balance` excludes admin + virtual wallets.

