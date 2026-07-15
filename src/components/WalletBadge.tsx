import { useEffect, useState } from "react";
import { Wallet as WalletIcon } from "lucide-react";
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
    <Link
      to="/wallet"
      className="fixed top-2 right-2 z-[80] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-black text-xs shadow-lg backdrop-blur border border-yellow-300/60"
      style={{ background: "linear-gradient(135deg,#065f46,#047857)", color: "#fef3c7" }}
      title="Ny soldeko"
    >
      <WalletIcon className="w-3.5 h-3.5" />
      <span className="tabular-nums">{fmtAr(balance)}</span>
    </Link>
  );
}