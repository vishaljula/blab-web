"use client";

import { Search, Plus, Moon, Sun, Menu, MapPin, X } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState, useCallback, useRef } from "react";
import { useDebouncedCallback } from "use-debounce";
import { cn } from "@/lib/utils";
import { useListingsStore } from "@/store/listings";

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

  // Search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { setBoundary, viewportBounds } = useListingsStore();

  useEffect(() => setMounted(true), []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
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
