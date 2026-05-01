import { createClient } from "@supabase/supabase-js";
//comentario zikja
const STORAGE_KEY = "atlas-finance-state-v3";
const LOCAL_ID_KEY = "atlas-local-id-v1";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
  { name: "Reserva de liquidez", objective: "Protecao", target: 25000, accent: "#7ef0c9", display_order: 1 },
  { name: "Quitacao de divida", objective: "Reducao de passivo", target: 12000, accent: "#ff8875", display_order: 2 },
  { name: "Cofre de crescimento", objective: "Acumular riqueza", target: 18000, accent: "#5ea6ff", display_order: 3 },
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
        detectSessionInUrl: false,
      },
    })
  : null;

const uiState = {
  authTab: localStorage.getItem(LOCAL_ID_KEY) ? "unlock" : "setup",
  authRecoveryKey: "",
  selectedCalendarDate: isoDateOnly(new Date()),
  calendarMonthOffset: 0,
  importPreview: null,
  activeToastId: null,
  deleteQueue: new Map(),
  editingRecord: null,
};

let state = structuredClone(defaultState);
let currentUser = null;
let persistenceMode = hasSupabaseConfig ? "locked" : "local";
let syncMessage = hasSupabaseConfig
  ? "Sessao protegida aguardando desbloqueio."
  : "Supabase nao configurado. O app segue em modo local.";
let syncTone = "warning";

const el = {
  appShell: document.querySelector("#appShell"),
  authGate: document.querySelector("#authGate"),
  authLead: document.querySelector("#authLead"),
  authStatus: document.querySelector("#authStatus"),
  authRecoveryCard: document.querySelector("#authRecoveryCard"),
  authTabs: document.querySelectorAll(".auth-tab"),
  unlockForm: document.querySelector("#unlockForm"),
  setupForm: document.querySelector("#setupForm"),
  recoveryForm: document.querySelector("#recoveryForm"),
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
  syncStatus: document.querySelector("#syncStatus"),
  syncGoalsButton: document.querySelector("#syncGoalsButton"),
  exportSummaryButton: document.querySelector("#exportSummaryButton"),
  exportCsvButton: document.querySelector("#exportCsvButton"),
  exportJsonButton: document.querySelector("#exportJsonButton"),
  importButton: document.querySelector("#importButton"),
  dataImportButton: document.querySelector("#dataImportButton"),
  dataExportCsvButton: document.querySelector("#dataExportCsvButton"),
  dataExportJsonButton: document.querySelector("#dataExportJsonButton"),
  importFileInput: document.querySelector("#importFileInput"),
  importPreview: document.querySelector("#importPreview"),
  calendarSummary: document.querySelector("#calendarSummary"),
  calendarGrid: document.querySelector("#calendarGrid"),
  calendarAgenda: document.querySelector("#calendarAgenda"),
  calendarMonthLabel: document.querySelector("#calendarMonthLabel"),
  calendarPrevButton: document.querySelector("#calendarPrevButton"),
  calendarNextButton: document.querySelector("#calendarNextButton"),
  recordModal: document.querySelector("#recordModal"),
  closeModalButton: document.querySelector("#closeModalButton"),
  editForm: document.querySelector("#editForm"),
  modalTitle: document.querySelector("#modalTitle"),
  modalEyebrow: document.querySelector("#modalEyebrow"),
  deleteRecordButton: document.querySelector("#deleteRecordButton"),
  toastRegion: document.querySelector("#toastRegion"),
};

bootstrap();

async function bootstrap() {
  hydrateSelects();
  hydrateFormDates();
  bindEvents();
  renderAuth();
  render();

  if (!supabase) {
    state = loadLocalState();
    persistenceMode = "local";
    syncMessage = "Modo local ativo. Configure o Supabase para persistir em nuvem e liberar autenticacao minima.";
    syncTone = "warning";
    hideAuthGate();
    render();
    return;
  }

  await initializeAuth();
}

function bindEvents() {
  el.transactionForm.addEventListener("submit", handleTransactionSubmit);
  el.recurringForm.addEventListener("submit", handleRecurringSubmit);
  el.transactionKind.addEventListener("change", syncTransactionCategoryOptions);
  el.exportSummaryButton.addEventListener("click", exportSummary);
  el.exportCsvButton.addEventListener("click", exportTransactionsToCSV);
  el.exportJsonButton.addEventListener("click", exportDataToJSON);
  el.importButton.addEventListener("click", () => el.importFileInput.click());
  el.dataImportButton.addEventListener("click", () => el.importFileInput.click());
  el.dataExportCsvButton.addEventListener("click", exportTransactionsToCSV);
  el.dataExportJsonButton.addEventListener("click", exportDataToJSON);
  el.importFileInput.addEventListener("change", handleImportFileChange);
  el.syncGoalsButton.addEventListener("click", () => {
    document.querySelector("#vaultsPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  el.calendarPrevButton.addEventListener("click", () => shiftCalendarMonth(-1));
  el.calendarNextButton.addEventListener("click", () => shiftCalendarMonth(1));
  el.calendarGrid.addEventListener("click", handleCalendarGridClick);
  el.ledgerList.addEventListener("click", handleRecordListClick);
  el.recurringList.addEventListener("click", handleRecordListClick);
  el.closeModalButton.addEventListener("click", closeModal);
  el.recordModal.addEventListener("click", (event) => {
    if (event.target === el.recordModal) {
      closeModal();
    }
  });
  el.editForm.addEventListener("submit", handleEditSubmit);
  el.editForm.querySelector('select[name="kind"]').addEventListener("change", syncEditCategoryOptions);
  el.deleteRecordButton.addEventListener("click", handleDeleteRecord);
  el.syncStatus.addEventListener("click", handleSyncStatusClick);
  el.importPreview.addEventListener("click", handleImportPreviewClick);
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
  el.authTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      uiState.authTab = tab.dataset.authTab;
      renderAuth();
    });
  });
  el.unlockForm.addEventListener("submit", handleUnlockSubmit);
  el.setupForm.addEventListener("submit", handleSetupSubmit);
  el.recoveryForm.addEventListener("submit", handleRecoverySubmit);
}

