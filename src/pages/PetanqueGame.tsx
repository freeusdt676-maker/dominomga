import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sky, Environment, Instances, Instance } from "@react-three/drei";
import * as THREE from "three";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Pause, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Ball, Jack, COURT, distance, stepPhysics, computeRoundScore, nextThrower,
} from "@/lib/petanqueEngine";
import { useThemeClass } from "@/hooks/use-theme-class";

type GameRow = {
  id: string;
  player1_id: string;
  player2_id: string | null;
  stake: number;
  status: string;
  current_turn: string | null;
  turn_started_at?: string | null;
  winner_id: string | null;
  score_p1: number;
  score_p2: number;
  round_number: number;
  state: {
    balls: Ball[];
    jack: Jack | null;
    phase: "aim" | "rolling" | "settle";
    remaining: { p1: number; p2: number };
    lastThrower?: "p1" | "p2";
  };
};

const TARGET_SCORE = 20;
const BALLS_PER_PLAYER = 6;
const FANI_SCORE = 6; // Si un joueur atteint 6 et l'autre est à 0 => victoire (Fani)

/* ---------- 3D Scene Components ---------- */

function Baobab({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* trunk - thick swollen baobab */}
      <mesh position={[0, 2.2, 0]} castShadow>
        <cylinderGeometry args={[0.95, 1.4, 4.5, 12]} />
        <meshStandardMaterial color="#8b6f47" roughness={0.95} />
      </mesh>
      <mesh position={[0, 4.8, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.9, 0.8, 12]} />
        <meshStandardMaterial color="#7a5f3a" roughness={0.95} />
      </mesh>
      {/* foliage clusters */}
      {[[-0.8, 5.5, 0.3], [0.6, 5.7, -0.4], [0, 6.1, 0.2], [-0.3, 5.3, -0.7], [0.9, 5.4, 0.5]].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} castShadow>
          <sphereGeometry args={[0.75, 10, 10]} />
          <meshStandardMaterial color={i % 2 ? "#3d6b34" : "#4a7d3f"} roughness={0.85} />
        </mesh>
      ))}
      {/* twisted branches */}
      <mesh position={[-0.6, 5.2, 0]} rotation={[0, 0, 0.6]} castShadow>
        <cylinderGeometry args={[0.08, 0.15, 1.2, 6]} />
        <meshStandardMaterial color="#6b5234" />
      </mesh>
      <mesh position={[0.7, 5.1, 0.2]} rotation={[0, 0, -0.7]} castShadow>
        <cylinderGeometry args={[0.08, 0.15, 1.1, 6]} />
        <meshStandardMaterial color="#6b5234" />
      </mesh>
    </group>
  );
}

function MadagascarFlag() {
  const ref = useRef<THREE.Mesh>(null);
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 170;
    const ctx = c.getContext("2d")!;
    // white band (left)
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 85, 170);
    // red top, green bottom (right)
    ctx.fillStyle = "#fc3d32"; ctx.fillRect(85, 0, 171, 85);
    ctx.fillStyle = "#007e3a"; ctx.fillRect(85, 85, 171, 85);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useFrame((s) => {
    if (!ref.current) return;
    const g = ref.current.geometry as THREE.PlaneGeometry;
    const pos = g.attributes.position as THREE.BufferAttribute;
    const time = s.clock.elapsedTime;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const wave = Math.sin(x * 2 + time * 3) * 0.15 * Math.max(0, (x + 1.5) / 3);
      pos.setZ(i, wave);
      void y;
    }
    pos.needsUpdate = true;
  });
  return (
    <group position={[0, 6, -14]}>
      <mesh position={[-1.6, 0, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 7, 8]} />
        <meshStandardMaterial color="#6b5234" />
      </mesh>
      <mesh ref={ref} position={[0, 1.5, 0]} castShadow>
        <planeGeometry args={[3, 2, 24, 16]} />
        <meshStandardMaterial map={tex} side={THREE.DoubleSide} roughness={0.8} />
      </mesh>
    </group>
  );
}

