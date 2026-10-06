import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";
import { USE_MOCKS } from "@/lib/time";
import styles from "./page.module.css";

// Mock mode: a role picker standing in for the login (the design's "Login & components"
// file was not in the handoff bundle). Real mode (NEXT_PUBLIC_USE_MOCKS=0): a sign-in form.
const ROLES = [
  { href: "/doctor", role: "Doctor", name: "Dr Trabelsi", sub: "Cardiology · Ward C", ini: "DT" },
  { href: "/nurse", role: "Nurse", name: "Nurse Ines", sub: "Ward C · day shift", ini: "NI" },
  { href: "/admin", role: "Admin", name: "Mme Gharbi", sub: "Administration", ini: "MG" },
  { href: "/patient", role: "Patient", name: "Amira", sub: "Bed C-12 · Ward C", ini: "AB" },
] as const;

export default function Home() {
  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.brand}>
          <div className={styles.wordmark}>
            <span className={styles.mark} />
            <span className={styles.name}>Ward</span>
          </div>
          <span className={styles.tag}>Prototype · simulated data</span>
        </header>

        {USE_MOCKS ? (
          <>
            <div className={styles.intro}>
              <h1 className={styles.title}>Choose a role</h1>
              <p className={styles.lead}>
                Doctor, nurse, admin and patient share one patient record. Pick a role to open its view. Values are
                simulated for this prototype.
              </p>
            </div>

            <nav className={styles.grid} aria-label="Roles">
              {ROLES.map((r) => (
                <Link key={r.href} href={r.href} className={styles.card}>
                  <span className={styles.avatar}>{r.ini}</span>
                  <span className={styles.who}>
                    <span className={styles.role}>{r.role}</span>
                    <span className={styles.person}>{r.name}</span>
                    <span className={styles.sub}>{r.sub}</span>
                  </span>
                  <span className={styles.chev} aria-hidden="true">
                    ›
                  </span>
                </Link>
              ))}
            </nav>
          </>
        ) : (
          <>
            <div className={styles.intro}>
              <h1 className={styles.title}>Sign in</h1>
              <p className={styles.lead}>
                Doctor, nurse, admin and patient share one patient record. Sign in to open your view. Values are
                simulated for this prototype.
              </p>
            </div>
            <LoginForm />
          </>
        )}
      </div>
    </div>
  );
}
