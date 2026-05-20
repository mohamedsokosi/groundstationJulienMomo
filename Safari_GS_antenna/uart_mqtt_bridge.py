import serial
import paho.mqtt.client as mqtt
import time

SERIAL_PORT = "/dev/ttyACM0"
BAUD_RATE = 115200

MQTT_BROKER = "localhost"
MQTT_PORT = 1883
MQTT_TOPIC = "icarus/telemetry"


def is_valid_cfdp_line(line: str) -> bool:
    # CFDP header starts with digits/commas; reject binary garbage
    return bool(line) and line[0].isdigit() and line.isprintable()


client = mqtt.Client()
client.connect(MQTT_BROKER, MQTT_PORT, 60)
client.loop_start()

print("Lecture UART puis publication MQTT...")
print("Port série:", SERIAL_PORT)
print("Topic MQTT:", MQTT_TOPIC)

while True:
    try:
        with serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1) as ser:
            print("Port série ouvert")
            while True:
                line = ser.readline().decode(errors="ignore").strip()
                print(line)
                if not line:
                    continue
                if not is_valid_cfdp_line(line):
                    print("Ligne ignorée (garbage):", repr(line[:40]))
                    continue
                print("Reçu UART:", line)
                client.publish(MQTT_TOPIC, line)
                print("Publié MQTT")
    except serial.SerialException as e:
        print("Erreur série:", e, "— reconnexion dans 3s")
        time.sleep(3)
