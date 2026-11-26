# Monitoramento IoT de Umidade com Alerta

Sistema de monitoramento de umidade em tempo real desenvolvido para a disciplina de Arquitetura de Computadores. O projeto simula um microcontrolador ESP32 com sensor DHT22 no Wokwi, envia telemetria segura via MQTT (EMQX), processa e armazena os dados em nuvem (Supabase) e exibe o status e alertas em um painel web (Cloudflare Pages).

## Links do Projeto
* **Simulação Wokwi:** https://wokwi.com/projects/481678427450143745
* **Painel Publicado (Cloudflare Pages):** https://monitoramento-umidade-jpg.pages.dev/

## Arquitetura da Solução (Opção A — com MQTT)
`ESP32 + DHT22 (Wokwi)` → `EMQX Serverless (MQTT sobre TLS - porta 8883)` → `Supabase Edge Function /ingest (HTTPS POST)` → `PostgreSQL (Supabase)` → `Painel Web (Cloudflare Pages via REST API)`

### Painel (frontend)
* **4 lavouras de larga escala** (café, milho, soja e cana), cada uma com **3 sensores** de umidade e temperatura do solo (`cafe-s1` … `cana-s3`).
* **Cena 3D (three.js)** no topo com os 4 talhões, o canal de irrigação e os sensores; o sensor acende em amarelo/vermelho quando sai do ideal. Clique num talhão para ir ao card dele, arraste para girar.
* **Cards por lavoura** com faixa ideal, leitura atual, régua da faixa, minigráfico das últimas 24 leituras de umidade e aviso destacado quando algum sensor sai do ideal ou fica sem sinal.
* **Histórico em linha do tempo** com filtro por lavoura e opção "Só irregularidades".
* **Modo noite:** troca as faixas ideais para os valores noturnos de cada lavoura e coloca o site no tema escuro (a escolha fica salva no navegador).
* **Modo simulado:** se a chave do Supabase não estiver configurada ou a API não tiver leituras, o painel gera dados simulados e avisa no topo (`demoMode` em `config.js`).

### Regras de alerta
* As faixas ideais (dia e noite) ficam em `frontend/config.js` → `plantacoes[].ideal` e são **valores de referência** para ajustar com um agrônomo.
* **Atenção:** fora da faixa por até 5 pontos de umidade ou 2 °C (`tolerancia`). **Crítico:** além disso.
* **Sem sinal:** sensor sem leitura há mais de `staleThresholdSeconds` (60 s).
* A coluna `alert_status` gravada pela Edge Function continua com a regra antiga (40%/90%); o painel recalcula a situação de cada leitura pela faixa da lavoura e do modo.

### ESP32 (Wokwi)
* O DHT22 do circuito é o **sensor 1 do café** (`cafe-s1`); mude a umidade dele no Wokwi para ver o alerta aparecer no painel. O LED acende quando ele sai de 60–80%.
* Os outros 11 sensores são simulados no próprio ESP32 em torno da faixa ideal de cada lavoura, com eventos ocasionais de solo secando, encharcando ou esquentando.
* A cada 10 s o ESP32 publica um lote de 12 mensagens no tópico `grupo/umidade/telemetria` (o contrato do payload não mudou).

## Estrutura do Repositório
* `wokwi/`: código MicroPython do ESP32 (`main.py`), circuito (`diagram.json`), cliente MQTT e modelos de configuração sem credenciais.
* `supabase/`: script de criação da tabela e permissões (`schema.sql`) e código da Edge Function (`functions/ingest/index.ts`).
* `emqx/`: regra SQL (`regra.sql`) e template do corpo HTTP (`corpo_http.txt`).
* `frontend/`: painel estático (`index.html`, `styles.css`, `app.js`, `scene.js`) e configuração (`config.example.js` → `config.js`).
* `testes/`: payloads JSON para testes manuais na API e no broker.

## Como Reproduzir
1. **Supabase:** Crie um projeto, execute `supabase/schema.sql` no SQL Editor, cadastre o segredo `INGEST_KEY` em Edge Functions > Secrets e faça o deploy de `supabase/functions/ingest/index.ts` com *Verify JWT* desativado.
2. **EMQX:** Crie um deployment Serverless, baixe o certificado CA, crie um usuário com permissão de *Publish* apenas no tópico `grupo/umidade/telemetria`, configure o Conector HTTP apontando para o Supabase e crie a Regra usando `emqx/regra.sql` enviando `${.}` para `/functions/v1/ingest` com o header `x-ingest-key`.
3. **Wokwi:** Copie os arquivos de `wokwi/`, renomeie `config.example.py` para `config.py` e `ca_cert.example.py` para `ca_cert.py`, preencha com o domínio/senha do EMQX e o certificado CA, e inicie a simulação.
4. **Frontend:** Copie `frontend/config.example.js` para `frontend/config.js`, preencha a URL e a chave `sb_publishable_` do Supabase e faça o deploy da pasta `frontend/` no Cloudflare Pages. Para testar sem backend, use `demoMode: true`.

## Integrantes
* Pedro Monteiro Silva
* Giulio Rafael Nogueira Cruz
* Jhuan Gustavo Pereira Costa
