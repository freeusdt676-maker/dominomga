import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtAr } from "@/lib/constants";
import { ArrowLeft, Copy, Loader2, Rocket, ShieldCheck, Volume2, VolumeX, WifiOff } from "lucide-react";
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

type PublicBet = {
  bet_id: string; masked_phone: string; amount: number;
  cashout_multiplier: number | null; payout: number; status?: string;
};

const GROWTH = 0.08;
const multAt = (elapsedSec: number) =>
  Math.max(1, Math.floor(Math.exp(GROWTH * Math.max(elapsedSec, 0)) * 100) / 100);

const AMOUNTS = [100, 500, 1000, 5000, 10000];
const MIN_BET = 100;
const MAX_BET = 10000;

// --- Sound (Web Audio, no assets) ---
let audioCtx: AudioContext | null = null;
const MUTE_KEY = "crash_muted";
let muted = localStorage.getItem(MUTE_KEY) === "1";
export const setCrashMuted = (v: boolean) => { muted = v; localStorage.setItem(MUTE_KEY, v ? "1" : "0"); };
const ac = () => (audioCtx ??= new (window.AudioContext || (window as any).webkitAudioContext)());

// --- Airplane engine loop (soft turbine) ---
let engine: { osc: OscillatorNode[]; gain: GainNode; noise: AudioBufferSourceNode } | null = null;
function startEngine() {
  try {
    if (muted || engine) return;
    const ctx = ac();
    if (ctx.state === "suspended") ctx.resume();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.8);
    gain.connect(ctx.destination);
    // turbine hiss
    const dur = 2;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    const noise = ctx.createBufferSource();
    noise.buffer = buf; noise.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 0.8;
    noise.connect(bp); bp.connect(gain); noise.start();
    const osc: OscillatorNode[] = [];
    [90, 136].forEach((f) => {
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.18;
      o.connect(g); g.connect(gain); o.start(); osc.push(o);
    });
    engine = { osc, gain, noise };
  } catch { /* ignore */ }
}
function engineRise(mult: number) {
  try {
    if (!engine) return;
    const ctx = ac();
    const k = Math.min(1, Math.log(Math.max(mult, 1)) / 2.5);
    engine.osc.forEach((o, i) => o.frequency.setTargetAtTime((i ? 136 : 90) * (1 + k * 1.6), ctx.currentTime, 0.3));
  } catch { /* ignore */ }
}
function stopEngine() {
  try {
    if (!engine) return;
    const ctx = ac();
    const e = engine; engine = null;
    e.gain.gain.cancelScheduledValues(ctx.currentTime);
    e.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12);
    setTimeout(() => { try { e.osc.forEach((o) => o.stop()); e.noise.stop(); } catch { /* ignore */ } }, 500);
  } catch { /* ignore */ }
}

// --- Win jingle (cashout) ---
function playWin() {
  try {
    if (muted) return;
    const ctx = ac();
    if (ctx.state === "suspended") ctx.resume();
    [[880, 0], [1174, 0.11], [1568, 0.22], [2093, 0.34]].forEach(([f, t]) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "triangle"; o.frequency.value = f as number;
      const t0 = ctx.currentTime + (t as number);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      o.connect(g); g.connect(ctx.destination); o.start(t0); o.stop(t0 + 0.4);
    });
    if (navigator.vibrate) navigator.vibrate([25, 40, 25]);
  } catch { /* ignore */ }
}

function playExplosion() {
  try {
    if (muted) return;
    const ctx = ac();
    if (ctx.state === "suspended") ctx.resume();
    // Soft "fly away" descending whoosh — tsy manaitra be
    const dur = 0.9;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / d.length;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 1.4) * 0.5;
    }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(1400, ctx.currentTime);
    bp.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.28, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(bp); bp.connect(g); g.connect(ctx.destination); src.start();
    // gentle descending tone
    const o = ctx.createOscillator(); const og = ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(420, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.8);
    og.gain.setValueAtTime(0.22, ctx.currentTime);
    og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.85);
    o.connect(og); og.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.9);
    if (navigator.vibrate) navigator.vibrate(40);
  } catch { /* ignore */ }
}

