import { useEffect, useState } from "react";

/**
 * Fiarovana capture d'écran (faratampony azo atao amin'ny web):
 * - Manjavozavo (blur) ny app rehefa miala focus na miova tab/afenina
 * - Sakana ny bokotra PrintScreen + manadio ny clipboard
 * - Sakana ny right-click / context menu
 * - Sakana ny raccourcis fanontana/fanaovana capture (Ctrl+P, Ctrl+Shift+S)
 */
export default function ScreenShield({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    const onBlur = () => setHidden(true);
    const onFocus = () => setHidden(false);

    const clearClipboard = () => {
      try {
        navigator.clipboard?.writeText("").catch(() => {});
      } catch {}
    };

    const onKey = (e: KeyboardEvent) => {
      // PrintScreen: manadio clipboard alohan'ny hakan'ny OS
      if (e.key === "PrintScreen") {
        clearClipboard();
        e.preventDefault();
        return;
      }
      // Ctrl+P (imprimer), Ctrl+Shift+S / Ctrl+S, Ctrl+U
      if ((e.ctrlKey || e.metaKey) && ["p", "s", "u"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onCtx = (e: MouseEvent) => e.preventDefault();
    const onCopy = (e: ClipboardEvent) => e.preventDefault();

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    window.addEventListener("contextmenu", onCtx);
    window.addEventListener("copy", onCopy);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      window.removeEventListener("contextmenu", onCtx);
      window.removeEventListener("copy", onCopy);
    };
  }, []);

  return (
    <div className="relative">
      <div
        className="transition-[filter] duration-150"
        style={{
          filter: hidden ? "blur(24px) brightness(0.35)" : "none",
          userSelect: hidden ? "none" : undefined,
          pointerEvents: hidden ? "none" : undefined,
        }}
      >
        {children}
      </div>
      {hidden && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background">
          <div className="text-center space-y-2 px-6">
            <p className="text-2xl">🔒</p>
            <p className="text-sm font-bold text-muted-foreground">
              Domino Mga — Voarara ny fijerena
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
