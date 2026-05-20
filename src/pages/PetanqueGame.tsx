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
  isJackValid, JACK_VALID, detectForfeits,
} from "@/lib/petanqueEngine";
import { useThemeClass } from "@/hooks/use-theme-class";
import { sfx } from "@/lib/sfx";

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
    phase: "aim" | "rolling" | "settle" | "throw_jack";
    remaining: { p1: number; p2: number };
    lastThrower?: "p1" | "p2";
  };
};

const TARGET_SCORE = 13;
const BALLS_PER_PLAYER = 6;
const FANI_SCORE = 6; // Si un joueur atteint 6 et l'autre est à 0 => victoire (Fani)
const TURN_LIMIT_MS = 20_000;

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
  const color = isJack ? "#0a0a0a" : (ball as Ball).owner === "p1" ? "#dc2626" : "#2563eb";
  const r = isJack ? COURT.jackR : COURT.ballR;
  const sphereRef = useRef<any>(null);
  const beaconRef = useRef<any>(null);
  const prevRef = useRef<{ x: number; z: number }>({ x: ball.x, z: ball.z });
  useFrame((_, dt) => {
    // Rolling rotation based on actual displacement (works for both players)
    const dx = ball.x - prevRef.current.x;
    const dz = ball.z - prevRef.current.z;
    prevRef.current = { x: ball.x, z: ball.z };
    if (sphereRef.current && (dx !== 0 || dz !== 0)) {
      // axis perpendicular to motion on ground plane
      const angle = Math.sqrt(dx * dx + dz * dz) / r;
      sphereRef.current.rotation.x += dz / r;
      sphereRef.current.rotation.z -= dx / r;
    }
    // Beacon pulse for jack
    if (isJack && beaconRef.current) {
      const t = performance.now() / 400;
      beaconRef.current.scale.y = 1 + Math.sin(t) * 0.15;
    }
  });
  return (
    <group position={[ball.x, 0, ball.z]}>
      {/* shadow disc on the sand */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
        <circleGeometry args={[r * 1.05, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.32} />
      </mesh>
      <mesh ref={sphereRef} position={[0, r, 0]} castShadow>
        <sphereGeometry args={[r, 28, 28]} />
        <meshStandardMaterial color={color} metalness={isJack ? 0.2 : 0.55} roughness={isJack ? 0.4 : 0.22} />
      </mesh>
      {isJack && (
        <>
          {/* Vertical beacon — visible even when other balls hide the jack */}
          <mesh ref={beaconRef} position={[0, 0.9, 0]} renderOrder={999}>
            <cylinderGeometry args={[0.012, 0.012, 1.8, 8]} />
            <meshBasicMaterial color="#ffeb3b" transparent opacity={0.85} depthTest={false} />
          </mesh>
          {/* Floating marker on top */}
          <mesh position={[0, 1.85, 0]} renderOrder={1000}>
            <sphereGeometry args={[0.06, 16, 16]} />
            <meshBasicMaterial color="#ffeb3b" depthTest={false} />
          </mesh>
        </>
      )}
    </group>
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

function AimArrow({ angleDeg, force, visible, jack, isJackPhase }: {
  angleDeg: number; force: number; visible: boolean; jack: Jack | null; isJackPhase: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (ref.current) {
      // tsotitsoty pulse mba ho velona
      const t = s.clock.elapsedTime;
      ref.current.scale.y = 1 + Math.sin(t * 4) * 0.04;
    }
  });
  if (!visible) return null;
  // Default target: jack position. If no jack yet (throw_jack), aim straight at z=6.
  const targetZ = isJackPhase || !jack ? 6.5 : jack.z;
  const baseLen = Math.max(2.2, Math.min(10, targetZ - -1.3));
  // Force visually scales arrow length (25% .. 110%) — réactive amin'ny drag
  const len = baseLen * (0.25 + (force / 100) * 0.85);
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(rad) * len;
  const dz = Math.cos(rad) * len;
  return (
    <group ref={ref} position={[0, 0.08, -1.3]}>
      {/* base ring (anchor) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.22, 0.32, 32]} />
        <meshBasicMaterial color="#22ff66" transparent opacity={0.85} />
      </mesh>
      {/* glowing shaft — épais ho hita tsara */}
      <mesh position={[dx / 2, 0.02, dz / 2]} rotation={[0, -rad, 0]}>
        <boxGeometry args={[0.28, 0.06, len]} />
        <meshStandardMaterial color="#22ff66" emissive="#22ff66" emissiveIntensity={1.4} transparent opacity={0.92} />
      </mesh>
      {/* secondary glow halo */}
      <mesh position={[dx / 2, 0.01, dz / 2]} rotation={[-Math.PI / 2, 0, -rad]}>
        <planeGeometry args={[0.55, len]} />
        <meshBasicMaterial color="#22ff66" transparent opacity={0.25} />
      </mesh>
      {/* arrowhead — lehibe */}
      <mesh position={[dx, 0.05, dz]} rotation={[Math.PI / 2, 0, -rad]}>
        <coneGeometry args={[0.42, 0.85, 4]} />
        <meshStandardMaterial color="#22ff66" emissive="#22ff66" emissiveIntensity={1.6} />
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
  const channelRef = useRef<any>(null);
  const runThrowRef = useRef<((opts: any) => void) | null>(null);
  // Drag-to-throw gesture state
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const PULL_MAX = 130; // px — tariny moramora ihany dia 100% hery (sotomina makany aloha)

  // Force portrait + fullscreen feel
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    if (!id || !g || g.status !== "in_progress") return;
    const markAbandoned = () => {
      if (document.visibilityState === "hidden") {
        sessionStorage.setItem("petanque_abandoned_game_id", id);
      }
    };
    const markActive = () => {
      if (document.visibilityState === "visible") {
        sessionStorage.removeItem("petanque_abandoned_game_id");
      }
    };
    document.addEventListener("visibilitychange", markAbandoned);
    window.addEventListener("focus", markActive);
    return () => {
      document.removeEventListener("visibilitychange", markAbandoned);
      window.removeEventListener("focus", markActive);
    };
  }, [id, g?.status]);

  // Load game + polling fallback (au cas où le realtime tarde)
  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const { data } = await supabase.from("petanque_games" as any).select("*").eq("id", id).single();
      if (data) setG(data as unknown as GameRow);
    };
    load();
    const ch = supabase.channel(`pg-${id}`, { config: { broadcast: { self: false } } })
      .on("postgres_changes", { event: "*", schema: "public", table: "petanque_games", filter: `id=eq.${id}` },
        (p: any) => { if (p.new) setG(p.new as GameRow); })
      .on("broadcast", { event: "throw" }, ({ payload }: any) => {
        // Mpilalao iray hafa nanatsipy — replay-na eto mba ho hita ny fikodiadian'ny baolina
        runThrowRef.current?.({ ...payload, commit: false });
      })
      .subscribe();
    channelRef.current = ch;
    // Polling de secours toutes les 2s (essentiel pour le matchmaking si realtime ne livre pas)
    const itv = setInterval(load, 2000);
    return () => { supabase.removeChannel(ch); channelRef.current = null; clearInterval(itv); };
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

  // Settle: maty 12 OR Fani (6-0)
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
  const phase = g?.state?.phase ?? "aim";
  const isJackPhase = phase === "throw_jack";
  const isMyTurn = !!g && g.current_turn === user?.id && (phase === "aim" || phase === "throw_jack");

  // ---- Visible countdown (ticks every 250ms) ----
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!g || g.status !== "in_progress") return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [g?.status]);
  const turnStartMs = g?.turn_started_at ? new Date(g.turn_started_at).getTime() : now;
  const elapsed = Math.max(0, now - turnStartMs);
  const remainingMs = Math.max(0, TURN_LIMIT_MS - elapsed);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const timerPct = Math.max(0, Math.min(1, remainingMs / TURN_LIMIT_MS));

  // Local sync: derive simBalls/simJack from g.state unless we're animating a throw
  useEffect(() => {
    if (throwing) return;
    setSimBalls(g?.state?.balls ?? []);
    setSimJack(g?.state?.jack ?? null);
  }, [g?.state, throwing]);

  const doThrow = async (overrideAngle?: number, overrideForce?: number) => {
    if (!g || !user || !mySide || throwing) return;
    const remaining = g.state?.remaining ?? { p1: BALLS_PER_PLAYER, p2: BALLS_PER_PLAYER };
    const jackPhase = g.state?.phase === "throw_jack";
    if (!jackPhase && remaining[mySide] <= 0) return toast.error("Tsy manana baolina intsony");
    setThrowing(true);
    const useAngle = overrideAngle ?? angle;
    const useForce = overrideForce ?? force;
    const rad = (useAngle * Math.PI) / 180;
    // Jack throws shorter & lighter; balls have full range
    const speed = jackPhase ? (2 + (useForce / 100) * 4.5) : (4 + (useForce / 100) * 11);
    const vx = Math.sin(rad) * speed;
    const vz = Math.cos(rad) * speed;
    let balls: Ball[];
    let jack: Jack | null;
    if (jackPhase) {
      // The thrown object IS the jack — simulate it as a tiny temporary ball to reuse engine,
      // then commit position as jack on settle.
      balls = [];
      jack = { x: 0, z: -1.3 } as Jack;
      // store velocity on jack via a temp wrapper:
      (jack as any).vx = vx; (jack as any).vz = vz;
    } else {
      const newBall: Ball = {
        id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        owner: mySide,
        x: 0, z: -1.3, vx, vz,
      };
      balls = [...(g.state?.balls ?? []).map(b => ({ ...b, vx: 0, vz: 0 })), newBall];
      jack = g.state?.jack ? { ...g.state.jack } : null;
    }
    simRef.current = { balls, jack };
    // Simulate with raf loop, capped at 8 seconds
    const start = performance.now();
    let last = start;
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const sim = simRef.current!;
      // For jack phase, move the jack like a ball with friction & walls
      let moving = false;
      if (jackPhase && sim.jack) {
        const j: any = sim.jack;
        j.x += (j.vx ?? 0) * dt;
        j.z += (j.vz ?? 0) * dt;
        const f = Math.pow(COURT.friction, dt * 60);
        j.vx *= f; j.vz *= f;
        if (j.x - COURT.jackR < COURT.minX) { j.x = COURT.minX + COURT.jackR; j.vx = -j.vx * COURT.wallRestitution; }
        if (j.x + COURT.jackR > COURT.maxX) { j.x = COURT.maxX - COURT.jackR; j.vx = -j.vx * COURT.wallRestitution; }
        if (j.z - COURT.jackR < COURT.minZ) { j.z = COURT.minZ + COURT.jackR; j.vz = -j.vz * COURT.wallRestitution; }
        if (j.z + COURT.jackR > COURT.maxZ) { j.z = COURT.maxZ - COURT.jackR; j.vz = -j.vz * COURT.wallRestitution; }
        const sp = Math.hypot(j.vx ?? 0, j.vz ?? 0);
        if (sp < COURT.minSpeed) { j.vx = 0; j.vz = 0; } else moving = true;
      } else {
        moving = stepPhysics(sim.balls, sim.jack, dt);
        // Forfeit: any ball that hit the wall is removed
        const { forfeitedIds } = detectForfeits(sim.balls, null);
        if (forfeitedIds.length) {
          sim.balls = sim.balls.filter((b) => !forfeitedIds.includes(b.id));
        }
      }
      setSimBalls([...sim.balls]);
      if (sim.jack) setSimJack({ ...sim.jack });
      if (moving && now - start < 8000) {
        requestAnimationFrame(loop);
      } else {
        if (jackPhase && sim.jack) {
          finishJackThrow({ x: sim.jack.x, z: sim.jack.z }, mySide).catch((e) => toast.error(e.message));
        } else {
          finishThrow(sim.balls, sim.jack, mySide).catch((e) => toast.error(e.message));
        }
      }
    };
    requestAnimationFrame(loop);
  };

  // Commit the jack position then keep same player on aim phase for first ball throw
  const finishJackThrow = async (jack: Jack, thrower: "p1" | "p2") => {
    if (!g) return;
    // Validation: jack must land in the valid zone, otherwise re-throw by the same player
    if (!isJackValid(jack)) {
      toast.error("Tsy mety ny boul kely (akaiky/lavitra loatra) — atsipy indray");
      await supabase.rpc("petanque_update_state" as any, {
        _game_id: g.id,
        _state: {
          balls: [],
          jack: null,
          phase: "throw_jack",
          remaining: { p1: BALLS_PER_PLAYER, p2: BALLS_PER_PLAYER },
          lastThrower: thrower,
        },
        _current_turn: thrower === "p1" ? g.player1_id : g.player2_id,
        _turn_started_at: new Date().toISOString(),
        _score_p1: g.score_p1,
        _score_p2: g.score_p2,
        _round_number: g.round_number,
      });
      setThrowing(false);
      return;
    }
    const currentTurnUser = thrower === "p1" ? g.player1_id : g.player2_id;
    await supabase.rpc("petanque_update_state" as any, {
      _game_id: g.id,
      _state: {
        balls: [],
        jack,
        phase: "aim",
        remaining: { p1: BALLS_PER_PLAYER, p2: BALLS_PER_PLAYER },
        lastThrower: thrower,
      },
      _current_turn: currentTurnUser,
      _turn_started_at: new Date().toISOString(),
      _score_p1: g.score_p1,
      _score_p2: g.score_p2,
      _round_number: g.round_number,
    });
    setThrowing(false);
  };

  // ---- 20s auto-throw (robot) — any connected player may trigger after server confirms timeout ----
  useEffect(() => {
    if (!g || !user) return;
    if (g.status !== "in_progress") return;
    if (g.state?.phase !== "aim" && g.state?.phase !== "throw_jack") return;
    if (throwing) return;
    const startMs = g.turn_started_at ? new Date(g.turn_started_at).getTime() : Date.now();
    const key = `${g.id}-${g.turn_started_at ?? "0"}-${g.current_turn}`;
    if (autoThrowRef.current === key) return;
    const delay = Math.max(0, TURN_LIMIT_MS - (Date.now() - startMs));
    const t = setTimeout(() => {
      if (autoThrowRef.current === key) return;
      autoThrowRef.current = key;
      (async () => {
        const { data, error } = await supabase.from("petanque_games" as any).select("*").eq("id", g.id).single();
        if (error || !data) {
          autoThrowRef.current = null;
          return;
        }
        const fresh = data as unknown as GameRow;
        if (fresh.status !== "in_progress" || (fresh.state?.phase !== "aim" && fresh.state?.phase !== "throw_jack")) {
          autoThrowRef.current = null;
          return;
        }
        const freshTurnMs = fresh.turn_started_at ? new Date(fresh.turn_started_at).getTime() : 0;
        if (Date.now() - freshTurnMs < TURN_LIMIT_MS) {
          autoThrowRef.current = null;
          return;
        }
        if (!fresh.current_turn || !user || ![fresh.player1_id, fresh.player2_id].includes(user.id)) {
          autoThrowRef.current = null;
          return;
        }
        const throwSide: "p1" | "p2" | null = fresh.current_turn === fresh.player1_id ? "p1" : fresh.current_turn === fresh.player2_id ? "p2" : null;
        if (!throwSide) {
          autoThrowRef.current = null;
          return;
        }
        // Auto jack-throw if needed
        if (fresh.state?.phase === "throw_jack") {
          const jackX = (Math.random() - 0.5) * 2;
          const jackZ = 5.5 + Math.random() * 2.5;
          const currentTurnUser = throwSide === "p1" ? fresh.player1_id : fresh.player2_id;
          await supabase.rpc("petanque_update_state" as any, {
            _game_id: fresh.id,
            _state: {
              balls: [],
              jack: { x: jackX, z: jackZ },
              phase: "aim",
              remaining: { p1: BALLS_PER_PLAYER, p2: BALLS_PER_PLAYER },
              lastThrower: throwSide,
            },
            _current_turn: currentTurnUser,
            _turn_started_at: new Date().toISOString(),
            _score_p1: fresh.score_p1,
            _score_p2: fresh.score_p2,
            _round_number: fresh.round_number,
          });
          toast("⏱ Robot nanatsipy ny boul kely");
          return;
        }
        const ba = Math.round((Math.random() - 0.5) * 40);
        const bf = 40 + Math.round(Math.random() * 40);
        const remaining = fresh.state?.remaining ?? { p1: BALLS_PER_PLAYER, p2: BALLS_PER_PLAYER };
        if (remaining[throwSide] <= 0) {
          autoThrowRef.current = null;
          return;
        }
        const rad = (ba * Math.PI) / 180;
        const speed = 4 + (bf / 100) * 11;
        const vx = Math.sin(rad) * speed;
        const vz = Math.cos(rad) * speed;
        const newBall: Ball = {
          id: `bot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          owner: throwSide,
          x: 0,
          z: -1.3,
          vx,
          vz,
        };
        const balls: Ball[] = [...(fresh.state?.balls ?? []).map((b) => ({ ...b, vx: 0, vz: 0 })), newBall];
        const jack: Jack | null = fresh.state?.jack ? { ...fresh.state.jack } : null;
        let moving = true;
        let loops = 0;
        while (moving && loops < 480) {
          moving = stepPhysics(balls, jack, 1 / 60);
          loops += 1;
        }
        const prevRemaining = fresh.state?.remaining ?? { p1: BALLS_PER_PLAYER, p2: BALLS_PER_PLAYER };
        const nextRemaining = { ...prevRemaining, [throwSide]: Math.max(0, prevRemaining[throwSide] - 1) };
        let newScoreP1 = fresh.score_p1;
        let newScoreP2 = fresh.score_p2;
        let newRound = fresh.round_number;
        let nextTurnUser: string | null = null;
        let newBalls = balls.map((b) => ({ ...b, vx: 0, vz: 0 }));
        let newJack = jack;
        let roundRemaining = nextRemaining;
        if (nextRemaining.p1 <= 0 && nextRemaining.p2 <= 0 && jack) {
          const r = computeRoundScore(newBalls, jack);
          if (r.winner === "p1") newScoreP1 += r.points;
          if (r.winner === "p2") newScoreP2 += r.points;
          newRound += 1;
          newBalls = [];
          newJack = null;
          roundRemaining = { p1: BALLS_PER_PLAYER, p2: BALLS_PER_PLAYER };
          nextTurnUser = r.winner === "p1" ? fresh.player1_id : fresh.player2_id;
        } else {
          const nx = nextThrower(newBalls, jack, nextRemaining, throwSide);
          nextTurnUser = nx === "p1" ? fresh.player1_id : nx === "p2" ? fresh.player2_id : (throwSide === "p1" ? fresh.player2_id : fresh.player1_id);
        }
        await supabase.rpc("petanque_update_state" as any, {
          _game_id: fresh.id,
          _state: {
            balls: newBalls,
            jack: newJack,
            phase: (nextRemaining.p1 <= 0 && nextRemaining.p2 <= 0) ? "throw_jack" : "aim",
            remaining: roundRemaining,
            lastThrower: throwSide,
          },
          _current_turn: nextTurnUser,
          _turn_started_at: new Date().toISOString(),
          _score_p1: newScoreP1,
          _score_p2: newScoreP2,
          _round_number: newRound,
        });
        toast("⏱ Robot nanatsipy baolina (20s)");
      })().catch(() => {
        autoThrowRef.current = null;
      });
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
    let newPhase: "aim" | "settle" | "throw_jack" = "aim";
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
      // Reset for next round — winner throws the jack first
      newBalls = [];
      newJack = null;
      newRemaining = { p1: BALLS_PER_PLAYER, p2: BALLS_PER_PLAYER };
      newPhase = "throw_jack";
      // Winner of the round throws the jack to start the next one
      nextTurnUser = r.winner === "p1" ? g.player1_id : g.player2_id;
      // 🎉 Applause + bravo when a side actually scores points
      if (r.points > 0) {
        try { sfx.applause(); } catch {}
      }
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

          <AimArrow
            angleDeg={angle}
            force={force}
            visible={isMyTurn && !throwing}
            jack={simJack}
            isJackPhase={isJackPhase}
          />

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
        {/* ---- Visible 20s timer bar ---- */}
        <div className="px-2 pb-1.5">
          <div className="flex items-center gap-2">
            <div
              className={`text-[11px] font-black tabular-nums ${
                remainingSec <= 5 ? "text-red-400 animate-pulse" : remainingSec <= 10 ? "text-amber-300" : "text-emerald-300"
              }`}
              style={{ minWidth: 28 }}
            >
              {remainingSec}s
            </div>
            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-200 ease-linear"
                style={{
                  width: `${timerPct * 100}%`,
                  background:
                    remainingSec <= 5
                      ? "linear-gradient(90deg,#ef4444,#fb7185)"
                      : remainingSec <= 10
                      ? "linear-gradient(90deg,#f59e0b,#fbbf24)"
                      : "linear-gradient(90deg,#10b981,#34d399)",
                }}
              />
            </div>
            <div className="text-[9px] text-white/60 font-semibold uppercase tracking-wider">
              {isMyTurn ? "Anjaranao" : "Mpifanandrina"}
            </div>
          </div>
        </div>
      </div>

      {/* Retour button — sortie sécurisée */}
      <button
        onClick={() => {
          if (confirm("Hiala amin'ity lalao ity? Mety ho very ny mise.")) nav("/petanque");
        }}
        className="absolute top-24 left-3 z-30 px-3 h-10 rounded-full bg-black/70 backdrop-blur border border-white/30 flex items-center gap-1.5 text-white text-xs font-bold shadow-xl hover:bg-black/85"
      >
        <ArrowLeft className="w-4 h-4" /> Retour
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
            // Sotomina MIAKATRA (manaraka ny fléchés mankany aloha) — dy < 0 = hery bebe kokoa
            const pull = Math.max(0, Math.min(PULL_MAX, -dy));
            setForce(Math.round(8 + (pull / PULL_MAX) * 92));
            setAngle(Math.max(-35, Math.min(35, -dx / 4)));
          }}
          onPointerUp={() => {
            if (!dragStart.current) { setDrag(null); return; }
            const d = drag;
            dragStart.current = null;
            setDrag(null);
            if (!d) return;
            const pull = Math.max(0, Math.min(PULL_MAX, -d.dy));
            if (pull < 18) return; // tariny kely loatra — tsy alefa
            const f = Math.round(8 + (pull / PULL_MAX) * 92);
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
                transform: drag ? `translate(${drag.dx}px, ${-Math.max(0, Math.min(PULL_MAX, -drag.dy))}px)` : "none",
                transition: drag ? "none" : "transform 240ms ease-out",
                boxShadow: "0 8px 24px rgba(0,0,0,0.5), inset -4px -6px 12px rgba(0,0,0,0.35), inset 4px 4px 10px rgba(255,255,255,0.35)",
              }}
            />
            {/* tension line */}
            {drag && (drag.dy < 0) && (
              <svg className="absolute top-8 left-8 overflow-visible pointer-events-none" width="1" height="1">
                <line
                  x1={0} y1={0}
                  x2={drag.dx} y2={-Math.max(0, Math.min(PULL_MAX, -drag.dy))}
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
                {isJackPhase
                  ? "⚫ Sotomina makany ALOHA ny fléchés hatsipy ny boul kely"
                  : "⬆️ Sotomina makany ALOHA ny fléchés — arakaraka ny halaviny no halaviny ny baolina"}
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
  const thrown = Math.max(0, 6 - remaining);
  // Tabilao kely: 6 boules — efa natsipy (matt) sy mbola an-tanana (mamiratra)
  const boules = (
    <div className={`flex items-center gap-1.5 ${side === "right" ? "flex-row-reverse" : ""}`}>
      <div className={`flex gap-0.5 ${side === "right" ? "flex-row-reverse" : ""}`}>
        {Array.from({ length: 6 }).map((_, i) => {
          const inHand = i < remaining;
          return (
            <div
              key={i}
              className="w-2.5 h-2.5 rounded-full"
              style={{
                background: inHand
                  ? `radial-gradient(circle at 35% 30%, ${color}, #0a0a0a 85%)`
                  : "rgba(255,255,255,0.08)",
                border: inHand ? "1px solid rgba(255,255,255,0.35)" : "1px dashed rgba(255,255,255,0.25)",
                boxShadow: inHand ? `0 0 4px ${color}80` : "none",
              }}
            />
          );
        })}
      </div>
      <span className="text-[9px] font-bold text-white/70 tabular-nums">
        {thrown}/<span className="text-white">6</span>
      </span>
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