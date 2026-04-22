# Auditoria de Correções Manuais Pós-Evento (Abril/2026)

## Objetivo

Registrar o lastro das correções manuais aplicadas diretamente no banco `bar-caixa.db` em 22/04/2026, decorrentes de divergências identificadas após o evento realizado entre 03 e 07/04/2026. Estas correções não puderam ser feitas pela UI do PDV (não há tela de estorno de fichas nem tela de correção retroativa de venda), e são documentadas aqui para fins de rastreabilidade e auditoria.

## Contexto

O sistema registrou no período algumas divergências em relação à realidade física e à nota do fornecedor OMAMUTE:

- Duas vendas de fichas feitas em 21/04/2026 precisaram ser estornadas.
- Quatro produtos com venda super-contada no PDV (sistema registrava mais unidades vendidas do que o real) e estoque físico sobrando que não estava refletido no banco.

## Alterações Realizadas

### 1. Estorno de fichas (token_sales) de 21/04/2026

Duas vendas de fichas registradas fora do evento foram removidas:

| ID | Data/hora local | Método | Valor |
|---|---|---|---|
| `mo9dnpxn8c68` | 21/04 22:32:03 | Dinheiro | R$ 40,00 |
| `mo9dofiz7jy6` | 21/04 22:32:36 | PIX | R$ 30,00 |

**SQL executado:**

```sql
DELETE FROM token_sales WHERE id IN ('mo9dnpxn8c68','mo9dofiz7jy6');
```

**Impacto:** `Total Fichas Vendidas` caiu de R$ 3.143,00 para **R$ 3.073,00**.

### 2. Correção de vendas super-contadas

Após conferência do estoque físico remanescente contra a nota do fornecedor OMAMUTE, identificou-se que o PDV registrou mais vendas do que o real. A fórmula usada para chegar nas vendas corretas foi:

```
vendas_reais = (entrada − devolução_ao_fornecedor) − estoque_físico_remanescente
```

| Produto | Antes (`qty`) | Depois (`qty`) | Antes (`total`) | Depois (`total`) | Sale ID |
|---|---:|---:|---:|---:|---|
| CERVEJA CORONA EXTRA 330 ML LONG NECK | 96 | 74 | R$ 960 | R$ 740 | `mnmi2zqe9w8l` |
| CERVEJA HEINEKEN LONG 330 ML (1ª venda) | 48 | 32 | R$ 480 | R$ 320 | `mnmi53lotf8u` |
| CERVEJA HEINEKEN LONG 330 ML (2ª venda) | 24 | 24 (sem alteração) | R$ 240 | R$ 240 | `moaan3h0egf7` |
| REFRIGERANTE COCA COLA LATA TRAD | 60 | 46 | R$ 420 | R$ 322 | `mnmi17vvafpm` |
| REFRIGERANTE GUARANA ANTARCTICA LATA | 24 | 4 | R$ 168 | R$ 28 | `mnmiprry89pj` |

Para o Heineken a redução foi aplicada somente na primeira venda (bulk de 06/04 sem movimento de estoque correspondente), preservando a segunda venda de 22/04 que já tinha movimento `venda` consistente em `stock_movements`. As vendas de Guaraná Zero e Coca Cola Zero permaneceram inalteradas (estavam corretas).

**SQL executado:**

```sql
UPDATE sale_items SET qty = 74 WHERE sale_id = 'mnmi2zqe9w8l' AND pid = 'mnkrh1bxtzs9';
UPDATE sales      SET total = 740.0 WHERE id = 'mnmi2zqe9w8l';

UPDATE sale_items SET qty = 32 WHERE sale_id = 'mnmi53lotf8u' AND pid = 'mnkrh1by5wiy';
UPDATE sales      SET total = 320.0 WHERE id = 'mnmi53lotf8u';

UPDATE sale_items SET qty = 46 WHERE sale_id = 'mnmi17vvafpm' AND pid = 'mnkrh1byfhsk';
UPDATE sales      SET total = 322.0 WHERE id = 'mnmi17vvafpm';

UPDATE sale_items SET qty = 4  WHERE sale_id = 'mnmiprry89pj' AND pid = 'mnkrh1bygksm';
UPDATE sales      SET total = 28.0  WHERE id = 'mnmiprry89pj';
```

**Impacto na receita agregada:** queda de R$ 618,00 nas vendas totais.

### 3. Ajuste do estoque físico

Os estoques em `product_stocks` foram alinhados com o estoque físico real, e cada ajuste gerou uma movimentação do tipo `ajuste` em `stock_movements` com nota explicativa para preservar o histórico auditável.

