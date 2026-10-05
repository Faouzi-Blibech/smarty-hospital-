# Hardware — Smart Bedside Unit (owner: Wali)

The bedside unit is a **listener**: it receives the medication schedule and commands over MQTT, shows them on an OLED,
and turns a servo to the dose's pill slot. It has **no vital-sign sensors**; vitals, nurse taps and call-nurse come
from `simulator/`. It is developed in **Wokwi** (`firmware/diagram.json`) and built on a real board last, if time allows.
The pin map lives in `firmware/PINMAP.md`.

## Bill of materials

| Part | Qty | Interface | Have? | Notes |
|---|---|---|---|---|
| ESP32 DevKit V1 | 1 (+1 spare) | — | ☐ | |
| 0.96" SSD1306 OLED 128×64 | 1 | I2C 0x3C | ☐ | |
| DS1307 RTC module + coin cell | 1 | I2C 0x68 | ☐ | a DS3231 also works (one-line firmware change) |
| SG90 micro servo | 1 | GPIO 13 (PWM) | ☐ | 5 V rail |
| Small pill holder (4 compartments on a disc or arc) | 1 | — | ☐ | cardboard / foam-board build on the servo horn |
| 5 V 1 A+ USB supply + cable | 1 | — | ☐ | |
| Breadboard, jumpers | — | — | ☐ | |

Wokwi needs none of these. Tick the boxes on Day 0 only if the real board is planned.

## Servo dispenser

- The servo horn carries a disc or arc with up to **4 pill compartments**.
- Slot angles: slot 0 = 0° (home), 1 = 45°, 2 = 90°, 3 = 135°, 4 = 180°. A fixed opening over the arc shows the active compartment.
- `rotate_home` sends it back to 0°. The firmware detaches the servo after each move to stop jitter.
- A dose with `slot: null` is reminder-only (no move).
