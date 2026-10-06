"use client";

// Admin / Dashboard (/admin): KPI tiles, requests-per-day chart, "Needs a person".
// Live tiles come from api.ts (waitlist, devices, open alerts). Figures that have no
// endpoint yet (hospital-wide admissions, reminder and refill stats, the 7-day
// history) are the design's sample values, kept below.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ErrorCard } from "@/components/shared/ErrorCard";
import { getAlerts, getDevices, getWaitlist } from "@/lib/api";
import { useDemoFlags } from "@/lib/demo";
import { URGENCY_BAR } from "@/lib/labels";
import { daysSince, now, tunisDay, tunisTime } from "@/lib/time";
import type { Alert, Appointment, Device, Urgency } from "@/lib/types";
import page from "./AdminPage.module.css";
import styles from "./Dashboard.module.css";

const LATEST_FW = "v0.4.2";
const BAR_MAX = 40;
/** Requests per day by urgency [5, 4, 3, 2, 1] (design sample; no stats endpoint yet). */
const BAR_DATA: [string, number[]][] = [
  ["Tue 29", [2, 4, 9, 11, 5]],
  ["Wed 30", [3, 5, 8, 14, 6]],
  ["Thu 1", [2, 6, 10, 12, 4]],
  ["Fri 2", [4, 5, 7, 13, 7]],
  ["Sat 3", [1, 2, 4, 6, 3]],
  ["Sun 4", [1, 2, 3, 5, 2]],
  ["Mon 5", [3, 4, 6, 8, 3]],
];
const URGENCY_WORD = ["", "Non-urgent", "Routine", "Soon", "Urgent", "Very urgent"];
const LEGEND = ([5, 4, 3, 2, 1] as Urgency[]).map((n) => ({ c: URGENCY_BAR[n], label: `${n} · ${URGENCY_WORD[n]}` }));

interface Data {
  waitlist: Appointment[];
  devices: Device[];
  alerts: Alert[];
}

interface Kpi {
  label: string;
  value: string | number;
  of: string;
  note: string;
  noteFg: string;
  href: string;
}

interface Todo {
  c: string;
  title: string;
  sub: string;
  cta: string;
  href: string;
}

// Every row here is unconfirmed: GET /appointments/waitlist returns only status "requested" (api.md line 83,
// mock filter in lib/api.ts getWaitlist); an urgency override sets urgency_final but does not confirm.
const urgencyOf = (a: Appointment) => a.urgency_final ?? a.urgency_ai;

function buildKpis({ waitlist, devices, alerts }: Data): Kpi[] {
  const assigned = devices.filter((d) => d.patient_id).length;
  const free = devices.length - assigned;
  const crit = alerts.filter((a) => a.severity === "critical");
  const veryUrgent = waitlist.filter((a) => urgencyOf(a) === 5).length;
  const online = devices.filter((d) => d.online).length;
  const offline = devices.find((d) => !d.online);
  return [
    {
      label: "Patients admitted",
      value: "42",
      of: "",
      note: `Ward C: ${assigned} · ${free} bed${free === 1 ? "" : "s"} free`,
      noteFg: "var(--muted)",
      href: "/admin/devices",
    },
    {
      label: "Open alerts",
      value: alerts.length,
      of: "",
      note: `${crit.length} critical${crit[0]?.bed ? ` · Bed ${crit[0].bed}` : ""}`,
      noteFg: crit.length ? "var(--danger)" : "var(--muted)",
      href: "/nurse/alerts",
    },
    {
      label: "Waitlist",
      value: waitlist.length,
      of: "requests",
      note: `${veryUrgent} very urgent not yet confirmed`,
      noteFg: veryUrgent ? "var(--danger)" : "var(--muted)",
      href: "/admin/waitlist",
    },
    {
      label: "Bedside units online",
      value: online,
      of: `/ ${devices.length}`,
      note: offline ? `${offline.id} offline since ${tunisTime(offline.last_seen)}` : "All units online",
      noteFg: offline ? "var(--news-high-fg)" : "var(--muted)",
      href: "/admin/devices",
    },
    {
      label: "Reminders confirmed this week",
      value: "31",
      of: "/ 36",
      note: "86% · 2 cancelled, 3 no reply",
      noteFg: "var(--muted)",
      href: "/admin/waitlist",
    },
    {
      label: "Slots refilled after cancellation",
      value: "4",
      of: "this week",
      note: "Average 2 h to refill",
      noteFg: "var(--news-normal-fg)",
      href: "/admin/waitlist",
    },
  ];
}

function buildTodo({ waitlist, devices }: Data): Todo[] {
  const todo: Todo[] = [];
  const vu = waitlist.filter((a) => urgencyOf(a) === 5);
  if (vu.length) {
    const chest = vu.filter((a) => a.triage.red_flags.some((f) => f.includes("chest_pain"))).length;
    const oldest = Math.max(...vu.map((a) => daysSince(a.created_at)));
    todo.push({
      c: URGENCY_BAR[5],
      title: `${vu.length} very urgent request${vu.length === 1 ? "" : "s"} waiting`,
      sub: `${chest ? `Chest pain ×${chest} · ` : ""}oldest ${oldest} day${oldest === 1 ? "" : "s"}`,
      cta: "Waitlist",
      href: "/admin/waitlist",
    });
  }
  for (const d of devices.filter((x) => !x.online)) {
    todo.push({
      c: URGENCY_BAR[3],
      title: `${d.id} offline${d.bed ? ` · Bed ${d.bed}` : ""}`,
      sub: `Last seen ${tunisTime(d.last_seen)}${d.patient_name ? ` · ${d.patient_name}` : ""}`,
      cta: "Devices",
      href: "/admin/devices",
    });
  }
  for (const d of devices.filter((x) => x.fw_version !== LATEST_FW)) {
    todo.push({
      c: URGENCY_BAR[3],
      title: `Firmware update for ${d.id}`,
      sub: `${d.fw_version} → ${LATEST_FW} · install at night`,
      cta: "Devices",
      href: "/admin/devices",
    });
  }
  // Freed-slot offers have no endpoint yet: design sample.
  todo.push({
    c: URGENCY_BAR[2],
    title: "Slot freed: Wed 7 Oct 10:00",
    sub: "Offered to Karim Ben Ali · waiting reply",
    cta: "View",
    href: "/admin/waitlist",
  });
  return todo;
}

