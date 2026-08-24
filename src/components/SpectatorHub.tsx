import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Radio, Users, Coins, Hash, Loader2, Plane } from "lucide-react";
import { fmtAr } from "@/lib/constants";

type GameType = "domino" | "ludo" | "petanque";
type TabKey = GameType | "crash";

type Row = {
  id: string;
  ticket: string | null;
  stake: number;
  players_count?: number;
  score_p1?: number;
  score_p2?: number;
  score_p3?: number;
  round?: number;
  created_at: string;
  p1?: string | null;
  p2?: string | null;
  p3?: string | null;
  p4?: string | null;
};

const LABELS: Record<GameType, string> = {
  domino: "DOMINO",
  ludo: "LUDO",
  petanque: "PÉTANQUE",
};

function shortTick(id: string, ticket: string | null) {
  if (ticket) return ticket;
  return id.replace(/-/g, "").slice(-6).toUpperCase();
}

/** LIVE Crash MGA — état du round + mises en cours */
function CrashLive({ onOpen }: { onOpen: () => void }) {
  const [round, setRound] = useState<any>(null);
  const [bets, setBets] = useState<any[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [{ data: r }, { data: b }] = await Promise.all([
        supabase.from("crash_rounds").select("*").order("round_no", { ascending: false }).limit(1).maybeSingle(),
        (supabase.rpc as any)("crash_round_bets", { _round_id: null }),
      ]);
      if (!alive) return;
      setRound(r ?? null);
      setBets(Array.isArray(b) ? b : []);
    };
    load();
    const id = window.setInterval(() => { if (document.visibilityState === "visible") load(); }, 3000);
    const raf = window.setInterval(() => setNow(Date.now()), 100);
    return () => { alive = false; window.clearInterval(id); window.clearInterval(raf); };
  }, []);

  if (!round) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  const status = round.status as string;
  // Same 0.6s display lag as the game page: the number shown never overshoots
  // the official crash point, so live view and result always agree.
  const live =
    status === "running" && round.started_at
      ? Math.max(1, Math.floor(Math.exp(0.08 * Math.max(0, (now - new Date(round.started_at).getTime()) / 1000 - 0.6)) * 100) / 100)
      : null;
  const shown =
    status === "crashed" ? Number(round.crash_point ?? 1) : live;


  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onOpen}
        className="rounded-2xl p-4 border-2 border-red-500/40 bg-gradient-to-br from-red-500/10 to-transparent text-center active:scale-[0.98] transition"
      >
        <div className="flex items-center justify-center gap-2 text-xs font-bold text-muted-foreground">
          <span className="inline-flex w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          Round #{round.round_no} ·{" "}
          {status === "betting" ? "MISE MISOKATRA" : status === "running" ? "MANIDINA" : "CRASHÉ"}
        </div>
        <div
          className={`mt-1 font-display font-black text-4xl ${
            status === "crashed" ? "text-red-500" : "text-emerald-400"
          }`}
        >
          ×{(shown ?? 1).toFixed(2)}
        </div>
        <div className="mt-1 flex items-center justify-center gap-1 text-xs text-primary font-bold">
          <Plane className="w-3.5 h-3.5" /> Hilalao Crash MGA
        </div>
      </button>

      <div className="flex flex-col gap-1.5 max-h-[38vh] overflow-y-auto pr-1">
        {bets.length === 0 && (
          <div className="text-center py-6 text-sm text-muted-foreground italic">Tsy misy mise</div>
        )}
        {bets.map((b: any, i: number) => (
          <div
            key={b.id ?? i}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-primary/20 bg-card/40 text-xs"
          >
            <span className="font-mono text-muted-foreground truncate">{b.phone ?? b.masked_phone ?? "Mpilalao"}</span>
            <span className="font-bold text-foreground">{fmtAr(Number(b.amount ?? 0))}</span>
            <span className={`font-bold ${b.status === "cashed" ? "text-emerald-400" : b.status === "lost" ? "text-red-500" : "text-muted-foreground"}`}>
              {b.status === "cashed" ? `×${Number(b.cashout_multiplier ?? 0).toFixed(2)}` : b.status === "lost" ? "✖" : "…"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GamesList({
  type,
  onPick,
}: {
  type: GameType;
  onPick: (id: string) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await (supabase.rpc as any)("spectator_list", { _game: type });
      if (alive) setRows(Array.isArray(data) ? (data as Row[]) : []);
    };
    load();
    const refresh = () => { if (document.visibilityState === "visible") load(); };
    const id = window.setInterval(refresh, 10000);
    window.addEventListener("online", load);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener("online", load);
    };
  }, [type]);

  if (rows === null) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-muted-foreground italic">
        Tsy misy lalao mandeha
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto pr-1">
      {rows.map((r) => {
        const players = [r.p1, r.p2, r.p3, r.p4].filter(Boolean) as string[];
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onPick(r.id)}
            className="text-left p-3 rounded-xl border-2 border-primary/30 bg-card/40 hover:border-primary hover:bg-card/70 transition active:scale-[0.98]"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <Hash className="w-3.5 h-3.5 text-primary" />
                <span className="font-mono font-bold text-sm text-foreground">
                  {shortTick(r.id, r.ticket)}
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs text-primary font-bold">
                <Coins className="w-3.5 h-3.5" />
                {fmtAr(r.stake)}
              </div>
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="w-3.5 h-3.5" />
              <span className="truncate">
                {players.join(" · ") || "Mpilalao"}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function SpectatorHub({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const nav = useNavigate();
  const [tab, setTab] = useState<TabKey>("domino");

  const goSpectate = (id: string) => {
    onOpenChange(false);
    nav(`/spectate/${tab}/${id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-red-500" />
            <span>LIVE — Lalao mandeha</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="grid grid-cols-4 w-full">
            {(Object.keys(LABELS) as GameType[]).map((t) => (
              <TabsTrigger key={t} value={t} className="text-[10px] font-bold px-1">
                {LABELS[t]}
              </TabsTrigger>
            ))}
            <TabsTrigger value="crash" className="text-[10px] font-bold px-1">
              CRASH
            </TabsTrigger>
          </TabsList>

          {(Object.keys(LABELS) as GameType[]).map((t) => (
            <TabsContent key={t} value={t} className="mt-3">
              <GamesList type={t} onPick={goSpectate} />
            </TabsContent>
          ))}

          <TabsContent value="crash" className="mt-3">
            <CrashLive
              onOpen={() => {
                onOpenChange(false);
                nav("/crash");
              }}
            />
          </TabsContent>
        </Tabs>

        <p className="text-[10px] text-center text-muted-foreground/70 mt-2 italic">
          Mode spectateurs · ny vato eo am-pelatànana tsy hita
        </p>
      </DialogContent>
    </Dialog>
  );
}