import type { PublicUser } from "@tcu/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { api } from "./api";
import { getToken, setToken } from "./session";

interface AuthState {
  user: PublicUser | null;
  loading: boolean;
  signIn: (token: string, user: PublicUser) => void;
  signOut: () => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      if (!getToken()) return null;
      try {
        return await api.me();
      } catch {
        setToken(null);
        return null;
      }
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const signIn = useCallback(
    (token: string, user: PublicUser) => {
      setToken(token);
      qc.setQueryData(["me"], user);
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "me" });
    },
    [qc],
  );
  const signOut = useCallback(() => {
    setToken(null);
    qc.setQueryData(["me"], null);
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
  }, [qc]);

  const value = useMemo(
    () => ({ user: me.data ?? null, loading: me.isLoading, signIn, signOut }),
    [me.data, me.isLoading, signIn, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth fuera de AuthProvider");
  return v;
}
