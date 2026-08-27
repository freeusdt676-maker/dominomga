---
name: Fepetra inscription
description: Signup validation rules (name, phone prefixes, age, password, PIN), auto-approval, no selfies/avatars
type: feature
---
- Inscription auto-approuvée: tsy mila validation admin (profiles.account_status default = 'active', handle_new_user sets 'active' + approved_at).
- Nom profil: litera ihany (tsy chiffre, symbole, emoji), 2–10 caractères. Tsy voatery anarana MVola.
- Numéro: 10 chiffres, prefixes ekena ihany — Telma 034/038, Orange 032/037, Airtel 033/035.
- Daty nahaterahana: 18 taona+ (taona ≤ 2008).
- Mot de passe: ≥ 6, mifangaro litera + chiffre. Tsy misy champ "confirmer".
- PIN: 4 chiffres. Tsy misy champ "confirmer".
- Tsy misy selfie/photo intsony (inscription na profile edit). Avatar = initiales (Jean Rolland → JR) via src/components/InitialsAvatar.tsx. Ny sary rehetra taloha efa nofafana (bucket selfies + selfie_url/avatar_url).
- Erreur inscription: champ mena mihetsiketsika (.field-error) + hafatra; raha mety dia connexion automatique avy hatrany.
- Compte taloha (anarana, mot de passe, PIN) tsy kitihina.
