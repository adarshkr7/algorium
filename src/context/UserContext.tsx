"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export interface UserSession {
  id: string;
  handle: string;
  avatar: string;
  rating: number;
  maxRating: number;
  rank: string;
  maxRank: string;
  elo: number;
  peakElo: number;
  wins: number;
  losses: number;
  draws: number;
  currentStreak: number;
}

interface UserContextType {
  user: UserSession | null;
  /** True until the initial session check resolves. */
  loading: boolean;
  setUser: (user: UserSession | null) => void;
  /** Re-reads the session — call after a duel to pick up the new Elo. */
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/users/me", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { user: UserSession };
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      // Offline or server down — keep whatever we had rather than signing out.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    setUser(null);
    try {
      await fetch("/api/users/logout", { method: "POST" });
    } catch {
      /* the cookie is cleared server-side on the next request anyway */
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, setUser, refresh, logout }),
    [user, loading, refresh, logout],
  );

  // Children render immediately. The previous version withheld the entire app
  // until /api/users/me resolved, which flashed a blank page on every load.
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};
