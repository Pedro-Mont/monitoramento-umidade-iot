# Monitoramento IoT de Lavouras: Umidade e Temperatura do Solo

Sistema de monitoramento em tempo real de **4 lavouras de larga escala (café, milho, soja e cana)**, com **3 sensores por lavoura**, desenvolvido para a disciplina de Arquitetura de Computadores.

Um ESP32 simulado no Wokwi lê 12 sensores DHT22 e envia a telemetria via MQTT sobre TLS (EMQX). Os dados são validados e gravados no Supabase (Edge Function + PostgreSQL) e exibidos num painel web publicado no Cloudflare Pages. O painel tem cena 3D, alertas por lavoura, histórico filtrável e modo noite.

## Links do projeto
* **Simulação Wokwi:** https://wokwi.com/projects/481678427450143745
* **Painel publicado (Cloudflare Pages):** https://monitoramento-umidade-iot-2.pages.dev/

## Arquitetura

```
ESP32 + 12x DHT22 (Wokwi)
   │  MQTT sobre TLS (porta 8883), tópico grupo/umidade/telemetria
   ▼
EMQX Serverless ── Regra SQL + Conector HTTP
   │  HTTPS POST com header x-ingest-key
   ▼
Supabase Edge Function /ingest ── valida o payload
   │
   ▼
PostgreSQL (Supabase), tabela readings
   │  REST API com chave publicável (somente leitura, RLS)
   ▼
Painel web (Cloudflare Pages)
```

### Contrato do payload (MQTT)
Cada sensor gera uma mensagem a cada 10 s:

```json
{
  "device_id": "milho-s2",
  "message_id": "milho-s2-123456-42",
  "humidity": 48.5,
  "temperature": 27.0
}
```

* `device_id` identifica a lavoura e o sensor (`<lavoura>-s<n>`), de `cafe-s1` até `cana-s3`.
* `message_id` é único por mensagem. A tabela tem uma restrição `UNIQUE (device_id, message_id)`, então mensagens repetidas não geram linhas duplicadas.
* A umidade enviada é a **média móvel das 3 últimas leituras** do sensor.

## ESP32 no Wokwi

O circuito tem **12 sensores DHT22** e **4 LEDs de alerta**, um por lavoura. O ESP32 lê todos os sensores a cada 2 s e publica um lote de 12 mensagens a cada 10 s.

| Lavoura | Sensor 1 | Sensor 2 | Sensor 3 | LED de alerta |
|---|---|---|---|---|
| Café | GPIO 4 | GPIO 16 | GPIO 17 | GPIO 32 |
| Milho | GPIO 5 | GPIO 18 | GPIO 19 | GPIO 33 |
| Soja | GPIO 21 | GPIO 22 | GPIO 23 | GPIO 14 |
| Cana | GPIO 25 | GPIO 26 | GPIO 27 | GPIO 13 |

* **Para alterar ao vivo:** com a simulação rodando, clique num sensor e mova os controles de umidade ou temperatura. O LED da lavoura reage na hora e o painel acompanha no próximo envio.
* **LEDs:** acendem quando algum dos 3 sensores da lavoura sai da faixa ideal **de dia**. O modo noite existe apenas no painel.
* **Monitor serial:** mostra os 12 sensores a cada leitura e marca com `!` os que estão fora do ideal.
* **Pull-up:** os pinos usam o pull-up interno do ESP32. Num circuito físico, use um resistor de 10 kΩ entre o pino de dados e o VCC de cada sensor.

## Painel web

* **Cena 3D (three.js):** mostra os 4 talhões, o canal de irrigação e os 12 sensores. Um sensor fora do ideal fica amarelo (atenção) ou vermelho (crítico) e pulsa. Arraste para girar e clique num talhão para ir ao card da lavoura.
* **Resumo no topo:** o título muda conforme a situação, por exemplo "2 sensores fora do ideal nas lavouras de milho e cana". Logo abaixo aparece o estado de cada lavoura.
* **Cards por lavoura:** mostram a faixa ideal do modo atual e, para cada sensor, umidade e temperatura, uma régua com a faixa ideal e um minigráfico das últimas 24 leituras de umidade. Quando algum sensor sai do ideal ou fica sem sinal, um aviso destacado no topo do card diz qual sensor, o valor lido e a faixa esperada.
* **Histórico em linha do tempo:** lista as leituras mais recentes, separadas por dia, com filtro por lavoura e a opção "Só irregularidades".
* **Modo noite:** troca as faixas ideais para os valores noturnos de cada lavoura e muda o site, inclusive a cena 3D, para o tema escuro. A escolha fica salva no navegador.
* **Modo simulado:** se a chave do Supabase não estiver configurada, se a API falhar ou se ainda não houver leituras, o painel gera dados simulados e avisa no topo. Passe o mouse sobre o status para ver o motivo.

### Faixas ideais
Ficam em `frontend/config.js` (`plantacoes[].ideal`). São **valores de referência** para o projeto e devem ser ajustados com um agrônomo.

