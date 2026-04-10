# Bar Caixa — Manual do Usuário

Sistema de ponto de venda (PDV) para bar/evento, com fichas, controle de estoque por almoxarifado, gestão de fornecedores consignados e relatórios de fechamento.

## Requisitos e execução

```bash
cd bar-caixa
npm install      # apenas na primeira vez
npm start        # produção (http://localhost:3000)
npm run dev      # desenvolvimento (recarrega automaticamente)
```

---

## Abas do sistema

### 🎫 Fichas

Venda de fichas (moeda virtual do evento).

- Selecione as denominações: **R$ 1 / 2 / 5 / 10 / 20**
- Clique em **Pagar Dinheiro** ou **Pagar PIX**
- O PIX gera QR Code válido (padrão EMV BR.GOV.BCB.PIX) com botão copiar
- O valor acumulado aparece no topo; clique **Limpar** para cancelar

---

### 🛒 PDV

Grade de produtos para atendimento no balcão.

- Clique no produto para adicioná-lo ao carrinho
- Use `+` / `−` no carrinho para ajustar quantidades
- O sistema impede vender além do estoque disponível
- **Filtrar**: campo de busca filtra por nome ou categoria em tempo real
- **Confirmar Venda** desconta o estoque e registra a venda

---

### 📦 Produtos

Cadastro e gestão do catálogo de produtos.

| Campo | Descrição |
|-------|-----------|
| **Nome** | Nome exibido no PDV e nos relatórios |
| **Categoria** | Agrupa produtos no PDV e nos relatórios |
| **Preço de compra** | Custo unitário (usado no cálculo de lucro) |
| **Preço de venda** | Preço cobrado no PDV |
| **Posição** | Ordem de exibição no PDV (1 = primeiro, 999 = último) |
| **Foto** | Upload com recorte automático em quadrado |

**Importação CSV** — botão "⬆ Importar CSV":

```
Nome;Categoria;Compra;Venda;Estoque
Cerveja Corona 330ml;Cerveja;5,50;12,00;24
```

**Categorias** — botão "🏷 Categorias":
- Cada categoria tem nome, cor de destaque e ícone (emoji)
- A cor aparece nos cartões do PDV e nos badges da listagem

Categorias padrão:

| Ícone | Nome | Cor |
|-------|------|-----|
| 🍺 | Cerveja | Âmbar |
| 🍷 | Vinho | Bordô |
| 🥤 | Refrigerante | Roxo |
| 💧 | Água | Azul |
| 🍽 | Porção | Laranja |
| 🥜 | Petisco | Caramelo |
| 📦 | Outro | Índigo |

---

### 🏪 Almoxarifados

Locais físicos onde o estoque é armazenado (ex.: Freezer, Consignado OmaMute, Depósito Próprio).

**Tipos de almoxarifado:**

| Tipo | Uso |
|------|-----|
| **Consignado** | Mercadoria de fornecedor que ainda não foi paga — somente o vendido/retido é cobrado |
| **Freezer** | Produtos gelados prontos para venda |
| **Próprio** | Estoque comprado antecipadamente |
| **Outro** | Uso geral |

O tipo **Consignado** é reconhecido pelo sistema para montar o relatório de controle consignado.

---

### 🤝 Fornecedores

Cadastro dos fornecedores que entregam produtos (especialmente consignados).

**Campos:**
- **Nome** — identificação do fornecedor (ex.: OmaMute)
- **Contato** — telefone, e-mail ou WhatsApp
- **Observação** — anotação livre (ex.: "consignado — água, refri e cerveja")

O card de cada fornecedor mostra o **total de unidades entradas**, **devoluções** e o **valor líquido a pagar** calculado em tempo real.

> **Vincular ao estoque:** o fornecedor é selecionado no formulário de **Entrada de Estoque**, não no cadastro do produto. O vínculo fica no movimento — assim o mesmo produto pode vir de fornecedores diferentes em eventos distintos.

---

### 📊 Estoque

