# Fanitsiana be dia be — Ludo + Domino + Lobby + Voice

## 1. Ludo — fihetsika ny pion
- **Tsimaitsy 5 case ihany raha 5 ny mokolahy**: vahao ny bug izay mety mandeha mihoatra. Ataovy step-by-step ny fivoarana (case iray isaky 120ms, tsy fly).
- Esorina ny "manidina" — soloina translate horizontal/vertical isaky ny case (CSS animation tile-by-tile).
- Aorian'ny entry an-trano (pos = 57), dia mahazo turn fanampiny indray (efa misy logika; hamarino).
- 6 indroa = afaka manohy. **6 fanintelony**: tsy mihetsika mihitsy, lasa amin'ny manaraka avy hatrany (efa ao amin'ny `nextSeat` fa hamarino fa tsy roll mihitsy).

## 2. Ludo — design
- Fond: **mainty** (gradient mainty/violet maizina) tsy manga itsony.
- Table de jeu: **plein écran**, esorina ny marge sy padding manodidina.
- Domino koa: plein écran ny table.

## 3. Lobby — Confirmer le demande
- **Debounce / lock**: rehefa tsindriana indray mandeha → disabled avy hatrany mandra-pahavitan'ny request (loading state).
- **1 demande/olona ihany**: alohan'ny famoronana, jereo raha efa misy `waiting` Room ataon'ilay user → block.
- **Délai 2 min**: raha tsy feno ao anatin'ny 2 min, auto-cancel + miverina ny mise. Cron-like check eo amin'ny client + DB trigger raha azo.
- **Annulation**: ny tompon-keva ihany no afaka manafoana, ary raha mbola "waiting" fotsiny. Raha "in_progress" → tsy azo.
- **ADMINISTRATIF irery** afaka manafoana lalao efa nanomboka.

## 4. Wallet — Dépôt/Retrait
- 1 demande mandeha ihany isaky ny user. Raha misy `pending` efa eo → block ny vaovao.

## 5. Domino — replay porofo
- 5 segondra ny banner "antony nahafaty" amin'ny écran (efa nasiana, fa hatongavina 5s sy hatao mazava kokoa visuel).

## 6. Voice chat — TENA OLANA LEHIBE
- Olana amin'ny WebRTC mesh aty Supabase broadcast: re-implement amin'ny **ElevenLabs Conversational AI** sa **WebRTC mesh tsara kokoa**?
- Soso-kevitra: tazomina ny WebRTC mesh fa amboarina:
  - Joiner subscribe ALOHA dia hello AVEO (efa ao fa hamarino race).
  - Auto-retry: raha tsy mahazo answer ao anatin'ny 5s → re-dial.
  - Asio "Voice ON" indicator manodidina ny avatar isaky ny mpilalao.
  - Manaova `iceServers` TURN ihany koa (raha hita fa NAT no manakana). **Ilana TURN server** (Twilio na Metered.ca) → mety mila API key.
  - Ampiasaina ihany koa amin'ny **Domino**.

## 7. Admin
- "Annuler partie" (efa misy) — tazomina.
- Bulk cancel waiting > 2min — script.

## Fanontaniana mialoha:
**Voice chat**: tianao ve hampiasaiko **ElevenLabs Realtime** (amerina rehetra — voice clarity tsara, fa mitaky API key + crédit) sa hampiasa WebRTC mesh maimaim-poana (mety tsy mandeha amin'ny network sasany raha tsy misy TURN)? Aleo voalaza hoe iza ny safidinao mba tsy hanao ny iray ka tsy mety izy.
