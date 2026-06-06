import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Radio, Hash, Loader2 } from "lucide-react";
import LudoBoard from "@/components/LudoBoard";
import { SEAT_COLOR, activeSeats, type Pawn } from "@/lib/ludoEngine";

type Snap = {
  id: string;
  ticket: string | null;
  status: string;
  pawns: Pawn[];
  current_turn_seat: number;
  last_dice: number | null;
  dice_rolled: boolean;
  players_count: number;
  p1_name: string | null;
  p2_name: string | null;
  p3_name: string | null;
  p4_name: string | null;
  seat_assignment: Record<string, string> | null;
};

export default function SpectateLudo() {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<Snap | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    const load = async () => {
      const { data } = await supabase.rpc("spectator_get", { _game: "ludo", _id: id });
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
          {/* Seats info */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {activeSeats(s.players_count).map((seat) => {
              const name = (s as any)[`p${seat}_name`] as string | null;
              const active = s.current_turn_seat === seat;
              return (
                <div
                  key={seat}
                  className={`p-2 rounded-xl border-2 ${active ? "border-primary shadow-[0_0_14px_rgba(212,175,55,0.5)]" : "border-primary/20"} bg-card/40 flex items-center gap-2`}
                >
                  <span className="inline-block w-3 h-3 rounded-full" style={{ background: SEAT_COLOR[seat] }} />
                  <span className="text-xs font-bold truncate flex-1">{name ?? `Seat ${seat}`}</span>
                  {active && s.last_dice && (
                    <span className="text-xs font-mono font-bold text-primary">🎲 {s.last_dice}</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Board (read-only — no onPawnClick) */}
          <div className="flex-1 mx-auto w-full max-w-[600px] aspect-square">
            <LudoBoard pawns={s.pawns ?? []} playersCount={s.players_count} />
          </div>
        </div>
      )}
    </div>
  );
}