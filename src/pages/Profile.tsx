import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Trash2, Trophy, ShieldCheck } from "lucide-react";
import { fmtAr } from "@/lib/constants";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

const HIDDEN_KEY = "domino_hidden_history";

function loadHidden(uid: string): string[] {
  try { return JSON.parse(localStorage.getItem(`${HIDDEN_KEY}_${uid}`) ?? "[]"); }
  catch { return []; }
}
function saveHidden(uid: string, ids: string[]) {
  localStorage.setItem(`${HIDDEN_KEY}_${uid}`, JSON.stringify(ids));
}

export default function Profile() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [games, setGames] = useState<any[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState<string[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [rg, setRg] = useState<any>(null);
  const [lossLimit, setLossLimit] = useState("");
  const [stakeLimit, setStakeLimit] = useState("");
  const [excludeDays, setExcludeDays] = useState("7");

  useEffect(() => {
    if (!user) return;
    setHidden(loadHidden(user.id));
    (async () => {
      const { data: p } = await supabase.from("profiles").select("*").eq("user_id", user.id).single();
      setProfile(p);
      const { data: r } = await supabase.from("responsible_gaming").select("*").eq("user_id", user.id).maybeSingle();
      if (r) {
        setRg(r);
        setLossLimit(r.daily_loss_limit?.toString() ?? "");
        setStakeLimit(r.daily_stake_limit?.toString() ?? "");
      }
      const { data: g } = await supabase.from("games")
        .select("id, stake, status, winner_id, player1_id, player2_id, player3_id, score_p1, score_p2, score_p3, players_count, ticket_number, finished_at, created_at, game_mode")
        .or(`player1_id.eq.${user.id},player2_id.eq.${user.id},player3_id.eq.${user.id}`)
        .in("status", ["finished", "cancelled", "blocked"])
        .order("finished_at", { ascending: false, nullsFirst: false })
        .limit(200);
      setGames(g ?? []);
      const ids = new Set<string>();
      (g ?? []).forEach((x: any) => {
        [x.player1_id, x.player2_id, x.player3_id].forEach((id) => id && ids.add(id));
      });
      if (ids.size) {
        const { data: ps } = await supabase.from("profiles").select("user_id, mvola_name").in("user_id", Array.from(ids));
        const m: Record<string, string> = {};
        (ps ?? []).forEach((p: any) => { m[p.user_id] = p.mvola_name ?? "Mpilalao"; });
        setNames(m);
      }
    })();
  }, [user]);

  const saveLimits = async () => {
    if (!user) return;
    const payload: any = {
      user_id: user.id,
      daily_loss_limit: lossLimit ? Number(lossLimit) : null,
      daily_stake_limit: stakeLimit ? Number(stakeLimit) : null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("responsible_gaming").upsert(payload, { onConflict: "user_id" });
    if (error) return toast.error(error.message);
    toast.success("Voatahiry ny fetra");
    setRg({ ...(rg ?? {}), ...payload });
  };

  const selfExclude = async () => {
    if (!user) return;
    const days = Math.max(1, Number(excludeDays) || 1);
    const until = new Date(Date.now() + days * 86400_000).toISOString();
    const { error } = await supabase.from("responsible_gaming").upsert({
      user_id: user.id, self_excluded_until: until, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) return toast.error(error.message);
    await supabase.rpc("log_audit", { _action: "self_exclude", _meta: { days, until } });
    toast.success(`Voasakana hatramin'ny ${new Date(until).toLocaleDateString("fr-FR")}`);
    setRg({ ...(rg ?? {}), self_excluded_until: until });
  };

  if (!user) {
    return <div className="min-h-screen felt-bg flex items-center justify-center text-muted-foreground">Miditra aloha…</div>;
  }

  const visible = games.filter((g) => !hidden.includes(g.id));
  const wins = visible.filter((g) => g.winner_id === user.id).length;
  const losses = visible.filter((g) => g.winner_id && g.winner_id !== user.id).length;
  const totalGain = visible.reduce((s, g) => {
    const stake = Number(g.stake ?? 0);
    const pc = Number(g.players_count ?? 2);
    const commissionEach = Math.round(stake * 0.10);
    const pot = (stake - commissionEach) * pc;
    if (g.winner_id === user.id) return s + (pot - stake);
    if (g.winner_id) return s - stake;
    return s;
  }, 0);

  const deleteOne = (id: string) => {
    const next = [...hidden, id];
    setHidden(next); saveHidden(user.id, next);
    setConfirmId(null);
    toast.success("Voafafa amin'ny historique");
  };
  const deleteAll = () => {
    const next = Array.from(new Set([...hidden, ...games.map((g) => g.id)]));
    setHidden(next); saveHidden(user.id, next);
    setConfirmAll(false);
    toast.success("Voafafa daholo ny historique");
  };

  return (
    <div className="min-h-screen felt-bg pb-24">
      <header className="p-4 flex items-center gap-3 border-b border-primary/20">
        <Button variant="ghost" size="icon" onClick={() => nav(-1 as any)}><ArrowLeft className="w-5 h-5" /></Button>
        <h1 className="font-display gold-text text-xl font-bold">Profile</h1>
      </header>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        <div className="card-felt rounded-2xl p-5 text-center">
          {profile?.selfie_url || profile?.avatar_url ? (
            <img src={profile.selfie_url ?? profile.avatar_url} alt="" className="w-24 h-24 rounded-full object-cover mx-auto border-4 border-primary/60 shadow-lg" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-primary/20 mx-auto flex items-center justify-center text-3xl font-bold gold-text border-4 border-primary/60">
              {(profile?.mvola_name?.[0] ?? "?").toUpperCase()}
            </div>
          )}
          <h2 className="font-display text-2xl font-bold mt-3">{profile?.mvola_name ?? "..."}</h2>
          <p className="text-xs text-muted-foreground">{profile?.phone}</p>
          {profile?.player_number != null && (
            <p className="mt-2 inline-block rounded-full bg-primary/20 border border-primary/40 px-3 py-1 text-xs font-mono font-bold gold-text">
              ID Nº {String(profile.player_number).padStart(4, "0")}
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="card-felt rounded-xl p-3 text-center">
            <p className="text-xs text-muted-foreground">Resy lavitra</p>
            <p className="text-2xl font-bold text-green-500">{wins}</p>
          </div>
          <div className="card-felt rounded-xl p-3 text-center">
            <p className="text-xs text-muted-foreground">Resy</p>
            <p className="text-2xl font-bold text-red-500">{losses}</p>
          </div>
          <div className="card-felt rounded-xl p-3 text-center">
            <p className="text-xs text-muted-foreground">Tombony</p>
            <p className={`text-base font-bold ${totalGain >= 0 ? "text-green-500" : "text-red-500"}`}>
              {totalGain >= 0 ? "+" : ""}{fmtAr(totalGain)}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4">
          <h3 className="font-display text-lg font-bold gold-text flex items-center gap-2">
            <Trophy className="w-5 h-5" /> Historique lalao
          </h3>
          {visible.length > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setConfirmAll(true)} className="gap-1">
              <Trash2 className="w-3.5 h-3.5" /> Fafao daholo
            </Button>
          )}
        </div>

        {visible.length === 0 ? (
          <div className="card-felt rounded-xl p-6 text-center text-sm text-muted-foreground">
            Mbola tsy misy lalao vita.
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((g) => {
              const stake = Number(g.stake ?? 0);
              const pc = Number(g.players_count ?? 2);
              const commissionEach = Math.round(stake * 0.10);
              const pot = (stake - commissionEach) * pc;
              const iWon = g.winner_id === user.id;
              const draw = !g.winner_id;
              const myScore = user.id === g.player1_id ? g.score_p1 : user.id === g.player2_id ? g.score_p2 : g.score_p3;
              const oppIds = [g.player1_id, g.player2_id, g.player3_id].filter((x) => x && x !== user.id);
              const oppNames = oppIds.map((id) => names[id] ?? "?").join(" · ");
              const date = g.finished_at ?? g.created_at;
              return (
                <div key={g.id} className={`card-felt rounded-xl p-3 border-l-4 ${draw ? "border-muted" : iWon ? "border-green-500" : "border-red-500"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${draw ? "bg-muted text-foreground" : iWon ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                          {draw ? "TAPAKA" : iWon ? "NANDRESY" : "RESY"}
                        </span>
                        <span className="text-[10px] text-muted-foreground uppercase">{g.game_mode ?? "d120"} · {pc}P</span>
                      </div>
                      <p className="text-sm mt-1 truncate">vs <b>{oppNames || "?"}</b></p>
                      <p className="text-xs text-muted-foreground">
                        Score: {Number(myScore ?? 0)} · Mise: {fmtAr(stake)}
                        {iWon && <span className="text-green-400 font-bold"> · +{fmtAr(pot - stake)}</span>}
                        {!iWon && !draw && <span className="text-red-400 font-bold"> · -{fmtAr(stake)}</span>}
                      </p>
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                        {date ? new Date(date).toLocaleString("fr-FR") : ""}
                        {g.ticket_number ? ` · #${g.ticket_number}` : ""}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => setConfirmId(g.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="card-felt rounded-2xl p-4 mt-6 space-y-3">
          <h3 className="font-display text-lg font-bold gold-text flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" /> Fitsipika fitehirizan-tena
          </h3>
          <p className="text-xs text-muted-foreground">Mametra fetra ho an'ny tena mba tsy ho voafitaky ny lalao.</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Mise max/jour (Ar)</Label>
              <Input type="number" value={stakeLimit} onChange={(e) => setStakeLimit(e.target.value)} placeholder="50000" />
            </div>
            <div>
              <Label className="text-[11px]">Fatiantoka max/jour (info)</Label>
              <Input type="number" value={lossLimit} onChange={(e) => setLossLimit(e.target.value)} placeholder="20000" />
            </div>
          </div>
          <Button onClick={saveLimits} className="w-full">Tehirizo ny fetra</Button>

          <div className="pt-3 border-t border-border/40">
            <p className="text-xs font-bold mb-2 text-destructive">⛔ Self-exclusion (auto-ban)</p>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label className="text-[11px]">Andro</Label>
                <Input type="number" min={1} max={365} value={excludeDays} onChange={(e) => setExcludeDays(e.target.value)} />
              </div>
              <Button variant="destructive" onClick={selfExclude}>Sakàno aho</Button>
            </div>
            {rg?.self_excluded_until && new Date(rg.self_excluded_until) > new Date() && (
              <p className="text-xs text-destructive mt-2 font-bold">
                Voasakana hatramin'ny {new Date(rg.self_excluded_until).toLocaleString("fr-FR")}
              </p>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={!!confirmId} onOpenChange={(o) => !o && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hofafana ity lalao ity?</AlertDialogTitle>
            <AlertDialogDescription>Hesorina amin'ny historique-nao fotsiny — tsy voafafa ny solde.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => confirmId && deleteOne(confirmId)}>
              Fafao
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hofafana daholo ny historique?</AlertDialogTitle>
            <AlertDialogDescription>Hesorina amin'ny historique-nao avokoa — tsy voakitika ny solde.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={deleteAll}>
              Fafao daholo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}