import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Home as HomeIcon, Clock } from "lucide-react";
import { fmtAr, TURN_TIMEOUT_SEC } from "@/lib/constants";
import { DominoTile, DominoBack } from "@/components/DominoTile";
import {
  Tile, Placed, deal, ends, canPlace, place, pipsTotal, hasMove,
} from "@/lib/dominoEngine";
import { toast } from "sonner";

type GameState = {
  player1_hand: Tile[];
  player2_hand: Tile[];
  board: Placed[];
  boneyard: Tile[];
  current_turn: string;
  passes: number;
};

export default function Game() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [game, setGame] = useState<any>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [ticketBanner, setTicketBanner] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const autoActedRef = useRef<string | null>(null);

  const updateGameState = async (payload: {
    board_state?: Placed[];
    player1_hand?: Tile[];
    player2_hand?: Tile[];
    boneyard?: Tile[];
    current_turn?: string;
    turn_started_at?: string;
    passes?: number;
    status?: "waiting" | "in_progress" | "finished" | "cancelled" | "blocked";
  }) => {
    if (!game?.id) return { error: new Error("game_missing") };
    return supabase.rpc("player_update_game_state", {
      _game_id: game.id,
      _board_state: payload.board_state ?? null,
      _player1_hand: payload.player1_hand ?? null,
      _player2_hand: payload.player2_hand ?? null,
      _boneyard: payload.boneyard ?? null,
      _current_turn: payload.current_turn ?? null,
      _turn_started_at: payload.turn_started_at ?? null,
      _passes: payload.passes ?? null,
      _status: payload.status ?? null,
    });
  };

  // Hipoitra ny banniere TICKET Nº...ACCEPTÉ raha vao tafapetraka ny ticket
  useEffect(() => {
    if (game?.ticket_number) {
      setTicketBanner(game.ticket_number);
      const t = setTimeout(() => setTicketBanner(null), 4000);
      return () => clearTimeout(t);
    }
  }, [game?.ticket_number]);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const { data } = await supabase.from("games").select("*").eq("id", id).single();
      setGame(data);
    };
    load();
    const ch = supabase.channel("game-" + id)
      .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `id=eq.${id}` },
        (p: any) => setGame(p.new))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  // Tic-tac timer 1s
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Mamboatra ny lalao raha vao nivadika ho in_progress saingy mbola tsy nizara piesy
  useEffect(() => {
    if (!game || !user) return;
    if (game.status !== "in_progress") return;
    const board = (game.board_state as Placed[]) ?? [];
    const p1 = (game.player1_hand as Tile[]) ?? [];
    const p2 = (game.player2_hand as Tile[]) ?? [];
    if (board.length === 0 && p1.length === 0 && p2.length === 0) {
      // Player1 ihany no manomboka mizara
      if (game.player1_id === user.id) {
        const { p1: h1, p2: h2, boneyard } = deal();
        // Ny manana [6,6] na ny ambony indrindra no manomboka
        let starter = game.player1_id;
        const has66_p1 = h1.some(([a,b]) => a===6 && b===6);
        const has66_p2 = h2.some(([a,b]) => a===6 && b===6);
        if (has66_p2 && !has66_p1) starter = game.player2_id;
        updateGameState({
          player1_hand: h1,
          player2_hand: h2,
          boneyard,
          board_state: [],
          current_turn: starter,
          turn_started_at: new Date().toISOString(),
        });
      }
    }
  }, [game?.status, game?.player1_id, user?.id]);

  const myHand: Tile[] = useMemo(() => {
    if (!game || !user) return [];
    return (game.player1_id === user.id ? game.player1_hand : game.player2_hand) ?? [];
  }, [game, user]);

  const oppHandCount: number = useMemo(() => {
    if (!game || !user) return 0;
    return ((game.player1_id === user.id ? game.player2_hand : game.player1_hand) ?? []).length;
  }, [game, user]);

  const board: Placed[] = (game?.board_state as Placed[]) ?? [];
  const isMyTurn = game?.current_turn === user?.id && game?.status === "in_progress";

  // Faharetan'ny Tour
  const turnStart = game?.turn_started_at ? new Date(game.turn_started_at).getTime() : 0;
  const elapsed = Math.max(0, Math.floor((now - turnStart) / 1000));
  const remaining = Math.max(0, TURN_TIMEOUT_SEC - elapsed);

  const tryPlay = async (idx: number, side?: "left" | "right") => {
    if (!isMyTurn || !game || !user) return;
    const tile = myHand[idx];
    const possible = canPlace(board, tile);
    if (!possible) return toast.error("Tsy mety apetraka");
    let chosenSide: "left" | "right" = side ?? (possible === "either" ? "right" : possible);
    if (possible !== "either" && side && side !== possible) {
      return toast.error("Tsy mifanaraka amin'io tendro io");
    }
    const newBoard = place(board, tile, chosenSide);
    const newHand = myHand.filter((_, i) => i !== idx);
    const isP1 = game.player1_id === user.id;
    const oppHand: Tile[] = (isP1 ? game.player2_hand : game.player1_hand) ?? [];
    const oppId = isP1 ? game.player2_id : game.player1_id;

    // Mandresy raha tsy misy piesy
    if (newHand.length === 0) {
      await supabase.rpc("settle_game", { _game_id: game.id, _winner: user.id });
      await updateGameState({
        board_state: newBoard,
        [isP1 ? "player1_hand" : "player2_hand"]: newHand,
      } as any);
      setSelected(null);
      return;
    }
    await updateGameState({
      board_state: newBoard,
      [isP1 ? "player1_hand" : "player2_hand"]: newHand,
      current_turn: oppId,
      turn_started_at: new Date().toISOString(),
      passes: 0,
    } as any);
    // Mametraka filaharana ho an'ny Admin (historique)
    await supabase.from("game_moves").insert({
      game_id: game.id,
      player_id: user.id,
      piece: { tile, flipped: chosenSide === "left" ? tile[1] !== (ends(board)?.left ?? tile[1]) : tile[0] !== (ends(board)?.right ?? tile[0]) },
      side: chosenSide,
    });
    setSelected(null);
  };

  const drawOrPass = async () => {
    if (!isMyTurn || !game || !user) return;
    const isP1 = game.player1_id === user.id;
    const boneyard: Tile[] = (game.boneyard as Tile[]) ?? [];
    const oppId = isP1 ? game.player2_id : game.player1_id;

    if (boneyard.length > 0) {
      const drawn = boneyard[0];
      const newBone = boneyard.slice(1);
      const newHand = [...myHand, drawn];
      await updateGameState({
        boneyard: newBone,
        [isP1 ? "player1_hand" : "player2_hand"]: newHand,
      } as any);
      toast.success("Naka iray tao am-poto");
      return;
    }
    // Pass — raha ny mpilalao roa tsy afa-mihetsika → blocked
    const passes = (game.passes ?? 0) + 1;
    if (passes >= 2) {
      // Jereo izay manana pips kely indrindra
      const myPips = pipsTotal(myHand);
      const oppPips = pipsTotal(((isP1 ? game.player2_hand : game.player1_hand) ?? []) as Tile[]);
      const winner = myPips < oppPips ? user.id : oppPips < myPips ? oppId : null;
      if (winner) {
        await supabase.rpc("settle_game", { _game_id: game.id, _winner: winner });
      } else {
        await updateGameState({ status: "blocked" });
      }
      return;
    }
    await updateGameState({
      current_turn: oppId,
      turn_started_at: new Date().toISOString(),
      passes,
    });
    toast("Pass — tsy misy piesy mety");
  };

  // Auto-action rehefa lany ny 20s
  useEffect(() => {
    if (!game || !user || !isMyTurn) return;
    if (game.status !== "in_progress") return;
    if (remaining > 0) return;
    const key = `${game.id}-${game.turn_started_at}`;
    if (autoActedRef.current === key) return;
    autoActedRef.current = key;

    (async () => {
      // 1) Raha misy piesy mety apetraka → ataovy automatique ny voalohany hita
      const playableIdx = myHand.findIndex((t) => canPlace(board, t) !== null);
      if (playableIdx >= 0) {
        const can = canPlace(board, myHand[playableIdx]);
        const side: "left" | "right" = can === "left" ? "left" : "right";
        await tryPlay(playableIdx, side);
        return;
      }
      // 2) Raha mbola misy boneyard → maka iray
      const boneyard: Tile[] = (game.boneyard as Tile[]) ?? [];
      if (boneyard.length > 0) {
        await drawOrPass();
        return;
      }
      // 3) Tsy afa-mihetsika intsony → pass (mandeha amin'ny adversaire)
      await drawOrPass();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, isMyTurn, game?.turn_started_at, game?.status]);

  if (!game) return <div className="min-h-screen felt-bg flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  const e = ends(board);
  const canLeft = selected !== null && e ? canPlace(board, myHand[selected]) === "left" || canPlace(board, myHand[selected]) === "either" : false;
  const canRight = selected !== null && e ? canPlace(board, myHand[selected]) === "right" || canPlace(board, myHand[selected]) === "either" : false;
  const noMove = isMyTurn && !hasMove(myHand, board);

  return (
    <div className="min-h-screen felt-bg flex flex-col">
      {ticketBanner && (
        <div className="fixed inset-x-0 top-0 z-50 bg-success text-success-foreground py-3 px-4 text-center font-bold shadow-lg animate-in slide-in-from-top">
          🎫 TICKET Nº{ticketBanner} ACCEPTÉ
        </div>
      )}
      <header className="p-3 flex items-center gap-3 border-b border-primary/20">
        <Button variant="ghost" size="icon" onClick={() => nav(-1 as any)}><ArrowLeft /></Button>
        <div className="flex-1">
          <h1 className="font-display text-base font-bold gold-text">Latabatra Domino</h1>
          <p className="text-[10px] text-muted-foreground">
            Mise: {fmtAr(game.stake)} · Gain: {fmtAr(Math.round(game.stake * 1.8))} · Comm. 10%
          </p>
        </div>
        {game.status === "in_progress" && (
          <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold ${remaining <= 5 ? "bg-destructive/20 text-destructive animate-pulse" : "bg-primary/15 gold-text"}`}>
            <Clock className="w-3 h-3" /> {remaining}s
          </div>
        )}
        <Button variant="ghost" size="icon" onClick={() => nav("/")}><HomeIcon className="w-5 h-5" /></Button>
      </header>

      {game.status === "waiting" && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="card-felt rounded-2xl p-8 text-center max-w-sm">
            <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary mb-4" />
            <p className="font-display text-lg">Miandry adversaire...</p>
            <p className="text-sm text-muted-foreground mt-2">Ny adversaire afaka miditra avy ao amin'ny Lobby.</p>
            {game.player1_id === user?.id && (
              <Button
                variant="outline"
                className="mt-4"
                onClick={async () => {
                  const { error } = await supabase.rpc("cancel_waiting_game", { _game_id: game.id });
                  if (error) return toast.error(error.message);
                  toast("Nesorina ny mise");
                  nav("/lobby");
                }}
              >
                Annuler ny mise
              </Button>
            )}
          </div>
        </div>
      )}

      {game.status === "in_progress" && (
        <>
          {/* Tanan'ny adversaire (back) */}
          <div className="p-3 flex justify-center gap-1 overflow-x-auto">
            {Array.from({ length: oppHandCount }).map((_, i) => (
              <DominoBack key={i} size="sm" />
            ))}
          </div>

          {/* Latabatra — chain mifandrohy, mihodina raha lava (snake) */}
          <div className="flex-1 overflow-auto p-2 flex items-start justify-center">
            {board.length === 0 ? (
              <p className="text-sm text-muted-foreground italic mt-8">
                {isMyTurn ? "Apetraho ny piesy voalohany" : "Miandry ny adversaire..."}
              </p>
            ) : (
              <div className="flex flex-wrap justify-center items-center gap-0 max-w-full px-1">
                {board.map((p, i) => {
                  const [a, b] = p.tile;
                  const isDouble = a === b;
                  return (
                    <div key={i} className="flex items-center justify-center">
                      <DominoTile
                        a={p.flipped ? b : a}
                        b={p.flipped ? a : b}
                        size="sm"
                        horizontal={!isDouble}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Indikatera tendro + bokotra apetraka */}
          {selected !== null && isMyTurn && (
            <div className="px-3 py-2 flex justify-center gap-2 bg-card/40">
              <Button size="sm" disabled={!canLeft} className="btn-gold" onClick={() => tryPlay(selected, "left")}>
                ⬅ Apetraho havia {e ? `(${e.left})` : ""}
              </Button>
              <Button size="sm" disabled={!canRight} className="btn-gold" onClick={() => tryPlay(selected, "right")}>
                Apetraho havanana ➡ {e ? `(${e.right})` : ""}
              </Button>
            </div>
          )}

          {/* Tanako — lehibe sy mazava, mifanesy */}
          <div className="border-t-2 border-primary/30 bg-card/30 p-3">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className={`text-xs font-bold ${isMyTurn ? "gold-text" : "text-muted-foreground"}`}>
                {isMyTurn ? "▶ Andiany!" : "Miandry adversaire"}
              </span>
              {isMyTurn && (
                <Button size="sm" variant="outline" onClick={drawOrPass} disabled={!noMove && (game.boneyard ?? []).length === 0}>
                  {(game.boneyard ?? []).length > 0 ? "Maka piesy" : "Pass"}
                </Button>
              )}
            </div>
            <div className="flex gap-1.5 overflow-x-auto py-2 justify-center">
              {myHand.map((t, i) => {
                const placeable = canPlace(board, t) !== null;
                return (
                  <DominoTile
                    key={i}
                    a={t[0]}
                    b={t[1]}
                    size="lg"
                    onClick={() => isMyTurn && placeable && setSelected(i === selected ? null : i)}
                    selected={selected === i}
                    disabled={!isMyTurn || !placeable}
                  />
                );
              })}
            </div>
          </div>
        </>
      )}

      {(game.status === "finished" || game.status === "blocked" || game.status === "cancelled") && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="card-felt rounded-2xl p-8 text-center max-w-sm">
            <p className="font-display text-3xl gold-text mb-3">
              {game.winner_id === user?.id ? "🏆 Nandresy!" : game.winner_id ? "Resy" : "Lalao tapaka"}
            </p>
            {game.winner_id === user?.id && (
              <p className="text-lg">Nahazo: <span className="gold-text font-bold">{fmtAr(Math.round(game.stake * 1.8))}</span></p>
            )}
            <Button className="btn-gold mt-4 w-full" onClick={() => nav("/lobby")}>Lalao hafa</Button>
          </div>
        </div>
      )}
    </div>
  );
}