function Aloalo({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 1, 0]} castShadow>
        <boxGeometry args={[0.18, 2, 0.18]} />
        <meshStandardMaterial color="#3d2817" />
      </mesh>
      <mesh position={[0, 2.15, 0]} castShadow>
        <boxGeometry args={[0.35, 0.1, 0.35]} />
        <meshStandardMaterial color="#d4a86a" />
      </mesh>
      <mesh position={[0, 2.4, 0]} castShadow>
        <coneGeometry args={[0.22, 0.5, 6]} />
        <meshStandardMaterial color="#6b3a2a" />
      </mesh>
    </group>
  );
}

function Court() {
  // sand + pebbles texture procedurally
  const sandTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 512;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#d4b896"; ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 4000; i++) {
      const x = Math.random() * 512, y = Math.random() * 512;
      const sh = Math.random();
      ctx.fillStyle = sh > 0.85 ? "#8b7355" : sh > 0.5 ? "#c2a378" : "#e0c89a";
      const r = Math.random() * 2 + 0.5;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // pebbles
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * 512, y = Math.random() * 512;
      ctx.fillStyle = ["#6b5d4a", "#8a7a60", "#a08570"][Math.floor(Math.random()*3)];
      ctx.beginPath(); ctx.arc(x, y, Math.random()*4+2, 0, Math.PI*2); ctx.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 6);
    return t;
  }, []);
  const grassTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 256;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#4a7c3a"; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2000; i++) {
      const x = Math.random()*256, y = Math.random()*256;
      ctx.fillStyle = ["#3d6b2d", "#5c8a48", "#6b9a52"][Math.floor(Math.random()*3)];
      ctx.fillRect(x, y, 1, Math.random()*3+1);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(8, 8);
    return t;
  }, []);
  return (
    <group>
      {/* outer grass ground */}
      <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, -0.01, 4]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial map={grassTex} roughness={1} />
      </mesh>
      {/* sand court */}
      <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.01, 4.7]} receiveShadow>
        <planeGeometry args={[COURT.maxX - COURT.minX + 0.4, COURT.maxZ - COURT.minZ + 0.4]} />
        <meshStandardMaterial map={sandTex} roughness={1} />
      </mesh>
      {/* wooden borders */}
      {[
        { p: [COURT.minX - 0.15, 0.1, 4.7], s: [0.2, 0.2, COURT.maxZ - COURT.minZ + 0.6] },
        { p: [COURT.maxX + 0.15, 0.1, 4.7], s: [0.2, 0.2, COURT.maxZ - COURT.minZ + 0.6] },
        { p: [0, 0.1, COURT.minZ - 0.15], s: [COURT.maxX - COURT.minX + 0.6, 0.2, 0.2] },
        { p: [0, 0.1, COURT.maxZ + 0.15], s: [COURT.maxX - COURT.minX + 0.6, 0.2, 0.2] },
      ].map((b, i) => (
        <mesh key={i} position={b.p as [number, number, number]} castShadow receiveShadow>
          <boxGeometry args={b.s as [number, number, number]} />
          <meshStandardMaterial color="#6b4a2a" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Crowd() {
  const data = useMemo(() => {
    const arr: { x: number; z: number; color: string; phase: number }[] = [];
    const palette = ["#c44569", "#f7b733", "#4a90e2", "#7ed321", "#9b59b6", "#e67e22"];
    // left side
    for (let i = 0; i < 8; i++) {
      arr.push({ x: -4 - Math.random()*1.5, z: -1 + i*1.6, color: palette[i % palette.length], phase: Math.random()*Math.PI*2 });
    }
    // right side
    for (let i = 0; i < 8; i++) {
      arr.push({ x: 4 + Math.random()*1.5, z: -1 + i*1.6, color: palette[(i+3) % palette.length], phase: Math.random()*Math.PI*2 });
    }
    return arr;
  }, []);
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    refs.current.forEach((g, i) => {
      if (!g) return;
      const d = data[i];
      g.position.y = Math.sin(t * 1.5 + d.phase) * 0.08;
      g.rotation.y = Math.sin(t * 0.8 + d.phase) * 0.15;
    });
  });
  return (
    <>
      {data.map((d, i) => (
        <group key={i} ref={(el) => (refs.current[i] = el)} position={[d.x, 0, d.z]}>
          {/* body */}
          <mesh position={[0, 0.55, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.22, 1, 8]} />
            <meshStandardMaterial color={d.color} />
          </mesh>
          {/* head */}
          <mesh position={[0, 1.2, 0]} castShadow>
            <sphereGeometry args={[0.18, 10, 10]} />
            <meshStandardMaterial color="#8b5a3c" />
          </mesh>
          {/* hat */}
          <mesh position={[0, 1.42, 0]}>
            <coneGeometry args={[0.25, 0.18, 8]} />
            <meshStandardMaterial color="#d4a86a" />
          </mesh>
        </group>
      ))}
    </>
  );
}

function Zebu({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[0.8, 0.5, 0.35]} />
        <meshStandardMaterial color="#3d2817" />
      </mesh>
      <mesh position={[0, 0.75, 0]} castShadow>
        <sphereGeometry args={[0.18, 8, 8]} />
        <meshStandardMaterial color="#5a3a24" />
      </mesh>
      {/* legs */}
      {[[-0.3,0.1,-0.13],[0.3,0.1,-0.13],[-0.3,0.1,0.13],[0.3,0.1,0.13]].map((p,i)=>(
        <mesh key={i} position={p as [number,number,number]}>
          <cylinderGeometry args={[0.05,0.05,0.3,6]} />
          <meshStandardMaterial color="#2d1b0e" />
        </mesh>
      ))}
    </group>
  );
}

