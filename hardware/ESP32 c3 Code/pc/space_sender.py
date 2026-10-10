"""Press SPACE on the PC -> the ESP32-C3 shows the message, blinks the screen and beeps.

Connects over Bluetooth LE to the device named "Ward-C3" (Nordic UART Service) and writes
"SHOW" each time Space is pressed. Keep this console window focused. Press Q to quit.

    pip install -r requirements.txt
    python space_sender.py
"""

import asyncio
import msvcrt  # Windows console keyboard

from bleak import BleakClient, BleakScanner

DEVICE_NAME = "Ward-C3"
NUS_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  # PC -> ESP (write)
NUS_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  # ESP -> PC (notify)


def on_notify(_sender, data: bytearray) -> None:
    print(f"  ESP: {data.decode(errors='replace')}")


async def main() -> None:
    print(f"Scanning for {DEVICE_NAME}...")
    device = await BleakScanner.find_device_by_name(DEVICE_NAME, timeout=15.0)
    if device is None:
        print("Not found. Is the ESP powered and is Bluetooth on in Windows?")
        return

    async with BleakClient(device) as client:
        await client.start_notify(NUS_TX, on_notify)
        print(f"Connected to {DEVICE_NAME}. Press SPACE to trigger, Q to quit.")
        while client.is_connected:
            if msvcrt.kbhit():
                key = msvcrt.getwch()
                if key == " ":
                    await client.write_gatt_char(NUS_RX, b"SHOW", response=True)
                    print("SPACE -> sent")
                elif key.lower() == "q":
                    break
            await asyncio.sleep(0.02)
        if not client.is_connected:
            print("Disconnected from the ESP.")


if __name__ == "__main__":
    asyncio.run(main())
