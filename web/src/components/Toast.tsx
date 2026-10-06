"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./Toast.module.css";

export interface ToastProps {
  children: ReactNode;
  /** "ok" = green ✓, "warn" = amber ! (e.g. "Saved · No device assigned."). */
  tone?: "ok" | "warn";
  /** "md": 16 px text, 24 px icon (doctor, admin). "sm": 15 px, 22 px icon (waitlist). */
  size?: "md" | "sm";
  /**
   * "fixed": bottom-right of the viewport (32 px inset).
   * "absolute": bottom-right of the nearest positioned ancestor (32 px inset).
   * "inline": in the flow (States cards).
   */
  placement?: "fixed" | "absolute" | "inline";
  className?: string;
}

/** Dark ink toast with a round status icon (role="status"). */
export function Toast({ children, tone = "ok", size = "md", placement = "fixed", className }: ToastProps) {
  return (
    <div role="status" className={`${styles.root} ${styles[size]} ${styles[placement]} ${className ?? ""}`}>
      <span className={`${styles.icon} ${tone === "warn" ? styles.warn : styles.ok}`}>{tone === "warn" ? "!" : "✓"}</span>
      <span>{children}</span>
    </div>
  );
}

/**
 * Toast state with auto-hide (design: 4500 ms; admin uses 5000 ms).
 * `const [toast, show] = useToast(); show("Saved"); {toast && <Toast>{toast}</Toast>}`
 */
export function useToast<T = ReactNode>(ms = 4500): [T | null, (value: T) => void, () => void] {
  const [value, setValue] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setValue(null);
  }, []);
  const show = useCallback(
    (v: T) => {
      if (timer.current) clearTimeout(timer.current);
      setValue(v);
      timer.current = setTimeout(() => setValue(null), ms);
    },
    [ms],
  );
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return [value, show, clear];
}

export default Toast;
