import { useEffect, useState } from "react";
import { Wallet as WalletIcon, Eye, EyeOff } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fmtAr } from "@/lib/constants";

/**
 * Badge flottant miseho ny solde ny mpampiasa amin'ny pejy rehetra.
 * Ny adversaire tsy mahita afa-tsy ny an'ny tenany ihany.
 */
export default function WalletBadge() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [hidden, setHidden] = useState<boolean>(() => {
    try { return localStorage.getItem("dmga_balance_hidden") === "1"; } catch { return false; }
  });

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setHidden((h) => {
      const nv = !h;
      try { localStorage.setItem("dmga_balance_hidden", nv ? "1" : "0"); } catch {}
      return nv;
    });
  };

  useEffect(() => {
    if (!user) { setBalance(null); return; }
    let cancel = false;
    (async () => {
      const { data } = await supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle();
      if (!cancel) setBalance(Number(data?.balance ?? 0));
    })();
    const ch = supabase
      .channel(`wallet-badge-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wallets", filter: `user_id=eq.${user.id}` }, (p: any) => {
        setBalance(Number(p.new?.balance ?? 0));
      })
      .subscribe();
    return () => { cancel = true; supabase.removeChannel(ch); };
  }, [user]);

  if (!user || balance == null) return null;
  return (
    <div
      className="fixed z-[80] inline-flex items-center gap-1 rounded-full shadow-lg backdrop-blur border border-yellow-300/60 pl-1 pr-0.5 py-0.5"
      style={{
        top: "calc(env(safe-area-inset-top, 0px) + 6px)",
        right: "calc(env(safe-area-inset-right, 0px) + 6px)",
        background: "linear-gradient(135deg,#065f46,#047857)",
        color: "#fef3c7",
      }}
    >
      <Link to="/wallet" className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full font-black text-xs" title="Ny soldeko">
        <WalletIcon className="w-3.5 h-3.5" />
        <span className="tabular-nums">{hidden ? "••••" : fmtAr(balance)}</span>
      </Link>
      <button
        onClick={toggle}
        aria-label={hidden ? "Asehoy ny solde" : "Afeno ny solde"}
        className="p-1.5 rounded-full hover:bg-white/10 active:scale-90 transition"
      >
        {hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}