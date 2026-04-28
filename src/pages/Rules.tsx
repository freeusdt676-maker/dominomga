import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Rules() {
  const nav = useNavigate();
  return (
    <div className="min-h-screen felt-bg">
      <header className="p-4 flex items-center gap-3 border-b border-primary/20">
        <Button variant="ghost" size="icon" onClick={() => nav("/")}><ArrowLeft /></Button>
        <h1 className="font-display text-xl font-bold gold-text">Règle du jeu</h1>
      </header>
      <div className="p-4 max-w-lg mx-auto card-felt rounded-2xl m-4 text-sm space-y-3 leading-relaxed">
        <h2 className="font-display text-lg gold-text">Dominoes — DOMINO MGA</h2>
        <p>Prenez du plaisir et gagnez de l'argent avec Dominos!</p>
        <ol className="list-decimal pl-5 space-y-2">
          <li>Placez un pari. La mise initiale est déterminée avant le début du jeu.</li>
          <li>Le montant maximal de la mise est de <b>10 000 Ar</b>, minimal <b>1 000 Ar</b>.</li>
          <li>Le jeu se joue avec 28 pièces. Chaque pièce est divisée en deux moitiés (0 à 6 points).</li>
          <li>Au début, chaque joueur reçoit 7 pièces. Le reste = pioche.</li>
          <li>Les positions et pièces jouables sont mises en évidence pour vous aider.</li>
          <li>Le joueur avec le double-six (6-6) commence. Sinon, le double le plus fort. Sinon la pièce la plus forte.</li>
          <li>Le joueur suivant pose un domino ayant le même nombre de points à côté (6-2; 6-3; etc.).</li>
          <li>Si vous n'avez pas de pièce correspondante, piochez jusqu'à en trouver une ou que la pioche soit vide.</li>
          <li>Le jeu prend fin lorsqu'un joueur pose son dernier domino.</li>
          <li>Le joueur avec le moins de points (ou plus de pièces) gagne.</li>
          <li>En cas de « bloc » (personne ne peut jouer), le joueur avec le moins de points gagne.</li>
          <li><b>Si vous gagnez, votre mise est rémunérée avec une cote x2.</b></li>
          <li>Le jeu simultané sur plusieurs tables est interdit.</li>
          <li>Tout jeu doit être terminé sous 7 jours, sinon il est automatiquement perdu.</li>
          <li>Pour tout problème, contactez l'admin sous 3 jours après la fin de la partie.</li>
          <li>Chaque tour dure 20 secondes maximum, sinon coup automatique.</li>
        </ol>
      </div>
    </div>
  );
}
