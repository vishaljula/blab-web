"use client";

import { Map, List } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ViewToggleFabProps {
  currentView: "map" | "list";
  onToggle: () => void;
}

export default function ViewToggleFab({
  currentView,
  onToggle,
}: ViewToggleFabProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.button
        key={currentView}
        className="fab"
        onClick={onToggle}
        id="view-toggle-fab"
        aria-label={currentView === "map" ? "Switch to list view" : "Switch to map view"}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        {currentView === "map" ? (
          <>
            <List size={18} />
            List
          </>
        ) : (
          <>
            <Map size={18} />
            Map
          </>
        )}
      </motion.button>
    </AnimatePresence>
  );
}
