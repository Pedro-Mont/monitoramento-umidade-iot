// Painel de monitoramento: busca leituras no Supabase (ou simula), avalia contra a faixa ideal
// do modo atual (dia/noite) e desenha hero, cards das lavouras e histórico.
{
  const cfg = window.APP_CONFIG || {};
  const PL = cfg.plantacoes || [];
  const TOL = cfg.tolerancia || { umidade: 5, temperatura: 2 };
  const STALE_MS = (cfg.staleThresholdSeconds || 60) * 1000;
  const LIMITE = cfg.historyLimit || 400;
  const PESO = { ok: 0, sem: 1, offline: 2, atencao: 3, critico: 4 };
  const TXT = { ok: "Ideal", sem: "Sem dados", offline: "Sem sinal", atencao: "Atenção", critico: "Crítico" };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n, d = 1) => Number(n).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const hora = (t) => new Date(t).toLocaleTimeString("pt-BR");
  const pior = (lista) => lista.reduce((a, b) => (PESO[b] > PESO[a] ? b : a), "ok");

  // Índice sensor -> plantação
  const IDX = {};
  PL.forEach((p) => p.sensores.forEach((s) => { IDX[s.id] = { p, s }; }));
  const IDS = Object.keys(IDX);

  const lerLocal = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const gravarLocal = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

  const estado = {
    noite: lerLocal("modoNoite") === "1",
    leituras: [], // ordem decrescente de tempo: { id, hum, temp, t }
    fonte: "carregando",
    motivo: "",
    filtro: "todas",
    soAlertas: false,
    limiteHist: 40
  };
  let cena = null;
  const series = {};

  // ---------- Regras ----------
  const faixa = (p) => p.ideal[estado.noite ? "noite" : "dia"];
  function avaliar(v, [min, max], tol) {
    if (v == null || Number.isNaN(v)) return "sem";
    if (v >= min && v <= max) return "ok";
    const dist = v < min ? min - v : v - max;
    return dist <= tol ? "atencao" : "critico";
  }
  function avaliarLeitura(l) {
    const f = faixa(IDX[l.id].p);
    const hum = avaliar(l.hum, f.umidade, TOL.umidade);
    const temp = l.temp == null ? "ok" : avaliar(l.temp, f.temperatura, TOL.temperatura);
    return { hum, temp, geral: pior([hum, temp]) };
  }
  function descrever(l, av) {
    const f = faixa(IDX[l.id].p);
    const partes = [];
    if (av.hum !== "ok") partes.push(`umidade ${l.hum < f.umidade[0] ? "baixa" : "alta"}`);
    if (av.temp !== "ok") partes.push(`temperatura ${l.temp < f.temperatura[0] ? "baixa" : "alta"}`);
    if (!partes.length) return "Ideal";
    const s = partes.join(" e ");
    return s[0].toUpperCase() + s.slice(1);
  }

  // ---------- Fonte de dados ----------
  const chaveOk = cfg.supabaseUrl && cfg.publicKey && !/SEU_PROJETO/.test(cfg.supabaseUrl) && !/SUA_CHAVE|AQUI/.test(cfg.publicKey);

  async function buscarVivo() {
    const url = `${cfg.supabaseUrl}/rest/v1/readings?select=device_id,humidity,temperature,created_at` +
      `&device_id=in.(${IDS.map(encodeURIComponent).join(",")})&order=created_at.desc&limit=${LIMITE}`;
    const res = await fetch(url, { headers: { apikey: cfg.publicKey, Authorization: `Bearer ${cfg.publicKey}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const dados = await res.json();
    return dados
      .filter((r) => IDX[r.device_id])
      .map((r) => ({ id: r.device_id, hum: Number(r.humidity), temp: r.temperature == null ? null : Number(r.temperature), t: Date.parse(r.created_at) }));
  }

  // Simulador: cada sensor segue o centro da faixa ideal do modo atual, com ruído e eventos de irregularidade
  const sim = { base: {}, eventos: [], leituras: [], iniciado: false };
  const centro = ([a, b]) => (a + b) / 2;
  function passoSim(t) {
    IDS.forEach((id) => {
      const f = faixa(IDX[id].p);
      const b = sim.base[id] || (sim.base[id] = { hum: centro(f.umidade) + (Math.random() - 0.5) * 6, temp: centro(f.temperatura) + (Math.random() - 0.5) * 3 });
      b.hum += (centro(f.umidade) - b.hum) * 0.08 + (Math.random() - 0.5) * 1.6;
      b.temp += (centro(f.temperatura) - b.temp) * 0.08 + (Math.random() - 0.5) * 0.5;
      let hum = b.hum, temp = b.temp;
      sim.eventos.forEach((e) => {
        if (e.id !== id) return;
        const rampa = Math.min(1, e.idade / 6);
        if (e.campo === "hum") hum += e.delta * rampa; else temp += e.delta * rampa;
      });
      sim.leituras.unshift({ id, hum: Math.max(0, Math.min(100, +hum.toFixed(1))), temp: +temp.toFixed(1), t });
    });
    sim.eventos.forEach((e) => { e.idade++; e.restante--; });
    sim.eventos = sim.eventos.filter((e) => e.restante > 0);
    if (Math.random() < 0.04) {
      const id = IDS[Math.floor(Math.random() * IDS.length)];
      const campo = Math.random() < 0.6 ? "hum" : "temp";
      const delta = (Math.random() < 0.5 ? -1 : 1) * (campo === "hum" ? 10 + Math.random() * 12 : 3 + Math.random() * 4);
      sim.eventos.push({ id, campo, delta, idade: 0, restante: 20 + Math.floor(Math.random() * 30) });
    }
    sim.leituras.length = Math.min(sim.leituras.length, IDS.length * 120);
  }
  function iniciarSim() {
    // Começa com uma borda do milho secando e a cana esquentando, para o painel abrir com exemplos de alerta
    sim.eventos.push({ id: "milho-s2", campo: "hum", delta: -18, idade: 0, restante: 90 });
    sim.eventos.push({ id: "cana-s3", campo: "temp", delta: 7, idade: 0, restante: 70 });
    const agora = Date.now();
    for (let i = 40; i >= 1; i--) passoSim(agora - i * 10000);
    sim.iniciado = true;
  }
  function usarSim(motivo) {
    if (!sim.iniciado) iniciarSim(); else passoSim(Date.now());
    estado.leituras = sim.leituras.slice(0, LIMITE);
    estado.fonte = "simulado";
    estado.motivo = motivo;
  }

  async function atualizar() {
    const modo = cfg.demoMode ?? "auto";
    if (modo === true) usarSim("o modo simulado está ligado em config.js");
    else if (!chaveOk && modo !== false) usarSim("a chave do Supabase não foi configurada em config.js");
    else {
      try {
        const vivas = await buscarVivo();
        if (vivas.length || modo === false) {
          estado.leituras = vivas;
          estado.fonte = "vivo";
          estado.motivo = vivas.length ? "" : "o Supabase ainda não tem leituras destes sensores";
        } else usarSim("o Supabase ainda não tem leituras destes sensores");
      } catch (err) {
        if (modo === false) { estado.fonte = "erro"; estado.motivo = `a API não respondeu (${err.message})`; }
        else usarSim(`a API do Supabase não respondeu (${err.message})`);
      }
    }
    desenhar();
  }

  // ---------- Desenho ----------
  const ICONES = {
    cafe: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><ellipse cx="16" cy="16" rx="9" ry="12" transform="rotate(25 16 16)"/><path d="M12 6c4 4 4 16 8 20" /></svg>',
    milho: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M16 4c4 3 5 9 4 15-1 4-2 6-4 7-2-1-3-3-4-7-1-6 0-12 4-15Z"/><path d="M13 11h6M12.5 15h7M13 19h6M16 5v20"/><path d="M16 26c-3 1-6 0-8-3M16 26c3 1 6 0 8-3"/></svg>',
    soja: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 24C6 14 14 6 26 6c0 12-8 20-20 18Z"/><circle cx="12" cy="19" r="2"/><circle cx="16.5" cy="14.5" r="2"/><circle cx="21" cy="10" r="2"/></svg>',
    cana: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M13 29V3M19 29V7"/><path d="M11 10h4M11 18h4M17 14h4M17 22h4"/><path d="M13 8c4-3 8-3 13-1M19 11c-3-4-7-6-12-6"/></svg>'
  };
  const ICONE_AVISO = '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 2 19 18H1L10 2Zm-1 6v5h2V8H9Zm0 6v2h2v-2H9Z"/></svg>';
  const ICONE_SELO = {
    ok: '<path d="m3 8 3 3 7-7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
    atencao: '<path d="M8 1 15 14H1L8 1Zm-1 5v4h2V6H7Zm0 5v2h2v-2H7Z" fill="currentColor"/>',
    critico: '<path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm-1 3h2v5H7V4Zm0 6h2v2H7v-2Z" fill="currentColor"/>',
    offline: '<path d="M2 8h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    sem: '<path d="M2 8h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
  };
  const selo = (st) => `<span class="selo ${st === "sem" ? "offline" : st}"><svg viewBox="0 0 16 16" aria-hidden="true">${ICONE_SELO[st]}</svg>${TXT[st]}</span>`;
  const rel = (t) => {
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    return s < 60 ? `há ${s} s` : s < 3600 ? `há ${Math.round(s / 60)} min` : `há ${Math.round(s / 3600)} h`;
  };
  const clsVal = (st) => (st === "critico" ? "fora" : st === "atencao" ? "perto" : "");

  function regua(v, [a, b], [lo, hi]) {
    const pct = (x) => Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100));
    return `<div class="regua" aria-hidden="true"><span class="ideal" style="left:${pct(a)}%;width:${pct(b) - pct(a)}%"></span>` +
      (v == null ? "" : `<span class="marca-val" style="left:${pct(v)}%"></span>`) + "</div>";
  }

  function sparkline(id, f) {
    const s = series[id] || [];
    if (s.length < 2) return '<div class="spark"></div>';
    const vals = s.map((l) => l.hum);
    const lo = Math.min(...vals, f[0]) - 3, hi = Math.max(...vals, f[1]) + 3;
    const y = (v) => 40 - ((v - lo) / (hi - lo)) * 40;
    const x = (i) => (i / (s.length - 1)) * 100;
    const d = s.map((l, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(l.hum).toFixed(2)}`).join("");
    const ult = s[s.length - 1];
    const cor = { ok: "var(--rio)", atencao: "var(--atencao)", critico: "var(--critico)" }[avaliarLeitura(ult).hum] || "var(--rio)";
    return `<div class="spark" data-sensor="${esc(id)}"><svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">` +
      `<rect class="banda" x="0" width="100" y="${y(f[1]).toFixed(2)}" height="${(y(f[0]) - y(f[1])).toFixed(2)}"/>` +
      `<path class="linha" d="${d}"/></svg>` +
      `<i class="ultimo" style="top:${((y(ult.hum) / 40) * 100).toFixed(1)}%;background:${cor}"></i></div>`;
  }

  function statusSensor(id, ult) {
    if (!ult) return "sem";
    if (estado.fonte === "vivo" && Date.now() - ult.t > STALE_MS) return "offline";
    return avaliarLeitura(ult).geral;
  }

  function desenhar() {
    const ultima = {};
    IDS.forEach((id) => { series[id] = []; });
    for (const l of estado.leituras) {
      if (!ultima[l.id]) ultima[l.id] = l;
      if (series[l.id].length < 24) series[l.id].push(l);
    }
    IDS.forEach((id) => series[id].reverse());

    const stSensor = {}, stPlant = {};
    IDS.forEach((id) => { stSensor[id] = statusSensor(id, ultima[id]); });
    PL.forEach((p) => { stPlant[p.id] = pior(p.sensores.map((s) => stSensor[s.id])); });

    desenharTopo(stSensor, stPlant, ultima);
    desenharCards(stSensor, stPlant, ultima);
    desenharHistorico();
    if (cena) cena.setStatus(stSensor, stPlant);
  }

  function desenharTopo(stSensor, stPlant, ultima) {
    const con = $("conexao");
    con.className = "conexao " + (estado.fonte === "vivo" ? "vivo" : estado.fonte === "simulado" ? "simulado" : "erro");
    con.querySelector("span").textContent = estado.fonte === "vivo" ? "Ao vivo" : estado.fonte === "simulado" ? "Dados simulados" : "Sem conexão";
    con.title = estado.motivo || "Leituras do Supabase";

    const alertas = IDS.filter((id) => stSensor[id] === "atencao" || stSensor[id] === "critico");
    const offline = IDS.filter((id) => stSensor[id] === "offline");
    const semDados = IDS.every((id) => stSensor[id] === "sem");
    const nomes = [...new Set(alertas.map((id) => IDX[id].p.nome.toLowerCase()))];
    const juntar = (arr) => (arr.length > 1 ? arr.slice(0, -1).join(", ") + " e " + arr[arr.length - 1] : arr[0]);
    let titulo;
    if (semDados) titulo = "Aguardando as primeiras leituras dos sensores";
    else if (alertas.length) titulo = `${alertas.length} ${alertas.length > 1 ? "sensores fora" : "sensor fora"} do ideal ${nomes.length > 1 ? "nas lavouras de" : "na lavoura de"} ${juntar(nomes)}`;
    else if (offline.length) titulo = `${offline.length} ${offline.length > 1 ? "sensores sem sinal" : "sensor sem sinal"}, o resto está no ideal`;
    else titulo = `As ${PL.length} lavouras estão dentro do ideal ${estado.noite ? "para a noite" : "agora"}`;
    $("heroTitulo").textContent = titulo;
    $("heroSub").textContent = `${PL.length} lavouras, ${IDS.length} sensores de umidade e temperatura do solo`;

    $("resumo").innerHTML = PL.map((p) => {
      const st = stPlant[p.id];
      return `<li><a href="#lavoura-${esc(p.id)}"><span class="ponto ${st}"></span><span class="nome">${esc(p.nome)}</span><span class="estado">${TXT[st]}</span></a></li>`;
    }).join("");

    const ts = Object.values(ultima).map((l) => l.t);
    const ultimaT = ts.length ? Math.max(...ts) : null;
    let nota = ultimaT ? `Última leitura às ${hora(ultimaT)}.` : "";
    if (estado.fonte === "simulado") nota += ` Mostrando dados simulados porque ${estado.motivo}.`;
    if (estado.fonte === "erro") nota += ` Não foi possível ler os sensores: ${estado.motivo}.`;
    $("heroNota").textContent = nota.trim();
    $("faixaModo").textContent = `Comparando com a faixa ideal ${estado.noite ? "da noite" : "do dia"}`;
  }

  function desenharCards(stSensor, stPlant, ultima) {
    $("cards").innerHTML = PL.map((p) => {
      const f = faixa(p);
      const st = stPlant[p.id];
      const problemas = [];
      p.sensores.forEach((s) => {
        const l = ultima[s.id], sst = stSensor[s.id];
        if (sst === "offline") problemas.push({ st: "offline", txt: `${s.nome} (${s.local}) sem leitura ${rel(l.t)}` });
        else if (sst === "atencao" || sst === "critico") {
          const av = avaliarLeitura(l), partes = [];
          if (av.hum !== "ok") partes.push(`umidade ${fmt(l.hum)}% (ideal ${f.umidade[0]}–${f.umidade[1]}%)`);
          if (av.temp !== "ok") partes.push(`temperatura ${fmt(l.temp)} °C (ideal ${f.temperatura[0]}–${f.temperatura[1]} °C)`);
          problemas.push({ st: sst, txt: `${s.nome} (${s.local}): ${partes.join(" e ")}` });
        }
      });
      const stAviso = pior(problemas.map((x) => x.st));
      const aviso = problemas.length
        ? `<div class="aviso ${stAviso === "ok" ? "offline" : stAviso}" role="alert">${ICONE_AVISO}<ul>${problemas.map((x) => `<li>${esc(x.txt)}</li>`).join("")}</ul></div>`
        : "";
      const sensoresHtml = p.sensores.map((s) => {
        const l = ultima[s.id];
        const av = l ? avaliarLeitura(l) : { hum: "sem", temp: "sem" };
        return `<div class="sensor">
          <div class="sensor-topo"><span class="sensor-nome">${esc(s.nome)}</span><span class="sensor-local">${esc(s.local)}</span></div>
          <div class="leituras">
            <div class="leitura umidade ${clsVal(av.hum)}"><div class="rot">Umidade</div><div class="val">${l ? fmt(l.hum) : "--"}<small>%</small></div>${regua(l?.hum, f.umidade, [0, 100])}</div>
            <div class="leitura ${clsVal(av.temp)}"><div class="rot">Temperatura</div><div class="val">${l && l.temp != null ? fmt(l.temp) : "--"}<small>°C</small></div>${regua(l?.temp, f.temperatura, [0, 45])}</div>
          </div>
          ${sparkline(s.id, f.umidade)}
          <div class="spark-rot"><span>Umidade nas últimas ${series[s.id].length} leituras</span></div>
          <div class="sensor-rodape">${selo(stSensor[s.id])}<span>${l ? rel(l.t) : "nenhuma leitura"}</span></div>
        </div>`;
      }).join("");
      return `<article class="card ${st}" id="lavoura-${esc(p.id)}" aria-label="Lavoura de ${esc(p.nome)}">
        ${aviso}
        <div class="card-corpo">
          <div class="card-id">
            <header><div class="icone-cultura">${ICONES[p.id] || ICONES.soja}</div><div><h3>${esc(p.nome)}</h3><p class="meta">${esc(p.talhao)}, ${esc(p.area)}</p></div></header>
            <dl class="faixas">
              <div><dt>Umidade ideal</dt><dd>${f.umidade[0]}–${f.umidade[1]}%</dd></div>
              <div><dt>Temperatura ideal</dt><dd>${f.temperatura[0]}–${f.temperatura[1]} °C</dd></div>
            </dl>
            ${selo(st)}
          </div>
          <div class="sensores">${sensoresHtml}</div>
        </div>
      </article>`;
    }).join("");
  }

  function desenharHistorico() {
    const irregulares = {};
    const avs = new Map();
    estado.leituras.forEach((l) => {
      const av = avaliarLeitura(l);
      avs.set(l, av);
      if (av.geral !== "ok") irregulares[IDX[l.id].p.id] = (irregulares[IDX[l.id].p.id] || 0) + 1;
    });
    const total = Object.values(irregulares).reduce((a, b) => a + b, 0);
    const opcoes = [{ id: "todas", nome: "Todas", n: total }, ...PL.map((p) => ({ id: p.id, nome: p.nome, n: irregulares[p.id] || 0 }))];
    $("chips").innerHTML = opcoes.map((o) =>
      `<button type="button" class="chip" data-filtro="${esc(o.id)}" aria-pressed="${estado.filtro === o.id}">${esc(o.nome)}` +
      (o.n ? `<span class="qtd" title="${o.n} leituras fora do ideal">${o.n}</span>` : "") + "</button>").join("");

    const lista = estado.leituras.filter((l) =>
      (estado.filtro === "todas" || IDX[l.id].p.id === estado.filtro) && (!estado.soAlertas || avs.get(l).geral !== "ok"));
    const corpo = $("histCorpo");
    if (!lista.length) {
      corpo.innerHTML = `<tr><td colspan="6" class="vazio">${estado.leituras.length ? "Nenhuma leitura irregular neste filtro. Desmarque “Só irregularidades” para ver todas." : "Nenhuma leitura recebida ainda."}</td></tr>`;
      $("maisHist").hidden = true;
      return;
    }
    const hoje = new Date().toDateString(), ontem = new Date(Date.now() - 864e5).toDateString();
    let diaAtual = "";
    const linhas = [];
    lista.slice(0, estado.limiteHist).forEach((l) => {
      const d = new Date(l.t).toDateString();
      if (d !== diaAtual) {
        diaAtual = d;
        const rot = d === hoje ? "Hoje" : d === ontem ? "Ontem" : new Date(l.t).toLocaleDateString("pt-BR");
        linhas.push(`<tr class="dia"><td colspan="6">${rot}</td></tr>`);
      }
      const { p, s } = IDX[l.id];
      const av = avs.get(l);
      linhas.push(`<tr class="${av.geral}"><td class="hora">${hora(l.t)}</td><td>${esc(p.nome)}</td><td>${esc(s.nome)}</td>` +
        `<td class="num ${clsVal(av.hum)}">${fmt(l.hum)}%</td><td class="num ${clsVal(av.temp)}">${l.temp == null ? "--" : fmt(l.temp) + " °C"}</td>` +
        `<td>${descrever(l, av)}</td></tr>`);
    });
    corpo.innerHTML = linhas.join("");
    $("maisHist").hidden = lista.length <= estado.limiteHist;
  }

  // ---------- Interação ----------
  function aplicarModo() {
    document.documentElement.dataset.modo = estado.noite ? "noite" : "dia";
    $("modoNoite").setAttribute("aria-pressed", String(estado.noite));
    if (cena) cena.setNoite(estado.noite);
  }
  $("modoNoite").addEventListener("click", () => {
    estado.noite = !estado.noite;
    gravarLocal("modoNoite", estado.noite ? "1" : "0");
    aplicarModo();
    desenhar();
  });
  $("chips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-filtro]");
    if (!b) return;
    estado.filtro = b.dataset.filtro;
    estado.limiteHist = 40;
    desenharHistorico();
  });
  $("soAlertas").addEventListener("change", (e) => { estado.soAlertas = e.target.checked; estado.limiteHist = 40; desenharHistorico(); });
  $("maisHist").addEventListener("click", () => { estado.limiteHist += 40; desenharHistorico(); });

  // Dica ao passar o mouse na linha de umidade
  const dica = $("dica");
  $("cards").addEventListener("pointermove", (e) => {
    const sp = e.target.closest(".spark[data-sensor]");
    if (!sp) { dica.hidden = true; return; }
    const s = series[sp.dataset.sensor] || [];
    if (!s.length) return;
    const r = sp.getBoundingClientRect();
    const i = Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (s.length - 1));
    const l = s[i];
    dica.textContent = `${fmt(l.hum)}% às ${hora(l.t)}`;
    dica.style.left = r.left + (i / Math.max(1, s.length - 1)) * r.width + "px";
    dica.style.top = r.top + "px";
    dica.hidden = false;
  });
  $("cards").addEventListener("pointerleave", () => { dica.hidden = true; });
  window.addEventListener("scroll", () => { dica.hidden = true; }, { passive: true });

  // ---------- Início ----------
  try {
    cena = window.CampoCena.iniciar($("cena"), $("rotulos"), PL, (id) => {
      document.getElementById(`lavoura-${id}`)?.scrollIntoView({ block: "start" });
    });
  } catch (err) {
    console.warn("Cena 3D indisponível:", err);
    $("campo").classList.add("sem-3d");
  }
  aplicarModo();
  atualizar();
  setInterval(atualizar, cfg.refreshIntervalMs || 5000);
}
