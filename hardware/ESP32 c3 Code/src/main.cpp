// ESP32-C3 + SSD1306 OLED + buzzer, driven from the PC over Bluetooth LE.
//
// The C3 advertises as "Ward-C3" with a Nordic UART Service (NUS). The PC script
// (pc/space_sender.py) writes "SHOW" when Space is pressed. The ESP then shows the
// message with a blinking (inverting) background and beeps the buzzer in sync.

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>

// ---- Pins: set per board in platformio.ini (defaults = ESP32-C3) ----
#ifndef PIN_SDA
#define PIN_SDA 5
#endif
#ifndef PIN_SCL
#define PIN_SCL 6
#endif
#ifndef PIN_BUZZER
#define PIN_BUZZER 4
#endif

// ---- OLED ----
// SCREEN_H: 64 for a 0.96" OLED, 32 for a 0.91" OLED strip (set in platformio.ini).
#ifndef SCREEN_H
#define SCREEN_H 64
#endif
constexpr int SCREEN_W = 128;
constexpr uint8_t OLED_ADDR = 0x3C;  // some modules use 0x3D

// ---- Effect timing ----
constexpr uint32_t EFFECT_MS = 5000;   // how long the message blinks
constexpr uint32_t BLINK_MS = 250;     // half period of the blink
constexpr uint16_t BUZZER_HZ = 2700;   // loud for most passive buzzers; fine for active ones too

// ---- BLE (Nordic UART Service UUIDs) ----
constexpr char DEVICE_NAME[] = "Ward-C3";
constexpr char NUS_SERVICE[] = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
constexpr char NUS_RX[] = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E";  // PC -> ESP (write)
constexpr char NUS_TX[] = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E";  // ESP -> PC (notify)

Adafruit_SSD1306 display(SCREEN_W, SCREEN_H, &Wire, -1);
BLECharacteristic* txChar = nullptr;

volatile bool connected = false;
volatile bool triggerRequested = false;
bool effectRunning = false;
uint32_t effectStart = 0;
bool lastConnectedShown = false;

// ---- Display helpers ----

void drawCentered(const char* text, int y, uint8_t size) {
  int16_t x1, y1;
  uint16_t w, h;
  display.setTextSize(size);
  display.getTextBounds(text, 0, 0, &x1, &y1, &w, &h);
  display.setCursor((SCREEN_W - w) / 2, y);
  display.print(text);
}

void showIdle() {
  display.invertDisplay(false);
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  const char* line1 = connected ? "PC connected" : "Waiting for PC...";
  const char* line2 = connected ? "Press SPACE on the PC" : "Bluetooth LE";
  if (SCREEN_H == 32) {
    drawCentered(DEVICE_NAME, 0, 2);
    drawCentered(line1, 17, 1);
    drawCentered(line2, 25, 1);
  } else {
    drawCentered(DEVICE_NAME, 8, 2);
    drawCentered(line1, 34, 1);
    drawCentered(line2, 48, 1);
  }
  display.display();
}

void showMessage() {
  // "ClaWd Fil Lil suffer in ESEN"
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  if (SCREEN_H == 32) {
    drawCentered("ClaWd Fil", 0, 2);            // 16 px tall
    drawCentered("Lil suffer in ESEN", 20, 1);  // 8 px tall
  } else {
    drawCentered("ClaWd Fil", 6, 2);
    drawCentered("Lil suffer", 25, 2);
    drawCentered("in ESEN", 44, 2);
  }
  display.display();
}

// ---- Buzzer (LEDC PWM, 50 % duty = square wave at BUZZER_HZ) ----

constexpr uint8_t BUZZER_CH = 0;
bool buzzerOn = false;

void setupBuzzer() {
  ledcSetup(BUZZER_CH, BUZZER_HZ, 8);
  ledcAttachPin(PIN_BUZZER, BUZZER_CH);
  ledcWrite(BUZZER_CH, 0);
}

void buzzer(bool on) {
  if (on == buzzerOn) return;  // only touch the hardware on a change
  buzzerOn = on;
  ledcWrite(BUZZER_CH, on ? 128 : 0);
#ifdef PIN_LED
  digitalWrite(PIN_LED, on ? HIGH : LOW);  // on-board LED blinks with the buzzer
#endif
}

// ---- I2C scan: prints every device found, so a wiring problem shows in the serial log ----

bool scanI2c() {
  bool oledFound = false;
  Serial.printf("I2C scan on SDA=%d SCL=%d:\n", PIN_SDA, PIN_SCL);
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf("  found device at 0x%02X\n", addr);
      if (addr == OLED_ADDR) oledFound = true;
    }
  }
  if (!oledFound) {
    Serial.printf("  no OLED at 0x%02X: check VCC/GND and swap SDA/SCL\n", OLED_ADDR);
  }
  return oledFound;
}

// ---- BLE callbacks ----

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override {
    connected = true;
  }
  void onDisconnect(BLEServer* server) override {
    connected = false;
    server->getAdvertising()->start();  // let the PC reconnect
  }
};

class RxCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    String value = c->getValue().c_str();
    if (value == " ") value = "SHOW";  // a raw space from a BLE terminal app also works
    value.trim();
    if (value.equalsIgnoreCase("SHOW")) {
      triggerRequested = true;  // handled in loop(): never touch I2C from the BLE task
    }
  }
};

void setupBle() {
  BLEDevice::init(DEVICE_NAME);
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  BLEService* service = server->createService(NUS_SERVICE);
  BLECharacteristic* rx = service->createCharacteristic(
      NUS_RX, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  rx->setCallbacks(new RxCallbacks());

  txChar = service->createCharacteristic(NUS_TX, BLECharacteristic::PROPERTY_NOTIFY);
  txChar->addDescriptor(new BLE2902());

  service->start();
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(NUS_SERVICE);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
}

void notifyPc(const char* text) {
  if (connected && txChar) {
    txChar->setValue(text);
    txChar->notify();
  }
}

// ---- Arduino ----

void setup() {
  Serial.begin(115200);
  setupBuzzer();
#ifdef PIN_LED
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LOW);
#endif

  Wire.begin(PIN_SDA, PIN_SCL);
  scanI2c();
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("SSD1306 not found: check wiring and OLED_ADDR (0x3C / 0x3D)");
  }
  showIdle();

  setupBle();
  Serial.println("Advertising as Ward-C3. Run pc/space_sender.py on the PC.");
}

void loop() {
  uint32_t now = millis();

  if (triggerRequested) {
    triggerRequested = false;
    effectRunning = true;  // pressing again restarts the effect
    effectStart = now;
    showMessage();
    notifyPc("OK");
    Serial.println("SPACE received: showing message");
  }

  if (effectRunning) {
    uint32_t elapsed = now - effectStart;
    if (elapsed >= EFFECT_MS) {
      effectRunning = false;
      buzzer(false);
      showIdle();
    } else {
      bool phaseOn = (elapsed / BLINK_MS) % 2 == 0;
      display.invertDisplay(phaseOn);  // blinking background: white <-> black
      buzzer(phaseOn);                 // beep in sync with the blink
    }
  } else if (lastConnectedShown != connected) {
    lastConnectedShown = connected;
    showIdle();
  }

  delay(10);
}
