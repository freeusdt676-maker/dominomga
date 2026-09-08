import { useEffect, useRef, useState } from "react";

/**
 * Fiarovana capture d'écran ihany (faratampony azo atao amin'ny web):
 * - Manjavozavo (blur) ny app rehefa miala focus na miova tab/afenina (fotoana anaovan'ny olona capture)
 * - Sakana ny PrintScreen (+ manadio clipboard) sy ny raccourcis capture (Win+Shift+S, Cmd+Shift+3/4/5)
 * - NAVELA ny fanontana (imprimer) sy ny fandikana (copier) sy ny right-click
 */
export default function ScreenShield({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const printingRef = useRef(false);

  useEffect(() => {
    // Aza manjavona rehefa manonta (imprimer) ny mpampiasa
    const onBeforePrint = () => {
      printingRef.current = true;
      setHidden(false);
    };
    const onAfterPrint = () => {
      printingRef.current = false;
    };

    const onVis = () => {
      if (printingRef.current) return;
      setHidden(document.hidden);
    };
    const onBlur = () => {
      if (printingRef.current) return;
      setHidden(true);
    };
    const onFocus = () => setHidden(false);

    const clearClipboard = () => {
      try {
        navigator.clipboard?.writeText(" ").catch(() => {});
      } catch {}
    };

    const shieldBriefly = () => {
      setHidden(true);
      window.setTimeout(() => {
        if (document.hasFocus() && !document.hidden) setHidden(false);
      }, 1500);
    };

    const onKey = (e: KeyboardEvent) => {
      const k = e.key?.toLowerCase();
      // PrintScreen
      if (e.key === "PrintScreen" || k === "printscreen") {
        clearClipboard();
        shieldBriefly();
        e.preventDefault();
        return;
      }
      // Windows: Win+Shift+S (Snipping Tool)
      if (e.shiftKey && (e.metaKey || e.getModifierState?.("Meta")) && k === "s") {
        clearClipboard();
        shieldBriefly();
        e.preventDefault();
        return;
      }
      // macOS: Cmd+Shift+3 / 4 / 5
      if (e.metaKey && e.shiftKey && ["3", "4", "5"].includes(k)) {
        clearClipboard();
        shieldBriefly();
        e.preventDefault();
      }
    };

    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);

    return () => {
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
    };
  }, []);

  return (
    <div className="relative">
      <div
        className="transition-[filter] duration-100 print:!blur-0"
        style={{
          filter: hidden ? "blur(28px) brightness(0.25)" : "none",
          pointerEvents: hidden ? "none" : undefined,
        }}
      >
        {children}
      </div>
      {hidden && <div className="fixed inset-0 z-[9999] bg-background print:hidden" aria-hidden />}
    </div>
  );
}
