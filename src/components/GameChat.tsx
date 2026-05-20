import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MessageCircle, Send, X } from "lucide-react";

type Msg = { id: string; sender_id: string; content: string; created_at: string };
type Floater = { id: string; name: string; content: string };

const QUICKS = ["Salama", "Tsara!", "Mialà tsiny", "Misaotra", "Andraso kely", "Mazoto e!"];

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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="w-full sm:max-w-md h-[70vh] sm:h-[60vh] bg-[#0d3b22] border-2 border-[#d4a52c]/60 rounded-t-2xl sm:rounded-2xl flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#d4a52c]/40">
              <h3 className="font-bold text-[#ffe27a]">Chap an'ny lalao</h3>
              <button onClick={() => setOpen(false)} className="text-[#ffe27a]/70 hover:text-[#ffe27a]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
              {msgs.length === 0 && (
                <p className="text-center text-xs text-[#ffe27a]/60 py-8">Tsy mbola misy hafatra</p>
              )}
              {msgs.map((m) => {
                const mine = m.sender_id === user?.id;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[75%] px-3 py-1.5 rounded-2xl text-sm ${
                        mine ? "bg-[#d4a52c] text-[#0a2818]" : "bg-[#0a2818]/70 text-[#ffe27a] border border-[#d4a52c]/30"
                      }`}
                    >
                      {!mine && (
                        <p className="text-[10px] font-bold opacity-70 mb-0.5">{names[m.sender_id] ?? "Mpilalao"}</p>
                      )}
                      <p className="break-words">{m.content}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-3 py-2 border-t border-[#d4a52c]/40 flex flex-wrap gap-1">
              {QUICKS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  disabled={sending}
                  className="px-2 py-1 text-[11px] rounded-full bg-[#0a2818]/70 border border-[#d4a52c]/40 text-[#ffe27a] hover:bg-[#d4a52c]/20"
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
              className="p-3 border-t border-[#d4a52c]/40 flex gap-2"
            >
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={200}
                placeholder="Hafatra..."
                className="flex-1 px-3 py-2 rounded-lg bg-[#0a2818] border border-[#d4a52c]/40 text-[#ffe27a] placeholder:text-[#ffe27a]/40 text-sm focus:outline-none focus:border-[#d4a52c]"
              />
              <button
                type="submit"
                disabled={sending || !text.trim()}
                className="px-3 py-2 rounded-lg bg-[#d4a52c] text-[#0a2818] font-bold disabled:opacity-50"
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
