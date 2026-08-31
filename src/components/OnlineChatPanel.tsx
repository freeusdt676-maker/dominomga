import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeOnlineMembers, type PresenceMember } from "@/hooks/useGlobalPresence";
import { Send, Trash2, Smile, Crown } from "lucide-react";
import { toast } from "sonner";
import LiveDominoRooms from "@/components/LiveDominoRooms";
import chatNotifySound from "@/assets/chat-notify.mp3.asset.json";

// Feo notification chat — 50% volume, only when the panel is visible on screen
let chatAudio: HTMLAudioElement | null = null;
let chatVisible = false;
function playChatSound() {
  if (!chatVisible) return;
  try {
    if (!chatAudio) {
      chatAudio = new Audio(chatNotifySound.url);
      chatAudio.preload = "auto";
    }
    chatAudio.volume = 0.5;
    chatAudio.currentTime = 0;
    void chatAudio.play().catch(() => {});
  } catch {}
}




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
  const panelRef = useRef<HTMLDivElement>(null);
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());

  useEffect(() => subscribeOnlineMembers(setMembers), []);

  // Fantaro ny admin mba ho mena be ny hafany — ho an'ny mpilalao REHETRA.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("lobby_admin_sender_ids" as any);
      if (Array.isArray(data)) setAdminIds(new Set((data as any[]).map((x: any) => String(x?.lobby_admin_sender_ids ?? x))));
    })();
  }, [messages.length]);


  // Only play notification sound while the chat panel is visible in the viewport
  useEffect(() => {
    if (!panelRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          chatVisible = entry.isIntersecting;
        });
      },
      { threshold: 0.25 }
    );
    obs.observe(panelRef.current);
    return () => obs.disconnect();
  }, []);

  const load = async () => {
    const { data } = await supabase
      .from("lobby_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(60);
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
    let t: any = null;
    const reload = () => { if (t) clearTimeout(t); t = setTimeout(load, 250); };
    const ch = supabase
      .channel("home-lobby-chat")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "lobby_messages" }, (payload: any) => {
        if (payload?.new?.sender_id !== user.id) playChatSound();
        reload();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "lobby_messages" }, reload)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "lobby_messages" }, reload)
      .subscribe();
    return () => { supabase.removeChannel(ch); if (t) clearTimeout(t); };
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
    <div
      ref={panelRef}
      className="relative overflow-hidden rounded-3xl bg-black/70 backdrop-blur-2xl border border-[hsl(var(--gold-1)/0.28)] shadow-[0_30px_90px_-24px_rgba(0,0,0,0.95),0_0_0_1px_hsl(var(--gold-1)/0.08),inset_0_1px_0_rgba(255,255,255,0.06)]"
    >
      {/* Ambient gold top glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(120%_70%_at_50%_0%,hsl(var(--gold-1)/0.22),transparent_65%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[hsl(var(--gold-1)/0.7)] to-transparent" />


      {/* ---- 1. STATUT EN LIGNE ---- */}
      <div className="relative p-3.5 border-b-2 border-emerald-400/25 bg-black/55">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow flex items-center gap-2 tracking-[0.2em] uppercase">
            <span className="relative inline-flex">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-70" />
            </span>
            <span className="gold-luxe-text">💬 Club</span>
            <span className="opacity-60 text-[10px] tracking-widest">Domino MGA</span>
          </p>
          <span className="flex items-center gap-1.5 text-[11px] font-extrabold tabular-nums gold-luxe-text">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            {members.length} en ligne
          </span>
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <span className="relative flex w-2.5 h-2.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-70" />
          </span>
          <span className="text-[12px] font-extrabold tabular-nums text-emerald-200">
            {members.length} en ligne
          </span>
        </div>

      </div>

      {/* ---- 2. SALLES VONONA ---- */}
      <div className="border-y-2 border-red-500/25 bg-black/40">
        <LiveDominoRooms />
      </div>

      {/* ---- 3. RESAKA ---- */}
      <div className="px-3.5 pt-2.5 pb-1.5 bg-black/35 border-b border-[hsl(var(--gold-1)/0.14)]">
        <p className="eyebrow tracking-[0.2em] uppercase gold-luxe-text text-[10px]">💬 Resaka — Tchat</p>
      </div>
      <div className="relative h-[26rem] overflow-y-auto p-3.5 space-y-2 bg-[radial-gradient(130%_90%_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]">
        {messages.length === 0 && (
          <p className="text-center text-[12px] text-muted-foreground/80 py-14">✍️ Manombohy resaka…</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === user?.id;
          const name = mine ? "Izaho" : names[m.sender_id] ?? "Mpilalao";
          const isAdminSender = adminIds.has(m.sender_id);
          return (
            <div
              key={m.id}
              className={`group flex items-baseline gap-2 px-2.5 py-1.5 rounded-xl transition border border-transparent hover:bg-white/[0.05] ${
                mine && !isAdminSender ? "bg-[hsl(var(--gold-1)/0.06)]" : "bg-white/[0.02]"
              }`}
            >
              <span
                className={`font-display text-[13px] font-bold shrink-0 tracking-wide flex items-center gap-1 ${
                  isAdminSender ? "text-red-400 font-extrabold" : mine ? "gold-luxe-text" : "text-emerald-300"
                }`}
              >
                {isAdminSender && <Crown className="w-3 h-3 text-red-400" />}
                {name}:
              </span>
              <span className={`text-[14px] leading-relaxed break-words min-w-0 flex-1 ${
                isAdminSender ? "text-red-400 font-extrabold" : "text-foreground/95"
              }`}>
                {m.content}
              </span>
              <span className="text-[9px] opacity-40 tabular-nums shrink-0">
                {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </span>
              {(mine || isAdmin) && (
                <button
                  onClick={() => remove(m)}
                  aria-label="Mamafa hafatra"
                  className="shrink-0 w-4 h-4 rounded-full bg-destructive/80 text-destructive-foreground opacity-0 group-hover:opacity-100 flex items-center justify-center transition"
                >
                  <Trash2 className="w-2 h-2" />
                </button>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>


      {/* Emoji picker */}
      {showEmoji && (
        <div className="px-2.5 pt-2.5 border-t border-[hsl(var(--gold-1)/0.12)] bg-black/55">
          <div className="grid grid-cols-10 gap-1 max-h-32 overflow-y-auto">
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

      {/* Composer — luxe */}
      <div className="relative p-2.5 border-t border-[hsl(var(--gold-1)/0.14)] flex items-center gap-2 bg-gradient-to-b from-black/50 to-black/70">
        <button
          onClick={() => setShowEmoji((v) => !v)}
          aria-label="Emoji"
          className={`w-10 h-10 shrink-0 rounded-full border flex items-center justify-center transition ${
            showEmoji
              ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-300"
              : "bg-white/[0.05] border-white/10 text-muted-foreground hover:bg-white/[0.08]"
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
          className="flex-1 bg-black/55 border border-white/10 rounded-full px-4 py-2.5 text-[13px] outline-none focus:border-[hsl(var(--gold-1)/0.5)] focus:ring-2 focus:ring-[hsl(var(--gold-1)/0.12)] placeholder:text-muted-foreground/60 transition"
        />
        <button
          onClick={send}
          aria-label="Alefa"
          className="w-10 h-10 shrink-0 rounded-full bg-[hsl(var(--gold-1)/0.25)] border border-[hsl(var(--gold-1)/0.5)] hover:bg-[hsl(var(--gold-1)/0.35)] flex items-center justify-center active:scale-95 transition shadow-[0_0_18px_-4px_hsl(var(--gold-1)/0.5)]"
        >
          <Send className="w-4 h-4 gold-luxe-text" />
        </button>
      </div>
    </div>
  );
}