export function Dashboard() {
  const flags = useDemoFlags();
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);

  const fallback = flags.aiFallback;
  const load = useCallback((quiet = false) => {
    if (!quiet) {
      setFailed(false);
      setData(null);
    }
    // GET /alerts is nurse/doctor only in api.md: without it the alert figures read 0 instead of failing the page.
    Promise.all([getWaitlist({ fallback }), getDevices(), getAlerts({ status: "open" }).catch((): Alert[] => [])])
      .then(([waitlist, devices, alerts]) => {
        setData({ waitlist, devices, alerts });
        setFailed(false);
      })
      .catch(() => {
        if (!quiet) setFailed(true);
      });
  }, [fallback]);

  useEffect(() => load(), [load]);

  // "Figures refresh every minute" (paused while live data is reconnecting).
  useEffect(() => {
    if (!flags.live) return;
    const t = setInterval(() => load(true), 60_000);
    return () => clearInterval(t);
  }, [flags.live, load]);

  const state = flags.state === "empty" ? null : (flags.state ?? (failed ? "error" : data == null ? "loading" : null));
  const clock = now().toISOString();

  return (
    <div className={`${page.page} ${styles.page}`}>
      <div className={page.head}>
        <div className={page.titles}>
          <h2 className={page.h2}>Good morning, Mme Gharbi</h2>
          <span className={page.sub}>
            Hôpital Régional · {tunisDay(clock)}, {tunisTime(clock)}
          </span>
        </div>
        <span className={styles.refresh}>Figures refresh every minute</span>
      </div>

      {state === "loading" ? (
        <div className={styles.kpis} aria-busy="true">
          {[1, 2, 3, 4, 5, 6].map((k) => (
            <div key={k} className={styles.skelTile}>
              <span className={styles.skelLabel} />
              <span className={`ward-skeleton ${styles.skelValue}`} />
            </div>
          ))}
        </div>
      ) : state === "error" || !data ? (
        <ErrorCard title="Couldn’t load today’s figures." onRetry={() => load()} />
      ) : (
        <div className={styles.kpis}>
          {buildKpis(data).map((k) => (
            <Link key={k.label} href={k.href} className={styles.kpi}>
              <span className={styles.kpiLabel}>{k.label}</span>
              <span className={styles.kpiValueRow}>
                <span className={styles.kpiValue}>{k.value}</span>
                {k.of ? <span className={styles.kpiOf}>{k.of}</span> : null}
              </span>
              <span className={styles.kpiNote} style={{ color: k.noteFg }}>
                {k.note}
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className={styles.lower}>
        <section className={`${styles.card} ${styles.chartCard}`}>
          <div className={styles.legendRow}>
            <h3 className={`${styles.h3} ${styles.chartTitle}`}>Appointment requests per day · by urgency</h3>
            {LEGEND.map((l) => (
              <span key={l.label} className={styles.legend}>
                <span className={styles.swatch} style={{ background: l.c }} />
                {l.label}
              </span>
            ))}
          </div>
          <div className={styles.chart}>
            <div className={styles.axis}>
              <span>40</span>
              <span>20</span>
              <span>0</span>
            </div>
            {BAR_DATA.map(([day, segs]) => {
              const total = segs.reduce((x, y) => x + y, 0);
              return (
                <div
                  key={day}
                  title={`${day}: ${total} requests`}
                  className={styles.bar}
                  style={{ height: `${(total / BAR_MAX) * 100}%` }}
                >
                  {segs.map((v, i) => (
                    <span
                      key={i}
                      className={styles.seg}
                      style={{ height: `${(v / total) * 100}%`, background: URGENCY_BAR[(5 - i) as Urgency] }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
          <div className={styles.days}>
            <span />
            {BAR_DATA.map(([day, segs]) => (
              <span key={day} className={styles.day}>
                <b>{segs.reduce((x, y) => x + y, 0)}</b>
                {day}
              </span>
            ))}
          </div>
        </section>

        <section className={`${styles.card} ${styles.todoCard}`}>
          <h3 className={`${styles.h3} ${styles.todoTitle}`}>Needs a person</h3>
          {data && state == null
            ? buildTodo(data).map((t) => (
                <Link key={t.title} href={t.href} className={styles.todo}>
                  <span className={styles.todoDot} style={{ background: t.c }} />
                  <span className={styles.todoText}>
                    <span className={styles.todoHead}>{t.title}</span>
                    <span className={styles.todoSub}>{t.sub}</span>
                  </span>
                  <span className={styles.todoCta}>{t.cta} ›</span>
                </Link>
              ))
            : [1, 2, 3].map((k) => (
                <div key={k} className={styles.todo} aria-busy={state === "loading" || undefined}>
                  <span className={`ward-skeleton ${styles.skelTodo}`} />
                </div>
              ))}
        </section>
      </div>
    </div>
  );
}

export default Dashboard;
