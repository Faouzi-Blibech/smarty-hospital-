# Bedside unit pin map — DRAFT v0.1

> **Owners:** Wali (wiring) + Hedi (firmware). Status: **draft. Confirm on the real board on Day 1**, then bump to v1.0.
> Board: ESP32 DevKit V1 (ESP32-WROOM-32, no PSRAM, so GPIO 16/17 are free).

## Buses

| Bus | Pins | Devices |
|---|---|---|
| SPI (VSPI) | SCK 18 · MISO 19 · MOSI 23 | ILI9341 TFT, XPT2046 touch, RC522 |
| I2C | SDA 21 · SCL 22 (400 kHz) | MAX30102 `0x57`, MLX90614 `0x5A`, DS3231 `0x68` (+ its EEPROM `0x57`!) |

> ⚠️ **I2C address clash:** many DS3231 modules carry an AT24C32 EEPROM at `0x57`, the same address as the MAX30102.
> Check your module with an I2C scanner on Day 1. If it clashes, cut the EEPROM's address jumper (A0) or desolder its pull-ups and EEPROM, or remove the EEPROM.

## Assignments

| Function | GPIO | Dir | Notes |
|---|---|---|---|
| TFT CS | 15 | out | strapping pin, OK as output after boot |
| TFT DC | 2 | out | strapping pin (onboard LED on some boards) |
| TFT RST | 4 | out | or tie to EN |
| TFT backlight | 3V3 | — | always on |
| Touch CS (XPT2046) | 16 | out | |
| Touch IRQ | 39 | in | input-only, optional |
| RC522 SS (SDA) | 5 | out | |
| RC522 RST | 17 | out | |
| Stepper IN1–IN4 (ULN2003) | 25, 26, 27, 14 | out | ULN2003 + motor on the **5 V rail**, never 3V3 |
| Buzzer | 32 | out (LEDC PWM) | active or passive buzzer via NPN transistor |
| Status LED | 33 | out | 220 Ω |
| Call-nurse button | 34 | in | input-only, **no internal pull-up**: external 10 kΩ to 3V3, button to GND |
| IR pickup sensor | 35 | in | input-only; module output (LOW = object present) |
| Battery sense (optional) | 36 | in (ADC1) | voltage divider from the 18650 |

Avoid: GPIO 6–11 (flash), GPIO 12 (boot strap: must be LOW at boot), GPIO 0 (boot button).

## Power

- 5 V 2 A USB → ESP32 VIN + ULN2003/stepper + TFT VCC (check: many ILI9341 boards take 5 V on VCC with an onboard regulator).
- 18650 + TP4056 charger/protection + 5 V boost as backup; diode-OR with USB.
- Common ground everywhere.

## Changelog
- 0.1 (2026-10-05): draft from the foundation design.
