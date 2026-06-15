"use client";

import { Search, Plus, Moon, Sun, Menu, MapPin, X, LogOut, User as UserIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState, useCallback, useRef } from "react";
import { useDebouncedCallback } from "use-debounce";
import { cn } from "@/lib/utils";
import { useListingsStore } from "@/store/listings";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

interface SearchResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
  eLoc: string;
  type: string;
}

export default function Header() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { data: session, status } = useSession();
  const router = useRouter();

  // Search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // User menu state
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const { setBoundary, viewportBounds, setViewportBounds, setAuthModalOpen, setProfileModalOpen } = useListingsStore();

  useEffect(() => setMounted(true), []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Debounced search
  const debouncedSearch = useDebouncedCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    try {
      // Pass current map center for location-biased results
      let lat = "17.385";
      let lng = "78.4867";
      if (viewportBounds) {
        lat = String((viewportBounds[1] + viewportBounds[3]) / 2);
        lng = String((viewportBounds[0] + viewportBounds[2]) / 2);
      }

      const res = await fetch(
        `/api/mappls/search?q=${encodeURIComponent(q)}&lat=${lat}&lng=${lng}`
      );
      if (res.ok) {
        const data = await res.json();
        setResults(data);
        setHighlightedIndex(-1);
      }
    } catch {} finally {
      setIsSearching(false);
    }
  }, 300);

  const handleInputChange = useCallback(
    (value: string) => {
      setQuery(value);
      setSearchOpen(true);
      debouncedSearch(value);
    },
    [debouncedSearch]
  );

  const handleSelectResult = useCallback(
    (result: SearchResult) => {
      setQuery(`${result.name}, ${result.address}`);
      setSearchOpen(false);
      setResults([]);

      const hasCoords =
        isFinite(result.lat) && isFinite(result.lng) &&
        (result.lat !== 0 || result.lng !== 0);

      if (hasCoords) {
        // Compute a bbox from the center + type-based radius
        const type = (result.type || "").toUpperCase();
        const radiusDeg =
          type === "STATE" ? 2 :
          type === "CITY" ? 0.15 :
          type.includes("SUB_LOCALITY") ? 0.015 :
          type.includes("LOCALITY") ? 0.03 : 0.02;

        setBoundary({
          type: "city",
          bbox: [
            result.lng - radiusDeg,
            result.lat - radiusDeg,
            result.lng + radiusDeg,
            result.lat + radiusDeg,
          ],
          label: result.name,
          center: { lat: result.lat, lng: result.lng },
          placeType: type,
        });
      }
    },
    [setBoundary]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((p) => (p < results.length - 1 ? p + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((p) => (p > 0 ? p - 1 : results.length - 1));
      } else if (e.key === "Enter" && highlightedIndex >= 0) {
        e.preventDefault();
        handleSelectResult(results[highlightedIndex]);
      } else if (e.key === "Escape") {
        setSearchOpen(false);
        inputRef.current?.blur();
      }
    },
    [results, highlightedIndex, handleSelectResult]
  );

  const clearSearch = useCallback(() => {
    setQuery("");
    setResults([]);
    setSearchOpen(false);
  }, []);

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

      {/* Search bar with dropdown */}
      <div className="relative flex-1 min-w-0" ref={searchRef}>
        <div className="flex items-center gap-2 h-9 px-3 bg-muted border border-border rounded-full transition-colors focus-within:ring-2 focus-within:ring-ring/40">
          <Search size={14} className="shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => { if (results.length > 0) setSearchOpen(true); }}
            onKeyDown={handleKeyDown}
            placeholder="Search city or area…"
            className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            id="header-search-input"
            autoComplete="off"
          />
          {query && (
            <button
              onClick={clearSearch}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Dropdown */}
        {searchOpen && (results.length > 0 || isSearching) && (
          <div
            className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-xl shadow-lg z-[100] overflow-hidden"
            id="search-dropdown"
          >
            {isSearching && results.length === 0 && (
              <div className="px-4 py-3 text-sm text-muted-foreground">
                Searching…
              </div>
            )}
            {results.map((result, i) => (
              <button
                key={`${result.eLoc}-${i}`}
                className={cn(
                  "w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors",
                  i === highlightedIndex
                    ? "bg-muted"
                    : "hover:bg-muted/50"
                )}
                onClick={() => handleSelectResult(result)}
                onMouseEnter={() => setHighlightedIndex(i)}
              >
                <MapPin size={16} className="shrink-0 mt-0.5 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {result.name}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {result.address}
                  </div>
                </div>
                <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground/60 mt-0.5">
                  {result.type?.replace("_", " ")}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Dark mode toggle */}
        {mounted && (
          <button
            className="flex items-center justify-center w-9 h-9 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            id="theme-toggle-btn"
            aria-label="Toggle dark mode"
            onClick={() => {
              const next = resolvedTheme === "dark" ? "light" : "dark";
              setTheme(next);
              // Nudge viewportBounds so the page.tsx fetch effect re-runs
              // and PriceMarkers re-renders with the new style
              const vb = viewportBounds;
              if (vb) setViewportBounds([vb[0], vb[1], vb[2], vb[3]]);
            }}
          >
            {resolvedTheme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        )}

        {/* Post property — checks login & role */}
        <button
          className="flex items-center gap-1.5 h-9 pl-2.5 pr-3.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold shrink-0 hover:opacity-90 transition-opacity"
          id="post-property-btn"
          onClick={() => {
            if (status !== "authenticated") {
              setAuthModalOpen(true);
              return;
            }
            const userRole = (session?.user as any)?.role;
            if (userRole === "buyer") {
              alert("Buyers cannot create listings. Please edit your role in your profile to Owner, Broker, or Developer.");
              return;
            }
            // Logic to open Listing wizard
            alert("Listing wizard opening...");
          }}
        >
          <Plus size={15} strokeWidth={2.5} />
          Post
        </button>

        {/* Authentication buttons */}
        {mounted && (
          status === "authenticated" ? (
            <div className="relative hidden md:block" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-secondary hover:bg-muted text-foreground transition-colors border border-border cursor-pointer"
                aria-label="User Menu"
              >
                <span className="text-xs font-bold font-display uppercase">
                  {session.user?.name ? session.user.name.slice(0, 2) : "US"}
                </span>
              </button>
              {/* Dropdown menu */}
              {userMenuOpen && (
                <div className="absolute right-0 top-11 w-48 bg-card border border-border rounded-lg shadow-lg py-1.5 z-50">
                  <div className="px-4 py-2 border-b border-border/80">
                    <div className="text-sm font-bold text-foreground truncate">{session.user?.name}</div>
                    <div className="text-[10px] text-muted-foreground capitalize font-semibold tracking-wider mt-0.5">
                      Role: {(session.user as any)?.role || "buyer"}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      setProfileModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-foreground hover:bg-secondary transition-colors cursor-pointer border-b border-border/50"
                  >
                    <UserIcon size={14} />
                    Profile Settings
                  </button>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      signOut({ callbackUrl: "/login" });
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors cursor-pointer"
                  >
                    <LogOut size={14} />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setAuthModalOpen(true)}
              className="h-9 px-4 rounded-full border border-border text-sm font-semibold text-foreground hover:bg-secondary transition-colors cursor-pointer hidden md:block"
            >
              Sign In
            </button>
          )
        )}

        {/* Mobile menu - hidden completely or visible only on desktop if needed */}
        <button
          className="flex items-center justify-center w-9 h-9 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors hidden md:flex"
          id="menu-btn"
          aria-label="Menu"
        >
          <Menu size={19} />
        </button>
      </div>
    </header>
  );
}
