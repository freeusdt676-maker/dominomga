import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useGlobalPresence } from "@/hooks/useGlobalPresence";
import { ensurePushSubscription, unsubscribePush } from "@/lib/pushNotifications";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({ user: null, session: null, loading: true, isAdmin: false, signOut: async () => {} });

const getAuthStorageKey = () => {
  try {
    const ref = new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split(".")[0];
    return ref ? `sb-${ref}-auth-token` : null;
  } catch {
    return null;
  }
};

const readStoredSession = (): Session | null => {
  try {
    const key = getAuthStorageKey();
    if (!key) return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const session = parsed?.currentSession ?? parsed;
    if (!session?.access_token || !session?.user) return null;
    return session as Session;
  } catch {
    return null;
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const initialSession = readStoredSession();
  const [session, setSession] = useState<Session | null>(initialSession);
  const [user, setUser] = useState<User | null>(initialSession?.user ?? null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const applySession = (s: Session | null) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
      if (s?.user) {
        setTimeout(async () => {
          const { data } = await supabase.from("user_roles").select("role").eq("user_id", s.user.id).eq("role", "admin").maybeSingle();
          const admin = !!data;
          setIsAdmin(admin);
          ensurePushSubscription({ isAdmin: admin });
        }, 0);
      } else {
        setIsAdmin(false);
        unsubscribePush();
      }
    };

    const onManualSession = (event: Event) => {
      const manualSession = (event as CustomEvent<{ session?: Session }>).detail?.session;
      if (manualSession?.access_token && manualSession.user) applySession(manualSession);
    };
    window.addEventListener("dmga-auth-session", onManualSession as EventListener);

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      applySession(s);
    });
    supabase.auth.getSession().then(({ data }) => {
      applySession(data.session);
    }).catch(() => setLoading(false));

    // Safety net: raha misy WebView (Facebook/Messenger in-app) mahatonga
    // getSession() tsy mamaly, ajanona ny spinner aorian'ny 4s mba tsy hihodina mandrakizay.
    const failsafe = setTimeout(() => {
      const stored = readStoredSession();
      if (stored) {
        setSession(stored);
        setUser(stored.user);
      }
      setLoading(false);
    }, 4000);

    // Auto-lock: rehefa miala ny app ela be (30 min), vao manala
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        sessionStorage.setItem("dmga_lastHide", String(Date.now()));
      } else {
        const t = Number(sessionStorage.getItem("dmga_lastHide") || 0);
        if (t && Date.now() - t > 30 * 60_000) {
          supabase.auth.signOut();
        }
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearTimeout(failsafe);
      sub.subscription.unsubscribe();
      window.removeEventListener("dmga-auth-session", onManualSession as EventListener);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); };

  // Track presence globally — only while the app is open & visible.
  useGlobalPresence(user);

  return <Ctx.Provider value={{ user, session, loading, isAdmin, signOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
