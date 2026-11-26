// Configuração do painel (veja config.example.js para a explicação de cada campo)
window.APP_CONFIG = {
  supabaseUrl: "https://ykmthntxisvhdelebmvt.supabase.co",
  publicKey: "sb_publishable_bfjyuMuSPrBWi-KMOYtcPw_9WBH5KlP",

  // "auto": usa o Supabase e cai para dados simulados se não houver dados
  // true: sempre simulado | false: nunca simula (mostra o erro)
  demoMode: "auto",

  staleThresholdSeconds: 60, // sensor sem leitura há mais que isso = desatualizado
  refreshIntervalMs: 5000,
  historyLimit: 400, // quantas leituras buscar por atualização (todas as lavouras)

  // Quanto um valor pode sair da faixa ideal antes de virar "crítico"
  tolerancia: { umidade: 5, temperatura: 2 },

  // Faixas ideais de umidade (%) e temperatura do solo (°C), de dia e de noite.
  // Valores de referência para o projeto: ajuste com o agrônomo responsável.
  plantacoes: [
    {
      id: "cafe",
      nome: "Café",
      talhao: "Talhão A",
      area: "420 ha",
      sensores: [
        { id: "cafe-s1", nome: "Sensor 1", local: "Encosta norte" },
        { id: "cafe-s2", nome: "Sensor 2", local: "Meia encosta" },
        { id: "cafe-s3", nome: "Sensor 3", local: "Baixada" }
      ],
      ideal: {
        dia:   { umidade: [60, 80], temperatura: [18, 28] },
        noite: { umidade: [55, 75], temperatura: [14, 22] }
      }
    },
    {
      id: "milho",
      nome: "Milho",
      talhao: "Talhão B",
      area: "610 ha",
      sensores: [
        { id: "milho-s1", nome: "Sensor 1", local: "Pivô central" },
        { id: "milho-s2", nome: "Sensor 2", local: "Borda leste" },
        { id: "milho-s3", nome: "Sensor 3", local: "Borda oeste" }
      ],
      ideal: {
        dia:   { umidade: [60, 85], temperatura: [20, 32] },
        noite: { umidade: [55, 80], temperatura: [15, 24] }
      }
    },
    {
      id: "soja",
      nome: "Soja",
      talhao: "Talhão C",
      area: "880 ha",
      sensores: [
        { id: "soja-s1", nome: "Sensor 1", local: "Faixa 1" },
        { id: "soja-s2", nome: "Sensor 2", local: "Faixa 4" },
        { id: "soja-s3", nome: "Sensor 3", local: "Faixa 7" }
      ],
      ideal: {
        dia:   { umidade: [65, 85], temperatura: [20, 30] },
        noite: { umidade: [60, 80], temperatura: [15, 24] }
      }
    },
    {
      id: "cana",
      nome: "Cana",
      talhao: "Talhão D",
      area: "1.250 ha",
      sensores: [
        { id: "cana-s1", nome: "Sensor 1", local: "Várzea" },
        { id: "cana-s2", nome: "Sensor 2", local: "Canal de irrigação" },
        { id: "cana-s3", nome: "Sensor 3", local: "Carreador sul" }
      ],
      ideal: {
        dia:   { umidade: [70, 90], temperatura: [22, 34] },
        noite: { umidade: [65, 85], temperatura: [18, 26] }
      }
    }
  ]
};
