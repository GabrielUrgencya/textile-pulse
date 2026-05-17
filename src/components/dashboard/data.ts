// Mock data for the textile production dashboard
export const factoryHealth = {
  score: 87,
  status: "OPERATIONAL",
  trend: +2.4,
  lastUpdate: "há 47 segundos",
  alerts: [
    { level: "warn", text: "Lote #LT-2841 parado há 3h14 na Costura B" },
    { level: "warn", text: "Facção Aurora com 2 dias de atraso na entrega" },
    { level: "info", text: "Ritmo atual 6% abaixo da meta horária" },
  ],
};

export const goals = [
  { label: "Hoje", produced: 1842, target: 2100, unit: "peças" },
  { label: "Semana", produced: 9420, target: 10500, unit: "peças" },
  { label: "Mês", produced: 38240, target: 45000, unit: "peças" },
];

export const projection = {
  rate: 218,           // peças/hora últimas 2h
  shiftHoursLeft: 2.5,
  projected: 2387,
  target: 2100,
  delta: +287,
};

export const hourlyProduction = [
  { hour: "07h", value: 184, ideal: 175 },
  { hour: "08h", value: 212, ideal: 175 },
  { hour: "09h", value: 198, ideal: 175 },
  { hour: "10h", value: 240, ideal: 175 },
  { hour: "11h", value: 168, ideal: 175 },
  { hour: "12h", value: 92,  ideal: 175 },
  { hour: "13h", value: 156, ideal: 175 },
  { hour: "14h", value: 226, ideal: 175 },
  { hour: "15h", value: 218, ideal: 175 },
  { hour: "16h", value: 148, ideal: 175 },
];

export const stages = [
  { name: "Corte",        pieces: 412, lots: 14, avgTime: "2h10", expected: "2h30", over: false },
  { name: "Costura A",    pieces: 638, lots: 22, avgTime: "4h05", expected: "3h45", over: true  },
  { name: "Costura B",    pieces: 524, lots: 19, avgTime: "5h20", expected: "3h45", over: true  },
  { name: "Acabamento",   pieces: 287, lots: 11, avgTime: "1h45", expected: "2h00", over: false },
  { name: "Inspeção",     pieces: 196, lots:  8, avgTime: "0h55", expected: "1h10", over: false },
  { name: "Embalagem",    pieces: 142, lots:  6, avgTime: "0h38", expected: "0h45", over: false },
];

export const productionOrders = [
  { id: "OP-4821", name: "Camisa Linho Beach", total: 1200, done: 1086, due: "20 Mai", status: "EM DIA",   onTime: true  },
  { id: "OP-4818", name: "Vestido Midi Crepe", total: 800,  done: 412,  due: "22 Mai", status: "ATENÇÃO", onTime: true  },
  { id: "OP-4815", name: "Calça Alfaiataria",  total: 2400, done: 1980, due: "18 Mai", status: "ATRASO",  onTime: false },
  { id: "OP-4812", name: "Blazer Oversized",   total: 600,  done: 540,  due: "25 Mai", status: "EM DIA",   onTime: true  },
  { id: "OP-4809", name: "Saia Plissada Tencel", total: 950, done: 720, due: "21 Mai", status: "EM DIA",   onTime: true },
];

export const stalledBatches = [
  { code: "LT-2841", stage: "Costura B",  hours: 3.2, op: "OP-4815", operator: "M. Andrade" },
  { code: "LT-2839", stage: "Inspeção",   hours: 2.4, op: "OP-4818", operator: "R. Tavares" },
  { code: "LT-2836", stage: "Acabamento", hours: 2.1, op: "OP-4812", operator: "C. Belém"   },
];

export const ranking = [
  { name: "Sofia Camargo",  sector: "Costura A",  score: 142, target: 120 },
  { name: "Júlio Bastos",   sector: "Costura B",  score: 138, target: 120 },
  { name: "Letícia Moraes", sector: "Acabamento", score: 129, target: 110 },
  { name: "Eduardo Pires",  sector: "Costura A",  score: 121, target: 120 },
  { name: "Marina Rocha",   sector: "Inspeção",   score: 118, target: 100 },
];

export const factions = [
  { name: "Aurora Confecções", pieces: 1840, daysLeft: -2, defectRate: 2.1, lots: 7 },
  { name: "Norte Têxtil",      pieces: 920,  daysLeft:  3, defectRate: 1.4, lots: 4 },
  { name: "Atelier Belém",     pieces: 1240, daysLeft:  5, defectRate: 0.9, lots: 5 },
  { name: "Vértice Studio",    pieces: 480,  daysLeft:  1, defectRate: 3.2, lots: 2 },
];

export const allowance = {
  ratePct: 1.8,
  targetPct: 2.5,
  lostMonth: 688,
  lostToday: 24,
  within: true,
};

export const defects = {
  reworkQueue: 142,
  today: 24,
  month: 688,
  byType: [
    { type: "Costura",   value: 312 },
    { type: "Tecido",    value: 198 },
    { type: "Aviamento", value: 124 },
    { type: "Outro",     value: 54  },
  ],
};

export const activity = [
  { time: "16:42", op: "M. Andrade",  action: "Bipagem",   batch: "LT-2843", stage: "Costura A" },
  { time: "16:41", op: "Sofia Camargo", action: "Bipagem", batch: "LT-2842", stage: "Acabamento" },
  { time: "16:39", op: "R. Tavares",  action: "Defeito",   batch: "LT-2839", stage: "Inspeção" },
  { time: "16:36", op: "Sistema",     action: "OP concluída", batch: "OP-4807", stage: "—" },
  { time: "16:34", op: "C. Belém",    action: "Bipagem",   batch: "LT-2840", stage: "Embalagem" },
  { time: "16:31", op: "Aurora",      action: "Retorno facção", batch: "LT-2790", stage: "Inspeção" },
  { time: "16:28", op: "L. Moraes",   action: "Bipagem",   batch: "LT-2838", stage: "Acabamento" },
];

export const tickers = [
  { label: "Peças/h", value: "218", trend: +6.2 },
  { label: "OEE",     value: "87%", trend: +1.4 },
  { label: "Allowance", value: "1.8%", trend: -0.3 },
  { label: "Lotes ativos", value: "80", trend: 0 },
  { label: "Operadores", value: "42", trend: 0 },
  { label: "OPs abertas", value: "12", trend: +1 },
];