// Realistic night-flight airplane (SVG) with landing light + nav lights
function Plane3D({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="bodyG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f8fbff" />
          <stop offset="35%" stopColor="#c9d5e6" />
          <stop offset="70%" stopColor="#8b97a8" />
          <stop offset="100%" stopColor="#3f4855" />
        </linearGradient>
        <linearGradient id="wingG" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#dbe4f0" />
          <stop offset="100%" stopColor="#4a5462" />
        </linearGradient>
        <linearGradient id="finG" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
        <linearGradient id="beamG" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor="#fff7cc" stopOpacity="0" />
          <stop offset="100%" stopColor="#fff3b0" stopOpacity="0.85" />
        </linearGradient>
        <radialGradient id="lampG">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* landing light beam ahead of the nose */}
      <path d="M58 31.2 L64 26 L64 38 L58 32.8 Z" fill="url(#beamG)" opacity="0.9">
        <animate attributeName="opacity" values="0.55;1;0.55" dur="1.6s" repeatCount="indefinite" />
      </path>
      {/* rear wings */}
      <path d="M28 34 L10 46 L20 47 L33 39 Z" fill="url(#wingG)" opacity="0.85" />
      <path d="M30 26 L12 16 L22 15 L34 23 Z" fill="url(#wingG)" opacity="0.7" />
      {/* nav lights: red left, green right */}
      <circle cx="12" cy="16.5" r="1.5" fill="#ef4444">
        <animate attributeName="opacity" values="1;0.15;1" dur="1.2s" repeatCount="indefinite" />
      </circle>
      <circle cx="10.5" cy="46" r="1.5" fill="#22c55e">
        <animate attributeName="opacity" values="0.15;1;0.15" dur="1.2s" repeatCount="indefinite" />
      </circle>
      {/* tail fin */}
      <path d="M14 32 L6 24 L9 34 L6 42 Z" fill="url(#finG)" />
      {/* fuselage */}
      <path d="M8 32 Q26 24 52 30 Q58 31.5 58 32 Q58 32.5 52 34 Q26 40 8 32 Z" fill="url(#bodyG)" stroke="#4b5563" strokeWidth="0.6" />
      {/* windows */}
      <circle cx="46" cy="31.4" r="1.3" fill="#7dd3fc" />
      <circle cx="40" cy="31.2" r="1" fill="#bae6fd" opacity="0.9" />
      <circle cx="35" cy="31.2" r="1" fill="#bae6fd" opacity="0.75" />
      {/* engine */}
      <ellipse cx="30" cy="35.5" rx="5" ry="2.4" fill="#94a3b8" stroke="#475569" strokeWidth="0.5" />
      {/* nose lamp glow */}
      <circle cx="58" cy="32" r="4" fill="url(#lampG)" opacity="0.9" />
    </svg>
  );
}

