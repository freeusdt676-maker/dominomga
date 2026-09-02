---
name: Bouton Activer/Désactiver bot vurtiel
description: Admin switch that turns virtual players (bots) fully on or off
type: feature
---
- Admin → onglet 🤖 Bots → carte "Bot vurtiel": boutons ✅ Activer / ⛔ Désactiver.
- RPC `admin_set_bots_enabled(_enabled boolean)` (admin ihany) → `app_internal_config.bots_enabled` ('true' default).
- Désactivé: salles `waiting` 100% bot foanana, lalao DEMO 100% bot foanana, matchmaking_queue bot fafana, bot rehetra atao offline; ny edge function `virtual-players` mijanona avy hatrany (`bots_enabled()` check isaky ny tick). Lalao efa mandeha misy olona tena izy tsy kitihina (domino-autoplay mbola mamita azy).
- `virtual_online_count()` mamerina 0 raha désactivé.
- Activé indray: miverina miasa hoazy ny orchestrateur amin'ny tick manaraka.
