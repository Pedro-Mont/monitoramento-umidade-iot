SELECT topic, json_decode(payload) AS reading
FROM "grupo/umidade/telemetria"