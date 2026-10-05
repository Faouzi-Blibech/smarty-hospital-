# Hedi (HW-A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the bedside unit firmware: sensors, MQTT, offline schedule and reminders, RFID nurse mode, carousel dose flow and LVGL screens. Also build the device simulator that unblocks the team, plus the no-show model.

**Architecture:**
- Hardware-free logic (ring buffer, schedule parsing, dose state machine) lives in `firmware/lib/` and is unit-tested on the laptop with `pio test -e native`.
- Peripheral modules in `firmware/src/` are thin wrappers around libraries.
- `main.cpp` runs a cooperative loop, with no RTOS tasks except LVGL's tick.
- The simulator (`simulator/`) speaks exactly the same MQTT contract.

**Tech stack:** ESP32 DevKit V1, PlatformIO (Arduino), LVGL 9 + TFT_eSPI, PubSubClient, ArduinoJson 7, RTClib, SparkFun MAX3010x, Adafruit MLX90614, MFRC522, AccelStepper, Preferences (NVS) · Python 3.12 + paho-mqtt 2 (simulator) · scikit-learn offline only (no-show training).

**Spec:** `docs/superpowers/specs/2026-10-05-ward-foundation-design.md` · read also `CLAUDE.md`, `docs/architecture.md` §5, `docs/contracts/mqtt-topics.md` (**your** contract; you are its device-side owner), and `firmware/PINMAP.md`.

**You are:** Hedi, hardware person, HW-A, **Patient role owner**. The patient experience on the device must work end-to-end in the demo: schedule arrives, the dose reminder fires, the carousel turns, the pill is taken, and call-nurse works. Wali may swap lanes with you; see `CLAUDE.md`.

## Global Constraints

- MQTT contract v1.0 is frozen. Payloads are JSON ≤ 1024 bytes, `ts` = epoch seconds UTC from the DS3231, and every device→server message carries `msg_id`. Topics are `hospital/device/{device_id}/{vitals,events,status,schedule,command}`. `schedule` and `status` are retained.
- `msg_id` increases monotonically across reboots. To avoid wearing out flash, persist it to NVS **every 50 messages**, and on boot start at `stored + 50`.
- Reminders must fire with Wi-Fi off: the schedule lives in NVS and time comes from the RTC (which keeps UTC; display = UTC+1, Africa/Tunis, no DST).
- Ring buffer: **128 entries × 240 bytes** in RAM (~30 KB). When it's full, drop the oldest entry. Replay it on reconnect before sending live data.
- GPIO 34–39 are input-only and have no internal pull-ups.
- You own `firmware/` (except that `PINMAP.md` is co-owned with Wali), `simulator/`, and `backend/app/ai/no_show/`.
- No AI attribution in commits/PRs. Branches: `hedi/<feature>`. Conventional Commits.

## Review Focus

1. **Reboot mid-schedule:** after a power cycle with no Wi-Fi, the next dose must still fire at the right local time from the NVS schedule and the RTC (Task 6 test `test_next_dose_after_reboot` + a manual check).
2. **Stale/duplicate retained schedule:** the broker re-delivers the retained schedule on every reconnect. Same or lower `schedule_version` → ignore it and send no second `schedule_ack` storm (Task 5 test `test_ignores_older_version`).
3. **Midnight wrap:** at 23:50 the next dose is 08:00 *tomorrow*, and a dose at 00:05 fires after midnight (Task 5 test `test_next_dose_wraps_midnight`).
4. **Pill removed before the rotation finishes, or IR stuck LOW:** `dose_taken` must only count a pickup *after* `dose_dispensed`. An IR sensor already blocked at dispense time does not count as taken (Task 6 test `test_ir_already_blocked_not_taken`).
5. **Buffer overflow during a long outage:** with more than 128 messages queued, the oldest are dropped, the newest kept, and the order preserved on replay (Task 4 test `test_overflow_keeps_newest`).

---

## Interfaces you PROVIDE

