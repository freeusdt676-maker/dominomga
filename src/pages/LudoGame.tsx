import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, ChevronDown, RefreshCw } from "lucide-react";
import LudoBoard from "@/components/LudoBoard";
import LudoDice3D from "@/components/LudoDice3D";
import {
  activeSeats, applyMove, legalMoves, rollBalancedDice, seatHasFinished,
  SEAT_COLOR, SEAT_NAME, nextSeatFromList, pawnXY, type Pawn,
} from "@/lib/ludoEngine";
import { fmtAr } from "@/lib/constants";
import { sfx } from "@/lib/sfx";
import { toast } from "sonner";
import { GameChat } from "@/components/GameChat";
import LudoVoiceChat from "@/components/LudoVoiceChat";
import { useThemeClass } from "@/hooks/use-theme-class";

type LG = {
  id: string;
  players_count: number;
  stake: number;
  status: string;
  player1_id: string;
  player2_id: string | null;
  player3_id: string | null;
  player4_id: string | null;
  current_turn_seat: number;
  last_dice: number | null;
  dice_rolled: boolean;
  consecutive_sixes: number;
  pawns: Pawn[];
  winner_id: string | null;
  ticket_number: string | null;
  turn_started_at: string | null;
  seat_assignment: number[] | null;
  updated_at: string;
};

const TURN_LIMIT = 10;
const MOVE_ANIMATION_MS = 520;
const BLOCKER_SAFETY_MS = 8000;
const STEP_ANIMATION_MS = 180; // per-cell hop for pawn walking animation (smooth pro feel)

function normalizeGame(raw: any): LG {
  return {
    ...raw,
    pawns: Array.isArray(raw?.pawns)
      ? raw.pawns.map((p: any) => ({ ...p, pos: Number(p?.pos) < 0 ? 0 : Number(p?.pos) }))
      : [],
    seat_assignment: Array.isArray(raw?.seat_assignment)
      ? raw.seat_assignment.map((seat: any) => Number(seat))
      : null,
  } as LG;
}

