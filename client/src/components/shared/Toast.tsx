import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { HttpMethodBadge } from './HttpMethodBadge';
import { StatusCodeBadge } from './StatusCodeBadge';
import type { HttpMethod } from '../../types';

interface Toast {
  id: string;
  method: string;
  path: string;
  statusCode: number;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = crypto.randomUUID();
    set((s) => {
      const next = [...s.toasts, { ...toast, id }];
      return { toasts: next.length > 5 ? next.slice(-5) : next };
    });
  },
  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useToastStore((s) => s.removeToast);
  const [entered, setEntered] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const enterFrame = requestAnimationFrame(() => setEntered(true));
    const fadeTimer = setTimeout(() => setFading(true), 2600);
    const removeTimer = setTimeout(() => removeToast(toast.id), 3000);
    return () => {
      cancelAnimationFrame(enterFrame);
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [toast.id, removeToast]);

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border border-border-default bg-bg-surface px-3 py-2 shadow-lg transition-all duration-300 ease-out ${
        fading
          ? 'opacity-0'
          : entered
            ? 'translate-y-0 opacity-100'
            : 'translate-y-4 opacity-0'
      }`}
    >
      <HttpMethodBadge method={toast.method as HttpMethod} />
      <span className="truncate font-mono text-sm text-text-primary max-w-[200px]">
        {toast.path}
      </span>
      <StatusCodeBadge code={toast.statusCode} />
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
