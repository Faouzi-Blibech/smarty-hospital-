"use client";

// Nurse / Patient detail (/nurse/patients/[id]): critical banner, vitals tiles with
// NEWS2 points, today's doses, read-only prescriptions and notes.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { pausedAt } from "@/components/doctor/PatientList";
import { LiveBanner } from "@/components/LiveBanner";
import { ErrorCard } from "@/components/shared/ErrorCard";
import { NotesPanel } from "@/components/shared/NotesPanel";
import { trendOf } from "@/components/shared/VitalsChart";
import { Toast, useToast } from "@/components/Toast";
import { addNote, getDoses, getNotes, getPatient, getPrescriptions, getVitals } from "@/lib/api";
import { useDemoFlags } from "@/lib/demo";
import { level, PULSE } from "@/lib/news2";
import { dayLabel, now, tunisDate, tunisTime, tunisTimeSeconds } from "@/lib/time";
import type { Alert, Dose, Note, Patient, Prescription, Vital } from "@/lib/types";
import { DosePill } from "./DosePill";
import {
  doseView,
  hrPoints,
  NURSE_ID,
  NURSE_NAME,
  rrPoints,
  spark,
  spo2Points,
  sysPoints,
  tempPoints,
} from "./nurse";
import { useWardAlerts } from "./useWardAlerts";
import styles from "./NursePatientDetail.module.css";

interface Data {
  patient: Patient;
  vitals: Vital[];
  prescriptions: Prescription[];
  doses: Dose[];
  notes: Note[];
}

/** Readings shown per tile (the design's sparklines have 7 points). */
const TILE_POINTS = 7;

interface Tile {
  k: string;
  v: string;
  u: string;
  pts: number | null;
  arrow: string;
  arrowColor: string;
  trend: string;
  spark: string;
}

function tile(
  k: string,
  u: string,
  vitals: Vital[],
  pick: (v: Vital) => number | null | undefined,
  points: (v: number) => number,
  threshold: number,
  display: (v: Vital, value: number) => string,
): Tile {
  const rows = vitals.filter((v) => pick(v) != null).slice(-TILE_POINTS);
  if (rows.length === 0) return { k, v: "—", u, pts: null, arrow: "", arrowColor: "var(--muted)", trend: "No reading", spark: "" };
  const values = rows.map((v) => pick(v) as number);
  const last = rows[rows.length - 1];
  const value = values[values.length - 1];
  const pts = points(value);
  const t = trendOf(values, threshold);
  const arrowColor = t.word === "steady" ? "var(--muted)" : pts >= 2 ? "var(--news-crit-fg)" : "var(--news-high-fg)";
  return {
    k,
    v: display(last, value),
    u,
    pts,
    arrow: t.arrow,
    arrowColor,
    trend: `${t.word} · ${tunisTimeSeconds(last.ts)}`,
    spark: spark(values),
  };
}

function tiles(vitals: Vital[]): Tile[] {
  return [
    tile("Heart rate", "bpm", vitals, (v) => v.hr, hrPoints, 10, (_, x) => String(x)),
    tile("SpO2", "%", vitals, (v) => v.spo2, spo2Points, 2, (_, x) => String(x)),
    tile("Temperature", "°C", vitals, (v) => v.temp, tempPoints, 0.5, (_, x) => x.toFixed(1)),
    tile("Resp. rate", "/min", vitals, (v) => v.rr, rrPoints, 3, (_, x) => String(x)),
    tile("Blood pressure", "", vitals, (v) => v.bp_sys, sysPoints, 10, (v, x) => `${x}/${v.bp_dia ?? "—"}`),
  ];
}

