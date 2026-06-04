"use client";

import { Map, List } from "lucide-react";
import { motion } from "framer-motion";

interface ViewToggleFabProps {
  currentView: "map" | "list";
  onToggle: () => void;
}

export default function ViewToggleFab({
  currentView,
  onToggle,
}: ViewToggleFabProps) {
  return (
    <motion.button
      className="fixed bottom-[76px] left-1/2 flex items-center gap-2 px-5 py-2.5 bg-card hover:bg-secondary/90 text-foreground border border-border rounded-full text-sm font-semibold shadow-[0_4px_12px_rgba(0,0,0,0.12)] z-40 cursor-pointer transition-colors md:hidden"
      onClick={onToggle}
      id="view-toggle-fab"
      aria-label={
        currentView === "map" ? "Switch to list view" : "Switch to map view"
      }
      initial={{ scale: 0.8, opacity: 0, y: 10, x: "-50%" }}
      animate={{ scale: 1, opacity: 1, y: 0, x: "-50%" }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      {currentView === "map" ? (
        <>
          <List size={16} className="text-primary" />
          <span>List</span>
        </>
      ) : (
        <>
          <Map size={16} className="text-primary" />
          <span>Map</span>
        </>
      )}
    </motion.button>
  );
}

