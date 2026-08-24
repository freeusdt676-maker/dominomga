import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeOnlineMembers, type PresenceMember } from "@/hooks/useGlobalPresence";
import { Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Cadre iray: statut "en ligne" (isa + anarana) sy chat kely iraisana.
 * Voafetra ny haavony — tsy mihoatra ny fenêtre mihitsy (scroll anatiny).
 */
export default function OnlineChatPanel() {
  const { user, isAdmin } = useAuth();
  const [members, setMembers] = useState<PresenceMember[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeOnlineMembers(setMembers), []);

  const load = async () => {
    const { data } = await supabase
      .from("lobby_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(40);
    const list = (data ?? []).slice().reverse();
    setMessages(list);
    const ids = Array.from(new Set(list.map((m: any) => m.sender_id)));
    if (ids.length) {
      const { data: p } = await supabase.rpc("get_public_profiles" as any, { _ids: ids });
      const map: Record<string, string> = {};
      (p ?? []).forEach((pr: any) => { map[pr.user_id] = pr.mvola_name; });
      setNames(map);
    }
    setTimeout(() => endRef.current?.scrollIntoView({ block: "nearest" }), 50);
  };

  useEffect(() => {
    if (!user) return;
    load();
    const ch = supabase
      .channel("home-lobby-chat")
      .on("postgres_changes", { event: "*", schema: "public", table: "lobby_messages" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const send = async () => {
    const t = text.trim();
    if (!t || !user) return;
    setText("");
    const { error } = await supabase.from("lobby_messages").insert({ sender_id: user.id, content: t });
    if (error) toast.error(error.message);
  };

  const remove = async (m: any) => {
    if (!user) return;
    const mine = m.sender_id === user.id;
    if (!mine && !isAdmin) return;
    if (isAdmin && !mine) {
      const { error } = await supabase.rpc("admin_delete_lobby_message", { _msg_id: m.id, _admin_id: user.id });
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("lobby_messages").delete().eq("id", m.id);
      if (error) return toast.error(error.message);
    }
    load();
  };

  return (
    <div className="luxe-card overflow-hidden">
      {/* Statut en ligne */}
      <div className="p-3 hairline-b">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            En ligne · Domino MGA
          </p>
          <span className="text-[11px] font-bold gold-luxe-text">{members.length} olona</span>
        </div>
        <div className="mt-2 max-h-16 overflow-y-auto">
          {members.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">Tsy misy olona en ligne</p>
          ) : (
            <ul className="flex flex-wrap gap-1">
              {members.map((m) => (
                <li
                  key={m.user_id}
                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 border border-emerald-400/25"
                >
                  {m.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Chat kely */}
      <div className="h-44 overflow-y-auto p-2 space-y-1.5">
        {messages.length === 0 && (
          <p className="text-center text-[11px] text-muted-foreground py-6">Manombohy resaka…</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === user?.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} group`}>
              <div
                className={`max-w-[78%] rounded-2xl px-2.5 py-1.5 text-xs relative ${
                  mine
                    ? "bg-[hsl(var(--gold-1)/0.18)] border border-[hsl(var(--gold-1)/0.35)]"
                    : "bg-emerald-500/10 border border-emerald-400/25"
                }`}
              >
                {!mine && (
                  <p className="text-[9px] font-bold opacity-80 mb-0.5">{names[m.sender_id] ?? "Mpilalao"}</p>
                )}
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
                <p className="text-[9px] opacity-60 mt-0.5">
                  {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </p>
                {(mine || isAdmin) && (
                  <button
                    onClick={() => remove(m)}
                    aria-label="Mamafa hafatra"
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 flex items-center justify-center transition"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="p-2 hairline-t flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          maxLength={300}
          placeholder="Hafatra…"
          className="flex-1 bg-black/25 border border-white/10 rounded-full px-3 py-2 text-xs outline-none focus:border-[hsl(var(--gold-1)/0.5)]"
        />
        <button
          onClick={send}
          aria-label="Alefa"
          className="w-9 h-9 shrink-0 rounded-full bg-[hsl(var(--gold-1)/0.2)] border border-[hsl(var(--gold-1)/0.4)] flex items-center justify-center"
        >
          <Send className="w-4 h-4 gold-luxe-text" />
        </button>
      </div>
    </div>
  );
}
