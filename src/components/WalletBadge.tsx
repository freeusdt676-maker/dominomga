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
      className="fixed z-[80] inline-flex items-center gap-1 rounded-full shadow-xl backdrop-blur-md border border-[#ffe27a]/70 pl-1 pr-0.5 py-0.5 transition-transform hover:scale-[1.03] active:scale-95"
      style={{
        top: "calc(env(safe-area-inset-top, 0px) + 64px)",
        right: "calc(env(safe-area-inset-right, 0px) + 8px)",
        background: "linear-gradient(135deg,#0b3a22 0%,#0a5c33 55%,#065f46 100%)",
        boxShadow: "0 8px 20px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.15)",
        color: "#ffe27a",
      }}
    >
      <Link
        to="/wallet"
        className="inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full font-black text-[11px] leading-none"
        title="Ny soldeko"
      >
        <span
          className="inline-flex w-5 h-5 rounded-full items-center justify-center shadow-inner"
          style={{ background: "linear-gradient(180deg,#ffe27a,#d4a52c 60%,#8a5a0a)" }}
        >
          <WalletIcon className="w-3 h-3 text-[#2a1a08]" />
        </span>
        <span className="tabular-nums drop-shadow">{hidden ? "•••••" : fmtAr(balance)}</span>
      </Link>
      <button
        onClick={toggle}
        aria-label={hidden ? "Asehoy ny solde" : "Afeno ny solde"}
        className="p-1 rounded-full hover:bg-white/10 active:scale-90 transition"
      >
        {hidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
      </button>
    </div>
  );
}