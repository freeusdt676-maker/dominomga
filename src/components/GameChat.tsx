import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MessageCircle, Send, X, Smile } from "lucide-react";

type Msg = { id: string; sender_id: string; content: string; created_at: string };
type Floater = { id: string; name: string; content: string };

const QUICKS = ["👋 Salama", "🔥 Tsara!", "🙏 Mialà tsiny", "❤️ Misaotra", "⏳ Andraso kely", "💪 Mazoto e!", "😂", "👍"];

function initials(name: string) {
  return name.split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}
function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}
function colorFor(id: string) {
  const palette = ["#f97316", "#22d3ee", "#a78bfa", "#f43f5e", "#34d399", "#fbbf24", "#60a5fa"];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export function GameChat({
  gameId,
  names,
  triggerClassName,
}: {
  gameId: string;
  names: Record<string, string>;
  triggerClassName?: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [unread, setUnread] = useState(0);
  const [sending, setSending] = useState(false);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("id, sender_id, content, created_at")
        .eq("game_id", gameId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (!cancelled && data) setMsgs(data as Msg[]);
    })();
    const ch = supabase
      .channel(`game-chat-${gameId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `game_id=eq.${gameId}` },
        (p: any) => {
          const m = p.new as Msg;
          setMsgs((prev) => (prev.find((x) => x.id === m.id) ? prev : [...prev, m]));
          if (m.sender_id !== user?.id) {
            setUnread((u) => (open ? 0 : u + 1));
            if (!open) {
              const fid = `${m.id}-${Date.now()}`;
              setFloaters((cur) => [...cur, { id: fid, name: names[m.sender_id] ?? "Mpilalao", content: m.content }]);
              try { (navigator as any).vibrate?.(40); } catch {}
              setTimeout(() => {
                setFloaters((cur) => cur.filter((f) => f.id !== fid));
              }, 4200);
            }
          }
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [gameId, user?.id, open, names]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      }, 50);
    }
  }, [open, msgs.length]);

  const send = async (content: string) => {
    if (!user || !content.trim() || sending) return;
    setSending(true);
    const { error } = await supabase.from("chat_messages").insert({
      game_id: gameId,
      sender_id: user.id,
      content: content.trim().slice(0, 200),
      is_admin_broadcast: false,
    });
    setSending(false);
    if (!error) setText("");
  };

  return (
    <>
      {/* Floating incoming-message bubbles (auto-fade) */}
      {floaters.length > 0 && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 pointer-events-none max-w-[92vw] w-[340px]">
          {floaters.map((f) => (
            <button
              key={f.id}
              onClick={() => { setOpen(true); setFloaters((cur) => cur.filter((x) => x.id !== f.id)); }}
              className="pointer-events-auto text-left px-3 py-2 rounded-2xl bg-[#0d3b22]/95 border-2 border-[#d4a52c]/70 shadow-2xl backdrop-blur-md animate-in slide-in-from-top-4 fade-in duration-300"
            >
              <p className="text-[10px] font-bold text-[#ffe27a] mb-0.5 flex items-center gap-1">
                <MessageCircle className="w-3 h-3" /> {f.name}
              </p>
              <p className="text-sm text-white break-words line-clamp-3">{f.content}</p>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName ?? "fab-circle absolute right-2 top-[calc(50%+56px)] -translate-y-1/2 z-20"}
        title="Chap"
      >
        <MessageCircle className="w-6 h-6" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-200" onClick={() => setOpen(false)}>
          <div
            className="w-full sm:max-w-md h-[75vh] sm:h-[65vh] bg-gradient-to-b from-[#0d3b22] to-[#0a2818] border-2 border-[#d4a52c]/60 rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#d4a52c]/40 bg-[#0a2818]/60 backdrop-blur">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-[#d4a52c] text-[#0a2818] flex items-center justify-center font-black shadow-lg">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-[#ffe27a] leading-tight">Chap an'ny lalao</h3>
                  <p className="text-[10px] text-[#ffe27a]/60">En direct • {msgs.length} hafatra</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="text-[#ffe27a]/70 hover:text-[#ffe27a] p-1 rounded-full hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-[radial-gradient(circle_at_top,rgba(212,165,44,0.08),transparent_60%)]">
              {msgs.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <div className="w-16 h-16 rounded-full bg-[#d4a52c]/10 flex items-center justify-center mb-3">
                    <MessageCircle className="w-8 h-8 text-[#d4a52c]" />
                  </div>
                  <p className="text-sm text-[#ffe27a]/80 font-semibold">Tsy mbola misy hafatra</p>
                  <p className="text-xs text-[#ffe27a]/50 mt-1">Manombohia resaka amin'ny mpilalao!</p>
                </div>
              )}
              {msgs.map((m, idx) => {
                const mine = m.sender_id === user?.id;
                const prev = msgs[idx - 1];
                const grouped = prev && prev.sender_id === m.sender_id && (new Date(m.created_at).getTime() - new Date(prev.created_at).getTime()) < 60000;
                const name = names[m.sender_id] ?? "Mpilalao";
                return (
                  <div key={m.id} className={`flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"} ${grouped ? "mt-0.5" : "mt-2"}`}>
                    {!mine && (
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0 ${grouped ? "invisible" : ""}`} style={{ background: colorFor(m.sender_id) }}>
                        {initials(name)}
                      </div>
                    )}
                    <div className={`max-w-[75%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                      {!mine && !grouped && (
                        <p className="text-[10px] font-bold text-[#ffe27a]/70 mb-0.5 px-2">{name}</p>
                      )}
                      <div
                        className={`px-3 py-2 text-sm shadow-md break-words ${
                          mine
                            ? "bg-gradient-to-br from-[#e8b93a] to-[#c99424] text-[#0a2818] rounded-2xl rounded-br-sm"
                            : "bg-[#0a2818]/80 text-[#ffe27a] border border-[#d4a52c]/30 rounded-2xl rounded-bl-sm"
                        }`}
                      >
                        {m.content}
                      </div>
                      <span className="text-[9px] text-[#ffe27a]/40 mt-0.5 px-1">{fmtTime(m.created_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-3 py-2 border-t border-[#d4a52c]/40 flex gap-1.5 overflow-x-auto scrollbar-hide">
              {QUICKS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  disabled={sending}
                  className="flex-shrink-0 px-3 py-1.5 text-xs rounded-full bg-[#0a2818]/70 border border-[#d4a52c]/40 text-[#ffe27a] hover:bg-[#d4a52c]/20 active:scale-95 transition-all"
                >
                  {q}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(text);
              }}
              className="p-3 border-t border-[#d4a52c]/40 flex gap-2 bg-[#0a2818]/60"
            >
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={200}
                placeholder="Hafatra..."
                className="flex-1 px-4 py-2.5 rounded-full bg-[#0a2818] border border-[#d4a52c]/40 text-[#ffe27a] placeholder:text-[#ffe27a]/40 text-sm focus:outline-none focus:border-[#d4a52c] focus:ring-2 focus:ring-[#d4a52c]/30"
              />
              <button
                type="submit"
                disabled={sending || !text.trim()}
                className="w-11 h-11 flex items-center justify-center rounded-full bg-gradient-to-br from-[#e8b93a] to-[#c99424] text-[#0a2818] font-bold disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-lg transition-all"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
