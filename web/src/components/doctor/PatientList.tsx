"use client";

// Doctor / My patients (/doctor): the doctor's patients, highest NEWS2 first.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LiveBanner } from "@/components/LiveBanner";
import { ErrorCard } from "@/components/shared/ErrorCard";
import { News2Badge } from "@/components/News2Badge";
import { getMyPatients } from "@/lib/api";
import { useDemoFlags } from "@/lib/demo";
import { ago, pausedAt, USE_MOCKS } from "@/lib/time";
import type { Patient, PatientSummary } from "@/lib/types";
import styles from "./PatientList.module.css";

const SKELETON_WIDTHS = ["62%", "48%", "70%", "55%", "40%"];
/** "Needs attention": NEWS2 High or Critical. */
const needsAttention = (p: PatientSummary) => (p.latest_news2 ?? 0) >= 5;

export function PatientList() {
  const flags = useDemoFlags();
  const [patients, setPatients] = useState<PatientSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "attention">("all");

  const load = useCallback(() => {
    setFailed(false);
    setPatients(null);
    getMyPatients()
      .then(setPatients)
      .catch(() => setFailed(true));
  }, []);

  useEffect(load, [load]);

  const state = flags.state ?? (failed ? "error" : patients == null ? "loading" : patients.length === 0 ? "empty" : null);
  const list = useMemo(() => (state == null ? (patients ?? []) : []), [state, patients]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter(
      (p) =>
        (filter === "all" || needsAttention(p)) &&
        (!q || `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) || (p.bed ?? "").toLowerCase().includes(q)),
    );
  }, [list, query, filter]);

  const ward = patients?.[0]?.ward ?? "Cardiology";
  const wardLetter = patients?.[0]?.bed?.split("-")[0] ?? "C";
  // Real mode: the ward from the data only (no derived "Ward {bed letter}").
  const realWard = patients?.find((p) => p.ward)?.ward ?? null;
  const attention = list.filter(needsAttention).length;

  return (
    <div className={styles.page}>
      {!flags.live ? (
        <LiveBanner>
          Showing values from {pausedAt()}. NEWS2 and alerts will refresh when the connection returns.
        </LiveBanner>
      ) : null}
      <div className={styles.head}>
        <div className={styles.titles}>
          <h2 className={styles.h2}>My patients</h2>
          <span className={styles.sub}>
            {USE_MOCKS ? (
              <>
                {ward} · Ward {wardLetter} · {state === "loading" ? "" : `${list.length} patients · `}highest NEWS2 first
              </>
            ) : (
              [realWard, state === "loading" ? null : `${list.length} patients`, "highest NEWS2 first"].filter(Boolean).join(" · ")
            )}
          </span>
        </div>
        <label className={styles.search}>
          <span className={styles.searchIcon} aria-hidden="true" />
          <input
            aria-label="Search patients by name or bed"
            placeholder="Search name or bed"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={styles.searchInput}
          />
        </label>
        <div className={styles.segment} role="group" aria-label="Filter patients">
          <button
            type="button"
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
            className={`${styles.segBtn} ${filter === "all" ? styles.segOn : ""}`}
          >
            All · {list.length}
          </button>
          <button
            type="button"
            aria-pressed={filter === "attention"}
            onClick={() => setFilter("attention")}
            className={`${styles.segBtn} ${filter === "attention" ? styles.segOn : ""}`}
          >
            Needs attention · {attention}
          </button>
        </div>
      </div>

      {state === "loading" ? (
        <div className={styles.skelCard} aria-busy="true">
          {SKELETON_WIDTHS.map((w) => (
            <div key={w} className={styles.skelRow}>
              <div className={styles.skelName}>
                <span className="ward-skeleton" style={{ height: 14, width: w }} />
                <span className={styles.skelBar} style={{ height: 10, width: 60 }} />
              </div>
              <span className={styles.skelBar} style={{ height: 16 }} />
              <span className={styles.skelBar} style={{ height: 26, borderRadius: 999 }} />
              <span className={styles.skelBar} style={{ height: 12 }} />
            </div>
          ))}
        </div>
      ) : state === "empty" ? (
        <div className={styles.emptyCard}>
          <span className={styles.emptyIcon}>
            <span />
          </span>
          <span className={styles.emptyTitle}>No patients assigned yet</span>
          <span className={styles.emptyText}>
            When a patient is admitted under your name, they appear here with their latest vitals.
          </span>
          <Link href="/doctor/requests" className={`${styles.primary} ${styles.emptyBtn}`}>
            Review appointment requests
          </Link>
        </div>
      ) : state === "error" ? (
        <ErrorCard title="Couldn’t load your patients." onRetry={load} />
      ) : (
        <div className={styles.table}>
          <div className={`${styles.grid} ${styles.th}`}>
            <span>Patient</span>
            <span>Bed</span>
            <span className={styles.sorted}>NEWS2 ↓</span>
            <span>Open alerts</span>
            <span>Last vitals</span>
            <span>Bedside unit</span>
            <span />
          </div>
          {shown.map((p) => {
            const sex = (p as Partial<Patient>).sex;
            const online = !!p.device_online;
            return (
              <Link key={p.id} href={`/doctor/patients/${p.id}`} className={`${styles.grid} ${styles.tr}`}>
                <div className={styles.who}>
                  <span dir="auto" className={styles.name}>
                    {p.first_name} {p.last_name}
                  </span>
                  <span className={styles.meta}>
                    {p.age}
                    {sex ? ` · ${sex}` : ""}
                  </span>
                </div>
                <span className={styles.bed}>{p.bed ?? "—"}</span>
                <News2Badge score={p.latest_news2 ?? 0} />
                <span className={styles.alerts} style={{ color: p.open_alerts ? "var(--danger)" : "var(--muted)" }}>
                  {p.open_alerts ? `${p.open_alerts} open` : "None"}
                </span>
                <span className={styles.last}>
                  {!flags.live ? "paused" : p.last_vital_at ? ago(p.last_vital_at) : "—"}
                </span>
                <span className={styles.unit}>
                  {p.device_id ? (
                    <>
                      <span
                        className={styles.unitDot}
                        style={{
                          background: online ? "var(--teal)" : "transparent",
                          borderColor: online ? "var(--teal)" : "var(--faint)",
                        }}
                      />
                      <span className={styles.mono}>{p.device_id}</span>· {online ? "online" : "offline"}
                    </>
                  ) : (
                    "No unit"
                  )}
                </span>
                <span className={styles.chev}>›</span>
              </Link>
            );
          })}
          {shown.length === 0 ? <div className={styles.noMatch}>No patient matches this search.</div> : null}
        </div>
      )}
      <span className={styles.foot}>NEWS2 colours always come with the score and a word. Values are simulated for this prototype.</span>
    </div>
  );
}

export default PatientList;
