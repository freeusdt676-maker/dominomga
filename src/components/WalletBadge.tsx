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
  const [revealed, setRevealed] = useState<boolean>(false);

  // Auto-hide 4s aorian'ny fanehoana
  useEffect(() => {
    if (!revealed) return;
    const t = window.setTimeout(() => setRevealed(false), 4000);
    return () => window.clearTimeout(t);
  }, [revealed]);

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRevealed((r) => !r);
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
      className="fixed z-[80] flex items-center gap-1"
      style={{
        top: "calc(env(safe-area-inset-top, 0px) + 64px)",
        right: "calc(env(safe-area-inset-right, 0px) + 8px)",
      }}
    >
      {/* Bokotra maso boribory kely — mipoitra ny solde raha kitihina */}
      <button
        onClick={toggle}
        aria-label={revealed ? "Afeno ny solde" : "Asehoy ny solde"}
        className="w-8 h-8 rounded-full flex items-center justify-center border border-[#ffe27a]/60 shadow-lg active:scale-90 transition"
        style={{
          background: "linear-gradient(135deg,#0b3a22 0%,#0a5c33 55%,#065f46 100%)",
          color: "#ffe27a",
          boxShadow: "0 4px 10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.15)",
        }}
      >
        {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>

      {revealed && (
        <Link
          to="/wallet"
          className="inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full font-black text-[11px] leading-none border border-[#ffe27a]/70 shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-right-2"
          style={{
            background: "linear-gradient(135deg,#0b3a22 0%,#0a5c33 55%,#065f46 100%)",
            color: "#ffe27a",
          }}
          title="Ny soldeko"
        >
          <span
            className="inline-flex w-5 h-5 rounded-full items-center justify-center shadow-inner"
            style={{ background: "linear-gradient(180deg,#ffe27a,#d4a52c 60%,#8a5a0a)" }}
          >
            <WalletIcon className="w-3 h-3 text-[#2a1a08]" />
          </span>
          <span className="tabular-nums drop-shadow">{fmtAr(balance)}</span>
        </Link>
      )}
    </div>
  );
}