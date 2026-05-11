import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Home as HomeIcon, Clock, Flag, Pizza, Rabbit } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { fmtAr, TURN_TIMEOUT_SEC } from "@/lib/constants";
import { DominoTile, DominoBack } from "@/components/DominoTile";
import { SnakeBoard } from "@/components/SnakeBoard";
import { RadioPlayer } from "@/components/RadioPlayer";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Tile, Placed, deal, deal3, ends, canPlace, place, pipsTotal, hasMove, chooseOpening,
} from "@/lib/dominoEngine";
import { toast } from "sonner";
import { sfx } from "@/lib/sfx";

type GameState = {
  player1_hand: Tile[];
  player2_hand: Tile[];
  board: Placed[];
  boneyard: Tile[];
  current_turn: string;
  passes: number;
};

const ABANDONED_GAME_KEY = "domino_abandoned_game_id";

type GameMode = "d120" | "d80" | "hand";
const MODE_LABEL: Record<GameMode, string> = { d120: "Maty 120", d80: "Maty 80", hand: "Maty atanana" };
const MODE_TARGET: Record<GameMode, number | null> = { d120: 120, d80: 80, hand: null };

function getPlayerIds(g: any): string[] {
  const pc = Number(g?.players_count ?? 2);
  return pc === 3
    ? [g.player1_id, g.player2_id, g.player3_id].filter(Boolean)
    : [g.player1_id, g.player2_id].filter(Boolean);
}
function nextTurnId(g: any, currentId: string): string {
  const ids = getPlayerIds(g);
  const i = ids.indexOf(currentId);
  return ids[(i + 1) % ids.length] ?? ids[0];
}
function getHandKey(g: any, uid: string): "player1_hand" | "player2_hand" | "player3_hand" | null {
  if (!g) return null;
  if (uid === g.player1_id) return "player1_hand";
  if (uid === g.player2_id) return "player2_hand";
  if (uid === g.player3_id) return "player3_hand";
  return null;
}

