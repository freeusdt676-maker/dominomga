import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Users } from "lucide-react";
import { useVirtualOnlineCount } from "@/hooks/useVirtualOnlineCount";

type Props = {
  kind: "domino" | "ludo" | "petanque";
  accent?: string; // tailwind text color class
};

type Member = { user_id: string; name: string };

/**
 * Lisitra mahalaky ny mpilalao tafiditra ao amin'ny lobby (Domino/Ludo/Pétanque).
 * Mampiasa Supabase Realtime Presence — miakatra/midina arakaraka ny olona
 * miditra/miala ny pejy lobby tsy mila refresh.
 */
export default function LobbyPresence({ kind, accent = "text-primary" }: Props) {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const botOnline = useVirtualOnlineCount();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let myName = "Mpilalao";
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("mvola_name")
        .eq("user_id", user.id)
        .maybeSingle();
      myName = (data?.mvola_name as string) || "Mpilalao";
      if (cancelled) return;
      channel = supabase.channel(`lobby-presence-${kind}`, {
        config: { presence: { key: user.id } },
      });
      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState() as Record<string, Array<{ name?: string }>>;
          const list: Member[] = Object.entries(state).map(([uid, metas]) => ({
            user_id: uid,
            name: (metas?.[0]?.name as string) || "Mpilalao",
          }));
          list.sort((a, b) => a.name.localeCompare(b.name));
          setMembers(list);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel.track({ name: myName });
          }
        });
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [user, kind]);

  return (
    <div className="rounded-2xl p-4 border border-white/10 bg-black/20 backdrop-blur">
      <div className="flex items-center gap-2">
        <Users className={`w-4 h-4 ${accent}`} />
        <h3 className={`font-display font-bold ${accent}`}>Olona ao amin'ny Lobby</h3>
        <span className="ml-auto flex items-center gap-1.5 text-sm font-extrabold tabular-nums text-emerald-300">
          <span className="relative flex w-2.5 h-2.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-70" />
          </span>
          {members.length + botOnline} en ligne
        </span>
      </div>
    </div>
  );
}
