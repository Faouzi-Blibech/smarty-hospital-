// Vitals series. Amira (p-0001): the doctor chart's 25 hourly points (HR, SP, TP, NW).
// Omar (p-0002): the nurse detail tiles' 7 points. Others: latest reading from `BEDS`.
// The doctor chart reads NW as the max per 2-hour window (lib/series news2Every2h), so each
// odd-hour score is ≤ the next even-hour one: the 13 dots stay the design's every-other-hour values.
import type { Vital } from "@/lib/types";
import { secondsAgo } from "./time";

const HOUR = 3600;

const HR = [74, 72, 76, 78, 80, 79, 82, 85, 84, 88, 92, 98, 104, 110, 118, 112, 106, 102, 99, 97, 95, 96, 98, 97, 96];
const SP = [97, 97, 96, 97, 97, 96, 97, 96, 96, 96, 96, 96, 96, 95, 96, 96, 95, 95, 95, 94, 94, 94, 93, 93, 93];
const TP = [36.8, 36.9, 36.9, 37.0, 37.1, 37.0, 37.2, 37.4, 37.5, 37.6, 37.8, 38.0, 38.1, 37.9, 37.8, 37.7, 37.6, 37.6, 37.5, 37.5, 37.4, 37.5, 37.6, 37.5, 37.4];
const NW = [1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 5, 5, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5];

const amira: Vital[] = HR.map((hr, i) => ({
  ts: i === HR.length - 1 ? secondsAgo(8) : secondsAgo((HR.length - 1 - i) * HOUR),
  hr,
  spo2: SP[i],
  temp: TP[i],
  nurse_id: null,
  news2: NW[i],
  source: "device",
}));

const O_HR = [96, 100, 104, 110, 118, 124, 130];
const O_SP = [94, 93, 92, 91, 90, 89, 88];
const O_TP = [37.6, 37.8, 37.9, 38.1, 38.2, 38.4, 38.4];
const O_RR = [17, 18, 19, 20, 21, 22, 22];
const O_SYS = [112, 110, 109, 108, 108, 107, 108];
const O_DIA = [70, 69, 68, 67, 66, 66, 66];
const O_NW = [3, 4, 4, 5, 5, 6, 7];

const omar: Vital[] = O_HR.map((hr, i) => ({
  ts: i === O_HR.length - 1 ? secondsAgo(12) : secondsAgo((O_HR.length - 1 - i) * 20 * 60),
  hr,
  spo2: O_SP[i],
  temp: O_TP[i],
  nurse_id: null,
  news2: O_NW[i],
  source: "device",
  rr: O_RR[i],
  bp_sys: O_SYS[i],
  bp_dia: O_DIA[i],
}));

const one = (ago: number, hr: number, spo2: number, temp: number, news2: number): Vital[] => [
  { ts: secondsAgo(ago), hr, spo2, temp, nurse_id: null, news2, source: "device" },
];

/** Oldest first, per patient id. */
export const VITALS: Record<string, Vital[]> = {
  "p-0001": amira,
  "p-0002": omar,
  "p-0003": one(20, 92, 95, 37.9, 3),
  "p-0004": one(15, 84, 96, 37.2, 2),
  "p-0005": one(9, 78, 97, 36.9, 1),
  "p-0006": one(360, 74, 97, 36.8, 0),
  "p-0007": one(5, 70, 98, 36.7, 0),
};
