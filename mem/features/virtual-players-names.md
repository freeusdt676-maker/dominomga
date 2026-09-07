---
name: Anaran'ny bot vurtiel (rotation)
description: Bot display names are single first names only and rotate every 1-3 days, sometimes reverting to an old name after 2+ days
type: feature
---
- Anarana TOKANA ihany (ohatra "Fitahiana", "Rolland") — tsy misy tovana toy ny "Mg", "Rj", "R"... mba tsy ho fantatra hoe kaonty virtuel.
- `virtual_players.name_history` (jsonb: [{name, at}], max 8) + `next_rename_at`.
- Edge function `virtual-players` → `rotateNames()`: isaky ny tick, ny bot izay tonga ny `next_rename_at` sady tsy manao lalao dia manova anarana (max 3 isaky ny tick). 40% chance miverina amin'ny anarana taloha raha efa ≥ 2 andro; raha tsy izany anarana vaovao tsy mbola ampiasaina. Prochaine rotation: +24–72h.
- Ny `profiles.mvola_name` avadika miaraka amin'izay mba hitovy any amin'ny lobby/chat.
