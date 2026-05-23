# Plan — Améliorations globales app

## 1. Timeout 2 minutes hoan'ny lobby (Domino, Ludo, Pétanque)

- Rehefa mametraka "demande" (waiting) ny mpilalao, raha tsy mahita mpifanandrina ao anatin'ny **2 minitra**, dia:
  - Foanana automatique ilay waiting (status → cancelled, vola averina avy hatrany)
  - Toast: "Tsy nahita mpifanandrina — afaka mametraka demande indray ianao"
- Mécanisme:
  - Migration SQL: fonction `cancel_stale_waiting_games()` mamafa ny waiting > 2min (Domino `games`, Ludo `ludo_games`, Pétanque `petanque_games`) + mamerina vola
  - Antsoina avy aty amin'ny client (setInterval 15s ao amin'ny Lobby pages) + indray mandeha rehefa miditra lobby
  - UI: countdown kely eo amin'ny "myWaiting" card miseho mandritra ny 2 min

## 2. Vocal Appel hoan'ny rehetra (4P koa)

- Amin'izao `LudoVoiceChat` dia efa miasa amin'ny Ludo/Petanque/Domino. Hamarino sy ataovy azo antoka fa:
  - Asehoy ny bokotra "📞 Appel" hoan'ny **seat rehetra** (4P Ludo koa)
  - Tsy misy fameperana "host only"
- Hijery `LudoVoiceChat.tsx` aho hanitsy raha misy fepetra

## 3. Bokotra "🔄 Réinitialiser" eo akaiky ny profil

- Toerana: eo amin'ny **Home/Index** (header), akaiky ny avatar/profil
- Dialog confirmation: "Hofafaina daholo ny message, historique du jeu, historique transaction. Ny vola tsy voakitika"
- Action (RPC `user_reset_data`):
  - DELETE `chat_messages` (sender = me OR recipient = me)
  - DELETE `lobby_messages` (sender = me)
  - DELETE `games` finished/abandoned misy ahy
  - DELETE `ludo_games`, `petanque_games` finished misy ahy
  - DELETE `transactions` ahy **AFA-TSY** ny mahakasika balance (jereo: tsy mikitika `wallets`)
  - Ny solde ao `wallets` **TSY KITIHANA** mihitsy

## 4. Esory ny lobby ao Pétanque

- Tsy mazava loatra: ny "lobby" ve ilay liste "Mpilalao vonona" ao anaty `PetanqueLobby.tsx`, sa ilay route `/petanque` manontolo?
- Heveriko fa: esory ilay **bloc "Mpilalao vonona"** (liste hafa olona) — avelao ny mise + my-waiting fotsiny, ka miandry matchmaking automatique amin'ny stake mitovy.
- Raha tsy izay no tianao, lazao.

## 5. Page voalohany (Home/Index) vaovao

- Soloy ireo "2 domy" amin'ny **logos 3 game**: 🁫 Domino, 🎲 Ludo, 🪨 Pétanque (miaraka amin'ny anarana sy chip "Jouer")
- Asio koa eo ambany: **section "Règles du jeu"** misy ny lalàna an'ny lalao **10** (mamintina ny tena ilaina hoan'ny Domino d120/d150, Ludo, Pétanque) — accordéon mba hadio
- Hi-design malagasy/élégant amin'ny token efa misy

---

## Fanontaniana 2 mialoha ny hanombohako

1. **Pétanque lobby**: ny "esory lobby" ilainao = esory ilay liste "Mpilalao vonona" (#3 etsy ambony) fa avelao ny bokotra mametraka mise? Sa esory ny route `/petanque` mihitsy ka avy ao Home ihany no manindry "Pétanque" + mametraka mise + miandry?

2. **Logos**: tianao ve hamoronako image (illustration) vaovao hoan'ny 3 lalao (Domino, Ludo, Pétanque) sa avela ho icons + emoji fotsiny?

Rehefa mamaly ireo 2 ireo ianao, dia mandeha mivantana ny asa.