export default function CrashGame() {
  const { user } = useAuth();
  const nav = useNavigate();

  const [round, setRound] = useState<Round | null>(null);
  const [offset, setOffset] = useState(0); // serverNow - clientNow (ms)
  const [now, setNow] = useState(Date.now());
  const [balance, setBalance] = useState<number>(0);
  const [amounts, setAmounts] = useState<number[]>([1000, 1000]);
  const [autoCashouts, setAutoCashouts] = useState<string[]>(["", ""]);
  const [roundBets, setRoundBets] = useState<Bet[]>([]);
  const [lastAmount, setLastAmount] = useState<number>(1000);
  const [history, setHistory] = useState<Round[]>([]);
  const [myBets, setMyBets] = useState<Bet[]>([]);
  const [allBets, setAllBets] = useState<PublicBet[]>([]);
  const [topGains, setTopGains] = useState<PublicBet[]>([]);
  const [tab, setTab] = useState<"all" | "mine" | "top">("all");
  const [busy, setBusy] = useState(false);
  const [silent, setSilent] = useState(() => localStorage.getItem("crash_muted") === "1");
  const lastRoundId = useRef<string | null>(null);
  const lastCrashSound = useRef<string | null>(null);
  const [betOk, setBetOk] = useState(false);
  const [winFx, setWinFx] = useState<string | null>(null);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [connLost, setConnLost] = useState(false);
  const [shake, setShake] = useState(false);
  const [result, setResult] = useState<{ win: boolean; text: string; sub: string } | null>(null);

  const serverNow = () => now + offset;

  // --- Error guards: never let a failed request break the loop / crash the page ---
  const ticking = useRef(false);
  const alive = useRef(true);
  const syncSamples = useRef<{ off: number; rtt: number }[]>([]);
  useEffect(() => () => { alive.current = false; }, []);
  const safe = async <T,>(fn: () => PromiseLike<T>): Promise<T | null> => {
    try { return await fn(); } catch (e) { console.warn("[crash]", e); return null; }
  };

  const loadBalance = useCallback(async () => {
    if (!user) return;
    const res = await safe(() => supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle());
    if (!res || res.error || !alive.current) return;
    setBalance(Number(res.data?.balance ?? 0));
  }, [user]);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    const res = await safe(() => Promise.all([
      supabase.from("crash_rounds").select("*").eq("status", "crashed").order("round_no", { ascending: false }).limit(1),
      supabase.from("crash_bets").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    ]));
    if (!res || !alive.current) return;
    const [{ data: rounds }, { data: bets }] = res;
    setHistory((rounds ?? []) as unknown as Round[]);
    setMyBets((bets ?? []) as unknown as Bet[]);
  }, [user]);

  const loadMyBet = useCallback(async (roundId: string) => {
    if (!user || !roundId) return;
    const res = await safe(() => supabase.from("crash_bets").select("*").eq("round_id", roundId).eq("user_id", user.id).order("created_at", { ascending: true }));
    if (!res || res.error || !alive.current) return;
    setRoundBets((res.data ?? []) as unknown as Bet[]);
  }, [user]);

  const loadPublic = useCallback(async () => {
    if (!user) return;
    const res = await safe(() => Promise.all([
      supabase.rpc("crash_round_bets", { _round_id: null }),
      supabase.rpc("crash_top_gains_today"),
    ]));
    if (!res || !alive.current) return;
    const [{ data: all }, { data: top }] = res;
    setAllBets((all ?? []) as unknown as PublicBet[]);
    setTopGains((top ?? []) as unknown as PublicBet[]);
  }, [user]);

  // Drive + read the server state machine
  const tick = useCallback(async () => {
    if (ticking.current) return;
    ticking.current = true;
    const t0 = Date.now();
    const res = await safe(() => supabase.rpc("crash_tick"));
    const t1 = Date.now();
    ticking.current = false;
    if (!res || res.error || !alive.current) return;
    const r = res.data as unknown as Round;
    if (!r?.id || !r.server_now) return;
    const srvMs = new Date(r.server_now).getTime();
    if (Number.isFinite(srvMs)) {
      // Latency-compensated clock sync (NTP style): the server timestamp is taken
      // roughly mid-flight, so add half the round trip. Keep the median of the
      // samples with the lowest RTT so slow Wi-Fi / data links converge to the
      // very same server clock => identical live game on every device.
      const rtt = t1 - t0;
      const sample = srvMs + rtt / 2 - t1;
      const arr = syncSamples.current;
      arr.push({ off: sample, rtt });
      if (arr.length > 12) arr.shift();
      const best = [...arr].sort((a, b) => a.rtt - b.rtt).slice(0, 5).map((s) => s.off).sort((a, b) => a - b);
      const median = best[Math.floor(best.length / 2)];
      if (Number.isFinite(median)) setOffset(median);
    }
    setRound(r);
    if (lastRoundId.current !== r.id) {
      lastRoundId.current = r.id;
      setRoundBets([]);
      loadMyBet(r.id);
      loadHistory();
      loadBalance();
    } else if (r.status === "running") {
      // keep slots in sync so a server-side auto cashout shows up instantly
      loadMyBet(r.id);
    }
  }, [loadMyBet, loadHistory, loadBalance]);

  useEffect(() => { if (user) { tick(); loadBalance(); loadHistory(); } }, [user, tick, loadBalance, loadHistory]);

  // Celebrate server-side auto cashouts (win sound + balance refresh)
  const seenCashed = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const b of roundBets) {
      if (b.status === "cashed" && !seenCashed.current.has(b.id)) {
        seenCashed.current.add(b.id);
        playWin();
        setWinFx(`+${fmtAr(Number(b.payout || 0))} · ×${Number(b.cashout_multiplier).toFixed(2)}`);
        setTimeout(() => setWinFx(null), 2200);
        loadBalance();
      }
    }
  }, [roundBets, loadBalance]);

  useEffect(() => {
    // Client interpolates the curve locally (clock-synced), so state polling can
    // stay light: fewer API calls per player = far more concurrent players.
    const poll = setInterval(() => { if (!document.hidden) tick(); }, 1400);
    const frame = setInterval(() => setNow(Date.now()), 60);
    const pub = setInterval(() => { if (!document.hidden) loadPublic(); }, 4000);
    const onVisible = () => { if (!document.hidden) { tick(); loadPublic(); } };
    document.addEventListener("visibilitychange", onVisible);
    loadPublic();
    return () => {
      clearInterval(poll); clearInterval(frame); clearInterval(pub);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tick, loadPublic]);

  // refresh bet + balance when the round settles
  useEffect(() => {
    if (round?.status === "crashed" && round.id) {
      if (lastCrashSound.current !== round.id) { lastCrashSound.current = round.id; stopEngine(); playExplosion(); }
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

  const betOpen = round?.status === "betting" && betCountdown > 0.4;
  const running = round?.status === "running";

  // Engine sound while the plane climbs
  useEffect(() => {
    if (round?.status === "running" && !silent) startEngine();
    else if (round?.status !== "running") stopEngine();
    return () => { /* keep across ticks */ };
  }, [round?.status, silent]);
  useEffect(() => { if (round?.status === "running") engineRise(liveMult); }, [liveMult, round?.status]);
  useEffect(() => () => stopEngine(), []);

  const parseAuto = (slot: number): number | null => {
    const raw = (autoCashouts[slot] ?? "").trim();
    const parsed = raw ? Number(raw.replace(",", ".")) : NaN;
    return Number.isFinite(parsed) && parsed >= 1.01 && parsed <= 999 ? parsed : null;
  };

  const placeBet = async (slot: number) => {
    const amount = amounts[slot] ?? 0;
    if (!betOpen || roundBets[slot] || busy) return;
    if (!Number.isFinite(amount) || amount < MIN_BET || amount > MAX_BET) {
      toast.error(`Mise ${MIN_BET} – ${MAX_BET} Ar`); return;
    }
    if (amount > balance) { toast.error("Tsy ampy ny solde"); return; }
    setBusy(true);
    const auto = parseAuto(slot);
    const res = await safe(() => supabase.rpc("crash_place_bet", { _amount: amount, _auto_cashout: auto }));
    setBusy(false);
    if (!res) { toast.error("Tsy tafita — jereo ny aterineto"); return; }
    if (res.error) { toast.error(errMsg(res.error.message)); return; }
    // Debit visible immediately
    setBalance((b) => Math.max(0, b - amount));
    setLastAmount(amount);
    setBetOk(true);
    setTimeout(() => setBetOk(false), 1400);
    if (round) loadMyBet(round.id);
    loadBalance();
  };

  const cashout = async (betId: string) => {
    if (!running || busy) return;
    setBusy(true);
    const res = await safe(() => supabase.rpc("crash_cashout", { _bet_id: betId } as any));
    setBusy(false);
    if (!res) { toast.error("Tsy tafita — jereo ny aterineto"); return; }
    if (res.error) { toast.error(errMsg(res.error.message)); return; }
    const out = res.data as any;
    if (out?.ok) {
      seenCashed.current.add(betId);
      playWin();
      setBalance((b) => b + Number(out.payout || 0));
      setWinFx(`+${fmtAr(Number(out.payout || 0))} · ×${Number(out.multiplier).toFixed(2)}`);
      setTimeout(() => setWinFx(null), 2200);
    } else toast.error("Tara loatra — crash!");
    if (round) loadMyBet(round.id);
    loadBalance();
  };

  const crashed = round?.status === "crashed";
  // The aircraft starts fully outside the lower-left corner when the run begins
  // and climbs along the curve. When the round crashes it explodes EXACTLY where
  // it was on the line — it never jumps forward to the top.
  const runProgress = Math.min(1, Math.max(0, elapsed) / 9);
  const frozenProgress = useRef(0);
  if (round?.status === "running") frozenProgress.current = runProgress;
  if (round?.status === "betting") frozenProgress.current = 0;
  const progress = round?.status === "running" ? runProgress : crashed ? frozenProgress.current : 0;
  const curve = useMemo(() => buildCurve(shownMult, progress), [shownMult, progress]);
  const plane = useMemo(() => curveTip(shownMult, progress), [shownMult, progress]);

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
          <Button
            size="icon" variant="ghost" className="ml-auto"
            aria-label={silent ? "Mamoha feo" : "Mode silence"}
            onClick={() => { const v = !silent; setSilent(v); setCrashMuted(v); }}
          >
            {silent ? <VolumeX className="w-5 h-5 text-white/50" /> : <Volume2 className="w-5 h-5 text-amber-400" />}
          </Button>
          <span className="text-sm font-semibold text-amber-300">{fmtAr(balance)}</span>
        </div>

        {/* Graph */}
        <div
          className="relative rounded-2xl border border-white/10 overflow-hidden"
          style={{
            backgroundColor: "#050a14",
            backgroundImage:
              "radial-gradient(26px 26px at 84% 20%, rgba(255,251,214,0.95), rgba(255,251,214,0.15) 60%, transparent 70%), radial-gradient(1.4px 1.4px at 12% 22%, #fff, transparent), radial-gradient(1.4px 1.4px at 28% 68%, #fff, transparent), radial-gradient(1px 1px at 47% 14%, #fff, transparent), radial-gradient(1.4px 1.4px at 63% 44%, #dbeafe, transparent), radial-gradient(1px 1px at 78% 76%, #fff, transparent), radial-gradient(1px 1px at 20% 46%, #fff, transparent), radial-gradient(1.4px 1.4px at 55% 82%, #fff, transparent), radial-gradient(1px 1px at 70% 12%, #fff, transparent), radial-gradient(1px 1px at 36% 88%, #fff, transparent), linear-gradient(180deg, #0b1226 0%, #050a14 70%)",
          }}
        >
          <svg viewBox="0 0 300 170" className="w-full h-[38svh] max-h-[280px]" preserveAspectRatio="none">
            <defs>
              <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#dc2626" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#7f1d1d" stopOpacity="0.55" />
              </linearGradient>
            </defs>
            {round?.status !== "betting" && (
              <>
                <path d={`${curve} L ${plane.x.toFixed(1)} 170 L 0 170 Z`} fill="url(#cg)" />
                <path d={curve} fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" />
              </>
            )}
          </svg>
          {/* Airplane flying along the curve */}
          {round?.status !== "betting" && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${(plane.x / 300) * 100}%`,
                top: `${(plane.y / 170) * 100}%`,
                transform: `translate(-50%,-50%) rotate(${-plane.angle}deg) ${crashed ? "scale(0.9)" : ""}`,
                transition: "left 120ms linear, top 120ms linear",
                opacity: crashed ? 0.35 : 1,
              }}
            >
              <Plane3D
                className="w-14 h-14 drop-shadow-[0_6px_10px_rgba(0,0,0,0.7)]"
              />
            </div>
          )}
          {/* Explosion exactly on the line where the plane was */}
          {crashed && (
            <div
              className="absolute pointer-events-none z-10 animate-scale-in"
              style={{
                left: `${(plane.x / 300) * 100}%`,
                top: `${(plane.y / 170) * 100}%`,
                transform: "translate(-50%,-50%)",
              }}
            >
              <span className="block text-5xl drop-shadow-[0_0_18px_rgba(239,68,68,0.9)]">💥</span>
            </div>
          )}

          {/* Bet accepted flash */}
          {betOk && (
            <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
              <div className="animate-scale-in rounded-2xl border-2 border-emerald-400 bg-emerald-500/95 px-6 py-4 text-center shadow-[0_0_40px_rgba(16,185,129,0.8)]">
                <p className="text-2xl font-black text-black tracking-wide">Parie accepté</p>
                <p className="text-sm font-bold text-black/70">-{fmtAr(lastAmount)}</p>
              </div>
            </div>
          )}
          {winFx && (
            <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
              <div className="animate-scale-in rounded-2xl border-2 border-emerald-300 bg-black/80 px-6 py-4 text-center shadow-[0_0_40px_rgba(16,185,129,0.8)]">
                <p className="text-3xl font-black text-emerald-400">{winFx}</p>
                <p className="text-xs font-bold text-emerald-200/80">Fandresena!</p>
              </div>
            </div>
          )}
          <div className="absolute inset-x-0 top-0 flex flex-col items-center justify-start pt-3 pointer-events-none">
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
            {round?.status === "running" && roundBets.some((b) => b.status === "cashed") && (
              <span className="mt-2 text-sm text-emerald-400">
                Cashout {fmtAr(roundBets.reduce((s, b) => s + Number(b.payout || 0), 0))}
              </span>
            )}
          </div>
          <div className="absolute top-2 left-2 text-[10px] text-white/50">Tour #{round?.round_no ?? "—"}</div>
        </div>

        {/* Historique nesorina (tsy aseho intsony) */}


        {/* Single bet slot */}
        {[0].map((slot) => {
          const bet = roundBets[slot];
          const amount = amounts[slot] ?? 0;
          const canBetSlot = betOpen && !bet;
          const canCashSlot = running && bet?.status === "placed";
          const setAmt = (v: number) => setAmounts((a) => a.map((x, i) => (i === slot ? v : x)));
          const setAuto = (v: string) => setAutoCashouts((a) => a.map((x, i) => (i === slot ? v : x)));
          return (
            <div key={slot} className="rounded-2xl border border-white/10 bg-white/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">Mise</span>
                {bet && (
                  <span className={`text-[10px] font-bold ${bet.status === "cashed" ? "text-emerald-400" : bet.status === "lost" ? "text-red-400" : "text-amber-300"}`}>
                    {bet.status === "cashed" ? `×${Number(bet.cashout_multiplier).toFixed(2)}` : bet.status === "lost" ? "Very" : "Active"}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {AMOUNTS.map((a) => (
                  <button key={a} onClick={() => setAmt(a)} disabled={!canBetSlot}
                    className={`rounded-lg py-2 text-[11px] font-bold transition ${amount === a ? "bg-amber-500 text-black" : "bg-white/10 text-white/80"} disabled:opacity-40`}>
                    {a / 1000 >= 1 ? `${a / 1000}K` : a}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-white/50">Mise (Ar)</label>
                  <Input type="number" inputMode="numeric" min={MIN_BET} max={MAX_BET} value={amount} disabled={!canBetSlot}
                    onChange={(e) => setAmt(Math.min(MAX_BET, Math.max(0, Math.floor(Number(e.target.value) || 0))))}
                    className="bg-black/40 border-white/15 text-white h-10" />
                </div>
                <div>
                  <label className="text-[10px] text-white/50">Auto cashout (×)</label>
                  <Input type="number" inputMode="decimal" step="0.01" min={1.01} placeholder="ex: 2.00" value={autoCashouts[slot] ?? ""}
                    disabled={!canBetSlot} onChange={(e) => setAuto(e.target.value)}
                    className="bg-black/40 border-white/15 text-white h-10" />
                </div>
              </div>

              {canCashSlot ? (
                <Button onClick={() => cashout(bet.id)} disabled={busy}
                  className="w-full h-12 text-base font-black bg-emerald-500 hover:bg-emerald-400 text-black">
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : `CASHOUT ×${liveMult.toFixed(2)} → ${fmtAr(Math.floor(Number(bet.amount) * liveMult))}`}
                </Button>
              ) : (
                <Button onClick={() => placeBet(slot)} disabled={!canBetSlot || busy || amount < MIN_BET || amount > MAX_BET}
                  className="w-full h-12 text-base font-black bg-amber-500 hover:bg-amber-400 text-black disabled:opacity-50">
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" />
                    : bet ? (bet.status === "placed" ? "Mise voaray — miandry départ" : bet.status === "cashed" ? `Nahazo ${fmtAr(bet.payout)}` : "Very ny mise")
                    : round?.status === "betting" ? `MISE ${fmtAr(amount)}` : "Miandry tour vaovao…"}
                </Button>
              )}
            </div>
          );
        })}

        {/* Provably fair */}
        <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-[11px] text-white/60 flex gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            Provably fair — hash: <span className="font-mono break-all">{round?.server_seed_hash?.slice(0, 24)}…</span>
            <br />Multiplicateur ×1.00 → ×999.00. Mise 100 – 10 000 Ar.
            <br />Vokatra kisendrasendra 100% (HMAC-SHA256) — tsy misy programme, tsy misy stratégie azo antoka.
          </span>
        </div>

        {/* Bets tabs */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-2">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/40 p-1">
            {([
              ["all", "Tous les paris"],
              ["mine", "Mes paris"],
              ["top", "Meilleurs gains"],
            ] as const).map(([k, lbl]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`rounded-lg py-2 text-[11px] font-bold transition ${tab === k ? "bg-white/15 text-white" : "text-white/55"}`}>
                {lbl}
              </button>
            ))}
          </div>

          {tab !== "mine" && (
            <>
              <div className="flex items-center justify-between px-1 pt-2 pb-1 text-[10px] uppercase tracking-wide text-white/45">
                <span>Joueur</span><span>Pari Ar ×</span><span>Gain Ar</span>
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {(tab === "all" ? allBets : topGains).map((b) => (
                  <div key={b.bet_id}
                    className={`grid grid-cols-3 items-center text-xs rounded-lg px-2 py-1.5 ${b.payout > 0 ? "bg-emerald-500/10" : "bg-black/30"}`}>
                    <span className="text-white/70 font-mono">{b.masked_phone}</span>
                    <span className="text-center">
                      {fmtAr(b.amount).replace(" Ar", "")}
                      {b.cashout_multiplier ? (
                        <span className="ml-1 rounded px-1 py-0.5 text-[10px] font-bold bg-emerald-500 text-black">
                          {Number(b.cashout_multiplier).toFixed(2)}x
                        </span>
                      ) : null}
                    </span>
                    <span className={`text-right font-semibold ${b.payout > 0 ? "text-emerald-400" : "text-white/35"}`}>
                      {b.payout > 0 ? fmtAr(b.payout).replace(" Ar", "") : "—"}
                    </span>
                  </div>
                ))}
                {(tab === "all" ? allBets : topGains).length === 0 && (
                  <p className="text-xs text-white/40 py-3 text-center">
                    {tab === "all" ? "Tsy mbola misy mise amin'ity tour ity." : "Tsy mbola misy gain androany."}
                  </p>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2 text-[11px]">
                <span className="text-white/50">
                  {tab === "all" ? "Paris totaux" : "Meilleurs gains (androany)"}
                  <br />
                  <span className="font-bold text-white">
                    {tab === "all"
                      ? `${allBets.filter((b) => b.payout > 0).length}/${allBets.length}`
                      : topGains.length}
                  </span>
                </span>
                <span className="text-right text-white/50">
                  Gain total
                  <br />
                  <span className="font-bold text-emerald-400">
                    {fmtAr((tab === "all" ? allBets : topGains).reduce((s, b) => s + Number(b.payout || 0), 0))}
                  </span>
                </span>
              </div>
            </>
          )}

          {tab === "mine" && (
            <div className="space-y-1 max-h-64 overflow-y-auto pt-2">
              {myBets.map((b) => (
                <div key={b.id} className="flex items-center justify-between text-xs bg-black/30 rounded-lg px-2 py-1.5">
                  <span className="text-white/60">{new Date(b.created_at).toLocaleString("fr-FR")}</span>
                  <span>{fmtAr(b.amount)}</span>
                  <span className={b.status === "cashed" ? "text-emerald-400 font-bold" : b.status === "lost" ? "text-red-400" : "text-amber-300"}>
                    {b.status === "cashed" ? `×${Number(b.cashout_multiplier).toFixed(2)} · ${fmtAr(b.payout)}` : b.status === "lost" ? "Very" : "En cours"}
                  </span>
                </div>
              ))}
              {myBets.length === 0 && <p className="text-xs text-white/40 py-3 text-center">Tsy mbola nisy mise.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function curveY(f: number) {
  // Keep both endpoints inside the graph: exact lower-left to visible upper-right.
  const clamped = Math.max(0, Math.min(1, f));
  return 170 - Math.pow(clamped, 1.08) * 150;
}

export function curveTip(mult: number, prog = 1) {
  const p = Math.max(0, Math.min(1, prog));
  const previous = Math.max(0, p - 0.03);
  const y = curveY(p);
  const yPrev = curveY(previous);
  const angle = (Math.atan2(yPrev - y, Math.max(1, (p - previous) * 280)) * 180) / Math.PI;
  return { x: p * 280, y, angle };
}

function buildCurve(mult: number, prog = 1) {
  const pts: string[] = [];
  const steps = 40;
  const p = Math.max(0, Math.min(1, prog));
  for (let i = 0; i <= steps; i++) {
    const f = (i / steps) * p;
    const x = f * 280;
    const y = curveY(f);
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
