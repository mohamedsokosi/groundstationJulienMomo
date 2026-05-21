#include <Arduino.h>
#include "telemetry_csv.h"

#define CFDP_VERSION 1
#define CFDP_DIRECTION_DOWNLINK 0
#define CFDP_TRANSMISSION_MODE_UNACKNOWLEDGED 0
#define CFDP_CRC_FLAG 1
#define CFDP_TRANSFER_ID 1
#define CFDP_SPACECRAFT_ID 1
#define CFDP_GROUNDSTATION_ID 2

#define PACKET_DELAY_MS 1000
#define FILE_REPEAT_DELAY_MS 10000

void send_csv_line_as_cfdp(const char *csv_line) {
  String header = "";

  header += String(CFDP_VERSION) + ",";
  header += String(CFDP_DIRECTION_DOWNLINK) + ",";
  header += String(CFDP_TRANSMISSION_MODE_UNACKNOWLEDGED) + ",";
  header += String(CFDP_CRC_FLAG) + ",";
  header += String(CFDP_TRANSFER_ID) + ",";
  header += String(CFDP_SPACECRAFT_ID) + ",";
  header += String(CFDP_GROUNDSTATION_ID) + ",";

  // Envoi vers le Raspberry Pi par UART physique
  Serial1.print(header);
  Serial1.println(csv_line);

  // Optionnel : affichage debug sur le PC via USB
  Serial.print(header);
  Serial.println(csv_line);
}

void send_telemetry_csv() {
  for (size_t i = 0; i < TELEMETRY_LINE_COUNT; i++) {
    send_csv_line_as_cfdp(TELEMETRY_LINES[i]);
    delay(PACKET_DELAY_MS);
  }
}

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);

  // USB Serial Monitor vers PC
  Serial.begin(115200);

  // UART physique vers Raspberry Pi
  Serial1.begin(115200);

  delay(1000);

  Serial.println("Pico transmitter started");
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);

  send_telemetry_csv();

  digitalWrite(LED_BUILTIN, LOW);

  delay(FILE_REPEAT_DELAY_MS);
}