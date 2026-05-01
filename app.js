import { createClient } from "@supabase/supabase-js";

const STORAGE_KEY = "atlas-finance-state-v2";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const FIXED_NOW = "2026-05-01T12:00:00";

const defaultCategoryBudgets = [
  { category: "housing", label: "Moradia", monthly_budget: 2200, accent: "#5ea6ff" },
  { category: "food", label: "Alimentacao", monthly_budget: 1400, accent: "#ffc670" },
  { category: "transport", label: "Transporte", monthly_budget: 750, accent: "#b7a7ff" },
  { category: "health", label: "Saude", monthly_budget: 680, accent: "#7ef0c9" },
  { category: "leisure", label: "Lazer", monthly_budget: 900, accent: "#ff8875" },
  { category: "education", label: "Educacao", monthly_budget: 600, accent: "#93b6ff" },
  { category: "income", label: "Renda", monthly_budget: 0, accent: "#7ef0c9" },
];

const defaultVaultGoals = [
  { name: "Reserva de liquidez", objective: "Protecao", target: 25000, accent: "#7ef0c9" },
  { name: "Quitacao de divida", objective: "Reducao de passivo", target: 12000, accent: "#ff8875" },
  { name: "Cofre de crescimento", objective: "Acumular riqueza", target: 18000, accent: "#5ea6ff" },
];

const budgetTargets = {
  essentials: 0.5,
  lifestyle: 0.2,
  wealth: 0.2,
  debt: 0.1,
};

const defaultState = {
  transactions: [],
  recurring: [],
  categoryBudgets: defaultCategoryBudgets,
  vaultGoals: defaultVaultGoals,
};

const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const supabase = hasSupabaseConfig
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;

let state = structuredClone(defaultState);
let persistenceMode = hasSupabaseConfig ? "supabase" : "local";
let syncMessage = hasSupabaseConfig
  ? "Conectando com o banco..."
  : "Supabase ainda nao configurado. Usando armazenamento local temporario.";
let syncTone = hasSupabaseConfig ? "warning" : "warning";

const el = {
  transactionForm: document.querySelector("#transactionForm"),
  recurringForm: document.querySelector("#recurringForm"),
  transactionKind: document.querySelector('#transactionForm select[name="kind"]'),
  transactionCategory: document.querySelector('#transactionForm select[name="category"]'),
  recurringCategory: document.querySelector('#recurringForm select[name="category"]'),
  netWorthValue: document.querySelector("#netWorthValue"),
  trendPill: document.querySelector("#trendPill"),
  forecastNarrative: document.querySelector("#forecastNarrative"),
  topMetrics: document.querySelector("#topMetrics"),
  vaultsGrid: document.querySelector("#vaultsGrid"),
  budgetSummary: document.querySelector("#budgetSummary"),
  budgetBars: document.querySelector("#budgetBars"),
  yearlyChart: document.querySelector("#yearlyChart"),
  yearSummaryStrip: document.querySelector("#yearSummaryStrip"),
  recurringList: document.querySelector("#recurringList"),
  alertsList: document.querySelector("#alertsList"),
  insightsList: document.querySelector("#insightsList"),
  ledgerList: document.querySelector("#ledgerList"),
  sidebarForecast: document.querySelector("#sidebarForecast"),
  exportButton: document.querySelector("#exportButton"),
  syncGoalsButton: document.querySelector("#syncGoalsButton"),
  syncStatus: document.querySelector("#syncStatus"),
};

bootstrap();

async function bootstrap() {
  hydrateSelects();
  hydrateFormDates();
  bindEvents();
  render();
  await initializeState();
}

