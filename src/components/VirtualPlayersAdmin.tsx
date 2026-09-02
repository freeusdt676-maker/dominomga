import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Bot, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const BOT_LEVELS = [
  { level: 50, label: "50%", desc: "Atonony ny fahaizany" },
  { level: 60, label: "60%", desc: "Ambonimbony kokoa" },
  { level: 70, label: "70%", desc: "Mahay" },
  { level: 80, label: "80%", desc: "Tena mahay & mahalala vato" },
  { level: 100, label: "100%", desc: "Tsy azo resena" },
] as const;

type Row = {
  user_id: string;
  name: string;
  phone: string;
  level: string;
  active: boolean;
  online: boolean;
  status: string;
  game_id: string | null;
  games_played: number;
  wins: number;
};

const STATUS_LABEL: Record<string, string> = {
  en_partie: "En partie",
  dans_un_lobby: "Dans un lobby",
  en_attente: "En attente",
  offline: "Offline",
};

const STATUS_CLASS: Record<string, string> = {
  en_partie: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  dans_un_lobby: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  en_attente: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  offline: "bg-muted text-muted-foreground border-border",
};

/** Admin-only monitoring of the virtual (BOT) players — invisible to players. */
export default function VirtualPlayersAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [skill, setSkill] = useState<number | null>(null);
  const [skillBusy, setSkillBusy] = useState(false);
  const [botsOn, setBotsOn] = useState<boolean | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data }, { data: en }] = await Promise.all([
      supabase.rpc("admin_list_virtual_players"),
      supabase.rpc("bots_enabled" as any),
    ]);
    setRows((data as Row[]) ?? []);
    if (typeof en === "boolean") setBotsOn(en);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const toggleBots = async (next: boolean) => {
    setToggleBusy(true);
    const { data, error } = await supabase.rpc("admin_set_bots_enabled" as any, { _enabled: next });
    setToggleBusy(false);
    if (error) return toast.error("Tsy tafita ny fanovana");
    setBotsOn(next);
    const r = data as any;
    toast.success(
      next
        ? "Bot vurtiel NAVELA — hipoitra indray izy ireo"
        : `Bot vurtiel NAJANONA — salle voafafa: ${r?.rooms_cancelled ?? 0} · demo: ${r?.demo_cancelled ?? 0}`,
    );
    load();
  };

  const setLevel = async (level: number) => {
    setSkillBusy(true);
    const { data, error } = await supabase.rpc("admin_set_bot_skill" as any, { _level: level });
    setSkillBusy(false);
    if (error || data !== true) return toast.error("Tsy voatahiry ny niveau");
    setSkill(level);
    toast.success(`Niveau bot: ${level}%`);
  };


  const online = rows.filter((r) => r.online).length;
  const inGame = rows.filter((r) => r.status === "en_partie").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-primary" />
          <span className="font-display font-bold text-sm">
            Joueurs virtuels — {rows.length} · en ligne {online} · en partie {inGame}
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card/60 p-3 space-y-2">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
          🎚️ Niveau bot {skill !== null && <span className="text-primary">· {skill}%</span>}
        </p>
        <div className="grid grid-cols-5 gap-1.5">
          {BOT_LEVELS.map((l) => (
            <button
              key={l.level}
              type="button"
              disabled={skillBusy}
              onClick={() => setLevel(l.level)}
              className={`rounded-lg border px-1 py-2 text-center transition-all ${
                skill === l.level
                  ? "border-primary bg-primary/15 text-primary shadow-[0_0_12px_hsl(var(--primary)/0.35)]"
                  : "border-border bg-background/60 text-foreground hover:border-primary/50"
              }`}
            >
              <span className="block text-sm font-extrabold">{l.label}</span>
              <span className="block text-[9px] leading-tight text-muted-foreground mt-0.5">{l.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
        {rows.length === 0 && (
          <p className="text-xs text-muted-foreground py-3 text-center">Tsy misy joueur virtuel</p>
        )}
        {rows.map((r) => (
          <div
            key={r.user_id}
            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card/60 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate">
                🤖 {r.name} <span className="text-muted-foreground">· {r.phone}</span>
              </p>
              <p className="text-[10px] text-muted-foreground">
                Niveau: {r.level} · Parties: {r.games_played} · Victoires: {r.wins}
              </p>
            </div>
            <span
              className={`shrink-0 text-[10px] px-2 py-1 rounded-full border ${STATUS_CLASS[r.status] ?? STATUS_CLASS.offline}`}
            >
              {STATUS_LABEL[r.status] ?? r.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