const tileLevel = (pts: number) => (pts >= 3 ? level(7) : pts >= 1 ? level(2) : level(0));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function NursePatientDetail({ id }: { id: string }) {
  const flags = useDemoFlags();
  const router = useRouter();
  const { alerts, ack, busy, notice } = useWardAlerts();
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [openedAt] = useState(() => tunisTime(now().toISOString()));
  const [noteError, showNoteError] = useToast<string>();

  const load = useCallback(() => {
    setFailed(false);
    const today = tunisDate(now().toISOString());
    Promise.all([getPatient(id), getVitals(id), getPrescriptions(id), getDoses(id, { date: today }), getNotes(id)])
      .then(([patient, vitals, prescriptions, doses, notes]) => setData({ patient, vitals, prescriptions, doses, notes }))
      .catch(() => setFailed(true));
  }, [id]);

  useEffect(load, [load]);

  const onAddNote = useCallback(
    async (text: string) => {
      try {
        const note = await addNote(id, text, { by: NURSE_ID });
        setData((d) => (d ? { ...d, notes: [note, ...d.notes] } : d));
      } catch (e) {
        showNoteError("Couldn’t save the note. Your text is still in the box — try again.");
        throw e; // keeps the draft in NotesPanel
      }
    },
    [id, showNoteError],
  );

  const state = flags.state === "error" || failed ? "error" : flags.state === "loading" || !data ? "loading" : null;
  const ref = now();
  const p = data?.patient;
  const name = p ? `${p.first_name} ${p.last_name}` : "";

  const news2Alert: Alert | undefined = (alerts ?? [])
    .filter((a) => a.patient_id === id && a.kind === "news2")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const critical = !!p && (p.latest_news2 ?? 0) >= 7;
  const lv = level(p?.latest_news2);

  return (
    <div className={styles.page}>
      <div className={styles.crumbs}>
        <Link href="/nurse" className={styles.crumbLink}>
          Ward board
        </Link>
        <span>/</span>
        <span dir="auto" className={styles.crumbHere}>
          {p ? `Bed ${p.bed ?? "—"} · ${name}` : "Patient"}
        </span>
        <span className={styles.spacer} />
        <span className={styles.audit}>
          <span className={styles.lock} />
          Access logged · {NURSE_NAME} · {openedAt}
        </span>
      </div>
      {!flags.live ? (
        <LiveBanner className={styles.banner}>Values frozen at {pausedAt()}. Check patients in person if this lasts.</LiveBanner>
      ) : null}

      {state === "error" ? (
        <ErrorCard
          title="Couldn’t load this patient."
          onRetry={load}
          secondaryLabel="Back to ward board"
          onSecondary={() => router.push("/nurse")}
        />
      ) : state === "loading" || !data || !p ? (
        <div className={styles.skelCard} aria-busy="true">
          <span className="ward-skeleton" style={{ height: 34, width: 320 }} />
          <span className="ward-skeleton" style={{ height: 14, width: 260 }} />
          <span className="ward-skeleton" style={{ height: 120, width: "100%" }} />
          <span className="ward-skeleton" style={{ height: 120, width: "100%" }} />
        </div>
      ) : (
        <>
          {critical ? (
            <div
              role="alert"
              className={styles.critical}
              style={{ animation: flags.live && !news2Alert?.acked_by ? PULSE : "none" }}
            >
              <span className={styles.critScore}>{p.latest_news2}</span>
              <div className={styles.critText}>
                <span className={styles.critTitle}>
                  NEWS2 {p.latest_news2} · {lv.word}
                </span>
                <span className={styles.critSub}>
                  {news2Alert
                    ? `${p.attending_doctor_name ?? "The attending doctor"} was notified automatically at ${tunisTime(news2Alert.created_at)}. `
                    : ""}
                  Stay with the patient and follow the escalation protocol.
                </span>
              </div>
              {news2Alert && !news2Alert.acked_by ? (
                <button
                  type="button"
                  className={styles.critAck}
                  disabled={busy.has(news2Alert.id)}
                  onClick={() => void ack(news2Alert.id)}
                >
                  Acknowledge
                </button>
              ) : news2Alert?.acked_by ? (
                <span className={styles.critAcked}>
                  ✓ Acknowledged by {news2Alert.acked_by_name ?? news2Alert.acked_by}
                  {news2Alert.acked_at ? ` · ${tunisTime(news2Alert.acked_at)}` : ""}
                </span>
              ) : null}
            </div>
          ) : null}

          <section className={styles.header}>
            <div className={styles.facts}>
              <h2 dir="auto" className={styles.name}>
                {name}
              </h2>
              <div className={styles.factLine}>
                <span>
                  {p.age} · {p.sex === "M" ? "Male" : "Female"}
                </span>
                <span className={styles.dotSep}>·</span>
                <span className={styles.nowrap}>
                  <b>Bed {p.bed ?? "—"}</b>
                  {p.device_id ? (
                    <>
                      {" · "}
                      <span className={styles.mono}>{p.device_id}</span>{" "}
                      {p.device_online === false ? (
                        <span className={styles.offline}>● offline</span>
                      ) : p.device_online ? (
                        <span className={styles.online}>● online</span>
                      ) : null}
                    </>
                  ) : null}
                </span>
                {p.attending_doctor_name ? (
                  <>
                    <span className={styles.dotSep}>·</span>
                    <span>
                      Attending: <b>{p.attending_doctor_name}</b>
                    </span>
                  </>
                ) : null}
              </div>
            </div>
            <div className={styles.allergy}>
              <span className={styles.allergyLabel}>Allergies</span>
              <span className={styles.allergyValue}>
                {p.allergies.length ? cap(p.allergies.join(", ")) : "No known allergies"}
              </span>
              {p.allergy_notes ? <span className={styles.allergyNote}>{p.allergy_notes}</span> : null}
            </div>
          </section>

          <div className={styles.tiles} style={{ opacity: flags.live ? 1 : 0.55 }}>
            {tiles(data.vitals).map((t) => {
              const tl = tileLevel(t.pts ?? 0);
              return (
                <div key={t.k} className={styles.tile} style={{ borderTopColor: t.pts == null ? "var(--line)" : tl.edge }}>
                  <div className={styles.tileHead}>
                    <span className={styles.tileName}>{t.k}</span>
                    {t.pts != null ? (
                      <span className={styles.pts} style={{ background: tl.bg, color: tl.fg }}>
                        +{t.pts} pts
                      </span>
                    ) : null}
                  </div>
                  <span className={styles.tileValue}>
                    <span className={styles.tileNum}>{t.v}</span>
                    {t.u ? <span className={styles.tileUnit}>{t.u}</span> : null}
                    <span className={styles.tileArrow} style={{ color: t.arrowColor }}>
                      {t.arrow}
                    </span>
                  </span>
                  <svg viewBox="0 0 100 28" preserveAspectRatio="none" className={styles.spark} aria-hidden="true">
                    {t.spark ? (
                      <polyline points={t.spark} fill="none" stroke="var(--ink)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
                    ) : null}
                  </svg>
                  <span className={styles.tileTrend}>{t.trend}</span>
                </div>
              );
            })}
          </div>

          <div className={styles.columns}>
            <div className={styles.col}>
              <section className={styles.card}>
                <h3 className={styles.cardTitle}>Today’s doses</h3>
                {data.doses.length === 0 ? <span className={styles.none}>No doses today.</span> : null}
                {[...data.doses]
                  .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
                  .map((d) => {
                    const v = doseView(d, {
                      ref,
                      prescriptions: new Map(data.prescriptions.map((r) => [r.id, r])),
                      alerts: alerts ?? [],
                    });
                    return (
                      <div key={d.id} className={styles.doseRow}>
                        <span className={styles.doseTime}>{v.time}</span>
                        <div className={styles.doseMed}>
                          <span className={styles.doseName}>{v.med}</span>
                          <span className={styles.doseSub} style={v.subAlert ? { color: "var(--danger)" } : undefined}>
                            {v.sub}
                          </span>
                        </div>
                        <DosePill status={v.status} text={v.statusText} />
                      </div>
                    );
                  })}
              </section>
              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <h3 className={styles.cardTitle}>Prescriptions</h3>
                  <span className={styles.readOnly}>Read-only · changed by the doctor</span>
                </div>
                {data.prescriptions.length === 0 ? <span className={styles.none}>No active prescriptions.</span> : null}
                {data.prescriptions.flatMap((rx) =>
                  rx.items.map((item, i) => (
                    <div key={`${rx.id}-${i}`} className={styles.rxRow}>
                      <span className={styles.rxMed}>{item.med}</span>
                      <span className={styles.rxTimes}>{item.times.join(", ")}</span>
                      <span className={styles.rxSlot}>{item.slot != null ? `Slot ${item.slot}` : "Reminder only"}</span>
                    </div>
                  )),
                )}
              </section>
            </div>
            <NotesPanel
              notes={data.notes}
              onAdd={onAddNote}
              placeholder="Add a note — any language"
              hint={null}
              rows={3}
              variant="nurse"
              now={ref}
              timeLabel={(iso) => (dayLabel(iso, ref) === "Today" ? tunisTime(iso) : `${dayLabel(iso, ref)} ${tunisTime(iso)}`)}
            />
          </div>
        </>
      )}
      {notice || noteError ? <Toast tone="warn">{notice ?? noteError}</Toast> : null}
    </div>
  );
}

export default NursePatientDetail;
