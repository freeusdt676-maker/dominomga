import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeOnlineMembers, type PresenceMember } from "@/hooks/useGlobalPresence";
import { Send, Trash2, Smile } from "lucide-react";
import { toast } from "sonner";

const EMOJIS = [
  "😀","😁","😂","🤣","😊","😍","😘","😎","🤩","🥳",
  "😜","🤪","😏","😴","🤔","🤫","🙄","😤","😭","😱",
  "😡","🤬","🤯","🥶","🤒","🤝","👏","🙌","👍","👎",
  "💪","🙏","✌️","🤞","🔥","💥","⚡","✨","🌟","💎",
  "💰","💸","🏆","🥇","🎯","🎲","🃏","♟️","🎰","🚀",
  "❤️","💚","💛","💜","🖤","😈","👻","🤖","👑","🇲🇬",
];

/**
 * Cadre iray: statut "en ligne" (isa + anarana) sy chat kely iraisana.
 * Thème sombre luxe — miavaka tsara ny anarana sy ny hafatra.
 */
export default function OnlineChatPanel() {
  const { user, isAdmin } = useAuth();
  const [members, setMembers] = useState<PresenceMember[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
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
    setShowEmoji(false);
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
    <div className="luxe-card overflow-hidden bg-black/55 backdrop-blur-xl border border-white/[0.06] shadow-[0_18px_50px_-20px_rgba(0,0,0,0.9)]">
      {/* Statut en ligne */}
      <div className="p-3 hairline-b bg-black/40">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow flex items-center gap-1.5 tracking-[0.18em]">
            <span className="relative inline-flex">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
              <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-70" />
            </span>
            💬 En ligne · Domino MGA
          </p>
          <span className="text-[11px] font-extrabold gold-luxe-text tabular-nums">👥 {members.length}</span>
        </div>
        <div className="mt-2 max-h-16 overflow-y-auto">
          {members.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">😴 Tsy misy olona en ligne</p>
          ) : (
            <ul className="flex flex-wrap gap-1">
              {members.map((m) => (
                <li
                  key={m.user_id}
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-emerald-500/[0.12] border border-emerald-400/30 text-emerald-200"
                >
                  🟢 {m.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Chat kely */}
      <div className="h-48 overflow-y-auto p-2.5 space-y-2 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(255,255,255,0.035),transparent_70%)]">
        {messages.length === 0 && (
          <p className="text-center text-[11px] text-muted-foreground py-6">✍️ Manombohy resaka…</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === user?.id;
          const name = names[m.sender_id] ?? "Mpilalao";
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} group`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 relative shadow-[0_6px_18px_-10px_rgba(0,0,0,0.9)] ${
                  mine
                    ? "bg-[hsl(var(--gold-1)/0.14)] border border-[hsl(var(--gold-1)/0.32)] rounded-br-md"
                    : "bg-white/[0.05] border border-white/10 rounded-bl-md"
                }`}
              >
                {!mine && (
                  <p className="font-display text-[11px] font-bold leading-none mb-1 text-emerald-300 tracking-wide">
                    {name}
                  </p>
                )}
                <p className="text-[13px] leading-snug whitespace-pre-wrap break-words text-foreground/95">
                  {m.content}
                </p>
                <p className="text-[9px] opacity-50 mt-1 text-right tabular-nums">
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

      {/* Emoji picker */}
      {showEmoji && (
        <div className="px-2 pt-2 hairline-t bg-black/50">
          <div className="grid grid-cols-10 gap-1 max-h-28 overflow-y-auto">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => setText((t) => (t + e).slice(0, 300))}
                className="text-lg leading-none py-1 rounded-lg hover:bg-white/10 active:scale-90 transition"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Composer */}
      <div className="p-2 hairline-t flex items-center gap-2 bg-black/45">
        <button
          onClick={() => setShowEmoji((v) => !v)}
          aria-label="Emoji"
          className={`w-9 h-9 shrink-0 rounded-full border flex items-center justify-center transition ${
            showEmoji
              ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-300"
              : "bg-white/[0.04] border-white/10 text-muted-foreground"
          }`}
        >
          <Smile className="w-4 h-4" />
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          maxLength={300}
          placeholder="Hafatra… 😊"
          className="flex-1 bg-black/45 border border-white/10 rounded-full px-3.5 py-2 text-[13px] outline-none focus:border-[hsl(var(--gold-1)/0.5)] placeholder:text-muted-foreground/60"
        />
        <button
          onClick={send}
          aria-label="Alefa"
          className="w-9 h-9 shrink-0 rounded-full bg-[hsl(var(--gold-1)/0.22)] border border-[hsl(var(--gold-1)/0.45)] flex items-center justify-center active:scale-95 transition"
        >
          <Send className="w-4 h-4 gold-luxe-text" />
        </button>
      </div>
    </div>
  );
}
