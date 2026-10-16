import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ToastContainer } from '../ui/ToastContainer';
import { connectWebSocket, disconnectWebSocket } from '../../lib/ws';
import { useStore } from '../../store/useStore';

export const AppShell: React.FC = () => {
  const fetchState = useStore((state) => state.fetchState);

  useEffect(() => {
    fetchState();
    connectWebSocket();

    return () => {
      disconnectWebSocket();
    };
  }, [fetchState]);

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-gray-900 flex font-sans antialiased">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <main className="flex-1 p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
      <ToastContainer />
    </div>
  );
};