- **To Wali and Faouzi:** MQTT traffic per `mqtt-topics.md`, from both the real device and `simulator/sim.py`. The simulator CLI below is a contract with your teammates; keep the flags stable:

```
python simulator/sim.py --device bsu-001 --patient p-0001 [--host localhost] [--interval 5]
                        [--scenario normal|abnormal|call_nurse|dose_flow|offline_replay]
```

  - `normal`: normal vitals every `--interval` s
  - `abnormal`: after 3 normal readings, SpO2 88 / HR 130 / temp 38.6 (NEWS2 ≥ 7)
  - `call_nurse`: one `call_nurse` event, then normal vitals
  - `dose_flow`: obeys the received schedule plus `dispense_now`: `dose_dispensed`, then after 5 s `dose_taken {method:"ir"}`
  - `offline_replay`: publishes 20 buffered vitals with past `ts` and increasing `msg_id`, then live data. It also sends 3 of the 20 twice, to exercise deduplication.
  - In **all** scenarios the simulator replies `schedule_ack` to a new schedule and prints any `command`.

- **To Faouzi/Wali (Day 3):** `backend/app/ai/no_show/` exposes

```python
def predict_no_show(features: dict) -> float          # 0..1; falls back to 0.20 on any error
def rank_backfill(candidates: list[dict]) -> list[dict]
    # candidates: {"appointment_id", "urgency": int, "no_show_prob": float, "created_at": str}
    # sort: urgency desc, no_show_prob asc, created_at asc
```

## Interfaces you CONSUME

- **From Wali:** the retained `schedule` and the `command` messages (from Day 2; until then, publish them by hand with `mosquitto_pub`, see below). Nurse RFID UIDs come from the seed: nurse `u-0002` = `04A1B2C3`. Program one of your cards to report that UID, or tell Wali your card's real UID so he puts it in the seed.
- **From Wali:** the wiring per `PINMAP.md`, plus the carousel mechanism (Day 2).

## Mocks to use until the real thing is ready

| You need | Until | Use |
|---|---|---|
| Server schedule | Day 2 | `mosquitto_pub -h <laptop> -r -t hospital/device/bsu-001/schedule -f simulator/scenarios/schedule_example.json` |
| Commands | Day 2 | `mosquitto_pub -t hospital/device/bsu-001/command -m '{"type":"dispense_now","dose_id":"d-000123"}'` |
| See what you publish | always | `mosquitto_sub -h <laptop> -t 'hospital/#' -v` |
| Missing sensor | until delivered | return `null` for that field; the simulator covers the demo |

---

## Day 0 — Mon 10-05 (afternoon)

### Task 1: Simulator v1 (unblocks the team today)

**Files:**
- Modify: `simulator/sim.py`
- Create: `simulator/payloads.py`, `simulator/scenarios/schedule_example.json`, `simulator/test_payloads.py`

- [ ] **Step 1: Move payload builders into pure functions and test them**

```python
# simulator/test_payloads.py
from payloads import vitals, event, MsgCounter

def test_vitals_shape():
    c = MsgCounter()
    v = vitals(c, "p-0001", hr=80, spo2=98, temp=36.9)
    assert set(v) == {"msg_id", "ts", "patient_id", "hr", "spo2", "temp"}
    assert v["msg_id"] == 1 and isinstance(v["ts"], int)

def test_vitals_nurse_optional():
    v = vitals(MsgCounter(), "p-0001", 80, 98, 36.9, nurse_rfid="04A1B2C3")
    assert v["nurse_rfid"] == "04A1B2C3"

def test_event_dose_taken():
    e = event(MsgCounter(), "dose_taken", dose_id="d-000123", method="ir")
    assert e["type"] == "dose_taken" and e["dose_id"] == "d-000123" and e["method"] == "ir"

def test_msg_ids_increase():
    c = MsgCounter(); a = vitals(c, "p", 1, 1, 1.0); b = event(c, "call_nurse")
    assert b["msg_id"] == a["msg_id"] + 1
```

Run: `cd simulator && pip install pytest && pytest -q`, expected FAIL (no module `payloads`).

