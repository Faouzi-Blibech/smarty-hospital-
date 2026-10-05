# Hardware — Smart Bedside Unit (owner: Wali)

Wiring photos, enclosure notes and the carousel build log go here. The pin map lives in `firmware/PINMAP.md`.

## Bill of materials (Option A: with pill carousel)

| Part | Qty | Interface | Have? | Notes |
|---|---|---|---|---|
| ESP32 DevKit V1 | 1 (+1 spare) | — | ☐ | |
| 2.8" ILI9341 touch TFT (XPT2046) | 1 | SPI | ☐ | |
| MAX30102 | 1 | I2C 0x57 | ☐ | HR + SpO2 |
| MLX90614 | 1 | I2C 0x5A | ☐ | non-contact temperature |
| DS3231 RTC + CR2032 | 1 | I2C 0x68 | ☐ | check for the EEPROM at 0x57 |
| RC522 RFID + 2 cards/tags | 1 | SPI | ☐ | nurse badge, wristband |
| Push button + 10 kΩ | 1 | GPIO | ☐ | call nurse |
| Buzzer + LED + 220 Ω + NPN | 1 | PWM/GPIO | ☐ | |
| 28BYJ-48 stepper + ULN2003 | 1 | 4 GPIO | ☐ | carousel |
| IR obstacle sensor module | 1 | GPIO | ☐ | pill pickup in tray |
| Round rotating pill organizer (7–8 slots) | 1 | — | ☐ | or a foam-board build |
| 5 V 2 A USB supply + cable | 1 | — | ☐ | |
| 18650 + holder + TP4056 + 5 V boost | 1 | — | ☐ | backup power |
| Breadboard / perfboard, jumpers, headers | — | — | ☐ | |

Estimated total ≈ $45–70. Tick the boxes on Day 0, and order anything missing that day. The simulator covers missing parts until they arrive.

## Carousel mechanism

- The stepper shaft is coupled to the organizer's centre (hot glue + a 3D-free adapter: bottle cap / wooden dowel).
- The base has **one drop hole** under slot position 0. The tray under it holds the IR sensor.
- 28BYJ-48 = 2048 steps/rev (half-step 4096). For N slots, one slot = 2048/N steps.
- **Homing:** with no endstop, `rotate_home` assumes slot 0 is aligned at boot (manual alignment mark on the base).
- **Go/no-go:** Day 2 at 18:00. Criterion: 10/10 correct single-slot rotations and drops. If it fails, the demo uses the "Taken" button.
