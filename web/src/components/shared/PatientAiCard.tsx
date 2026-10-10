"use client";

// On a patient page: a link that opens the AI assistant on this patient, and (doctor with write access) an upload
// that attaches a report to the case. The assistant reads the text of PDF and text reports; images are stored only.
import Link from "next/link";
import { useRef, useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import { uploadReport } from "@/lib/api";
import styles from "./PatientAiCard.module.css";

export function PatientAiCard({ patientId, role, canUpload = false }: { patientId: string; role: "doctor" | "nurse"; canUpload?: boolean }) {
  const { t } = useT();
  return (
    <section className={styles.card}>
      <Link href={`/${role}/assistant?patient=${encodeURIComponent(patientId)}`} className={styles.ask}>
        {t("shared.asstAskAbout")} <span className="flip">→</span>
      </Link>
      {role === "doctor" && canUpload ? <ReportUpload patientId={patientId} /> : null}
    </section>
  );
}

function ReportUpload({ patientId }: { patientId: string }) {
  const { t } = useT();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const fileRef = useRef<HTMLInputElement>(null);

  async function send() {
    if (!file || state === "busy") return;
    setState("busy");
    try {
      await uploadReport(patientId, file, title.trim());
      setState("done");
      setFile(null);
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      setState("error");
    }
  }

  return (
    <div className={styles.report}>
      <b className={styles.head}>{t("shared.reportHeading")}</b>
      <span className={styles.meta}>{t("shared.reportHint")}</span>
      <div className={styles.row}>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.txt,application/pdf,image/jpeg,image/png,text/plain"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setState("idle");
          }}
          aria-label={t("shared.reportHeading")}
        />
        <input dir="auto" className={styles.title} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)}
          placeholder={t("shared.reportTitlePlaceholder")} />
        <button type="button" className={styles.btn} disabled={!file || state === "busy"} onClick={send}>
          {state === "busy" ? t("shared.reportUploading") : t("shared.reportUpload")}
        </button>
      </div>
      {state === "done" ? <span className={styles.ok}>{t("shared.reportDone")}</span> : null}
      {state === "error" ? <span className={styles.warn}>{t("shared.reportError")}</span> : null}
    </div>
  );
}

export default PatientAiCard;
