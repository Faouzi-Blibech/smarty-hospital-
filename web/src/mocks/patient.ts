// Patient app extras (NOT IN CONTRACT): the freed-slot offer and the after-discharge plan.
// Synthetic, copied from Ward Patient.dc.html.
import type { HomeCarePlan, SlotOffer } from "@/lib/types";
import { at } from "./time";

/** "An earlier appointment is available": Wed 7 Oct 10:00 instead of Amira's Mon 12 Oct (a-0009). */
export const OFFERS: SlotOffer[] = [
  {
    id: "of-0001",
    appointment_id: "a-0009",
    slot_at: at("2026-10-07", "10:00"),
    doctor_id: "u-0001",
    doctor_name: "Dr Trabelsi",
    room: "Cardiology, Room 4",
    status: "open",
    expires_at: at("2026-10-05", "11:40"),
  },
];

/** "Welcome home, Amira": the design's steps and home medicines. */
export const HOME_CARE: Record<string, HomeCarePlan> = {
  "p-0001": {
    patient_id: "p-0001",
    discharged_at: at("2026-10-08", "11:00"),
    ward_label: "Ward C",
    follow_up: {
      title: "Follow-up requested — the hospital will confirm the date",
      steps: [
        { title: "Requested · Thu 8 Oct", sub: "Created automatically when you went home", state: "done" },
        { title: "Hospital confirms the date", sub: "Usually within 3 days · we’ll message you", state: "next" },
        { title: "Reminder 24 h before", sub: "Telegram and email", state: "pending" },
      ],
    },
    medicines: [
      { when: "Morning", name: "Aspirin 100mg", sub: "With breakfast · every day" },
      { when: "Evening", name: "Warfarin 5mg", sub: "20:00 · blood test on Wed 14 Oct" },
      { when: "If needed", name: "Paracetamol 500mg", sub: "For fever or pain · max 4 a day" },
    ],
    desk_phone: "+216 71 000 000",
    emergency_number: "190",
  },
};
