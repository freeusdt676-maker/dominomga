import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { botStartStake, botSettle, BotDifficulty } from "@/lib/botGame";
import { fmtAr } from "@/lib/constants";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

type Ball = { x: number; y: number; vx: number; vy: number; color: string; in: boolean; isCue?: boolean; isEight?: boolean; group?: "solid" | "stripe" };

const W = 480, H = 260, R = 9, FRICTION = 0.985, POCKET = 16;
const POCKETS = [
  { x: 10, y: 10 }, { x: W / 2, y: 8 }, { x: W - 10, y: 10 },
  { x: 10, y: H - 10 }, { x: W / 2, y: H - 8 }, { x: W - 10, y: H - 10 },
];

function makeRack(): Ball[] {
  const balls: Ball[] = [];
  balls.push({ x: W * 0.25, y: H / 2, vx: 0, vy: 0, color: "#fff", in: false, isCue: true });
  const colors = ["#facc15","#3b82f6","#ef4444","#8b5cf6","#f97316","#22c55e","#a16207","#fde047","#60a5fa","#f87171","#a78bfa","#fdba74","#86efac","#92400e"];
  let idx = 0;
  const startX = W * 0.7, startY = H / 2;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      const x = startX + row * (R * 1.8);
      const y = startY + (col - row / 2) * (R * 2.05);
      const isEight = row === 2 && col === 1;
      const group: "solid" | "stripe" = idx % 2 === 0 ? "solid" : "stripe";
      balls.push({ x, y, vx: 0, vy: 0, color: isEight ? "#000" : colors[idx % colors.length], in: false, isEight, group: isEight ? undefined : group });
      idx++;
    }
  }
  return balls;
}

