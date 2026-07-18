'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const menuItems = [
    { name: 'نظرة عامة', path: '/', icon: '🎛️' },
    { name: 'مضاربة يومية', path: '/day-trades', icon: '⚡' },
    { name: 'فرص أسبوعية', path: '/swing-trades', icon: '📅' },
    { name: 'حصاد الشهر', path: '/monthly-picks', icon: '🌙' },
    { name: 'استثمار نهاية العام', path: '/annual-investments', icon: '🏢' },
    { name: 'السجل الشامل', path: '/history', icon: '📚' },
  ];

  return (
    <>
      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between bg-neutral-950 border-b border-neutral-900 px-4 py-3 sticky top-0 z-40 w-full" dir="rtl">
        <div className="flex items-center gap-2 text-right">
          <img src="/logo.svg" alt="SignalMind Logo" className="h-6 w-6 rounded" />
          <div className="flex flex-col">
            <span className="text-xs font-black tracking-wider text-white">SIGNALMIND</span>
            <span className="text-[9px] text-neutral-500 font-mono">FINANCIAL TERMINAL</span>
          </div>
        </div>
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="text-neutral-405 hover:text-white p-1 focus:outline-none"
        >
          {isOpen ? (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Drawer Overlay for Mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-30 bg-black/60 md:hidden backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside 
        className={`fixed top-0 bottom-0 right-0 z-40 w-64 bg-neutral-950 border-l border-neutral-900 flex flex-col justify-between transition-transform duration-300 md:translate-x-0 
        ${isOpen ? 'translate-x-0' : 'max-md:translate-x-full'} 
        h-screen`}
        dir="rtl"
      >
        <div className="flex flex-col flex-1 p-6 overflow-y-auto">
          {/* Brand/Logo Area */}
          <div className="mb-8 text-right">
            <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-2 justify-start">
              <img src="/logo.svg" alt="SignalMind Logo" className="h-7 w-7 rounded" />
              <span dir="ltr" className="font-bold text-xl tracking-wide text-white">SignalMind</span>
            </h1>
            <p className="text-[9px] text-neutral-500 mt-1 font-mono uppercase tracking-wider">
              TERMINAL V2.0
            </p>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1 flex-1">
            {menuItems.map((item) => {
              const isActive = pathname === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-md text-xs font-bold transition-all duration-200 ${
                    isActive
                      ? 'bg-white text-black font-black border border-white'
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/40 border border-transparent'
                  }`}
                >
                  <span className="text-sm">{item.icon}</span>
                  <span className="flex-1 text-start">{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer Area - Connection & Status */}
        <div className="p-6 border-t border-neutral-900 bg-neutral-950/80">
          <div className="flex items-center justify-between text-[10px] text-neutral-500 font-mono">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-white animate-pulse shadow-[0_0_8px_#ffffff]" />
              <span className="uppercase font-bold text-neutral-400">ONLINE</span>
            </div>
            <span>SECURE CONN</span>
          </div>
        </div>
      </aside>
    </>
  );
}
