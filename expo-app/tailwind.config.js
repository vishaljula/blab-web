/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Blab design tokens — mirrors globals.css
        background: "var(--color-background)",
        foreground: "var(--color-foreground)",
        card: "var(--color-card)",
        "card-foreground": "var(--color-card-foreground)",
        primary: {
          DEFAULT: "#8B2500",
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "#F0EEEA",
          foreground: "#1A1A1A",
        },
        muted: {
          DEFAULT: "#F5F3EF",
          foreground: "#6B6B6B",
        },
        border: "#E8E6E1",
        destructive: {
          DEFAULT: "#9B1B30",
          foreground: "#FFFFFF",
        },
      },
      fontFamily: {
        sans: ["Inter"],
        display: ["DM Sans"],
      },
    },
  },
  plugins: [],
};