function BallMesh({ ball, isJack }: { ball: Ball | Jack; isJack?: boolean }) {
  const color = isJack ? "#f5f0e0" : (ball as Ball).owner === "p1" ? "#dc2626" : "#2563eb";
  const r = isJack ? COURT.jackR : COURT.ballR;
  return (
    <mesh position={[ball.x, r, ball.z]} castShadow>
      <sphereGeometry args={[r, 24, 24]} />
      <meshStandardMaterial color={color} metalness={isJack ? 0.1 : 0.5} roughness={isJack ? 0.6 : 0.25} />
    </mesh>
  );
}

function CameraRig() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 5.5, -3.5);
    camera.lookAt(0, 0, 5);
  }, [camera]);
  return null;
}

function AimArrow({ angleDeg, visible }: { angleDeg: number; visible: boolean }) {
  if (!visible) return null;
  const len = 3.5;
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(rad) * len;
  const dz = Math.cos(rad) * len;
  return (
    <group position={[0, 0.05, -1.2]}>
      {/* shaft */}
      <mesh position={[dx / 2, 0, dz / 2]} rotation={[0, -rad, 0]}>
        <boxGeometry args={[0.12, 0.02, len]} />
        <meshStandardMaterial color="#22ff66" emissive="#22ff66" emissiveIntensity={1} />
      </mesh>
      {/* arrowhead */}
      <mesh position={[dx, 0, dz]} rotation={[Math.PI / 2, 0, -rad]}>
        <coneGeometry args={[0.18, 0.4, 4]} />
        <meshStandardMaterial color="#22ff66" emissive="#22ff66" emissiveIntensity={1.2} />
      </mesh>
    </group>
  );
}

/* ---------- Main Page ---------- */

