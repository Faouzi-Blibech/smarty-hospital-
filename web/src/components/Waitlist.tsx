"use client";

import { useT } from "@/i18n/I18nProvider";
import { useCallback, useEffect, useMemo, useState } from "react";
import { confirmAppointment, getStaff, getWaitlist, overrideUrgency } from "@/lib/api";
import { LANG_LABELS, URGENCY, deptLabel, doctorForSpecialty, noShowWord, redFlagLabel, type ClinicDoctor, urgencyWord } from "@/lib/labels";
import { daysSince, tunisDay, USE_MOCKS } from "@/lib/time";
import type { Appointment, StaffMember, Urgency } from "@/lib/types";
import { useMeState } from "@/lib/useMe";
import { AiBadge } from "./AiBadge";
import { ExamSuggestions } from "./doctor/ExamSuggestions";
import { Toast, useToast } from "./Toast";
import styles from "./Waitlist.module.css";

export interface WaitlistProps {
  /** Who is booking. Real mode: a doctor books with themself (GET /me); admin picks the specialty's doctor from GET /staff. */
  caller?: "doctor" | "admin";
  /** Show only this specialty (the chip bar then offers "All specialties"). */
  specialty?: string;
  /** Mock mode: display name of the person confirming or overriding (real mode: the signed-in user). */
  actor?: string;
  /** Mock mode: user id of that person, sent to the mock API (the real API reads the JWT). Default: admin. */
  actorId?: string;
  /** AI unavailable: rules fallback banner, no confidence scores. */
  aiFallback?: boolean;
  /** Appointment id whose "Confirm + pick slot" dialog starts open (admin screen). */
  confirmId?: string;
  /** Appointment id whose "Why?" popover starts open. */
  whyId?: string;
  /** Mock mode: doctor booked when a row's specialty has no mapped doctor. The row's specialty decides first. */
  doctorId?: string;
}

/** `label` is the stable id of a day; it is shown with tunisDay(date, lang). */
const DAYS = [
  { label: "Tue 6 Oct", date: "2026-10-06" },
  { label: "Wed 7 Oct", date: "2026-10-07" },
  { label: "Thu 8 Oct", date: "2026-10-08" },
  { label: "Fri 9 Oct", date: "2026-10-09" },
  { label: "Mon 12 Oct", date: "2026-10-12" },
];
const TIMES = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"];
const TAKEN = ["09:30", "11:00"];
const LEVELS: Urgency[] = [5, 4, 3, 2, 1];

