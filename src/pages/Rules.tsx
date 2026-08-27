import { Button } from "@/components/ui/button";
import { ArrowLeft, BookOpen, Gamepad2, ArrowDownCircle, ArrowUpCircle, Smartphone, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Rules() {
  const nav = useNavigate();
  return (
    <div className="min-h-screen felt-bg pb-20">
      <header className="p-4 flex items-center gap-3 border-b border-primary/20 sticky top-0 bg-background/80 backdrop-blur z-10">
        <Button variant="ghost" size="icon" onClick={() => nav("/")}><ArrowLeft /></Button>
        <h1 className="font-display text-xl font-bold gold-text">Règle sy Tutorial</h1>
      </header>

      <div className="p-4 max-w-lg mx-auto">
        <Tabs defaultValue="discipline">
          <TabsList className="grid grid-cols-5 w-full mb-3 h-auto">
            <TabsTrigger value="discipline" className="text-[10px] py-2"><Shield className="w-3 h-3 mr-1"/>Fitsipika</TabsTrigger>
            <TabsTrigger value="rules" className="text-[10px] py-2"><BookOpen className="w-3 h-3 mr-1"/>Règle</TabsTrigger>
            <TabsTrigger value="play" className="text-[10px] py-2"><Gamepad2 className="w-3 h-3 mr-1"/>Lalao</TabsTrigger>
            <TabsTrigger value="depot" className="text-[10px] py-2"><ArrowDownCircle className="w-3 h-3 mr-1"/>Dépôt</TabsTrigger>
            <TabsTrigger value="retrait" className="text-[10px] py-2"><ArrowUpCircle className="w-3 h-3 mr-1"/>Retrait</TabsTrigger>
          </TabsList>

          <TabsContent value="discipline">
            <div className="card-felt rounded-2xl p-5 text-sm space-y-3 leading-relaxed">
              <h2 className="font-display text-lg gold-text flex items-center gap-2"><Shield className="w-5 h-5"/> Fitsipika sy Discipline</h2>
              <p className="text-muted-foreground">Mba ho matotra sy hahatokisana ny app, <b>tsy maintsy hajaina</b> ireto fitsipika ireto:</p>
              <ol className="list-decimal pl-5 space-y-2">
                <li><b>Numéro iray = compte iray</b>: tsy azo atao ny manao compte maromaro amina numéro iray. Voasakana ny système raha misy doublon.</li>
                <li><b>Inscription automatique</b>: tsy mila validation admin intsony. Fenoy marina: <b>Nom profil</b> (litera ihany, ≤10), <b>Numéro</b> (Telma 034/038 · Orange 032/037 · Airtel 033/035, 10 chiffres), <b>Date naissance 18 taona miakatra</b>, <b>Mot de passe 6+ misy litera sy chiffre</b>, <b>PIN 4 chiffres</b>.</li>
                <li><b>Tsy misy selfie intsony</b>: ny profil dia <b>avatar initiales</b> (oh. Jean Rolland → JR).</li>
                <li><b>Anarana sy MVOLA marina</b>: ny numéro sy anarana ampiasaina amin'ny dépôt/retrait dia tsy maintsy mifanaraka amin'ny MVOLA anao.</li>
                <li><b>PIN 4 chiffres</b>: ilaina amin'ny retrait. Aza zaraina amin'olona ny PIN sy mot de passe.</li>
                <li><b>Fitondran-tena mendrika</b>: tsy azo atao ny manompa na maneso ao amin'ny chat na lalao.</li>
                <li><b>Fahamatorana</b>: aza manakorontana ny lalao (manala data, mamela mandeha ny tour...). Misy <b>autoplay serveur</b> ka mitohy ihany ny lalao.</li>
                <li><b>18 taona miakatra</b> ihany no mahazo mampiasa ny app.</li>
                <li><b>Tsy mamadika</b>: voasakana mandrakizay izay miezaka manodina ny système na ny solde.</li>
                <li><b>Mise sy Gain</b>: ny mise dia tsy azo averina rehefa nanomboka ny lalao. Ny gain miditra automatique ao amin'ny wallet.</li>
                <li><b>Fanajana ny ADMINISTRATIF</b>: farany ny fanapahan-keviny.</li>
              </ol>
              <div className="mvola-banner mt-3 text-xs">
                ⚠️ Manaiky ireo fitsipika ireo daholo ny olona rehetra manao inscription. Raha tsy ekenao, aza misoratra anarana.
              </div>
            </div>
          </TabsContent>

          <TabsContent value="rules">
            <div className="card-felt rounded-2xl p-5 text-sm space-y-3 leading-relaxed">
              <h2 className="font-display text-lg gold-text">Règle du jeu — Domino</h2>
              <ol className="list-decimal pl-5 space-y-2">
                <li>Mise <b>saisie libre: 200 Ar → 100 000 Ar</b> (2P na 3P).</li>
                <li>Lalao 28 pièces. Pièce iray = roa fizarana (0–6 pwen). Mpilalao tsirairay = 7 pièces.</li>
                <li><b>Lohavato</b>: tsy voatery Double 6 — <b>izay vato tian'ny mpilalao manomboka</b> no apetraka.</li>
                <li>Ny tour mihodina <b>miankavia</b>.</li>
                <li>Raha tsy misy pièce mety dia <b>Pass automatique</b> avy hatrany.</li>
                <li>Ny voalohany mahalany ny pièce-ny no mandresy ny tour.</li>
                <li><b>Bloc</b>: izay manana pwen kely indrindra no mandresy ny tour; <b>tsy isaina ny pwen-ny</b> fa ny <b>fitambaran'ny pwen an'ny mpanohitra rehetra</b> no azony.</li>
                <li><b>Mandeha Irery</b>: raha mbola 0 ny adversaire rehetra — <b>D80: 40 isa</b>, <b>D120: 60 isa</b> — mandresy match avy hatrany.</li>
                <li><b>40 Indray Maka</b>: raha mahazo <b>40 na mihoatra ao anatin'ny tour iray</b> dia mandresy match avy hatrany (39 tsy ekena).</li>
                <li><b>Miala DOUBLE 6</b>: raha [6|6] no vato farany navoaka dia <b>mandresy ny MATCH avy hatrany</b>.</li>
                <li><b>Maty 80 / Maty 120</b>: rehefa feno 80 na 120 pwen dia mipoitra ny mpandresy.</li>
                <li>Tour iray = <b>15 segondra</b>; rehefa lany dia mandeha automatique ny coup (serveur).</li>
                <li><b>Bot 🤖</b>: raha ON dia mandeha avy hatrany ny coup; raha OFF dia miandry ny 15s.</li>
                <li>Commission ADMINISTRATIF = <b>10%</b>. Gain = (Mise − 10%) × isan'ny mpilalao.</li>
                <li>Lalao tsy maintsy vita anatin'ny <b>7 andro</b>, raha tsy izany resy automatique.</li>
              </ol>
              <h3 className="font-display text-primary mt-4">Lalao hafa</h3>
              <ul className="list-disc pl-5 space-y-1 text-xs">
                <li><b>Ludo</b>: 2P/3P/4P, délai <b>10s</b> isaky ny tour, autoplay serveur.</li>
                <li><b>Pétanque</b>: délai <b>20s</b>, autoplay serveur.</li>
                <li><b>Crash MGA</b>: 10s fametrahana mise, provably fair (server seed + hash), auto-cashout serveur, multiplicateur ×1.00 → ×25.00.</li>
                <li><b>Tournoi</b>: alahady, fandraisana anjara <b>1 000 Ar</b>, misokatra indray isaky ny alatsinainy 00:00.</li>
              </ul>
            </div>
          </TabsContent>


          <TabsContent value="play">
            <div className="card-felt rounded-2xl p-5 text-sm space-y-4 leading-relaxed">
              <h2 className="font-display text-lg gold-text">Tutoriel: Fomba filalaovana</h2>
              <div>
                <h3 className="font-bold text-primary mb-1">1. Mitady mpilalao</h3>
                <p>Tsindrio ny <b>DOMINO</b> ao amin'ny Home → safidio <b>2P na 3P</b> → safidio ny <b>mode</b> (Hand/Maty 80/Maty 120) → safidio ny <b>mise</b> → tsindrio <b>"Mitady adversaire"</b>.</p>
              </div>
              <div>
                <h3 className="font-bold text-primary mb-1">2. Manomboka ny lalao</h3>
                <p>Rehefa hita ny adversaire, hipoitra ny tableau de jeu. Ny pièce-nao dia eo ambany. Ny tour-nao = mavomavo ny indication.</p>
              </div>
              <div>
                <h3 className="font-bold text-primary mb-1">3. Mametraka pièce</h3>
                <p>Tsindrio ny pièce, dia tsindrio ny <b>"Gauche"</b> na <b>"Droite"</b> hametrahana azy. Raha tsy misy mety, tsindrio <b>"Pioche"</b> na <b>"Pass"</b>.</p>
              </div>
              <div>
                <h3 className="font-bold text-primary mb-1">4. Chat anatin'ny lalao</h3>
                <p>Tsindrio ny ikon-message hisokafan'ny chat. Afaka mandefa hafatra haingana amin'ny mpilalao hafa ianao.</p>
              </div>
              <div>
                <h3 className="font-bold text-primary mb-1">5. Vita ny lalao</h3>
                <p>Hipoitra <b>NANDRESY</b> (maitso) na <b>RESY</b> (mena) ka asehoana ny vola azonao na very.</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="depot">
            <div className="card-felt rounded-2xl p-5 text-sm space-y-3 leading-relaxed">
              <h2 className="font-display text-lg gold-text">Tutoriel: Fanaovana Dépôt</h2>
              <ol className="list-decimal pl-5 space-y-2">
                <li>Mandefa vola amin'ny <b>MVOLA</b> mankany amin'ny numéro: <b>0345023006</b> (Jean Rolland).</li>
                <li>Tahirizo ny <b>référence</b> nomen'ny MVOLA anao.</li>
                <li>Sokafy ny app → tsindrio <b>Wallet</b> → onglet <b>Dépôt</b>.</li>
                <li>Soraty ny <b>montant</b>, ny <b>numéro nandefasanao</b>, ary ny <b>référence MVOLA</b>.</li>
                <li>Tsindrio <b>"Mangataka dépôt"</b> → miandry valisoa avy amin'ny ADMINISTRATIF (afaka 5 minitra ka hatramin'ny 1 ora).</li>
                <li>Rehefa voavalida, hihamitombo ny solde-nao automatique.</li>
              </ol>
              <div className="mvola-banner mt-3 text-xs">⚠️ Tsy maintsy mitovy amin'ny anarana certifié MVOLA-nao ny anarana ao amin'ny compte-nao.</div>
            </div>
          </TabsContent>

          <TabsContent value="retrait">
            <div className="card-felt rounded-2xl p-5 text-sm space-y-3 leading-relaxed">
              <h2 className="font-display text-lg gold-text">Tutoriel: Fanaovana Retrait</h2>
              <ol className="list-decimal pl-5 space-y-2">
                <li>Sokafy <b>Wallet</b> → onglet <b>Retrait</b>.</li>
                <li>Soraty ny <b>montant</b> tianao halaina.</li>
                <li>Soraty ny <b>numéro MVOLA</b> handefasana ny vola sy ny <b>anarana certifié</b>.</li>
                <li>Ampidiro ny <b>code PIN 4 chiffres</b> nataonao tamin'ny inscription.</li>
                <li>Tsindrio <b>"Mangataka retrait"</b>.</li>
                <li>Ho alefan'ny ADMINISTRATIF amin'ny MVOLA-nao afaka kelikely ny vola.</li>
              </ol>
              <div className="mvola-banner mt-3 text-xs">⚠️ Mety hisy commission MVOLA kely. Hajaina ny anarana sy numéro marina mba tsy hahavery vola.</div>
              <h3 className="font-display text-primary mt-3">Fampiasana ny app</h3>
              <ul className="list-disc pl-5 space-y-1 text-xs">
                <li><b>Home</b>: ahitana ny solde, lalao, chat, profile.</li>
                <li><b>Discussions</b>: hifampiresahana amin'ny mpilalao hafa.</li>
                <li><b>Chat Admin</b>: hifandraisana mivantana amin'ny ADMINISTRATIF.</li>
                <li><b>Profile</b>: ahitana ny historique sy score.</li>
                <li>Mba <b>hampidirana ny app</b> ao amin'ny finday: tsindrio "Ajouter à l'écran d'accueil" ao amin'ny navigateur.</li>
              </ul>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