async function initializeAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    await handleAuthenticated(session.user);
  } else {
    showAuthGate();
    setAuthStatus(localStorage.getItem(LOCAL_ID_KEY)
      ? "Identidade encontrada neste dispositivo. Digite sua passphrase para desbloquear."
      : "Nenhuma identidade local encontrada. Crie uma para isolar seus dados com RLS.");
  }

  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      await handleAuthenticated(session.user);
    } else {
      handleSignedOut();
    }
  });
}

async function handleAuthenticated(user) {
  currentUser = user;
  persistenceMode = "supabase";
  syncMessage = "Sessao autenticada. Os dados agora sao isolados por identidade local.";
  syncTone = "positive";
  hideAuthGate();
  await ensureUserDefaults();
  await loadRemoteState();
  render();
}

function handleSignedOut() {
  currentUser = null;
  if (!supabase) {
    return;
  }
  state = structuredClone(defaultState);
  persistenceMode = "locked";
  syncMessage = "Sessao encerrada. Desbloqueie novamente para acessar seus dados.";
  syncTone = "warning";
  showAuthGate();
  renderAuth();
  render();
}

async function ensureUserDefaults() {
  if (!currentUser) {
    return;
  }

  const budgetRows = defaultCategoryBudgets.map((item) => ({
    user_id: currentUser.id,
    category: item.category,
    label: item.label,
    monthly_budget: item.monthly_budget,
    accent: item.accent,
  }));

  const vaultRows = defaultVaultGoals.map((item) => ({
    user_id: currentUser.id,
    name: item.name,
    objective: item.objective,
    target: item.target,
    accent: item.accent,
    display_order: item.display_order,
  }));

  await Promise.all([
    supabase.from("category_budgets").upsert(budgetRows, { onConflict: "user_id,category" }),
    supabase.from("vault_goals").upsert(vaultRows, { onConflict: "user_id,name" }),
  ]);
}

async function loadRemoteState() {
  try {
    const [transactionsResult, recurringResult, budgetsResult, vaultsResult] = await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .eq("user_id", currentUser.id)
        .is("deleted_at", null)
        .order("transaction_at", { ascending: false }),
      supabase
        .from("recurring_expenses")
        .select("*")
        .eq("user_id", currentUser.id)
        .is("deleted_at", null)
        .order("start_date", { ascending: false }),
      supabase
        .from("category_budgets")
        .select("*")
        .eq("user_id", currentUser.id)
        .order("label", { ascending: true }),
      supabase
        .from("vault_goals")
        .select("*")
        .eq("user_id", currentUser.id)
        .order("display_order", { ascending: true }),
    ]);

    const failed = [transactionsResult, recurringResult, budgetsResult, vaultsResult].find((result) => result.error);
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
    syncMessage = "Supabase sincronizado com sucesso.";
    syncTone = "positive";
  } catch (error) {
    console.error(error);
    state = loadLocalState();
    persistenceMode = "local";
    syncMessage = "Falha ao sincronizar com o Supabase. O app entrou em fallback local sem perder o fluxo.";
    syncTone = "negative";
  }
}

async function handleSetupSubmit(event) {
  event.preventDefault();
  if (!supabase) {
    return;
  }

  const form = new FormData(event.currentTarget);
  const passphrase = String(form.get("passphrase"));
  const confirmPassphrase = String(form.get("confirmPassphrase"));

  if (passphrase !== confirmPassphrase) {
    setAuthStatus("As passphrases nao conferem.");
    return;
  }

  const localId = crypto.randomUUID();
  const fakeEmail = buildFakeEmail(localId);

  setAuthStatus("Criando identidade local...");
  const { data, error } = await supabase.auth.signUp({
    email: fakeEmail,
    password: passphrase,
    options: {
      data: {
        local_id: localId,
      },
    },
  });

  if (error) {
    setAuthStatus(error.message);
    return;
  }

  localStorage.setItem(LOCAL_ID_KEY, localId);
  uiState.authRecoveryKey = `${localId}::${passphrase}`;
  renderAuthRecovery();

  if (!data.session) {
    const signInResult = await supabase.auth.signInWithPassword({
      email: fakeEmail,
      password: passphrase,
    });

    if (signInResult.error) {
      setAuthStatus(`Conta criada, mas o login automatico falhou: ${signInResult.error.message}`);
      return;
    }
  }

  setAuthStatus("Identidade criada. Guarde sua recovery key antes de fechar esta tela.");
}

async function handleUnlockSubmit(event) {
  event.preventDefault();
  if (!supabase) {
    return;
  }

  const localId = localStorage.getItem(LOCAL_ID_KEY);
  if (!localId) {
    uiState.authTab = "recovery";
    renderAuth();
    setAuthStatus("Nao encontrei identidade neste dispositivo. Use a recovery key.");
    return;
  }

  const form = new FormData(event.currentTarget);
  const passphrase = String(form.get("passphrase"));

  setAuthStatus("Desbloqueando...");
  const { error } = await supabase.auth.signInWithPassword({
    email: buildFakeEmail(localId),
    password: passphrase,
  });

  if (error) {
    setAuthStatus("Passphrase incorreta ou identidade nao encontrada.");
    return;
  }

  setAuthStatus("Sessao restaurada com sucesso.");
}

async function handleRecoverySubmit(event) {
  event.preventDefault();
  if (!supabase) {
    return;
  }

  const form = new FormData(event.currentTarget);
  const recoveryKey = String(form.get("recoveryKey")).trim();
  const overridePassphrase = String(form.get("overridePassphrase")).trim();
  const [localId, embeddedPassphrase] = recoveryKey.split("::");

  if (!localId) {
    setAuthStatus("Recovery key invalida.");
    return;
  }

  const passphrase = overridePassphrase || embeddedPassphrase;
  if (!passphrase) {
    setAuthStatus("A recovery key nao contem passphrase e nenhuma opcional foi informada.");
    return;
  }

  localStorage.setItem(LOCAL_ID_KEY, localId);
  setAuthStatus("Recuperando sessao...");
  const { error } = await supabase.auth.signInWithPassword({
    email: buildFakeEmail(localId),
    password: passphrase,
  });

  if (error) {
    setAuthStatus(`Nao foi possivel recuperar: ${error.message}`);
    return;
  }

  setAuthStatus("Identidade recuperada neste dispositivo.");
}

