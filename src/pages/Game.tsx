import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { fmtAr } from "@/lib/constants";
import { DominoTile } from "@/components/DominoTile";

export default function Game() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [game, setGame] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const { data } = await supabase.from("games").select("*").eq("id", id).single();
      setGame(data);
    };
    load();
    const ch = supabase.channel("game-" + id)
      .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `id=eq.${id}` }, (p: any) => setGame(p.new))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  if (!game) return <div className="min-h-screen felt-bg flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="min-h-screen felt-bg">
      <header className="p-4 flex items-center gap-3 border-b border-primary/20">
        <Button variant="ghost" size="icon" onClick={() => nav("/")}><ArrowLeft /></Button>
        <div>
          <h1 className="font-display text-xl font-bold gold-text">Latabatra</h1>
          <p className="text-xs text-muted-foreground">Mise: {fmtAr(game.stake)} · Gain: {fmtAr(game.stake*2)}</p>
        </div>
      </header>
      <div className="p-6 max-w-lg mx-auto">
        {game.status === "waiting" && (
          <div className="card-felt rounded-2xl p-8 text-center">
            <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary mb-4" />
            <p className="font-display text-lg">Miandry adversaire...</p>
            <p className="text-sm text-muted-foreground mt-2">Ny adversaire afaka miditra avy ao amin'ny Lobby.</p>
          </div>
        )}
        {game.status === "in_progress" && (
          <div className="card-felt rounded-2xl p-6 text-center">
            <p className="font-display text-lg gold-text mb-4">Lalao mandeha</p>
            <div className="flex justify-center gap-2 my-6">
              <DominoTile a={6} b={6} size="md" />
              <DominoTile a={6} b={3} size="md" />
              <DominoTile a={3} b={1} size="md" />
            </div>
            <p className="text-sm text-muted-foreground">⚠️ Moteur de jeu (mouvements + animations) hampidirina amin'ny version manaraka.</p>
            <p className="text-xs text-muted-foreground mt-2">Anatin'ity demo ity, ny rafitra fototra (latabatra, mise, joueur 2) efa miasa.</p>
          </div>
        )}
        {(game.status === "finished" || game.status === "blocked" || game.status === "cancelled") && (
          <div className="card-felt rounded-2xl p-6 text-center">
            <p className="font-display text-2xl gold-text">
              {game.winner_id === user?.id ? "🏆 Nandresy!" : game.winner_id ? "Resy" : "Lalao tapaka"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
