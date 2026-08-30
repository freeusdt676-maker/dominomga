import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy } from "lucide-react";
import { toast } from "sonner";

const copy = async (txt: string) => {
  try {
    await navigator.clipboard.writeText(txt);
    toast.success("Voakopia ✓");
  } catch {
    toast.error("Tsy afaka nikopia");
  }
};

const OPS = [
  { label: "MVOLA", phone: "034 50 230 06", name: "Jean Rolland" },
  { label: "AIRTEL MONEY", phone: "033 64 704 12", name: "JeanRolland Ratovoheriniaina" },
  { label: "ORANGE MONEY", phone: "037 36 662 05", name: "Jean" },
];

export default function DepositTutorial({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const nav = useNavigate();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto border-2 border-[hsl(var(--gold-1)/0.5)] bg-[hsl(150_45%_7%)]">
        <DialogHeader>
          <DialogTitle className="font-serif-luxe gold-luxe-text text-xl leading-snug">
            💰 TUTORIEL — FANAOVANA DÉPÔT
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm text-foreground/90 leading-relaxed">
          <div>
            <p className="font-bold gold-luxe-text mb-2">
              1️⃣ Safidio ny OPÉRATEUR mety aminao, dia alefaso transfert amin’ireo numéro ireo aloha ny vola tianao hatao dépôt.
            </p>
            <div className="space-y-2">
              {OPS.map((op) => (
                <div key={op.label} className="rounded-xl border border-[hsl(var(--gold-1)/0.3)] bg-black/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold">📱 {op.label} — <span className="font-mono gold-luxe-text">{op.phone}</span></p>
                    <button
                      onClick={() => copy(op.phone.replace(/\s/g, ""))}
                      className="p-1.5 rounded-lg border border-[hsl(var(--gold-1)/0.4)] text-[hsl(var(--gold-1))] hover:bg-[hsl(var(--gold-1)/0.1)]"
                      aria-label={`Copier numéro ${op.label}`}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">👤 {op.name}</p>
                </div>
              ))}
            </div>
          </div>

          <p>
            2️⃣ Ataovy <b>Copie</b> ny référence de transaction nomen’ilay opérateur. <b className="text-red-400">Tandremo diso!</b>
          </p>

          <p>💬 Rehefa lasa ny vola dia fenoy eo ambany :</p>
          <ul className="space-y-1 pl-2">
            <li>💵 <b>Montant</b> = ilay vola nalefanao</li>
            <li>🔑 <b>Référence</b> = référence de transaction nomen’ny MVOLA / AIRTEL MONEY / ORANGE MONEY</li>
          </ul>
          <p>Vita izay dia kitiho ny hoe <b>"Mandefa demmande"</b>.</p>
        </div>

        <button
          onClick={() => { onOpenChange(false); nav("/wallet?tab=deposit"); }}
          className="btn-luxe w-full mt-2 text-sm font-black tracking-wide"
        >
          ✅ MAZAVA TOMPOKO
        </button>
      </DialogContent>
    </Dialog>
  );
}