export default function PetanqueGame() {
  useThemeClass("petanque");
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [g, setG] = useState<GameRow | null>(null);
  const [p1Profile, setP1Profile] = useState<any>(null);
  const [p2Profile, setP2Profile] = useState<any>(null);
  const [angle, setAngle] = useState(0);
  const [force, setForce] = useState(50);
  const [throwing, setThrowing] = useState(false);
  const [simBalls, setSimBalls] = useState<Ball[]>([]);
  const [simJack, setSimJack] = useState<Jack | null>(null);
  const simRef = useRef<{ balls: Ball[]; jack: Jack | null } | null>(null);
  const autoThrowRef = useRef<string | null>(null);
  // Drag-to-throw gesture state
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const PULL_MAX = 180; // px — pull complet = 100% hery

  // Force portrait + fullscreen feel
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Load game + polling fallback (au cas où le realtime tarde)
  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const { data } = await supabase.from("petanque_games" as any).select("*").eq("id", id).single();
      if (data) setG(data as unknown as GameRow);
    };
    load();
    const ch = supabase.channel(`pg-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "petanque_games", filter: `id=eq.${id}` },
        (p: any) => { if (p.new) setG(p.new as GameRow); })
      .subscribe();
    // Polling de secours toutes les 2s (essentiel pour le matchmaking si realtime ne livre pas)
    const itv = setInterval(load, 2000);
    return () => { supabase.removeChannel(ch); clearInterval(itv); };
  }, [id]);

  useEffect(() => {
    if (!g) return;
    (async () => {
      const ids = [g.player1_id, g.player2_id].filter(Boolean) as string[];
      const { data } = await supabase.from("profiles").select("user_id, mvola_name, avatar_url").in("user_id", ids);
      const m: Record<string, any> = {};
      (data ?? []).forEach((p: any) => { m[p.user_id] = p; });
      setP1Profile(m[g.player1_id]);
      if (g.player2_id) setP2Profile(m[g.player2_id]);
    })();
  }, [g?.player1_id, g?.player2_id]);

  // Settle: maty 20 OR Fani (6-0)
  useEffect(() => {
    if (!g || g.status !== "in_progress") return;
    let winner: string | null = null;
    if (g.score_p1 >= TARGET_SCORE) winner = g.player1_id;
    else if (g.score_p2 >= TARGET_SCORE) winner = g.player2_id;
    else if (g.score_p1 >= FANI_SCORE && g.score_p2 === 0) winner = g.player1_id;
    else if (g.score_p2 >= FANI_SCORE && g.score_p1 === 0) winner = g.player2_id;
    if (winner) supabase.rpc("petanque_settle" as any, { _game_id: g.id, _winner: winner });
  }, [g?.score_p1, g?.score_p2, g?.status]);

  const mySide: "p1" | "p2" | null = !g || !user ? null : user.id === g.player1_id ? "p1" : user.id === g.player2_id ? "p2" : null;
  const isMyTurn = !!g && g.current_turn === user?.id && g.state?.phase === "aim";

  // Local sync: derive simBalls/simJack from g.state unless we're animating a throw
  useEffect(() => {
    if (throwing) return;
    setSimBalls(g?.state?.balls ?? []);
    setSimJack(g?.state?.jack ?? null);
  }, [g?.state, throwing]);

  const doThrow = async (overrideAngle?: number, overrideForce?: number) => {
    if (!g || !user || !mySide || throwing) return;
    const remaining = g.state?.remaining ?? { p1: BALLS_PER_PLAYER, p2: BALLS_PER_PLAYER };
    if (remaining[mySide] <= 0) return toast.error("Tsy manana baolina intsony");
    setThrowing(true);
    const useAngle = overrideAngle ?? angle;
    const useForce = overrideForce ?? force;
    // initial conditions: from throw line (z=-1.3), angle relative to z axis
    const rad = (useAngle * Math.PI) / 180;
    const speed = 4 + (useForce / 100) * 11; // 4..15 m/s
    const vx = Math.sin(rad) * speed;
    const vz = Math.cos(rad) * speed;
    const newBall: Ball = {
      id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      owner: mySide,
      x: 0, z: -1.3, vx, vz,
    };
    const balls: Ball[] = [...(g.state?.balls ?? []).map(b => ({ ...b, vx: 0, vz: 0 })), newBall];
    const jack: Jack | null = g.state?.jack ? { ...g.state.jack } : null;
    simRef.current = { balls, jack };
    // Simulate with raf loop, capped at 8 seconds
    const start = performance.now();
    let last = start;
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const sim = simRef.current!;
      const moving = stepPhysics(sim.balls, sim.jack, dt);
      setSimBalls([...sim.balls]);
      if (sim.jack) setSimJack({ ...sim.jack });
      if (moving && now - start < 8000) {
        requestAnimationFrame(loop);
      } else {
        // commit final state
        finishThrow(sim.balls, sim.jack, mySide).catch((e) => toast.error(e.message));
      }
    };
    requestAnimationFrame(loop);
  };

  // ---- 20s auto-throw (robot) — current player only ----
  useEffect(() => {
    if (!g || !user || !mySide) return;
    if (g.status !== "in_progress") return;
    if (g.state?.phase !== "aim") return;
    if (g.current_turn !== user.id) return;
    if (throwing) return;
    const startMs = g.turn_started_at ? new Date(g.turn_started_at).getTime() : Date.now();
    const key = `${g.id}-${g.turn_started_at ?? "0"}-${g.current_turn}`;
    if (autoThrowRef.current === key) return;
    const delay = Math.max(0, 20_000 - (Date.now() - startMs));
    const t = setTimeout(() => {
      if (autoThrowRef.current === key) return;
      autoThrowRef.current = key;
      const ba = Math.round((Math.random() - 0.5) * 40);
      const bf = 40 + Math.round(Math.random() * 40);
      setAngle(ba); setForce(bf);
      setTimeout(() => { void doThrow(ba, bf); }, 60);
      toast("⏱ Robot nanatsipy baolina (20s)");
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g?.current_turn, g?.turn_started_at, g?.state?.phase, g?.status, throwing, mySide, user?.id]);

  const finishThrow = async (finalBalls: Ball[], finalJack: Jack | null, thrower: "p1" | "p2") => {
    if (!g) return;
    const prevRemaining = g.state?.remaining ?? { p1: BALLS_PER_PLAYER, p2: BALLS_PER_PLAYER };
    const remaining = { ...prevRemaining, [thrower]: Math.max(0, prevRemaining[thrower] - 1) };
    const sanitized = finalBalls.map(b => ({ ...b, vx: 0, vz: 0 }));
    let newScoreP1 = g.score_p1;
    let newScoreP2 = g.score_p2;
    let newRound = g.round_number;
    let newPhase: "aim" | "settle" = "aim";
    let nextTurnUser: string | null = null;
    let newBalls = sanitized;
    let newJack = finalJack;
    let newRemaining = remaining;

    if (remaining.p1 <= 0 && remaining.p2 <= 0 && finalJack) {
      // round done — compute score
      const r = computeRoundScore(sanitized, finalJack);
      if (r.winner === "p1") newScoreP1 += r.points;
      if (r.winner === "p2") newScoreP2 += r.points;
      newRound += 1;
      // reset for next round (alternate jack side)
      newBalls = [];
      newJack = { x: (Math.random() - 0.5) * 2, z: 6 + (Math.random() - 0.5) * 2 };
      newRemaining = { p1: BALLS_PER_PLAYER, p2: BALLS_PER_PLAYER };
      // loser starts next round
      const next: "p1" | "p2" = r.winner === "p1" ? "p2" : "p1";
      nextTurnUser = next === "p1" ? g.player1_id : g.player2_id;
      toast.success(`Round ${g.round_number}: +${r.points} ho an'ny ${r.winner === "p1" ? "Mena" : "Manga"}`);
    } else {
      const nx = nextThrower(sanitized, finalJack, remaining, thrower);
      if (nx) nextTurnUser = nx === "p1" ? g.player1_id : g.player2_id;
      else nextTurnUser = thrower === "p1" ? g.player2_id : g.player1_id;
    }

    const newState = {
      balls: newBalls,
      jack: newJack,
      phase: newPhase,
      remaining: newRemaining,
      lastThrower: thrower,
    };
    await supabase.rpc("petanque_update_state" as any, {
      _game_id: g.id,
      _state: newState,
      _current_turn: nextTurnUser,
      _turn_started_at: new Date().toISOString(),
      _score_p1: newScoreP1,
      _score_p2: newScoreP2,
      _round_number: newRound,
    });
    setThrowing(false);
  };

  if (!g) return (
    <div className="min-h-screen flex items-center justify-center bg-emerald-950">
      <Loader2 className="animate-spin text-emerald-300" />
    </div>
  );

  if (g.status === "finished") {
    const winName = g.winner_id === g.player1_id ? p1Profile?.mvola_name : p2Profile?.mvola_name;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-emerald-900 to-black p-6 gap-4 text-center">
        <h2 className="text-4xl font-bold text-emerald-300">🏆 Vita!</h2>
        <p className="text-emerald-100 text-xl">Nandresy: <b>{winName ?? "?"}</b></p>
        <p className="text-emerald-200/70">{g.score_p1} — {g.score_p2}</p>
        <Button onClick={() => nav("/petanque")} className="bg-emerald-500 text-emerald-950 font-bold">Hiverina</Button>
      </div>
    );
  }

  if (g.status === "waiting") {
    const isHost = user?.id === g.player1_id;
    const cancel = async () => {
      const { error } = await supabase.rpc("petanque_cancel_waiting" as any, { _game_id: g.id });
      if (error) return toast.error(error.message);
      toast("Nesorina");
      nav("/petanque");
    };
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-5 text-center"
        style={{ background: "linear-gradient(180deg,#0a2e1c 0%,#021008 100%)" }}>
        <Loader2 className="w-10 h-10 animate-spin text-emerald-300" />
        <h2 className="text-2xl font-bold text-emerald-200">Miandry mpifanandrina...</h2>
        <p className="text-emerald-100/80 text-sm">
          Mise: <b>{g.stake} Ar</b> · Pétanque 2P
        </p>
        <p className="text-emerald-100/50 text-xs max-w-xs">
          Hita amin'ny lobby ny mise nataonao. Raha misy mpilalao miditra dia hanomboka avy hatrany.
        </p>
        <div className="flex gap-3 mt-2">
          <Button variant="outline" onClick={() => nav("/petanque")} className="border-emerald-500/40 text-emerald-100">
            <ArrowLeft className="w-4 h-4 mr-1" /> Miverina any amin'ny Lobby
          </Button>
          {isHost && (
            <Button variant="destructive" onClick={cancel}>Annuler ny mise</Button>
          )}
        </div>
      </div>
    );
  }

  const remaining = g.state?.remaining ?? { p1: BALLS_PER_PLAYER, p2: BALLS_PER_PLAYER };

  return (
    <div className="fixed inset-0 bg-black overflow-hidden touch-none select-none">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 55, near: 0.1, far: 100 }}
      >
        <Suspense fallback={null}>
          <CameraRig />
          <Sky distance={450000} sunPosition={[5, 8, 5]} inclination={0.5} azimuth={0.25} />
          <ambientLight intensity={0.55} />
          <directionalLight position={[6, 10, 4]} intensity={1.1} castShadow shadow-mapSize={[1024, 1024]} />
          <hemisphereLight args={["#bde0ff", "#3a5a3a", 0.4]} />

          <Court />
          <Baobab position={[-5.5, 0, 3]} />
          <Baobab position={[5.5, 0, 3]} />
          <Baobab position={[-7, 0, 8]} />
          <Baobab position={[7, 0, 8]} />
          <MadagascarFlag />
          <Aloalo position={[-2.6, 0, 0]} />
          <Aloalo position={[2.6, 0, 0]} />
          <Aloalo position={[-2.6, 0, 10]} />
          <Aloalo position={[2.6, 0, 10]} />
          <Zebu position={[-4.5, 0, 10]} />
          <Zebu position={[4.2, 0, 10.5]} />
          <Crowd />

          {simJack && <BallMesh ball={simJack} isJack />}
          {simBalls.map((b) => <BallMesh key={b.id} ball={b} />)}

          <AimArrow angleDeg={angle} visible={isMyTurn && !throwing} />

          <Environment preset="park" />
          <fog attach="fog" args={["#bde0ff", 18, 45]} />
        </Suspense>
      </Canvas>

      {/* Top overlay — solaitra mainty be zaraina roa */}
      <div className="absolute top-0 left-0 right-0 bg-black/90 backdrop-blur-md border-b-2 border-white/15 shadow-2xl pointer-events-auto">
        <div className="flex items-stretch">
          <PlayerHalf
            name={p1Profile?.mvola_name ?? "Mpilalao 1"}
            avatarUrl={p1Profile?.avatar_url}
            score={g.score_p1}
            remaining={remaining.p1}
            color="#dc2626"
            active={g.current_turn === g.player1_id}
            side="left"
          />
          <div className="flex flex-col items-center justify-center px-2 py-2 border-x border-white/15 min-w-[88px]">
            <div className="text-[9px] text-white/60 tracking-widest font-semibold">ROUND {g.round_number}</div>
            <div className="text-3xl font-black text-white leading-none my-0.5">{g.score_p1}<span className="text-white/40 mx-1">:</span>{g.score_p2}</div>
            <div className="text-[9px] text-white/50 font-semibold">MATY {TARGET_SCORE} · FANI {FANI_SCORE}-0</div>
            <button
              onClick={() => nav("/")}
              className="mt-1.5 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center"
              aria-label="Hiala"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
          <PlayerHalf
            name={p2Profile?.mvola_name ?? "Miandry..."}
            avatarUrl={p2Profile?.avatar_url}
            score={g.score_p2}
            remaining={remaining.p2}
            color="#2563eb"
            active={g.current_turn === g.player2_id}
            side="right"
          />
        </div>
      </div>

      {/* Pause button (bottom right) with seashell decor */}
      <button className="absolute bottom-4 right-4 w-14 h-14 rounded-full bg-emerald-500 border-2 border-white/40 flex items-center justify-center shadow-xl shadow-emerald-500/40">
        <Pause className="w-6 h-6 text-emerald-950 fill-emerald-950" />
        {/* seashell deco */}
        <svg className="absolute -top-2 -left-2 w-5 h-5" viewBox="0 0 24 24" fill="#fde68a">
          <path d="M12 2C7 2 3 6 3 11c0 3 2 5 4 6l5 5 5-5c2-1 4-3 4-6 0-5-4-9-9-9z" />
        </svg>
      </button>

      {/* Drag-to-throw pad — toy ny mitarika tady */}
      {isMyTurn && !throwing && (
        <div
          className="absolute bottom-0 left-0 right-0 h-[42%] touch-none select-none"
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture?.(e.pointerId);
            dragStart.current = { x: e.clientX, y: e.clientY };
            setDrag({ dx: 0, dy: 0 });
          }}
          onPointerMove={(e) => {
            if (!dragStart.current) return;
            const dx = e.clientX - dragStart.current.x;
            const dy = e.clientY - dragStart.current.y;
            setDrag({ dx, dy });
            const pull = Math.max(0, Math.min(PULL_MAX, dy));
            setForce(Math.round(10 + (pull / PULL_MAX) * 90));
            setAngle(Math.max(-35, Math.min(35, -dx / 4)));
          }}
          onPointerUp={() => {
            if (!dragStart.current) { setDrag(null); return; }
            const d = drag;
            dragStart.current = null;
            setDrag(null);
            if (!d) return;
            const pull = Math.max(0, Math.min(PULL_MAX, d.dy));
            if (pull < 24) return; // tariny kely loatra — tsy alefa
            const f = Math.round(10 + (pull / PULL_MAX) * 90);
            const a = Math.max(-35, Math.min(35, -d.dx / 4));
            void doThrow(a, f);
          }}
          onPointerCancel={() => { dragStart.current = null; setDrag(null); }}
        >
          {/* HUD readout */}
          <div className="absolute top-2 left-0 right-0 flex justify-center pointer-events-none">
            <div className="bg-black/70 backdrop-blur px-4 py-1.5 rounded-full border border-emerald-400/40 flex items-center gap-3 text-xs font-bold">
              <span className="text-emerald-200">Tady: <span className="text-white">{angle}°</span></span>
              <span className="w-px h-3 bg-white/30" />
              <span className="text-emerald-200">Hery: <span className="text-white">{force}%</span></span>
            </div>
          </div>
          {/* Drag handle visual */}
          <div className="absolute left-1/2 -translate-x-1/2 bottom-20 pointer-events-none">
            <div
              className="w-16 h-16 rounded-full shadow-2xl"
              style={{
                background: `radial-gradient(circle at 35% 30%, ${mySide === "p1" ? "#ff6b6b" : "#60a5fa"}, ${mySide === "p1" ? "#991b1b" : "#1e3a8a"})`,
                transform: drag ? `translate(${drag.dx}px, ${Math.max(0, Math.min(PULL_MAX, drag.dy))}px)` : "none",
                transition: drag ? "none" : "transform 240ms ease-out",
                boxShadow: "0 8px 24px rgba(0,0,0,0.5), inset -4px -6px 12px rgba(0,0,0,0.35), inset 4px 4px 10px rgba(255,255,255,0.35)",
              }}
            />
            {/* tension line */}
            {drag && (drag.dy > 0) && (
              <svg className="absolute top-8 left-8 overflow-visible pointer-events-none" width="1" height="1">
                <line
                  x1={0} y1={0}
                  x2={drag.dx} y2={Math.max(0, Math.min(PULL_MAX, drag.dy))}
                  stroke="rgba(34,255,102,0.9)" strokeWidth="3" strokeLinecap="round"
                  strokeDasharray="6 4"
                />
              </svg>
            )}
          </div>
          {/* Hint */}
          {!drag && (
            <div className="absolute bottom-2 left-0 right-0 text-center pointer-events-none">
              <span className="inline-block px-4 py-2 rounded-full bg-emerald-500/85 text-emerald-950 font-bold text-xs shadow-lg">
                ✋ Hazony ny baolina, dia taritina midina hatsipy
              </span>
            </div>
          )}
        </div>
      )}

      {throwing && (
        <div className="absolute bottom-24 left-0 right-0 text-center">
          <span className="inline-block px-4 py-2 rounded-full bg-emerald-500/90 text-emerald-950 font-bold text-sm">Mandeha ny baolina...</span>
        </div>
      )}

      {!isMyTurn && !throwing && g.status === "in_progress" && (
        <div className="absolute bottom-24 left-0 right-0 text-center">
          <span className="inline-block px-4 py-2 rounded-full bg-black/60 text-white font-semibold text-sm border border-white/20">
            Andrasana ny mpilalao iray hafa...
          </span>
        </div>
      )}
    </div>
  );
}

