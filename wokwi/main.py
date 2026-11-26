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

SENSORES = [

    ("cafe-s1", 4),   ("cafe-s2", 16),  ("cafe-s3", 17),
    ("milho-s1", 5),  ("milho-s2", 18), ("milho-s3", 19),
    ("soja-s1", 21),  ("soja-s2", 22),  ("soja-s3", 23),
    ("cana-s1", 25),  ("cana-s2", 26),  ("cana-s3", 27),
]

LEDS = {"cafe": 32, "milho": 33, "soja": 14, "cana": 13}

FAIXAS = {
    "cafe":  (60, 80, 18, 28),
    "milho": (60, 85, 20, 32),
    "soja":  (65, 85, 20, 30),
    "cana":  (70, 90, 22, 34),
}

sensores = [(sid, dht.DHT22(Pin(pino, Pin.IN, Pin.PULL_UP))) for sid, pino in SENSORES]
leds = {lav: Pin(pino, Pin.OUT, value=0) for lav, pino in LEDS.items()}
historico = {sid: [] for sid, _ in SENSORES}  # últimas 3 umidades, para a média móvel
ultimo = {}  # sid -> (umidade_media, temperatura)


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


def ler_sensores():
    for sid, s in sensores:
        try:
            s.measure()
            umidade = s.humidity()
            temperatura = s.temperature()
        except Exception as e:
            print("Falha ao ler", sid, ":", e)
            continue
        if not (0.0 <= umidade <= 100.0):
            print("Leitura inválida descartada:", sid, umidade)
            continue
        h = historico[sid]
        h.append(umidade)
        if len(h) > 3:
            h.pop(0)
        ultimo[sid] = (round(sum(h) / len(h), 1), round(temperatura, 1))


def fora_da_faixa(sid):
    if sid not in ultimo:
        return False
    hum, temp = ultimo[sid]
    hmin, hmax, tmin, tmax = FAIXAS[sid.split("-")[0]]
    return not (hmin <= hum <= hmax) or not (tmin <= temp <= tmax)


def atualizar_leds():
    for lav, led in leds.items():
        alerta = any(fora_da_faixa(sid) for sid, _ in SENSORES if sid.startswith(lav + "-"))
        led.value(1 if alerta else 0)


def imprimir_status():
    linhas = []
    for sid, _ in SENSORES:
        if sid in ultimo:
            hum, temp = ultimo[sid]
            marca = " !" if fora_da_faixa(sid) else ""
            linhas.append(f"{sid}: {hum:.1f}% {temp:.1f}C{marca}")
        else:
            linhas.append(f"{sid}: sem leitura")
    print(" | ".join(linhas))


conectar_wifi()

print("Sincronizando relógio via NTP...")
ntptime.settime()
print("Relógio sincronizado:", time.localtime()[:3])

client = conectar_mqtt()

ultimo_envio = 0
contador_msg = 0

while True:
    try:
        ler_sensores()
        atualizar_leds()
        imprimir_status()

        agora = time.ticks_ms()
        if time.ticks_diff(agora, ultimo_envio) >= config.SEND_INTERVAL_MS:
            enviados = 0
            for sid, _ in SENSORES:
                if sid not in ultimo:
                    continue
                hum, temp = ultimo[sid]
                contador_msg += 1
                payload = {
                    "device_id": sid,
                    "message_id": f"{sid}-{agora}-{contador_msg}",
                    "humidity": hum,
                    "temperature": temp,
                }
                client.publish(config.TOPIC, json.dumps(payload))
                enviados += 1
                time.sleep_ms(80)
            print("PUBLICADO: lote com", enviados, "sensores")
            ultimo_envio = agora

    except Exception as e:
        print("Erro no loop:", e)
        try:
            client = conectar_mqtt()
        except Exception as recon_err:
            print("Falha ao reconectar MQTT:", recon_err)

    time.sleep(2)
