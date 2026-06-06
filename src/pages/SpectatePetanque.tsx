import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Radio, Hash, Loader2 } from "lucide-react";
import { COURT, type Ball, type Jack } from "@/lib/petanqueEngine";

type Snap = {
  id: string;
  ticket: string | null;
  status: string;
  state: {
    balls: Ball[];
    jack: Jack | null;
    phase: string;
    remaining: { p1: number; p2: number };
  };
  current_turn: string | null;
  score_p1: number;
  score_p2: number;
  round: number;
  p1_id: string | null;
  p2_id: string | null;
  p1_name: string | null;
  p2_name: string | null;
};

/** 2D top-down view of the pétanque court for spectators */
function Court2D({ balls, jack }: { balls: Ball[]; jack: Jack | null }) {
  const W = COURT.maxX - COURT.minX;
  const H = COURT.maxZ - COURT.minZ;
  // map court coords -> svg coords (rotate so length is vertical, throw line at bottom)
  const toX = (x: number) => ((x - COURT.minX) / W) * 100;
  const toY = (z: number) => 100 - ((z - COURT.minZ) / H) * 100;
  const ballR = (COURT.ballR / W) * 100;
  const jackR = (COURT.jackR / W) * 100;

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id="sand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c9a878" />
          <stop offset="100%" stopColor="#8a6a3a" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="url(#sand)" />
      <rect x="0.5" y="0.5" width="99" height="99" fill="none" stroke="#4a3015" strokeWidth="0.6" />
      {jack && (
        <circle cx={toX(jack.x)} cy={toY(jack.z)} r={jackR} fill="#fff" stroke="#000" strokeWidth="0.3" />
      )}
      {balls.map((b) => (
        <g key={b.id}>
          <circle
            cx={toX(b.x)}
            cy={toY(b.z)}
            r={ballR}
            fill={b.owner === "p1" ? "#1f7fd6" : "#e63946"}
            stroke="#000"
            strokeWidth="0.3"
          />
        </g>
      ))}
    </svg>
  );
}

export default function SpectatePetanque() {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<Snap | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    const load = async () => {
      const { data } = await supabase.rpc("spectator_get", { _game: "petanque", _id: id });
      if (!alive) return;
      if (!data) { setMissing(true); setS(null); return; }
      setMissing(false);
      setS(data as Snap);
    };
    load();
    const t = window.setInterval(load, 1500);
    return () => { alive = false; window.clearInterval(t); };
  }, [id]);

  return (
    <div className="min-h-screen felt-bg flex flex-col">
      <header className="flex items-center justify-between p-3 border-b border-primary/20">
        <Link to="/" className="flex items-center gap-2 text-sm text-foreground">
          <ArrowLeft className="w-4 h-4" /> Hiverina
        </Link>
        <div className="flex items-center gap-2 text-xs">
          <Radio className="w-4 h-4 text-red-500 animate-pulse" />
          <span className="font-bold text-red-500">LIVE</span>
          <span className="text-muted-foreground">·</span>
          <Hash className="w-3 h-3 text-primary" />
          <span className="font-mono font-bold">
            {s?.ticket ?? id?.replace(/-/g, "").slice(-6).toUpperCase()}
          </span>
        </div>
        <div className="w-16 text-right text-[10px] text-muted-foreground italic">Spectateur</div>
      </header>

      {missing && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground italic">
          Tsy misy lalao mandeha amin'io tick io intsony
        </div>
      )}
      {!missing && !s && (
        <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      )}

      {s && (
        <div className="flex-1 flex flex-col gap-3 p-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              { name: s.p1_name ?? "P1", score: s.score_p1, id: s.p1_id, color: "#1f7fd6", rem: s.state?.remaining?.p1 ?? 0 },
              { name: s.p2_name ?? "P2", score: s.score_p2, id: s.p2_id, color: "#e63946", rem: s.state?.remaining?.p2 ?? 0 },
            ].map((p, i) => {
              const active = p.id && s.current_turn === p.id;
              return (
                <div key={i} className={`p-2 rounded-xl border-2 ${active ? "border-primary" : "border-primary/20"} bg-card/40`}>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full" style={{ background: p.color }} />
                    <span className="text-xs font-bold truncate flex-1">{p.name}</span>
                    <span className="font-display text-lg gold-text">{p.score}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Boules sisa: {p.rem}</div>
                </div>
              );
            })}
          </div>

          <div className="flex-1 mx-auto w-full max-w-[260px] aspect-[1/3] rounded-2xl border-2 border-primary/40 overflow-hidden">
            <Court2D balls={s.state?.balls ?? []} jack={s.state?.jack ?? null} />
          </div>

          <div className="text-center text-xs text-muted-foreground">
            Round #{s.round} · phase: {s.state?.phase ?? "—"}
          </div>
        </div>
      )}
    </div>
  );
}