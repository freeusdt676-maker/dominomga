import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Home as HomeIcon, Clock, Flag, LogOut } from "lucide-react";
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
import { fmtAr } from "@/lib/constants";
// Domino: tour mandritra 20 segondra (tsy mitovy amin'ny Ludo izay 10s)
const TURN_TIMEOUT_SEC = 20;
import { DominoTile, DominoBack } from "@/components/DominoTile";
import { SnakeBoard } from "@/components/SnakeBoard";
import { useThemeClass } from "@/hooks/use-theme-class";
import { RadioPlayer } from "@/components/RadioPlayer";
import { GameChat } from "@/components/GameChat";
import LudoVoiceChat from "@/components/LudoVoiceChat";
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
  useThemeClass("domino");
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
  const endgameLockRef = useRef<string | null>(null);
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
    reasonOverride?: string,
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
    // "Tonga X nandeha irery" — nahatratra antsasaky ny target nefa 0 ihany hatrany ny adversaire rehetra.
    const otherScores = pc === 3
      ? [
          winnerId !== game.player1_id ? newScoreP1 : null,
          winnerId !== game.player2_id ? newScoreP2 : null,
          winnerId !== game.player3_id ? newScoreP3 : null,
        ].filter((s) => s !== null) as number[]
      : [
          winnerId !== game.player1_id ? newScoreP1 : null,
          winnerId !== game.player2_id ? newScoreP2 : null,
        ].filter((s) => s !== null) as number[];
    const opponentsAllZero = otherScores.every((s) => Number(s ?? 0) === 0);
    const half = target !== null ? Math.floor(target / 2) : null;
    const aloneReached =
      half !== null && wScore >= half && wScore < (target ?? Infinity) && opponentsAllZero;
    const dateMatch = points > 0 && points === today;
    const handMode = mode === "hand";
    const instantWin = isDouble6Win || dateMatch || handMode || targetReached || aloneReached;

    // Build a human-readable "porofo" of how this round was won, for the replay banner.
    const winnerName = (profileNames[winnerId] ?? "Mpandresy");
    // Anaran'ny mpilalao resy (raha mpilalao 2)
    const loserIds = (pc === 3
      ? [game.player1_id, game.player2_id, game.player3_id]
      : [game.player1_id, game.player2_id]
    ).filter((id) => id && id !== winnerId);
    const loserName = loserIds.length === 1
      ? (profileNames[loserIds[0]!] ?? "Mpilalao")
      : loserIds.map((id) => profileNames[id!] ?? "Mpilalao").join(" sy ");
    let reason: string = reasonOverride
      ?? (isDouble6Win
        ? `${loserName} maty satria niala double 6 (paire de six) — ${winnerName} +${points}`
        : dateMatch
          ? `${loserName} maty satria datin'andro ${today} — ${winnerName} +${points}`
          : handMode
            ? `${loserName} maty atànana — ${winnerName} +${points}`
            : targetReached
              ? `${winnerName} tonga ${target} • Mpandresy ny lalao`
              : points > 0
                ? `${loserName} maty satria lany ny vaton'i ${winnerName} (+${points} vato sisa)`
                : `${winnerName} mpandresy ny tour`);
    if (aloneReached && !targetReached) {
      reason = `${winnerName} tonga ${wScore} nandeha irery (target ${target}) • ${loserName} mbola 0`;
    }

    const REVEAL_MS = 5000;
    const revealUntil = new Date(Date.now() + REVEAL_MS).toISOString();
    setRoundBanner(
      pc === 3
        ? `${reason} • ${newScoreP1}-${newScoreP2}-${newScoreP3}`
        : `${reason} • ${newScoreP1} - ${newScoreP2}`,
    );
    setTimeout(() => setRoundBanner(null), REVEAL_MS + 500);
    const updatePayload: any = {
      score_p1: newScoreP1,
      score_p2: newScoreP2,
      reveal_until: revealUntil,
      last_reason: reason,
      // Vonoy ny tour mandritra ny reveal mba tsy hisy fihetsika afaka atao
      // alohan'ny hidiran'ny tour manaraka.
      current_turn: null,
      turn_started_at: null,
      passes: 0,
    };
    if (pc === 3) updatePayload.score_p3 = newScoreP3;
    await supabase.from("games").update(updatePayload).eq("id", game.id);
    setOptimistic(null);

    setTimeout(async () => {
      if (instantWin) {
        // Tsy misy bokotra "Continuer" intsony: tonga dia mamarana ny lalao raha tratra ny target,
        // miala 6/6, datinandro, na "tonga antsasaka irery". Ny écran fandresena dia mamerina
        // automatique any amin'ny lobby aorian'ny 5s.
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
      // Tour 2+: tsy misy double terena, ny topon'ny tour no mametraka izay tiany.
      // Mihodina automatique makany ANKAVIA isaky ny tour.
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
    const winnerName = (profileNames[winnerId] ?? "Mpandresy");
    const loserIds = totals.slice(1).map((x) => x.id);
    const loserName = loserIds
      .map((id) => profileNames[id] ?? "Mpilalao")
      .join(" sy ");
    await finishRound(
      winnerId,
      points,
      null,
      `${loserName} maty satria bloqué (vato lehibe kokoa) — ${winnerName} +${points}`,
    );
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

  useEffect(() => {
    const syncNow = () => setNow(Date.now());
    document.addEventListener("visibilitychange", syncNow);
    window.addEventListener("focus", syncNow);
    return () => {
      document.removeEventListener("visibilitychange", syncNow);
      window.removeEventListener("focus", syncNow);
    };
  }, []);

  useEffect(() => {
    if (!id || !game || game.status !== "in_progress") return;
    const markAbandoned = () => {
      if (document.visibilityState === "hidden") {
        sessionStorage.setItem(ABANDONED_GAME_KEY, id);
      }
    };
    document.addEventListener("visibilitychange", markAbandoned);
    return () => document.removeEventListener("visibilitychange", markAbandoned);
  }, [id, game?.status]);

  useEffect(() => {
    if (!id || !game) return;
    if (game.status === "finished" || game.status === "cancelled" || game.status === "blocked") {
      const stored = getAbandonedGameId();
      if (stored === id) sessionStorage.removeItem(ABANDONED_GAME_KEY);
    }
  }, [game?.status, id]);

  // Endgame vote resolver — kicks in once both players have voted (2-player only).
  useEffect(() => {
    if (!game) return;
    if (game.status !== "in_progress") return;
    if (Number(game.players_count ?? 2) !== 2) return;
    const votes = game.endgame_votes as Record<string, "continue" | "stop"> | null | undefined;
    if (!votes) return;
    const ids = [game.player1_id, game.player2_id].filter(Boolean) as string[];
    const allVoted = ids.every((id) => votes[id] === "continue" || votes[id] === "stop");
    if (!allVoted) return;
    const key = `${game.id}-r${game.round_number ?? 1}-endvote`;
    if (endgameLockRef.current === key) return;
    // Only the host (player1) commits the resolution to avoid double-writes.
    if (user?.id !== game.player1_id) return;
    endgameLockRef.current = key;
    (async () => {
      const stopper = ids.find((id) => votes[id] === "stop");
      if (stopper) {
        const winner = ids.find((id) => id !== stopper) as string;
        await supabase.rpc("settle_game", { _game_id: game.id, _winner: winner });
        return;
      }
      // Both continue → reset scores and start a fresh round
      const nextRound = (game.round_number ?? 1) + 1;
      const seed = `${game.ticket_number || game.id}-r${nextRound}`;
      const d = deal(seed);
      const mode = (game.game_mode ?? "d120") as GameMode;
      const opener = chooseOpening([d.p1, d.p2], mode);
      const hands = [d.p1, d.p2];
      let board: Placed[] = [];
      let nextId = ids[opener.playerIndex];
      if (opener.forced) {
        hands[opener.playerIndex] = hands[opener.playerIndex].filter(
          (t) => !(t[0] === opener.tile[0] && t[1] === opener.tile[1]),
        );
        board = [{ tile: opener.tile, flipped: false }];
        nextId = ids[(opener.playerIndex + 1) % ids.length];
      }
      await supabase.from("games").update({
        round_number: nextRound,
        score_p1: 0,
        score_p2: 0,
        player1_hand: hands[0],
        player2_hand: hands[1],
        boneyard: d.boneyard,
        board_state: board,
        current_turn: nextId,
        turn_started_at: new Date().toISOString(),
        passes: 0,
        endgame_votes: null,
        reveal_until: null,
      }).eq("id", game.id);
    })();
  }, [game?.endgame_votes, game?.status, game?.id, user?.id]);

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

  const handleTileTap = (idx: number) => {
    if (!isMyTurn) return;
    const tile = myHand[idx];
    const possible = canPlace(board, tile);
    if (!possible) return;
    if (possible === "either" && board.length > 0) {
      setSelected(idx);
      return;
    }
    setSelected(null);
    void tryPlay(idx, possible === "left" || possible === "right" ? possible : undefined);
  };

  const autoPass = async () => {
    if (!isMyTurn || !game || !user) return;
    // Raha lany ny vato (vita ny tour) dia tsy mandalo mihitsy — andraso ny tour vaovao.
    if (myHand.length === 0) return;
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
  useEffect(() => {
    if (!game || !user) return;
    if (game.status !== "in_progress") return;
    if (!game.current_turn) return;
    if (isRevealing) return;
    if (elapsed < TURN_TIMEOUT_SEC) return;
    const key = `${game.id}-${game.turn_started_at}-${game.current_turn}`;
    if (autoActedRef.current === key) return;
    autoActedRef.current = key;

    (async () => {
      const { data: fresh, error } = await supabase.from("games").select("*").eq("id", game.id).single();
      if (error || !fresh) throw error ?? new Error("game_refresh_failed");
      if (fresh.status !== "in_progress") return;
      if (!fresh.current_turn || fresh.turn_started_at !== game.turn_started_at) return;

      const liveBoard: Placed[] = (fresh.board_state as Placed[]) ?? [];
      const turnId = fresh.current_turn as string;
      const turnKey = getHandKey(fresh, turnId) as "player1_hand" | "player2_hand" | "player3_hand" | null;
      if (!turnKey) return;
      const turnHand: Tile[] = ((fresh[turnKey] as Tile[]) ?? []) as Tile[];
      const oppId = nextTurnId(fresh, turnId);
      const pc = Number(fresh.players_count ?? 2);

      const playableIdx = turnHand.findIndex((t) => canPlace(liveBoard, t) !== null);
      if (playableIdx >= 0) {
        const tile = turnHand[playableIdx];
        const can = canPlace(liveBoard, tile);
        const chosenSide: "left" | "right" = can === "left" ? "left" : can === "right" ? "right" : "right";
        const newBoard = place(liveBoard, tile, chosenSide);
        const newHand = turnHand.filter((_, i) => i !== playableIdx);
        if (newHand.length === 0) {
          await updateGameState({
            board_state: newBoard,
            [turnKey]: newHand,
          } as any);
          const otherIds = getPlayerIds(fresh).filter((x) => x !== turnId);
          const otherTiles: Tile[] = otherIds.flatMap((id) => {
            const k = getHandKey(fresh, id) as any;
            return (fresh[k] as Tile[]) ?? [];
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
      const { error: moveLogError } = await supabase.from("game_moves").insert({
        game_id: game.id,
        player_id: turnId,
        piece: { tile, auto: true },
        side: chosenSide,
      });
      if (moveLogError) {
        console.warn("auto move log failed", moveLogError);
      }
        return;
      }
      const passes = (fresh.passes ?? 0) + 1;
      if (passes >= pc) {
        await finishBlocked();
        return;
      }
      await updateGameState({
        current_turn: oppId,
        turn_started_at: new Date().toISOString(),
        passes,
      });
    })().catch(() => {
      autoActedRef.current = null;
    });
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

  useEffect(() => {
    if (selected === null) return;
    if (!isMyTurn || !myHand[selected]) {
      setSelected(null);
      return;
    }
    if (canPlace(board, myHand[selected]) !== "either") {
      setSelected(null);
    }
  }, [selected, isMyTurn, myHand, board]);

  if (!game) return <div className="min-h-screen felt-bg flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  const e = ends(board);
  const selectedPlacement = selected !== null && myHand[selected] ? canPlace(board, myHand[selected]) : null;
  const canLeft = selectedPlacement === "left" || selectedPlacement === "either";
  const canRight = selectedPlacement === "right" || selectedPlacement === "either";
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

  const submitEndgameVote = async (choice: "continue" | "stop") => {
    if (!game || !user) return;
    const votes = (game.endgame_votes as Record<string, "continue" | "stop"> | null) ?? {};
    if (votes[user.id]) return; // already voted
    const next = { ...votes, [user.id]: choice };
    await supabase.from("games").update({ endgame_votes: next }).eq("id", game.id);
  };

  const endgameVotes = (game?.endgame_votes as Record<string, "continue" | "stop"> | null) ?? null;
  const showEndgameVote =
    !!endgameVotes &&
    game?.status === "in_progress" &&
    Number(game?.players_count ?? 2) === 2;
  const myVote = endgameVotes && user ? endgameVotes[user.id] : undefined;

  // Sary kely kokoa amin'ny mobile mba tsy hifanaikitra
  const handTileSize = isMobile ? "md" : "lg";
  const boardTileSize = isMobile ? "sm" : "md";
  const firstBoardTile = board.length === 1 ? board[0] : null;
  const firstBoardA = firstBoardTile ? (firstBoardTile.flipped ? firstBoardTile.tile[1] : firstBoardTile.tile[0]) : null;
  const firstBoardB = firstBoardTile ? (firstBoardTile.flipped ? firstBoardTile.tile[0] : firstBoardTile.tile[1]) : null;

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

      {/* Tableau ny score — mazava sy ngeza */}
      {game.status === "in_progress" && (
        <div className="px-3 py-2 bg-[#0a2818] border-b-2 border-[#d4a52c]/50">
          <div className="max-w-md mx-auto">
            <div className="text-center text-[10px] uppercase tracking-[0.25em] text-[#ffe27a]/70 mb-1 font-bold">
              SCORE {targetPts ? `(Tanjona ${targetPts})` : ""}
            </div>
            <div className={`grid ${playersCount === 3 ? "grid-cols-3" : "grid-cols-2"} gap-2`}>
              {[user?.id ?? "", ...opponents.map(o => o.id)].map((pid) => {
                const isMe = pid === user?.id;
                const name = isMe ? myName : (profileNames[pid] ?? "Mpilalao");
                const sc = scoreOf(pid);
                const pct = targetPts ? Math.min(100, Math.round((sc / targetPts) * 100)) : 0;
                const isTurn = game.current_turn === pid;
                return (
                  <div
                    key={pid}
                    className={`rounded-lg p-2 border-2 ${isTurn ? "border-[#ffe27a] bg-[#d4a52c]/15 shadow-[0_0_12px_rgba(255,226,122,0.3)]" : "border-[#d4a52c]/30 bg-black/30"}`}
                  >
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-[11px] font-bold text-[#ffe27a]/90 truncate">{name}</span>
                      <span className="text-2xl font-black gold-text leading-none tabular-nums">{sc}</span>
                    </div>
                    {targetPts && (
                      <div className="mt-1 h-1.5 bg-black/50 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-[#d4a52c] to-[#ffe27a] transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {game.status === "in_progress" && (
        <button
          type="button"
          onClick={() => setConfirmAbandon(true)}
          disabled={isAbandoning}
          className="fixed top-2 right-2 z-30 w-8 h-8 rounded-full bg-destructive/75 text-destructive-foreground flex items-center justify-center shadow backdrop-blur active:scale-95 disabled:opacity-50"
          title="Hiala amin'ny lalao"
          aria-label="Hiala amin'ny lalao"
        >
          {isAbandoning ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
        </button>
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

      {/* Endgame vote — Mbola hanohy / Tsy hanohy (target tratra) */}
      <AlertDialog open={showEndgameVote}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>🏁 Tratra ny target — Mbola hanohy ve?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Tratra ny <b>{targetPts}</b> point. Samy mifidy ianareo:
              </span>
              <span className="block">• <b>Mbola hanohy</b> — averina amin'ny 0-0 ny score, mitohy ny lalao.</span>
              <span className="block">• <b>Tsy hanohy</b> — <span className="text-destructive font-bold">ho resy avy hatrany</span> ilay nifidy izany; ny adversaire no handresy sy hahazo ny gain.</span>
              {myVote && (
                <span className="block pt-2 italic text-xs">
                  Voarakitra ny safidinao: <b>{myVote === "continue" ? "Mbola hanohy" : "Tsy hanohy"}</b>. Miandry ny adversaire…
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              disabled={!!myVote}
              onClick={() => submitEndgameVote("stop")}
              className="border-destructive text-destructive hover:bg-destructive/10"
            >
              Tsy hanohy
            </Button>
            <Button
              disabled={!!myVote}
              onClick={() => submitEndgameVote("continue")}
              className="btn-gold"
            >
              Mbola hanohy
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
          <div className="relative flex-1 px-3 py-3 min-h-[300px]">
            {/* Floating side action buttons */}
            <RadioPlayer />
            {id && <GameChat gameId={id} names={profileNames} />}
            {id && game?.status === "in_progress" && (
              <div className="absolute left-1/2 -translate-x-1/2 -top-1 z-30">
                <LudoVoiceChat gameId={id} />
              </div>
            )}

            <div className="felt-board relative w-full h-full min-h-[280px] mx-auto overflow-hidden">
              <div className="domino-arena absolute inset-[10px] rounded-[1rem]" aria-hidden="true" />
              {board.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center px-4">
                  {game.player2_id ? (
                    <div className="flex flex-col items-center gap-2 text-center">
                      {/* Big bouncing arrow pointing down to exact drop spot */}
                      <span className="text-4xl text-primary animate-bounce drop-shadow-[0_0_10px_rgba(212,165,44,0.9)]">⬇</span>
                      {/* Exact placeholder where the first tile will land */}
                      <div className="relative flex h-16 w-28 items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/15 shadow-[0_0_32px_rgba(212,165,44,0.5)] animate-pulse">
                        <div className="h-10 w-20 rounded-md border border-primary/70 bg-primary/10" />
                        <span className="absolute inset-0 rounded-lg ring-2 ring-primary/40 animate-ping" />
                      </div>
                      <p className="text-xs text-[#ffe27a] italic font-semibold tracking-wide">
                        {isMyTurn ? "ETO no asiana ny vato voalohany" : "Eto no hapetraky ny adversaire ny vato voalohany"}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-[#ffe27a]/80 italic text-center px-4">
                      Miandry adversaire hiditra hanomboka ny lalao...
                    </p>
                  )}
                </div>
              ) : firstBoardTile && firstBoardA !== null && firstBoardB !== null ? (
                <div className="absolute inset-0 flex items-center justify-center p-4">
                  <div className="domino-first-tile-stage animate-scale-in">
                    <DominoTile
                      a={firstBoardA}
                      b={firstBoardB}
                      size={isMobile ? "xl" : "xl"}
                      horizontal={firstBoardA !== firstBoardB}
                      variant="white"
                    />
                  </div>
                </div>
              ) : (
                <div className="absolute inset-[10px]">
                  <SnakeBoard board={board} tileSize={boardTileSize as "sm" | "md"} />
                </div>
              )}

              {selected !== null && isMyTurn && (canLeft || canRight) && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-2 z-10 flex items-center gap-2 bg-black/40 px-2 py-1 rounded-lg backdrop-blur-sm">
                  <span className="text-[10px] text-[#ffe27a]">Voafidy:</span>
                  <DominoTile
                    a={myHand[selected][0]}
                    b={myHand[selected][1]}
                    size="xs"
                    horizontal={myHand[selected][0] !== myHand[selected][1]}
                    variant="white"
                  />
                  <button
                    type="button"
                    onClick={() => void tryPlay(selected, "left")}
                    disabled={!canLeft}
                    className="px-2 py-1 rounded-md text-[10px] font-bold bg-[#d4a52c] text-[#0a2818] disabled:opacity-40"
                  >
                    Akavia
                  </button>
                  <button
                    type="button"
                    onClick={() => void tryPlay(selected, "right")}
                    disabled={!canRight}
                    className="px-2 py-1 rounded-md text-[10px] font-bold bg-[#d4a52c] text-[#0a2818] disabled:opacity-40"
                  >
                    Akavanana
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Tap-to-play: tsy misy bokotra fanamafisana intsony */}

          {/* Tanako — lehibe sy mazava, mifanesy */}
          <div className="border-t-2 border-primary/30 bg-card/30 p-3">
            <div className="flex items-center justify-between mb-2 px-1 gap-2">
              <span className={`text-xs font-bold ${isMyTurn ? "gold-text" : "text-muted-foreground"}`}>
                {isMyTurn ? `▶ ${myName} — andiany!` : `${myName} (${myHand.length})`}
              </span>
              {isMyTurn && (
                <button
                  type="button"
                  onClick={() => { if (noMove) void autoPass(); }}
                  disabled={!noMove}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-extrabold uppercase tracking-wider border-2 transition active:scale-95 ${
                    noMove
                      ? "bg-destructive text-destructive-foreground border-destructive shadow-[0_0_12px_rgba(239,68,68,0.6)] animate-pulse"
                      : "bg-black/30 text-muted-foreground border-muted-foreground/30 opacity-50 cursor-not-allowed"
                  }`}
                  title={noMove ? "Tsindrio mba handalo any amin'ny adversaire" : "Mbola manana vato azo apetraka ianao"}
                >
                  {noMove ? "⏭ Pass" : "Pass"}
                </button>
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
                    onClick={() => isMyTurn && placeable && handleTileTap(i)}
                    selected={selected === i}
                    disabled={!isMyTurn || !placeable}
                  />
                );
              })}
            </div>
          </div>
        </>
      )}

      {(game.status === "finished" || game.status === "blocked" || game.status === "cancelled") && (() => {
        const stake = Number(game.stake ?? 0);
        const pc = Number(game.players_count ?? 2);
        const commissionEach = Math.round(stake * 0.10);
        const pot = (stake - commissionEach) * pc;
        const netGain = pot - stake;
        const iWon = game.winner_id === user?.id;
        const draw = !game.winner_id;
        const winnerName = game.winner_id ? (profileNames[game.winner_id] ?? "Mpandresy") : "";
        const myScoreNow = scoreOf(user?.id ?? "");
        const reasonText: string = (game as any).last_reason ?? "";
        return (
          <DominoResultOverlay
            draw={draw}
            iWon={iWon}
            netGain={netGain}
            pot={pot}
            stake={stake}
            winnerName={winnerName}
            reasonText={reasonText}
            myScore={myScoreNow}
            onDone={() => nav("/lobby", { replace: true })}
          />
        );
      })()}
    </div>
  );
}

function DominoResultOverlay({
  draw, iWon, netGain, pot, stake, winnerName, reasonText, myScore, onDone,
}: {
  draw: boolean; iWon: boolean; netGain: number; pot: number; stake: number;
  winnerName: string; reasonText: string; myScore: number; onDone: () => void;
}) {
  const [count, setCount] = useState(5);
  useEffect(() => {
    sfx.win?.();
    const t = setInterval(() => setCount((c) => Math.max(0, c - 1)), 1000);
    const done = setTimeout(onDone, 5000);
    return () => { clearInterval(t); clearTimeout(done); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dust = Array.from({ length: 80 }, (_, i) => i);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm overflow-hidden">
      {iWon && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {dust.map((i) => {
            const left = Math.random() * 100;
            const dur = 2.2 + Math.random() * 2.6;
            const delay = Math.random() * 1.5;
            const size = 4 + Math.random() * 6;
            return (
              <span
                key={i}
                className="gold-dust"
                style={{ left: `${left}%`, width: `${size}px`, height: `${size}px`, animationDuration: `${dur}s`, animationDelay: `${delay}s` }}
              />
            );
          })}
        </div>
      )}
      <div className={`domino-win-pop relative w-[92%] max-w-md text-center rounded-3xl p-7 border-4 shadow-2xl ${
        draw ? "border-yellow-400 bg-gradient-to-br from-amber-600 to-yellow-800"
        : iWon ? "border-green-300 bg-gradient-to-br from-green-500 via-emerald-500 to-green-700 shadow-[0_0_80px_rgba(34,197,94,0.85)]"
        : "border-red-300 bg-gradient-to-br from-red-500 via-rose-600 to-red-800 shadow-[0_0_80px_rgba(239,68,68,0.75)]"
      }`}>
        {draw ? (
          <>
            <p className="text-5xl mb-2">🤝</p>
            <p className="font-display text-3xl font-black text-white">Lalao tapaka</p>
          </>
        ) : iWon ? (
          <>
            <p className="text-6xl mb-2">🏆</p>
            <p className="font-display text-4xl font-black text-green-50 domino-win-glow tracking-wide">
              Arabaina nandresy ianao!
            </p>
            <p className="font-display text-xl font-bold text-yellow-100 mt-3">
              Ianao no nahatratra ny isa <b className="text-yellow-200">{myScore}</b>
            </p>
            <div className="mt-4 inline-flex flex-col items-center rounded-2xl bg-black/30 px-5 py-3 border border-yellow-200/40">
              <p className="text-xs text-yellow-100/80">Gain</p>
              <p className="font-display text-3xl font-black text-yellow-200 drop-shadow-lg">+{fmtAr(netGain)}</p>
              <p className="text-[11px] text-yellow-100/70">(Pot azo: {fmtAr(pot)})</p>
            </div>
          </>
        ) : (
          <>
            <p className="text-5xl mb-2">💔</p>
            <p className="font-display text-3xl font-black text-white">Resy ianao</p>
            <p className="text-sm text-white/90 mt-2">
              {reasonText
                ? <>Resy ianao satria <b>{reasonText}</b></>
                : winnerName
                  ? <>Resy ianao satria nandresy <b>{winnerName}</b></>
                  : null}
            </p>
            <p className="font-display text-2xl font-black text-yellow-100 mt-3">-{fmtAr(stake)}</p>
            <p className="text-[11px] text-white/80">(very ny mise napetrakao)</p>
          </>
        )}
        <p className="text-[11px] text-white/80 mt-4 italic">Hiverina amin'ny lobby afaka {count}s…</p>
      </div>
    </div>
  );
}
