#include <Arduino.h>
#include "telemetry_csv.h"

#define CFDP_VERSION 1
#define CFDP_DIRECTION_DOWNLINK 0
#define CFDP_TRANSMISSION_MODE_UNACKNOWLEDGED 0
#define CFDP_CRC_FLAG 1
#define CFDP_TRANSFER_ID 1
#define CFDP_SPACECRAFT_ID 1
#define CFDP_GROUNDSTATION_ID 2

#define PACKET_DELAY_MS 250
#define FILE_REPEAT_DELAY_MS 10000

void print_csv_line_as_cfdp(const char *csv_line) {
  String header = "";

  header += String(CFDP_VERSION);
  header += ",";

  header += String(CFDP_DIRECTION_DOWNLINK);
  header += ",";

  header += String(CFDP_TRANSMISSION_MODE_UNACKNOWLEDGED);
  header += ",";

  header += String(CFDP_CRC_FLAG);
  header += ",";

  header += String(CFDP_TRANSFER_ID);
  header += ",";

  header += String(CFDP_SPACECRAFT_ID);
  header += ",";

  header += String(CFDP_GROUNDSTATION_ID);
  header += ",";

  size_t headerBytes = header.length();
  size_t fileDataBytes = strlen(csv_line);
  size_t totalBytesWithoutNewline = headerBytes + fileDataBytes;
  size_t totalBytesWithNewline = totalBytesWithoutNewline + 2;

  Serial.print("HEADER SIZE: ");
  Serial.print(headerBytes);
  Serial.print(" bytes = ");
  Serial.print(headerBytes * 8);
  Serial.println(" bits");

  Serial.print("FILE_DATA SIZE: ");
  Serial.print(fileDataBytes);
  Serial.print(" bytes = ");
  Serial.print(fileDataBytes * 8);
  Serial.println(" bits");

  Serial.print("TOTAL LINE SIZE WITHOUT NEWLINE: ");
  Serial.print(totalBytesWithoutNewline);
  Serial.print(" bytes = ");
  Serial.print(totalBytesWithoutNewline * 8);
  Serial.println(" bits");

  /*Serial.print("TOTAL LINE SIZE WITH println(): ");
  Serial.print(totalBytesWithNewline);
  Serial.print(" bytes = ");
  Serial.print(totalBytesWithNewline * 8);
  Serial.println(" bits");*/

  Serial.print("SENT LINE: ");
  Serial.print(header);
  Serial.println(csv_line);

  //Serial.println();
}

void print_telemetry_csv() {
  Serial.println("----- START TELEMETRY CSV -----");

  for (size_t i = 0; i < TELEMETRY_LINE_COUNT; i++) {
    print_csv_line_as_cfdp(TELEMETRY_LINES[i]);
    delay(PACKET_DELAY_MS);
  }

  Serial.println("----- END TELEMETRY CSV -----");
}

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);

  Serial.begin(115200);
  delay(1000);

  Serial.println("Pico CSV Serial Monitor test started");
  Serial.print("Telemetry line count: ");
  Serial.println(TELEMETRY_LINE_COUNT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);

  print_telemetry_csv();

  digitalWrite(LED_BUILTIN, LOW);

  delay(FILE_REPEAT_DELAY_MS);
}