export default function BotBilliard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const stake = Number(params.get("stake") || 1000);
  const difficulty = (params.get("d") as BotDifficulty) || "medium";
  const [gameId, setGameId] = useState<string | null>(null);
  const [balls, setBalls] = useState<Ball[]>(makeRack());
  const [aiming, setAiming] = useState(false);
  const [aim, setAim] = useState({ x: 0, y: 0 });
  const [power, setPower] = useState(0);
  const [turn, setTurn] = useState<"you" | "bot">("you");
  const [potted, setPotted] = useState({ you: 0, bot: 0 });
  const [over, setOver] = useState<null | "won" | "lost">(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>();

  // Init: alaina ny stake
  useEffect(() => {
    if (!user) { nav("/"); return; }
    botStartStake("billiard", difficulty, stake).then((id) => {
      if (!id) nav("/lobby"); else setGameId(id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moving = useMemo(() => balls.some(b => !b.in && (Math.abs(b.vx) > 0.05 || Math.abs(b.vy) > 0.05)), [balls]);

  // Boucle physique + dessin
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const tick = () => {
      setBalls(prev => {
        const arr = prev.map(b => ({ ...b }));
        for (const b of arr) {
          if (b.in) continue;
          b.x += b.vx; b.y += b.vy;
          b.vx *= FRICTION; b.vy *= FRICTION;
          if (b.x < R + 6) { b.x = R + 6; b.vx *= -0.85; }
          if (b.x > W - R - 6) { b.x = W - R - 6; b.vx *= -0.85; }
          if (b.y < R + 6) { b.y = R + 6; b.vy *= -0.85; }
          if (b.y > H - R - 6) { b.y = H - R - 6; b.vy *= -0.85; }
          for (const p of POCKETS) {
            const dx = b.x - p.x, dy = b.y - p.y;
            if (Math.hypot(dx, dy) < POCKET) { b.in = true; b.vx = 0; b.vy = 0; break; }
          }
        }
        // collisions
        for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i], b = arr[j];
          if (a.in || b.in) continue;
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
          if (d < R * 2 && d > 0) {
            const nx = dx / d, ny = dy / d;
            const overlap = R * 2 - d;
            a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
            b.x += nx * overlap / 2; b.y += ny * overlap / 2;
            const dvx = b.vx - a.vx, dvy = b.vy - a.vy;
            const dot = dvx * nx + dvy * ny;
            if (dot < 0) {
              a.vx += dot * nx; a.vy += dot * ny;
              b.vx -= dot * nx; b.vy -= dot * ny;
            }
          }
        }
        return arr;
      });
      // draw
      ctx.fillStyle = "#0a3a1f";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "#ca8a04"; ctx.lineWidth = 5;
      ctx.strokeRect(2, 2, W - 4, H - 4);
      for (const p of POCKETS) {
        ctx.fillStyle = "#000";
        ctx.beginPath(); ctx.arc(p.x, p.y, POCKET - 4, 0, Math.PI * 2); ctx.fill();
      }
      for (const b of balls) {
        if (b.in) continue;
        ctx.fillStyle = b.color;
        ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, Math.PI * 2); ctx.fill();
        if (b.group === "stripe" && !b.isCue && !b.isEight) {
          ctx.fillStyle = "#fff";
          ctx.fillRect(b.x - R, b.y - 2, R * 2, 4);
        }
        ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 1; ctx.stroke();
      }
      // aim line
      if (aiming && turn === "you" && !moving) {
        const cue = balls.find(b => b.isCue && !b.in);
        if (cue) {
          ctx.strokeStyle = "rgba(255,255,255,0.6)";
          ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(cue.x, cue.y); ctx.lineTo(aim.x, aim.y); ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [balls, aiming, aim, turn, moving]);

  // Fin de tour: comptabilité + Bot
  useEffect(() => {
    if (moving || over || !gameId) return;
    // Compter les bilins voa
    const numbered = balls.filter(b => !b.isCue && !b.isEight);
    const inCount = numbered.filter(b => b.in).length;
    const eightIn = balls.find(b => b.isEight)?.in;
    const cueIn = balls.find(b => b.isCue)?.in;

    if (cueIn) {
      // remettre cue
      setBalls(prev => prev.map(b => b.isCue ? { ...b, in: false, x: W * 0.25, y: H / 2, vx: 0, vy: 0 } : b));
    }
    if (eightIn) {
      // mandresy raha efa nataony daholo ny azy (tsotra: raha mihoatra ny 5)
      const youWin = potted.you >= 5;
      finish(youWin);
      return;
    }
    if (inCount >= 7) {
      finish(potted.you > potted.bot);
      return;
    }
    if (turn === "bot") {
      setTimeout(() => botPlay(), 600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moving]);

  const finish = async (won: boolean) => {
    setOver(won ? "won" : "lost");
    if (gameId) {
      const payout = await botSettle(gameId, won);
      if (won) toast.success(`Nahazo ${fmtAr(payout)} ✨`);
      else toast.error(`Resy — very ${fmtAr(stake)}`);
    }
  };

  const handlePointer = (e: React.PointerEvent) => {
    if (turn !== "you" || moving || over) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    setAim({ x, y });
    if (e.type === "pointerdown") setAiming(true);
    if (e.type === "pointerup" && aiming) {
      shoot(x, y);
      setAiming(false);
    }
  };

  const shoot = (tx: number, ty: number) => {
    setBalls(prev => prev.map(b => {
      if (!b.isCue || b.in) return b;
      const dx = tx - b.x, dy = ty - b.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const force = Math.min(d / 8, 14);
      return { ...b, vx: (dx / d) * force, vy: (dy / d) * force };
    }));
    // count: vola ho an'ny mpilalao
    setTimeout(() => {
      setPotted(p => {
        const numbered = balls.filter(b => !b.isCue && !b.isEight);
        const inNow = numbered.filter(b => b.in).length;
        return { ...p, you: inNow };
      });
      setTurn("bot");
    }, 1200);
  };

  const botPlay = () => {
    const cue = balls.find(b => b.isCue && !b.in);
    if (!cue) { setTurn("you"); return; }
    const targets = balls.filter(b => !b.in && !b.isCue);
    if (!targets.length) { setTurn("you"); return; }
    const target = targets[Math.floor(Math.random() * targets.length)];
    // accuracy: easy mora diso, hard mahay
    const noise = difficulty === "easy" ? 60 : difficulty === "medium" ? 25 : 6;
    const tx = target.x + (Math.random() - 0.5) * noise;
    const ty = target.y + (Math.random() - 0.5) * noise;
    setBalls(prev => prev.map(b => {
      if (!b.isCue || b.in) return b;
      const dx = tx - b.x, dy = ty - b.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const force = difficulty === "hard" ? 13 : 10;
      return { ...b, vx: (dx / d) * force, vy: (dy / d) * force };
    }));
    setTimeout(() => {
      setPotted(p => {
        const all = balls.filter(b => !b.isCue && !b.isEight);
        const inNow = all.filter(b => b.in).length;
        const botGain = Math.max(0, inNow - p.you - p.bot);
        return { ...p, bot: p.bot + botGain };
      });
      setTurn("you");
    }, 1500);
  };

  return (
    <div className="min-h-screen felt-bg">
      <header className="p-4 flex items-center gap-3 border-b border-primary/20">
        <Button variant="ghost" size="icon" onClick={() => nav("/lobby")}><ArrowLeft /></Button>
        <h1 className="font-display text-xl font-bold gold-text flex-1">Billard vs Bot</h1>
        <span className="text-xs text-muted-foreground">Mise: <b className="gold-text">{fmtAr(stake)}</b></span>
      </header>
      <div className="p-3 max-w-2xl mx-auto space-y-3">
        <div className="card-felt rounded-xl p-3 flex justify-between text-sm">
          <span>Anao: <b className="gold-text">{potted.you}</b></span>
          <span className={turn === "you" ? "text-green-500 font-bold" : "text-muted-foreground"}>{turn === "you" ? "🎯 Anao ny dingana" : "🤖 Mandinika ny Bot..."}</span>
          <span>Bot: <b>{potted.bot}</b></span>
        </div>
        <div className="card-felt rounded-xl p-2">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="w-full touch-none rounded-lg"
            style={{ aspectRatio: `${W}/${H}` }}
            onPointerDown={handlePointer}
            onPointerMove={handlePointer}
            onPointerUp={handlePointer}
          />
          <p className="text-[10px] text-center text-muted-foreground mt-1">Tsindrio sy sintony ny làlana hiantefan'ny baolina fotsy → avoahy</p>
        </div>
        {over && (
          <div className="card-felt rounded-xl p-4 text-center">
            <p className={`text-2xl font-display font-bold ${over === "won" ? "gold-text" : "text-destructive"}`}>
              {over === "won" ? "🏆 NAHAZO!" : "💀 RESY"}
            </p>
            <Button className="btn-gold mt-3" onClick={() => nav("/lobby")}><RotateCcw className="w-4 h-4 mr-1" />Hiverina amin'ny lobby</Button>
          </div>
        )}
      </div>
    </div>
  );
}
