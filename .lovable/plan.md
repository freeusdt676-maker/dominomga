## Tanjona

1. Manampy bokotra **LIVE** mena (logo video pulse) eo amin'ny pejy fidirana (Auth) sy ny pejy Home — eo akaikin'ny soratra **ADMINISTRATIF**.
2. Mametraka **mode spectateur** ho an'ny lalao 3 (Domino, Ludo, Pétanque) — afaka mijery fa tsy afaka mikitika.
3. Manatsara ny hafatra rehefa lavina ny micro APEL (PERMISSION_DENIED).

## Flow vaovao

```
[Bokotra LIVE mena]
   ↓
Dialog: "Lalao mandeha izao"
   - DOMINO  (n active)
   - LUDO    (n active)
   - PÉTANQUE (n active)
   ↓
Lisitra ny lalao mandeha amin'io karazana io
  - Tick #1A2B · Mise 500 Ar · 3 mpilalao · 1m
  - Tick #4C5D · ...
  - (Raha tsy misy) → "Tsy misy lalao mandeha"
   ↓
Pejy spectateur (route vaovao /spectate/:type/:id)
  - Mampiseho ny latabatra, score, mpilalao, isa pion/vato
  - **Tsy hita ny atànana** (Domino: vato avadika; Ludo: pion hita amin'ny board ihany; Pétanque: hita daholo)
  - Tsy misy bokotra hilalaovana
  - Realtime miverina hatrany (postgres_changes)
```

## Fanavaozana hatao

### 1. Bokotra LIVE — `src/components/LiveSpectatorButton.tsx` (vaovao)
- FAB kely mena, akaiky ny bokotra Admin (Auth: bottom-right > admin; Home: bottom-left)
- Animation pulse mena (red badge LIVE) + icon `Radio`
- Mampiseho count ny lalao mandeha (badge)
- Kitihina → manokatra Dialog `SpectatorHub`

### 2. `src/components/SpectatorHub.tsx` (vaovao)
- Mizara karazana telo (Tabs na Card)
- Mametraka query realtime:
  - Domino: `games` WHERE status = 'in_progress'
  - Ludo: `ludo_games` WHERE phase != 'ended'
  - Pétanque: `petanque_games` WHERE phase != 'ended'
- Manomboka tick # (8 char farany ny game id)

### 3. Pejy Spectateur — routes vaovao ao `src/App.tsx`
- `/spectate/domino/:id` → `SpectateDomino.tsx`
- `/spectate/ludo/:id` → `SpectateLudo.tsx`
- `/spectate/petanque/:id` → `SpectatePetanque.tsx`

Ireo pejy ireo mampiasa indray ny rendering board ny lalao tsirairay (`DominoTile`, `LudoBoard`, board petanque) amin'ny mode `readOnly`:
- **Domino**: alefa fotsiny ny `board` (vato napetraka); ny atànana mpilalao avadika rehetra (back side) na masombato amperinasa fotsiny no hita
- **Ludo**: board sy pion hita rehetra (efa hita amin'ny lalao tena izy ihany koa) — fa tsy misy click handler
- **Pétanque**: board sy boules hita — tsy misy aim/throw

Tsy misy `LudoVoiceChat`, tsy misy chat input. Header: "Mode spectateurs · Tick #XXXX".

### 4. Apel fix — `src/components/LudoVoiceChat.tsx` (sy `Game.tsx` raha mitovy)
- Raha `NotAllowedError` na `PERMISSION_DENIED`:
  - Toast malalaka: "Tsy nahazo alalana hampiasa micro. Sokafy ao amin'ny Paramètres navigateur > Microphone."
- Tsy misy fanovana lojika afa-tsy hafatra (tsy azo intervena ny OS permission)

## Tsy hokitihina (LOCKED)

- Domino engine, RPC, timers — tsy ovaina
- Ludo timer (10s), Ludo engine — tsy ovaina
- Wallet, RPC vola — tsy ovaina
- Ny lalao tena izy (Game.tsx, LudoGame.tsx, PetanqueGame.tsx) — tsy ovaina, fa indraindray hisokatra ho `?spectator=1` (tsia — pejy misaraka kokoa fa mahasalama)

## Vokany

- Ny mpijery rehetra (na tsy mihditra) afaka mijery lalao mandeha
- Mode spectateurs: tsy afaka mikitika, tsy hita ny atànana mpilalao
- Hafatra mazava raha lavin'ny finday ny micro

Tianao ho atomboko ity asa ity?