function PlayerHalf({ name, avatarUrl, score, remaining, color, active, side }: {
  name: string; avatarUrl?: string | null; score: number; remaining: number; color: string; active: boolean; side: "left" | "right";
}) {
  const initial = (name ?? "?").trim().charAt(0).toUpperCase();
  // boule mainty — accent loko ho an'ny mpilalao
  const boules = (
    <div className={`flex gap-1 ${side === "right" ? "flex-row-reverse" : ""}`}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="w-2.5 h-2.5 rounded-full border border-white/15"
          style={{
            background: i < remaining
              ? `radial-gradient(circle at 35% 30%, ${color}, #0a0a0a 80%)`
              : "rgba(255,255,255,0.05)",
          }}
        />
      ))}
    </div>
  );
  const avatar = (
    <div
      className={`relative w-12 h-12 rounded-full shrink-0 overflow-hidden border-2 ${
        active ? "border-emerald-300 shadow-md shadow-emerald-300/40" : "border-white/25"
      }`}
      style={{ background: `radial-gradient(circle at 30% 30%, ${color}dd, ${color}55)` }}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-white font-black text-lg">{initial}</div>
      )}
      {active && <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />}
    </div>
  );
  return (
    <div className={`flex-1 px-2.5 py-2 flex items-center gap-2 ${side === "right" ? "flex-row-reverse text-right" : "text-left"}`}>
      {avatar}
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-white/90 font-bold truncate">{name}</div>
        <div className="text-2xl font-black text-white leading-none">{score}</div>
        <div className="mt-1">{boules}</div>
      </div>
    </div>
  );
}