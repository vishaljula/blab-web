"use client";

import { PlusCircle, User } from "lucide-react";

interface BottomNavigationProps {
  onPostClick: () => void;
  onProfileClick: () => void;
}

export default function BottomNavigation({
  onPostClick,
  onProfileClick
}: BottomNavigationProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 h-16 bg-card border-t border-border flex justify-around items-center md:hidden px-2 pb-safe shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
      {/* Post Action */}
      <button
        onClick={onPostClick}
        className="flex flex-col items-center justify-center flex-1 h-full py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <PlusCircle size={22} className="mb-1 text-primary hover:scale-105 transition-transform" strokeWidth={2.5} />
        Post
      </button>

      {/* Profile Tab */}
      <button
        onClick={onProfileClick}
        className="flex flex-col items-center justify-center flex-1 h-full py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <User size={20} className="mb-1" />
        Profile
      </button>
    </div>
  );
}

