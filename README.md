# Atlas Finance

App financeiro pessoal pronto para deploy na Vercel com persistencia no Supabase.

## Rodar localmente

```bash
npm install
npm run dev
```

Crie um arquivo `.env.local` a partir de `.env.example` se quiser conectar o banco localmente.

## Configurar o Supabase

1. Crie um projeto no Supabase.
2. Abra o SQL Editor.
3. Execute o arquivo `supabase/schema.sql`.
4. Copie a `Project URL` e a `anon key`.
5. Preencha:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Deploy na Vercel

1. Importe o repositório na Vercel.
2. Adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nas variaveis de ambiente.
3. Faça um novo deploy depois de salvar as variaveis.

## Observacao importante

Este projeto esta configurado sem login e com politicas anonimas no Supabase para facilitar uso pessoal. Se a URL do app for publica, qualquer pessoa que acessar o frontend podera ler e gravar dados.