function bindEvents() {
  el.transactionForm.addEventListener("submit", handleTransactionSubmit);
  el.recurringForm.addEventListener("submit", handleRecurringSubmit);
  el.transactionKind.addEventListener("change", syncTransactionCategoryOptions);
  el.exportButton.addEventListener("click", handleExportSummary);
  el.syncGoalsButton.addEventListener("click", () => {
    document.querySelector("#vaultsPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.querySelectorAll("[data-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.querySelector(button.dataset.target);
      if (target) {
        document.querySelectorAll(".nav-chip, .dock-pill").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

async function initializeState() {
  if (!supabase) {
    state = loadLocalState();
    syncMessage = "Banco ainda nao conectado. Os dados ficam apenas neste navegador ate voce configurar o Supabase.";
    syncTone = "warning";
    render();
    return;
  }

  try {
    const [transactionsResult, recurringResult, budgetsResult, vaultsResult] = await Promise.all([
      supabase.from("transactions").select("*").order("transaction_at", { ascending: false }),
      supabase.from("recurring_expenses").select("*").order("start_date", { ascending: false }),
      supabase.from("category_budgets").select("*").order("label", { ascending: true }),
      supabase.from("vault_goals").select("*").order("display_order", { ascending: true }),
    ]);

    const results = [transactionsResult, recurringResult, budgetsResult, vaultsResult];
    const failed = results.find((result) => result.error);

    if (failed) {
      throw failed.error;
    }

    state = {
      transactions: transactionsResult.data.map(mapTransactionRow),
      recurring: recurringResult.data.map(mapRecurringRow),
      categoryBudgets: budgetsResult.data.length ? budgetsResult.data : defaultCategoryBudgets,
      vaultGoals: vaultsResult.data.length ? vaultsResult.data : defaultVaultGoals,
    };

    persistLocalSnapshot();
    syncMessage = "Supabase conectado. Historico iniciado do zero e pronto para uso.";
    syncTone = "positive";
  } catch (error) {
    console.error(error);
    persistenceMode = "local";
    state = loadLocalState();
    syncMessage = "Nao foi possivel ler o Supabase agora. Mantive um fallback local para nao travar o uso.";
    syncTone = "negative";
  }

  render();
}

async function handleTransactionSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const date = form.get("date");
  const time = form.get("time");
  const transaction = {
    id: crypto.randomUUID(),
    kind: form.get("kind"),
    category: form.get("category"),
    amount: Number(form.get("amount")),
    title: String(form.get("title")).trim(),
    dateTime: `${date}T${time}:00`,
    vault: String(form.get("vault")).trim() || resolveVaultName(form.get("category"), state.vaultGoals),
    note: String(form.get("note")).trim(),
  };

  state.transactions.unshift(transaction);
  persistLocalSnapshot();
  syncMessage = persistenceMode === "supabase" ? "Salvando transacao..." : "Transacao salva localmente.";
  syncTone = "warning";
  render();

  const saved = await saveTransaction(transaction);
  if (!saved) {
    state.transactions = state.transactions.filter((item) => item.id !== transaction.id);
    syncMessage = "Falha ao salvar no banco. A transacao foi removida para manter consistencia.";
    syncTone = "negative";
    render();
    return;
  }

  event.currentTarget.reset();
  syncTransactionCategoryOptions();
  hydrateFormDates();
  syncMessage = persistenceMode === "supabase"
    ? "Transacao salva no Supabase."
    : "Transacao salva localmente. Configure o Supabase para persistencia remota.";
  syncTone = "positive";
  render();
}

async function handleRecurringSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const recurring = {
    id: crypto.randomUUID(),
    title: String(form.get("title")).trim(),
    category: form.get("category"),
    amount: Number(form.get("amount")),
    startDate: form.get("startDate"),
    months: Number(form.get("months")),
  };

  state.recurring.unshift(recurring);
  persistLocalSnapshot();
  syncMessage = persistenceMode === "supabase" ? "Salvando recorrencia..." : "Recorrencia salva localmente.";
  syncTone = "warning";
  render();

  const saved = await saveRecurring(recurring);
  if (!saved) {
    state.recurring = state.recurring.filter((item) => item.id !== recurring.id);
    syncMessage = "Falha ao salvar recorrencia no banco.";
    syncTone = "negative";
    render();
    return;
  }

  event.currentTarget.reset();
  hydrateFormDates();
  syncMessage = persistenceMode === "supabase"
    ? "Recorrencia salva no Supabase."
    : "Recorrencia salva localmente. Configure o Supabase para persistencia remota.";
  syncTone = "positive";
  render();
}

async function saveTransaction(transaction) {
  if (!supabase) {
    persistenceMode = "local";
    persistLocalSnapshot();
    return true;
  }

  const { error } = await supabase.from("transactions").insert({
    id: transaction.id,
    kind: transaction.kind,
    category: transaction.category,
    amount: transaction.amount,
    title: transaction.title,
    transaction_at: transaction.dateTime,
    vault: transaction.vault,
    note: transaction.note || null,
  });

  if (error) {
    console.error(error);
    return false;
  }

  persistenceMode = "supabase";
  persistLocalSnapshot();
  return true;
}

async function saveRecurring(recurring) {
  if (!supabase) {
    persistenceMode = "local";
    persistLocalSnapshot();
    return true;
  }

  const { error } = await supabase.from("recurring_expenses").insert({
    id: recurring.id,
    title: recurring.title,
    category: recurring.category,
    amount: recurring.amount,
    start_date: recurring.startDate,
    months: recurring.months,
  });

  if (error) {
    console.error(error);
    return false;
  }

  persistenceMode = "supabase";
  persistLocalSnapshot();
  return true;
}

function render() {
  const analytics = buildAnalytics(state);
  renderSyncStatus();
  renderHero(analytics);
  renderVaults(analytics);
  renderBudget(analytics);
  renderYearlyChart(analytics);
  renderRecurring(analytics);
  renderAlerts(analytics);
  renderInsights(analytics);
  renderLedger(analytics);
  renderSidebarForecast(analytics);
}

function renderSyncStatus() {
  el.syncStatus.innerHTML = `
    <p class="eyebrow">Persistencia</p>
    <h2>${persistenceMode === "supabase" ? "Supabase ativo" : "Modo local"}</h2>
    <p class="muted">${syncMessage}</p>
  `;
  el.syncStatus.className = `sidebar-card compact tone-${syncTone}`;
}

function handleExportSummary() {
  const analytics = buildAnalytics(state);
  const payload = [
    "Atlas Finance · Resumo",
    `Saldo liquido: ${currency(analytics.currentNet)}`,
    `Media mensal de gastos: ${currency(analytics.avgMonthlyExpense)}`,
    `Sobra prevista: ${currency(analytics.projectedRemainder)}`,
    `Status: ${analytics.trendLabel}`,
    "",
    "Alertas:",
    ...(analytics.alerts.length
      ? analytics.alerts.map((item) => `- ${item.title}: ${item.message}`)
      : ["- Nenhum alerta ativo no momento."]),
    "",
    "Insights:",
    ...(analytics.insights.length
      ? analytics.insights.map((item) => `- ${item.title}: ${item.message}`)
      : ["- Ainda sem dados suficientes para recomendar acoes."]),
  ].join("\n");

  const blob = new Blob([payload], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "atlas-finance-resumo.txt";
  link.click();
  URL.revokeObjectURL(url);
}

function renderHero(analytics) {
  el.netWorthValue.textContent = currency(analytics.currentNet);
  el.forecastNarrative.textContent = analytics.forecastNarrative;
  el.trendPill.textContent = analytics.trendLabel;
  el.trendPill.className = `status-pill ${analytics.trendTone}`;

  el.topMetrics.innerHTML = [
    metricCard("Media mensal de gastos", currency(analytics.avgMonthlyExpense)),
    metricCard("Dias para saldo negativo", analytics.daysUntilNegativeText),
    metricCard("Sobra prevista", currency(analytics.projectedRemainder)),
  ].join("");
}

function renderVaults(analytics) {
  el.vaultsGrid.innerHTML = analytics.vaults.length
    ? analytics.vaults
        .map(
          (vault) => `
            <article class="vault-card">
              <div class="vault-top">
                <div>
                  <p class="eyebrow">${vault.objective}</p>
                  <h4>${vault.name}</h4>
                </div>
                <strong>${currency(vault.current)}</strong>
              </div>
              <p>${vault.summary}</p>
              <div class="vault-progress"><span style="width:${vault.progress}%; background: linear-gradient(90deg, ${vault.accent}, rgba(255,255,255,0.88));"></span></div>
              <div class="vault-top">
                <span class="mono-badge ${vault.progress >= 100 ? "positive" : ""}">${vault.progress}% da meta</span>
                <span class="muted">${currency(vault.target)} alvo</span>
              </div>
            </article>
          `,
        )
        .join("")
    : emptyState("Cadastre metas no banco para visualizar cofres aqui.");
}

function renderBudget(analytics) {
  el.budgetSummary.innerHTML = [
    budgetTile("Essencial", `${Math.round(budgetTargets.essentials * 100)}%`, currency(analytics.allocations.essentials)),
    budgetTile("Estilo de vida", `${Math.round(budgetTargets.lifestyle * 100)}%`, currency(analytics.allocations.lifestyle)),
    budgetTile("Riqueza", `${Math.round(budgetTargets.wealth * 100)}%`, currency(analytics.allocations.wealth)),
    budgetTile("Dividas", `${Math.round(budgetTargets.debt * 100)}%`, currency(analytics.allocations.debt)),
  ].join("");

  el.budgetBars.innerHTML = analytics.categoryBudgets.length
    ? analytics.categoryBudgets
        .map(
          (item) => `
            <article class="budget-row">
              <header>
                <span>${item.label}</span>
                <span>${currency(item.spent)} de ${currency(item.budget)}${item.budget === 0 ? "" : ` · ${item.usage}%`}</span>
              </header>
              <div class="bar-track">
                <span class="bar-fill" style="width:${item.width}%; background: linear-gradient(90deg, ${item.accent}, rgba(255,255,255,0.82));"></span>
              </div>
            </article>
          `,
        )
        .join("")
    : emptyState("Defina orcamentos por categoria para acompanhar desvios.");
}

function renderYearlyChart(analytics) {
  const months = analytics.monthlySeries;
  const width = 760;
  const height = 300;
  const padding = { top: 30, right: 24, bottom: 36, left: 28 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...months.flatMap((item) => [item.income, item.expense, item.net]), 1);
  const xStep = innerWidth / Math.max(months.length - 1, 1);
  const valueY = (value) => padding.top + innerHeight - (value / maxValue) * innerHeight;
  const pathFor = (key) =>
    months
      .map((item, index) => `${index === 0 ? "M" : "L"} ${padding.left + index * xStep} ${valueY(Math.max(item[key], 0))}`)
      .join(" ");

  const areaPath = `
    ${pathFor("net")}
    L ${padding.left + (months.length - 1) * xStep} ${padding.top + innerHeight}
    L ${padding.left} ${padding.top + innerHeight}
    Z
  `;

  el.yearlyChart.innerHTML = `
    <defs>
      <linearGradient id="incomeStroke" x1="0%" x2="100%">
        <stop offset="0%" stop-color="#7ef0c9" />
        <stop offset="100%" stop-color="#5ea6ff" />
      </linearGradient>
      <linearGradient id="expenseStroke" x1="0%" x2="100%">
        <stop offset="0%" stop-color="#ff8875" />
        <stop offset="100%" stop-color="#ffc670" />
      </linearGradient>
      <linearGradient id="netArea" x1="0%" x2="0%" y1="0%" y2="100%">
        <stop offset="0%" stop-color="#5ea6ff" stop-opacity="0.42" />
        <stop offset="100%" stop-color="#5ea6ff" stop-opacity="0" />
      </linearGradient>
    </defs>
    ${months
      .map(
        (_, index) =>
          `<line x1="${padding.left + index * xStep}" y1="${padding.top}" x2="${padding.left + index * xStep}" y2="${padding.top + innerHeight}" stroke="rgba(255,255,255,0.05)" />`,
      )
      .join("")}
    <path d="${areaPath}" fill="url(#netArea)"></path>
    <path d="${pathFor("income")}" fill="none" stroke="url(#incomeStroke)" stroke-width="3.4" stroke-linecap="round"></path>
    <path d="${pathFor("expense")}" fill="none" stroke="url(#expenseStroke)" stroke-width="3.4" stroke-linecap="round"></path>
    <path d="${pathFor("net")}" fill="none" stroke="#f4f4f1" stroke-width="2.3" stroke-dasharray="4 7" stroke-linecap="round"></path>
    ${months
      .map(
        (item, index) => `
          <circle cx="${padding.left + index * xStep}" cy="${valueY(Math.max(item.net, 0))}" r="4.5" fill="#f4f4f1"></circle>
          <text class="axis-label" x="${padding.left + index * xStep}" y="${height - 12}" text-anchor="middle">${item.label}</text>
        `,
      )
      .join("")}
  `;

  el.yearSummaryStrip.innerHTML = [
    summaryCard("Receitas no ano", currency(analytics.yearIncome)),
    summaryCard("Despesas no ano", currency(analytics.yearExpense)),
    summaryCard("Melhor mes", analytics.bestMonth.label),
    summaryCard("Pior desvio", analytics.worstSpike),
  ].join("");
}

function renderRecurring(analytics) {
  el.recurringList.innerHTML = analytics.recurringExpanded.length
    ? analytics.recurringExpanded
        .map(
          (item) => `
            <article class="recurring-item">
              <div class="recurring-top">
                <div>
                  <p class="eyebrow">${item.label}</p>
                  <h4>${item.title}</h4>
                </div>
                <strong>${currency(item.amount)}</strong>
              </div>
              <p>${item.remainingText}</p>
            </article>
          `,
        )
        .join("")
    : emptyState("Nenhuma despesa fixa cadastrada ainda.");
}

function renderAlerts(analytics) {
  el.alertsList.innerHTML = analytics.alerts.length
    ? analytics.alerts
        .map(
          (alert) => `
            <article class="alert-item ${alert.level}">
              <div class="alert-top">
                <h4>${alert.title}</h4>
                <span class="alert-severity ${alert.level}">${alert.tag}</span>
              </div>
              <p>${alert.message}</p>
            </article>
          `,
        )
        .join("")
    : emptyState("Sem alertas ativos. Conforme os dados entrarem, o app passara a vigiar desvios e rupturas.");
}

function renderInsights(analytics) {
  el.insightsList.innerHTML = analytics.insights.length
    ? analytics.insights
        .map(
          (insight) => `
            <article class="insight-item">
              <div class="alert-top">
                <h4>${insight.title}</h4>
                <span class="insight-tag">${insight.tag}</span>
              </div>
              <p>${insight.message}</p>
            </article>
          `,
        )
        .join("")
    : emptyState("Adicione algumas semanas de historico para liberar insights comportamentais.");
}

function renderLedger(analytics) {
  el.ledgerList.innerHTML = analytics.recentTransactions.length
    ? analytics.recentTransactions
        .map(
          (item) => `
            <article class="ledger-item">
              <div class="ledger-top">
                <div>
                  <p class="eyebrow">${item.categoryLabel}</p>
                  <h4>${item.title}</h4>
                </div>
                <div style="text-align:right;">
                  <span class="ledger-kind ${item.kind}">${item.kind === "income" ? "Renda" : "Despesa"}</span>
                  <strong style="display:block; margin-top:8px;">${currency(item.amount)}</strong>
                </div>
              </div>
              <p>${item.relative} · ${item.vault}${item.note ? ` · ${item.note}` : ""}</p>
            </article>
          `,
        )
        .join("")
    : emptyState("Seu historico comeca zerado. Faça o primeiro lancamento para ativar previsoes e graficos.");
}

function renderSidebarForecast(analytics) {
  el.sidebarForecast.innerHTML = `
    <p class="eyebrow">Radar futuro</p>
    <h2>${analytics.daysUntilNegativeText}</h2>
    <p class="muted">${analytics.forecastNarrative}</p>
  `;
}

function buildAnalytics(currentState) {
  const now = new Date(FIXED_NOW);
  const transactions = [...currentState.transactions].sort(
    (a, b) => new Date(b.dateTime) - new Date(a.dateTime),
  );
  const categoryBudgetsBase = currentState.categoryBudgets.length
    ? currentState.categoryBudgets
    : defaultCategoryBudgets;

  const monthlySeries = lastMonths(12, now).map((monthDate) => {
    const monthKey = keyForMonth(monthDate);
    const monthTransactions = transactions.filter((item) => item.dateTime.slice(0, 7) === monthKey);
    const income = sumAmounts(monthTransactions, "income");
    const expense = sumAmounts(monthTransactions, "expense");
    return {
      label: monthDate.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      income,
      expense,
      net: income - expense,
      key: monthKey,
    };
  });

  const recentThreeExpenses = monthlySeries.slice(-3).map((item) => item.expense);
  const avgMonthlyExpense = average(recentThreeExpenses);
  const avgMonthlyIncome = average(monthlySeries.slice(-3).map((item) => item.income));
  const currentMonthKey = keyForMonth(now);
  const currentMonthTransactions = transactions.filter((item) => item.dateTime.slice(0, 7) === currentMonthKey);
  const currentNet = sumAmounts(transactions, "income") - sumAmounts(transactions, "expense");
  const projectedRecurring = projectRecurringForMonth(currentState.recurring, now);
  const variableExpenseBaseline = Math.max(0, avgMonthlyExpense - projectedRecurring.currentMonthCost);
  const projectedExpense = variableExpenseBaseline + projectedRecurring.nextMonthCost;
  const projectedIncome = avgMonthlyIncome;
  const projectedRemainder = projectedIncome - projectedExpense;
  const paceNegativeDays = calculateNegativeBalanceWindow(currentNet, projectedIncome, projectedExpense);

  const hasTransactionHistory = transactions.length > 0;
  const forecastNarrative = hasTransactionHistory
    ? paceNegativeDays
      ? `Mantendo esse ritmo, voce ficara com saldo negativo em ${paceNegativeDays} dias. O maior peso vem de gastos recorrentes e da media recente de consumo.`
      : `A media recente indica sobra de ${currency(projectedRemainder)} no proximo ciclo, com espaco para reforcar reserva e acelerar metas.`
    : "O historico esta vazio de proposito. Assim que voce registrar ganhos e despesas, as previsoes passam a ser personalizadas.";

  const trendTone = !hasTransactionHistory
    ? "warning"
    : projectedRemainder > 1500
      ? "positive"
      : projectedRemainder < 0
        ? "negative"
        : "warning";
  const trendLabel = !hasTransactionHistory
    ? "Aguardando dados"
    : projectedRemainder > 1500
      ? "Ritmo saudavel"
      : projectedRemainder < 0
        ? "Risco de ruptura"
        : "Atencao moderada";

  const categoryBudgets = categoryBudgetsBase
    .filter((item) => item.category !== "income")
    .map((category) => {
      const spent = currentMonthTransactions
        .filter((item) => item.kind === "expense" && item.category === category.category)
        .reduce((total, item) => total + item.amount, 0);
      const budget = Number(category.monthly_budget || 0);
      const usage = budget === 0 ? 0 : Math.round((spent / budget) * 100);
      return {
        id: category.category,
        label: category.label,
        budget,
        accent: category.accent,
        spent,
        usage,
        width: budget === 0 ? 8 : Math.min(Math.max(usage, spent > 0 ? 8 : 4), 100),
      };
    });

  const totalIncomeThisMonth = sumAmounts(currentMonthTransactions, "income");
  const allocations = {
    essentials: totalIncomeThisMonth * budgetTargets.essentials,
    lifestyle: totalIncomeThisMonth * budgetTargets.lifestyle,
    wealth: totalIncomeThisMonth * budgetTargets.wealth,
    debt: totalIncomeThisMonth * budgetTargets.debt,
  };

  const vaults = (currentState.vaultGoals.length ? currentState.vaultGoals : defaultVaultGoals).map((vault, index) => {
    const current = Math.max(0, currentNet * [0.22, 0.14, 0.31][index] + [0, 0, 0][index]);
    const progress = vault.target > 0 ? Math.round((current / vault.target) * 100) : 0;
    return {
      ...vault,
      current,
      progress: Math.max(progress, current > 0 ? 4 : 0),
      summary:
        index === 0
          ? "Segura meses volateis e melhora sua leitura de caixa."
          : index === 1
            ? "Ajuda a reduzir juros e liberar renda futura."
            : "Recebe a sobra para crescer patrimonio ao longo do tempo.",
    };
  });

  const recurringExpanded = currentState.recurring.map((item) => {
    const passedMonths = monthDiff(new Date(item.startDate), now);
    const remaining = Math.max(0, item.months - passedMonths);
    return {
      ...item,
      label: categoryLabel(item.category, categoryBudgetsBase),
      remainingText:
        remaining > 0
          ? `${remaining} ciclos restantes · impacto projetado ${currency(item.amount * remaining)}`
          : "Ciclo encerrado",
    };
  });

  const alerts = hasTransactionHistory
    ? buildAlerts(categoryBudgets, paceNegativeDays, projectedRemainder)
    : [];
  const insights = hasTransactionHistory
    ? buildInsights(transactions, monthlySeries, projectedExpense)
    : [];

  const yearIncome = monthlySeries.reduce((total, item) => total + item.income, 0);
  const yearExpense = monthlySeries.reduce((total, item) => total + item.expense, 0);
  const bestMonth = monthlySeries.reduce((best, item) => (item.net > best.net ? item : best), monthlySeries[0]);
  const worstSpikeCategory = categoryBudgets.slice().sort((a, b) => b.usage - a.usage)[0];
  const recentTransactions = transactions.slice(0, 8).map((item) => ({
    ...item,
    categoryLabel: categoryLabel(item.category, categoryBudgetsBase),
    relative: formatDateTime(item.dateTime),
  }));

  return {
    currentNet,
    forecastNarrative,
    trendTone,
    trendLabel,
    avgMonthlyExpense,
    projectedRemainder,
    daysUntilNegativeText: hasTransactionHistory ? (paceNegativeDays ? `${paceNegativeDays} dias` : "Sem risco imediato") : "Sem base ainda",
    vaults,
    allocations,
    categoryBudgets,
    monthlySeries,
    yearIncome,
    yearExpense,
    bestMonth,
    worstSpike: worstSpikeCategory ? `${worstSpikeCategory.label} ${worstSpikeCategory.usage}%` : "Sem desvio",
    recurringExpanded,
    alerts,
    insights,
    recentTransactions,
  };
}

function buildAlerts(categoryBudgets, paceNegativeDays, projectedRemainder) {
  const alerts = [];
  const food = categoryBudgets.find((item) => item.id === "food");
  if (food && food.usage >= 80) {
    alerts.push({
      title: "Alimentacao perto do limite",
      level: food.usage >= 100 ? "critical" : "warning",
      tag: food.usage >= 100 ? "critico" : "80%",
      message: `Voce ja usou ${food.usage}% do orcamento de alimentacao neste ciclo. Recalibrar essa categoria evita pressao no fim do mes.`,
    });
  }

  if (paceNegativeDays) {
    alerts.push({
      title: "Previsao de saldo negativo",
      level: "critical",
      tag: "forecast",
      message: `Mantendo o padrao atual, o saldo cruza zero em ${paceNegativeDays} dias. Cortar lazer e adiar compras nao essenciais aumenta a folga imediata.`,
    });
  }

  if (projectedRemainder < 1200) {
    alerts.push({
      title: "Sobra abaixo do ideal",
      level: "warning",
      tag: "margem",
      message: "A sobra prevista esta curta para reforcar reserva e metas. Vale reduzir categorias variaveis ou antecipar amortizacao de dividas caras.",
    });
  }

  return alerts;
}

function buildInsights(transactions, monthlySeries, projectedExpense) {
  const expenseTransactions = transactions.filter((item) => item.kind === "expense");
  const weekendExpenses = expenseTransactions.filter((item) => {
    const day = new Date(item.dateTime).getDay();
    return day === 0 || day === 6;
  });
  const nightExpenses = expenseTransactions.filter((item) => new Date(item.dateTime).getHours() >= 22);
  const smallFrequent = expenseTransactions.filter((item) => item.amount <= 45);
  const lastMonth = monthlySeries.at(-1);
  const priorMonth = monthlySeries.at(-2);
  const abnormalSpike = priorMonth && lastMonth.expense > priorMonth.expense * 1.22;

  return [
    {
      title: "Padrao emocional noturno",
      tag: "habito",
      message:
        nightExpenses.length >= 4
          ? "Voce tende a gastar mais apos 22h. Considere ativar um bloqueio de compras ou um atraso de confirmacao nesse horario."
          : "Os gastos noturnos ainda estao sob controle, mas vale monitorar compras impulsivas em horarios de cansaco.",
    },
    {
      title: "Fim de semana mais caro",
      tag: "ritmo",
      message:
        weekendExpenses.length > expenseTransactions.length * 0.35
          ? "Mais de um terco das despesas acontece no fim de semana. Separar um teto proprio para sabado e domingo pode reduzir excesso sem travar lazer."
          : "O gasto de fim de semana esta distribuido de forma equilibrada em relacao aos dias uteis.",
    },
    {
      title: "Gastos pequenos frequentes",
      tag: "micro",
      message: `Foram ${smallFrequent.length} gastos pequenos identificados. Sozinhos parecem leves, mas juntos projetam ${currency(
        smallFrequent.reduce((total, item) => total + item.amount, 0),
      )} no periodo analisado.`,
    },
    {
      title: "Pico anormal detectado",
      tag: "anomalia",
      message: abnormalSpike
        ? `O total de despesas subiu de ${currency(priorMonth.expense)} para ${currency(lastMonth.expense)} no ultimo fechamento. Vale revisar o que mudou antes de consolidar esse novo patamar.`
        : `Nao houve pico anormal relevante no fechamento mais recente. O fluxo esta estavel frente a media de ${currency(projectedExpense)}.`,
    },
  ];
}

function metricCard(label, value) {
  return `
    <article class="metric-card">
      <p class="eyebrow">${label}</p>
      <strong>${value}</strong>
    </article>
  `;
}

function budgetTile(label, split, value) {
  return `
    <article class="budget-tile">
      <p class="eyebrow">${label}</p>
      <strong>${value}</strong>
      <span class="muted">${split} do ingresso mensal</span>
    </article>
  `;
}

function summaryCard(label, value) {
  return `
    <article class="summary-card">
      <p class="eyebrow">${label}</p>
      <strong>${value}</strong>
    </article>
  `;
}

function emptyState(message) {
  return `<article class="empty-card"><p>${message}</p></article>`;
}

function hydrateSelects() {
  el.recurringCategory.innerHTML = defaultCategoryBudgets
    .filter((item) => item.category !== "income")
    .map((item) => `<option value="${item.category}">${item.label}</option>`)
    .join("");
  syncTransactionCategoryOptions();
}

function syncTransactionCategoryOptions() {
  const isIncome = el.transactionKind.value === "income";
  const availableCategories = isIncome
    ? defaultCategoryBudgets.filter((item) => item.category === "income")
    : defaultCategoryBudgets.filter((item) => item.category !== "income");

  el.transactionCategory.innerHTML = availableCategories
    .map((item) => `<option value="${item.category}">${item.label}</option>`)
    .join("");
}

function hydrateFormDates() {
  const now = new Date(FIXED_NOW);
  const isoDate = now.toISOString().slice(0, 10);
  const isoTime = now.toTimeString().slice(0, 5);
  const dateInput = el.transactionForm.querySelector('input[name="date"]');
  const timeInput = el.transactionForm.querySelector('input[name="time"]');
  const recurringStart = el.recurringForm.querySelector('input[name="startDate"]');
  dateInput.value = isoDate;
  timeInput.value = isoTime;
  recurringStart.value = isoDate;
}

function projectRecurringForMonth(recurring, referenceDate) {
  const currentMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const nextMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1);
  const currentMonthCost = recurring.reduce((total, item) => {
    const start = new Date(item.startDate);
    const diff = monthDiff(start, currentMonth);
    const isActive = diff >= 0 && diff < item.months;
    return total + (isActive ? item.amount : 0);
  }, 0);
  const nextMonthCost = recurring.reduce((total, item) => {
    const start = new Date(item.startDate);
    const diff = monthDiff(start, nextMonth);
    const isActive = diff >= 0 && diff < item.months;
    return total + (isActive ? item.amount : 0);
  }, 0);
  return { currentMonthCost, nextMonthCost };
}

function calculateNegativeBalanceWindow(currentNet, projectedIncome, projectedExpense) {
  if (!projectedIncome && !projectedExpense) {
    return null;
  }

  const dailyRate = (projectedIncome - projectedExpense) / 30;
  if (dailyRate >= 0) {
    return null;
  }
  return Math.max(1, Math.round(currentNet / Math.abs(dailyRate)));
}

function loadLocalState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return structuredClone(defaultState);
    }
    const parsed = JSON.parse(stored);
    return {
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      recurring: Array.isArray(parsed.recurring) ? parsed.recurring : [],
      categoryBudgets: Array.isArray(parsed.categoryBudgets) && parsed.categoryBudgets.length
        ? parsed.categoryBudgets
        : defaultCategoryBudgets,
      vaultGoals: Array.isArray(parsed.vaultGoals) && parsed.vaultGoals.length
        ? parsed.vaultGoals
        : defaultVaultGoals,
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function persistLocalSnapshot() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function mapTransactionRow(row) {
  return {
    id: row.id,
    kind: row.kind,
    category: row.category,
    amount: Number(row.amount),
    title: row.title,
    dateTime: row.transaction_at,
    vault: row.vault || "Conta principal",
    note: row.note || "",
  };
}

function mapRecurringRow(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    amount: Number(row.amount),
    startDate: row.start_date,
    months: Number(row.months),
  };
}

function resolveVaultName(category, vaultGoals) {
  const mapping = {
    housing: "Base essencial",
    food: "Consumo diario",
    transport: "Mobilidade",
    health: "Cuidado pessoal",
    leisure: "Vida flexivel",
    education: "Crescimento",
    income: vaultGoals?.[0]?.name || "Conta principal",
  };
  return mapping[category] || "Conta principal";
}

function categoryLabel(categoryId, budgets = defaultCategoryBudgets) {
  return budgets.find((item) => item.category === categoryId)?.label || "Categoria";
}

function formatDateTime(value) {
  const date = new Date(value);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

function monthDiff(start, end) {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

function sumAmounts(items, kind) {
  return items
    .filter((item) => item.kind === kind)
    .reduce((total, item) => total + item.amount, 0);
}

function average(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function lastMonths(total, referenceDate) {
  return Array.from({ length: total }, (_, index) => {
    const offset = total - index - 1;
    return new Date(referenceDate.getFullYear(), referenceDate.getMonth() - offset, 1);
  });
}

function keyForMonth(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function currency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value || 0);
}
