# Changelog

Todas as mudanças relevantes deste projeto serão documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

---

## [Não lançado]

---

## [0.4.0] - 2026-04-06

### Adicionado
- **Aba Produtos — filtro por categoria**: combobox de múltipla seleção com checkboxes por categoria, opção "Todas" e label dinâmico refletindo a seleção atual
- **Aba Produtos — filtro de texto**: mantido junto ao combobox; ambos os filtros aplicados simultaneamente
- **Aba Produtos — ordenação de colunas**: clique no cabeçalho ordena asc/desc com seta indicativa e destaque na coluna ativa (colunas: #, Produto, Categoria, Compra, Venda, Estoque, Vendido)
- **Gráfico de Estoque — eixo direito**: linha de lucro por produto (`soldQty × (preço de venda − preço de custo)`) com eixo Y secundário à direita

### Corrigido
- **Gráfico de Estoque — barra Disponível**: passa a usar `p.stock` diretamente em vez de recalcular por `initialStock − soldQty`, corrigindo descasamento após reposições manuais
- **Gráfico de Estoque — percentual vendido no tooltip**: calculado sobre `soldQty + stock` em vez de apenas os datasets hovereados (evitava "100% vendido" incorreto)

---

## [0.3.0] - 2026-04-05

### Adicionado
- **Aba Lucro**: margem acumulada por sessão com histórico de caixas fechados

### Alterado
- **Aba Caixa — vendas por produto**: agrupamento por categoria com subtotal por grupo

---

## [0.2.0] - 2026-04-05

### Adicionado
- **Aba PDV — filtro de produto**: campo de texto para filtrar por nome ou categoria na grade de produtos

### Corrigido
- **Persistência de estado**: estado (incluindo ranks) agora é salvo antes de fechar ou recarregar a página via evento `beforeunload`

---

## [0.1.0] - 2026-04-05

### Adicionado
- Estrutura inicial do projeto Bar Caixa (PDV)
- Servidor Node.js + Express com SQLite (better-sqlite3)
- Aba Fichas: venda de fichas com denominações R$1, R$2, R$5, R$10, R$20; pagamento via dinheiro ou PIX
- Aba PDV: grade de produtos com carrinho e confirmação de venda
- Aba Produtos: tabela de produtos com cadastro, edição, exclusão, atualização de estoque e importação via CSV
- Aba Estoque: gráfico de barras empilhadas (vendido vs. disponível)
- Aba Caixa: resumo financeiro da sessão com totais por forma de pagamento
- Seed automático a partir dos CSVs `nota_de_vinho.csv` e `nota_de_bebida prática.csv`
- Persistência via SQLite no servidor com fallback para localStorage
