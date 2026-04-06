# Bar Caixa

Sistema de ponto de venda (PDV) para bar, com moeda virtual (fichas), persistência em SQLite e geração de QR Code PIX.

## Requisitos

- Node.js 18+
- npm

## Instalação e execução

```bash
cd bar-caixa
npm install
npm start
```

Acesse em **http://localhost:3000**

---

## Estrutura de arquivos

```
bar-caixa/
├── server.js                # Backend Express + SQLite
├── app.js                   # Lógica frontend (SPA)
├── index.html               # Estrutura HTML
├── styles.css               # Estilos (tema escuro)
├── exemplo-importacao.csv   # Modelo de importação de produtos
├── package.json
└── bar-caixa.db             # Banco SQLite (criado automaticamente)
```

---

## Funcionalidades

### 🎫 Fichas
- Seleção de denominações: R$ 1 / 2 / 5 / 10 / 20
- Pagamento em **Dinheiro** ou **PIX**
- PIX gera QR Code válido (padrão EMV BR.GOV.BCB.PIX) com botão copiar

### 🛒 PDV
- Grade de produtos com foto (ou emoji da categoria, quando sem foto)
- Borda colorida por produto/categoria
- Carrinho com botões de `+` e `−` dimensionados para touch
- Controle de estoque em tempo real (impede vender além do disponível)
- Confirmação de venda atualiza estoque e sincroniza SQLite imediatamente

### 🏷 Categorias
- Cadastro livre de categorias com **nome**, **cor de destaque** e **ícone (emoji)**
- Categorias padrão criadas na primeira execução (ver tabela abaixo)
- Gerenciamento pelo botão **"🏷 Categorias"** na aba Produtos
- A cor e o ícone de cada categoria são usados em toda a interface: cartões do PDV, badges na listagem de produtos e seletor no formulário

**Categorias padrão:**

| Ícone | Nome | Cor |
|---|---|---|
| 🍺 | Cerveja | Âmbar `#C8860A` |
| 🍷 | Vinho | Bordô `#8B3146` |
| 🥤 | Refrigerante | Roxo `#7B3FA0` |
| 💧 | Água | Azul `#0288D1` |
| 🍽 | Porção | Laranja `#D97706` |
| 🥜 | Petisco | Caramelo `#A0522D` |
| 📦 | Outro | Índigo `#4f46e5` |

> Alguns produtos têm cor sobreposta pelo nome (Coca-Cola, Coca-Cola Zero, Guaraná, Guaraná Zero, Heineken) independentemente da categoria.

#### Onde encontrar emojis para os ícones

O campo de ícone aceita qualquer **emoji** digitado diretamente. Emojis são caracteres de texto — não é necessário baixar imagens.

| Forma de inserir | Como fazer |
|---|---|
| **Windows** | Tecla `Win + .` (ponto) abre o painel de emojis |
| **macOS** | `Ctrl + Cmd + Espaço` abre o seletor de emojis |
| **Linux** | `Ctrl + .` no GNOME, ou copie de uma fonte externa |
| **Celular** | Teclado virtual — tecle no ícone de emoji |
| **Qualquer sistema** | Copie de [emojipedia.org](https://emojipedia.org) ou [unicode.org/emoji](https://unicode.org/emoji/charts/full-emoji-list.html) e cole no campo |

Dicas de emojis úteis para bar/evento:

```
🍺 🍻 🍷 🥂 🍸 🍹 🥃 🍾
🥤 🧃 ☕ 🧋 💧 🫗
🍕 🍔 🌭 🍟 🥪 🧆 🥜 🍿
🎵 🎉 🎊 🎟 🏷 ⭐
```

### 📦 Produtos
- Cadastro completo: nome, preço unitário de compra, preço unitário de venda, estoque, categoria, posição no PDV, foto
- Upload de foto com recorte automático em quadrado (compressão JPEG)
- **Posição no PDV**: campo numérico (1 = aparece primeiro, 999 = último)
- Importação em lote via CSV (botão "⬆ Importar CSV" na aba Produtos)

### 📊 Estoque
- Gráfico de barras empilhadas (Chart.js)
- Cada barra = um produto; verde = disponível, vermelho = vendido
- 100% da barra = estoque inicial

### 💰 Caixa
- Resumo em tempo real: fichas vendidas por PIX e dinheiro, vendas por produto
- Fechamento gera relatório detalhado (imprimível via `Ctrl+P`)
- Ao fechar, dados do período são arquivados e contadores zerados

### ⚙ Configurações
- Nome do estabelecimento
- Chave PIX, nome e cidade do recebedor

---

## Importação de produtos via CSV

Use o botão **"⬆ Importar CSV"** na aba **Produtos**. O arquivo deve seguir o formato normalizado com separador `;`:

```
Nome;Categoria;Compra;Venda;Estoque
Cerveja Corona 330ml;Cerveja;5,50;12,00;24
Heineken 330ml;Cerveja;5,00;10,00;48
```

| Coluna | Descrição |
|---|---|
| **Nome** | Nome do produto |
| **Categoria** | Nome exato de uma categoria cadastrada (comparação sem distinção de maiúsculas) |
| **Compra** | Preço unitário de compra (vírgula ou ponto como decimal) |
| **Venda** | Preço unitário de venda |
| **Estoque** | Quantidade inicial em estoque |

- A **primeira linha é sempre o cabeçalho** e será ignorada
- Se a categoria não existir no cadastro, o produto é atribuído à categoria "Outro"
- Produtos com nomes já existentes no sistema são ignorados
- Um arquivo de exemplo está disponível em `exemplo-importacao.csv`

---

## Persistência

- **localStorage**: cache local, garante funcionamento offline
- **SQLite** (`bar-caixa.db`): persistência principal via API REST interna
  - `GET /api/state` — lê estado completo
  - `POST /api/state` — salva estado
  - `GET /api/report` — relatório SQL direto (debug)
- Sincronização automática: a cada alteração o frontend envia o estado ao servidor; checkout força sync imediato

### Tabelas SQLite

| Tabela | Conteúdo |
|---|---|
| `settings` | Configurações chave/valor, incluindo categorias (chave `categories_json`) |
| `products` | Produtos com estoque, preços de compra/venda, rank e imagem |
| `token_sales` | Vendas de fichas (PIX ou dinheiro) |
| `sales` | Pedidos finalizados |
| `sale_items` | Itens de cada pedido |
| `cash_register_sessions` | Histórico de fechamentos |

---

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta do servidor |