const fin = (a: Appointment): Urgency => a.urgency_final ?? a.urgency_ai;
const cls = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export function Waitlist({
  caller = "admin",
  specialty,
  actor: mockActor = "Mme Gharbi",
  actorId,
  aiFallback = false,
  confirmId,
  whyId,
  doctorId,
}: WaitlistProps) {
  const { t, lang: uiLang } = useT();
  const dayText = (label: string) => tunisDay(`${DAYS.find((x) => x.label === label)!.date}T12:00:00Z`, uiLang);
  const [fetched, setFetched] = useState<Appointment[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Confirmed rows leave GET /appointments/waitlist, so keep them here (id to row + slot label).
  const [confirmed, setConfirmed] = useState<Record<string, { row: Appointment; slot: string }>>({});
  const [why, setWhy] = useState<string | null>(whyId ?? null);
  const [menu, setMenu] = useState<string | null>(null);
  const [dlg, setDlg] = useState<string | null>(confirmId ?? null);
  const [day, setDay] = useState("Wed 7 Oct");
  const [time, setTime] = useState("10:00");
  const [busy, setBusy] = useState(false);
  const [toast, showToast] = useToast<{ text: string; tone: "ok" | "warn" }>(4500);
  const { me, failed: meFailed } = useMeState(caller);
  // Real-mode admin: the doctors on file, to book a row with its specialty's doctor (null while loading).
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [staffFailed, setStaffFailed] = useState(false);
  useEffect(() => {
    if (USE_MOCKS || caller !== "admin") return;
    let alive = true;
    getStaff().then(
      (list) => alive && setStaff(list),
      () => {
        if (!alive) return;
        setStaff([]);
        setStaffFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [caller]);
  const actor = USE_MOCKS ? mockActor : (me?.name ?? "");

  /** The doctor a row books. Real mode never falls back to a hard-coded id: null when no doctor matches. */
  const doctorFor = (a: Appointment): ClinicDoctor | null => {
    if (USE_MOCKS) return doctorForSpecialty(a.specialty, doctorId);
    if (caller === "doctor") return me ? { id: me.id, name: me.name, specialty: a.specialty ?? "" } : null;
    const doc = staff?.find((s) => s.role === "doctor" && s.ward === a.specialty);
    return doc ? { id: doc.id, name: doc.name, specialty: doc.ward ?? "" } : null;
  };
  /** Why a row can't be booked (real mode), once the lookup has finished: load error or no matching doctor. */
  const noDoctorNote = (a: Appointment): string | null => {
    if (USE_MOCKS || doctorFor(a)) return null;
    if (caller === "doctor") return meFailed ? t("admin.wlNoAccount") : null;
    if (staffFailed) return t("admin.wlNoDoctorList");
    return staff != null ? t("admin.wlNoDoctorFor", { spec: a.specialty ?? t("admin.wlThisSpecialty") }) : null;
  };

  const load = useCallback(() => {
    setFailed(false);
    getWaitlist({ specialty, fallback: aiFallback }).then(setFetched, () => setFailed(true));
  }, [specialty, aiFallback]);
  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    if (!fetched) return [];
    const ids = new Set(fetched.map((a) => a.id));
    const kept = Object.values(confirmed)
      .map((c) => c.row)
      .filter((a) => !ids.has(a.id) && (!specialty || a.specialty === specialty));
    const list = [...fetched.filter((a) => !confirmed[a.id]), ...kept];
    return list
      .map((a) => ({ a, days: daysSince(a.created_at) }))
      .sort((x, y) => fin(y.a) - fin(x.a) || y.days - x.days);
  }, [fetched, confirmed, specialty]);

  const by = USE_MOCKS && actorId ? { by: actorId } : undefined;

  async function pickLevel(a: Appointment, n: Urgency) {
    setMenu(null);
    try {
      const upd = await overrideUrgency(a.id, n, by);
      const patch = (x: Appointment) =>
        x.id === a.id ? { ...x, ...upd, human_confirmed_by_name: upd.human_confirmed_by_name ?? (actor || null) } : x;
      setFetched((f) => f && f.map(patch));
    } catch {
      showToast({ text: t("admin.wlSaveFail"), tone: "warn" });
    }
  }

  async function confirm(a: Appointment) {
    const d = DAYS.find((x) => x.label === day)!;
    const doc = doctorFor(a);
    if (!doc) return;
    setBusy(true);
    try {
      const upd = await confirmAppointment(a.id, { slot_at: new Date(`${d.date}T${time}:00+01:00`).toISOString(), doctor_id: doc.id }, by);
      const slot = `${dayText(day)} · ${time} · ${doc.name}`;
      setConfirmed((c) => ({ ...c, [a.id]: { row: { ...a, ...upd }, slot } }));
      setDlg(null);
      showToast({ text: t("admin.wlBooked", { name: a.patient_name ?? "", day: dayText(day), time }), tone: "ok" });
    } catch (e) {
      const taken = (e as { code?: string }).code === "slot_taken";
      showToast({ text: t(taken ? "admin.wlSlotTaken" : "admin.wlConfirmFail"), tone: "warn" });
    } finally {
      setBusy(false);
    }
  }

  const dlgRow = rows.find((r) => r.a.id === dlg) ?? null;
  const dlgDoctor = dlgRow ? doctorFor(dlgRow.a) : null;
  const dlgNote = dlgRow ? noDoctorNote(dlgRow.a) : null;
  const filters = specialty
    ? [{ label: specialty, on: true }, { label: t("admin.wlAllSpecialties"), on: false }]
    : [{ label: t("admin.wlAllSpecialties"), on: true }, { label: t("admin.wlCardiology"), on: false }, { label: t("admin.wlPediatrics"), on: false }];

  return (
    <div className={styles.root}>
      {aiFallback && (
        <div role="status" className={styles.fallback}>
          <span className={styles.fallbackDiamond} />
          <span><b>{t("admin.wlAiUnavailable")}</b> {t("admin.wlAiUnavailableBody")}</span>
        </div>
      )}
      <div className={styles.bar}>
        <div className={styles.filters}>
          {filters.map((f) => (
            <span key={f.label} className={cls(styles.filter, f.on && styles.filterOn)}>{f.label}</span>
          ))}
        </div>
        <span className={styles.meta}>{t("admin.wlMeta", { n: rows.length })}</span>
        <span className={styles.grow} />
        <span className={styles.meta}>{t("admin.wlSuggestion")}</span>
      </div>
      <div className={styles.card}>
        <div className={cls(styles.grid, styles.head)}>
          <span>#</span><span>{t("admin.wlColPatient")}</span><span>{t("admin.wlColReferral")}</span><span>{t("admin.wlColUrgency")}</span><span>{t("admin.wlColRequested")}</span><span>{t("admin.wlColActions")}</span>
        </div>
        {failed && <div className={styles.error} role="alert">{t("admin.wlLoadError")} <button className={styles.why} onClick={load}>{t("admin.retry")}</button></div>}
        {!failed && !fetched && [0, 1, 2].map((i) => <div key={i} className={cls("ward-skeleton", styles.skelRow)} />)}
        {fetched && rows.length === 0 && <div className={styles.empty}>{t("admin.wlEmpty")}</div>}
        {rows.map(({ a, days }, i) => {
          const f = fin(a);
          const U = URGENCY[f];
          const conf = confirmed[a.id];
          const isOver = a.urgency_final != null;
          const source = aiFallback ? "rules" : a.triage.source;
          const pct = a.triage.confidence != null ? Math.round(a.triage.confidence * 100) : null;
          const ns = Math.round((a.no_show_prob ?? 0) * 100);
          const lang = a.lang ?? "fr"; // language of the referral text (data), not the interface
          return (
            <div key={a.id} className={cls(styles.grid, styles.row, conf && styles.rowConfirmed)}>
              <span className={styles.rank}>{i + 1}</span>
              <div className={cls(styles.col, styles.who)}>
                <span className={styles.name}>{a.patient_name}</span>
                <span className={styles.sub}><bdi>{a.patient_age}</bdi> · {deptLabel(a.specialty, t)}</span>
              </div>
              <div className={cls(styles.col, styles.ref)}>
                <div className={styles.refLine}>
                  <span className={styles.lang}>{LANG_LABELS[lang] ?? lang}</span>
                  <span dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} className={styles.text}>{a.referral_text}</span>
                </div>
                <div className={styles.flags}>
                  {a.triage.red_flags.map((fl) => (
                    <span key={fl} className={styles.flag}><span className={styles.flagDot} />{redFlagLabel(fl, t)}</span>
                  ))}
                </div>
                {caller === "doctor" ? <ExamSuggestions
                    appointmentId={a.id}
                    patientId={a.patient_id}
                    actorId={actorId ?? "u-0001"}
                    onChanged={(exams) => {
                      const n = (st: string) => exams.filter((e) => e.status === st).length;
                      const counts = { exams_total: n("ordered") + n("done"), exams_done: n("done"), exams_suggested: n("suggested") };
                      setFetched((f) => f && f.map((x) => (x.id === a.id ? { ...x, ...counts } : x)));
                    }}
                  /> : null}
              </div>
              <div className={cls(styles.col, styles.urgency)}>
                <div className={styles.urgencyLine}>
                  <span className={styles.urgPill} style={{ background: U.bg, color: U.fg }}>
                    <span className={styles.urgNum}>{f}</span>{urgencyWord(f, t)}
                  </span>
                  <button className={styles.why} aria-expanded={why === a.id} onClick={() => { setWhy(why === a.id ? null : a.id); setMenu(null); }}>{t("admin.wlWhy")}</button>
                </div>
                <AiBadge
                  variant="split"
                  source={source}
                  detail={pct != null ? `${pct}%` : undefined}
                  state={conf ? "confirmed" : isOver ? "overridden" : "needs_review"}
                  stateLabel={conf ? (actor ? t("admin.wlConfirmedBy", { name: actor }) : t("admin.wlConfirmed")) : undefined}
                />
                {isOver && (
                  <span className={styles.overBy}><span className={styles.overDot} /><span>{(a.human_confirmed_by_name ?? actor) ? t("admin.wlOverrideBy", { name: a.human_confirmed_by_name ?? actor, n: a.urgency_ai }) : t("admin.wlOverride", { n: a.urgency_ai })}</span></span>
                )}
                {a.triage?.scale ? (
                  <span className={styles.urgMeta}>
                    {a.triage.scale.level} · {a.triage.scale.name}{a.triage.scale.confirmed ? "" : ` ${t("admin.wlToConfirm")}`}
                  </span>
                ) : null}
                {a.exams_total ? (
                  <span className={styles.urgMeta}>{t(a.exams_done === a.exams_total ? "admin.wlExamsIn" : "admin.wlExams", { done: a.exams_done ?? 0, total: a.exams_total })}</span>
                ) : a.exams_suggested ? (
                  <span className={styles.urgMeta}>{t("admin.wlExamsSuggested", { n: a.exams_suggested })}</span>
                ) : null}
                {why === a.id && (
                  <div role="dialog" className={styles.popover}>
                    <span className={styles.popTitle}>{t("admin.wlWhyTitle", { n: a.urgency_ai })}</span>
                    {a.triage.reasons.map((re) => (
                      <div key={re} className={styles.reason}><span className={styles.reasonDot} /><span>{re}</span></div>
                    ))}
                    <div className={styles.popFoot}>
                      {source === "rules" ? t("admin.wlSrcRules") : pct != null ? t("admin.wlSrcConf", { pct }) : t("admin.wlSrcModel")} {t("admin.wlNotValidated")}
                    </div>
                  </div>
                )}
              </div>
              <div className={cls(styles.col, styles.when)}>
                <span className={styles.date}>{tunisDay(a.created_at, uiLang)}</span>
                <span className={styles.small}>{t("admin.wlWaiting", { n: days })}</span>
                <span className={cls(styles.small, styles.ns)}>{t("admin.wlNoShow")} <b>{ns}%</b> · {noShowWord(a.no_show_prob, t)}</span>
              </div>
              <div className={cls(styles.col, styles.actions)}>
                {conf ? (
                  <div className={styles.confirmedBox}><b>✓ {actor ? t("admin.wlConfirmedBy", { name: actor }) : t("admin.wlConfirmed")}</b><span>{conf.slot}</span><span>{t("admin.wlReminderLine")}</span></div>
                ) : (
                  <div className={styles.btnCol}>
                    <button className={styles.override} onClick={() => { setMenu(menu === a.id ? null : a.id); setWhy(null); }}>{t("admin.wlOverrideBtn")} ▾</button>
                    <button className={styles.confirmBtn} disabled={!doctorFor(a)} onClick={() => { setDlg(a.id); setWhy(null); setMenu(null); }}>{t("admin.wlConfirmPick")}</button>
                    {noDoctorNote(a) ? <span className={styles.small}>{noDoctorNote(a)}</span> : null}
                  </div>
                )}
                {menu === a.id && (
                  <div className={styles.menu}>
                    <span className={styles.menuHead}>{t("admin.wlSetUrgency")}</span>
                    {LEVELS.map((n) => (
                      <button key={n} className={cls(styles.level, n === f && styles.levelOn)} onClick={() => pickLevel(a, n)}>
                        <span className={styles.levelNum}>{n}</span>{urgencyWord(n, t)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {dlgRow && (
        <div className={styles.scrim}>
          <div role="dialog" aria-modal="true" className={styles.dialog}>
            <div className={styles.dlgHead}>
              <span className={styles.dlgKicker}>{t("admin.wlConfirmAppt")}</span>
              <span className={styles.dlgName}>{dlgRow.a.patient_name}</span>
              <span className={styles.dlgSub}>{t("admin.wlDlgSub", { n: fin(dlgRow.a), word: urgencyWord(fin(dlgRow.a), t), spec: dlgRow.a.specialty ?? "", days: dlgRow.days })}</span>
            </div>
            <div className={styles.dlgBody}>
              <div className={styles.field}>
                <span className={styles.label}>{t("admin.wlDay")}</span>
                <div className={styles.chips}>
                  {DAYS.map((d) => (
                    <button key={d.label} className={cls(styles.pick, d.label === day && styles.pickOn)} onClick={() => setDay(d.label)}>{dayText(d.label)}</button>
                  ))}
                </div>
              </div>
              <div className={styles.field}>
                <span className={styles.label}>{t("admin.wlTime")}</span>
                <div className={styles.times}>
                  {TIMES.map((tm) => {
                    const taken = TAKEN.includes(tm);
                    return (
                      <button key={tm} disabled={taken} className={cls(styles.pick, styles.time, taken ? styles.pickTaken : tm === time && styles.pickOn)} onClick={() => setTime(tm)}>{tm}</button>
                    );
                  })}
                </div>
                <span className={styles.small}>{t("admin.wlStruck")}</span>
              </div>
              <label className={styles.field}>
                <span className={styles.label}>{t("admin.wlDoctor")}</span>
                <span className={styles.select}>{dlgDoctor ? <>{dlgDoctor.name} · {deptLabel(dlgDoctor.specialty, t)}</> : (dlgNote ?? "…")}<span>▾</span></span>
              </label>
              <div className={styles.info}>
                <span className={styles.infoDot} />
                <span><b>{t("admin.wlReminderInfo")}</b> {t("admin.wlReminderInfoBody")}</span>
              </div>
            </div>
            <div className={styles.dlgFoot}>
              <button className={styles.cancel} onClick={() => setDlg(null)}>{t("admin.cancel")}</button>
              <button className={styles.go} disabled={busy || !dlgDoctor} onClick={() => confirm(dlgRow.a)}>{t("admin.wlConfirmAt", { day: dayText(day), time })}</button>
            </div>
          </div>
        </div>
      )}
      {toast && <Toast size="sm" tone={toast.tone} placement="absolute" className={styles.toast}>{toast.text}</Toast>}
    </div>
  );
}

export default Waitlist;