| Lavoura | Umidade (dia) | Temperatura (dia) | Umidade (noite) | Temperatura (noite) |
|---|---|---|---|---|
| Café | 60–80% | 18–28 °C | 55–75% | 14–22 °C |
| Milho | 60–85% | 20–32 °C | 55–80% | 15–24 °C |
| Soja | 65–85% | 20–30 °C | 60–80% | 15–24 °C |
| Cana | 70–90% | 22–34 °C | 65–85% | 18–26 °C |

### Regras de alerta
| Situação | Regra |
|---|---|
| **Ideal** | Umidade e temperatura dentro da faixa do modo atual |
| **Atenção** | Fora da faixa por até 5 pontos de umidade ou 2 °C (`tolerancia`) |
| **Crítico** | Fora da faixa além da tolerância |
| **Sem sinal** | Nenhuma leitura há mais de 60 s (`staleThresholdSeconds`) |

A lavoura assume a pior situação entre seus 3 sensores.

> A coluna `alert_status` gravada pela Edge Function ainda usa a regra antiga (abaixo de 40% ou acima de 90%). O painel não a utiliza: ele recalcula a situação de cada leitura pela faixa da lavoura e pelo modo dia/noite.

### Configuração do painel (`frontend/config.js`)
| Campo | Padrão | Para que serve |
|---|---|---|
| `supabaseUrl` | n/a | URL do projeto Supabase |
| `publicKey` | n/a | Chave publicável (`sb_publishable_...`), somente leitura |
| `demoMode` | `"auto"` | `"auto"` cai para dados simulados se o Supabase falhar; `true` sempre simula; `false` nunca simula |
| `staleThresholdSeconds` | `60` | Tempo sem leitura para marcar um sensor como "sem sinal" |
| `refreshIntervalMs` | `5000` | Intervalo de atualização do painel |
| `historyLimit` | `400` | Quantas leituras buscar por atualização (todas as lavouras) |
| `tolerancia` | `{ umidade: 5, temperatura: 2 }` | Margem entre "atenção" e "crítico" |
| `plantacoes` | 4 lavouras | Nome, talhão, área, sensores e faixas ideais de dia e de noite |

## Estrutura do repositório
```
frontend/          painel estático
  index.html       estrutura da página
  styles.css       visual (tema dia e noite)
  app.js           busca de dados, regras de alerta, cards e histórico
  scene.js         cena 3D com three.js
  config.example.js / config.js
wokwi/             ESP32 em MicroPython
  main.py          leitura dos 12 sensores, LEDs e envio MQTT
  diagram.json     circuito com 12 DHT22 e 4 LEDs
  mqtt_client.py   cliente MQTT
  config.example.py / ca_cert.example.py   modelos sem credenciais
supabase/
  schema.sql       tabela readings, índice e permissões (RLS)
  functions/ingest/index.ts   Edge Function que recebe e valida as leituras
emqx/
  regra.sql        regra que encaminha o tópico ao conector HTTP
  corpo_http.txt   corpo enviado ao Supabase
testes/
  payload_mqtt.json   exemplo de mensagem para teste manual
```

## Como reproduzir
1. **Supabase:** crie um projeto, execute `supabase/schema.sql` no SQL Editor, cadastre o segredo `INGEST_KEY` em Edge Functions > Secrets e faça o deploy de `supabase/functions/ingest/index.ts` com *Verify JWT* desativado.
2. **EMQX:** crie um deployment Serverless e baixe o certificado CA. Crie um usuário com permissão de *Publish* apenas no tópico `grupo/umidade/telemetria`. Configure o Conector HTTP apontando para o Supabase e crie a regra com `emqx/regra.sql`, enviando `${.}` para `/functions/v1/ingest` com o header `x-ingest-key`.
3. **Wokwi:** copie os arquivos de `wokwi/` para o projeto. Renomeie `config.example.py` para `config.py` e `ca_cert.example.py` para `ca_cert.py`, preencha o domínio e a senha do EMQX e o certificado CA, e inicie a simulação.
4. **Frontend:** copie `frontend/config.example.js` para `frontend/config.js`, preencha a URL e a chave `sb_publishable_` do Supabase e publique a pasta `frontend/` no Cloudflare Pages, sem comando de build e com diretório de saída `frontend`.

### Testando
1. Inicie a simulação no Wokwi e abra o painel. Em 10 a 20 s o status no topo muda para **Ao vivo**.
2. Baixe a umidade de um sensor do café para uns 40%. O LED do café acende, o sensor fica vermelho na cena 3D e o card do café mostra o aviso.
3. Ative o **modo noite** no painel. As faixas ideais mudam para os valores noturnos e as leituras passam a ser avaliadas por elas.
4. Para testar o painel sem backend, use `demoMode: true` no `config.js`.

### Consumo
Com a simulação rodando, o ESP32 gera **12 mensagens a cada 10 s** (cerca de 4.300 por hora), e cada uma é uma chamada da Edge Function e uma linha na tabela. Confira os limites do plano gratuito do Supabase e do EMQX. Para reduzir o consumo, aumente `SEND_INTERVAL_MS` no `config.py` (por exemplo, `30000`).

## Integrantes
* Pedro Monteiro Silva
* Giulio Rafael Nogueira Cruz
* Jhuan Gustavo Pereira Costa
