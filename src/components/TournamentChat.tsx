import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Trash2, MessagesSquare } from "lucide-react";
import { toast } from "sonner";
import { sfx } from "@/lib/sfx";

const TAG = "[TOURN] ";

export default function TournamentChat() {
  const { user, isAdmin } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("lobby_messages")
      .select("*")
      .like("content", `${TAG}%`)
      .order("created_at", { ascending: true })
      .limit(200);
    const list = data ?? [];
    setMessages(list);
    const ids = Array.from(new Set(list.map((m: any) => m.sender_id)));
    if (ids.length) {
      const { data: p } = await supabase
        .from("profiles").select("user_id,mvola_name").in("user_id", ids);
      const map: Record<string, string> = {};
      (p ?? []).forEach((pr: any) => { map[pr.user_id] = pr.mvola_name; });
      setProfiles(map);
    }
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  useEffect(() => {
    if (!user) return;
    load();
    const ch = supabase.channel("tourn-chat")
      .on("postgres_changes", { event: "*", schema: "public", table: "lobby_messages" }, (payload: any) => {
        const c = payload.new?.content ?? payload.old?.content ?? "";
        if (!String(c).startsWith(TAG)) return;
        if (payload.eventType === "INSERT" && payload.new?.sender_id !== user.id) {
          if (lastIdRef.current !== payload.new.id) {
            sfx.notify();
            try { (navigator as any).vibrate?.(60); } catch {}
            lastIdRef.current = payload.new.id;
          }
        }
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const send = async () => {
    const t = text.trim();
    if (!t || !user) return;
    const { error } = await supabase.from("lobby_messages")
      .insert({ sender_id: user.id, content: TAG + t.slice(0, 500) });
    if (error) return toast.error(error.message);
    setText("");
  };

  const remove = async (m: any) => {
    const mine = m.sender_id === user?.id;
    if (!mine && !isAdmin) return;
    if (!confirm("Hamafa ity hafatra ity?")) return;
    if (isAdmin && !mine) {
      const { error } = await supabase.rpc("admin_delete_lobby_message" as any, { _msg_id: m.id, _admin_id: user!.id });
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("lobby_messages").delete().eq("id", m.id);
      if (error) return toast.error(error.message);
    }
    load();
  };

  return (
    <div className="luxe-card p-3 flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <MessagesSquare className="w-4 h-4 text-[hsl(var(--gold-1))]" />
        <p className="font-serif-luxe text-sm gold-luxe-text">Chat — Tournoi</p>
        <span className="ml-auto text-[10px] text-muted-foreground">{messages.length} hafatra</span>
      </div>
      <div className="h-72 overflow-y-auto space-y-2 hairline rounded-lg p-2 bg-black/20">
        {messages.length === 0 && (
          <p className="text-center text-muted-foreground text-xs py-6 italic">
            Mbola tsy misy hafatra. Manombohy resaka momba ny tournoi!
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === user?.id;
          const body = String(m.content ?? "").replace(/^\[TOURN\]\s*/, "");
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} group`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-xs relative ${mine ? "bg-[hsl(var(--gold-1)/0.85)] text-black" : "bg-emerald-900/40 border border-emerald-700/40 text-foreground"}`}>
                {!mine && <p className="text-[10px] font-bold opacity-80 mb-0.5">{profiles[m.sender_id] ?? "Mpilalao"}</p>}
                <p className="whitespace-pre-wrap break-words">{body}</p>
                <p className="text-[9px] opacity-70 mt-0.5">{new Date(m.created_at).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</p>
                {(mine || isAdmin) && (
                  <button onClick={() => remove(m)} aria-label="Suprimer"
                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 flex items-center justify-center">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2 mt-2">
        <Input value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Hafatra momba ny tournoi..." maxLength={500} />
        <Button onClick={send} className="btn-luxe shrink-0"><Send className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}