- [ ] **Step 2: Implement `payloads.py`**

```python
# simulator/payloads.py
import time

class MsgCounter:
    def __init__(self, start: int = 0):
        self.n = start
    def next(self) -> int:
        self.n += 1
        return self.n

def vitals(c: MsgCounter, patient_id, hr, spo2, temp, nurse_rfid=None, ts=None) -> dict:
    p = {"msg_id": c.next(), "ts": int(ts if ts is not None else time.time()), "patient_id": patient_id,
         "hr": hr, "spo2": spo2, "temp": temp}
    if nurse_rfid:
        p["nurse_rfid"] = nurse_rfid
    return p

def event(c: MsgCounter, type_: str, ts=None, **extra) -> dict:
    return {"msg_id": c.next(), "ts": int(ts if ts is not None else time.time()), "type": type_, **extra}
```

- [ ] **Step 3: Scenarios and subscription in `sim.py`:**
  - Add `--scenario` (spec above).
  - Subscribe to `{base}/schedule` and `{base}/command`.
  - On a schedule with a higher `schedule_version`, store it and publish `schedule_ack`.
  - On `dispense_now` in `dose_flow`, publish `dose_dispensed`, wait 5 s, then publish `dose_taken {method:"ir"}`.
  - On `alert`/`message`, print it.
  - Add `simulator/scenarios/schedule_example.json`, an exact copy of the `schedule` example in the contract.
- [ ] **Step 4:** Run against the compose broker. `mosquitto_sub -t 'hospital/#' -v` shows each scenario. Commit `feat(simulator): scenarios, schedule ack, dose flow`.

**Day 0 done when:** Wali and Faouzi can run `python simulator/sim.py --scenario abnormal` and see the traffic.

---

## Day 1 — Tue 10-06

### Task 2: Smoke-test every peripheral (with Wali, morning)

**Files:** Create `firmware/src/smoke.cpp`, guarded by `#ifdef WARD_SMOKE` (add an env `[env:smoke]` with `build_flags = ${env:esp32dev.build_flags} -DWARD_SMOKE`)

- [ ] An I2C scanner prints `0x57 0x5A 0x68` (see the PINMAP warning about the DS3231 EEPROM).
- [ ] MAX30102: raw IR value > 50000 with a finger on it. MLX90614: object temperature ≈ skin. DS3231: set the time once from compile time (`rtc.adjust(DateTime(F(__DATE__), F(__TIME__)) - TimeSpan(0,1,0,0))`, because the compile time is local and the RTC keeps UTC).
- [ ] RC522: `PCD_DumpVersionToSerial` → `0x91`/`0x92`; a tapped card prints its UID in uppercase hex.
- [ ] TFT: colour bars; touch: the raw coordinates print.
- [ ] Stepper: one revolution = 2048 steps; button and IR print their state changes.
- [ ] Sign PINMAP v1.0 with Wali.

### Task 3: Display + LVGL home screen

**Files:**
- Create: `firmware/include/lv_conf.h`, `firmware/src/ui.{h,cpp}`
- Modify: `firmware/platformio.ini` (TFT_eSPI config via build flags)

- [ ] Configure TFT_eSPI through `[env:esp32dev] build_flags` (no edits inside `.pio`):

```
  -DUSER_SETUP_LOADED=1 -DILI9341_DRIVER=1
  -DTFT_MISO=19 -DTFT_MOSI=23 -DTFT_SCLK=18 -DTFT_CS=15 -DTFT_DC=2 -DTFT_RST=4 -DTOUCH_CS=16
  -DLOAD_GLCD=1 -DLOAD_FONT2=1 -DLOAD_FONT4=1 -DSPI_FREQUENCY=40000000 -DSPI_TOUCH_FREQUENCY=2500000
  -DLV_CONF_INCLUDE_SIMPLE -Iinclude
```

- [ ] `lv_conf.h`:
  - `LV_COLOR_DEPTH 16`
  - `LV_USE_TFT_ESPI 1`
  - `LV_MEM_SIZE (48U*1024U)`
  - fonts `LV_FONT_MONTSERRAT_14/20/28 1`

  Draw buffer: 320×20 lines. Touch goes through an `lv_indev` read callback calling `tft.getTouch()`, with calibration data stored in NVS.
