"use client";

// Ward alerts state shared by the board, the alerts page and the patient detail:
// load, acknowledge (with "on my way" notes) and a warning toast when a call fails.
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { ackAlert, getAlerts } from "@/lib/api";
import type { Alert } from "@/lib/types";
import { NURSE_ID } from "./nurse";

export interface WardAlerts {
  alerts: Alert[] | null;
  failed: boolean;
  reload: () => void;
  /** Acknowledge; `note` is appended to "Acknowledged by …" (e.g. "(on my way)"). Resolves false on failure. */
  ack: (id: string, note?: string) => Promise<boolean>;
  busy: ReadonlySet<string>;
  notes: Readonly<Record<string, string>>;
  /** Warning toast text after a failed acknowledge. */
  notice: string | null;
}

export function useWardAlerts(): WardAlerts {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [notice, showNotice] = useToast<string>();

  const reload = useCallback(() => {
    setFailed(false);
    getAlerts()
      .then(setAlerts)
      .catch(() => setFailed(true));
  }, []);

  useEffect(reload, [reload]);

  const ack = useCallback(
    async (id: string, note?: string) => {
      setBusy((b) => new Set(b).add(id));
      try {
        const updated = await ackAlert(id, { by: NURSE_ID });
        setAlerts((list) => list?.map((a) => (a.id === id ? updated : a)) ?? list);
        if (note) setNotes((n) => ({ ...n, [id]: note }));
        return true;
      } catch {
        showNotice("Couldn’t acknowledge the alert. Try again, or check the patient in person.");
        return false;
      } finally {
        setBusy((b) => {
          const next = new Set(b);
          next.delete(id);
          return next;
        });
      }
    },
    [showNotice],
  );

  return { alerts, failed, reload, ack, busy, notes, notice };
}

export default useWardAlerts;