| Produto | Almoxarifado | Antes | Depois | Δ | Nota |
|---|---|---:|---:|---:|---|
| CORONA EXTRA | Caixa térmica 02 | 0 | 22 | +22 | 22 un não vendidas retornam ao estoque |
| HEINEKEN | Caixa térmica 02 | 0 | 16 | +16 | 16 un não vendidas retornam ao estoque |
| GUARANÁ TRADICIONAL | Caixa térmica 01 | 0 | 8 | +8 | 8 un não vendidas retornam ao estoque |
| GUARANÁ ZERO | Caixa térmica 01 | 24 | 0 | −24 | Estoque físico zerado (24 un foram de fato vendidas) |
| COCA TRADICIONAL | Caixa térmica 01 | 0 | 14 | +14 | 14 un não vendidas retornam ao estoque |

**SQL executado (padrão para cada produto):**

```sql
UPDATE product_stocks SET qty = <novo> WHERE product_id = <pid> AND almoxarifado_id = <almoxId>;
UPDATE products SET stock = <novo> WHERE id = <pid>;
INSERT INTO stock_movements (id, ts, type, product_id, product_name, from_almox_id, from_almox_name, to_almox_id, to_almox_name, qty, note, unit_cost, fornecedor_id, fornecedor_name)
VALUES (<id>, <ts>, 'ajuste', <pid>, <nome>, <from>, <from_name>, <to>, <to_name>, <qty_abs>, <nota>, 0, NULL, NULL);
```

Identificadores dos ajustes registrados: `adj-corona-*`, `adj-heineken-*`, `adj-guaratrad-*`, `adj-guarazero-*`, `adj-cocatrad-*` (timestamp 2026-04-22T17:29:59.368Z).

### 4. Ressincronização de `sold_qty`

Após as edições em `sale_items`, o campo denormalizado `products.sold_qty` ficou desatualizado, o que fazia a aba **Estoque** exibir `Vendido` e `Saldo` divergentes. A ressincronização foi feita recomputando a partir de `sale_items`:

```sql
UPDATE products
SET sold_qty = COALESCE((SELECT SUM(qty) FROM sale_items WHERE pid = products.id), 0);
```

Para que esta divergência não volte a ocorrer em futuras edições manuais de `sale_items`, foi aplicado um refactor no `server.js` documentado separadamente:

- Ver: [`2026-04-22-14-55-06-soldqty-derivado-de-sale-items.md`](2026-04-22-14-55-06-soldqty-derivado-de-sale-items.md) (commit `0ae1eca`).

## Cuidados Operacionais Identificados

Durante a execução percebeu-se o seguinte risco: o frontend mantém o estado completo em memória e dispara `navigator.sendBeacon('/api/state', …)` no evento `beforeunload` (`app.js:3170`). Quando o servidor estava rodando com alguma aba do PDV aberta que tivesse o estado antigo em cache, fechar/recarregar essa aba sobrescrevia as correções já aplicadas no SQLite.

**Procedimento seguro para edições manuais futuras:**

1. Fechar todas as abas do PDV no navegador
2. Parar o servidor (Ctrl+C no terminal do `npm start`)
3. Criar backup do banco: `cp bar-caixa.db bar-caixa.db.bak-$(date +%Y%m%d-%H%M%S)`
4. Aplicar as correções via SQLite em transação única (`BEGIN; …; COMMIT;`)
5. Subir o servidor (`npm start`)
6. Abrir uma nova janela do navegador (evitando reaproveitar aba que tenha ficado aberta)

## Verificação Técnica

- [x] Totais pós-correção: Vendas = R$ 5.260,00 · Fichas = R$ 3.073,00
- [x] Aba Caixa exibe corretamente: Cerveja R$ 1.300, Refrigerante R$ 770
- [x] Aba Estoque exibe corretamente: Corona 22, Heineken 16, Coca Trad 14, Guaraná Trad 8, Guaraná Zero 0
- [x] Nota do fornecedor OMAMUTE (R$ 1.906,80 + R$ 200 de caixas térmicas) confere com a coluna "a pagar" no bloco Pagamentos a Fornecedores
- [x] Backup do banco preservado: `bar-caixa.db.bak-20260422-142548` (pré-correções), útil como referência para rollback se necessário
- [x] 5 movimentações do tipo `ajuste` gravadas em `stock_movements` com nota explicativa

## Metadata

- **Data:** 22/04/2026 15:07:26
- **Status:** Concluído
- **Tipo:** Correção de Dados (Auditoria)
