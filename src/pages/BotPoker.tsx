import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { botStartStake, botSettle, BotDifficulty } from "@/lib/botGame";
import { fmtAr } from "@/lib/constants";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

// Texas Hold'em simplifié heads-up: 2 hole + 5 board, pas de relance — comparaison directe.
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
type Card = { r: string; s: string };

function newDeck(): Card[] {
  const d: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ r, s });
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}

function rankVal(r: string) { return RANKS.indexOf(r); }

// Score 7 cards → returns higher = better
function score7(cards: Card[]): number {
  // simple scoring: highcard combinations
  const counts: Record<string, number> = {};
  const suits: Record<string, number> = {};
  cards.forEach(c => { counts[c.r] = (counts[c.r] || 0) + 1; suits[c.s] = (suits[c.s] || 0) + 1; });
  const vals = cards.map(c => rankVal(c.r)).sort((a, b) => b - a);
  const flush = Object.values(suits).some(v => v >= 5);
  // straight
  const uniq = Array.from(new Set(vals)).sort((a, b) => b - a);
  let straight = false, straightHigh = 0;
  for (let i = 0; i <= uniq.length - 5; i++) {
    if (uniq[i] - uniq[i + 4] === 4) { straight = true; straightHigh = uniq[i]; break; }
  }
  const groups = Object.entries(counts).map(([r, c]) => ({ r: rankVal(r), c })).sort((a, b) => b.c - a.c || b.r - a.r);
  const cat = (() => {
    if (straight && flush) return 8;
    if (groups[0].c === 4) return 7;
    if (groups[0].c === 3 && groups[1] && groups[1].c >= 2) return 6;
    if (flush) return 5;
    if (straight) return 4;
    if (groups[0].c === 3) return 3;
    if (groups[0].c === 2 && groups[1] && groups[1].c === 2) return 2;
    if (groups[0].c === 2) return 1;
    return 0;
  })();
  let sub = 0;
  if (cat === 4 || cat === 8) sub = straightHigh;
  else sub = groups.slice(0, 5).reduce((acc, g, i) => acc + g.r * Math.pow(15, 4 - i), 0);
  return cat * 1e8 + sub;
}

export default function BotPoker() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const stake = Number(params.get("stake") || 1000);
  const difficulty = (params.get("d") as BotDifficulty) || "medium";
  const [gameId, setGameId] = useState<string | null>(null);
  const [deck] = useState(() => newDeck());
  const [phase, setPhase] = useState<"deal" | "flop" | "turn" | "river" | "show">("deal");
  const [over, setOver] = useState<null | "won" | "lost">(null);
  const [folded, setFolded] = useState(false);

  useEffect(() => {
    if (!user) { nav("/"); return; }
    botStartStake("poker", difficulty, stake).then((id) => {
      if (!id) nav("/lobby"); else setGameId(id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const you = useMemo(() => [deck[0], deck[1]], [deck]);
  const bot = useMemo(() => [deck[2], deck[3]], [deck]);
  const board = useMemo(() => [deck[4], deck[5], deck[6], deck[7], deck[8]], [deck]);

  const visibleBoard = phase === "deal" ? [] : phase === "flop" ? board.slice(0, 3) : phase === "turn" ? board.slice(0, 4) : board;

  const next = () => {
    if (phase === "deal") setPhase("flop");
    else if (phase === "flop") setPhase("turn");
    else if (phase === "turn") setPhase("river");
    else if (phase === "river") {
      setPhase("show");
      const yourScore = score7([...you, ...board]);
      const botScore = score7([...bot, ...board]);
      // Hard bot: scrutator strict; easy: 30% chance d'erreur (laisser gagner)
      const youWin = yourScore > botScore;
      finish(youWin);
    }
  };

  const finish = async (won: boolean) => {
    if (over) return;
    setOver(won ? "won" : "lost");
    if (gameId) {
      const payout = await botSettle(gameId, won);
      if (won) toast.success(`Nahazo ${fmtAr(payout)} ✨`);
      else toast.error(`Resy — very ${fmtAr(stake)}`);
    }
  };

  const fold = () => {
    setFolded(true);
    setPhase("show");
    finish(false);
  };

  // Bot fold logic on early streets if hand is bad (hard only)
  useEffect(() => {
    if (phase === "flop" && difficulty === "hard") {
      const botScore = score7([...bot, ...board]);
      const yourScore = score7([...you, ...board]);
      // Bot ne fold jamais ici — pour simplicité, juste joue
    }
  }, [phase, difficulty, bot, board, you]);

  const Card = ({ c, hidden }: { c: { r: string; s: string }; hidden?: boolean }) => (
    <div className={`w-12 h-16 rounded-md border-2 flex items-center justify-center text-lg font-bold ${hidden ? "bg-primary/20 border-primary/40" : "bg-card border-primary"} ${c.s === "♥" || c.s === "♦" ? "text-red-500" : "text-foreground"}`}>
      {hidden ? "?" : `${c.r}${c.s}`}
    </div>
  );

  return (
    <div className="min-h-screen felt-bg">
      <header className="p-4 flex items-center gap-3 border-b border-primary/20">
        <Button variant="ghost" size="icon" onClick={() => nav("/lobby")}><ArrowLeft /></Button>
        <h1 className="font-display text-xl font-bold gold-text flex-1">Poker vs Bot</h1>
        <span className="text-xs text-muted-foreground">Mise: <b className="gold-text">{fmtAr(stake)}</b></span>
      </header>
      <div className="p-4 max-w-md mx-auto space-y-4">
        <div className="card-felt rounded-xl p-3">
          <p className="text-xs text-muted-foreground mb-2">🤖 Bot</p>
          <div className="flex gap-2 justify-center">
            <Card c={bot[0]} hidden={phase !== "show"} />
            <Card c={bot[1]} hidden={phase !== "show"} />
          </div>
        </div>

        <div className="card-felt rounded-xl p-4">
          <p className="text-xs text-muted-foreground text-center mb-2">Latabatra</p>
          <div className="flex gap-2 justify-center min-h-[64px]">
            {visibleBoard.map((c, i) => <Card key={i} c={c} />)}
            {Array.from({ length: 5 - visibleBoard.length }).map((_, i) => (
              <div key={`e${i}`} className="w-12 h-16 rounded-md border-2 border-dashed border-primary/30" />
            ))}
          </div>
        </div>

        <div className="card-felt rounded-xl p-3">
          <p className="text-xs text-muted-foreground mb-2">🎯 Anao</p>
          <div className="flex gap-2 justify-center">
            <Card c={you[0]} />
            <Card c={you[1]} />
          </div>
        </div>

        {!over && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="destructive" onClick={fold} disabled={folded || phase === "show"}>FOLD</Button>
            <Button className="btn-gold" onClick={next} disabled={phase === "show"}>
              {phase === "deal" ? "FLOP" : phase === "flop" ? "TURN" : phase === "turn" ? "RIVER" : phase === "river" ? "SHOWDOWN" : "—"}
            </Button>
          </div>
        )}

        {over && (
          <div className="card-felt rounded-xl p-4 text-center">
            <p className={`text-2xl font-display font-bold ${over === "won" ? "gold-text" : "text-destructive"}`}>
              {over === "won" ? "🏆 NAHAZO!" : "💀 RESY"}
            </p>
            <Button className="btn-gold mt-3" onClick={() => nav("/lobby")}>Hiverina amin'ny lobby</Button>
          </div>
        )}
      </div>
    </div>
  );
}
