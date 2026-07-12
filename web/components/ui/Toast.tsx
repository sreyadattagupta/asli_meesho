"use client";

import { cn } from "@/lib/cn";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

interface ToastItem { id: number; kind: "success" | "error"; message: string }
interface ToastApi { toast: (t: { kind: "success" | "error"; message: string }) => void }

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const nextId = useRef(1);
  const reduce = useReducedMotion();

  useEffect(() => setMounted(true), []);

  const toast = useCallback((t: { kind: "success" | "error"; message: string }) => {
    const id = nextId.current++;
    setItems((prev) => [...prev, { id, ...t }]);
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 4000);
  }, []);

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted && createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">
          <AnimatePresence>
            {items.map((t) => (
              <motion.div
                key={t.id}
                role="status"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className={cn(
                  "pointer-events-auto flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur",
                  t.kind === "success"
                    ? "border-asli-green/30 bg-asli-green/15 text-asli-green"
                    : "border-asli-red/30 bg-asli-red/15 text-asli-red",
                )}
              >
                {t.kind === "success"
                  ? <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                  : <XCircle className="h-4 w-4 shrink-0" aria-hidden />}
                {t.message}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
