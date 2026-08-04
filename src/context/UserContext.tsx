"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export interface UserSession {
  id: string;
  handle: string;
  avatar: string;
  rating: number;
  maxRating: number;
  rank: string;
  maxRank: string;
}

interface UserContextType {
  user: UserSession | null;
  setUser: (user: UserSession | null) => void;
  logout: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUserState] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch("/api/users/me");
        if (res.ok) {
          const data = await res.json();
          setUserState(data.user);
        }
      } catch (e) {
        console.error("Failed to fetch session", e);
      } finally {
        setLoading(false);
      }
    };
    fetchSession();
  }, []);

  const setUser = (u: UserSession | null) => {
    setUserState(u);
  };

  const logout = async () => {
    setUserState(null);
    try {
      await fetch("/api/users/logout", { method: "POST" });
    } catch (e) {
      console.error("Failed to logout", e);
    }
  };

  return (
    <UserContext.Provider value={{ user, setUser, logout }}>
      {!loading && children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};