export default function LudoGame() {
  useThemeClass("ludo");
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const ABANDONED_GAME_KEY = "ludo_abandoned_game_id";
  const [g, setG] = useState<LG | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [rollAnimSeat, setRollAnimSeat] = useState<number | null>(null);
  const [poofs, setPoofs] = useState<Array<{ id: string; x: number; y: number }>>([]);
  const [acting, setActing] = useState(false);
  const lastPawnsRef = useRef<Pawn[]>([]);
  const loadSeqRef = useRef(0);
  const rollAnimResetRef = useRef<number | null>(null);
  const autoResolveRef = useRef<number | null>(null);
  const blockerSafetyRef = useRef<number | null>(null);
  const phaseKeyRef = useRef<string | null>(null);
  const botActedRef = (typeof window !== "undefined" ? (window as any) : {}) as any;

  const clearRefTimeout = (ref: { current: number | null }) => {
    if (ref.current !== null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  };

  const clearUiBlockers = () => {
    clearRefTimeout(rollAnimResetRef);
    clearRefTimeout(autoResolveRef);
    clearRefTimeout(blockerSafetyRef);
    setRolling(false);
    setActing(false);
    setRollAnimSeat(null);
  };

  useEffect(() => {
    if (!id) return;
    const markAbandoned = () => {
      if (document.visibilityState === "hidden") {
        sessionStorage.setItem(ABANDONED_GAME_KEY, id);
      }
    };
    const markActive = () => {
      if (document.visibilityState === "visible") {
        sessionStorage.removeItem(ABANDONED_GAME_KEY);
      }
    };
    document.addEventListener("visibilitychange", markAbandoned);
    window.addEventListener("focus", markActive);
    return () => {
      document.removeEventListener("visibilitychange", markAbandoned);
      window.removeEventListener("focus", markActive);
    };
  }, [id]);

  const armSafetyRelease = () => {
    clearRefTimeout(blockerSafetyRef);
    blockerSafetyRef.current = window.setTimeout(() => {
      setRolling(false);
      setActing(false);
      setRollAnimSeat(null);
    }, BLOCKER_SAFETY_MS);
  };

  const hydrateProfiles = async (game: Partial<LG>) => {
    const ids = [game.player1_id, game.player2_id, game.player3_id, game.player4_id].filter(Boolean) as string[];
    if (!ids.length) return;
    const { data: ps } = await supabase.from("profiles").select("user_id, mvola_name, avatar_url").in("user_id", ids);
    if (!ps?.length) return;
    const nextNames: Record<string, string> = {};
    const nextAvatars: Record<string, string | null> = {};
    ps.forEach((p: any) => {
      nextNames[p.user_id] = p.mvola_name;
      nextAvatars[p.user_id] = p.avatar_url ?? null;
    });
    setNames((prev) => ({ ...prev, ...nextNames }));
    setAvatars((prev) => ({ ...prev, ...nextAvatars }));
  };

  const applyIncomingGame = (raw: any, forceUnlock = false) => {
    const next = normalizeGame(raw);
    const nextPhaseKey = [
      next.status,
      next.current_turn_seat,
      next.dice_rolled ? "move" : "roll",
      next.turn_started_at ?? "na",
      next.last_dice ?? "na",
      next.updated_at ?? "na",
    ].join(":");
    if (forceUnlock || phaseKeyRef.current !== nextPhaseKey) {
      phaseKeyRef.current = nextPhaseKey;
      clearUiBlockers();
    }
    setLoadError(null);
    setG(next);
    hydrateProfiles(next).catch(() => undefined);
  };

  const load = async (forceUnlock = false) => {
    if (!id) return;
    const seq = ++loadSeqRef.current;
    const { data, error } = await supabase.from("ludo_games" as any).select("*").eq("id", id).single();
    if (seq !== loadSeqRef.current) return;
    if (error || !data) {
      setLoadError(error?.message ?? "Tsy hita ny lalao");
      return;
    }
    applyIncomingGame(data, forceUnlock);
  };

  useEffect(() => {
    load(true);
    if (!id) return;
    const ch = supabase.channel(`ludo-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ludo_games", filter: `id=eq.${id}` }, (payload: any) => {
        if (payload.new) {
          applyIncomingGame(payload.new);
          return;
        }
        load(true);
      })
      .subscribe();
    return () => {
      clearUiBlockers();
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 1s tick for turn timer + bot trigger
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
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

  // Detect captures: any pawn whose pos went from >0 to 0 → emit a poof at its previous cell
  useEffect(() => {
    if (!g) return;
    const prev = lastPawnsRef.current;
    if (prev.length && g.pawns?.length) {
      const fresh: Array<{ id: string; x: number; y: number }> = [];
      for (const p of g.pawns) {
        const old = prev.find((q) => q.seat === p.seat && q.idx === p.idx);
        if (old && old.pos > 0 && p.pos === 0) {
          const [x, y] = pawnXY(old);
          fresh.push({ id: `${p.seat}-${p.idx}-${Date.now()}`, x, y });
        }
      }
      if (fresh.length) {
        sfx.capture();
        setPoofs((cur) => [...cur, ...fresh]);
        const ids = fresh.map((f) => f.id);
        setTimeout(() => setPoofs((cur) => cur.filter((p) => !ids.includes(p.id))), 700);
      }
    }
    lastPawnsRef.current = g.pawns ?? [];
  }, [g?.pawns]);

  const mySeat = useMemo<number | null>(() => {
    if (!g || !user) return null;
    const seats = (g.seat_assignment && g.seat_assignment.length)
      ? g.seat_assignment
      : activeSeats(g.players_count);
    if (user.id === g.player1_id) return seats[0] ?? null;
    if (user.id === g.player2_id) return seats[1] ?? null;
    if (user.id === g.player3_id) return seats[2] ?? null;
    if (user.id === g.player4_id) return seats[3] ?? null;
    return null;
  }, [g, user]);

  const isMyTurn = !!g && g.status === "in_progress" && mySeat === g.current_turn_seat;
  const movable = useMemo(() => {
    if (!g || !g.dice_rolled || !g.last_dice || !isMyTurn) return [] as number[];
    return legalMoves(g.pawns ?? [], g.current_turn_seat, g.last_dice);
  }, [g, isMyTurn]);

  const seatToUid = (seat: number): string | null => {
    if (!g) return null;
    const seats = (g.seat_assignment && g.seat_assignment.length)
      ? g.seat_assignment
      : activeSeats(g.players_count);
    const slot = seats.indexOf(seat);
    if (slot < 0) return null;
    const players = [g.player1_id, g.player2_id, g.player3_id, g.player4_id];
    return players[slot] ?? null;
  };

  const handleRoll = async () => {
    if (!g || !isMyTurn || g.dice_rolled || rolling) return;
    const state = g;
    const rollAt = new Date().toISOString();
    setRolling(true);
    setRollAnimSeat(state.current_turn_seat);
    armSafetyRelease();
    sfx.dice();

    try {
      await new Promise((r) => setTimeout(r, 650));
      const dice = rollBalancedDice(state.pawns ?? [], state.current_turn_seat);

      if (dice === 6 && state.consecutive_sixes >= 2) {
        const i = seats.indexOf(state.current_turn_seat);
        const ns = seats[(i + 1) % seats.length];
        setG((cur) => cur ? ({
          ...cur,
          last_dice: dice,
          dice_rolled: false,
          current_turn_seat: ns,
          consecutive_sixes: 0,
          turn_started_at: rollAt,
        }) : cur);
        const { error } = await supabase.rpc("ludo_update_state" as any, {
          _game_id: state.id,
          _last_dice: dice,
          _dice_rolled: false,
          _current_turn_seat: ns,
          _consecutive_sixes: 0,
          _turn_started_at: rollAt,
        });
        if (error) throw error;
        toast("6 fanintelony — very ny tour");
        return;
      }

      const nextSixes = dice === 6 ? state.consecutive_sixes + 1 : 0;
      setG((cur) => cur ? ({
        ...cur,
        last_dice: dice,
        dice_rolled: true,
        consecutive_sixes: nextSixes,
        turn_started_at: rollAt,
      }) : cur);

      const { error } = await supabase.rpc("ludo_update_state" as any, {
        _game_id: state.id,
        _last_dice: dice,
        _dice_rolled: true,
        _consecutive_sixes: nextSixes,
        _turn_started_at: rollAt,
      });
      if (error) throw error;

      // Tsy misy robo intsony: na tsy misy safidy na safidy iray ihany, ny
      // mpilalao ihany no manapaka. Raha lany ny 10s dia ny timer handler no
      // mandeha (mametraka pion na mandalo araka ny safidy azo).
    } catch (error: any) {
      toast.error(error?.message ?? "Nisy olana tamin'ny dé");
      await load(true);
    } finally {
      clearRefTimeout(blockerSafetyRef);
      setRolling(false);
      clearRefTimeout(rollAnimResetRef);
      rollAnimResetRef.current = window.setTimeout(() => setRollAnimSeat(null), 100);
    }
  };

  const handlePawn = async (pawnIdx: number) => {
    if (!g || !isMyTurn || !g.dice_rolled || !g.last_dice || acting) return;
    const state = g;
    const dice = state.last_dice;
    const res = applyMove(state.pawns ?? [], state.current_turn_seat, pawnIdx, dice);
    setActing(true);
    armSafetyRelease();
    sfx.move();

    try {
      // ===== Step-by-step walking animation (cell by cell) =====
      const startPawns = (state.pawns ?? []).map((p) => ({ ...p }));
      const me = startPawns.find((p) => p.seat === state.current_turn_seat && p.idx === pawnIdx)!;
      if (me.pos <= 0) {
        // Exit base — single hop to start cell
        me.pos = 1;
        setG((cur) => (cur ? { ...cur, pawns: startPawns.map((p) => ({ ...p })) } : cur));
        await new Promise((r) => setTimeout(r, STEP_ANIMATION_MS * 2));
      } else {
        for (let step = 0; step < dice; step++) {
          me.pos = Math.min(57, me.pos + 1);
          setG((cur) => (cur ? { ...cur, pawns: startPawns.map((p) => ({ ...p })) } : cur));
          await new Promise((r) => setTimeout(r, STEP_ANIMATION_MS));
          if (me.pos === 57) break;
        }
      }
      // Commit final state (with captures applied)
      setG((cur) => (cur ? { ...cur, pawns: res.pawns } : cur));
      if (res.captured > 0) sfx.capture();
      await new Promise((r) => setTimeout(r, 120));

      if (seatHasFinished(res.pawns, state.current_turn_seat)) {
        const winnerUid = seatToUid(state.current_turn_seat);
        sfx.win();
        const { error: updateError } = await supabase.rpc("ludo_update_state" as any, {
          _game_id: state.id,
          _pawns: res.pawns,
          _dice_rolled: false,
        });
        if (updateError) throw updateError;
        if (winnerUid) {
          const { error: settleError } = await supabase.rpc("ludo_settle" as any, { _game_id: state.id, _winner: winnerUid });
          if (settleError) throw settleError;
          toast.success("Resy ny lalao!");
        }
        return;
      }

      const sixes = dice === 6 ? state.consecutive_sixes : 0;
      // Bonus turn on a 6 (max 3 in a row), OR when a pawn enters home (finishes),
      // OR when an opponent's pawn was captured.
      const gotBonus = (dice === 6 && sixes < 3) || res.finishedPawn || res.captured > 0;
      let ns: number;
      let resetSixes = false;
      if (gotBonus) {
        ns = state.current_turn_seat;
        resetSixes = dice !== 6;
      } else {
        const i = seats.indexOf(state.current_turn_seat);
        ns = seats[(i + 1) % seats.length];
        resetSixes = true;
      }

      const nextTurnAt = new Date().toISOString();
      setG((cur) => cur ? ({
        ...cur,
        pawns: res.pawns,
        current_turn_seat: ns,
        last_dice: null,
        dice_rolled: false,
        consecutive_sixes: resetSixes ? 0 : sixes,
        turn_started_at: nextTurnAt,
      }) : cur);

      const { error: moveErr } = await supabase.rpc("ludo_update_state" as any, {
        _game_id: state.id,
        _pawns: res.pawns,
        _current_turn_seat: ns,
        _last_dice: null,
        _dice_rolled: false,
        _consecutive_sixes: resetSixes ? 0 : sixes,
        _turn_started_at: nextTurnAt,
      });
      if (moveErr) throw moveErr;
    } catch (error: any) {
      toast.error(error?.message ?? "Nisy olana tamin'ny fihetsiky ny pion");
      await load(true);
    } finally {
      clearRefTimeout(blockerSafetyRef);
      setActing(false);
    }
  };

  // ---- 10s turn timer + auto-play ----
  // If turn_started_at is missing (first turn just created), fall back to updated_at so
  // the timer always starts ticking immediately — even when no pawn is out yet.
  const turnStartMs = g?.turn_started_at
    ? new Date(g.turn_started_at).getTime()
    : (g?.updated_at ? new Date(g.updated_at).getTime() : 0);
  const elapsedSec = Math.max(0, Math.floor((now - turnStartMs) / 1000));
  const remainingSec = Math.max(0, TURN_LIMIT - elapsedSec);

  // Designated bot operator: lowest-seat connected player whose seat != current_turn_seat.
  // Falls back to any player. Ensures only ONE client triggers the bot.
  const seats: number[] = g
    ? ((g.seat_assignment && g.seat_assignment.length) ? g.seat_assignment : activeSeats(g.players_count))
    : [];
  const seatToUidLocal = (seat: number): string | null => {
    if (!g) return null;
    const slot = seats.indexOf(seat);
    if (slot < 0) return null;
    const players = [g.player1_id, g.player2_id, g.player3_id, g.player4_id];
    return players[slot] ?? null;
  };
  // Any connected player in the game may fire the bot when the timer runs out.
  // This guarantees absent / disconnected players still get auto-played, even
  // if the "designated operator" is also offline. Per-client idempotency key
  // (__ludoBotKey) keeps each browser from firing the same turn twice; the
  // realtime channel + turn_started_at change naturally serializes turns.
  const isOperator = !!user && !!g && [
    g.player1_id, g.player2_id, g.player3_id, g.player4_id,
  ].includes(user.id);

  useEffect(() => {
    if (!g || g.status !== "in_progress") return;
    if (!turnStartMs) return;
    if (!isOperator) return;
    if (remainingSec > 0) return;

    const key = `${g.id}-${g.current_turn_seat}-${g.dice_rolled ? "m" : "r"}-${turnStartMs}`;
    if (botActedRef.__ludoBotKey === key) return;
    botActedRef.__ludoBotKey = key;

    const runRpc = async (payload: Record<string, unknown>) => {
      const { error } = await supabase.rpc("ludo_update_state" as any, payload);
      if (error) throw error;
    };

    const pickAutoMove = (state: LG, dice: number) => {
      const moves = legalMoves(state.pawns ?? [], state.current_turn_seat, dice);
      if (!moves.length) return null;
      const ranked = moves
        .map((pawnIdx) => {
          const before = (state.pawns ?? []).find((p) => p.seat === state.current_turn_seat && p.idx === pawnIdx);
          const res = applyMove(state.pawns ?? [], state.current_turn_seat, pawnIdx, dice);
          const after = res.pawns.find((p) => p.seat === state.current_turn_seat && p.idx === pawnIdx);
          const score =
            (res.captured * 1000) +
            (res.finishedPawn ? 500 : 0) +
            ((before?.pos ?? 0) <= 0 ? 40 : 0) +
            (after?.pos ?? 0) +
            Math.random();
          return { pawnIdx, res, score };
        })
        .sort((a, b) => b.score - a.score);
      return ranked[0] ?? null;
    };

    (async () => {
      const { data: fresh, error } = await supabase.from("ludo_games" as any).select("*").eq("id", g.id).single();
      if (error || !fresh) throw error ?? new Error("ludo_refresh_failed");

      const state: LG = normalizeGame(fresh);
      if (state.status !== "in_progress") return;
      if (state.current_turn_seat !== g.current_turn_seat) return;

      const stateTurnStartMs = state.turn_started_at
        ? new Date(state.turn_started_at).getTime()
        : (state.updated_at ? new Date(state.updated_at).getTime() : 0);
      if (!stateTurnStartMs) return;
      if (Date.now() - stateTurnStartMs < TURN_LIMIT * 1000) {
        botActedRef.__ludoBotKey = null;
        return;
      }

      const liveSeats = (state.seat_assignment && state.seat_assignment.length)
        ? state.seat_assignment
        : activeSeats(state.players_count);
      if (!liveSeats.length) throw new Error("no_active_seats");

      const rotateSeat = (seat: number) => {
        const i = liveSeats.indexOf(seat);
        return liveSeats[(i + 1) % liveSeats.length];
      };
      const seatToUidForState = (seat: number) => {
        const slot = liveSeats.indexOf(seat);
        if (slot < 0) return null;
        const players = [state.player1_id, state.player2_id, state.player3_id, state.player4_id];
        return players[slot] ?? null;
      };

      const currentSeat = state.current_turn_seat;
      const resolveMoveState = async (dice: number, baseState: LG, rolledSixes: number) => {
        const picked = pickAutoMove(baseState, dice);
        const nextTurnAt = new Date().toISOString();

        if (!picked) {
          await runRpc({
            _game_id: baseState.id,
            _current_turn_seat: rotateSeat(currentSeat),
            _dice_rolled: false,
            _last_dice: null,
            _consecutive_sixes: 0,
            _turn_started_at: nextTurnAt,
          });
          return;
        }

        const { res } = picked;
        if (seatHasFinished(res.pawns, currentSeat)) {
          await runRpc({
            _game_id: baseState.id,
            _pawns: res.pawns,
            _last_dice: null,
            _dice_rolled: false,
          });
          const winnerUid = seatToUidForState(currentSeat);
          if (winnerUid) {
            const { error: settleError } = await supabase.rpc("ludo_settle" as any, { _game_id: baseState.id, _winner: winnerUid });
            if (settleError) throw settleError;
          }
          return;
        }

        const gotBonus = (dice === 6 && rolledSixes < 3) || res.finishedPawn || res.captured > 0;
        const ns = gotBonus ? currentSeat : rotateSeat(currentSeat);
        const resetSixes = gotBonus ? dice !== 6 : true;
        await runRpc({
          _game_id: baseState.id,
          _pawns: res.pawns,
          _current_turn_seat: ns,
          _last_dice: null,
          _dice_rolled: false,
          _consecutive_sixes: resetSixes ? 0 : rolledSixes,
          _turn_started_at: nextTurnAt,
        });
      };

      if (!state.dice_rolled) {
        const dice = rollBalancedDice(state.pawns ?? [], currentSeat);
        const rolledSixes = dice === 6 ? state.consecutive_sixes + 1 : 0;

        if (dice === 6 && state.consecutive_sixes >= 2) {
          await runRpc({
            _game_id: state.id,
            _last_dice: dice,
            _dice_rolled: false,
            _current_turn_seat: rotateSeat(currentSeat),
            _consecutive_sixes: 0,
            _turn_started_at: new Date().toISOString(),
          });
          return;
        }

        await resolveMoveState(dice, { ...state, last_dice: dice, dice_rolled: true }, rolledSixes);
        return;
      }

      await resolveMoveState(state.last_dice ?? 1, state, state.last_dice === 6 ? state.consecutive_sixes : 0);
    })().catch(() => {
      botActedRef.__ludoBotKey = null;
      load(true).catch(() => undefined);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSec, isOperator, g?.id, g?.current_turn_seat, g?.dice_rolled, g?.last_dice, turnStartMs, g?.status]);

  if (loadError) {
    return (
      <div className="min-h-screen ludo-bg flex flex-col items-center justify-center gap-3 p-4">
        <p className="text-yellow-200 text-sm text-center">Olana fampakarana ny lalao.<br/><span className="opacity-70 text-xs">{loadError}</span></p>
        <Button onClick={() => { setLoadError(null); load(); }} className="ludo-btn">
          <RefreshCw className="w-4 h-4 mr-1" /> Mamerina indray
        </Button>
        <Button variant="ghost" onClick={() => nav("/")} className="text-yellow-200">Hiverina</Button>
      </div>
    );
  }
  if (!g) {
    return (
      <div className="min-h-screen ludo-bg flex flex-col items-center justify-center gap-3">
        <Loader2 className="animate-spin text-yellow-300 w-10 h-10" />
        <p className="text-yellow-200/70 text-xs">Mampakatra ny lalao...</p>
      </div>
    );
  }

  const winnerName = g.winner_id ? names[g.winner_id] ?? "?" : null;

  // Score per seat = number of pawns with pos === 57
  const scoreOf = (seat: number) => (g.pawns ?? []).filter((p) => p.seat === seat && p.pos === 57).length;

  // Compute legal landing target cells for current player after dice roll
  const legalTargets: Array<[number, number]> = [];
  if (isMyTurn && g.dice_rolled && g.last_dice && movable.length) {
    for (const idx of movable) {
      const pawn = (g.pawns ?? []).find((p) => p.seat === g.current_turn_seat && p.idx === idx);
      if (!pawn) continue;
      const sim: Pawn = { ...pawn, pos: pawn.pos <= 0 ? 1 : pawn.pos + g.last_dice };
      const [x, y] = pawnXY(sim);
      legalTargets.push([Math.floor(x), Math.floor(y)]);
    }
  }

  // Profile chip for one seat — corners around the board
  const ProfileChip = ({ seat, corner }: { seat: number; corner: "tl"|"tr"|"bl"|"br" }) => {
    const uid = seatToUid(seat);
    const isTurn = g.current_turn_seat === seat && g.status === "in_progress";
    const isMe = mySeat === seat;
    const diceFace = isTurn && g.last_dice ? g.last_dice : 5;
    const isAnim = rollAnimSeat === seat;
    const cornerCls =
      corner === "tl" ? "top-1 left-1 flex-row" :
      corner === "tr" ? "top-1 right-1 flex-row-reverse" :
      corner === "bl" ? "bottom-1 left-1 flex-row" :
                       "bottom-1 right-1 flex-row-reverse";
    const av = uid ? avatars[uid] : null;
    const initial = (uid && names[uid] ? names[uid][0] : "?").toUpperCase();
    return (
      <div className={`absolute ${cornerCls} z-10 flex items-center gap-1.5`}>
        {/* Avatar */}
        <div
          className={`relative w-11 h-11 rounded-full border-2 flex items-center justify-center overflow-hidden shrink-0 ${isTurn ? "profile-active" : ""}`}
          style={{ borderColor: SEAT_COLOR[seat], background: SEAT_COLOR[seat] }}
        >
          {av ? (
            <img src={av} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="font-bold text-white text-base">{initial}</span>
          )}
          {/* Score badge */}
          <span className="absolute -bottom-0.5 -right-0.5 bg-yellow-300 text-[9px] font-bold text-purple-900 rounded-full w-4 h-4 flex items-center justify-center border border-purple-900">
            {scoreOf(seat)}
          </span>
        </div>
        {/* Name + timer + dice */}
        <div className={`flex flex-col ${corner.endsWith("r") ? "items-end" : "items-start"}`}>
          <div className="flex items-center gap-1 max-w-[100px]">
            <span className="text-[10px] font-bold text-yellow-50 truncate drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
              {uid ? (names[uid] ?? "...") : "miandry"}
            </span>
            {isTurn && (
              <span className="text-[10px] font-bold text-yellow-300 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">⏱{remainingSec}s</span>
            )}
          </div>
          {/* Personal dice — only ACTIVE seat shows the big 3D dice with arrow */}
          {isTurn && (
            <div className="relative mt-0.5">
              {!g.dice_rolled && (
                <ChevronDown
                  className="dice-arrow-strong absolute -top-4 left-1/2 w-5 h-5 text-yellow-300 drop-shadow-[0_2px_2px_rgba(0,0,0,0.7)]"
                  strokeWidth={3}
                />
              )}
              {(() => {
                const RING_SIZE = 72;
                const R = 32;
                const C = 2 * Math.PI * R;
                const pct = Math.max(0, Math.min(1, remainingSec / TURN_LIMIT));
                const urgent = remainingSec <= 3;
                const ringColor = urgent ? "#ff3b3b" : "#ffe27a";
                const ring = (
                  <svg
                    width={RING_SIZE}
                    height={RING_SIZE}
                    viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
                    className={`absolute inset-0 pointer-events-none ${urgent ? "animate-pulse" : ""}`}
                    style={{ transform: "rotate(-90deg)" }}
                  >
                    <circle cx={RING_SIZE/2} cy={RING_SIZE/2} r={R} stroke="rgba(0,0,0,0.55)" strokeWidth={4} fill="none" />
                    <circle
                      cx={RING_SIZE/2} cy={RING_SIZE/2} r={R}
                      stroke={ringColor} strokeWidth={4} fill="none" strokeLinecap="round"
                      strokeDasharray={C}
                      strokeDashoffset={C * (1 - pct)}
                      style={{ transition: "stroke-dashoffset 0.4s linear, stroke 0.2s linear" }}
                    />
                  </svg>
                );
                const sec = (
                  <span
                    className={`absolute -bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-extrabold px-1.5 rounded-full ${urgent ? "bg-red-600 text-white" : "bg-yellow-300 text-purple-900"} drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]`}
                    style={{ lineHeight: "14px", minWidth: 18, textAlign: "center" }}
                  >
                    {remainingSec}
                  </span>
                );
                const inner = isMe && !g.dice_rolled ? (
                  <button
                    onClick={handleRoll}
                    disabled={rolling}
                    className="absolute inset-0 flex items-center justify-center transition active:translate-y-0.5"
                    aria-label="Roll dice"
                  >
                    <LudoDice3D face={diceFace} size={56} rolling={isAnim} idle={!g.last_dice} />
                  </button>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <LudoDice3D face={g.last_dice ?? 5} size={56} rolling={isAnim} idle={!g.dice_rolled} />
                  </div>
                );
                return (
                  <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
                    {ring}
                    {inner}
                    {sec}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Map seats → corners. Engine layout: 1=bottom-left, 2=top-left, 3=top-right, 4=bottom-right.
  const cornerForSeat: Record<number, "tl"|"tr"|"bl"|"br"> = { 1: "bl", 2: "tl", 3: "tr", 4: "br" };

  return (
    <div className="h-screen w-screen ludo-bg flex flex-col overflow-hidden relative">
      {/* Top header — slim */}
      <header className="p-1.5 flex items-center gap-2 border-b border-yellow-500/30 shrink-0 relative z-20">
        <Button variant="ghost" size="icon" onClick={() => nav("/")} className="h-8 w-8"><ArrowLeft className="w-4 h-4" /></Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-xs font-bold ludo-title leading-tight">LUDO MASTER</h1>
          <p className="text-[9px] text-yellow-100/70 truncate">
            #{g.ticket_number ?? "—"} · Mise <b>{fmtAr(g.stake)}</b> · Pot <b>{fmtAr(Math.round(g.stake * 0.9 * g.players_count))}</b>
          </p>
        </div>
        {/* Voice chat toggle — top center */}
        {g.status === "in_progress" && <LudoVoiceChat gameId={g.id} />}
      </header>

      {/* Board area — fills, with 4 corner profiles */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-2">
        <div className="relative w-full h-full max-w-[min(100vw,100vh-100px)] aspect-square">
          {/* 4 corner profiles */}
          {seats.map((s) => (
            <ProfileChip key={s} seat={s} corner={cornerForSeat[s]} />
          ))}

          {/* Board itself — plein écran, with minimal inset for corner profiles */}
          <div className="absolute inset-0 pt-14 pb-14 px-2 sm:px-4">
            <LudoBoard
              pawns={g.pawns ?? []}
              playersCount={g.players_count}
              movableSeat={isMyTurn ? g.current_turn_seat : null}
              movablePawns={movable}
              onPawnClick={handlePawn}
              activeSeatList={seats}
              legalTargets={legalTargets}
              poofs={poofs}
            />
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="shrink-0 px-2 py-1.5 ludo-panel border-t border-yellow-500/40">
        <div className="max-w-lg mx-auto text-center">
          {g.status === "waiting" && (
            <p className="text-yellow-100 text-xs">Miandry mpilalao... ({[g.player1_id, g.player2_id, g.player3_id, g.player4_id].filter(Boolean).length}/{g.players_count})</p>
          )}
          {g.status === "finished" && <p className="text-yellow-300 font-bold text-xs">🏆 Mpandresy: {winnerName}</p>}
          {g.status === "in_progress" && (
            isMyTurn ? (
              g.dice_rolled
                ? <p className="text-yellow-100 text-xs">{movable.length > 0 ? "Safidio pion mihazavazava" : "Tsy misy fihetsika..."}</p>
                : <p className="text-yellow-200 text-xs font-bold">▶ Tsindrio ny dé!</p>
            ) : (
              <p className="text-yellow-100/80 text-xs">Andrasana ny <b style={{ color: SEAT_COLOR[g.current_turn_seat] }}>{SEAT_NAME[g.current_turn_seat]}</b>...</p>
            )
          )}
          <p className="text-[8px] text-yellow-100/40">Crédit · DOMINO MGA × LOVABLE AI · Beta v1</p>
        </div>
      </div>

      {/* Floating chat button — bottom right of game screen */}
      {g.status === "in_progress" && (
        <GameChat
          gameId={g.id}
          names={names}
          triggerClassName="fab-circle fixed bottom-24 right-3 z-30 w-12 h-12"
        />
      )}

      {/* Winner overlay + auto return to lobby */}
      {g.status === "finished" && g.winner_id && (
        <WinnerOverlay
          winnerName={winnerName ?? "?"}
          isMe={user?.id === g.winner_id}
          onDone={() => nav("/ludo")}
        />
      )}
    </div>
  );
}

function WinnerOverlay({ winnerName, isMe, onDone }: { winnerName: string; isMe: boolean; onDone: () => void }) {
  const [count, setCount] = useState(6);
  useEffect(() => {
    sfx.win();
    const t = setInterval(() => setCount((c) => Math.max(0, c - 1)), 1000);
    const done = setTimeout(onDone, 6000);
    return () => { clearInterval(t); clearTimeout(done); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const colors = ["#ffe27a", "#2ecc71", "#1f7fd6", "#e63946", "#f4c419", "#9b59b6"];
  const pieces = Array.from({ length: 60 }, (_, i) => i);
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
      {/* confetti */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {pieces.map((i) => {
          const left = Math.random() * 100;
          const dur = 2.2 + Math.random() * 2.5;
          const delay = Math.random() * 1.2;
          const bg = colors[i % colors.length];
          return (
            <span
              key={i}
              className="confetti-piece"
              style={{ left: `${left}%`, background: bg, animationDuration: `${dur}s`, animationDelay: `${delay}s` }}
            />
          );
        })}
      </div>
      <div className="win-pop relative text-center px-6 py-8 ludo-panel rounded-3xl">
        <div className="text-6xl mb-2 win-shine">🏆</div>
        <h2 className="ludo-title text-3xl font-display font-black mb-1">
          {isMe ? "Ianao no MPANDRESY!" : "Mpandresy"}
        </h2>
        <p className="text-yellow-100 text-base font-bold">{winnerName}</p>
        <p className="text-yellow-100/70 text-xs mt-3">Hiverina amin'ny lobby afaka {count}s…</p>
      </div>
    </div>
  );
}