function renderAuth() {
  const hasLocalIdentity = Boolean(localStorage.getItem(LOCAL_ID_KEY));
  if (!supabase) {
    hideAuthGate();
    return;
  }

  el.authTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.authTab === uiState.authTab));
  el.unlockForm.classList.toggle("hidden", uiState.authTab !== "unlock");
  el.setupForm.classList.toggle("hidden", uiState.authTab !== "setup");
  el.recoveryForm.classList.toggle("hidden", uiState.authTab !== "recovery");

  if (!hasLocalIdentity && uiState.authTab === "unlock") {
    uiState.authTab = "setup";
    renderAuth();
    return;
  }

  el.authLead.textContent = hasLocalIdentity
    ? "Esta sessao usa uma identidade local. Sem email real, sem OAuth, apenas sua passphrase e a recovery key."
    : "Crie uma identidade local com passphrase. O app gera um UUID privado e usa RLS para isolar seus dados.";

  renderAuthRecovery();
}

function renderAuthRecovery() {
  if (uiState.authRecoveryKey) {
    el.authRecoveryCard.classList.remove("hidden");
    el.authRecoveryCard.innerHTML = `
      <p class="eyebrow">Recovery key</p>
      <p class="muted">Guarde esta chave uma unica vez. Ela permite recuperar sua identidade em outro dispositivo.</p>
      <code>${escapeHtml(uiState.authRecoveryKey)}</code>
    `;
  } else {
    el.authRecoveryCard.classList.add("hidden");
    el.authRecoveryCard.innerHTML = "";
  }
}

function setAuthStatus(message) {
  el.authStatus.textContent = message;
}

function showAuthGate() {
  el.authGate.classList.remove("hidden");
}

function hideAuthGate() {
  el.authGate.classList.add("hidden");
}

async function handleTransactionSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const date = String(form.get("date"));
  const time = String(form.get("time"));
  const transaction = {
    id: crypto.randomUUID(),
    userId: currentUser?.id || null,
    kind: form.get("kind"),
    category: form.get("category"),
    amount: Number(form.get("amount")),
    title: String(form.get("title")).trim(),
    dateTime: `${date}T${time}:00`,
    vault: String(form.get("vault")).trim() || resolveVaultName(form.get("category"), state.vaultGoals),
    note: String(form.get("note")).trim(),
    updatedAt: new Date().toISOString(),
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
    : "Transacao salva localmente.";
  syncTone = "positive";
  render();
}

async function handleRecurringSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const recurring = {
    id: crypto.randomUUID(),
    userId: currentUser?.id || null,
    title: String(form.get("title")).trim(),
    category: form.get("category"),
    amount: Number(form.get("amount")),
    startDate: String(form.get("startDate")),
    months: Number(form.get("months")),
    updatedAt: new Date().toISOString(),
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
    : "Recorrencia salva localmente.";
  syncTone = "positive";
  render();
}

