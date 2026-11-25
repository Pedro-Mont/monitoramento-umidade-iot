import time
import json
import network
import ssl
import ntptime
from machine import Pin
import dht
import config
from ca_cert import CA_PEM
from mqtt_client import MQTTClient

DHT_PIN = 4
LED_PIN = 18

HUMIDITY_MIN = 40.0
HUMIDITY_MAX = 90.0

sensor = dht.DHT22(Pin(DHT_PIN))
led = Pin(LED_PIN, Pin.OUT)
led.value(0)


def conectar_wifi():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    if not wlan.isconnected():
        print("Conectando ao Wi-Fi Wokwi-GUEST...")
        wlan.connect("Wokwi-GUEST", "")
        while not wlan.isconnected():
            time.sleep(0.5)
    print("Wi-Fi conectado:", wlan.ifconfig()[0])


def conectar_mqtt():
    ssl_params = {
        "server_hostname": config.MQTT_HOST,
        "cadata": CA_PEM,
        "cert_reqs": ssl.CERT_REQUIRED,
    }
    client = MQTTClient(
        client_id=config.DEVICE_ID,
        server=config.MQTT_HOST,
        port=config.MQTT_PORT,
        user=config.MQTT_USER,
        password=config.MQTT_PASSWORD,
        ssl=True,
        ssl_params=ssl_params,
    )
    client.connect()
    print("MQTT CONECTADO")
    return client


conectar_wifi()

print("Sincronizando relógio via NTP...")
ntptime.settime()
print("Relógio sincronizado:", time.localtime()[:3])

client = conectar_mqtt()

ultimas_umidades = []
ultimo_envio = 0
contador_msg = 0

while True:
    try:
        sensor.measure()
        umidade = sensor.humidity()
        temperatura = sensor.temperature()

        if not (0.0 <= umidade <= 100.0):
            print("Leitura de umidade inválida descartada:", umidade)
            time.sleep(2)
            continue

        ultimas_umidades.append(umidade)
        if len(ultimas_umidades) > 3:
            ultimas_umidades.pop(0)
        umidade_media = round(sum(ultimas_umidades) / len(ultimas_umidades), 1)

        if umidade_media < HUMIDITY_MIN:
            status = "BAIXA"
            led.value(1)
        elif umidade_media > HUMIDITY_MAX:
            status = "ALTA"
            led.value(1)
        else:
            status = "NORMAL"
            led.value(0)

        print(f"Umidade: {umidade:.1f}% (média: {umidade_media:.1f}%) | Temp: {temperatura:.1f}C | Status: {status}")

        agora = time.ticks_ms()
        if time.ticks_diff(agora, ultimo_envio) >= config.SEND_INTERVAL_MS:
            contador_msg += 1
            payload = {
                "device_id": config.DEVICE_ID,
                "message_id": f"{config.DEVICE_ID}-{agora}-{contador_msg}",
                "humidity": umidade_media,
                "temperature": round(temperatura, 1),
            }
            client.publish(config.TOPIC, json.dumps(payload))
            print("PUBLICADO:", payload)
            ultimo_envio = agora

    except Exception as e:
        print("Erro no loop:", e)
        try:
            client = conectar_mqtt()
        except Exception as recon_err:
            print("Falha ao reconectar MQTT:", recon_err)

    time.sleep(2)