import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtAr } from "@/lib/constants";
import { ArrowLeft, Loader2, Rocket, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type Round = {
  id: string;
  round_no: number;
  status: "betting" | "running" | "crashed";
  server_seed_hash: string;
  betting_ends_at: string;
  started_at: string | null;
  crashed_at: string | null;
  next_at: string | null;
  crash_point: number | null;
  server_now: string;
};

type Bet = {
  id: string; round_id: string; amount: number; auto_cashout: number | null;
  cashout_multiplier: number | null; payout: number; status: string; created_at: string;
};

const GROWTH = 0.08;
const multAt = (elapsedSec: number) =>
  Math.max(1, Math.floor(Math.exp(GROWTH * Math.max(elapsedSec, 0)) * 100) / 100);

const AMOUNTS = [100, 500, 1000, 5000, 10000];
const MIN_BET = 100;
const MAX_BET = 10000;

// --- Sound (Web Audio, no assets) ---
let audioCtx: AudioContext | null = null;
const ac = () => (audioCtx ??= new (window.AudioContext || (window as any).webkitAudioContext)());
function playExplosion() {
  try {
    const ctx = ac();
    if (ctx.state === "suspended") ctx.resume();
    const dur = 1.1;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / d.length;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.2);
    }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(1800, ctx.currentTime);
    lp.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.9, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(lp); lp.connect(g); g.connect(ctx.destination);
    src.start();
    // low boom
    const o = ctx.createOscillator(); const og = ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(160, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(35, ctx.currentTime + 0.7);
    og.gain.setValueAtTime(0.7, ctx.currentTime);
    og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    o.connect(og); og.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.85);
    if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
  } catch { /* ignore */ }
}

