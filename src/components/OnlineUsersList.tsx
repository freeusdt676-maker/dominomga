import { useEffect, useState } from "react";
import { Globe2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  subscribeOnlineMembers,
  type PresenceMember,
} from "@/hooks/useGlobalPresence";

type Props = { accent?: string };

/**
 * Lisitra mahalaky ny olona REHETRA misokatra ny app amin'izao fotoana izao
 * (en temps réel) — mpilalao tena izy (presence) + mpilalao virtoaly en ligne,
 * mifangaro tsara, tsy misy marika mampiavaka azy ireo.
 */
export default function OnlineUsersList({ accent = "text-primary" }: Props) {
  const [members, setMembers] = useState<PresenceMember[]>([]);
  const [virtualNames, setVirtualNames] = useState<string[]>([]);

  useEffect(() => {
    return subscribeOnlineMembers(setMembers);
  }, []);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      const { data } = await supabase.rpc("virtual_online_players" as any);
      if (!stop) setVirtualNames(((data as { name: string }[]) ?? []).map((r) => r.name));
    };
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 30000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  const total = members.length + virtualNames.length;

  return (
    <div className="rounded-2xl p-4 border border-white/10 bg-black/20 backdrop-blur">
      <div className="flex items-center gap-2 mb-2">
        <Globe2 className={`w-4 h-4 ${accent}`} />
        <h3 className={`font-display font-bold ${accent}`}>
          En ligne amin'ny app ({total})
        </h3>
      </div>
      {total === 0 ? (
        <p className="text-center text-xs text-muted-foreground py-3">
          Tsy mbola misy olona en ligne
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {members.map((m) => (
            <li
              key={m.user_id}
              className="px-2 py-1 rounded-full text-[11px] font-semibold bg-white/10 border border-white/15"
              title={m.phone || undefined}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 align-middle animate-pulse" />
              {m.name}
            </li>
          ))}
          {virtualNames.map((n) => (
            <li
              key={`v-${n}`}
              className="px-2 py-1 rounded-full text-[11px] font-semibold bg-white/10 border border-white/15"
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 align-middle animate-pulse" />
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}