import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Send, Shield } from "lucide-react";

export default function AdminChat() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [adminId, setAdminId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data: a } = await supabase.from("user_roles").select("user_id").eq("role", "admin").limit(1).maybeSingle();
      if (a) setAdminId(a.user_id);
    })();
  }, []);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase.from("chat_messages").select("*")
        .or(`and(sender_id.eq.${user.id},game_id.is.null),and(recipient_id.eq.${user.id},game_id.is.null),is_admin_broadcast.eq.true`)
        .order("created_at", { ascending: true }).limit(100);
      setMessages(data ?? []);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    };
    load();
    const ch = supabase.channel("admin-chat-" + user.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const send = async () => {
    if (!text.trim() || !user || !adminId) return;
    await supabase.from("chat_messages").insert({ sender_id: user.id, recipient_id: adminId, content: text.trim() });
    setText("");
  };

  return (
    <div className="min-h-screen felt-bg flex flex-col">
      <header className="p-4 flex items-center gap-3 border-b border-primary/20">
        <Button variant="ghost" size="icon" onClick={() => nav("/")}><ArrowLeft /></Button>
        <Shield className="text-primary" />
        <h1 className="font-display text-xl font-bold gold-text">Chat Administratif</h1>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-2 max-w-lg mx-auto w-full">
        {messages.map((m) => {
          const mine = m.sender_id === user?.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.is_admin_broadcast ? "bg-primary text-primary-foreground border border-primary" : mine ? "btn-gold" : "bg-muted"}`}>
                {m.is_admin_broadcast && <p className="text-xs font-bold mb-1">📢 Annonce admin</p>}
                {m.content}
                <p className="text-[10px] opacity-70 mt-1">{new Date(m.created_at).toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit"})}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="p-3 border-t border-primary/20 flex gap-2 max-w-lg mx-auto w-full">
        <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Hafatra..." />
        <Button onClick={send} className="btn-gold"><Send className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}
