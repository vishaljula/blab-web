"use client";

import { Search, Plus, Moon, Sun, Menu } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export default function Header() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <header
      className="flex items-center h-14 px-3 gap-2 bg-background border-b border-border shrink-0"
      id="main-header"
    >
      {/* Logo */}
      <div
        className="font-display text-xl font-bold tracking-tight text-foreground select-none shrink-0 px-1"
        id="header-logo"
      >
        Blab
      </div>

      {/* Search bar — grows to fill space */}
      <button
        className="flex items-center gap-2 flex-1 min-w-0 h-9 px-3 bg-muted border border-border rounded-full text-muted-foreground text-sm cursor-pointer transition-colors hover:bg-muted/70 focus-visible:outline-none"
        id="header-search-btn"
        aria-label="Search city or neighbourhood"
      >
        <Search size={14} className="shrink-0 text-muted-foreground" />
        <span className="truncate text-sm">Search city or area…</span>
      </button>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Dark mode toggle */}
        {mounted && (
          <button
            className="flex items-center justify-center w-9 h-9 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            id="theme-toggle-btn"
            aria-label="Toggle dark mode"
            onClick={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
          >
            {resolvedTheme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        )}

        {/* Post property — always shows text */}
        <button
          className="flex items-center gap-1.5 h-9 pl-2.5 pr-3.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold shrink-0 hover:opacity-90 transition-opacity"
          id="post-property-btn"
        >
          <Plus size={15} strokeWidth={2.5} />
          Post
        </button>

        {/* Mobile menu */}
        <button
          className="flex items-center justify-center w-9 h-9 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          id="menu-btn"
          aria-label="Menu"
        >
          <Menu size={19} />
        </button>
      </div>
    </header>
  );
}