async function saveTransaction(transaction) {
  if (!supabase || !currentUser) {
    persistenceMode = "local";
    persistLocalSnapshot();
    return true;
  }

  const { error } = await supabase.from("transactions").insert({
    id: transaction.id,
    user_id: currentUser.id,
    kind: transaction.kind,
    category: transaction.category,
    amount: transaction.amount,
    title: transaction.title,
    transaction_at: transaction.dateTime,
    vault: transaction.vault,
    note: transaction.note || null,
    updated_at: transaction.updatedAt,
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
  if (!supabase || !currentUser) {
    persistenceMode = "local";
    persistLocalSnapshot();
    return true;
  }

  const { error } = await supabase.from("recurring_expenses").insert({
    id: recurring.id,
    user_id: currentUser.id,
    title: recurring.title,
    category: recurring.category,
    amount: recurring.amount,
    start_date: recurring.startDate,
    months: recurring.months,
    updated_at: recurring.updatedAt,
  });

  if (error) {
    console.error(error);
    return false;
  }

  persistenceMode = "supabase";
  persistLocalSnapshot();
  return true;
}

function handleRecordListClick(event) {
  const button = event.target.closest("[data-record-action]");
  if (!button) {
    return;
  }

  const action = button.dataset.recordAction;
  const recordType = button.dataset.recordType;
  const recordId = button.dataset.recordId;

  if (action === "edit") {
    openEditModal(recordType, recordId);
  }
}

function openEditModal(recordType, recordId) {
  const isTransaction = recordType === "transaction";
  const record = isTransaction
    ? state.transactions.find((item) => item.id === recordId)
    : state.recurring.find((item) => item.id === recordId);

  if (!record) {
    return;
  }

  uiState.editingRecord = { recordType, recordId };
  el.editForm.reset();
  el.editForm.elements.recordType.value = recordType;
  el.editForm.elements.recordId.value = recordId;
  el.modalEyebrow.textContent = isTransaction ? "Lancamento" : "Recorrencia";
  el.modalTitle.textContent = isTransaction ? "Editar registro" : "Editar despesa recorrente";

  document.querySelectorAll(".modal-transaction-only").forEach((node) => node.classList.toggle("hidden", !isTransaction));
  document.querySelectorAll(".modal-recurring-only").forEach((node) => node.classList.toggle("hidden", isTransaction));

  if (isTransaction) {
    el.editForm.elements.kind.value = record.kind;
    syncEditCategoryOptions(record.kind);
    el.editForm.elements.category.value = record.category;
    el.editForm.elements.title.value = record.title;
    el.editForm.elements.amount.value = record.amount;
    const [date, time] = record.dateTime.split("T");
    el.editForm.elements.date.value = date;
    el.editForm.elements.time.value = time.slice(0, 5);
    el.editForm.elements.vault.value = record.vault;
    el.editForm.elements.note.value = record.note;
  } else {
    syncEditCategoryOptions("expense", true);
    el.editForm.elements.category.value = record.category;
    el.editForm.elements.title.value = record.title;
    el.editForm.elements.amount.value = record.amount;
    el.editForm.elements.startDate.value = record.startDate;
    el.editForm.elements.months.value = record.months;
  }

  el.recordModal.classList.remove("hidden");
}

function closeModal() {
  uiState.editingRecord = null;
  el.recordModal.classList.add("hidden");
}

function syncEditCategoryOptions(forcedKind = el.editForm.elements.kind.value, recurringOnly = false) {
  const select = el.editForm.elements.category;
  const availableCategories = recurringOnly || forcedKind === "expense"
    ? defaultCategoryBudgets.filter((item) => item.category !== "income")
    : defaultCategoryBudgets.filter((item) => item.category === "income");

  select.innerHTML = availableCategories
    .map((item) => `<option value="${item.category}">${item.label}</option>`)
    .join("");
}

async function handleEditSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const recordType = String(form.get("recordType"));
  const recordId = String(form.get("recordId"));

  if (recordType === "transaction") {
    const patch = {
      kind: form.get("kind"),
      category: form.get("category"),
      title: String(form.get("title")).trim(),
      amount: Number(form.get("amount")),
      dateTime: `${form.get("date")}T${form.get("time")}:00`,
      vault: String(form.get("vault")).trim(),
      note: String(form.get("note")).trim(),
      updatedAt: new Date().toISOString(),
    };
    await updateTransactionRecord(recordId, patch);
  } else {
    const patch = {
      category: form.get("category"),
      title: String(form.get("title")).trim(),
      amount: Number(form.get("amount")),
      startDate: String(form.get("startDate")),
      months: Number(form.get("months")),
      updatedAt: new Date().toISOString(),
    };
    await updateRecurringRecord(recordId, patch);
  }

  closeModal();
  render();
}

async function updateTransactionRecord(id, patch) {
  const target = state.transactions.find((item) => item.id === id);
  if (!target) {
    return;
  }

  Object.assign(target, patch);
  persistLocalSnapshot();

  if (!supabase || !currentUser) {
    return;
  }

  const { error } = await supabase
    .from("transactions")
    .update({
      kind: patch.kind,
      category: patch.category,
      title: patch.title,
      amount: patch.amount,
      transaction_at: patch.dateTime,
      vault: patch.vault,
      note: patch.note || null,
      updated_at: patch.updatedAt,
    })
    .eq("id", id)
    .eq("user_id", currentUser.id);

  if (error) {
    console.error(error);
    syncMessage = "Nao foi possivel atualizar a transacao no banco.";
    syncTone = "negative";
  } else {
    syncMessage = "Transacao atualizada.";
    syncTone = "positive";
  }
}

async function updateRecurringRecord(id, patch) {
  const target = state.recurring.find((item) => item.id === id);
  if (!target) {
    return;
  }

  Object.assign(target, patch);
  persistLocalSnapshot();

  if (!supabase || !currentUser) {
    return;
  }

  const { error } = await supabase
    .from("recurring_expenses")
    .update({
      category: patch.category,
      title: patch.title,
      amount: patch.amount,
      start_date: patch.startDate,
      months: patch.months,
      updated_at: patch.updatedAt,
    })
    .eq("id", id)
    .eq("user_id", currentUser.id);

  if (error) {
    console.error(error);
    syncMessage = "Nao foi possivel atualizar a recorrencia.";
    syncTone = "negative";
  } else {
    syncMessage = "Recorrencia atualizada.";
    syncTone = "positive";
  }
}

async function handleDeleteRecord() {
  if (!uiState.editingRecord) {
    return;
  }

  const { recordType, recordId } = uiState.editingRecord;
  closeModal();
  await softDeleteRecord(recordType, recordId);
}

async function softDeleteRecord(recordType, recordId) {
  const collection = recordType === "transaction" ? state.transactions : state.recurring;
  const index = collection.findIndex((item) => item.id === recordId);
  if (index === -1) {
    return;
  }

  const removed = collection[index];
  collection.splice(index, 1);
  persistLocalSnapshot();
  render();

  if (supabase && currentUser) {
    const table = recordType === "transaction" ? "transactions" : "recurring_expenses";
    const { error } = await supabase
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", recordId)
      .eq("user_id", currentUser.id);

    if (error) {
      console.error(error);
      collection.splice(index, 0, removed);
      persistLocalSnapshot();
      syncMessage = "Falha ao marcar o registro como removido.";
      syncTone = "negative";
      render();
      return;
    }
  }

  const queueKey = `${recordType}:${recordId}`;
  const timerId = window.setTimeout(async () => {
    uiState.deleteQueue.delete(queueKey);
    if (supabase && currentUser) {
      const table = recordType === "transaction" ? "transactions" : "recurring_expenses";
      await supabase.from(table).delete().eq("id", recordId).eq("user_id", currentUser.id);
    }
  }, 5000);

  uiState.deleteQueue.set(queueKey, { recordType, recordId, removed, index, timerId });
  showToast("Registro removido", "Voce tem 5 segundos para desfazer.", "Desfazer", () => undoSoftDelete(queueKey));
}

async function undoSoftDelete(queueKey) {
  const queued = uiState.deleteQueue.get(queueKey);
  if (!queued) {
    return;
  }

  window.clearTimeout(queued.timerId);
  uiState.deleteQueue.delete(queueKey);
  const collection = queued.recordType === "transaction" ? state.transactions : state.recurring;
  collection.splice(Math.min(queued.index, collection.length), 0, queued.removed);
  persistLocalSnapshot();

  if (supabase && currentUser) {
    const table = queued.recordType === "transaction" ? "transactions" : "recurring_expenses";
    await supabase
      .from(table)
      .update({ deleted_at: null })
      .eq("id", queued.recordId)
      .eq("user_id", currentUser.id);
  }

  syncMessage = "Remocao desfeita.";
  syncTone = "positive";
  render();
}

function showToast(title, message, actionLabel, action) {
  const toastId = crypto.randomUUID();
  uiState.activeToastId = toastId;
  el.toastRegion.innerHTML = `
    <article class="toast" data-toast-id="${toastId}">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(message)}</p>
      ${actionLabel ? `<button type="button" data-toast-action="${toastId}">${escapeHtml(actionLabel)}</button>` : ""}
    </article>
  `;

  const actionButton = el.toastRegion.querySelector(`[data-toast-action="${toastId}"]`);
  if (actionButton) {
    actionButton.addEventListener("click", () => {
      action?.();
      dismissToast(toastId);
    });
  }

  window.setTimeout(() => dismissToast(toastId), 5600);
}

function dismissToast(toastId) {
  const toast = el.toastRegion.querySelector(`[data-toast-id="${toastId}"]`);
  if (toast) {
    toast.remove();
  }
}

function handleSyncStatusClick(event) {
  if (event.target.closest("[data-signout]")) {
    handleSignOut();
  }
}

async function handleSignOut() {
  if (!supabase) {
    return;
  }
  await supabase.auth.signOut();
}

async function handleImportFileChange(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const preview = file.name.toLowerCase().endsWith(".json")
      ? buildJsonImportPreview(text)
      : buildCsvImportPreview(text);

    uiState.importPreview = preview;
    renderImportPreview();
  } catch (error) {
    console.error(error);
    uiState.importPreview = {
      error: "Nao foi possivel ler o arquivo selecionado.",
    };
    renderImportPreview();
  } finally {
    event.target.value = "";
  }
}