export default function Game() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [serverGame, setServerGame] = useState<any>(null);
  const [optimistic, setOptimistic] = useState<any>(null);
  const game = optimistic ?? serverGame;
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [profilePhotos, setProfilePhotos] = useState<Record<string, string | null>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [ticketBanner, setTicketBanner] = useState<string | null>(null);
  const [roundBanner, setRoundBanner] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [isAbandoning, setIsAbandoning] = useState(false);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null);
  const autoActedRef = useRef<string | null>(null);
  const initLockRef = useRef(false);
  const autoPassRef = useRef<string | null>(null);
  const roundEndLockRef = useRef<string | null>(null);
  const revealCommitRef = useRef<string | null>(null);
  const isMobile = useIsMobile();

  const getAbandonedGameId = () => sessionStorage.getItem(ABANDONED_GAME_KEY);

  // Reconcile optimistic with server: drop optimistic when server catches up
  useEffect(() => {
    if (!serverGame) return;
    if (!optimistic) return;
    // If server is at least as new as optimistic (same updated_at or newer), drop optimistic
    if (new Date(serverGame.updated_at).getTime() >= new Date(optimistic.updated_at ?? 0).getTime()) {
      setOptimistic(null);
    }
  }, [serverGame, optimistic]);

  const initializeGameHands = async (currentGame: any) => {
    const pc = Number(currentGame?.players_count ?? 2);
    if (!currentGame?.id || !currentGame.player1_id || !currentGame.player2_id) return;
    if (pc === 3 && !currentGame.player3_id) return;
    if (initLockRef.current) return;
    initLockRef.current = true;

    try {
      const seed = `${currentGame.ticket_number || currentGame.id}-r${currentGame.round_number ?? 1}`;
      const mode = (currentGame.game_mode ?? "d120") as GameMode;
      let hands: Tile[][];
      let boneyard: Tile[];
      if (pc === 3) {
        const d = deal3(seed);
        hands = [d.p1, d.p2, d.p3];
        boneyard = d.boneyard;
      } else {
        const d = deal(seed);
        hands = [d.p1, d.p2];
        boneyard = d.boneyard;
      }
      const opener = chooseOpening(hands, mode);
      const ids = getPlayerIds(currentGame);
      const openerId = ids[opener.playerIndex];
      let board: Placed[] = [];
      let nextId = openerId;
      if (opener.forced) {
        // Remove forced opening tile from opener's hand and place on board
        const openerHand = hands[opener.playerIndex].filter(
          (t) => !(t[0] === opener.tile[0] && t[1] === opener.tile[1]),
        );
        hands[opener.playerIndex] = openerHand;
        board = [{ tile: opener.tile, flipped: false }];
        nextId = ids[(opener.playerIndex + 1) % ids.length];
      }
      // If not forced (hand mode or no qualifying double), opener keeps full hand
      // and plays any tile of their choice on an empty board.
      const { error } = await updateGameState({
        player1_hand: hands[0],
        player2_hand: hands[1],
        player3_hand: pc === 3 ? hands[2] : undefined,
        boneyard,
        board_state: board,
        current_turn: nextId,
        turn_started_at: new Date().toISOString(),
      });
      if (error) {
        throw error;
      }
      const _ = openerId;
    } catch (error: any) {
      toast.error(error?.message ?? "Tsy tafapetraka ny vaton'ny lalao");
    } finally {
      initLockRef.current = false;
    }
  };

  const updateGameState = async (payload: {
    board_state?: Placed[];
    player1_hand?: Tile[];
    player2_hand?: Tile[];
    player3_hand?: Tile[];
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
      _player3_hand: payload.player3_hand ?? null,
    });
  };

  // Mamarana tour iray. Raha tratra target / iala double-6 / mitovy daty -> resy daholo ny lalao.
  // Raha tsy izany dia atomboka tour vaovao (re-deal).
  const finishRound = async (
    winnerId: string,
    points: number,
    lastTile: Tile | null,
  ) => {
    if (!game) return;
    const key = `${game.id}-r${game.round_number ?? 1}-end`;
    if (roundEndLockRef.current === key) return;
    roundEndLockRef.current = key;

    const pc = Number(game.players_count ?? 2);
    const today = new Date().getDate();
    const isDouble6Win = !!lastTile && lastTile[0] === 6 && lastTile[1] === 6;
    const addTo = (uid: string, base: number) => Number(base ?? 0) + (winnerId === uid ? points : 0);
    const newScoreP1 = addTo(game.player1_id, game.score_p1);
    const newScoreP2 = addTo(game.player2_id, game.score_p2);
    const newScoreP3 = pc === 3 ? addTo(game.player3_id, game.score_p3) : 0;
    const mode = (game.game_mode ?? "d120") as GameMode;
    const target = MODE_TARGET[mode];
    const wScore =
      winnerId === game.player1_id ? newScoreP1 : winnerId === game.player2_id ? newScoreP2 : newScoreP3;

    const targetReached = target !== null && wScore >= target;
    const dateMatch = points > 0 && points === today;
    const handMode = mode === "hand";
    const instantWin = isDouble6Win || dateMatch || handMode || targetReached;

    const REVEAL_MS = 3000;
    const revealUntil = new Date(Date.now() + REVEAL_MS).toISOString();
    setRoundBanner(
      pc === 3
        ? `Tour vita +${points} • ${newScoreP1}-${newScoreP2}-${newScoreP3}`
        : `Tour vita +${points} • ${newScoreP1} - ${newScoreP2}`,
    );
    setTimeout(() => setRoundBanner(null), REVEAL_MS + 500);
    const updatePayload: any = {
      score_p1: newScoreP1,
      score_p2: newScoreP2,
      reveal_until: revealUntil,
    };
    if (pc === 3) updatePayload.score_p3 = newScoreP3;
    await supabase.from("games").update(updatePayload).eq("id", game.id);
    setOptimistic(null);

    setTimeout(async () => {
      if (instantWin) {
        // 2-player: ask both players "Mbola hanohy / Tsy hanohy" before settling.
        // 3-player: settle immediately as before.
        if (pc === 2 && targetReached) {
          await supabase.from("games").update({ endgame_votes: {}, reveal_until: null }).eq("id", game.id);
          return;
        }
        await supabase.rpc("settle_game", { _game_id: game.id, _winner: winnerId });
        return;
      }
      const nextRound = (game.round_number ?? 1) + 1;
      const seed = `${game.ticket_number || game.id}-r${nextRound}`;
      let h1: Tile[], h2: Tile[], h3: Tile[] = [], boneyard: Tile[];
      if (pc === 3) {
        const d = deal3(seed); h1 = d.p1; h2 = d.p2; h3 = d.p3; boneyard = d.boneyard;
      } else {
        const d = deal(seed); h1 = d.p1; h2 = d.p2; boneyard = d.boneyard;
      }
      // Tour 2+: tsy misy double terena. Topon'ny tour mihodina automatique
      // makany ANKAVIA (= mpilalao manaraka eo amin'ny lisitra).
      const ids = pc === 3 ? [game.player1_id, game.player2_id, game.player3_id] : [game.player1_id, game.player2_id];
      // Round-1 opener: re-derive deterministically from the round-1 seed
      const r1Seed = `${game.ticket_number || game.id}-r1`;
      const r1Deal = pc === 3 ? deal3(r1Seed) : deal(r1Seed);
      const r1Hands = pc === 3
        ? [(r1Deal as any).p1, (r1Deal as any).p2, (r1Deal as any).p3]
        : [(r1Deal as any).p1, (r1Deal as any).p2];
      const r1OpenerIdx = chooseOpening(r1Hands, mode).playerIndex;
      const openerIdx = (r1OpenerIdx + (nextRound - 1)) % ids.length;
      const hands = pc === 3 ? [h1, h2, h3] : [h1, h2];
      const nextId = ids[openerIdx];
      const updateNext: any = {
        round_number: nextRound,
        player1_hand: hands[0],
        player2_hand: hands[1],
        boneyard,
        board_state: [],
        current_turn: nextId,
        turn_started_at: new Date().toISOString(),
        passes: 0,
        reveal_until: null,
      };
      if (pc === 3) updateNext.player3_hand = hands[2];
      await supabase.from("games").update(updateNext).eq("id", game.id);
    }, REVEAL_MS);
  };

  // Bloqué (samy tsy afaka mihetsika): kely vato indrindra mahazo ny diferansa
  const finishBlocked = async () => {
    if (!game) return;
    const pc = Number(game.players_count ?? 2);
    const p1H = (game.player1_hand as Tile[]) ?? [];
    const p2H = (game.player2_hand as Tile[]) ?? [];
    const p3H = (game.player3_hand as Tile[]) ?? [];
    const p1Pips = pipsTotal(p1H);
    const p2Pips = pipsTotal(p2H);
    const p3Pips = pc === 3 ? pipsTotal(p3H) : Infinity;
    const totals = pc === 3
      ? [{ id: game.player1_id, p: p1Pips }, { id: game.player2_id, p: p2Pips }, { id: game.player3_id, p: p3Pips }]
      : [{ id: game.player1_id, p: p1Pips }, { id: game.player2_id, p: p2Pips }];
    totals.sort((a, b) => a.p - b.p);
    const tied = totals[0].p === totals[1].p;
    if (tied) {
      // Mitovy: tsy misy point, alefa tour vaovao
      const nextRound = (game.round_number ?? 1) + 1;
      const seed = `${game.ticket_number || game.id}-r${nextRound}`;
      const mode = (game.game_mode ?? "d120") as GameMode;
      let h1: Tile[], h2: Tile[], h3: Tile[] = [], boneyard: Tile[];
      if (pc === 3) {
        const d = deal3(seed); h1 = d.p1; h2 = d.p2; h3 = d.p3; boneyard = d.boneyard;
      } else {
        const d = deal(seed); h1 = d.p1; h2 = d.p2; boneyard = d.boneyard;
      }
      const ids = pc === 3 ? [game.player1_id, game.player2_id, game.player3_id] : [game.player1_id, game.player2_id];
      const r1Seed = `${game.ticket_number || game.id}-r1`;
      const r1Deal = pc === 3 ? deal3(r1Seed) : deal(r1Seed);
      const r1Hands = pc === 3
        ? [(r1Deal as any).p1, (r1Deal as any).p2, (r1Deal as any).p3]
        : [(r1Deal as any).p1, (r1Deal as any).p2];
      const r1OpenerIdx = chooseOpening(r1Hands, mode).playerIndex;
      const openerIdx = (r1OpenerIdx + (nextRound - 1)) % ids.length;
      const hands = pc === 3 ? [h1, h2, h3] : [h1, h2];
      const nextId = ids[openerIdx];
      setRoundBanner(`Mitovy vato — tour vaovao`);
      setTimeout(() => setRoundBanner(null), 3500);
      const updateNext: any = {
        round_number: nextRound,
        player1_hand: hands[0],
        player2_hand: hands[1],
        boneyard,
        board_state: [],
        current_turn: nextId,
        turn_started_at: new Date().toISOString(),
        passes: 0,
      };
      if (pc === 3) updateNext.player3_hand = hands[2];
      await supabase.from("games").update(updateNext).eq("id", game.id);
      return;
    }
    const winnerId = totals[0].id;
    const sumOthers = totals.slice(1).reduce((s, x) => s + x.p, 0);
    const points = sumOthers - totals[0].p;
    await finishRound(winnerId, points, null);
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
      setServerGame(data);
    };
    load();
    const ch = supabase.channel("game-" + id)
      .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `id=eq.${id}` },
        (p: any) => setServerGame(p.new))
      .subscribe();
    // Polling fallback (1.5s) — raha sendra tara ny realtime, mba hifohazan'ny tour avy hatrany
    const poll = setInterval(async () => {
      const { data } = await supabase.from("games").select("*").eq("id", id).single();
      if (data) setServerGame((prev: any) => {
        if (!prev) return data;
        const a = new Date(prev.updated_at ?? 0).getTime();
        const b = new Date(data.updated_at ?? 0).getTime();
        return b >= a ? data : prev;
      });
    }, 1500);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, [id]);

  useEffect(() => {
    if (!game || !user || !id) return;
    const abandonedGameId = getAbandonedGameId();
    if (
      abandonedGameId === id &&
      game.status === "finished" &&
      game.winner_id &&
      game.winner_id !== user.id
    ) {
      nav("/lobby", { replace: true });
    }
  }, [game, user, id, nav]);

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
    const p3 = (game.player3_hand as Tile[]) ?? [];
    const pc = Number(game.players_count ?? 2);
    const ready = pc === 3 ? !!game.player3_id : !!game.player2_id;
    if (board.length === 0 && p1.length === 0 && p2.length === 0 && p3.length === 0 && ready) {
      initializeGameHands(game);
    }
  }, [game, user]);

  // Anaran'ny mpilalao
  useEffect(() => {
    if (!game) return;
    const ids = getPlayerIds(game);
    if (!ids.length) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, mvola_name, selfie_url, avatar_url")
        .in("user_id", ids);
      const m: Record<string, string> = {};
      const ph: Record<string, string | null> = {};
      (data ?? []).forEach((p: any) => {
        m[p.user_id] = p.mvola_name ?? "Mpilalao";
        ph[p.user_id] = p.selfie_url ?? p.avatar_url ?? null;
      });
      setProfileNames(m);
      setProfilePhotos(ph);
    })();
  }, [game?.player1_id, game?.player2_id, game?.player3_id]);

  const myHand: Tile[] = useMemo(() => {
    if (!game || !user) return [];
    const k = getHandKey(game, user.id);
    return (k ? (game[k] as Tile[]) : []) ?? [];
  }, [game, user]);

  // Liste of opponents (1 or 2)
  const opponents: { id: string; name: string; hand: Tile[]; count: number }[] = useMemo(() => {
    if (!game || !user) return [];
    const ids = getPlayerIds(game);
    return ids.filter((id) => id !== user.id).map((id) => {
      const k = getHandKey(game, id) as any;
      const h = (game[k] as Tile[]) ?? [];
      return { id, name: profileNames[id] ?? "Mpilalao", hand: h, count: h.length };
    });
  }, [game, user, profileNames]);

  const myName = profileNames[user?.id ?? ""] ?? "Izaho";
  const myHandKey = getHandKey(game, user?.id ?? "") ?? "player1_hand";
  const oppHandCount = opponents.reduce((s, o) => s + o.count, 0);
  const oppHand: Tile[] = useMemo(() => {
    return opponents.flatMap((o) => o.hand);
  }, [opponents]);
  const isP1Helper = useMemo(() => {
    return game ? game.player1_id === user?.id : false;
  }, [game, user]);

  const board: Placed[] = (game?.board_state as Placed[]) ?? [];
  const isMyTurn = game?.current_turn === user?.id && game?.status === "in_progress";
  const revealUntilMs = game?.reveal_until ? new Date(game.reveal_until).getTime() : 0;
  const isRevealing = revealUntilMs > now;

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
    sfx.move();
    const oppId = nextTurnId(game, user.id);
    const handKey = getHandKey(game, user.id) as "player1_hand" | "player2_hand" | "player3_hand";
    const remainingOthers: Tile[] = opponents.flatMap((o) => o.hand);

    setOptimistic({
      ...game,
      board_state: newBoard,
      [handKey]: newHand,
      current_turn: newHand.length === 0 ? game.current_turn : oppId,
      turn_started_at: new Date().toISOString(),
      passes: 0,
      updated_at: new Date().toISOString(),
    });
    setSelected(null);

    if (newHand.length === 0) {
      await updateGameState({
        board_state: newBoard,
        [handKey]: newHand,
      } as any);
      const points = pipsTotal(remainingOthers);
      await finishRound(user.id, points, tile);
      return;
    }
    await updateGameState({
      board_state: newBoard,
      [handKey]: newHand,
      current_turn: oppId,
      turn_started_at: new Date().toISOString(),
      passes: 0,
    } as any);
    await supabase.from("game_moves").insert({
      game_id: game.id,
      player_id: user.id,
      piece: { tile, flipped: chosenSide === "left" ? tile[1] !== (ends(board)?.left ?? tile[1]) : tile[0] !== (ends(board)?.right ?? tile[0]) },
      side: chosenSide,
    });
  };

  const autoPass = async () => {
    if (!isMyTurn || !game || !user) return;
    const oppId = nextTurnId(game, user.id);
    const pc = Number(game.players_count ?? 2);
    const passes = (game.passes ?? 0) + 1;
    if (passes >= pc) {
      await finishBlocked();
      return;
    }
    await updateGameState({
      current_turn: oppId,
      turn_started_at: new Date().toISOString(),
      passes,
    });
    toast("TSIMANANA — mandalo any amin'ny adversaire");
  };

  // Auto-action / Bot — rehefa lany ny 20s, mandeha ho azy ny lalao
  // Ny mpilalao manana ny tour no manao voalohany; raha tsy mihetsika izy,
  // ny client-n'ny adversaire no maka an-tanana (bot) aorian'ny 3s fanampiny.
  useEffect(() => {
    if (!game || !user) return;
    if (game.status !== "in_progress") return;
    if (!game.current_turn) return;
    if (isRevealing) return;
    // Rehefa lany ny 20s (na ahy na adversaire), ny Bot no mandefa avy hatrany
    if (elapsed < TURN_TIMEOUT_SEC) return;
    const key = `${game.id}-${game.turn_started_at}-${game.current_turn}`;
    if (autoActedRef.current === key) return;
    autoActedRef.current = key;

    (async () => {
      const turnId = game.current_turn as string;
      const turnKey = getHandKey(game, turnId) as "player1_hand" | "player2_hand" | "player3_hand" | null;
      if (!turnKey) return;
      const turnHand: Tile[] = ((game[turnKey] as Tile[]) ?? []) as Tile[];
      const oppId = nextTurnId(game, turnId);
      const pc = Number(game.players_count ?? 2);

      const playableIdx = turnHand.findIndex((t) => canPlace(board, t) !== null);
      if (playableIdx >= 0) {
        const tile = turnHand[playableIdx];
        const can = canPlace(board, tile);
        const chosenSide: "left" | "right" = can === "left" ? "left" : can === "right" ? "right" : "right";
        const newBoard = place(board, tile, chosenSide);
        const newHand = turnHand.filter((_, i) => i !== playableIdx);
        if (newHand.length === 0) {
          await updateGameState({
            board_state: newBoard,
            [turnKey]: newHand,
          } as any);
          const otherIds = getPlayerIds(game).filter((x) => x !== turnId);
          const otherTiles: Tile[] = otherIds.flatMap((id) => {
            const k = getHandKey(game, id) as any;
            return (game[k] as Tile[]) ?? [];
          });
          await finishRound(turnId, pipsTotal(otherTiles), tile);
          return;
        }
        await updateGameState({
          board_state: newBoard,
          [turnKey]: newHand,
          current_turn: oppId,
          turn_started_at: new Date().toISOString(),
          passes: 0,
        } as any);
        await supabase.from("game_moves").insert({
          game_id: game.id,
          player_id: turnId,
          piece: { tile, auto: true },
          side: chosenSide,
        });
        return;
      }
      const passes = (game.passes ?? 0) + 1;
      if (passes >= pc) {
        await finishBlocked();
        return;
      }
      await updateGameState({
        current_turn: oppId,
        turn_started_at: new Date().toISOString(),
        passes,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, game?.turn_started_at, game?.status, game?.current_turn]);

  // Auto-pass raha tsy manana vato mety ny mpilalao manana ny tour
  useEffect(() => {
    if (!isMyTurn || !game) return;
    if (isRevealing) return;
    if (hasMove(myHand, board)) return;
    const key = `${game.id}-pass-${game.turn_started_at}`;
    if (autoPassRef.current === key) return;
    autoPassRef.current = key;
    const t = setTimeout(() => { autoPass(); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, myHand, board, game?.turn_started_at, isRevealing]);

  if (!game) return <div className="min-h-screen felt-bg flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  const e = ends(board);
  const canLeft = selected !== null && e ? canPlace(board, myHand[selected]) === "left" || canPlace(board, myHand[selected]) === "either" : false;
  const canRight = selected !== null && e ? canPlace(board, myHand[selected]) === "right" || canPlace(board, myHand[selected]) === "either" : false;
  const noMove = isMyTurn && !hasMove(myHand, board);
  const gameMode = (game?.game_mode ?? "d120") as GameMode;
  const scoreOf = (uid: string): number => {
    if (!game) return 0;
    if (uid === game.player1_id) return Number(game.score_p1 ?? 0);
    if (uid === game.player2_id) return Number(game.score_p2 ?? 0);
    if (uid === game.player3_id) return Number(game.score_p3 ?? 0);
    return 0;
  };
  const myScore = scoreOf(user?.id ?? "");
  const targetPts = MODE_TARGET[gameMode];
  const playersCount = Number(game?.players_count ?? 2);
  const turnName = game?.current_turn ? (profileNames[game.current_turn] ?? "Mpilalao") : "";

  const abandonGame = async () => {
    if (!game || !user || isAbandoning) return;
    const oppId = game.player1_id === user.id ? game.player2_id : game.player1_id;
    if (!oppId) {
      // Mbola tsy nisy adversaire — annuler fotsiny
      await supabase.rpc("cancel_waiting_game", { _game_id: game.id });
      nav("/lobby", { replace: true });
      return;
    }

    setIsAbandoning(true);
    sessionStorage.setItem(ABANDONED_GAME_KEY, game.id);
    setOptimistic({
      ...game,
      status: "finished",
      winner_id: oppId,
      current_turn: null,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const { error } = await supabase.rpc("settle_game", { _game_id: game.id, _winner: oppId });
    if (error) {
      sessionStorage.removeItem(ABANDONED_GAME_KEY);
      setOptimistic(null);
      setIsAbandoning(false);
      return toast.error(error.message);
    }

    toast("Resy avy hatrany ianao noho ny abandonné");
    nav("/lobby", { replace: true });
  };

  // Sary kely kokoa amin'ny mobile mba tsy hifanaikitra
  const handTileSize = isMobile ? "md" : "lg";
  const boardTileSize = isMobile ? "xs" : "sm";

  return (
    <div className="min-h-screen green-felt flex flex-col">
      {ticketBanner && (
        <div className="fixed inset-x-0 top-0 z-50 bg-success text-success-foreground py-3 px-4 text-center font-bold shadow-lg animate-in slide-in-from-top">
          🎫 TICKET Nº{ticketBanner} ACCEPTÉ
        </div>
      )}
      {roundBanner && (
        <div className="fixed inset-x-0 top-0 z-50 bg-primary text-primary-foreground py-3 px-4 text-center font-bold shadow-lg animate-in slide-in-from-top">
          🏁 {roundBanner}
        </div>
      )}
      {/* Header style "Rolland | Tour | Opponent" */}
      <header className="relative px-3 py-2 grid grid-cols-3 items-center gap-2 border-b-2 border-[#d4a52c]/60 bg-[linear-gradient(180deg,#0d3b22_0%,#0a2818_100%)] shadow-[inset_0_-2px_0_rgba(212,165,44,0.25)]">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-[#ffe27a] hover:bg-[#ffffff10]" onClick={() => nav(-1 as any)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          {profilePhotos[user?.id ?? ""] ? (
            <img
              src={profilePhotos[user?.id ?? ""] as string}
              alt={myName}
              onClick={() => setZoomedPhoto(profilePhotos[user?.id ?? ""] as string)}
              className="w-11 h-11 rounded-full object-cover border-2 border-[#ffe27a]/70 shadow cursor-pointer active:scale-95 transition"
            />
          ) : (
            <div className="w-11 h-11 rounded-full bg-[#ffe27a]/20 border-2 border-[#ffe27a]/70 flex items-center justify-center text-sm font-bold text-[#ffe27a]">
              {(myName?.[0] ?? "?").toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className={`truncate text-sm font-extrabold ${game.current_turn === user?.id ? "text-[#ffe27a]" : "text-white/90"}`}>
              {myName}
            </div>
            <div className="text-[10px] text-[#ffe27a]/70 truncate">
              Score {scoreOf(user?.id ?? "")}
              {targetPts ? <span className="opacity-60">/{targetPts}</span> : null}
            </div>
          </div>
        </div>
        <div className="text-center">
          <div className="font-display text-[11px] uppercase tracking-[0.2em] text-[#ffe27a]/80">Tour</div>
          <div className="font-display text-lg font-extrabold gold-text leading-none">
            {game.round_number ?? 1}
          </div>
          {game.status === "in_progress" && (
            <div className={`mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${remaining <= 5 ? "bg-destructive/30 text-white animate-pulse" : "bg-black/30 text-[#ffe27a]"}`}>
              <Clock className="w-3 h-3" /> {remaining}s
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 min-w-0">
          <div className="min-w-0 text-right">
            <div className={`truncate text-sm font-extrabold ${game.current_turn && opponents.some(o => o.id === game.current_turn) ? "text-[#ffe27a]" : "text-white/90"}`}>
              {opponents[0]?.name ?? "Opponent"}
            </div>
            <div className="text-[10px] text-[#ffe27a]/70 truncate">
              {opponents.length > 1
                ? opponents.map(o => `${scoreOf(o.id)}`).join(" · ")
                : `Score ${scoreOf(opponents[0]?.id ?? "")}`}
            </div>
          </div>
          {opponents[0] && (profilePhotos[opponents[0].id] ? (
            <img
              src={profilePhotos[opponents[0].id] as string}
              alt={opponents[0].name}
              onClick={() => setZoomedPhoto(profilePhotos[opponents[0].id] as string)}
              className="w-11 h-11 rounded-full object-cover border-2 border-[#ffe27a]/70 shadow cursor-pointer active:scale-95 transition"
            />
          ) : (
            <div className="w-11 h-11 rounded-full bg-[#ffe27a]/20 border-2 border-[#ffe27a]/70 flex items-center justify-center text-sm font-bold text-[#ffe27a]">
              {(opponents[0].name?.[0] ?? "?").toUpperCase()}
            </div>
          ))}
          <Button variant="ghost" size="icon" className="h-8 w-8 text-[#ffe27a] hover:bg-[#ffffff10]" onClick={() => nav("/")}>
            <HomeIcon className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {game.status === "in_progress" && (
        <div className="px-3 py-2 bg-destructive/10 border-b border-destructive/30 flex justify-center">
          <Button
            variant="destructive"
            size="sm"
            className="w-full max-w-xs gap-2 font-bold shadow-lg"
            onClick={() => setConfirmAbandon(true)}
            disabled={isAbandoning}
          >
            {isAbandoning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
            {isAbandoning ? "Tapitra ny lalao..." : "Abandonné — Hiala amin'ny lalao"}
          </Button>
        </div>
      )}

      <AlertDialog open={confirmAbandon} onOpenChange={setConfirmAbandon}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Tena hiala amin'ny lalao tokoa?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block font-semibold text-destructive">
                Tandremo: raha hiala ianao izao dia:
              </span>
              <span className="block">• Ho <b>RESY avy hatrany</b> ianao</span>
              <span className="block">• <b>HO VERY ny vola napetrakao</b> rehetra (mise)</span>
              <span className="block">• Ny adversaire no handresy ka hahazo ny gain</span>
              <span className="block pt-1 text-xs italic">
                Mieritrereta tsara alohan'ny hanamafisana.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { setConfirmAbandon(false); abandonGame(); }}
            >
              OK — Hiala ihany
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!zoomedPhoto} onOpenChange={(o) => !o && setZoomedPhoto(null)}>
        <DialogContent
          className="max-w-[92vw] sm:max-w-md p-0 bg-transparent border-0 shadow-none"
          onClick={() => setZoomedPhoto(null)}
        >
          {zoomedPhoto && (
            <img
              src={zoomedPhoto}
              alt="Profil"
              className="w-full h-auto rounded-xl object-contain animate-scale-in cursor-zoom-out border-4 border-[#ffe27a]/70 shadow-2xl"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* TSIMANANA banner nesorina — tsy mibahana intsony, indikatera kely fotsiny ao amin'ny tanana */}

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
          {/* Tanan'ny adversaire — split-screen raha 2 na 3 mpilalao adversaire */}
          <div className={`p-2 ${opponents.length >= 2 ? "grid grid-cols-2 gap-2" : "flex flex-col"}`}>
            {opponents.map((o) => {
              const isTurn = game.current_turn === o.id;
              const initial = (o.name?.[0] ?? "?").toUpperCase();
              const photo = profilePhotos[o.id];
              return (
                <div
                  key={o.id}
                  className={`flex flex-col items-center gap-1 rounded-xl p-2 border ${
                    isTurn ? "border-primary bg-primary/10 shadow-[0_0_16px_-4px_hsl(var(--primary)/.5)]" : "border-primary/15 bg-card/30"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {photo ? (
                      <img
                        src={photo}
                        alt={o.name}
                        onClick={() => setZoomedPhoto(photo)}
                        className={`w-9 h-9 rounded-full object-cover border-2 cursor-pointer active:scale-95 transition ${isTurn ? "border-primary" : "border-primary/30"}`}
                      />
                    ) : (
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${isTurn ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                        {initial}
                      </div>
                    )}
                    <span className={`text-[11px] font-bold ${isTurn ? "gold-text" : "text-foreground/80"}`}>
                      {isTurn ? "▶ " : ""}{o.name}
                      <span className="text-muted-foreground"> ({o.count})</span>
                    </span>
                  </div>
                  <div className="flex justify-center gap-0.5 overflow-x-auto max-w-full">
                    {isRevealing
                      ? o.hand.map((t, i) => (
                          <DominoTile key={i} a={t[0]} b={t[1]} size="xs" horizontal={t[0] !== t[1]} />
                        ))
                      : Array.from({ length: o.count }).map((_, i) => (
                          <DominoBack key={i} size="xs" />
                        ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Latabatra — felt poker, snake path mihodina amin'ny sisiny */}
          <div className="relative flex-1 px-3 py-3 min-h-[260px]">
            {/* Floating side action buttons */}
            <RadioPlayer />
            <button
              type="button"
              className="fab-circle absolute left-2 top-1/2 -translate-y-1/2 z-20"
              title="Pizza"
              onClick={() => sfx.move()}
            >
              <Pizza className="w-6 h-6" />
            </button>
            <button
              type="button"
              className="fab-circle absolute right-2 top-1/2 -translate-y-1/2 z-20"
              title="Rabbit"
              onClick={() => sfx.move()}
            >
              <Rabbit className="w-6 h-6" />
            </button>

            <div className="felt-board relative w-full h-full min-h-[240px] mx-auto overflow-hidden">
              {board.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  {game.player2_id ? (
                    <p className="text-sm text-[#ffe27a]/80 italic text-center px-4">
                      {isMyTurn ? "Apetraho ny piesy voalohany" : "Miandry ny adversaire..."}
                    </p>
                  ) : (
                    <p className="text-sm text-[#ffe27a]/80 italic text-center px-4">
                      Miandry adversaire hiditra hanomboka ny lalao...
                    </p>
                  )}
                </div>
              ) : (
                <SnakeBoard board={board} tileSize={boardTileSize as "xs" | "sm"} />
              )}

              {selected !== null && isMyTurn && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-2 z-10 flex items-center gap-2 bg-black/40 px-2 py-1 rounded-lg backdrop-blur-sm">
                  <span className="text-[10px] text-[#ffe27a]">Voafidy:</span>
                  <DominoTile
                    a={myHand[selected][0]}
                    b={myHand[selected][1]}
                    size="xs"
                    horizontal={myHand[selected][0] !== myHand[selected][1]}
                    variant="white"
                  />
                </div>
              )}
            </div>
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
                {isMyTurn ? `▶ ${myName} — andiany!` : `${myName} (${myHand.length})`}
              </span>
              {noMove && (
                <span className="text-[10px] text-muted-foreground italic">Pass auto…</span>
              )}
            </div>
            <div className="grid grid-cols-7 gap-1 py-2 px-1 w-full">
              {myHand.map((t, i) => {
                const placeable = canPlace(board, t) !== null;
                return (
                  <DominoTile
                    key={i}
                    a={t[0]}
                    b={t[1]}
                    size={handTileSize}
                    fluid
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
