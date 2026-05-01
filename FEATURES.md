# Atlas Finance — Documentação de Features

> Exploração técnica e de produto de cinco features prioritárias para evolução do app.

---

## Sumário

1. [Autenticação mínima com Supabase](#1-autenticação-mínima-com-supabase)
2. [Edição e exclusão de registros](#2-edição-e-exclusão-de-registros)
3. [Importação e exportação CSV / JSON](#3-importação-e-exportação-csv--json)
4. [Calendário financeiro](#4-calendário-financeiro)
5. [Login sem identidade real](#5-login-sem-identidade-real)

---

## 1. Autenticação mínima com Supabase

### Contexto

O objetivo não é criar um sistema de login completo — é impedir que qualquer pessoa com a URL acesse seus dados. Uma sessão anônima com Supabase já resolve isso com poucas linhas e zero dado pessoal.

### Fluxo recomendado

1. App abre → chama `supabase.auth.getSession()`
2. Sessão existe? → mostra o painel normalmente
3. Sem sessão → mostra tela de desbloqueio com passphrase
4. Usuário digita a passphrase → app assina com `signInWithPassword`
5. Supabase retorna sessão → token salvo no browser
6. Todas as queries usam o `user.id` como filtro automático via RLS

### Verificar sessão na inicialização

```ts
// main.tsx ou App.tsx
const { data: { session } } = await supabase.auth.getSession()

if (!session) {
  renderLockScreen()   // mostra tela de passphrase
} else {
  renderApp(session.user)
}

// escuta mudanças de sessão
supabase.auth.onAuthStateChange((_event, session) => {
  if (session) renderApp(session.user)
  else renderLockScreen()
})
```

### Login com usuário fixo + passphrase

```ts
// sem email real — usa um identificador local
const LOCAL_USER = "atlas@local"

async function unlock(passphrase: string) {
  const { error } = await supabase.auth.signInWithPassword({
    email: LOCAL_USER,
    password: passphrase,
  })
  if (error) showError("Passphrase incorreta")
}

// primeiro uso: cria a conta local
async function setup(passphrase: string) {
  await supabase.auth.signUp({
    email: LOCAL_USER,
    password: passphrase,
  })
}
```

### RLS: dados isolados por usuário automaticamente

```sql
-- Supabase: política de Row Level Security
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user vê só os próprios" ON transactions
  FOR ALL USING (auth.uid() = user_id);
```

Aplicar a mesma política para todas as tabelas: `recurrences`, `budgets`, `vaults`.

### Vantagens

- Sem email real, sem OAuth, sem senha exposta em código
- Supabase gerencia o token de sessão
- RLS garante isolamento sem nenhum filtro manual no frontend

### Cuidados

- Desabilitar "confirmação por email" no dashboard do Supabase
- O e-mail `atlas@local` nunca precisa existir de verdade — é só um identificador interno
- Usar uma passphrase forte (mínimo 12 caracteres, sugerir ao usuário)

---

## 2. Edição e exclusão de registros

### Contexto

O maior risco aqui é a perda acidental de dados. O padrão ideal combina edição inline rápida com confirmação explícita para exclusão — e um mecanismo de "desfazer" que reduz o atrito sem sacrificar segurança.

### Padrões recomendados

**Edição:** ao clicar em um registro, abre um drawer lateral (ou modal bottom sheet no mobile) com os campos preenchidos. Salva ao confirmar, descarta ao fechar sem salvar.

**Exclusão:** soft delete com `deleted_at` + toast "Desfazer" por 5 segundos. Só apaga de verdade após o timeout.

### Soft delete com undo

```ts
// soft delete — não apaga imediatamente
async function deleteTransaction(id: string) {
  await supabase
    .from('transactions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  // toast com janela de undo
  const timer = setTimeout(async () => {
    await supabase.from('transactions').delete().eq('id', id)
  }, 5000)

  showToast("Registro removido", {
    action: "Desfazer",
    onAction: () => {
      clearTimeout(timer)
      restoreTransaction(id)
    }
  })
}

async function restoreTransaction(id: string) {
  await supabase
    .from('transactions')
    .update({ deleted_at: null })
    .eq('id', id)
}
```

### Edição — update parcial

```ts
async function updateTransaction(
  id: string,
  patch: Partial<Transaction>
) {
  const { data, error } = await supabase
    .from('transactions')
    .update({ ...patch, updated_at: new Date() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}
```

### Campos a adicionar na tabela

| Campo | Tipo | Finalidade |
|---|---|---|
| `updated_at` | `timestamptz` | Timestamp da última edição. Útil para auditoria e conflito de sync. |
| `deleted_at` | `timestamptz` | Soft delete. Registros com valor aqui são filtrados das queries normais. |

### Query padrão com filtro de soft delete

```ts
// toda listagem deve incluir este filtro
const { data } = await supabase
  .from('transactions')
  .select('*')
  .is('deleted_at', null)
  .order('date', { ascending: false })
```

### Migração SQL

```sql
ALTER TABLE transactions
  ADD COLUMN updated_at timestamptz DEFAULT now(),
  ADD COLUMN deleted_at timestamptz DEFAULT null;

-- índice para queries de soft delete
CREATE INDEX idx_transactions_deleted_at
  ON transactions (deleted_at)
  WHERE deleted_at IS NULL;
```

---

## 3. Importação e exportação CSV / JSON

### Contexto

Importação é a feature com maior retorno de qualidade de dados. Com ela, o histórico cresce rápido e as previsões passam a ter base real. Exportação é governança: o usuário precisa poder sair com seus dados a qualquer momento.

### Exportação para CSV

```ts
async function exportToCSV() {
  const { data } = await supabase
    .from('transactions')
    .select('*')
    .is('deleted_at', null)

  const headers = ['data', 'tipo', 'titulo', 'valor', 'categoria', 'cofre', 'observacao']
  const rows = data.map(t => [
    t.date, t.type, t.title, t.amount, t.category, t.vault ?? '', t.note ?? ''
  ])

  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `atlas-${new Date().toISOString().slice(0,10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
```

> O `\uFEFF` (BOM) garante que o Excel abra o arquivo com acentos corretamente.

### Exportação para JSON

```ts
async function exportToJSON() {
  const { data } = await supabase
    .from('transactions')
    .select('*')
    .is('deleted_at', null)

  const payload = {
    exported_at: new Date().toISOString(),
    version: '1.0',
    transactions: data,
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `atlas-${new Date().toISOString().slice(0,10)}.json`
  a.click()
}
```

### Importação com validação e preview

```ts
type ImportRow = {
  data: string
  tipo: string
  titulo: string
  valor: string
  categoria: string
  cofre?: string
  observacao?: string
  _valid: boolean
  _duplicate: boolean
}

function parseCSV(text: string): ImportRow[] {
  const [header, ...lines] = text.trim().split('\n')
  const cols = header.split(',').map(c => c.trim().replace(/^"|"$/g, '').toLowerCase())

  return lines.map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    const row = Object.fromEntries(cols.map((c, i) => [c, vals[i]])) as any

    const valid =
      !!row.data &&
      !!row.valor &&
      !isNaN(Number(row.valor)) &&
      ['despesa', 'receita'].includes(row.tipo)

    return { ...row, _valid: valid, _duplicate: false }
  })
}

// deduplicação antes de inserir
function dedupe(rows: ImportRow[], existing: Transaction[]): ImportRow[] {
  const keys = new Set(existing.map(t => `${t.date}|${t.amount}|${t.title}`))
  return rows.map(r => ({
    ...r,
    _duplicate: keys.has(`${r.data}|${r.valor}|${r.titulo}`)
  }))
}

// inserção em lote
async function importRows(rows: ImportRow[]) {
  const valid = rows.filter(r => r._valid && !r._duplicate)

  const records = valid.map(r => ({
    date: r.data,
    type: r.tipo,
    title: r.titulo,
    amount: Number(r.valor),
    category: r.categoria,
    vault: r.cofre || null,
    note: r.observacao || null,
  }))

  const { error } = await supabase.from('transactions').insert(records)
  if (error) throw error
  return records.length
}
```

### Formato do CSV

```
data,tipo,titulo,valor,categoria,cofre,observacao
2025-03-01,despesa,Supermercado,320.50,alimentacao,,
2025-03-05,receita,Salário,8000.00,renda,,depósito dia 5
2025-03-10,despesa,Uber,45.00,transporte,viagem,
```

### UX da tela de importação

1. Upload do arquivo (drag & drop ou input)
2. Parse e validação imediata
3. Preview em tabela: linhas válidas em verde, inválidas em vermelho, duplicatas em âmbar
4. Resumo: "X registros novos, Y duplicatas ignoradas, Z inválidos"
5. Botão de confirmar → insere apenas os válidos e não duplicados

---

## 4. Calendário financeiro

### Contexto

Transforma o painel de "como estou agora" em "o que vem por aí". A ideia é sobrepor eventos financeiros futuros num calendário mensal: recorrências, parcelas, vencimentos e dias de pressão de caixa.

### Fontes de dados

| Fonte | O que gera |
|---|---|
| Recorrências ativas | Um evento por mês no dia correspondente, até o fim da vigência |
| Parcelamentos | Uma entrada por parcela restante, no dia do mês de criação |
| Projeções de receita | Receitas fixas esperadas (salário, aluguel recebido etc.) |

### Estrutura de dados

```ts
type CalendarEvent = {
  date: string           // "2025-04-15"
  type: 'recurrence' | 'installment' | 'projection'
  title: string
  amount: number
  direction: 'in' | 'out'
  source_id: string      // id da recorrência ou parcelamento
  confirmed: boolean     // true = transação real já registrada
}
```

### Gerar eventos futuros de recorrências

```ts
function expandRecurrences(
  recurrences: Recurrence[],
  monthsAhead = 3
): CalendarEvent[] {
  const events: CalendarEvent[] = []
  const today = new Date()

  for (const rec of recurrences) {
    const start = new Date(rec.start_date)
    const end = new Date(start)
    end.setMonth(start.getMonth() + rec.months)

    for (let m = 0; m < monthsAhead; m++) {
      const d = new Date(today)
      d.setMonth(today.getMonth() + m)
      d.setDate(start.getDate())

      if (d >= start && d <= end) {
        events.push({
          date: d.toISOString().slice(0, 10),
          type: 'recurrence',
          title: rec.description,
          amount: rec.amount,
          direction: 'out',
          source_id: rec.id,
          confirmed: false,
        })
      }
    }
  }
  return events
}
```

### Pressão de caixa por dia

```ts
type PressureLevel = 'low' | 'medium' | 'high'

function cashPressureByDay(
  events: CalendarEvent[],
  threshold: number
): Record<string, PressureLevel> {
  const byDay: Record<string, number> = {}

  events
    .filter(e => e.direction === 'out')
    .forEach(e => {
      byDay[e.date] = (byDay[e.date] ?? 0) + e.amount
    })

  return Object.fromEntries(
    Object.entries(byDay).map(([date, total]) => [
      date,
      total > threshold * 2 ? 'high'
        : total > threshold ? 'medium'
        : 'low'
    ])
  )
}
```

### UX recomendada

- Calendário mensal com dots coloridos por dia (verde / âmbar / vermelho)
- Clique no dia abre lista de eventos com valores e origens
- Dias com pressão alta ficam com fundo levemente vermelho
- Evento confirmado (transação real registrada) aparece com ícone de check
- Totais de entrada e saída previstos no cabeçalho do mês

### Confirmação de evento previsto

Quando o usuário registra uma transação real correspondente a um evento do calendário, o sistema tenta fazer o match por `source_id` + `date`. Se encontrar, marca `confirmed: true` e associa o `transaction_id`.

```ts
async function confirmCalendarEvent(
  eventSourceId: string,
  transactionId: string
) {
  // apenas atualiza o estado local — não precisa de tabela separada
  // pode ser um campo virtual calculado no frontend
  const matched = events.find(
    e => e.source_id === eventSourceId && !e.confirmed
  )
  if (matched) matched.confirmed = true
}
```

---

## 5. Login sem identidade real

### Contexto

Nenhum email, nenhuma conta Google ou Microsoft. O usuário cria uma identidade local com uma passphrase + um código de recuperação gerado pelo app. Privacidade total, sem dependência de provedores externos.

### Opções disponíveis

| Opção | Descrição | Portabilidade | Complexidade |
|---|---|---|---|
| **A — Passphrase + UUID local** | App gera UUID único. Usuário cria passphrase. Recovery key = UUID + passphrase. | Alta | Baixa |
| **B — Supabase Anonymous Auth** | `signInAnonymously()` cria sessão com UUID puro. Pode ser promovida depois. | Média | Mínima |
| **C — PIN + device-bound** | Sessão presa ao dispositivo. PIN de 6 dígitos. Sem cross-device. | Nenhuma | Mínima |

### Opção A (recomendada) — Passphrase + UUID local

```ts
import { v4 as uuidv4 } from 'uuid'

async function createLocalIdentity(passphrase: string) {
  // UUID único gerado localmente — nunca enviado a ninguém
  const localId = uuidv4()
  // email fictício baseado no UUID — só existe no Supabase
  const fakeEmail = `${localId}@atlas.local`

  const { error } = await supabase.auth.signUp({
    email: fakeEmail,
    password: passphrase,
    options: { data: { local_id: localId } }
  })

  if (!error) {
    // salva o UUID localmente para login futuro no mesmo device
    localStorage.setItem('atlas_local_id', localId)
    // exibe recovery key para o usuário salvar
    showRecoveryKey(`${localId}::${passphrase}`)
  }
}

async function loginWithPassphrase(passphrase: string) {
  const localId = localStorage.getItem('atlas_local_id')
  if (!localId) return promptRecovery()

  const { error } = await supabase.auth.signInWithPassword({
    email: `${localId}@atlas.local`,
    password: passphrase,
  })
  if (error) showError("Passphrase incorreta")
}

// recuperação em novo dispositivo
async function recoverWithKey(recoveryKey: string, newPassphrase?: string) {
  const [localId, originalPassphrase] = recoveryKey.split('::')
  const fakeEmail = `${localId}@atlas.local`

  const { error } = await supabase.auth.signInWithPassword({
    email: fakeEmail,
    password: newPassphrase ?? originalPassphrase,
  })

  if (!error) {
    localStorage.setItem('atlas_local_id', localId)
  }
}
```

### Opção B — Anonymous Auth nativo do Supabase

```ts
// cria sessão anônima sem nenhum dado de usuário
const { data: { session } } = await supabase.auth.signInAnonymously()
// session.user.id é o UUID permanente do usuário

// se quiser adicionar passphrase depois (opcional, para portabilidade):
await supabase.auth.updateUser({
  email: `${session.user.id}@atlas.local`,
  password: passphrase,
})
```

### Fluxo de recuperação de conta

```
Primeiro uso
└── App gera UUID → usuário define passphrase
    └── App exibe: "a3f9bc12-xxxx::minha-passphrase-forte"
        └── Usuário salva (screenshot, papel, gerenciador de senhas)

Login normal (mesmo device)
└── UUID lido do localStorage → signInWithPassword(email, passphrase)

Login em novo device
└── Usuário cola o recovery key
    └── App extrai UUID → reconstrói fakeEmail → signInWithPassword
```

### O que o Supabase armazena

- Hash bcrypt da passphrase (nunca o texto puro)
- O UUID gerado pelo app
- Data de criação da conta

Nenhum nome, email real, telefone ou dado pessoal chega ao servidor.

### Múltiplas identidades locais

Cada "conta" é um UUID diferente com passphrase própria. Trocar de perfil é só fazer `signOut()` e `signInWithPassword()` com outro par. Sem tela de gerenciamento de usuários, sem complexidade adicional.

### Configurações necessárias no Supabase

```
Authentication > Settings:
  ✓ Desabilitar "Confirm email"
  ✓ Desabilitar "Secure email change"
  ✓ Habilitar "Anonymous sign-ins" (se usar Opção B)

Authentication > URL Configuration:
  Site URL: http://localhost:5173 (dev) / https://seudominio.com (prod)
```

---

## Referências cruzadas

| Feature | Depende de | Habilita |
|---|---|---|
| Autenticação mínima | — | Todas as outras (RLS por user_id) |
| Edição e exclusão | Autenticação | Histórico de alterações futuro |
| Importação CSV | Autenticação | Melhora qualidade das previsões |
| Calendário financeiro | Recorrências existentes | Alertas de pressão de caixa |
| Login sem identidade | Autenticação mínima | Multi-perfil, portabilidade |

---

*Gerado para o Atlas Finance — app financeiro pessoal.*