function handleImportPreviewClick(event) {
  if (event.target.closest("[data-import-confirm]")) {
    confirmImport();
  }
}

async function confirmImport() {
  if (!uiState.importPreview?.rows?.length) {
    return;
  }

  const validRows = uiState.importPreview.rows.filter((row) => row.valid && !row.duplicate);
  if (!validRows.length) {
    syncMessage = "Nenhuma linha valida disponivel para importar.";
    syncTone = "warning";
    render();
    return;
  }

  const records = validRows.map((row) => ({
    id: crypto.randomUUID(),
    userId: currentUser?.id || null,
    kind: row.kind,
    category: row.category,
    amount: row.amount,
    title: row.title,
    dateTime: row.dateTime,
    vault: row.vault,
    note: row.note,
    updatedAt: new Date().toISOString(),
  }));

  if (supabase && currentUser) {
    const { error } = await supabase.from("transactions").insert(records.map((record) => ({
      id: record.id,
      user_id: currentUser.id,
      kind: record.kind,
      category: record.category,
      amount: record.amount,
      title: record.title,
      transaction_at: record.dateTime,
      vault: record.vault || null,
      note: record.note || null,
      updated_at: record.updatedAt,
    })));

    if (error) {
      console.error(error);
      syncMessage = `Falha ao importar: ${error.message}`;
      syncTone = "negative";
      render();
      return;
    }
  }

  state.transactions = [...records, ...state.transactions].sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
  persistLocalSnapshot();
  uiState.importPreview = null;
  renderImportPreview();
  syncMessage = `${records.length} registros importados com sucesso.`;
  syncTone = "positive";
  render();
}

function renderImportPreview() {
  const preview = uiState.importPreview;
  if (!preview) {
    el.importPreview.innerHTML = emptyState("Importe um CSV ou JSON para acelerar a base historica do Atlas.");
    return;
  }

  if (preview.error) {
    el.importPreview.innerHTML = emptyState(preview.error);
    return;
  }

  el.importPreview.innerHTML = `
    <article class="import-preview-card">
      <div class="import-preview-grid">
        <div class="import-stat-row">
          ${importStat("Novos", preview.validCount - preview.duplicateCount)}
          ${importStat("Duplicados", preview.duplicateCount)}
          ${importStat("Invalidos", preview.invalidCount)}
        </div>
        <div class="import-list">
          ${preview.rows.slice(0, 6).map(renderImportLine).join("")}
        </div>
        <button type="button" class="primary-button wide" data-import-confirm>Confirmar importacao</button>
      </div>
    </article>
  `;
}

function buildCsvImportPreview(text) {
  const parsed = parseCsv(text);
  return buildImportPreview(parsed);
}

function buildJsonImportPreview(text) {
  const raw = JSON.parse(text);
  const sourceRows = Array.isArray(raw) ? raw : Array.isArray(raw.transactions) ? raw.transactions : [];
  const parsed = sourceRows.map((item) => normalizeImportRow({
    data: item.date || item.transaction_at || item.dateTime,
    tipo: item.type || item.kind,
    titulo: item.title,
    valor: item.amount,
    categoria: item.category,
    cofre: item.vault,
    observacao: item.note,
  }));
  return buildImportPreview(parsed);
}

function buildImportPreview(rows) {
  const existingKeys = new Set(state.transactions.map((item) => dedupeKey(item.dateTime, item.amount, item.title)));
  const preparedRows = rows.map((row) => ({
    ...row,
    duplicate: existingKeys.has(dedupeKey(row.dateTime, row.amount, row.title)),
  }));

  return {
    rows: preparedRows,
    validCount: preparedRows.filter((row) => row.valid).length,
    invalidCount: preparedRows.filter((row) => !row.valid).length,
    duplicateCount: preparedRows.filter((row) => row.duplicate).length,
  };
}

