"use client";

import React from "react";
import { Navbar } from "@/components/Navbar";
import { ThemeProvider } from "@/context/ThemeContext";
import { UserProvider } from "@/context/UserContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <UserProvider>
        <Navbar />
        <main
          style={{
            flex: 1,
            maxWidth: "1200px",
            width: "100%",
            margin: "0 auto",
            padding: "32px 20px 60px",
          }}
        >
          {children}
        </main>
      </UserProvider>
    </ThemeProvider>
  );
}