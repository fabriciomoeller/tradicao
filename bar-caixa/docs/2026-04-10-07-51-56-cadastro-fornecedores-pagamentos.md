# Cadastro de Fornecedores e Pagamentos no Relatório

## Objetivo

Permitir registrar os fornecedores (ex.: OmaMute — consignado de águas, refrigerantes e cervejas) e vincular cada entrada de estoque ao fornecedor responsável. Com isso, o relatório do caixa e o relatório exportado (.md) passam a exibir um resumo de quanto deve ser pago a cada fornecedor, baseado nas entradas registradas.

## Alterações Realizadas

### server.js

- **Migrações inline**: duas novas colunas em `stock_movements` — `fornecedor_id TEXT` e `fornecedor_name TEXT`.
- **Nova tabela `fornecedores`**: `id, name, contact, note` (criada via `CREATE TABLE IF NOT EXISTS`).
- **Statements preparados**: `upsertFornec`, `allFornecIds`, `deleteFornec`, `allFornec`.
- **`readState()`**: inclui o array `fornecedores` no estado retornado; `stockMovements` agora retorna `fornecedorId` e `fornecedorName`.
- **`persistState()`**: sincroniza a tabela `fornecedores` (upsert + delete de ausentes) e persiste os campos `fornecedor_id`/`fornecedor_name` em cada movimento.

### index.html

- Nova aba **🤝 Fornecedores** no nav, entre Almoxarifados e Estoque.
- Nova `<section id="tab-fornecedores">` no main.

### app.js

- **`DB._default()`**: adicionado `fornecedores: []`.
- **Novo objeto `Fornecedores`**: métodos `all()`, `byId()`, `save()`, `delete()`. A exclusão desvincula movimentações existentes após confirmação do usuário.
- **`showTab()`**: despacha `renderFornecedoresTab()` para a aba `fornecedores`.
- **`UI.renderFornecedoresTab()`**: lista os fornecedores com totais de entradas (qtd e valor), botões de editar e excluir.
- **`UI.showFornecedorForm()`** + **`UI._saveFornecedor()`**: modal de criação/edição com campos Nome, Contato e Observação.
- **`Stock.entrada()`**: agora aceita `fornecedorId` e `fornecedorName` e os persiste no movimento de estoque.
- **`UI.showEntradaModal()`**: adicionado `<select id="en-fornec">` com a lista de fornecedores cadastrados (opcional).
- **`UI._saveEntrada()`**: lê o fornecedor selecionado e repassa para `Stock.entrada()`.
- **`Reports._fornecedoresHTML()`**: novo método que agrupa entradas por fornecedor (apenas `type === 'entrada'` com `fornecedorId` preenchido) e retorna HTML com resumo de produtos, quantidades e valores a pagar.
- **`UI.renderCaixa()`**: inclui o bloco de Pagamentos a Fornecedores no painel do caixa.
- **`Reports.exportMarkdown()`**: nova seção **5. Pagamentos a Fornecedores** com tabela por fornecedor (produto, qtd, custo unit., total) e total geral; seções anteriores 5 e 6 renumeradas para 6 e 7.

## Verificação Técnica

- [x] `node --check server.js` — sem erros de sintaxe
- [x] `node --check app.js` — sem erros de sintaxe
- [x] Nova tabela `fornecedores` criada sem quebrar banco existente
- [x] Migrações das colunas `fornecedor_id`/`fornecedor_name` seguras (try/catch)
- [x] Aba Fornecedores renderiza lista vazia com botão "Novo Fornecedor"
- [x] Formulário de entrada de estoque exibe select de fornecedor (opcional)
- [x] Movimentos sem fornecedor continuam funcionando normalmente
- [x] Seção "Pagamentos a Fornecedores" aparece no caixa somente quando há entradas vinculadas
- [x] Relatório exportado inclui seção de fornecedores com tabelas por fornecedor

## Metadata

- **Data:** 10/04/2026 07:51:56
- **Status:** Concluído
- **Tipo:** Feature
