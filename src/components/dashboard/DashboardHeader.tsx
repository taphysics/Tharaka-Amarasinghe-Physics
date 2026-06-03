import React from 'react';
import { LogOut, ShoppingBag, BookOpen, LayoutDashboard } from 'lucide-react';

interface HeaderProps {
  onLogout: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function DashboardHeader({ onLogout, activeTab, setActiveTab }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          
          {/* Logo / Title */}
          <div className="flex-shrink-0 flex items-center cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <span className="text-white font-bold text-lg md:text-xl tracking-wide">
              තාරක අමරසිංහ
            </span>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex gap-6 items-center">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 text-sm font-medium transition-colors ${activeTab === 'dashboard' ? 'text-blue-400' : 'text-slate-300 hover:text-white'}`}
            >
              <LayoutDashboard size={16} /> Dashboard
            </button>
            
            {/* නව Physics Store ලින්ක් එක */}
            <button 
              onClick={() => setActiveTab('store')}
              className={`flex items-center gap-2 text-sm font-medium transition-colors ${activeTab === 'store' ? 'text-amber-400' : 'text-slate-300 hover:text-amber-300'}`}
            >
              <ShoppingBag size={16} /> Physics Store
            </button>

            <button 
              onClick={() => setActiveTab('notes')}
              className={`flex items-center gap-2 text-sm font-medium transition-colors ${activeTab === 'notes' ? 'text-blue-400' : 'text-slate-300 hover:text-white'}`}
            >
              <BookOpen size={16} /> Free Notes
            </button>
          </nav>

          {/* Logout Button */}
          <div className="flex items-center">
            <button 
              onClick={onLogout}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors text-sm font-medium"
            >
              <LogOut size={16} /> <span className="hidden md:inline">Log out</span>
            </button>
          </div>

        </div>
      </div>
    </header>
  );
}