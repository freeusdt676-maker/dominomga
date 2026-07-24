import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Radio, Hash, Loader2 } from "lucide-react";
import { SnakeBoard } from "@/components/SnakeBoard";
import { DominoBack } from "@/components/DominoTile";
import SpectatorWinner from "@/components/SpectatorWinner";
import type { Placed, Tile } from "@/lib/dominoEngine";
import dominoSceneBg from "@/assets/domino-scene.jpg";

type Snap = {
  id: string;
  ticket: string | null;
  status: string;
  board: Placed[] | null;
  current_turn: string | null;
  p1_id: string | null;
  p2_id: string | null;
  p3_id: string | null;
  p1_name: string | null;
  p2_name: string | null;
  p3_name: string | null;
  p1_count: number;
  p2_count: number;
  p3_count: number;
  boneyard_count: number;
  score_p1: number;
  score_p2: number;
  score_p3: number;
  players_count: number;
  mode?: string | null;
  stake?: number | null;
  round: number;
  last_reason: string | null;
  reveal_until?: string | null;
  p1_hand?: Tile[] | null;
  p2_hand?: Tile[] | null;
  p3_hand?: Tile[] | null;
};

function formatK(n?: number | null) {
  const v = Number(n ?? 0);
  if (v >= 1000) {
    const k = v / 1000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return String(v);
}
function modeLabel(m?: string | null) {
  if (m === "d80") return "D80";
  return "D120";
}

export default function SpectateDomino() {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<Snap | null>(null);
  const [missing, setMissing] = useState(false);
  const [lastSnap, setLastSnap] = useState<Snap | null>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    const load = async () => {
      const { data } = await (supabase.rpc as any)("spectator_get", { _game: "domino", _id: id });
      if (!alive) return;
      if (!data) { setMissing(true); setS(null); return; }
      setMissing(false);
      setS(data as Snap);
      setLastSnap(data as Snap);
    };
    load();
    const t = window.setInterval(load, 1500);
    return () => { alive = false; window.clearInterval(t); };
  }, [id]);

  // Lalao tapitra → endriky ny mpandresy
  if (missing && lastSnap) {
    const ranking = [
      { name: lastSnap.p1_name ?? "P1", score: Number(lastSnap.score_p1 ?? 0) },
      { name: lastSnap.p2_name ?? "P2", score: Number(lastSnap.score_p2 ?? 0) },
      ...(lastSnap.players_count === 3
        ? [{ name: lastSnap.p3_name ?? "P3", score: Number(lastSnap.score_p3 ?? 0) }]
        : []),
    ];
    return <SpectatorWinner ranking={ranking} />;
  }

  return (
    <div className="h-[100svh] max-h-[100svh] overflow-hidden domino-scene-bg flex flex-col" style={{ backgroundImage: `url(${dominoSceneBg})` }}>
      <header className="flex items-center justify-between p-3 border-b border-primary/20">
        <Link to="/" className="flex items-center gap-2 text-sm text-foreground">
          <ArrowLeft className="w-5 h-5" /> <span className="text-base font-bold">Hiverina</span>
        </Link>
        <div className="flex items-center gap-2 text-base">
          <Radio className="w-5 h-5 text-red-500 animate-pulse" />
          <span className="font-extrabold text-red-500 text-lg tracking-widest">LIVE</span>
          <span className="text-muted-foreground">·</span>
          <Hash className="w-4 h-4 text-primary" />
          <span className="font-mono font-extrabold text-base">
            {s?.ticket ?? id?.replace(/-/g, "").slice(-6).toUpperCase()}
          </span>
        </div>
        <div className="w-20 text-right text-xs font-bold text-muted-foreground italic">Spectateur</div>
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
        <div className="flex-1 min-h-0 flex flex-col gap-2 p-2">
          {/* Détail lalao — mode / mise / joueurs / round */}
          <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] font-bold">
            <span className="px-2 py-0.5 rounded-full bg-primary/20 border border-primary/40 gold-text">Domy maty {modeLabel(s.mode) === "D80" ? 80 : 120}</span>
            <span className="px-2 py-0.5 rounded-full bg-primary/20 border border-primary/40 gold-text">Mise {formatK(s.stake)}</span>
            <span className="px-2 py-0.5 rounded-full bg-primary/20 border border-primary/40 gold-text">{s.players_count}P</span>
            <span className="px-2 py-0.5 rounded-full bg-primary/20 border border-primary/40 gold-text">Tour {Number(s.round ?? 1)}</span>
          </div>

          {/* Cartes joueurs — score + vato sisa mitambatra */}
          <div className={`grid gap-2 ${s.players_count === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
            {[
              { name: s.p1_name, score: s.score_p1, id: s.p1_id, count: s.p1_count },
              { name: s.p2_name, score: s.score_p2, id: s.p2_id, count: s.p2_count },
              ...(s.players_count === 3
                ? [{ name: s.p3_name, score: s.score_p3, id: s.p3_id, count: s.p3_count }]
                : []),
            ].map((p, i) => {
              const active = p.id && s.current_turn === p.id;
              return (
                <div
                  key={i}
                  className={`p-2 rounded-xl border-2 bg-card/40 flex flex-col gap-1 ${active ? "domino-turn-border" : "border-primary/20"}`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-extrabold truncate">{p.name ?? "—"}</span>
                    <span className="font-display text-xl gold-text">{Number(p.score ?? 0)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="flex flex-wrap gap-0.5 flex-1">
                      {Array.from({ length: Math.min(Number(p.count ?? 0), 7) }).map((_, k) => (
                        <DominoBack key={k} size="xxs" horizontal={false} />
                      ))}
                    </div>
                    <span className="text-[9px] text-muted-foreground">({Number(p.count ?? 0)})</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Board */}
          <div className="felt-board relative w-full min-h-0 flex-1 overflow-hidden">
            <div className="domino-arena absolute inset-0 rounded-2xl">
              <SnakeBoard board={(s.board ?? []) as Placed[]} tileSize="sm" />
            </div>
          </div>

          {s.last_reason && (
            <div className="text-center text-xs text-muted-foreground italic">{s.last_reason}</div>
          )}
        </div>
      )}
    </div>
  );
}