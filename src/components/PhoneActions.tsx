import { useState } from "react";
import { Phone, MessageSquare, MessageCircle, Copy, X, Search } from "lucide-react";
import { toast } from "sonner";

/**
 * Bokotra tel: mikitika dia mipoitra menu Appeler / SMS / WhatsApp / Copy.
 */
export default function PhoneActions({ phone, label }: { phone?: string | null; label?: string }) {
  const [open, setOpen] = useState(false);
  if (!phone) return <span className="text-muted-foreground">—</span>;
  const clean = String(phone).replace(/\s+/g, "");
  const intl = clean.startsWith("+") ? clean : (clean.startsWith("0") ? "+261" + clean.slice(1) : clean);
  const wa = intl.replace(/[^\d]/g, "");
  const fbQueries = [clean, intl, wa, "0" + wa.slice(-9)];
  const openFbSearch = () => {
    fbQueries.forEach((q, i) => {
      const url = `https://www.facebook.com/search/top/?q=${encodeURIComponent(q)}`;
      // Sokafana tab vaovao samihafa ho an'ny format tsirairay
      setTimeout(() => window.open(url, "_blank", "noopener,noreferrer"), i * 150);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary font-semibold underline-offset-2 hover:underline"
        title="Appeler / SMS / WhatsApp"
      >
        <Phone className="w-3.5 h-3.5" />
        <span>{label ?? phone}</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/60" onClick={() => setOpen(false)}>
          <div className="w-full sm:w-96 bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl p-4 shadow-2xl space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="font-bold">{phone}</div>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-black/10"><X className="w-4 h-4" /></button>
            </div>
            <a href={`tel:${clean}`} className="flex items-center gap-3 px-3 py-3 rounded-xl bg-green-500 text-white font-semibold shadow hover:brightness-110">
              <Phone className="w-5 h-5" /> Appeler
            </a>
            <a href={`sms:${clean}`} className="flex items-center gap-3 px-3 py-3 rounded-xl bg-blue-500 text-white font-semibold shadow hover:brightness-110">
              <MessageSquare className="w-5 h-5" /> Envoyer SMS
            </a>
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-3 py-3 rounded-xl bg-emerald-600 text-white font-semibold shadow hover:brightness-110">
              <MessageCircle className="w-5 h-5" /> WhatsApp
            </a>
            <button
              onClick={() => { openFbSearch(); setOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-[#1877F2] text-white font-semibold shadow hover:brightness-110"
              title="Hitady amin'ny Facebook amin'ny alalan'ny numéro"
            >
              <Search className="w-5 h-5" /> Hitady amin'ny Facebook
            </button>
            <button
              onClick={() => { navigator.clipboard?.writeText(phone).then(() => toast.success("Voa-copy")); setOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-slate-200 dark:bg-slate-700 font-semibold"
            >
              <Copy className="w-5 h-5" /> Copier
            </button>
            <p className="text-[10px] text-muted-foreground text-center pt-1">
              Facebook tsy manome API ny hitadiavana olona amin'ny numéro (nofoanana 2019). Ny bokotra dia manokatra fikarohana amin'ny Facebook — miankina amin'izay napetraky ny olona ao amin'ny profil-ny ny valiny.
            </p>
          </div>
        </div>
      )}
    </>
  );
}