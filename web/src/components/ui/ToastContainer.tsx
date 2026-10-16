import React from 'react';
import { useStore } from '../../store/useStore';
import { CheckCircle2, AlertTriangle, AlertCircle, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const toasts = useStore((state) => state.toasts);
  const removeToast = useStore((state) => state.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-5 right-6 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none transition-all duration-200"
    >
      {toasts.map((toast) => {
        const isError = toast.level === 'error';
        const isWarn = toast.level === 'warn';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border bg-white shadow-[0_10px_30px_rgba(0,0,0,0.10)] transition-all duration-200 animate-in fade-in slide-in-from-top-3 ${
              isError
                ? 'border-red-200 text-red-950'
                : isWarn
                ? 'border-amber-200 text-amber-950'
                : 'border-orange-100 text-gray-900'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {isError ? (
                <div className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                  <AlertCircle className="w-3.5 h-3.5" />
                </div>
              ) : isWarn ? (
                <div className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                  <AlertTriangle className="w-3.5 h-3.5" />
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full bg-[#FFF2EB] text-[#FF5722] flex items-center justify-center">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold leading-tight mb-0.5 text-gray-900">
                {isError ? 'Action Failed' : isWarn ? 'Warning' : 'Telemetry Update'}
              </div>
              <div className="text-xs text-gray-600 leading-relaxed break-words">
                {toast.message}
              </div>
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 text-gray-400 hover:text-gray-700 p-0.5 rounded transition-colors"
              aria-label="Close notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
