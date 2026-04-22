# soldQty Derivado de sale_items no GET /api/state

## Objetivo

Tornar o campo `soldQty` de cada produto **derivado automaticamente** da soma de `sale_items.qty`, eliminando a divergência que ocorria quando registros de venda eram editados diretamente no SQLite (correções manuais, estornos).

## Motivação

Antes desta alteração, `products.sold_qty` era um campo denormalizado, incrementado apenas durante o checkout no frontend (`app.js:871`) e persistido como qualquer outra coluna. Edições manuais em `sale_items` para corrigir quantidades vendidas (ex.: correção pós-evento quando o sistema registrava vendas maiores do que a realidade física) não refletiam em `sold_qty`, fazendo a aba **Estoque** exibir `Vendido` e `Saldo` inconsistentes com as vendas efetivas.

## Alterações Realizadas

### server.js

- **Novo prepared statement** `soldQtyByProd` que agrega `SUM(qty)` de `sale_items` agrupado por `pid`.
- **`readState()`**: monta um `soldQtyMap` a partir do agregado e usa esse mapa ao serializar cada produto; o campo `p.sold_qty` da tabela `products` é ignorado na resposta.
- Comportamento de escrita preservado: o `POST /api/state` continua persistindo `sold_qty` normalmente (para compatibilidade com o fluxo de checkout em memória), mas na próxima leitura o valor é recomputado.

## Verificação Técnica

- [x] `node --check server.js` — sem erros de sintaxe
- [x] Query de agregação retorna soma correta por produto
- [x] Fluxo de checkout continua funcionando: frontend incrementa `soldQty` em memória, POSTa o estado, backend persiste; próximo GET recalcula a partir dos novos `sale_items` (resultado idêntico ao incrementado)
- [x] Fluxo de `Reports.close()` não é afetado: ao fechar o caixa o frontend zera `soldQty` e limpa `sales` — no backend as `sale_items` são deletadas em cascata e o próximo GET retorna `soldQty = 0`
- [x] Correções manuais em `sale_items` via SQLite passam a refletir automaticamente no `Vendido` e `Saldo` da aba Estoque, sem necessidade de ressincronizar `products.sold_qty` manualmente

## Metadata

- **Data:** 22/04/2026 14:55:06
- **Status:** Concluído
- **Tipo:** Refactor
