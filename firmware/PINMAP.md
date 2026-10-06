# Bedside unit pin map — DRAFT v0.2

> **Owners:** Wali (wiring) + Hedi (firmware). Status: **draft. Confirm in Wokwi (`firmware/diagram.json`) and on the real board**, then bump to v1.0.
> Board: ESP32 DevKit V1 (ESP32-WROOM-32). Wokwi part: `board-esp32-devkit-c-v4` (same GPIO numbers).
> The unit is a **listener**: OLED + servo + RTC. No vital-sign sensors, RFID, touch screen, stepper, IR sensor or button.

## Buses

| Bus | Pins | Devices |
|---|---|---|
| I2C | SDA 21 · SCL 22 (400 kHz) | SSD1306 OLED `0x3C`, DS1307 RTC `0x68` |

> Some DS1307 modules also carry an AT24C32 EEPROM at `0x50`. That doesn't clash with anything here.

## Assignments

| Function | GPIO | Dir | Wokwi part | Notes |
|---|---|---|---|---|
| OLED SDA / SCL | 21 / 22 | I2C | `board-ssd1306` | 128×64, 3V3 |
| RTC SDA / SCL | 21 / 22 | I2C | `wokwi-ds1307` | keeps UTC; coin cell on the real module |
| Servo signal | 13 | out (LEDC PWM, 50 Hz) | `wokwi-servo` | SG90 on the **5 V rail**, shared GND |

Servo slot angles: slot 0 = 0° (home), 1 = 45°, 2 = 90°, 3 = 135°, 4 = 180°.

Avoid: GPIO 6–11 (flash), GPIO 12 (boot strap: must be LOW at boot), GPIO 0 (boot button), GPIO 34–39 (input-only).

## Power (real board)

- 5 V USB → ESP32 VIN + servo V+. A stalled SG90 can pull ~650 mA; use a 5 V 1 A+ supply, and add a 470 µF cap across the servo supply if the ESP browns out.
- Common ground everywhere.

## Changelog
- 0.2 (2026-10-05): reduced hardware: OLED + servo + DS1307 only. Removed TFT, touch, RC522, MAX30102, MLX90614, DS3231, stepper, IR, button, buzzer, LED.
- 0.1 (2026-10-05): draft from the foundation design.