export default function CrashGame() {
  const { user } = useAuth();
  const nav = useNavigate();

  const [round, setRound] = useState<Round | null>(null);
  const [offset, setOffset] = useState(0); // serverNow - clientNow (ms)
  const [now, setNow] = useState(Date.now());
  const [balance, setBalance] = useState<number>(0);
  const [amount, setAmount] = useState<number>(1000);
  const [autoCashout, setAutoCashout] = useState<string>("");
  const [myBet, setMyBet] = useState<Bet | null>(null);
  const [history, setHistory] = useState<Round[]>([]);
  const [myBets, setMyBets] = useState<Bet[]>([]);
  const [busy, setBusy] = useState(false);
  const lastRoundId = useRef<string | null>(null);
  const lastCrashSound = useRef<string | null>(null);

  const serverNow = () => now + offset;

  const loadBalance = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle();
    setBalance(Number(data?.balance ?? 0));
  }, [user]);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    const [{ data: rounds }, { data: bets }] = await Promise.all([
      supabase.from("crash_rounds").select("*").eq("status", "crashed").order("round_no", { ascending: false }).limit(24),
      supabase.from("crash_bets").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    ]);
    setHistory((rounds ?? []) as unknown as Round[]);
    setMyBets((bets ?? []) as unknown as Bet[]);
  }, [user]);

  const loadMyBet = useCallback(async (roundId: string) => {
    if (!user) return;
    const { data } = await supabase.from("crash_bets").select("*").eq("round_id", roundId).eq("user_id", user.id).maybeSingle();
    setMyBet((data ?? null) as unknown as Bet | null);
  }, [user]);

  // Drive + read the server state machine
  const tick = useCallback(async () => {
    const { data, error } = await supabase.rpc("crash_tick");
    if (error) return;
    const r = data as unknown as Round;
    if (!r?.id) return;
    setOffset(new Date(r.server_now).getTime() - Date.now());
    setRound(r);
    if (lastRoundId.current !== r.id) {
      lastRoundId.current = r.id;
      setMyBet(null);
      loadMyBet(r.id);
      loadHistory();
      loadBalance();
    }
  }, [loadMyBet, loadHistory, loadBalance]);

  useEffect(() => { if (user) { tick(); loadBalance(); loadHistory(); } }, [user, tick, loadBalance, loadHistory]);

  useEffect(() => {
    const poll = setInterval(tick, 900);
    const frame = setInterval(() => setNow(Date.now()), 60);
    return () => { clearInterval(poll); clearInterval(frame); };
  }, [tick]);

  // refresh bet + balance when the round settles
  useEffect(() => {
    if (round?.status === "crashed" && round.id) {
      if (lastCrashSound.current !== round.id) { lastCrashSound.current = round.id; playExplosion(); }
      loadMyBet(round.id);
      loadBalance();
      loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.status, round?.id]);

  const elapsed = round?.started_at ? (serverNow() - new Date(round.started_at).getTime()) / 1000 : 0;
  const liveMult = round?.status === "running" ? multAt(elapsed) : 1;
  const shownMult = round?.status === "crashed" ? Number(round.crash_point ?? 1) : liveMult;
  const betCountdown = round?.status === "betting"
    ? Math.max(0, (new Date(round.betting_ends_at).getTime() - serverNow()) / 1000) : 0;
  const nextCountdown = round?.status === "crashed" && round.next_at
    ? Math.max(0, (new Date(round.next_at).getTime() - serverNow()) / 1000) : 0;

  const canBet = round?.status === "betting" && !myBet && betCountdown > 0.4;
  const canCashout = round?.status === "running" && myBet?.status === "placed";

  const placeBet = async () => {
    if (!canBet || busy) return;
    if (amount > balance) { toast.error("Tsy ampy ny solde"); return; }
    setBusy(true);
    const auto = autoCashout.trim() ? Number(autoCashout.replace(",", ".")) : null;
    const { error } = await supabase.rpc("crash_place_bet", { _amount: amount, _auto_cashout: auto && auto >= 1.01 ? auto : null });
    setBusy(false);
    if (error) { toast.error(errMsg(error.message)); return; }
    toast.success(`Mise ${fmtAr(amount)} voaray`);
    if (round) loadMyBet(round.id);
    loadBalance();
  };

  const cashout = async () => {
    if (!canCashout || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("crash_cashout");
    setBusy(false);
    if (error) { toast.error(errMsg(error.message)); return; }
    const res = data as any;
    if (res?.ok) toast.success(`Cashout ×${Number(res.multiplier).toFixed(2)} → ${fmtAr(res.payout)}`);
    else toast.error("Tara loatra — crash!");
    if (round) loadMyBet(round.id);
    loadBalance();
  };

  const curve = useMemo(() => buildCurve(shownMult), [shownMult]);
  const plane = useMemo(() => curveTip(shownMult), [shownMult]);
  const crashed = round?.status === "crashed";

  if (!user) {
    return (
      <div className="min-h-[100svh] flex items-center justify-center p-6 text-center">
        <div>
          <p className="mb-3">Midira aloha mba hilalao Crash MGA.</p>
          <Button onClick={() => nav("/")}>Hiverina</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100svh] bg-gradient-to-b from-[#0a0f1e] to-[#050810] text-white pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto w-full max-w-md px-3 pt-3 space-y-3">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={() => nav("/")} aria-label="Hiverina">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Rocket className="w-5 h-5 text-amber-400" /> Crash MGA
          </h1>
          <span className="ml-auto text-sm font-semibold text-amber-300">{fmtAr(balance)}</span>
        </div>

        {/* Graph */}
        <div className="relative rounded-2xl border border-white/10 bg-black/50 overflow-hidden">
          <svg viewBox="0 0 300 170" className="w-full h-[38svh] max-h-[280px]" preserveAspectRatio="none">
            <defs>
              <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={round?.status === "crashed" ? "#ef4444" : "#22c55e"} stopOpacity="0.45" />
                <stop offset="100%" stopColor="#000" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${curve} L 300 170 L 0 170 Z`} fill="url(#cg)" />
            <path d={curve} fill="none" stroke={round?.status === "crashed" ? "#ef4444" : "#22c55e"} strokeWidth="2.5" />
          </svg>
          {/* Airplane flying along the curve */}
          <div
            className="absolute pointer-events-none transition-transform duration-100"
            style={{
              left: `${(plane.x / 300) * 100}%`,
              top: `${(plane.y / 170) * 100}%`,
              transform: `translate(-50%,-50%) rotate(${-plane.angle}deg) ${crashed ? "scale(1.15)" : ""}`,
            }}
          >
            <span
              className={crashed ? "block text-2xl animate-ping" : "block text-2xl"}
              style={{ filter: crashed ? "drop-shadow(0 0 10px #ef4444)" : "drop-shadow(0 0 6px #22c55e)" }}
            >
              {crashed ? "💥" : "✈️"}
            </span>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className={`font-mono font-black tabular-nums leading-none ${round?.status === "crashed" ? "text-red-500" : "text-white"}`}
              style={{ fontSize: "clamp(2.2rem, 13vw, 4rem)" }}>
              ×{shownMult.toFixed(2)}
            </span>
            {round?.status === "betting" && (
              <span className="mt-2 text-sm text-amber-300">Mise misokatra — {betCountdown.toFixed(1)}s</span>
            )}
            {round?.status === "crashed" && (
              <span className="mt-2 text-sm text-red-300">CRASH! Tour manaraka {nextCountdown.toFixed(0)}s</span>
            )}
            {round?.status === "running" && myBet?.status === "cashed" && (
              <span className="mt-2 text-sm text-emerald-400">Cashout ×{Number(myBet.cashout_multiplier).toFixed(2)} · {fmtAr(myBet.payout)}</span>
            )}
          </div>
          <div className="absolute top-2 left-2 text-[10px] text-white/50">Tour #{round?.round_no ?? "—"}</div>
        </div>

        {/* History strip */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {history.map((h) => {
            const cp = Number(h.crash_point ?? 1);
            return (
              <span key={h.id}
                className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${cp >= 10 ? "bg-amber-500/20 text-amber-300" : cp >= 2 ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
                ×{cp.toFixed(2)}
              </span>
            );
          })}
          {history.length === 0 && <span className="text-xs text-white/40">Tsy mbola misy historique</span>}
        </div>

        {/* Bet panel */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 space-y-3">
          <div className="grid grid-cols-5 gap-1.5">
            {AMOUNTS.map((a) => (
              <button key={a} onClick={() => setAmount(a)} disabled={!canBet}
                className={`rounded-lg py-2 text-[11px] font-bold transition ${amount === a ? "bg-amber-500 text-black" : "bg-white/10 text-white/80"} disabled:opacity-40`}>
                {a / 1000 >= 1 ? `${a / 1000}K` : a}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-white/50">Mise (Ar)</label>
              <Input type="number" inputMode="numeric" min={100} max={100000} value={amount} disabled={!canBet}
                onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                className="bg-black/40 border-white/15 text-white h-10" />
            </div>
            <div>
              <label className="text-[10px] text-white/50">Auto cashout (×)</label>
              <Input type="number" inputMode="decimal" step="0.01" min={1.01} placeholder="ex: 2.00" value={autoCashout}
                disabled={!canBet} onChange={(e) => setAutoCashout(e.target.value)}
                className="bg-black/40 border-white/15 text-white h-10" />
            </div>
          </div>

          {canCashout ? (
            <Button onClick={cashout} disabled={busy}
              className="w-full h-14 text-lg font-black bg-emerald-500 hover:bg-emerald-400 text-black">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : `CASHOUT ×${liveMult.toFixed(2)} → ${fmtAr(Math.floor((myBet?.amount ?? 0) * liveMult))}`}
            </Button>
          ) : (
            <Button onClick={placeBet} disabled={!canBet || busy || amount < 100}
              className="w-full h-14 text-lg font-black bg-amber-500 hover:bg-amber-400 text-black disabled:opacity-50">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" />
                : myBet ? (myBet.status === "placed" ? "Mise voaray — miandry départ" : myBet.status === "cashed" ? `Nahazo ${fmtAr(myBet.payout)}` : "Very ny mise")
                : round?.status === "betting" ? `MISE ${fmtAr(amount)}` : "Miandry tour vaovao…"}
            </Button>
          )}
        </div>

        {/* Provably fair */}
        <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-[11px] text-white/60 flex gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            Provably fair — hash: <span className="font-mono break-all">{round?.server_seed_hash?.slice(0, 24)}…</span>
            <br />Multiplicateur ×1.00 → ×999.00, marge 1%.
          </span>
        </div>

        {/* My bets */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs font-bold mb-2 text-white/70">Historique ny misesiko</p>
          <div className="space-y-1 max-h-56 overflow-y-auto">
            {myBets.map((b) => (
              <div key={b.id} className="flex items-center justify-between text-xs bg-black/30 rounded-lg px-2 py-1.5">
                <span className="text-white/60">{new Date(b.created_at).toLocaleString("fr-FR")}</span>
                <span>{fmtAr(b.amount)}</span>
                <span className={b.status === "cashed" ? "text-emerald-400 font-bold" : b.status === "lost" ? "text-red-400" : "text-amber-300"}>
                  {b.status === "cashed" ? `×${Number(b.cashout_multiplier).toFixed(2)} · ${fmtAr(b.payout)}` : b.status === "lost" ? "Very" : "En cours"}
                </span>
              </div>
            ))}
            {myBets.length === 0 && <p className="text-xs text-white/40">Tsy mbola nisy mise.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function curveY(f: number, maxM: number) {
  const m = 1 + (maxM - 1) * Math.pow(f, 1.9);
  return 170 - ((m - 1) / (maxM - 1 || 1)) * 150 - 8;
}

export function curveTip(mult: number) {
  const maxM = Math.max(mult, 1.2);
  const y = curveY(1, maxM);
  const yPrev = curveY(0.96, maxM);
  const angle = (Math.atan2(yPrev - y, 300 - 288) * 180) / Math.PI;
  return { x: 300, y, angle };
}

function buildCurve(mult: number) {
  const pts: string[] = [];
  const steps = 40;
  const maxM = Math.max(mult, 1.2);
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const x = f * 300;
    const y = curveY(f, maxM);
    pts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return pts.join(" ");
}

function errMsg(raw: string) {
  if (raw.includes("insufficient_balance")) return "Tsy ampy ny solde";
  if (raw.includes("betting_closed")) return "Efa mihidy ny mise amin'ity tour ity";
  if (raw.includes("already_bet")) return "Efa nametraka mise ianao";
  if (raw.includes("game_blocked")) return "Voasakana ny lalao Crash";
  if (raw.includes("account_not_active")) return "Tsy mbola active ny compte-nao";
  if (raw.includes("invalid_amount")) return "Mise tsy mety (100 – 10 000 Ar)";
  if (raw.includes("not_running")) return "Tsy mandeha ny tour";
  return raw;
}
