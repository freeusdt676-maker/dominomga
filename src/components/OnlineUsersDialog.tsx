import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Wifi, Phone } from "lucide-react";
import { Input } from "@/components/ui/input";

type Member = { user_id: string; name: string; phone: string };

export default function OnlineUsersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    // Subscribe as observer (no track) — un user_id mitokana ho an'ny admin
    const observerKey = `admin-observer-${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase.channel("app-online-users", {
      config: { presence: { key: observerKey } },
    });
    const sync = () => {
      const state = channel.presenceState() as Record<
        string,
        Array<{ name?: string; phone?: string }>
      >;
      const list: Member[] = Object.entries(state)
        .filter(([uid]) => uid !== observerKey)
        .map(([uid, metas]) => ({
          user_id: uid,
          name: (metas?.[0]?.name as string) || "Mpilalao",
          phone: (metas?.[0]?.phone as string) || "",
        }));
      list.sort((a, b) => a.name.localeCompare(b.name));
      setMembers(list);
    };
    channel
      .on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [open]);

  const filtered = members.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.phone.includes(q);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-flex w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <Wifi className="w-4 h-4 text-emerald-500" />
            En ligne ({members.length})
          </DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Search anarana / numéro..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="max-h-[60vh] overflow-y-auto space-y-1.5 pr-1">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              Tsy misy olona ao anaty app
            </p>
          ) : (
            filtered.map((m) => (
              <div
                key={m.user_id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5"
              >
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">{m.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {m.phone || "—"}
                  </p>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-500/10 px-2 py-1 rounded-full">
                  En ligne
                </span>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}