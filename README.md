# Monitoramento IoT de Umidade com Alerta

Sistema de monitoramento de umidade em tempo real desenvolvido para a disciplina de Arquitetura de Computadores. O projeto simula um microcontrolador ESP32 com sensor DHT22 no Wokwi, envia telemetria segura via MQTT (EMQX), processa e armazena os dados em nuvem (Supabase) e exibe o status e alertas em um painel web (Cloudflare Pages).

## Links do Projeto
* **Simulação Wokwi:** https://wokwi.com/projects/481678427450143745
* **Painel Publicado (Cloudflare Pages):** https://monitoramento-umidade-jpg.pages.dev/

## Arquitetura da Solução (Opção A — com MQTT)
`ESP32 + DHT22 (Wokwi)` → `EMQX Serverless (MQTT sobre TLS - porta 8883)` → `Supabase Edge Function /ingest (HTTPS POST)` → `PostgreSQL (Supabase)` → `Painel Web (Cloudflare Pages via REST API)`

### Regras de Negócio
* **Intervalo de leitura:** a cada 2 segundos (com validação de faixa 0–100% e média móvel das últimas 3 leituras).
* **Intervalo de envio:** a cada 10 segundos.
* **Condições de alerta:**
  * `BAIXA`: umidade < 40% (LED aceso no ESP32 + banner de alerta no painel).
  * `NORMAL`: umidade entre 40% e 90% (LED apagado).
  * `ALTA`: umidade > 90% (LED aceso no ESP32 + banner de alerta no painel).
* **Detecção offline:** o painel alerta "Dados desatualizados" se não houver nova leitura há mais de 30 segundos.

## Estrutura do Repositório
* `wokwi/`: código MicroPython do ESP32 (`main.py`), circuito (`diagram.json`), cliente MQTT e modelos de configuração sem credenciais.
* `supabase/`: script de criação da tabela e permissões (`schema.sql`) e código da Edge Function (`functions/ingest/index.ts`).
* `emqx/`: regra SQL (`regra.sql`) e template do corpo HTTP (`corpo_http.txt`).
* `frontend/`: frontend estático (`index.html`) e modelo de configuração (`config.example.js`).
* `testes/`: payloads JSON para testes manuais na API e no broker.

## Como Reproduzir
1. **Supabase:** Crie um projeto, execute `supabase/schema.sql` no SQL Editor, cadastre o segredo `INGEST_KEY` em Edge Functions > Secrets e faça o deploy de `supabase/functions/ingest/index.ts` com *Verify JWT* desativado.
2. **EMQX:** Crie um deployment Serverless, baixe o certificado CA, crie um usuário com permissão de *Publish* apenas no tópico `grupo/umidade/telemetria`, configure o Conector HTTP apontando para o Supabase e crie a Regra usando `emqx/regra.sql` enviando `${.}` para `/functions/v1/ingest` com o header `x-ingest-key`.
3. **Wokwi:** Copie os arquivos de `wokwi/`, renomeie `config.example.py` para `config.py` e `ca_cert.example.py` para `ca_cert.py`, preencha com o domínio/senha do EMQX e o certificado CA, e inicie a simulação.
4. **Frontend:** Renomeie `site/config.example.js` para `site/config.js`, preencha a URL e a chave `sb_publishable_` do Supabase e faça o deploy da pasta `site/` no Cloudflare Pages.

## Integrantes
* Pedro Monteiro Silva
* Giulio Rafael Nogueira Cruz
* Jhuan Gustavo Pereira Costa
