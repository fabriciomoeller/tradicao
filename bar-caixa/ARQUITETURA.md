# Arquitetura — Bar Caixa (PDV)

## Visão Geral

O Bar Caixa é um sistema de ponto de venda (PDV) para eventos e festas, dividido em duas camadas:

```
┌──────────────────────────────────────────────────────┐
│  Navegador (Frontend)                                │
│                                                      │
│  index.html ─── styles.css ─── app.js (~960 linhas)  │
│       │              │              │                 │
│       │              │         ┌────┴────────┐       │
│       │              │         │  Módulos JS  │       │
│       │              │         │  DB, UI,     │       │
│       │              │         │  Tokens,     │       │
│       │              │         │  Products,   │       │
│       │              │         │  Sales,      │       │
│       │              │         │  Reports,    │       │
│       │              │         │  Charts,     │       │
│       │              │         │  Pix         │       │
│       │              │         └────┬────────┘       │
│       │              │              │                 │
│  CDNs: Chart.js, QRCode.js    localStorage           │
└──────────────────────────────────┼───────────────────┘
                                   │ fetch /api/state
                                   │ (GET + POST)
┌──────────────────────────────────┼───────────────────┐
│  Servidor (Backend)              │                    │
│                                  │                    │
│  server.js (~370 linhas)         │                    │
│  Express + better-sqlite3        │                    │
│                                  ▼                    │
│  ┌───────────────────────────────────┐               │
│  │  bar-caixa.db (SQLite)            │               │
│  │  - settings                       │               │
│  │  - products                       │               │
│  │  - token_sales                    │               │
│  │  - sales / sale_items             │               │
│  │  - cash_register_sessions         │               │
│  └───────────────────────────────────┘               │
└──────────────────────────────────────────────────────┘
```

## Frontend — `app.js`

Um único arquivo JavaScript vanilla organizado em módulos-objeto (object literals):

| Módulo       | Responsabilidade                                            |
|--------------|-------------------------------------------------------------|
| **DB**       | Lê/escreve no localStorage e sincroniza com o servidor      |
| **Pix**      | Gera payload EMV para QR Code de pagamento PIX              |
| **Tokens**   | Carrinho de fichas (denominações R$1, R$2, R$5, R$10, R$20) |
| **Products** | CRUD de produtos, importação de CSV                         |
| **Sales**    | Carrinho de vendas do PDV, checkout com dedução de estoque  |
| **Reports**  | Relatórios de fechamento de caixa                           |
| **Charts**   | Gráfico de estoque (vendido vs disponível) via Chart.js     |
| **UI**       | Navegação por abas, modais, formulários, toasts             |

### Fluxo de dados

1. Na inicialização, `DB.loadFromServer()` tenta carregar o estado do SQLite via `GET /api/state`
2. Se o servidor estiver indisponível, usa o que já estava no `localStorage` (resiliência offline)
3. Toda alteração passa por `DB.update(fn)` — que atualiza localStorage imediatamente e agenda um sync com debounce de 250ms via `POST /api/state`
4. O servidor recebe o JSON completo e persiste no SQLite dentro de uma transação

## Backend — `server.js`

Servidor Express minimalista com 3 endpoints:

| Rota              | Método | Função                                         |
|-------------------|--------|-------------------------------------------------|
| `/api/state`      | GET    | Retorna o estado completo do banco como JSON    |
| `/api/state`      | POST   | Recebe o estado e persiste no SQLite (transação)|
| `/api/report`     | GET    | Relatório rápido via queries SQL diretas        |

O banco usa **WAL mode** para melhor performance de leitura/escrita concorrente. Os statements SQL são preparados uma vez e reutilizados.

### Seed automático

Na primeira execução (tabela `products` vazia), o servidor lê os CSVs da raiz do projeto (`nota_de_vinho.csv` e `nota_de_bebida prática.csv`) e popula o banco automaticamente.

## Modelo de persistência: localStorage + SQLite

```
                  escrita instantânea        debounce 250ms
  UI ──────────► localStorage ──────────────► SQLite (servidor)
                  (sempre disponível)         (quando online)
```

