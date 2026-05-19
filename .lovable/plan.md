## Tanjona
Hanampy lalao fahatelo (**Pétanque 3D**) miaraka amin'ny lobby manokana sy bokotra manokana eo amin'ny Home — filaharana vaovao: **Domino → Ludo Master → Pétanque**.

## 1. Home — filaharana sy bokotra vaovao
- Asiana karazana fahatelo "Pétanque" ao amin'ny `Index.tsx`/`Home.tsx`, miaraka amin'ny sary banner Malagasy (baobab + flag), bokotra "Lobby Pétanque".
- Filaharana: Domino (ambony) → Ludo Master → Pétanque (ambany).

## 2. Lobby Pétanque (route `/petanque`)
- Mitovy interface amin'ny Lobby Domino sy Ludo, fa misy filtra ho an'ny lalao Pétanque ihany.
- Mise: **1000, 2000, 3000, 5000, 10000 Ar** (chips).
- Vary 2P ihany, commission 10%, ticket auto, debounce 1 demande/olona (mitovy règle amin'ny Domino).
- Lobby chat mampiasa ny `lobby_messages` efa misy fa misy fanovana kely (tsy mila table vaovao).

## 3. Backend — table sy RPC vaovao
Table `petanque_games` (mitovy structure amin'ny `ludo_games`) miaraka amin'ny RLS sy RPC:
- `petanque_create_waiting(stake)`
- `petanque_join_and_start(game_id, user)`
- `petanque_cancel_waiting(game_id)`
- `petanque_update_state(game_id, balls, current_turn, scores...)`
- `petanque_settle(game_id, winner)` — pot = (stake−10%)×2
- `petanque_start_deduct` — mitovy logika amin'ny Ludo
- Admin cancel + cancel_all + cancel_by_ticket — havaozina mba ahitana koa ny Pétanque.

Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE public.petanque_games;`

## 4. Lalao 3D (route `/petanque/:id`)
Stack: **@react-three/fiber@^8.18 + @react-three/drei@^9.122 + three@^0.160**. **Tsy mampiasa physics engine lehibe** — mampiasa simulation tsotra (vélocité + friction + collision sphère/sphère sy sphère/mur) ataontsika manokana mba ho malama amin'ny finday rehetra (60fps target).

### Décor Malagasy (low-poly mba ho malama)
- **Baobab** havia/havanana — geometry procédurale (cylinder + sphere clusters), tsy GLB.
- **Court** (terrain) — plane texturée vato/fasika (CanvasTexture procédurale), bordure hazo.
- **Aloalo** 4 — colonne miaraka amin'ny sary ambony (BoxGeometry stacked).
- **Satroka penjy + zebu** — sprite/plane texturée tsotra eo amin'ny sisin'ny terrain.
- **Foule** — InstancedMesh 10–15 olona stylisé (capsule + sphère), animation idle (sinus bob).
- **Sainam-pirenena Madagascar** — plane texturée miaraka amin'ny "vertex shader wave" tsotra.
- **Lanitra** — gradient sky (Sky component + Environment preset "park").

### Gameplay (duel maty 12)
- 6 baolina isan-mpilalao (3+3) loko mena/manga, **cochonnet** (jack) kely fotsy.
- Tour-by-tour: mpilalao mametraka aim arrow (maitsy mavana mahitsy avy any ambany), mibata force amin'ny slider, mandefa.
- Physics manokana: integrator step 1/60, restitution 0.4, friction 0.85.
- Score isaky ny round: mpilalao izay manana baolina akaiky cochonnet kokoa no mahazo isa = isan'ny baolina akaiky kokoa noho ny baolina akaiky indrindra an'ny mpifanandrina. Maty 12.
- Realtime sync amin'ny `petanque_games.state` (positions + scores + turn).

### UI Overlay (atao mitovy amin'ny sary 2)
- Glass-orb avatars ambony havia/havanana miaraka amin'ny score + saina Madagascar.
- "Boules indicators" havia/havanana (ronds fotsy/maitsy/mena).
- Aim arrow maitso mavana mahitsy ambany afovoany + slider force.
- Bokotra Pause maitsy ambany havanana miaraka amin'ny dekor "seashell" (SVG).

### Audio
- Ambient nature loop + crowd murmure tsotra (Web Audio API oscillator-based ambiance) + sound effect rehefa mifanitsaka ny baolina.

## 5. Optimisation finday
- `gl={{ antialias: true, powerPreference: "high-performance" }}`, `dpr={[1, 1.5]}` mba tsy ho pixelisé fa malama.
- InstancedMesh ho an'ny vato kely, foule, satroka.
- Texture procédurale CanvasTexture (tsy mila download).
- Plein écran portrait force amin'ny CSS + `useEffect` `screen.orientation.lock("portrait")` raha azo.

## 6. Admin
Havaozina `admin_cancel_all_active_games` + `admin_cancel_game_by_ticket` mba ahitana ny `petanque_games`.

## Dingana asa (filaharana)
1. Migration: table `petanque_games` + RPC + RLS + realtime.
2. Update Home: bokotra + filaharana vaovao.
3. `PetanqueLobby.tsx` (copie ny lobby Ludo, ataovy "petanque").
4. Install `three @react-three/fiber @react-three/drei` (exact versions).
5. `PetanqueGame.tsx` + composants `Court`, `Boule`, `Baobab`, `Crowd`, `Flag`, `AimArrow`, `HUD`.
6. Physics engine tsotra `petanqueEngine.ts`.
7. Realtime sync + endgame settle.
8. Admin updates.
9. QA: jereo amin'ny mobile viewport 508×951.

## Fanontaniana farany
Ekena ve io plan io mba hanombohako ny code? Ny version voalohany dia hisy:
- Décor 3D low-poly (baobab procédural, foule InstancedMesh, flag wave) — **mety tsy mitovy 100%** amin'ny sary 3D AAA fa malama amin'ny finday ary Malagasy-themed.
- Multijoueurs 2P feno miaraka amin'ny mise sy maty 12.
