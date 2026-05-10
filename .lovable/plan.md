# Tetik'asa

## 1) Domino — chronomètre 20s tsy mikatso intsony

Ao amin'ny `src/pages/Game.tsx`:

- Rehefa tapitra ny 20s ny mpilalao ankehitriny:
  - Raha **manana** piesy mety apetraka → ny système no mametraka **automatique** ny piesy mety (mifidy ilay manan-pip ambony indrindra).
  - Raha **tsy manana** → mametraka **TSIMANANA** ho azy (pass), avadika amin'ny manaraka ny tour.
- Esorina ny banner "TSIMANANA IZAHO" mibahana ny écran. Atao toast kely fotsiny.
- Ny `autoPassRef` izay efa misy dia ataovy: handle "auto-play OR auto-pass" miaraka.
- Ataovy mahomby na mpilalao iza na iza no diso (tsy ho an'ny tena ihany).

## 2) Domino — Split screen (mpilalao roa adversaire ambony)

Amin'ny mode 3P sy 4P:

- Ny faritra ambony (adversaires' hands) dia zaraina **roa mitovy refy** — ilany havia: profil + dos piesy mpilalao A; ilany havanana: profil + dos piesy mpilalao B.
- Profil = `mvola_name` + avatar circulaire (initiale) + isan'ny piesy.
- Apetraka mihodina (rotated -90°/90°) ny dos piesy mba miendrika lalao Domino tena izy.

## 3) Inscription vaovao — MVola style

Ao amin'ny `src/pages/Auth.tsx` — onglet "Inscription" averina amboarina:

| Saha | Placeholder | Validation |
|------|------------|------------|
| NUMÉRO TÉLÉPHONE | `038/034 XXXXXXX` | regex 10 chiffres, manomboka 034/038 |
| ANARANA CERTIFIÉ MVOLA | `Jean Claude` | tsy maintsy ≥ 3 litera |
| DATY NAHATERAHANA | `YYYY/MM/JJ` | ≥ 18 taona |
| SEXE | dropdown LAHY/VAVY/HAFA | required |
| MOT DE PASSE | `DE4erStv.` | ≥ 6 + isan-karazany |
| CONFIRMER MOT DE PASSE | `DE4erStv.` | mitovy |
| PIN | `1234` | 4 chiffres |
| CONFIRMER PIN | `1234` | mitovy |
| SELFIE | bokotra "MAKA SARY" (camera) | sary tsy maintsy alaina |

Bokotra farany: **HISORATRA ANARANA** (loko jaune MVola).

Aorian'ny submit: `account_status = 'pending'` (efa misy amin'ny base) → tsy afaka miditra raha tsy ankatoavin'ny Admin. Hampiana hafatra mazava: "Miandry validation amin'ny ADM".

## 4) ADM — Mitazona ireo daty rehetra

Ao amin'ny `src/pages/Admin.tsx`, raha mbola tsy mampiseho ny donnée fenoin'ny user (selfie, daty nahaterahana, sexe, pin/password plain), ampidirina ao amin'ny carte KYC ireo. Tsy mila migration vaovao satria efa voatahiry ao amin'ny `profiles` / metadata izy ireo.

## 5) MVola theme

Ampiana `mvola-theme` token vaovao ao amin'ny `src/index.css`:

- `--mvola-yellow: 48 100% 50%` (jaune MVola)
- `--mvola-orange: 25 95% 53%`
- Class `.btn-mvola`, `.mvola-gradient`, `.mvola-ring`.

Hampiasaina amin'ny:
- Bokotra "HISORATRA ANARANA"
- Header banner an'ny inscription
- Carte KYC ao amin'ny Admin

Tsy hovaina ny Domino theme (vert/gold) sy Ludo theme (purple/gold).

## Fanontaniana 1 — Selfie storage

Ny selfie hampidirina ao amin'ny bucket `selfies` efa misy via edge function `signup-kyc` (efa misy). **Ampiasaina io edge function io ve sa hosoloana ny `supabase.auth.signUp` mahazatra?**

Soso-kevitra: ampiasao `signup-kyc` satria efa hahafahana mametraka selfie + metadata sady auto-confirm — aoka tsy hisy email verification.

## Fanontaniana 2 — Domino split screen amin'ny 2P

Amin'ny lalao 2P (mpilalao tokana adversaire), ny "split screen" tsy mihatra. Ny écran ambony dia ho an'ilay adversaire tokana ihany — **OK ve?**

---

Raha mitombina ny valiny, atao avy hatrany ny implémentation amin'ny lalana iray.