- [ ] `ui.h` API (keep it; `main.cpp` and the other modules only call these):

```cpp
void ui_init();
void ui_tick();                                   // call every loop
void ui_show_home(const char* first_name, const char* clock_hhmm, const char* next_dose, bool online);
void ui_show_dose(const char* meds, const char* time_hhmm);    // full screen + "Taken" button
void ui_show_measure(const char* hint);           // "Place your finger on the sensor"
void ui_show_nurse(const char* patient_first_name, int hr, int spo2, float temp); // -1 / NAN = "—"
void ui_toast(const char* text, uint32_t ms);
void ui_banner_alert(const char* text);           // command type=alert
void ui_set_callbacks(void (*on_taken)(), void (*on_measure)(), void (*on_call)());
```

- [ ] The Home screen shows the first name, a big clock, "Next: 14:00 Amoxicillin 1g" and an online/offline icon. Large touch targets, at least 60 px. Commit `feat(firmware): lvgl home screen`.

**Fallback if LVGL eats more than half a day:** implement the same `ui.h` with plain TFT_eSPI drawing calls and continue. The API stays the same.

### Task 4: Wi-Fi + MQTT + status/last-will + ring buffer

**Files:**
- Create: `firmware/lib/ward_ringbuf/ward_ringbuf.h`, `firmware/src/net.{h,cpp}`, `firmware/test/test_ringbuf/test_main.cpp`

- [ ] **Step 1: Failing native tests**

```cpp
// firmware/test/test_ringbuf/test_main.cpp
#include <unity.h>
#include <string.h>
#include "ward_ringbuf.h"

void test_push_pop_order() {
  RingBuf<4, 32> rb;
  rb.push("a"); rb.push("b");
  char out[32];
  TEST_ASSERT_TRUE(rb.pop(out)); TEST_ASSERT_EQUAL_STRING("a", out);
  TEST_ASSERT_TRUE(rb.pop(out)); TEST_ASSERT_EQUAL_STRING("b", out);
  TEST_ASSERT_FALSE(rb.pop(out));
}

void test_overflow_keeps_newest() {
  RingBuf<3, 32> rb;
  rb.push("1"); rb.push("2"); rb.push("3"); rb.push("4");   // drops "1"
  char out[32];
  rb.pop(out); TEST_ASSERT_EQUAL_STRING("2", out);
  rb.pop(out); TEST_ASSERT_EQUAL_STRING("3", out);
  rb.pop(out); TEST_ASSERT_EQUAL_STRING("4", out);
  TEST_ASSERT_EQUAL(0, rb.size());
}

void test_rejects_too_long() {
  RingBuf<2, 4> rb;
  TEST_ASSERT_FALSE(rb.push("toolong"));
  TEST_ASSERT_EQUAL(0, rb.size());
}

void test_peek_does_not_remove() {
  RingBuf<2, 8> rb; rb.push("x");
  TEST_ASSERT_EQUAL_STRING("x", rb.peek());
  TEST_ASSERT_EQUAL(1, rb.size());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_push_pop_order); RUN_TEST(test_overflow_keeps_newest);
  RUN_TEST(test_rejects_too_long); RUN_TEST(test_peek_does_not_remove);
  return UNITY_END();
}
```

Run: `pio test -e native -f test_ringbuf`, expected FAIL (header missing).

- [ ] **Step 2: Implement (header-only, no Arduino includes)**