- **localStorage** garante que o PDV nunca trava, mesmo sem rede
- **SQLite** é a fonte de verdade — ao abrir a página, o frontend tenta carregar dele primeiro
- Se o servidor cair durante o evento, o operador continua vendendo normalmente

## Dependências externas

| Dependência        | Onde       | Por quê                                    |
|--------------------|------------|--------------------------------------------|
| **Express**        | Backend    | Servidor HTTP para API e arquivos estáticos |
| **better-sqlite3** | Backend    | Driver SQLite síncrono e rápido para Node  |
| **Chart.js** (CDN) | Frontend   | Gráfico de estoque vendido/disponível      |
| **qrcode-generator** (CDN) | Frontend | QR Code PIX com Byte mode explícito   |

Total: **2 dependências npm** no backend, **2 CDNs** no frontend.

---

## Módulo PIX — Geração de QR Code

### Formato do payload (EMV estático)

O payload segue o padrão **EMV QRCPS** do Banco Central (BR Code Manual v2.0). Campos em ordem obrigatória:

```
000201                                         ← Field 00: versão EMV
2636 0014BR.GOV.BCB.PIX 0114<chave>           ← Field 26: conta PIX (sub-fields 00 + 01)
52040000                                       ← Field 52: MCC (sempre 0000)
5303986                                        ← Field 53: moeda (986 = BRL)
5404<valor>                                    ← Field 54: valor (ex: 2.00)
5802BR                                         ← Field 58: país
59<n><nome>                                    ← Field 59: nome do recebedor (máx 25 chars)
60<n><cidade>                                  ← Field 60: cidade (máx 15 chars)
62<n> 05<n><txid>                              ← Field 62.05: Reference Label
6304<CRC>                                      ← Field 63: CRC-16 CCITT-FALSE (4 hex)
```

### CRC-16 CCITT-FALSE

- Polinômio: `0x1021` | Init: `0xFFFF` | RefIn/RefOut: `false` | XorOut: `0x0000`
- Calculado sobre o payload completo **incluindo** `6304` (sem o valor do CRC)

### Restrições de formato por tipo de chave

O BCB registra as chaves no DICT **sem formatação**. Se o payload enviar uma chave com pontuação, o banco não a encontra e rejeita o pagamento com "PIX Copia e Cola falhou".

| Tipo | Formato correto no payload | Erro comum |
|------|---------------------------|------------|
| CPF | `12345678909` (11 dígitos) | `123.456.789-09` |
| CNPJ | `12345678000190` (14 dígitos) | `12.345.678/0001-90` |
| Telefone | `+5511999998888` (com +55) | `11999998888` |
| E-mail | `usuario@email.com` (lowercase) | `Usuario@Email.com` |
| EVP/UUID | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | — |

O código normaliza automaticamente em `Pix.payload()`: CPF/CNPJ têm formatação removida via regex; e-mail vai para lowercase; telefone e UUID mantidos como estão.

### QR Code — Byte mode obrigatório

A biblioteca `qrcode-generator` (jsDelivr CDN) é usada com `qr.addData(payload, 'Byte')`. O **Byte mode é obrigatório** porque:

- Chaves e-mail contêm `@` (fora do charset Alphanumeric do QR)
- UUIDs têm letras minúsculas (fora do charset Alphanumeric)
- Telefones têm `+` (fora do charset Alphanumeric)

Usar Alphanumeric mode geraria um QR code inválido para a maioria dos tipos de chave. A biblioteca anterior (`qrcodejs` v1.0.0, de 2012) não gerenciava isso corretamente.

### Campo 62.05 — Reference Label (identificador de origem)

Configurável via **Configurações → Identificador da origem**. Permite filtrar entradas no app do banco por evento (ex: `FESTAJUNINA2025`). Aceita apenas `[A-Z0-9]`, máx 25 chars — a normalização é feita automaticamente. Valor padrão: `BARCAIXA`.

---

## Por que JavaScript puro e não um framework?

### O contexto do projeto

O Bar Caixa é um PDV para **eventos pontuais** (festas, feiras, bazares). Ele precisa:
- Funcionar em qualquer celular/tablet com navegador
- Ser instalado e configurado em minutos
- Ser mantido por uma ou duas pessoas
- Continuar funcionando mesmo se o Wi-Fi do evento cair

### Frameworks considerados e motivos para não usar

