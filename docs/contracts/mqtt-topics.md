# MQTT contract — v1.0

> **Version:** 1.0 (frozen 2026-10-05) · **Owners:** Hedi (device side), Wali (server side)
> Any change: open a PR that bumps the version above, add a changelog line, and announce it in the team chat.

## Broker

- Mosquitto 2.x, `mqtt://<server>:1883`. Anonymous access on the isolated demo LAN (`infra/mosquitto/mosquitto.conf`); password auth is a Day 4 stretch and TLS is out of scope. Say so honestly in the pitch.
- Client IDs: device = `ward-dev-{device_id}`; backend worker = `ward-worker`; simulator = `ward-sim-{device_id}`.
- `device_id` format: `bsu-` + 3 digits, e.g. `bsu-001` (bedside unit). Printed on the device label.

## Common rules

- All payloads are UTF-8 JSON objects, max 1024 bytes (fits ESP32 PubSubClient buffer set to 1280).
- `ts` = **epoch seconds, UTC** (integer), taken from the DS3231 RTC.
- Every **device → server** message carries `msg_id`: a `uint32` that increases by 1 per message and is persisted in NVS so it survives reboots. The server deduplicates on `(device_id, msg_id)`, so offline-buffer replays are safe to send twice.
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
| `hr` | int, bpm | `null` if the sensor read failed (no finger) |
| `spo2` | int, % | `null` if the read failed |
| `temp` | float, °C, 1 decimal | `null` if the read failed |
| `nurse_rfid` | string, uppercase hex UID | **Optional.** Present only when the reading was taken in nurse mode |

Cadence: in nurse mode, one message per completed measurement. Outside nurse mode, the device MAY publish a background reading every 60 s (`nurse_rfid` absent). The simulator publishes every 5 s for demos.

### `events` (device → server)

```json
{ "msg_id": 1043, "ts": 1759680100, "type": "dose_taken", "dose_id": "d-000123" }
```

| `type` | Extra fields | Meaning |
|---|---|---|
| `call_nurse` | — | Patient pressed the call button |
| `dose_dispensed` | `dose_id` | Carousel rotated one slot (Option A) |
| `dose_taken` | `dose_id`, `method`: `"ir"` \| `"button"` | Pill removed (IR) or "Taken" pressed |
| `dose_missed` | `dose_id` | 30 min after dose time with no pickup |
| `nurse_tap` | `rfid_uid` | A badge was tapped (enters nurse mode) |
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
- `slot` is the carousel slot index `1..N` (Option A). It is `null` when the dose is not loaded in the carousel (button-only).
- Max 8 doses per schedule (keeps the payload under 1024 bytes).
- An empty `doses` array plus `patient_id: null` means **unassigned** (after discharge).
- The device stores the payload in NVS, replies with `events/schedule_ack`, and ignores any schedule whose `schedule_version` is ≤ the stored one.

### `command` (server → device)

```json
{ "type": "alert", "text": "Nurse is on the way" }
```

| `type` | Fields | Device behaviour |
|---|---|---|
| `alert` | `text` | Full-screen banner + buzzer for 5 s |
| `message` | `text` | Non-blocking toast on the home screen |
| `dispense_now` | `dose_id` | Run the dose flow immediately (demo trigger) |
| `rotate_home` | — | Rotate the carousel to slot 0 (calibration) |

## Internal topic (server only, not for devices)

`ward/internal/ws` (QoS 0, not retained) carries live frames from the `worker` process to the `api` process, which
relays them to WebSocket clients. Payload = the WS envelope from `api.md` plus a routing `scope`:

```json
{ "type": "vital", "data": { }, "scope": { "patient_id": "p-0001", "ward": "Cardiology", "doctor_id": "u-0001" } }
```

Devices and the simulator must never publish here.

## Changelog

- **1.0** (2026-10-05): initial freeze. Adds `msg_id`, epoch `ts`, `schedule_version`, `nurse_tap`, `schedule_ack` and `rotate_home` to the brief's drafts.
