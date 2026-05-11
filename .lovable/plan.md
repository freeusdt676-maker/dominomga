# Plan finition Domino MGA

Ireto manaraka ireto ny asa rehetra hatao mba hamarana ny app. Atao tsirairay araka ny lisitra.

## 1. Home (`src/pages/Home.tsx`)
- Soloy ny soratra "Mitady adversaire (cote x2)" ho **"Domino · 2P 3P · Mise sy Gain mitovy"**.
- Hovaina ho **bokotra mitovy endrika amin'ny LUDO MASTER** (gradient/border mitovy), asio **logo kely domino** (ikon-domino kely eo akaikin'ny anarana). Ny anatin'ny lalao tsy miova.
- Bokotra LUDO MASTER: rehefa kitihina dia tsy mandeha amin'ny `/ludo-lobby` fa mampiseho toast/dialog hoe **"Mbola eo tsy mandeha ny ludo tompoko 🙏"**.

## 2. Admin (`src/pages/Admin.tsx`)
- Eo amin'ny lohany (akaikin'ny "Wallet Admin") asio **boaty kely "Solde mpilalao"**: rehefa kitihina dia mipoitra ny **fitambaran'ny solde rehetran'ny mpilalao en Ar** (somme `wallets.balance` afa-tsy ny admin).
- Onglet **Transactions** sy **Historique**: amin'ny isaky ny kara, asio **bokotra "Suprimer"** kely (icône poubelle). Rehefa kitihina, mipoitra dialog "OK / Annuler" hanamafy alohan'ny famafana.
- Eo akaikin'ny solde mpilalao tsirairay (onglet Mpilalao), asio **bokotra "Réinitialiser solde"**: averina 0 Ar ny solde, fa **mila PIN 2583** (tsy OK fotsiny) alohan'ny hanao izany.

## 3. Chat Admin (`src/pages/AdminChat.tsx`)
- Asio **bokotra "Suprimer"** isaky ny hafatra (mila confirmation).
- **Sonnerie/notification** rehefa misy hafatra tonga (audio kely + vibration raha azo atao).
- **Loko**: hafatra tonga = **maitso (vert)**, hafatra mivoaka = **mavo (gold/jaune)** araka ny efa misy.
- **Position bulles**: hafatra tonga = **akavanana**, hafatra mivoaka = **akavia** (mifanohitra amin'izao misy izao).

## 4. Wallet Dépôt & Retrait (`src/pages/Wallet.tsx`)
- **Dépôt**: asio panneau famaritana mazava amin'ny endrika "chat/info":
  - Montant ohatra: 100 000 Ar
  - Numéro téléphone admin: **0345023006** (asio bokotra **Copier**)
  - Anarana certifié MVOLA: **Jean Rolland** (asio bokotra **Copier**)
  - Référence MVOLA = référence ny vola nalefa
- **Retrait**: asio toy izany koa:
  - Numéro téléphone handefasana ny vola
  - Anarana certifié MVOLA handefasana ny vola
  - Code PIN
- Amboary ny **bokotra "Mangataka retrait"** mba hiasa tsara (jereo ny RLS amin'ny `transactions` sy ny olana mety mahatonga azy tsy mandeha — mety nahodina ny insert na ny check PIN).

## 5. Chat mpilalao samy mpilalao (vaovao)
- Asio **bokotra "Discussions"** ao amin'ny Home.
- Mpilalao mahazo mifampiresaka. **Admin ihany no mahazo mamafa hafatra** an'ny olon-kafa; ny mpilalao mahazo mamafa ny hafatra-ny manokana ihany.

## 6. Fafa compte rehetra (mise à jour)
- Fafao **ny compte rehetra** ato amin'ny app (auth.users + profiles + wallets + transactions...) **afa-tsy ny compte Administratif** miankina amin'ny numéro **0345023006**.
- Ny mpilalao voafafa dia afaka manao inscription vaovao.

## Technical notes
- **#6** mitaky migration SQL (DELETE cascade fa tsy ny admin user_id). Hatao am-pitandremana.
- **#3** sonnerie: hampiasa audio kely (efa misy `src/lib/sfx.ts`).
- **#4** PIN check anatin'ny `wallet-pin` edge function efa misy — hojerena raha mandeha tsara.
- **#5** mitaky table `chat_messages` efa misy + RLS vaovao hahafahan'ny mpilalao mifampiresaka (private rooms na public).

## Fanontaniana iray alohan'ny hanombohana
Ny **chat mpilalao samy mpilalao** ve atao **public (room iray ho an'ny rehetra)** sa **private (DM mpilalao iray amin'ny iray)**? Manova ny fanaovana azy izany.