```cpp
// firmware/lib/ward_ringbuf/ward_ringbuf.h
#pragma once
#include <stddef.h>
#include <string.h>

template <size_t N, size_t LEN>
class RingBuf {
 public:
  bool push(const char* s) {
    size_t n = strlen(s);
    if (n >= LEN) return false;
    if (count_ == N) { head_ = (head_ + 1) % N; count_--; }   // drop oldest
    memcpy(buf_[(head_ + count_) % N], s, n + 1);
    count_++;
    return true;
  }
  bool pop(char* out) {
    if (count_ == 0) return false;
    memcpy(out, buf_[head_], strlen(buf_[head_]) + 1);
    head_ = (head_ + 1) % N; count_--;
    return true;
  }
  const char* peek() const { return count_ ? buf_[head_] : nullptr; }
  size_t size() const { return count_; }
 private:
  char buf_[N][LEN] = {};
  size_t head_ = 0, count_ = 0;
};
```

- [ ] **Step 3: `net.cpp`.** Wi-Fi reconnects with backoff. The PubSubClient buffer is `setBufferSize(1280)`. `connect()` uses the last-will `status` = `{"online":false,"fw_version":...}`, retained, QoS 1 (PubSubClient publishes at QoS 0 but honours the will's QoS). On connect:
  1. publish the retained `status` online
  2. subscribe to `schedule` and `command`
  3. **drain the ring buffer** (`peek` → publish → `pop` only on success)

  API:

```cpp
void net_init();                     // uses secrets.h
void net_loop();                     // call every loop
bool net_online();
void net_publish(const char* kind, JsonDocument& doc); // adds msg_id + ts, buffers when offline/failed
void net_on_schedule(void (*cb)(const char* json));
void net_on_command(void (*cb)(const char* json));
```

  `msg_id` uses `Preferences` namespace `ward`, key `msg_id`, persisted every 50 messages, and starts at `stored + 50` after boot.
- [ ] **Step 4:** Publish real sensor vitals every 60 s (background) and check them with `mosquitto_sub`. Unplug the router for 2 minutes, plug it back: the buffered messages arrive in order, with their original `ts`.
- [ ] **Step 5:** Commit `feat(firmware): mqtt with last-will and offline ring buffer`.

**Day 1 done when:** the device shows the home screen, publishes real vitals plus online/offline status, and survives a Wi-Fi outage without losing messages (up to 128). `pio test -e native` is green.

---

## Day 2 — Wed 10-07

### Task 5: Schedule storage + next-dose logic

**Files:** Create `firmware/lib/ward_schedule/ward_schedule.{h,cpp}`, `firmware/src/schedule.cpp`, `firmware/test/test_schedule/test_main.cpp`

- [ ] **Step 1: Failing native tests**

```cpp
// firmware/test/test_schedule/test_main.cpp
#include <unity.h>
#include "ward_schedule.h"

static const char* J = R"({"schedule_version":3,"patient_id":"p-0001","patient_first_name":"Amira",
 "doses":[{"dose_id":"d-1","time":"08:00","meds":["Paracetamol 500mg"],"slot":1},
          {"dose_id":"d-2","time":"14:00","meds":["Amoxicillin 1g"],"slot":2}]})";

void test_parse() {
  Schedule s; TEST_ASSERT_TRUE(parse_schedule(J, s));
  TEST_ASSERT_EQUAL(3, s.version); TEST_ASSERT_EQUAL(2, s.n_doses);
  TEST_ASSERT_EQUAL(480, s.doses[0].minute_of_day); TEST_ASSERT_EQUAL(1, s.doses[0].slot);
  TEST_ASSERT_EQUAL_STRING("Amira", s.first_name);
}

void test_ignores_older_version() {
  Schedule s; parse_schedule(J, s);
  TEST_ASSERT_FALSE(should_accept(s, 3));   // stored version 3 → ignore same
  TEST_ASSERT_FALSE(should_accept(s, 5));   // stored newer → ignore
  TEST_ASSERT_TRUE(should_accept(s, 2));
}

void test_next_dose_same_day() {
  Schedule s; parse_schedule(J, s);
  TEST_ASSERT_EQUAL(1, next_dose_index(s, 9 * 60));      // 09:00 → 14:00 dose
}

void test_next_dose_wraps_midnight() {
  Schedule s; parse_schedule(J, s);
  TEST_ASSERT_EQUAL(0, next_dose_index(s, 23 * 60 + 50)); // 23:50 → 08:00 tomorrow
}

void test_unassigned() {
  Schedule s;
  TEST_ASSERT_TRUE(parse_schedule(R"({"schedule_version":4,"patient_id":null,"patient_first_name":"","doses":[]})", s));
  TEST_ASSERT_EQUAL(-1, next_dose_index(s, 600));
  TEST_ASSERT_FALSE(s.assigned);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_parse); RUN_TEST(test_ignores_older_version); RUN_TEST(test_next_dose_same_day);
  RUN_TEST(test_next_dose_wraps_midnight); RUN_TEST(test_unassigned);
  return UNITY_END();
}
```

- [ ] **Step 2: Implement** with ArduinoJson 7 (it works in `native`):

```cpp
// firmware/lib/ward_schedule/ward_schedule.h
#pragma once
#include <stdint.h>
constexpr int MAX_DOSES = 8;
struct Dose { char dose_id[16]; int minute_of_day; char meds[96]; int slot; };  // slot 0 = none
struct Schedule {
  int version = 0; bool assigned = false;
  char patient_id[16] = ""; char first_name[32] = "";
  Dose doses[MAX_DOSES]; int n_doses = 0;
};
bool parse_schedule(const char* json, Schedule& out);     // meds joined with ", "
bool should_accept(const Schedule& incoming, int stored_version);  // incoming.version > stored
int  next_dose_index(const Schedule& s, int now_minute_local);     // -1 if none; >= now, else first (wrap)
```

- [ ] **Step 3: `schedule.cpp` (device side):**
  - On an MQTT schedule where `should_accept` is true: save the raw JSON to NVS key `sched`, then `net_publish("events", {type:"schedule_ack", schedule_version})`.
  - On boot, load from NVS.
  - Local minute = (RTC UTC + 60 min) mod 1440.
- [ ] **Step 4:** Commit `feat(firmware): nvs schedule + next dose`.

### Task 6: Dose state machine + carousel + IR + "Taken"

**Files:** Create `firmware/lib/ward_dose/ward_dose.{h,cpp}`, `firmware/src/carousel.cpp`, `firmware/test/test_dose/test_main.cpp`

- [ ] **Step 1: Failing native tests**

```cpp
// firmware/test/test_dose/test_main.cpp
#include <unity.h>
#include "ward_dose.h"

void test_due_then_taken_by_ir() {
  DoseFsm f; f.start("d-1", /*now*/1000, /*slot*/1, /*ir_blocked_at_start*/false);
  TEST_ASSERT_EQUAL(DoseOut::Dispensed, f.tick(1000, false, false));
  TEST_ASSERT_EQUAL(DoseOut::None,      f.tick(1010, false, false));
  TEST_ASSERT_EQUAL(DoseOut::None,      f.tick(1020, true,  false));  // pill in tray (blocked)
  TEST_ASSERT_EQUAL(DoseOut::TakenIr,   f.tick(1030, false, false));  // removed
}

void test_taken_by_button() {
  DoseFsm f; f.start("d-1", 1000, 0, false);                       // slot 0 = no carousel
  TEST_ASSERT_EQUAL(DoseOut::None,        f.tick(1000, false, false)); // no dispense without slot
  TEST_ASSERT_EQUAL(DoseOut::TakenButton, f.tick(1005, false, true));
}

void test_missed_after_30_min() {
  DoseFsm f; f.start("d-1", 1000, 1, false);
  f.tick(1000, false, false);
  TEST_ASSERT_EQUAL(DoseOut::None,   f.tick(1000 + 1799, false, false));
  TEST_ASSERT_EQUAL(DoseOut::Missed, f.tick(1000 + 1800, false, false));
  TEST_ASSERT_FALSE(f.active());
}

void test_ir_already_blocked_not_taken() {
  DoseFsm f; f.start("d-1", 1000, 1, /*ir_blocked_at_start*/true);
  f.tick(1000, true, false);
  TEST_ASSERT_EQUAL(DoseOut::None, f.tick(1010, false, false));   // must see a fresh block→clear
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_due_then_taken_by_ir); RUN_TEST(test_taken_by_button);
  RUN_TEST(test_missed_after_30_min); RUN_TEST(test_ir_already_blocked_not_taken);
  return UNITY_END();
}
```

- [ ] **Step 2: Implement `DoseFsm`.**
  - States: `Idle → Dispensing → WaitPickup → Done`.
  - `start()` records `ir_blocked_at_start`.
  - When `slot > 0`, the first tick returns `Dispensed` (the caller then rotates the carousel).
  - In `WaitPickup`, the IR must go **blocked after the start** and then clear → `TakenIr`. If it was blocked at start, it must first clear, then block, then clear.
  - The button returns `TakenButton` at any time.
  - `now - start >= 1800` → `Missed`.
  - Expose `const char* dose_id()` and `bool active()`.
- [ ] **Step 3: `carousel.cpp`.** Uses AccelStepper `HALF4WIRE` with pins IN1, IN3, IN2, IN4 (that order, required for the 28BYJ-48 on the ULN2003). Steps per slot = `4096 / SLOTS` (half-step). Functions:
  - `carousel_go_to(int slot)`
  - `carousel_home()` (slot 0 = aligned at boot)
  - `carousel_run()` (call every loop; non-blocking)

  De-energise the coils after each move to avoid heat. Serial test commands: `r<n>` rotates to slot n, `h` homes.
- [ ] **Step 4: Wire it in `main.cpp`.**
  - Each minute: if `next_dose_index` matches the current local minute and the FSM is idle, call `start()`, then show the `ui_show_dose` screen, the buzzer pattern (LEDC 2 kHz, 300 ms on/700 ms off) and the LED.
  - Map the outputs to `net_publish("events", …)`: `dose_dispensed`, `dose_taken {method}` and `dose_missed`.
  - `command dispense_now {dose_id}` starts the FSM immediately with that dose's slot.
  - `rotate_home` calls `carousel_home()`.
- [ ] **Step 5:** Manual check with Wali's mechanism: 10/10 rotations and pickups. **Go/no-go at 18:00.** If no-go, set `CAROUSEL_ENABLED 0` in `include/config.h`, so every slot counts as 0 and the button path runs.
- [ ] **Step 6:** `test_next_dose_after_reboot` (manual): load a schedule, power off, disconnect Wi-Fi, power on 2 min before a dose → it fires. Commit `feat(firmware): dose fsm, carousel, ir pickup`.

### Task 7: RFID nurse mode + measurement + call-nurse

**Files:** Create `firmware/src/{rfid,sensors}.{h,cpp}`

- [ ] **`sensors.cpp`:** `bool measure(int& hr, int& spo2, float& temp)`, a blocking measurement of at most 15 s:
  - The MAX30102 uses the SparkFun `spo2_algorithm` (`maxim_heart_rate_and_oxygen_saturation`) over 100 samples, with the finger-presence check IR > 50000.
  - Temperature comes from MLX90614 `readObjectTempC()`, plus a fixed +2.0 °C skin-to-core offset (documented as a prototype approximation).
  - Invalid values become `-1` / `NAN` → JSON `null`.
- [ ] **`rfid.cpp`:** poll the RC522 every 200 ms. A UID tap publishes `events {type:"nurse_tap", rfid_uid}` and enters **nurse mode** for 60 s:
  1. `ui_show_nurse(first_name, …)`
  2. "Measure" button → `ui_show_measure` → `measure()`
  3. publish `vitals` with `nurse_rfid`
  4. show the values

  Mind the SPI sharing with the TFT: wrap RC522 calls so `TFT_CS` is HIGH, then call `SPI.beginTransaction`.
- [ ] **Call button (GPIO 34, active LOW, 50 ms debounce):** publish `events {type:"call_nurse"}` and call `ui_toast("Nurse called", 3000)`.
- [ ] A `command alert` calls `ui_banner_alert(text)` plus 5 s of buzzer; `message` calls `ui_toast`.
- [ ] Commit `feat(firmware): rfid nurse mode, vitals measurement, call nurse`.

**Day 2 done when:** CP2 passes. Faouzi prescribes in the doctor view, the device shows the schedule within 5 s, `dispense_now` rotates the carousel, the pickup sends `dose_taken`, and the doctor view updates. The nurse tap → measure → vitals arrive tagged with the nurse.

---

## Day 3 — Thu 10-08 (integration)

### Task 8: Golden path as the Patient owner

- [ ] Run the patient part of the golden path on the real device twice by 13:00 (CP3), and fix only blockers.
- [ ] Offline demo check: Wi-Fi off, a dose still fires, the events are buffered, and they replay on reconnect (the doctor view shows them).

### Task 9: No-show model (afternoon)

**Files:**
- Create: `backend/app/ai/no_show/{__init__,model,train}.py`, `backend/app/ai/no_show/model.json`
- Test: `backend/tests/test_no_show.py`

- [ ] **Step 1:** Download the Kaggle "Medical Appointment No Shows" CSV (`KaggleV2-May-2016.csv`) to `backend/app/ai/no_show/data/` (git-ignored: add `backend/app/ai/no_show/data/` to `.gitignore`; the dataset licence forbids redistributing it here).
- [ ] **Step 2:** `train.py` (offline, needs `pip install scikit-learn pandas`) trains a `LogisticRegression(max_iter=1000)` on these features: `age`, `is_female`, `scholarship`, `hypertension`, `diabetes`, `alcoholism`, `handicap>0`, `sms_received`, `lead_days`, `weekday_0..6` (one-hot). Print the ROC-AUC on a 20 % holdout (expect ≈ 0.6–0.7; say so honestly). Export `{"features": [...], "coef": [...], "intercept": x, "auc": y}` to `model.json`. **No scikit-learn at runtime.**
- [ ] **Step 3: Failing tests, then implement**

```python
# backend/tests/test_no_show.py
from app.ai.no_show import predict_no_show, rank_backfill

def test_predict_in_range():
    p = predict_no_show({"age": 30, "is_female": 1, "lead_days": 20, "sms_received": 1, "weekday": 0})
    assert 0.0 <= p <= 1.0

def test_predict_fallback_on_garbage():
    assert predict_no_show({"age": "abc"}) == 0.20

def test_rank_backfill():
    c = [{"appointment_id": "a-1", "urgency": 3, "no_show_prob": 0.1, "created_at": "2026-10-01T00:00:00Z"},
         {"appointment_id": "a-2", "urgency": 5, "no_show_prob": 0.4, "created_at": "2026-10-02T00:00:00Z"},
         {"appointment_id": "a-3", "urgency": 5, "no_show_prob": 0.2, "created_at": "2026-10-03T00:00:00Z"}]
    assert [x["appointment_id"] for x in rank_backfill(c)] == ["a-3", "a-2", "a-1"]
```

  `model.py` loads `model.json` once and computes a sigmoid over the dot product. Missing features default to 0. On any exception it returns `0.20`.
- [ ] **Step 4:** Tell Faouzi it's ready. He calls `predict_no_show` in `POST /appointments/{id}/confirm` and `rank_backfill` in W2. Commit `feat(ai): no-show logistic model + backfill ranking`.

## Day 4 — Fri 10-09 (polish)

- [ ] Screen polish: Arabic/French greeting on the home screen ("Sbah el khir, Amira"), bigger fonts, and colour-coded vitals in nurse mode.
- [ ] A 30-minute soak test with real MQTT; no reboot (check `esp_reset_reason`).
- [ ] Record the device close-ups for the backup video.
- [ ] Rehearse your demo segment (Care, ~60 s) three times.

**Day 4 done when:** the soak test passes and your segment is rehearsed.

## Self-review checklist (run before each PR)

- [ ] Every published payload matches `docs/contracts/mqtt-topics.md`, compared field by field against `mosquitto_sub` output.
- [ ] `pio test -e native` green; `pio run` builds without warnings in your modules.
- [ ] `secrets.h` is not committed.
