---
name: Règle 3P bots vs joueur réel (Domino)
description: In 3P Domino, a room with bots holds exactly 1 real player + 2 independent bots
type: feature
---
- 3P: raha misy bot ao amin'ny salle, dia **mpilalao tena izy IRAY ihany** + **bot ROA**. Ny bot roa dia samy mitondra ny vatony (fair info, tsy mifampizara vato, tsy mifanampy).
- 2P: olona vs olona **na** bot vs olona.
- Ampiharina amin'ny toerana roa:
  - `virtual-players` edge function: bot tsy miditra amin'ny salle 3P efa misy olona tena izy roa; ary bot faharoa mameno haingana (2s) rehefa 1 olona + 1 bot.
  - `join_3p_start` (DB guard): olona tena izy tsy afaka maka ny toerana faha-3 raha efa misy 1 olona + 1 bot → `already_taken`.
- Vola: ny olona tena izy ihany no miatoka; mise esorina avy hatrany amin'ny compte, very raha resy. Ny mise an'ny bot dia ny rafitra no miatoka azy.
