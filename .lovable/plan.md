## Fanovana lehibe atao amin'ny lalao Domino

### 1. Fanovana ny logique ao amin'ny lalao
- **Domy 7 isan'olona**: efa misy.
- **Esorina ny boneyard / fakana vato**: tsy misy intsony ny "Maka piesy". Raha tsy manana vato mety ny mpilalao manana ny tour, **mandeha ho azy any amin'ny adversaire** ny tour (auto-pass).
- **Bloqué (samy tsy afaka mandefa)**: izay manana **isam-bato kely indrindra** no mahazo ny point amin'io tour io.

### 2. Karazana lalao 3 (Mode)
Hofidiana ao amin'ny **Lobby** alohan'ny manomboka:
- **Maty 120**: izay mahatratra 120 point aloha mandresy (mandeha amin'ny tour maro).
- **Maty 80**: izay mahatratra 80 point aloha mandresy.
- **Domy maty atanana**: tour iray fotsiny — izay kely vato indrindra (na nahavita avy hatrany) no mandresy.

### 3. Tranga "instant win" anatin'ny tour iray
- **Total mitovy amin'ny datin'ny andro**: ohatra androany faha-10 ka misy mahatratra exactly 10 point → mandresy avy hatrany ny lalao manontolo (tsy miandry 80/120).
- **Iala amin'ny double-6**: raha ny double-6 no vato farany napetraka mba hahalany ny tanana → mandresy avy hatrany ny lalao manontolo.

### 4. Fanovana database
Ampiana column vaovao amin'ny `games`:
- `game_mode` (text): `"d120"` | `"d80"` | `"hand"` 
- `score_p1`, `score_p2` (numeric, default 0): vato voaangona an'ny tsirairay.
- `round_number` (integer, default 1).

### 5. Fanovana Lobby
Manampy bokotra fisafidianana **Mode** (Maty 120 / Maty 80 / Domy maty atanana) rehefa mamorona lalao na challenge.

### 6. Fanovana UI ao amin'ny Game
- Esorina ny bokotra "Maka piesy" sy "Pass" (auto izao).
- Asehoy ny **Score** (P1 vs P2) sy ny **mode** sy ny **round number** ao amin'ny header.
- Rehefa vita ny tour iray (tsy maty atanana): asehoy banniere "Tour vita — point: X", dia atomboka tour vaovao automatique (zara vato vaovao, mitazona ny score).
- Rehefa tratra ny target (80/120) na instant-win: settle ny lalao, omena ny mpandresy ny pot.

### Fitanisana ny fiantraikany
Ny fototry ny moteur `dominoEngine.ts` tsy miova firy. Ny fanomanana tour vaovao (re-deal) hatao client-side amin'ny mpilalao iray (ilay nandresy ny tour teo aloha) mba tsy hisy race.

Aorian'ny fankatoavanao, dia hanao migration aho ary hanitsy ny `Lobby.tsx` sy `Game.tsx`.