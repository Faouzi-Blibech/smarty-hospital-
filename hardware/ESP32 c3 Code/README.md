# ESP32-C3 + OLED + buzzer over Bluetooth

Press **Space** on the PC → the ESP32-C3 shows **"ClaWd Fil Lil suffer in ESEN"** on the OLED with a blinking
(white ↔ black) background, and the buzzer beeps in sync, for 5 seconds.

The ESP32-C3 only has **Bluetooth Low Energy** (no classic Bluetooth), so there is no "COM port" pairing. The C3
advertises as **`Ward-C3`** and a small Python script on the PC connects to it and sends `SHOW` when you press Space.

## Parts

| Part | Notes |
|---|---|
| ESP32-C3 board (SuperMini, DevKitM-1, XIAO ESP32C3…) | |
| SSD1306 OLED 128×64, I2C | address `0x3C` (some are `0x3D`) |
| Buzzer | passive or active; the code drives it with a 2.7 kHz tone, which works for both |

## Wiring

The same code runs on two boards; each has its own PlatformIO environment and pins.

| OLED / buzzer | ESP32 DevKit V1 (`esp32dev`, default) | ESP32-C3 (`esp32c3`) |
|---|---|---|
| OLED VCC | 3V3 | 3V3 |
| OLED GND | GND | GND |
| OLED SDA | GPIO 21 | GPIO 5 |
| OLED SCL | GPIO 22 | GPIO 6 |
| Buzzer + | GPIO 4 | GPIO 4 |
| Buzzer − | GND | GND |

Different pins? Change `-DPIN_SDA`, `-DPIN_SCL`, `-DPIN_BUZZER` for your board in `platformio.ini`.
Avoid: classic ESP32 GPIO 6–11 (flash), 0, 2, 12 (boot); ESP32-C3 GPIO 2, 8, 9 (boot) and 18/19 (USB).

## 1. Flash the board

With PlatformIO (VS Code extension or CLI), from this folder:

```bash
pio run -e esp32dev -t upload     # classic ESP32 (set upload_port in platformio.ini, default COM5)
pio run -e esp32c3 -t upload      # ESP32-C3
pio device monitor                # should print "Advertising as Ward-C3..."
```

The OLED shows `Ward-C3 · Waiting for PC...`.

If the upload fails: hold **BOOT**, tap **RESET**, release **BOOT**, then upload again.

## 2. Run the PC script (Windows)

Bluetooth must be **on** in Windows settings. Don't pair the device in Windows; the script connects by itself.

**Easiest:** double-click **`pc/start_alert.bat`**. It installs `bleak` if missing, links to `Ward-C3`, and waits for
Space. If the link drops, press **R** to reconnect.

Or by hand:

```bash
cd pc
pip install -r requirements.txt
python space_sender.py
```

Keep that console window focused: **Space** triggers the message, **Q** quits. The OLED switches to
`PC connected · Press SPACE on the PC`.

No Python? A phone BLE app (e.g. nRF Connect or "Serial Bluetooth Terminal") can also connect to `Ward-C3` and write
`SHOW` (or a single space) to the RX characteristic `6E400002-…`.

## Settings (top of `src/main.cpp`)

| Constant | Default | What |
|---|---|---|
| `EFFECT_MS` | 5000 | how long the message blinks |
| `BLINK_MS` | 250 | blink speed (half period) |
| `BUZZER_HZ` | 2700 | buzzer pitch |
| `OLED_ADDR` | `0x3C` | try `0x3D` if the screen stays black |
| `SCREEN_H` (in `platformio.ini`) | `32` on `esp32dev`, `64` on `esp32c3` | 32 = 0.91" OLED strip, 64 = 0.96" OLED |

## Troubleshooting

| Problem | Fix |
|---|---|
| Screen black, serial says "SSD1306 not found" | Check SDA/SCL wires, try `OLED_ADDR = 0x3D` |
| Script prints "Not found" | ESP powered? Windows Bluetooth on? Close other apps connected to `Ward-C3` |
| Nothing in the serial monitor | Your board may not use native USB: remove the two `ARDUINO_USB_*` flags in `platformio.ini` |
| Buzzer only clicks | It's fine for an active buzzer; for a louder sound try `BUZZER_HZ` between 2000 and 4000 |
