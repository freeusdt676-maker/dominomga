import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({ user: null, session: null, loading: true, isAdmin: false, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        // defer DB call
        setTimeout(async () => {
          const { data } = await supabase.from("user_roles").select("role").eq("user_id", s.user.id).eq("role", "admin").maybeSingle();
          setIsAdmin(!!data);
        }, 0);
      } else {
        setIsAdmin(false);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
      if (data.session?.user) {
        supabase.from("user_roles").select("role").eq("user_id", data.session.user.id).eq("role", "admin").maybeSingle().then(({ data: r }) => setIsAdmin(!!r));
      }
    });

    // Auto-lock: rehefa miala ny app, mihidy
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        // marquer last seen, le mot de passe sera redemandé au retour > 30s
        const t = Date.now();
        sessionStorage.setItem("dmga_lastHide", String(t));
      } else {
        const t = Number(sessionStorage.getItem("dmga_lastHide") || 0);
        if (t && Date.now() - t > 30_000) {
          supabase.auth.signOut();
        }
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); };

  return <Ctx.Provider value={{ user, session, loading, isAdmin, signOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
