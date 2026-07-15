# Plan — Fanamboarana Ludo sy fanatsarana ny app

## 1) Ludo — logic correctif

**Olana:** rehefa mikitika pion A, misy pion B miara-mihetsika ; isa dés tsy mifanaraka amin'ny fandehanana ; tour tsy voarindra ; autoplay mandeha alohan'ny 10s.

**Vahaolana:**
- `src/pages/Ludo.tsx` : ny `movePawn` alefa avy amin'ny click **iray ihany** amin'ny pion voafidy — atao *guard* (`isMoving` ref) mba tsy hiantsoana `ludo_move_pawn` in-2. Esorina ny `useEffect` rehetra izay mety mandefa move automatique raha `dice_rolled=true` (io no mahatonga pion hafa mihetsika).
- RPC `ludo_move_pawn` (DB) : hamafisina hoe pion iray fotsiny no mihetsika isaky ny call, ary `pos = pos + dice` marina (asiako `RAISE EXCEPTION` raha `_pawn_idx` tsy azo alefa).
- Client-side autoplay/bot local **esorina tanteraka** — edge function `ludo-autoplay` ihany no manao move raha `turn_started_at > 10s` (efa amin'io izy ; hamafisiko ny cutoff hoe **strict `>= 10000ms`** ary hesoriko ny `dice_rolled=true` shortcut izay manery mouvement alohan'ny 10s).
- Timer 10s hita amin'ny écran, vibration 3s sisa ho an'ilay tour ihany.

## 2) Table du jeu 3D ho an'ny lalao rehetra (Domino, Ludo, Pétanque)

Component tokana `Table3D` (perspective CSS + 4 tongony bois + lambam-panjaitra) — apetraka ao amin'ny 3 pejy `Game.tsx`, `Ludo.tsx`, `PetanqueGame.tsx` sy ny live `SpectateDomino/Petanque/Ludo` mba **hitovy tanteraka** ny table sy ny live.

## 3) Solde mazava amin'ny pejy rehetra

Header global vaovao `WalletBadge` (mipoitra eo ambony havanana) miseho amin'ny `Home`, `Lobby`, `Wallet`, `Game`, `Ludo`, `Petanque`, `Tournament`… Realtime `wallets` subscribe. Ny adversaire tsy mahita afa-tsy ny an'ny tenany ihany (mitovy amin'ny efa nataoko tao amin'ny Domino).

## 4) Ludo graphique pro (mitovy amin'ny Unity)

`src/pages/Ludo.tsx` overhaul:
- SVG board 15×15 tena izy, misy gradient bois + ombre.
- Home yards efatra (rouge/vert/jaune/bleu) misy 4 cercles pion.
- Pion 3D (SVG + gradient + ombre porté) miaraka amin'ny bounce animation.
- Dé 3D efa misy — asio *shadow* sy *rolling motion*.
- Case ★ safe zone misy étoile dorée.
- Path miloko manaraka ny couleur amin'ny 6 case farany alohan'ny home.

## 5) Admin — tel = call/SMS avy hatrany

Ao amin'ny `Admin.tsx` (ary `OnlineUsersDialog`), ny numéro atao **bokotra** miditra amin'ny native menu :
- Click → mipoitra choice sheet : 📞 **Appeler** (`tel:`), 💬 **SMS** (`sms:`), 📱 **WhatsApp** (`https://wa.me/`).
- Long-press → copy.

## Fetra
- Volan'olona **tsy voakitika** (memory `money-immutable`) — tsy hovaina ny wallet logic.
- Domino **tsy kitihina** (memory `domino-locked`) fa ampiako fotsiny ny `Table3D` sy `WalletBadge`.
- 10s Ludo strict server-side.

Manaiky ve ianao hanombohako ity plan ity?
