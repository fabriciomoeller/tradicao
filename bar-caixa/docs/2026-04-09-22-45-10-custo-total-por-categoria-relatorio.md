# Custo Total por Categoria no Relatório de Exportação

## Objetivo

Incluir o total de custo na linha de subtotal de cada categoria no item 3 ("Vendas por Categoria e Produto") do relatório exportado em Markdown pela aba Caixa.

## Alterações Realizadas

**`app.js`** — função de geração do relatório Markdown:

- Adicionada variável `catCost` calculando a soma dos custos dos itens da categoria (`items.reduce((s,i)=>s+i.cost, 0)`).
- A linha de total da categoria passou a incluir `catCost` na coluna **Custo**, que antes ficava vazia.

Antes:
```
| **Total ${cat}** | | **${fmtMD(catTotal)}** | | **${fmtMD(catProfit)}** | ... |
```

Depois:
```
| **Total ${cat}** | | **${fmtMD(catTotal)}** | **${fmtMD(catCost)}** | **${fmtMD(catProfit)}** | ... |
```

## Verificação Técnica

- [x] Linha de total da categoria exibe custo total preenchido
- [x] Custo por linha de produto permanece inalterado
- [x] Lucro e margem do total continuam corretos
- [x] Relatório exportado via aba Caixa reflete a alteração

## Metadata

- **Data:** 09/04/2026 22:45:10
- **Status:** Concluído
- **Tipo:** Melhoria
