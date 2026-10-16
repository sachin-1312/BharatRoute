import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Network, ArrowLeftRight, Activity, BarChart3, Settings } from 'lucide-react';

export const Sidebar: React.FC = () => {
  const navItems = [
    { label: 'Overview', to: '/', icon: Home },
    { label: 'Live topology', to: '/links', icon: Network },
    { label: 'Routes', to: '/routes', icon: ArrowLeftRight },
    { label: 'Probes', to: '/simulator', icon: Activity },
    { label: 'Benchmarks', to: '/benchmark', icon: BarChart3 },
    { label: 'Settings', to: '/settings', icon: Settings },
  ];

  return (
    <aside className="w-64 shrink-0 bg-[#FAF8F5] border-r border-[#EBE7E1] min-h-screen flex flex-col p-4 select-none">
      {/* Brand Logo */}
      <div className="flex items-center gap-2.5 px-3 py-4 mb-4">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" className="shrink-0 text-[#FF5722]">
          <circle cx="12" cy="5" r="2.5" stroke="#FF5722" strokeWidth="2.5" fill="#FFF2EB" />
          <circle cx="5" cy="18" r="2.5" stroke="#FF5722" strokeWidth="2.5" fill="#FFF2EB" />
          <circle cx="19" cy="18" r="2.5" stroke="#FF5722" strokeWidth="2.5" fill="#FFF2EB" />
          <path d="M12 7.5L6.5 16M12 7.5L17.5 16M7.5 18H16.5" stroke="#FF5722" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="font-bold text-lg text-gray-900 tracking-tight">
          BharatRoute
        </span>
      </div>

      {/* Navigation List */}
      <nav className="flex flex-col gap-1.5 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'text-[#FF5722] bg-[#FFF2EB] font-semibold before:content-[""] before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3.5px] before:bg-[#FF5722] before:rounded-r-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/50'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
};
