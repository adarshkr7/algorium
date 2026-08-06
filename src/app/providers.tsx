"use client";

import React from "react";
import { Navbar } from "@/components/Navbar";
import { ThemeProvider } from "@/context/ThemeContext";
import { UserProvider } from "@/context/UserContext";
import { ToastProvider } from "@/components/ui";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <UserProvider>
        <ToastProvider>
          <Navbar />
          {/*
            Responsive gutters: 16px on phones, growing to 32px on desktop.
            `min-w-0` stops wide children (tables, code) forcing a horizontal
            scroll on the whole page.
          */}
          <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 pt-6 pb-16 sm:px-6 sm:pt-8 lg:px-8">
            {children}
          </main>
        </ToastProvider>
      </UserProvider>
    </ThemeProvider>
  );
}
