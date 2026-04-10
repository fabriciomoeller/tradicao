# Filtros e Ordenação na Aba Estoque

## Objetivo

Equiparar a aba **Estoque** com a aba **Produtos** em termos de usabilidade, adicionando ordenação clicável nas colunas da tabela, filtros por nome e por categoria, e estilo visual consistente para produtos e categorias.

## Alterações Realizadas

### 1. Ordenação por coluna (`app.js`)

- Adicionado estado `_estoqueSort: { col: 'name', dir: 1 }` independente do `_prodSort` da aba Produtos.
- Adicionado método `_sortEstoque(col)` que alterna direção ou muda coluna e re-renderiza.
- Colunas **Produto**, **Categoria**, **Vendido**, **Devolução** e **Saldo** receberam `<th class="sortable-th">` com `onclick` — as mesmas classes CSS já existentes (`sortable-th`, `sort-active`) são reutilizadas.
- Colunas dinâmicas de almoxarifados permanecem sem ordenação (são variáveis por evento).

### 2. Filtro por nome (`app.js`)

- Adicionado estado `_estoqueQuery: ''`.
- Campo `<input id="estoque-filter">` renderizado dentro de `renderEstoque()` com `oninput` que salva o valor em `_estoqueQuery` e re-renderiza.
- Após o re-render, foco é restaurado automaticamente com cursor no final (`setSelectionRange`) para evitar perda de foco ao digitar.

### 3. Filtro por categoria — multiselect (`app.js`)

- Adicionado estado `_estoqueCats: null` (null = todas).
- Adicionados métodos dedicados: `_toggleEstoqueCatDropdown()`, `_buildEstoqueCatOptions()`, `_toggleAllEstoqueCats()`, `_onEstoqueCatCheck()`, `_updateEstoqueCatLabel()`.
- IDs dos elementos prefixados com `estoque-` para não conflitar com o multiselect da aba Produtos (`cat-multiselect-*`).
- Listener global de `click` estendido para fechar o dropdown do estoque ao clicar fora.

### 4. Estilo visual consistente (`app.js`)

- **Nome do produto**: adicionada bolinha colorida (`productColor(p)`) antes do nome, igual à aba Produtos.
- **Categoria**: substituído `<small style="color:var(--muted)">` por `<span class="cat-badge" style="--cat-color:...">` com ícone emoji da categoria, igual à aba Produtos.

## Verificação Técnica

- [x] Clicar em cabeçalho de coluna ordena ascendente; clicar novamente ordena descendente (▲/▼)
- [x] Digitar no campo de busca filtra em tempo real sem perder o foco
- [x] Selecionar/desselecionar categorias no multiselect filtra a tabela
- [x] "Todas as categorias" marca todos; desmarcar individual atualiza o label
- [x] Filtros de Estoque e Produtos são independentes (estado separado)
- [x] Bolinha colorida e badge de categoria aparecem corretamente
- [x] Dropdown fecha ao clicar fora da área do multiselect

---

- **Data**: 09/04/2026 22:10:12
- **Status**: Implementado
- **Tipo**: Melhoria de usabilidade
