import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, ChevronDown, RefreshCw } from "lucide-react";
import LudoBoard from "@/components/LudoBoard";
import {
  activeSeats, applyMove, legalMoves, rollDice, seatHasFinished,
  SEAT_COLOR, SEAT_NAME, nextSeatFromList, pawnXY, pawnTrackIdx, type Pawn,
} from "@/lib/ludoEngine";
import { fmtAr } from "@/lib/constants";
import { sfx } from "@/lib/sfx";
import { toast } from "sonner";
import { GameChat } from "@/components/GameChat";
import LudoVoiceChat from "@/components/LudoVoiceChat";

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
};

export default function LudoGame() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [g, setG] = useState<LG | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [rollAnimSeat, setRollAnimSeat] = useState<number | null>(null);
  const [poofs, setPoofs] = useState<Array<{ id: string; x: number; y: number }>>([]);
  const lastPawnsRef = useRef<Pawn[]>([]);
  const botActedRef = (typeof window !== "undefined" ? (window as any) : {}) as any;

  const load = async () => {
    if (!id) return;
    const { data, error } = await supabase.from("ludo_games" as any).select("*").eq("id", id).single();
    if (error || !data) { setLoadError(error?.message ?? "Tsy hita ny lalao"); return; }
    setLoadError(null);
    // Defensive: normalize any pawn with pos<0 to 0 (base)
    const raw: any = data;
    const pawns = Array.isArray(raw.pawns) ? raw.pawns.map((p: any) => ({ ...p, pos: Number(p?.pos) < 0 ? 0 : Number(p?.pos) })) : [];
    setG({ ...raw, pawns } as any);
    const ids = [
      (data as any).player1_id,
      (data as any).player2_id,
      (data as any).player3_id,
      (data as any).player4_id,
    ].filter(Boolean) as string[];
    if (ids.length) {
      const { data: ps } = await supabase.from("profiles").select("user_id, mvola_name, avatar_url").in("user_id", ids);
      const m: Record<string, string> = {};
      const av: Record<string, string | null> = {};
      (ps ?? []).forEach((p: any) => { m[p.user_id] = p.mvola_name; av[p.user_id] = p.avatar_url ?? null; });
      setNames(m);
      setAvatars(av);
    }
  };

  useEffect(() => {
    load();
    if (!id) return;
    const ch = supabase.channel(`ludo-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ludo_games", filter: `id=eq.${id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 1s tick for turn timer + bot trigger
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
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
    setRolling(true);
    setRollAnimSeat(g.current_turn_seat);
    sfx.dice();
    // Let the spin play before locking the face
    await new Promise((r) => setTimeout(r, 650));
    const dice = rollDice();
    // Save roll
    await supabase.rpc("ludo_update_state" as any, {
      _game_id: g.id,
      _last_dice: dice,
      _dice_rolled: true,
      _consecutive_sixes: dice === 6 ? g.consecutive_sixes + 1 : 0,
    });
    setRolling(false);
    setTimeout(() => setRollAnimSeat(null), 100);
    // If no legal moves → auto end turn
    setTimeout(async () => {
      const moves = legalMoves(g.pawns ?? [], g.current_turn_seat, dice);
      if (moves.length === 0) {
        const sixes = dice === 6 ? g.consecutive_sixes + 1 : 0;
        const { seat: ns } = nextSeatFromList(g.current_turn_seat, seats, dice === 6, 0, sixes);
        await supabase.rpc("ludo_update_state" as any, {
          _game_id: g.id,
          _current_turn_seat: ns,
          _dice_rolled: false,
          _last_dice: null,
          _consecutive_sixes: ns === g.current_turn_seat ? sixes : 0,
          _turn_started_at: new Date().toISOString(),
        });
      }
    }, 700);
  };

  const handlePawn = async (pawnIdx: number) => {
    if (!g || !isMyTurn || !g.dice_rolled || !g.last_dice) return;
    const dice = g.last_dice;
    const res = applyMove(g.pawns ?? [], g.current_turn_seat, pawnIdx, dice);
    if (res.captured > 0) sfx.capture(); else sfx.move();
    // Check victory
    if (seatHasFinished(res.pawns, g.current_turn_seat)) {
      const winnerUid = seatToUid(g.current_turn_seat);
      sfx.win();
      await supabase.rpc("ludo_update_state" as any, {
        _game_id: g.id, _pawns: res.pawns, _dice_rolled: false, _last_dice: null,
      });
      if (winnerUid) {
        const { error } = await supabase.rpc("ludo_settle" as any, { _game_id: g.id, _winner: winnerUid });
        if (error) toast.error(error.message);
        else toast.success("Resy ny lalao!");
      }
      return;
    }
    const sixes = dice === 6 ? g.consecutive_sixes : 0;
    const { seat: ns, resetSixes } = nextSeatFromList(g.current_turn_seat, seats, dice === 6, res.captured, sixes);
    await supabase.rpc("ludo_update_state" as any, {
      _game_id: g.id,
      _pawns: res.pawns,
      _current_turn_seat: ns,
      _dice_rolled: false,
      _last_dice: null,
      _consecutive_sixes: resetSixes ? 0 : sixes,
      _turn_started_at: new Date().toISOString(),
    });
  };

  // ---- 10s turn timer + bot auto-play ----
  const TURN_LIMIT = 10;
  const turnStartMs = g?.turn_started_at ? new Date(g.turn_started_at).getTime() : 0;
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
  const operatorSeat = g
    ? (seats.find((s) => s !== g.current_turn_seat) ?? seats[0])
    : null;
  const isOperator = !!user && !!g && seatToUidLocal(operatorSeat ?? 0) === user.id;

  useEffect(() => {
    if (!g || g.status !== "in_progress" || !user) return;
    if (remainingSec > 0) return;
    if (!isOperator) return;
    const key = `${g.id}-${g.current_turn_seat}-${g.dice_rolled ? "m" : "r"}-${turnStartMs}`;
    if (botActedRef.__ludoBotKey === key) return;
    botActedRef.__ludoBotKey = key;

    (async () => {
      // Bot logic: if dice not rolled → roll. If no legal moves → next turn. If legal → play first.
      if (!g.dice_rolled) {
        const dice = rollDice();
        await supabase.rpc("ludo_update_state" as any, {
          _game_id: g.id,
          _last_dice: dice,
          _dice_rolled: true,
          _consecutive_sixes: dice === 6 ? g.consecutive_sixes + 1 : 0,
        });
        const moves = legalMoves(g.pawns ?? [], g.current_turn_seat, dice);
        if (moves.length === 0) {
          const sixes = dice === 6 ? g.consecutive_sixes + 1 : 0;
          const { seat: ns } = nextSeatFromList(g.current_turn_seat, seats, dice === 6, 0, sixes);
          await supabase.rpc("ludo_update_state" as any, {
            _game_id: g.id,
            _current_turn_seat: ns,
            _dice_rolled: false,
            _last_dice: null,
            _consecutive_sixes: ns === g.current_turn_seat ? sixes : 0,
            _turn_started_at: new Date().toISOString(),
          });
        } else {
          const pawnIdx = moves[0];
          const res = applyMove(g.pawns ?? [], g.current_turn_seat, pawnIdx, dice);
          if (seatHasFinished(res.pawns, g.current_turn_seat)) {
            const winnerUid = seatToUidLocal(g.current_turn_seat);
            await supabase.rpc("ludo_update_state" as any, {
              _game_id: g.id, _pawns: res.pawns, _dice_rolled: false, _last_dice: null,
            });
            if (winnerUid) await supabase.rpc("ludo_settle" as any, { _game_id: g.id, _winner: winnerUid });
            return;
          }
          const sixes = dice === 6 ? g.consecutive_sixes : 0;
          const { seat: ns, resetSixes } = nextSeatFromList(g.current_turn_seat, seats, dice === 6, res.captured, sixes);
          await supabase.rpc("ludo_update_state" as any, {
            _game_id: g.id,
            _pawns: res.pawns,
            _current_turn_seat: ns,
            _dice_rolled: false,
            _last_dice: null,
            _consecutive_sixes: resetSixes ? 0 : sixes,
            _turn_started_at: new Date().toISOString(),
          });
        }
      } else if (g.last_dice) {
        const dice = g.last_dice;
        const moves = legalMoves(g.pawns ?? [], g.current_turn_seat, dice);
        if (moves.length === 0) {
          const sixes = dice === 6 ? g.consecutive_sixes : 0;
          const { seat: ns } = nextSeatFromList(g.current_turn_seat, seats, false, 0, sixes);
          await supabase.rpc("ludo_update_state" as any, {
            _game_id: g.id,
            _current_turn_seat: ns,
            _dice_rolled: false,
            _last_dice: null,
            _consecutive_sixes: 0,
            _turn_started_at: new Date().toISOString(),
          });
          return;
        }
        const pawnIdx = moves[0];
        const res = applyMove(g.pawns ?? [], g.current_turn_seat, pawnIdx, dice);
        if (seatHasFinished(res.pawns, g.current_turn_seat)) {
          const winnerUid = seatToUidLocal(g.current_turn_seat);
          await supabase.rpc("ludo_update_state" as any, {
            _game_id: g.id, _pawns: res.pawns, _dice_rolled: false, _last_dice: null,
          });
          if (winnerUid) await supabase.rpc("ludo_settle" as any, { _game_id: g.id, _winner: winnerUid });
          return;
        }
        const sixes = dice === 6 ? g.consecutive_sixes : 0;
        const { seat: ns, resetSixes } = nextSeatFromList(g.current_turn_seat, seats, dice === 6, res.captured, sixes);
        await supabase.rpc("ludo_update_state" as any, {
          _game_id: g.id,
          _pawns: res.pawns,
          _current_turn_seat: ns,
          _dice_rolled: false,
          _last_dice: null,
          _consecutive_sixes: resetSixes ? 0 : sixes,
          _turn_started_at: new Date().toISOString(),
        });
      }
    })().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSec, isOperator, g?.id, g?.current_turn_seat, g?.dice_rolled, g?.last_dice, turnStartMs]);

  if (!g) return <div className="min-h-screen ludo-bg flex items-center justify-center"><Loader2 className="animate-spin text-yellow-300" /></div>;

  const seats2 = seats;
  const winnerName = g.winner_id ? names[g.winner_id] ?? "?" : null;
  const DiceIcons = [Dice1, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];

  return (
    <div className="h-screen w-screen ludo-bg flex flex-col overflow-hidden">
      <header className="p-2 flex items-center gap-2 border-b border-yellow-500/30 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => nav("/")}><ArrowLeft /></Button>
        <div className="flex-1">
          <h1 className="font-display text-sm font-bold ludo-title">LUDO MASTER</h1>
          <p className="text-[10px] text-yellow-100/70">
            Ticket: <b>{g.ticket_number ?? "—"}</b> · Mise: <b>{fmtAr(g.stake)}</b> · Pot: <b>{fmtAr(Math.round(g.stake * 0.9 * g.players_count))}</b>
          </p>
        </div>
      </header>

      {/* Players bar — chaque joueur a son propre dé à côté du profil */}
      <div className="px-2 pt-2 grid grid-cols-2 gap-1.5 shrink-0">
        {seats2.map((s) => {
          const uid = seatToUid(s);
          const isTurn = g.current_turn_seat === s && g.status === "in_progress";
          const isMe = mySeat === s;
          const DiceFace = isTurn && g.last_dice ? DiceIcons[g.last_dice] : Dice5;
          const isAnim = rollAnimSeat === s;
          return (
            <div
              key={s}
              className={`rounded-lg p-1.5 border-2 flex items-center gap-2 ${isTurn ? "border-yellow-300 ring-2 ring-yellow-300/40" : "border-yellow-500/20"}`}
              style={{ background: SEAT_COLOR[s] + "33" }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full" style={{ background: SEAT_COLOR[s] }} />
                  <span className="text-xs font-bold text-yellow-50 truncate">
                    {uid ? (names[uid] ?? "...") : <em className="opacity-60">miandry</em>}
                  </span>
                </div>
                <p className="text-[10px] text-yellow-100/70">
                  {SEAT_NAME[s]}{isTurn ? ` · ⏱ ${remainingSec}s` : ""}
                </p>
              </div>
              {/* Personal dice + floating arrow when it's their turn to roll */}
              <div className="relative">
                {isTurn && !g.dice_rolled && (
                  <ChevronDown
                    className="dice-arrow absolute -top-5 left-1/2 -translate-x-1/2 w-6 h-6 text-yellow-300 drop-shadow-[0_2px_2px_rgba(0,0,0,0.6)]"
                    strokeWidth={3}
                  />
                )}
                {isTurn && isMe && !g.dice_rolled ? (
                  <button
                    onClick={handleRoll}
                    disabled={rolling}
                    className={`w-11 h-11 rounded-lg bg-white border-2 border-yellow-400 flex items-center justify-center text-purple-900 shadow-lg active:scale-95 transition ${isAnim ? "dice-rolling" : ""}`}
                    aria-label="Roll dice"
                  >
                    <DiceFace className="w-7 h-7" />
                  </button>
                ) : (
                  <div
                    className={`w-11 h-11 rounded-lg flex items-center justify-center ${isTurn ? "bg-white text-purple-900 border-2 border-yellow-400 shadow-lg" : "bg-white/20 text-yellow-100/60 border border-yellow-500/30"} ${isAnim ? "dice-rolling" : ""}`}
                  >
                    {isTurn && g.last_dice ? <DiceFace className="w-7 h-7" /> : <span className="text-xl">•</span>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Board — fills remaining space, plein écran */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-2">
        <div className="w-full h-full max-w-[min(100vw,calc(100vh-220px))] aspect-square">
          <LudoBoard
            pawns={g.pawns ?? []}
            playersCount={g.players_count}
            movableSeat={isMyTurn ? g.current_turn_seat : null}
            movablePawns={movable}
            onPawnClick={handlePawn}
            activeSeatList={seats}
          />
        </div>
      </div>

      {/* Status bar */}
      <div className="shrink-0 p-2 ludo-panel border-t border-yellow-500/40">
        <div className="max-w-lg mx-auto text-center">
          {g.status === "waiting" && (
            <p className="text-yellow-100 text-xs">Miandry mpilalao... ({[g.player1_id, g.player2_id, g.player3_id, g.player4_id].filter(Boolean).length}/{g.players_count})</p>
          )}
          {g.status === "finished" && <p className="text-yellow-300 font-bold text-xs">🏆 Mpandresy: {winnerName}</p>}
          {g.status === "in_progress" && (
            isMyTurn ? (
              g.dice_rolled
                ? <p className="text-yellow-100 text-xs">{movable.length > 0 ? "Safidio pion azo ampihetsiketsehina" : "Tsy misy fihetsika — andrasana..."}</p>
                : <p className="text-yellow-200 text-xs font-bold">▶ Tsipazo ny dé!</p>
            ) : (
              <p className="text-yellow-100/80 text-xs">Andrasana ny <b>{SEAT_NAME[g.current_turn_seat]}</b>...</p>
            )
          )}
          <p className="text-[9px] text-yellow-100/40 mt-1">Crédit · DOMINO MGA × LOVABLE AI · Beta v1</p>
        </div>
      </div>
    </div>
  );
}