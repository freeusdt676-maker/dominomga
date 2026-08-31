import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Isan'ny mpilalao virtuel "en ligne" amin'izao fotoana izao (isa fotsiny —
 * tsy misy anarana mihitsy). Ampiana amin'ny presence tena izy mba hiseho
 * miovaova ny isa "en ligne" eo amin'ny app.
 */
export function useVirtualOnlineCount(intervalMs = 30000) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      const { data } = await supabase.rpc("virtual_online_count" as any);
      if (alive && typeof data === "number") setCount(data);
    };
    load();
    const itv = setInterval(load, intervalMs);
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      clearInterval(itv);
      document.removeEventListener("visibilitychange", load);
    };
  }, [intervalMs]);

  return count;
}
