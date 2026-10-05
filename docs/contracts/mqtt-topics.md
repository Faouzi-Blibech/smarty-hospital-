# MQTT contract — v1.1

> **Version:** 1.1 (2026-10-05; v1.0 frozen 2026-10-05) · **Owners:** Hedi (device side), Wali (server side)
> Any change: open a PR that bumps the version above, add a changelog line, and announce it in the team chat.

## Broker

- Mosquitto 2.x, `mqtt://<server>:1883`. Anonymous access on the isolated demo LAN (`infra/mosquitto/mosquitto.conf`); password auth is a Day 4 stretch and TLS is out of scope. Say so honestly in the pitch.
- Client IDs: device = `ward-dev-{device_id}`; backend worker = `ward-worker`; simulator = `ward-sim-{device_id}`.
- `device_id` format: `bsu-` + 3 digits, e.g. `bsu-001` (bedside unit). Printed on the device label.

## Publishers (v1.1)

The bedside unit is an ESP32 + SSD1306 OLED + servo + DS1307 RTC, with **no vital-sign sensors, RFID or button**. The
`simulator/` produces the device→server messages the ESP can't. Both may publish for the same `device_id`
(the simulator in `--companion` mode). Topics and payload shapes are unchanged from v1.0.

| Message | ESP (bedside unit) | Simulator `--companion` | Simulator standalone |
|---|---|---|---|
| `status` (retained, last-will) | ✅ | ❌ | ✅ |
| `vitals` | ❌ | ✅ | ✅ |
| `events`: `call_nurse`, `nurse_tap` | ❌ | ✅ | ✅ |
| `events`: `schedule_ack`, `dose_dispensed`, `dose_missed` | ✅ | ❌ | ✅ |
| `events`: `dose_taken` | ❌ | ✅ (after the ESP's `dose_dispensed`) | ✅ |

The ESP also **subscribes to its own `events` topic** to see `dose_taken` and close the reminder.

## Common rules

- All payloads are UTF-8 JSON objects, max 1024 bytes (fits ESP32 PubSubClient buffer set to 1280).
- `ts` = **epoch seconds, UTC** (integer), taken from the DS1307 RTC on the ESP and from the system clock in the simulator.
- Every **device → server** message carries `msg_id`: a `uint32` that is **unique and increasing per publisher**, including across restarts. The server deduplicates on `(device_id, msg_id)`, so offline replays are safe to send twice.
  - ESP: base = RTC epoch seconds at boot, +1 per message.
  - Simulator: base = `2_000_000_000 + (now_epoch − 1_700_000_000)`, +1 per message.
  - Both stay unique as long as each publisher averages under 1 message per second. The two ranges don't overlap before 2030, and both fit in `uint32`.
- Unknown fields must be ignored by receivers (forward compatibility).
- QoS: device → server `1`; server → device `1`; `schedule` and `status` are **retained**.

## Topics

Prefix: `hospital/device/{device_id}/`

| Topic | Direction | QoS | Retained |
|---|---|---|---|
| `vitals` | device → server | 1 | no |
| `events` | device → server | 1 | no |
| `status` | device → server (also last-will) | 1 | **yes** |
| `schedule` | server → device | 1 | **yes** |
| `command` | server → device | 1 | no |

The backend worker subscribes to `hospital/device/+/vitals`, `hospital/device/+/events` and `hospital/device/+/status`.

### `vitals` (device → server)

```json
{
  "msg_id": 1042,
  "ts": 1759680000,
  "patient_id": "p-0007",
  "hr": 88,
  "spo2": 97,
  "temp": 37.1,
  "nurse_rfid": "04A1B2C3"
}
```

| Field | Type | Notes |
|---|---|---|
| `patient_id` | string | From the current `schedule`. If the device has no schedule yet: `null` (server stores and flags it). |
| `hr` | int, bpm | `null` if unavailable |
| `spo2` | int, % | `null` if unavailable |
| `temp` | float, °C, 1 decimal | `null` if unavailable |
| `nurse_rfid` | string, uppercase hex UID | **Optional.** Present only when the reading follows a nurse tap |

Cadence: the simulator publishes every `--interval` s (default 5) for demos. After a `nurse_tap`, the next reading carries `nurse_rfid`. All vitals are **simulated** in this prototype; the bedside unit has no sensors.

### `events` (device → server)

```json
{ "msg_id": 1043, "ts": 1759680100, "type": "dose_taken", "dose_id": "d-000123" }
```

| `type` | Extra fields | Meaning |
|---|---|---|
| `call_nurse` | — | Patient pressed the call button |
| `dose_dispensed` | `dose_id` | The servo turned to the dose's slot |
| `dose_taken` | `dose_id`, `method`: `"ir"` \| `"button"` | Dose confirmed as taken. v1.1 publishers send `"button"`; `"ir"` stays valid for compatibility |
| `dose_missed` | `dose_id` | 30 min after dose time with no pickup |
| `nurse_tap` | `rfid_uid` | A nurse badge tap (simulated) |
| `schedule_ack` | `schedule_version` | Device stored a new schedule in NVS |

### `status` (device → server, retained, last-will)

```json
{ "online": true, "fw_version": "0.1.0", "ip": "192.168.1.42" }
```

- On connect the device publishes `{"online": true, ...}` retained.
- The last-will is configured as `{"online": false, "fw_version": "0.1.0"}` retained, so the broker publishes it if the device drops.
- `status` has **no** `msg_id` or `ts` (the broker emits the last-will on the device's behalf).

### `schedule` (server → device, retained)

```json
{
  "schedule_version": 3,
  "patient_id": "p-0007",
  "patient_first_name": "Amira",
  "doses": [
    { "dose_id": "d-000123", "time": "08:00", "meds": ["Paracetamol 500mg"], "slot": 1 },
    { "dose_id": "d-000124", "time": "14:00", "meds": ["Amoxicillin 1g"], "slot": 2 }
  ]
}
```

- `time` is local wall-clock time `HH:MM` (Africa/Tunis, UTC+1, no DST). Doses repeat daily until a new schedule arrives.
- `slot` is the servo slot index `1..4` (angles 45°, 90°, 135°, 180°; slot 0 = home at 0°). It is `null` when the dose isn't loaded in the dispenser (reminder only).
- Max 8 doses per schedule (keeps the payload under 1024 bytes).
- An empty `doses` array plus `patient_id: null` means **unassigned** (after discharge).
- The device stores the payload in NVS, replies with `events/schedule_ack`, and ignores any schedule whose `schedule_version` is ≤ the stored one.

### `command` (server → device)

```json
{ "type": "alert", "text": "Nurse is on the way" }
```

| `type` | Fields | Device behaviour |
|---|---|---|
| `alert` | `text` | Full-screen (inverted) OLED banner for 5 s |
| `message` | `text` | Short toast on the OLED home screen |
| `dispense_now` | `dose_id` | Run the dose flow immediately (demo trigger) |
| `rotate_home` | — | Turn the servo to slot 0 (home) |

## Internal topic (server only, not for devices)

`ward/internal/ws` (QoS 0, not retained) carries live frames from the `worker` process to the `api` process, which
relays them to WebSocket clients. Payload = the WS envelope from `api.md` plus a routing `scope`:

```json
{ "type": "vital", "data": { }, "scope": { "patient_id": "p-0001", "ward": "Cardiology", "doctor_id": "u-0001" } }
```

Devices and the simulator must never publish here.

## Changelog

- **1.1** (2026-10-05): reduced hardware (ESP32 + OLED + servo + DS1307, no sensors). Adds the publishers table; `msg_id` becomes "unique and increasing per publisher" (epoch-based bases) instead of "+1, persisted in NVS"; `slot` = servo slot 1..4; `ts` from the DS1307. Payload shapes unchanged. Needs 👍 from Wali (server side).
- **1.0** (2026-10-05): initial freeze. Adds `msg_id`, epoch `ts`, `schedule_version`, `nurse_tap`, `schedule_ack` and `rotate_home` to the brief's drafts.
