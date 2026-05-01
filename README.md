# Atlas Finance

App financeiro pessoal pronto para deploy na Vercel com persistencia no Supabase, autenticacao minima por passphrase e identidade local sem email real.

## Rodar localmente

```bash
npm install
npm run dev
```

Crie um arquivo `.env.local` a partir de `.env.example` se quiser conectar o banco localmente.

## Configurar o Supabase

1. Crie um projeto no Supabase.
2. Em `Authentication > Settings`, desabilite a confirmacao por email.
3. Em `Authentication > URL Configuration`, configure:
   `Site URL`: `http://localhost:5173` no dev e depois sua URL da Vercel em producao.
4. Abra o SQL Editor.
5. Execute o arquivo `supabase/schema.sql`.
6. Copie a `Project URL` e a `anon key`.
7. Preencha:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Deploy na Vercel

1. Importe o repositório na Vercel.
2. Adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nas variaveis de ambiente.
3. Faça um novo deploy depois de salvar as variaveis.

## Observacao importante

Agora o app usa autenticacao minima com identidade local e RLS por `user_id`. Isso ja e bem mais seguro que o modo anonimo anterior, mas ainda depende de alguns cuidados:

- guarde a recovery key gerada no primeiro uso
- use uma passphrase forte
- se o schema antigo com politicas anonimas ja foi aplicado no seu projeto, vale resetar o banco ou reaplicar o novo `schema.sql`