#### React / Vue / Angular / Svelte

**Não usamos porque:**

- **Build step obrigatório** — todos precisam de um bundler (Vite, Webpack, esbuild). Isso adiciona `node_modules` com centenas de pacotes, um `package.json` com scripts de build, e a necessidade de compilar antes de rodar. O app atual é "edita o arquivo, recarrega o navegador" — zero fricção.

- **Overhead desproporcional** — a interface tem ~5 telas (Fichas, PDV, Produtos, Estoque, Caixa) com interações simples (clicar produto, ver total, confirmar venda). Um framework reativo resolve problemas de estado complexo que esse projeto simplesmente não tem.

- **Reatividade não é um gargalo aqui** — o estado muda em momentos pontuais (clicou no produto, confirmou venda, fechou caixa). Não há formulários dinâmicos, listas filtradas em tempo real, ou websockets. As re-renderizações manuais (`renderPDVGrid()`, `renderCaixa()`) são intencionais e performáticas.

- **Tamanho do bundle** — o `app.js` inteiro tem ~30KB. O React sozinho (minificado) tem ~40KB; com ReactDOM, ~130KB. Adicionar um framework dobraria ou triplicaria o JavaScript carregado, sem benefício proporcional.

#### TypeScript

**Não usamos porque:**

- O `app.js` é servido **diretamente pelo Express** ao navegador. Para usar TypeScript, precisaríamos de um passo de compilação (`tsc` ou bundler), o que quebra a simplicidade do fluxo atual.

- Os "tipos" do projeto são simples — objetos com 5-6 campos (product, sale, token_sale). Não há herança, generics, ou interfaces complexas onde TypeScript evitaria bugs reais.

- Para um arquivo de ~960 linhas mantido por poucas pessoas, os benefícios de autocomplete e checagem de tipos não justificam a infraestrutura adicional.

- **Alternativa sem migrar:** um `jsconfig.json` com `checkJs: true` e anotações JSDoc nos pontos críticos daria autocomplete e checagem no VS Code sem mudar nada na infra.

#### Next.js / Nuxt / Remix (full-stack)

**Não usamos porque:**

- Esses frameworks pressupõem SSR, roteamento por arquivo, e deploy em plataformas como Vercel/Netlify. O Bar Caixa roda num notebook no canto do evento com `node server.js`.

- A camada de API atual é extremamente simples (3 rotas, ~40 linhas). Não precisa de abstração de rotas, middleware chains, ou ORM.

- SQLite com `better-sqlite3` é síncrono e intencional — uma única instância, sem pool, sem conexões remotas. ORMs como Prisma ou Drizzle adicionariam complexidade sem ganho.

#### Electron / Tauri (app desktop)

**Não usamos porque:**

- O app precisa rodar em **qualquer dispositivo com navegador** — celulares, tablets, notebooks. Empacotar como app desktop eliminaria essa flexibilidade.

- O modelo atual (servidor local + navegador) já dá acesso por múltiplos dispositivos na mesma rede, o que é essencial num evento (caixa no notebook, garçom no celular).

### O que o JavaScript puro entrega

| Requisito do evento        | Como o vanilla JS resolve                          |
|----------------------------|----------------------------------------------------|
| Setup rápido               | `npm install && npm start` — pronto                |
| Funciona offline           | localStorage como fallback automático              |
| Qualquer dispositivo       | Navegador padrão, sem instalar nada                |
| Fácil de modificar         | Edita o arquivo, recarrega — sem build, sem deploy |
| Poucas dependências        | 2 pacotes npm, 2 CDNs — mínimo de superfície       |
| Performance                | ~30KB de JS próprio, sem virtual DOM, sem hydration |

### Quando valeria a pena migrar?

A decisão de manter vanilla JS deveria ser **reavaliada** se:

- O frontend ultrapassar **~2.000 linhas** e a organização em object literals ficar difícil de manter
- Surgir necessidade de **estado reativo complexo** (ex: múltiplos operadores editando ao mesmo tempo via websocket)
- O projeto precisar de **múltiplas páginas/rotas** com navegação complexa
- Uma **equipe maior** (3+ desenvolvedores) precisar trabalhar no frontend simultaneamente

Nenhuma dessas condições se aplica hoje.