function parseCsv(text) {
  const cleaned = text.replace(/^\uFEFF/, "").trim();
  if (!cleaned) {
    return [];
  }

  const lines = cleaned.split(/\r?\n/);
  const headers = parseCsvLine(lines.shift()).map((header) => normalizeHeader(header));

  return lines.map((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    return normalizeImportRow(row);
  });
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && insideQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function normalizeHeader(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");
}

function normalizeImportRow(row) {
  const kindToken = String(row.tipo || row.kind || "").toLowerCase();
  const rawDate = row.data || row.date || row.datetime || row.transaction_at;
  const normalizedDate = normalizeImportDate(rawDate);
  const title = String(row.titulo || row.title || "").trim();
  const amount = Number(row.valor || row.amount);
  const category = normalizeCategory(row.categoria || row.category);
  const kind = kindToken === "receita" || kindToken === "renda" || kindToken === "income"
    ? "income"
    : kindToken === "despesa" || kindToken === "expense"
      ? "expense"
      : null;

  const valid = Boolean(normalizedDate && title && category && Number.isFinite(amount) && kind);
  return {
    dateTime: normalizedDate ? `${normalizedDate}T12:00:00` : "",
    title,
    amount: Number.isFinite(amount) ? amount : 0,
    category: category || "food",
    kind,
    vault: String(row.cofre || row.vault || "").trim(),
    note: String(row.observacao || row.note || "").trim(),
    valid,
    duplicate: false,
  };
}

function normalizeImportDate(value) {
  if (!value) {
    return "";
  }

  const directDate = new Date(value);
  if (!Number.isNaN(directDate.getTime())) {
    return isoDateOnly(directDate);
  }

  const parts = String(value).split(/[/-]/);
  if (parts.length === 3) {
    const [first, second, third] = parts;
    if (first.length === 4) {
      return `${first}-${second.padStart(2, "0")}-${third.padStart(2, "0")}`;
    }
    return `${third}-${second.padStart(2, "0")}-${first.padStart(2, "0")}`;
  }

  return "";
}

function normalizeCategory(value) {
  const token = String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const aliases = {
    moradia: "housing",
    housing: "housing",
    alimentacao: "food",
    food: "food",
    transporte: "transport",
    transport: "transport",
    saude: "health",
    health: "health",
    lazer: "leisure",
    leisure: "leisure",
    educacao: "education",
    education: "education",
    renda: "income",
    income: "income",
  };
  return aliases[token] || "";
}

function exportSummary() {
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

  downloadFile("atlas-finance-resumo.txt", payload, "text/plain;charset=utf-8");
}

function exportTransactionsToCSV() {
  const headers = ["data", "tipo", "titulo", "valor", "categoria", "cofre", "observacao"];
  const rows = state.transactions.map((item) => [
    item.dateTime.slice(0, 10),
    item.kind === "income" ? "receita" : "despesa",
    item.title,
    item.amount.toFixed(2),
    categoryLabel(item.category, state.categoryBudgets),
    item.vault || "",
    item.note || "",
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  downloadFile(`atlas-${isoDateOnly(new Date())}.csv`, `\uFEFF${csv}`, "text/csv;charset=utf-8");
}

function exportDataToJSON() {
  const payload = {
    exported_at: new Date().toISOString(),
    version: "1.0",
    transactions: state.transactions,
    recurring_expenses: state.recurring,
    category_budgets: state.categoryBudgets,
    vault_goals: state.vaultGoals,
  };

  downloadFile(`atlas-${isoDateOnly(new Date())}.json`, JSON.stringify(payload, null, 2), "application/json");
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function shiftCalendarMonth(direction) {
  uiState.calendarMonthOffset += direction;
  const monthAnchor = calendarMonthDate();
  uiState.selectedCalendarDate = isoDateOnly(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1));
  render();
}

function handleCalendarGridClick(event) {
  const dayButton = event.target.closest("[data-calendar-date]");
  if (!dayButton) {
    return;
  }

  uiState.selectedCalendarDate = dayButton.dataset.calendarDate;
  render();
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
  renderCalendar(analytics.calendar);
  renderImportPreview();
}

function renderSyncStatus() {
  const modeLabel = supabase
    ? currentUser
      ? "Supabase protegido"
      : "Bloqueado"
    : "Modo local";

  el.syncStatus.innerHTML = `
    <p class="eyebrow">Persistencia</p>
    <h2>${modeLabel}</h2>
    <p class="muted">${syncMessage}</p>
    ${supabase && currentUser ? '<button class="ghost-button wide" data-signout>Sair desta identidade</button>' : ""}
  `;
  el.syncStatus.className = `sidebar-card compact tone-${syncTone}`;
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
        .map((vault) => `
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
        `)
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
        .map((item) => `
          <article class="budget-row">
            <header>
              <span>${item.label}</span>
              <span>${currency(item.spent)} de ${currency(item.budget)}${item.budget === 0 ? "" : ` · ${item.usage}%`}</span>
            </header>
            <div class="bar-track">
              <span class="bar-fill" style="width:${item.width}%; background: linear-gradient(90deg, ${item.accent}, rgba(255,255,255,0.82));"></span>
            </div>
          </article>
        `)
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
        .map((item) => `
          <article class="recurring-item">
            <div class="recurring-top">
              <div>
                <p class="eyebrow">${item.label}</p>
                <h4>${item.title}</h4>
              </div>
              <div class="record-actions">
                <strong>${currency(item.amount)}</strong>
                <button class="record-button" type="button" data-record-action="edit" data-record-type="recurring" data-record-id="${item.id}">Editar</button>
              </div>
            </div>
            <p>${item.remainingText}</p>
          </article>
        `)
        .join("")
    : emptyState("Nenhuma despesa fixa cadastrada ainda.");
}

function renderAlerts(analytics) {
  el.alertsList.innerHTML = analytics.alerts.length
    ? analytics.alerts
        .map((alert) => `
          <article class="alert-item ${alert.level}">
            <div class="alert-top">
              <h4>${alert.title}</h4>
              <span class="alert-severity ${alert.level}">${alert.tag}</span>
            </div>
            <p>${alert.message}</p>
          </article>
        `)
        .join("")
    : emptyState("Sem alertas ativos. Conforme os dados entrarem, o app passara a vigiar desvios e rupturas.");
}

function renderInsights(analytics) {
  el.insightsList.innerHTML = analytics.insights.length
    ? analytics.insights
        .map((insight) => `
          <article class="insight-item">
            <div class="alert-top">
              <h4>${insight.title}</h4>
              <span class="insight-tag">${insight.tag}</span>
            </div>
            <p>${insight.message}</p>
          </article>
        `)
        .join("")
    : emptyState("Adicione algumas semanas de historico para liberar insights comportamentais.");
}

function renderLedger(analytics) {
  el.ledgerList.innerHTML = analytics.recentTransactions.length
    ? analytics.recentTransactions
        .map((item) => `
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
            <div class="record-actions" style="margin-top:12px;">
              <button class="record-button" type="button" data-record-action="edit" data-record-type="transaction" data-record-id="${item.id}">Editar ou excluir</button>
            </div>
          </article>
        `)
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

function renderCalendar(calendar) {
  el.calendarMonthLabel.textContent = calendar.label;
  el.calendarSummary.innerHTML = [
    summaryCard("Entradas previstas", currency(calendar.incomingTotal)),
    summaryCard("Saidas previstas", currency(calendar.outgoingTotal)),
    summaryCard("Dias criticos", String(calendar.highPressureDays)),
    summaryCard("Eventos confirmados", String(calendar.confirmedCount)),
  ].join("");

  const weekdayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  el.calendarGrid.innerHTML = [
    ...weekdayLabels.map((label) => `<div class="calendar-day-head">${label}</div>`),
    ...calendar.days.map(renderCalendarDay),
  ].join("");

  const agendaEvents = calendar.eventsByDate[uiState.selectedCalendarDate] || [];
  el.calendarAgenda.innerHTML = `
    <article class="calendar-agenda-header">
      <p class="eyebrow">Dia selecionado</p>
      <h3>${formatLongDate(uiState.selectedCalendarDate)}</h3>
      <p class="muted">${agendaEvents.length ? `${agendaEvents.length} evento(s) neste dia.` : "Sem eventos previstos para esta data."}</p>
    </article>
    ${agendaEvents.length
      ? agendaEvents.map(renderCalendarAgendaItem).join("")
      : emptyState("Nenhuma entrada ou saida prevista neste dia.")}
  `;
}

function renderCalendarDay(day) {
  const dots = day.events.slice(0, 5).map((event) => `
    <span class="calendar-dot ${event.direction} ${event.confirmed ? "confirmed" : ""}"></span>
  `).join("");

  return `
    <button
      type="button"
      class="calendar-day ${day.outside ? "outside" : ""} ${day.isSelected ? "selected" : ""} ${day.pressureClass}"
      data-calendar-date="${day.iso}"
    >
      <span class="calendar-day-number">${day.dayNumber}</span>
      <div class="calendar-dots">${dots}</div>
    </button>
  `;
}

function renderCalendarAgendaItem(event) {
  return `
    <article class="calendar-agenda-item">
      <div class="calendar-event-top">
        <div>
          <p class="eyebrow">${event.typeLabel}</p>
          <h4>${event.title}</h4>
        </div>
        <strong>${currency(event.amount)}</strong>
      </div>
      <div class="calendar-event-meta">
        <span class="calendar-tag ${event.direction}">${event.direction === "in" ? "entrada" : "saida"}</span>
        <span class="calendar-tag ${event.pressureClass.replace("pressure-", "")}">${event.pressureLabel}</span>
        ${event.confirmed ? '<span class="calendar-tag low">confirmado</span>' : '<span class="calendar-tag medium">previsto</span>'}
      </div>
      <p>${event.summary}</p>
    </article>
  `;
}

function buildAnalytics(currentState) {
  const now = new Date();
  const transactions = [...currentState.transactions].sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
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
    : "O historico ainda esta vazio. Assim que voce registrar ganhos e despesas, as previsoes passam a refletir o seu comportamento real.";

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
    calendar: buildCalendarModel(currentState, transactions),
  };
}

function buildCalendarModel(currentState, transactions) {
  const monthDate = calendarMonthDate();
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const monthLabel = monthDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const recurringEvents = expandRecurringEvents(currentState.recurring, monthStart, monthEnd);
  const actualEvents = transactions
    .filter((item) => item.dateTime.slice(0, 7) === keyForMonth(monthDate))
    .map((item) => ({
      id: item.id,
      date: item.dateTime.slice(0, 10),
      type: "actual",
      typeLabel: "Lancamento real",
      title: item.title,
      amount: item.amount,
      direction: item.kind === "income" ? "in" : "out",
      confirmed: true,
      summary: `${categoryLabel(item.category, state.categoryBudgets)} · ${item.vault || "Conta principal"}`,
    }));

  const projectedIncome = buildProjectedIncomeEvent(transactions, monthStart, monthEnd, actualEvents);
  if (projectedIncome) {
    actualEvents.push(projectedIncome);
  }

  recurringEvents.forEach((event) => {
    const matched = actualEvents.find((item) =>
      item.date === event.date &&
      item.direction === "out" &&
      item.title.toLowerCase() === event.title.toLowerCase() &&
      Math.abs(item.amount - event.amount) < 0.01,
    );

    if (matched) {
      event.confirmed = true;
      event.summary = `${event.summary} · confirmado por lancamento real`;
    }
  });

  const allEvents = [...recurringEvents, ...actualEvents].sort((a, b) => a.date.localeCompare(b.date));
  const outgoingByDate = {};
  allEvents
    .filter((event) => event.direction === "out")
    .forEach((event) => {
      outgoingByDate[event.date] = (outgoingByDate[event.date] || 0) + event.amount;
    });

  const threshold = average(Object.values(outgoingByDate)) || 400;
  const eventsByDate = allEvents.reduce((accumulator, event) => {
    const dayTotal = outgoingByDate[event.date] || 0;
    const pressureClass = dayTotal > threshold * 2 ? "pressure-high" : dayTotal > threshold ? "pressure-medium" : "pressure-low";
    const pressureLabel = pressureClass === "pressure-high" ? "pressao alta" : pressureClass === "pressure-medium" ? "pressao media" : "pressao baixa";
    const prepared = { ...event, pressureClass, pressureLabel };
    accumulator[event.date] = [...(accumulator[event.date] || []), prepared];
    return accumulator;
  }, {});

  if (!eventsByDate[uiState.selectedCalendarDate] || uiState.selectedCalendarDate.slice(0, 7) !== keyForMonth(monthDate)) {
    uiState.selectedCalendarDate = isoDateOnly(monthStart);
  }

  return {
    label: capitalize(monthLabel),
    incomingTotal: allEvents.filter((event) => event.direction === "in").reduce((total, event) => total + event.amount, 0),
    outgoingTotal: allEvents.filter((event) => event.direction === "out").reduce((total, event) => total + event.amount, 0),
    highPressureDays: Object.values(eventsByDate).filter((items) => items[0]?.pressureClass === "pressure-high").length,
    confirmedCount: allEvents.filter((event) => event.confirmed).length,
    days: buildCalendarDays(monthStart, monthEnd, eventsByDate),
    eventsByDate,
  };
}

function expandRecurringEvents(recurring, monthStart, monthEnd) {
  return recurring
    .flatMap((item) => {
      const start = new Date(item.startDate);
      const cycles = [];
      for (let index = 0; index < item.months; index += 1) {
        const occurrence = new Date(start.getFullYear(), start.getMonth() + index, start.getDate());
        if (occurrence < monthStart || occurrence > monthEnd) {
          continue;
        }
        cycles.push({
          id: `${item.id}:${index}`,
          date: isoDateOnly(occurrence),
          type: "recurrence",
          typeLabel: "Recorrencia",
          title: item.title,
          amount: item.amount,
          direction: "out",
          confirmed: false,
          summary: `${categoryLabel(item.category, state.categoryBudgets)} · parcela prevista`,
        });
      }
      return cycles;
    });
}

function buildProjectedIncomeEvent(transactions, monthStart, monthEnd, actualEvents) {
  const incomes = transactions.filter((item) => item.kind === "income").slice(0, 3);
  if (!incomes.length) {
    return null;
  }

  const latest = incomes[0];
  const day = new Date(latest.dateTime).getDate();
  const projectedDate = new Date(monthStart.getFullYear(), monthStart.getMonth(), Math.min(day, monthEnd.getDate()));
  const iso = isoDateOnly(projectedDate);
  const hasActualIncome = actualEvents.some((item) => item.direction === "in" && item.date === iso);

  if (hasActualIncome) {
    return null;
  }

  return {
    id: `projection:${iso}:${latest.title}`,
    date: iso,
    type: "projection",
    typeLabel: "Projecao",
    title: latest.title,
    amount: latest.amount,
    direction: "in",
    confirmed: false,
    summary: "Projecao baseada no ultimo padrao de entrada recorrente.",
  };
}

function buildCalendarDays(monthStart, monthEnd, eventsByDate) {
  const days = [];
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const gridEnd = new Date(monthEnd);
  gridEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));

  for (let date = new Date(gridStart); date <= gridEnd; date.setDate(date.getDate() + 1)) {
    const iso = isoDateOnly(date);
    const events = eventsByDate[iso] || [];
    days.push({
      iso,
      dayNumber: date.getDate(),
      outside: date.getMonth() !== monthStart.getMonth(),
      events,
      isSelected: uiState.selectedCalendarDate === iso,
      pressureClass: events[0]?.pressureClass || "",
    });
  }

  return days;
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

function importStat(label, value) {
  return `
    <article class="import-stat">
      <p class="eyebrow">${label}</p>
      <strong>${value}</strong>
    </article>
  `;
}

function renderImportLine(row) {
  const lineClass = row.duplicate ? "duplicate" : row.valid ? "valid" : "invalid";
  const status = row.duplicate ? "Duplicado" : row.valid ? "Valido" : "Invalido";
  return `
    <article class="import-line ${lineClass}">
      <strong>${escapeHtml(row.title || "Sem titulo")} · ${currency(row.amount)}</strong>
      <p>${escapeHtml(row.dateTime ? row.dateTime.slice(0, 10) : "Sem data")} · ${escapeHtml(status)}</p>
    </article>
  `;
}

function emptyState(message) {
  return `<article class="empty-card"><p>${escapeHtml(message)}</p></article>`;
}

function hydrateSelects() {
  el.recurringCategory.innerHTML = defaultCategoryBudgets
    .filter((item) => item.category !== "income")
    .map((item) => `<option value="${item.category}">${item.label}</option>`)
    .join("");
  syncTransactionCategoryOptions();
  syncEditCategoryOptions("expense", true);
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
  const now = new Date();
  const isoDate = isoDateOnly(now);
  const isoTime = now.toTimeString().slice(0, 5);
  el.transactionForm.querySelector('input[name="date"]').value = isoDate;
  el.transactionForm.querySelector('input[name="time"]').value = isoTime;
  el.recurringForm.querySelector('input[name="startDate"]').value = isoDate;
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
    userId: row.user_id,
    kind: row.kind,
    category: row.category,
    amount: Number(row.amount),
    title: row.title,
    dateTime: row.transaction_at,
    vault: row.vault || "Conta principal",
    note: row.note || "",
    updatedAt: row.updated_at,
  };
}

function mapRecurringRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    category: row.category,
    amount: Number(row.amount),
    startDate: row.start_date,
    months: Number(row.months),
    updatedAt: row.updated_at,
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

function formatLongDate(value) {
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
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

function calendarMonthDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + uiState.calendarMonthOffset, 1);
}

function keyForMonth(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function isoDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function dedupeKey(dateTime, amount, title) {
  return `${String(dateTime).slice(0, 10)}|${Number(amount).toFixed(2)}|${String(title).trim().toLowerCase()}`;
}

function buildFakeEmail(localId) {
  return `${localId}@atlas.local`;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function currency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