Movimentações de estoque entre almoxarifados.

**Tipos de movimento:**

| Tipo | Descrição |
|------|-----------|
| **Entrada** | Recebimento de mercadoria (de fornecedor ou própria) |
| **Transferência** | Move unidades de um almoxarifado para outro (ex.: consignado → freezer) |
| **Devolução** | Retorno de mercadoria ao fornecedor (reduz o consignado sem destino interno) |
| **Ajuste** | Correção manual de quantidade |

**Fluxo consignado típico (ex.: OmaMute):**

```
1. Entrada de 100 un no almoxarifado "Consignado OmaMute"
   → selecionar fornecedor "OmaMute" na entrada
2. Transferência: Consignado → Freezer (conforme vai gelando)
3. Venda via PDV (desconta do almoxarifado ativo do produto)
4. Devolução: o que sobrou no consignado volta ao fornecedor
5. Relatório calcula: Entrou − Devolvido = A pagar
```

O campo **Custo unitário** na entrada define o valor usado no cálculo de pagamento ao fornecedor e na análise de lucro.

---

### 💰 Caixa

Painel de fechamento e relatório do evento.

**Resumo em tempo real:**
- Total de fichas vendidas (PIX + Dinheiro)
- Total de vendas por produto (agrupado por categoria)
- **Pagamentos a Fornecedores** — valor líquido a pagar por fornecedor, descontadas as devoluções

**Seção Pagamentos a Fornecedores:**

| Coluna | Descrição |
|--------|-----------|
| Entrou | Total de unidades recebidas do fornecedor |
| Devolvido | Unidades devolvidas após o evento |
| A pagar | Entrou − Devolvido (vendido + retido) |
| Valor | A pagar × custo unitário |

> Fórmula: **A pagar = Entradas − Devoluções**
> O que foi vendido e o que ficou no seu estoque são cobrados; o que foi devolvido não.

**Fechar Caixa:**
- Gera relatório de fechamento com todos os dados do período
- Zera vendas e fichas do período atual
- Mantém histórico de fechamentos anteriores

**Exportar Relatório (.md):**
- Baixa um arquivo Markdown com: resumo financeiro, custos fixos, vendas por categoria, posição de estoque, pagamentos a fornecedores, controle consignado e catálogo de preços

---

### 📈 Lucro

Análise de rentabilidade por produto e categoria.

- Receita, custo e lucro por produto (baseado no preço de compra cadastrado)
- Custos fixos do evento (gerador, gelo, descartáveis, etc.)
- Lucro acumulado entre fechamentos

**Custos Fixos** — adicionados na aba Lucro:
- Descrição, quantidade e custo unitário
- São descontados do lucro total no relatório

---

## Configurações (⚙)

| Campo | Descrição |
|-------|-----------|
| Nome do estabelecimento | Aparece no cabeçalho e nos relatórios |
| Chave PIX | Chave usada na geração do QR Code |
| Nome do recebedor PIX | Nome exibido no PIX |
| Cidade PIX | Cidade exibida no PIX |

---

## Persistência de dados

- **SQLite** (`bar-caixa.db`): banco principal, criado automaticamente na primeira execução
- Todos os dados são enviados ao servidor a cada alteração (sincronização automática)
- O banco persiste entre reinicializações do servidor

### Tabelas SQLite

| Tabela | Conteúdo |
|--------|----------|
| `settings` | Configurações chave/valor (nome, PIX, categorias) |
| `products` | Catálogo de produtos |
| `almoxarifados` | Locais de estoque |
| `product_stocks` | Estoque por produto × almoxarifado |
| `stock_movements` | Histórico de movimentações (entrada, transferência, devolução, ajuste) |
| `fornecedores` | Cadastro de fornecedores |
| `token_sales` | Vendas de fichas |
| `sales` + `sale_items` | Pedidos finalizados |
| `cash_register_sessions` | Histórico de fechamentos de caixa |

---

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `PORT` | `3000` | Porta do servidor HTTP |
