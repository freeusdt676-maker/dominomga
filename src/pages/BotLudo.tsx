import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Dice5 } from "lucide-react";
import { botStartStake, botSettle, BotDifficulty } from "@/lib/botGame";
import { fmtAr } from "@/lib/constants";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

// Ludo simplifié: 4 pions chaque, course sur 30 cases. Hard = bot prend toujours optimum, Easy = aléatoire.
const TRACK = 30;

type State = { you: number[]; bot: number[]; turn: "you" | "bot"; dice: number; rolling: boolean };

export default function BotLudo() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const stake = Number(params.get("stake") || 1000);
  const difficulty = (params.get("d") as BotDifficulty) || "medium";
  const [gameId, setGameId] = useState<string | null>(null);
  const [s, setS] = useState<State>({ you: [0, 0, 0, 0], bot: [0, 0, 0, 0], turn: "you", dice: 0, rolling: false });
  const [over, setOver] = useState<null | "won" | "lost">(null);

  useEffect(() => {
    if (!user) { nav("/"); return; }
    botStartStake("ludo", difficulty, stake).then((id) => {
      if (!id) nav("/lobby"); else setGameId(id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = async (won: boolean) => {
    if (over) return;
    setOver(won ? "won" : "lost");
    if (gameId) {
      const payout = await botSettle(gameId, won);
      if (won) toast.success(`Nahazo ${fmtAr(payout)} ✨`);
      else toast.error(`Resy — very ${fmtAr(stake)}`);
    }
  };

  const checkWin = (pawns: number[]) => pawns.every(p => p >= TRACK);

  const rollAndMoveYou = (idx: number) => {
    if (s.rolling || s.turn !== "you" || over) return;
    const dice = 1 + Math.floor(Math.random() * 6);
    setS(p => ({ ...p, dice, rolling: true }));
    setTimeout(() => {
      setS(p => {
        const np = [...p.you];
        if (np[idx] + dice <= TRACK) np[idx] += dice;
        const next: State = { ...p, you: np, rolling: false, turn: dice === 6 ? "you" : "bot" };
        if (checkWin(np)) { setTimeout(() => finish(true), 200); }
        else if (next.turn === "bot") setTimeout(() => botTurn(), 700);
        return next;
      });
    }, 400);
  };

  const botTurn = () => {
    setS(p => {
      if (p.turn !== "bot" || over) return p;
      const dice = 1 + Math.floor(Math.random() * 6);
      const np = [...p.bot];
      // strategy
      let idx = 0;
      if (difficulty === "hard") {
        // pion le plus avancé qui peut bouger
        let best = -1, bestVal = -1;
        np.forEach((v, i) => { if (v + dice <= TRACK && v > bestVal) { bestVal = v; best = i; } });
        idx = best >= 0 ? best : 0;
      } else if (difficulty === "medium") {
        const eligible = np.map((v, i) => ({ v, i })).filter(o => o.v + dice <= TRACK);
        idx = eligible.length ? eligible[Math.floor(Math.random() * eligible.length)].i : 0;
      } else {
        idx = Math.floor(Math.random() * 4);
      }
      if (np[idx] + dice <= TRACK) np[idx] += dice;
      const win = checkWin(np);
      if (win) setTimeout(() => finish(false), 200);
      const nextTurn = dice === 6 && !win ? "bot" : "you";
      if (dice === 6 && !win) setTimeout(() => botTurn(), 700);
      return { ...p, bot: np, dice, turn: nextTurn };
    });
  };

  const Lane = ({ label, pawns, color }: { label: string; pawns: number[]; color: string }) => (
    <div className="card-felt rounded-xl p-3">
      <p className="text-xs text-muted-foreground mb-2">{label}</p>
      <div className="space-y-2">
        {pawns.map((pos, i) => (
          <div key={i} className="relative h-7 bg-muted/20 rounded-full overflow-hidden">
            <div className="absolute inset-y-0 left-0 transition-all" style={{ width: `${(pos / TRACK) * 100}%`, background: color }} />
            <div className="absolute inset-0 flex items-center justify-between px-2 text-[10px] font-bold">
              <span>P{i + 1}</span>
              <span>{pos}/{TRACK}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen felt-bg">
      <header className="p-4 flex items-center gap-3 border-b border-primary/20">
        <Button variant="ghost" size="icon" onClick={() => nav("/lobby")}><ArrowLeft /></Button>
        <h1 className="font-display text-xl font-bold gold-text flex-1">Ludo vs Bot</h1>
        <span className="text-xs text-muted-foreground">Mise: <b className="gold-text">{fmtAr(stake)}</b></span>
      </header>
      <div className="p-3 max-w-md mx-auto space-y-3">
        <Lane label="🤖 Bot" pawns={s.bot} color="hsl(var(--destructive))" />
        <Lane label="🎯 Anao" pawns={s.you} color="hsl(var(--primary))" />

        <div className="card-felt rounded-xl p-4 text-center">
          <p className="text-sm mb-2">{s.turn === "you" ? "Misafidiana pion ho ampandrosoina" : "Mandinika ny Bot..."}</p>
          <div className="flex items-center justify-center gap-3 mb-3">
            <Dice5 className="w-8 h-8 text-primary" />
            <span className="text-3xl font-display gold-text font-bold">{s.dice || "—"}</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {s.you.map((_, i) => (
              <Button key={i} disabled={s.turn !== "you" || over !== null} onClick={() => rollAndMoveYou(i)} className="btn-gold">
                P{i + 1}
              </Button>
            ))}
          </div>
        </div>

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
