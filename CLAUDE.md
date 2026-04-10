# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Tradição

Repositório com duas aplicações independentes para eventos/festas.

## Estrutura

```
Tradicao/
├── label-generator/          # App 1: Gerador de Etiquetas (frontend puro)
│   ├── index.html, script.js, styles.css
│   └── imagem/nasrudin.jpeg  # Imagem de fundo padrão das etiquetas
├── bar-caixa/                # App 2: PDV Bar/Caixa (Node.js + Express + SQLite)
│   ├── server.js             # Servidor Express + SQLite (better-sqlite3)
│   ├── index.html            # Frontend vanilla JS do PDV
│   └── bar-caixa.db         # Banco SQLite (gerado automaticamente)
├── .claude/skills/           # Skills locais do projeto (documentation, git)
├── docs/                     # Documentação de implementações
├── nota_de_vinho.csv         # Seed de vinhos (separador: ;)
└── nota_de_bebida prática.csv # Seed de bebidas (separador: ;)
```

## Comandos

```bash
# Bar Caixa
cd bar-caixa
npm install        # primeira vez
npm start          # produção (node server.js)
npm run dev        # desenvolvimento (node --watch server.js)

# Gerador de Etiquetas — abrir diretamente no navegador
open label-generator/index.html
```

## App 1: Gerador de Etiquetas

Frontend puro (HTML + CSS + JS), sem backend. Gera etiquetas para impressão em A4 (tickets, preços, rifas). Fontes externas via Google Fonts (Oswald, Bebas Neue, Roboto Condensed, DM Mono).

## App 2: Bar Caixa (PDV)

Node.js + Express + better-sqlite3. Porta padrão: 3000 (`PORT` env var). Seed automático dos CSVs na primeira execução.

### API

- `GET /api/state` — retorna estado completo como JSON (lê todas as tabelas)
- `POST /api/state` — persiste estado completo em transação SQLite (sincronização total: upsert + delete de registros ausentes)
- `GET /api/report` — relatório agregado (fichas por método, top produtos, estoque por almoxarifado)

O frontend mantém o estado completo em memória e envia o estado inteiro a cada `POST /api/state`. Não há endpoints individuais de CRUD — tudo é sincronização total em transação única.

### Tabelas SQLite

| Tabela | Descrição |
|--------|-----------|
| `settings` | Configurações chave-valor (nome da loja, PIX, categorias JSON) |
| `products` | Catálogo de produtos (preço, custo, estoque legado, categoria, rank) |
| `almoxarifados` | Locais de estoque (tipo, rank) |
| `product_stocks` | Estoque por produto × almoxarifado (chave composta) |
| `stock_movements` | Histórico de movimentações (entrada, transferência, etc.) |
| `token_sales` | Vendas de fichas (valor, método, denominações em JSON) |
| `sales` + `sale_items` | Vendas do PDV |
| `cash_register_sessions` | Sessões de abertura/fechamento de caixa |

**Migrações:** feitas inline via `ALTER TABLE … ADD COLUMN` dentro de `try/catch` no topo do `server.js`.

### Abas do frontend

| Aba | Função |
|-----|--------|
| Fichas | Venda de fichas por denominação (R$1/2/5/10/20), pagamento dinheiro ou PIX |
| PDV | Grade de produtos com filtro, carrinho e finalização de venda |
| Produtos | CRUD de produtos, import CSV, gerenciamento de categorias |
| Almoxarifados | CRUD de almoxarifados (locais de estoque) |
| Estoque | Movimentações de estoque, transferências entre almoxarifados |
| Caixa | Abertura/fechamento de caixa, histórico de sessões |
| Lucro | Gráficos e análise de lucratividade (Chart.js) |

## Convenções

- Idioma: português brasileiro (interface, variáveis, comentários)
- Sem framework frontend — vanilla JS
- SQLite como banco único, sem migrations externas (migrações inline no `server.js`)
- CSVs usam `;` como separador

## Skills locais (`.claude/skills/`)

### `/documentation`

Antes de commitar qualquer feature, criar um arquivo de documentação em `docs/` com o formato:

- **Nome do arquivo:** `YYYY-MM-DD-HH-MM-SS-slug-name.md`
- **Estrutura:** Objetivo, Alterações Realizadas, Verificação Técnica, Metadata (data, status, tipo)
- **Atualizar** `docs/README.md`: adicionar linha na tabela "Histórico de Implementações Detalhadas"

### `/git`

Workflow de commit padronizado:

1. Implementação aprovada pelo usuário
2. Arquivo de documentação criado em `docs/`
3. Usar o título H1 do arquivo de documentação como mensagem de commit
4. `git add .` → `git commit -m "Título do Documento"`

Regra: nunca commitar sem documentação correspondente em `docs/`.
