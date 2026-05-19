"use client";

import { Search, Menu, Plus } from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { useListingsStore } from "@/store/listings";
import { useDebouncedCallback } from "use-debounce";

// City bounding boxes for major Indian cities (MVP: Hyderabad focused)
const CITY_BOUNDS: Record<string, [number, number, number, number]> = {
  hyderabad: [78.2, 17.2, 78.7, 17.6],
  bangalore: [77.4, 12.8, 77.8, 13.15],
  mumbai: [72.75, 18.85, 72.99, 19.28],
  delhi: [76.85, 28.4, 77.35, 28.85],
  chennai: [80.1, 12.85, 80.35, 13.2],
  pune: [73.7, 18.4, 73.95, 18.65],
};

export default function Header() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { setBoundary } = useListingsStore();

  const filteredCities = Object.keys(CITY_BOUNDS).filter((city) =>
    city.includes(searchQuery.toLowerCase())
  );

  const handleCitySelect = useCallback(
    (city: string) => {
      const bbox = CITY_BOUNDS[city];
      if (bbox) {
        setBoundary({
          type: "city",
          bbox,
          label: city.charAt(0).toUpperCase() + city.slice(1),
        });
        setSearchQuery(city.charAt(0).toUpperCase() + city.slice(1));
        setShowSuggestions(false);
        inputRef.current?.blur();
      }
    },
    [setBoundary]
  );

  const handleInputChange = useDebouncedCallback((value: string) => {
    setSearchQuery(value);
    setShowSuggestions(value.length > 0);
  }, 150);

  return (
    <header className="header" id="app-header">
      <span className="header__logo">Blab</span>

      <div className="header__search" style={{ position: "relative" }}>
        <Search size={16} strokeWidth={2} />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search city..."
          defaultValue={searchQuery}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setShowSuggestions(searchQuery.length > 0)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          aria-label="Search city"
          id="city-search-input"
        />
        {showSuggestions && filteredCities.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-lg)",
              zIndex: "var(--z-dropdown)",
              overflow: "hidden",
            }}
          >
            {filteredCities.map((city) => (
              <button
                key={city}
                onClick={() => handleCitySelect(city)}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "10px 14px",
                  textAlign: "left",
                  fontSize: "0.875rem",
                  color: "var(--color-text-primary)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  transition: "background var(--duration-fast) var(--ease-out)",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--color-bg)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "none")
                }
              >
                {city.charAt(0).toUpperCase() + city.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="header__actions">
        <button className="btn btn-primary" id="post-property-btn">
          <Plus size={16} />
          <span className="header__post-text">Post Property</span>
        </button>
        <button className="btn-icon" id="menu-btn" aria-label="Menu">
          <Menu size={20} />
        </button>
      </div>
    </header>
  );
}
