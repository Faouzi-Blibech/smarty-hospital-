"use client";

// Demo flags from the URL: `?ai=rules`, `?live=0`, `?state=loading|empty|error`.
// Client-only module (useSearchParams). Render the calling component inside
// <Suspense> — Next requires it around useSearchParams for static prerendering.
// The demo clock and time formatters live in `lib/time.ts`.
import { useSearchParams } from "next/navigation";

export type DemoState = "loading" | "empty" | "error";

export interface DemoFlags {
  /** `?ai=rules` → AI unavailable, show "Rules fallback". */
  aiFallback: boolean;
  /** `?live=0` → reconnecting banner and paused values. */
  live: boolean;
  /** `?state=loading|empty|error` → the design's "States" section. */
  state: DemoState | null;
}

export function parseDemoFlags(params: { get(name: string): string | null }): DemoFlags {
  const s = params.get("state");
  return {
    aiFallback: params.get("ai") === "rules",
    live: params.get("live") !== "0",
    state: s === "loading" || s === "empty" || s === "error" ? s : null,
  };
}

/** Client hook. Wrap the calling component in <Suspense>. */
export function useDemoFlags(): DemoFlags {
  return parseDemoFlags(useSearchParams());
}

