'use strict';
const express  = require('express');
const Database = require('better-sqlite3');
const path     = require('path');

// ─────────────────────────────────────────────
// SQLite — abre (ou cria) bar-caixa.db
// ─────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'bar-caixa.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Migrações de colunas novas (seguras se já existirem) ──
try { db.exec(`ALTER TABLE products ADD COLUMN rank           INTEGER NOT NULL DEFAULT 999`); } catch {}
try { db.exec(`ALTER TABLE products ADD COLUMN image          TEXT`);                          } catch {}
try { db.exec(`ALTER TABLE products ADD COLUMN cost_price     REAL NOT NULL DEFAULT 0`);       } catch {}
try { db.exec(`ALTER TABLE products ADD COLUMN active_almox_id TEXT`);                         } catch {}
try { db.exec(`ALTER TABLE stock_movements ADD COLUMN unit_cost       REAL NOT NULL DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE stock_movements ADD COLUMN fornecedor_id   TEXT`);                    } catch {}
try { db.exec(`ALTER TABLE stock_movements ADD COLUMN fornecedor_name TEXT`);                    } catch {}

// ── Criação de tabelas ──
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS products (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    price           REAL NOT NULL DEFAULT 0,
    cost_price      REAL NOT NULL DEFAULT 0,
    stock           INTEGER NOT NULL DEFAULT 0,
    initial_stock   INTEGER NOT NULL DEFAULT 0,
    sold_qty        INTEGER NOT NULL DEFAULT 0,
    category        TEXT NOT NULL DEFAULT 'outro',
    sku             TEXT NOT NULL DEFAULT '',
    rank            INTEGER NOT NULL DEFAULT 999,
    active_almox_id TEXT
  );

  CREATE TABLE IF NOT EXISTS almoxarifados (
    id   TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'outro',
    rank INTEGER NOT NULL DEFAULT 999
  );

  CREATE TABLE IF NOT EXISTS product_stocks (
    product_id      TEXT NOT NULL,
    almoxarifado_id TEXT NOT NULL,
    qty             INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (product_id, almoxarifado_id),
    FOREIGN KEY (product_id)      REFERENCES products(id)      ON DELETE CASCADE,
    FOREIGN KEY (almoxarifado_id) REFERENCES almoxarifados(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS stock_movements (
    id              TEXT PRIMARY KEY,
    ts              TEXT NOT NULL,
    type            TEXT NOT NULL,
    product_id      TEXT NOT NULL,
    product_name    TEXT NOT NULL,
    from_almox_id   TEXT,
    from_almox_name TEXT,
    to_almox_id     TEXT,
    to_almox_name   TEXT,
    qty             INTEGER NOT NULL,
    note            TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS token_sales (
    id     TEXT PRIMARY KEY,
    ts     TEXT NOT NULL,
    amount REAL NOT NULL,
    method TEXT NOT NULL,
    denoms TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS sales (
    id    TEXT PRIMARY KEY,
    ts    TEXT NOT NULL,
    total REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sale_items (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id  TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    pid      TEXT NOT NULL,
    name     TEXT NOT NULL,
    price    REAL NOT NULL,
    qty      INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS fornecedores (
    id      TEXT PRIMARY KEY,
    name    TEXT NOT NULL,
    contact TEXT NOT NULL DEFAULT '',
    note    TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS cash_register_sessions (
    id        TEXT PRIMARY KEY,
    opened_at TEXT NOT NULL,
    closed_at TEXT,
    summary   TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_token_sales_ts ON token_sales(ts);
  CREATE INDEX IF NOT EXISTS idx_sales_ts       ON sales(ts);
  CREATE INDEX IF NOT EXISTS idx_sale_items_sid ON sale_items(sale_id);
  CREATE INDEX IF NOT EXISTS idx_ps_product     ON product_stocks(product_id);
  CREATE INDEX IF NOT EXISTS idx_sm_ts          ON stock_movements(ts);
`);

// ── Migração inicial: move stock existente para almoxarifado "Geral" ──
{
  const hasAlmox = db.prepare('SELECT COUNT(*) as n FROM almoxarifados').get().n;
  if (!hasAlmox) {
    db.transaction(() => {
      const almoxId = 'almox-geral';
      db.prepare('INSERT OR IGNORE INTO almoxarifados (id, name, type, rank) VALUES (?, ?, ?, ?)').run(almoxId, 'Geral', 'outro', 1);
      const prods = db.prepare('SELECT id, stock FROM products WHERE stock > 0').all();
      const ins   = db.prepare('INSERT OR IGNORE INTO product_stocks (product_id, almoxarifado_id, qty) VALUES (?, ?, ?)');
      prods.forEach(p => ins.run(p.id, almoxId, p.stock));
      db.prepare("UPDATE products SET active_almox_id = ? WHERE active_almox_id IS NULL OR active_almox_id = ''").run(almoxId);
    })();
    console.log('✅ Migração: estoque existente movido para almoxarifado "Geral"');
  }
}

// ─────────────────────────────────────────────
// Statements preparados
// ─────────────────────────────────────────────
const stmts = {
  // settings
  upsertSetting : db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'),
  allSettings   : db.prepare('SELECT key, value FROM settings'),

  // products
  upsertProduct : db.prepare(`
    INSERT OR REPLACE INTO products
      (id, name, price, cost_price, stock, initial_stock, sold_qty, category, sku, rank, image, active_almox_id)
    VALUES
      (@id, @name, @price, @cost_price, @stock, @initial_stock, @sold_qty, @category, @sku, @rank, @image, @active_almox_id)
  `),
  allProductIds : db.prepare('SELECT id FROM products'),
  deleteProduct : db.prepare('DELETE FROM products WHERE id = ?'),
  allProducts   : db.prepare('SELECT * FROM products'),
  soldQtyByProd : db.prepare('SELECT pid, SUM(qty) AS total FROM sale_items GROUP BY pid'),

  // almoxarifados
  upsertAlmox   : db.prepare('INSERT OR REPLACE INTO almoxarifados (id, name, type, rank) VALUES (@id, @name, @type, @rank)'),
  allAlmoxIds   : db.prepare('SELECT id FROM almoxarifados'),
  deleteAlmox   : db.prepare('DELETE FROM almoxarifados WHERE id = ?'),
  allAlmox      : db.prepare('SELECT * FROM almoxarifados ORDER BY rank, name'),

  // fornecedores
  upsertFornec  : db.prepare('INSERT OR REPLACE INTO fornecedores (id, name, contact, note) VALUES (@id, @name, @contact, @note)'),
  allFornecIds  : db.prepare('SELECT id FROM fornecedores'),
  deleteFornec  : db.prepare('DELETE FROM fornecedores WHERE id = ?'),
  allFornec     : db.prepare('SELECT * FROM fornecedores ORDER BY name'),

  // product_stocks
  upsertPStock  : db.prepare('INSERT OR REPLACE INTO product_stocks (product_id, almoxarifado_id, qty) VALUES (@product_id, @almoxarifado_id, @qty)'),
  allPStockKeys : db.prepare('SELECT product_id, almoxarifado_id FROM product_stocks'),
  deletePStock  : db.prepare('DELETE FROM product_stocks WHERE product_id = ? AND almoxarifado_id = ?'),
  allPStocks    : db.prepare('SELECT product_id as productId, almoxarifado_id as almoxarifadoId, qty FROM product_stocks'),

  // stock_movements (agora mutável: suporta exclusão e edição de ts/note)
  upsertMovement: db.prepare(`
    INSERT OR REPLACE INTO stock_movements
      (id, ts, type, product_id, product_name, from_almox_id, from_almox_name, to_almox_id, to_almox_name, qty, unit_cost, note, fornecedor_id, fornecedor_name)
    VALUES
      (@id, @ts, @type, @product_id, @product_name, @from_almox_id, @from_almox_name, @to_almox_id, @to_almox_name, @qty, @unit_cost, @note, @fornecedor_id, @fornecedor_name)
  `),
  allMovementIds: db.prepare('SELECT id FROM stock_movements'),
  deleteMovement: db.prepare('DELETE FROM stock_movements WHERE id = ?'),
  allMovements  : db.prepare('SELECT * FROM stock_movements ORDER BY ts DESC LIMIT 1000'),

  // token_sales
  insertToken   : db.prepare('INSERT OR IGNORE INTO token_sales (id, ts, amount, method, denoms) VALUES (@id, @ts, @amount, @method, @denoms)'),
  allTokenIds   : db.prepare('SELECT id FROM token_sales'),
  deleteToken   : db.prepare('DELETE FROM token_sales WHERE id = ?'),
  allTokens     : db.prepare('SELECT * FROM token_sales'),

  // sales + items
  insertSale    : db.prepare('INSERT OR IGNORE INTO sales (id, ts, total) VALUES (@id, @ts, @total)'),
  allSaleIds    : db.prepare('SELECT id FROM sales'),
  deleteSale    : db.prepare('DELETE FROM sales WHERE id = ?'),
  allSales      : db.prepare('SELECT * FROM sales'),
  insertItem    : db.prepare('INSERT INTO sale_items (sale_id, pid, name, price, qty) VALUES (@sale_id, @pid, @name, @price, @qty)'),
  itemsBySale   : db.prepare('SELECT * FROM sale_items WHERE sale_id = ?'),

  // cash register
  upsertSession : db.prepare(`
    INSERT OR REPLACE INTO cash_register_sessions (id, opened_at, closed_at, summary)
    VALUES (@id, @opened_at, @closed_at, @summary)
  `),
  openSession   : db.prepare('SELECT * FROM cash_register_sessions WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1'),
  allSessions   : db.prepare('SELECT * FROM cash_register_sessions ORDER BY opened_at'),
};

// ─────────────────────────────────────────────
// Leitura do estado completo → JSON
// ─────────────────────────────────────────────
function readState() {
  const settings = {};
  stmts.allSettings.all().forEach(r => { settings[r.key] = r.value; });

  const categories = settings.categories_json ? JSON.parse(settings.categories_json) : [];

  const almoxarifados = stmts.allAlmox.all().map(a => ({
    id: a.id, name: a.name, type: a.type, rank: a.rank
  }));

  const fornecedores = stmts.allFornec.all().map(f => ({
    id: f.id, name: f.name, contact: f.contact || '', note: f.note || ''
  }));

  const productStocks = stmts.allPStocks.all(); // { productId, almoxarifadoId, qty }

  const stockMovements = stmts.allMovements.all().map(m => ({
    id: m.id, ts: m.ts, type: m.type,
    productId: m.product_id, productName: m.product_name,
    fromAlmoxId: m.from_almox_id   || null, fromAlmoxName: m.from_almox_name || null,
    toAlmoxId:   m.to_almox_id     || null, toAlmoxName:   m.to_almox_name   || null,
    qty: m.qty, unitCost: m.unit_cost ?? 0, note: m.note || '',
    fornecedorId: m.fornecedor_id || null, fornecedorName: m.fornecedor_name || null
  }));

  // soldQty é derivado de sale_items (fonte de verdade) em vez de ler o campo
  // denormalizado products.sold_qty — evita divergência quando sale_items é
  // editado diretamente no banco (correções manuais de venda).
  const soldQtyMap = {};
  stmts.soldQtyByProd.all().forEach(r => { soldQtyMap[r.pid] = r.total; });

  const products = stmts.allProducts.all().map(p => ({
    id: p.id, name: p.name, price: p.price, costPrice: p.cost_price ?? 0,
    stock: p.stock, initialStock: p.initial_stock,
    soldQty: soldQtyMap[p.id] ?? 0,
    category: p.category, sku: p.sku, rank: p.rank ?? 999, image: p.image || null,
    activeAlmoxId: p.active_almox_id || null
  }));

  const tokenSales = stmts.allTokens.all().map(t => ({
    id: t.id, ts: t.ts, amount: t.amount, method: t.method,
    denoms: JSON.parse(t.denoms)
  }));

  const salesRaw = stmts.allSales.all();
  const sales = salesRaw.map(s => ({
    id: s.id, ts: s.ts, total: s.total,
    items: stmts.itemsBySale.all(s.id).map(i => ({
      pid: i.pid, name: i.name, price: i.price, qty: i.qty
    }))
  }));

  const sessions = stmts.allSessions.all();
  const open     = sessions.find(s => !s.closed_at);

  return {
    categories,
    fornecedores,
    settings: {
      storeName: settings.storeName || 'Bar Tradição',
      pixKey:    settings.pixKey    || '',
      pixName:   settings.pixName   || 'Bar Tradicao',
      pixCity:   settings.pixCity   || 'SAO PAULO'
    },
    almoxarifados,
    productStocks,
    stockMovements,
    products,
    tokenSales,
    sales,
    cashRegister: {
      openedAt: open ? open.opened_at : new Date().toISOString(),
      accumulatedProfit: parseFloat(settings.accumulated_profit || '0'),
      history: sessions
        .filter(s => s.closed_at)
        .map(s => ({ id: s.id, openedAt: s.opened_at, closedAt: s.closed_at,
                     summary: JSON.parse(s.summary || '{}') }))
    }
  };
}

// ─────────────────────────────────────────────
// Gravação do estado JSON → SQLite (transação)
// ─────────────────────────────────────────────
const persistState = db.transaction((state) => {
  // ── settings ──
  Object.entries(state.settings || {}).forEach(([k, v]) => stmts.upsertSetting.run(k, String(v)));
  if (state.categories && state.categories.length) {
    stmts.upsertSetting.run('categories_json', JSON.stringify(state.categories));
  }

  // ── fornecedores ──
  const existFornec = new Set(stmts.allFornecIds.all().map(r => r.id));
  const incomFornec = new Set((state.fornecedores || []).map(f => f.id));
  existFornec.forEach(id => { if (!incomFornec.has(id)) stmts.deleteFornec.run(id); });
  (state.fornecedores || []).forEach(f =>
    stmts.upsertFornec.run({ id: f.id, name: f.name, contact: f.contact || '', note: f.note || '' })
  );

  // ── almoxarifados ──
  const existAlmox = new Set(stmts.allAlmoxIds.all().map(r => r.id));
  const incomAlmox = new Set((state.almoxarifados || []).map(a => a.id));
  existAlmox.forEach(id => { if (!incomAlmox.has(id)) stmts.deleteAlmox.run(id); });
  (state.almoxarifados || []).forEach(a =>
    stmts.upsertAlmox.run({ id: a.id, name: a.name, type: a.type || 'outro', rank: a.rank ?? 999 })
  );

  // ── products ──
  const existProds = new Set(stmts.allProductIds.all().map(r => r.id));
  const incomProds = new Set((state.products || []).map(p => p.id));
  existProds.forEach(id => { if (!incomProds.has(id)) stmts.deleteProduct.run(id); });
  (state.products || []).forEach(p =>
    stmts.upsertProduct.run({
      id: p.id, name: p.name, price: p.price, cost_price: p.costPrice ?? 0,
      stock: p.stock ?? 0,
      initial_stock: p.initialStock ?? p.stock ?? 0,
      sold_qty: p.soldQty ?? 0,
      category: p.category || 'outro',
      sku: p.sku || '',
      rank: p.rank ?? 999,
      image: p.image || null,
      active_almox_id: p.activeAlmoxId || null
    })
  );

  // ── product_stocks: sincronização total ──
  const existPsKeys = new Set(stmts.allPStockKeys.all().map(r => `${r.product_id}|${r.almoxarifado_id}`));
  const incomPsKeys = new Set((state.productStocks || []).map(ps => `${ps.productId}|${ps.almoxarifadoId}`));
  existPsKeys.forEach(key => {
    if (!incomPsKeys.has(key)) {
      const [pid, aid] = key.split('|');
      stmts.deletePStock.run(pid, aid);
    }
  });
  (state.productStocks || []).forEach(ps =>
    stmts.upsertPStock.run({ product_id: ps.productId, almoxarifado_id: ps.almoxarifadoId, qty: ps.qty })
  );

  // ── stock_movements: sincronização total (suporta exclusão e edição) ──
  const existMovIds = new Set(stmts.allMovementIds.all().map(r => r.id));
  const incomMovIds = new Set((state.stockMovements || []).map(m => m.id));
  existMovIds.forEach(id => { if (!incomMovIds.has(id)) stmts.deleteMovement.run(id); });
  (state.stockMovements || []).forEach(m =>
    stmts.upsertMovement.run({
      id: m.id, ts: m.ts, type: m.type,
      product_id: m.productId, product_name: m.productName,
      from_almox_id:   m.fromAlmoxId   || null, from_almox_name: m.fromAlmoxName || null,
      to_almox_id:     m.toAlmoxId     || null, to_almox_name:   m.toAlmoxName   || null,
      qty: m.qty, unit_cost: m.unitCost ?? 0, note: m.note || '',
      fornecedor_id: m.fornecedorId || null, fornecedor_name: m.fornecedorName || null
    })
  );

  // ── token_sales ──
  const existTokens = new Set(stmts.allTokenIds.all().map(r => r.id));
  const incomTokens = new Set((state.tokenSales || []).map(t => t.id));
  existTokens.forEach(id => { if (!incomTokens.has(id)) stmts.deleteToken.run(id); });
  (state.tokenSales || []).forEach(t =>
    stmts.insertToken.run({ id: t.id, ts: t.ts, amount: t.amount, method: t.method, denoms: JSON.stringify(t.denoms || {}) })
  );

  // ── sales + sale_items ──
  const existSales = new Set(stmts.allSaleIds.all().map(r => r.id));
  const incomSales = new Set((state.sales || []).map(s => s.id));
  existSales.forEach(id => { if (!incomSales.has(id)) stmts.deleteSale.run(id); });
  (state.sales || []).forEach(s => {
    const inserted = stmts.insertSale.run({ id: s.id, ts: s.ts, total: s.total });
    if (inserted.changes > 0) {
      (s.items || []).forEach(i =>
        stmts.insertItem.run({ sale_id: s.id, pid: i.pid, name: i.name, price: i.price, qty: i.qty })
      );
    }
  });

  // ── cash register ──
  if (state.cashRegister) {
    if (state.cashRegister.accumulatedProfit !== undefined) {
      stmts.upsertSetting.run('accumulated_profit', String(state.cashRegister.accumulatedProfit));
    }
    const open = stmts.openSession.get();
    if (!open) {
      stmts.upsertSession.run({
        id: 'sess-' + Date.now(),
        opened_at: state.cashRegister.openedAt,
        closed_at: null,
        summary: null
      });
    }
    (state.cashRegister.history || []).forEach(h =>
      stmts.upsertSession.run({
        id: h.id,
        opened_at: h.openedAt,
        closed_at: h.closedAt,
        summary: JSON.stringify(h.summary || {})
      })
    );
  }
});

// ─────────────────────────────────────────────
// Express
// ─────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

app.get('/api/state', (_req, res) => {
  try { res.json(readState()); }
  catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post('/api/state', (req, res) => {
  try {
    persistState(req.body);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/report', (_req, res) => {
  try {
    const totalTokens = db.prepare(`SELECT COALESCE(SUM(amount),0) as v, method FROM token_sales GROUP BY method`).all();
    const totalSales  = db.prepare(`SELECT COALESCE(SUM(total),0) as v FROM sales`).get();
    const topProducts = db.prepare(`
      SELECT name, SUM(qty) as qty, SUM(price*qty) as total
      FROM sale_items GROUP BY name ORDER BY total DESC LIMIT 20
    `).all();
    const estoque = db.prepare(`
      SELECT p.name, p.sold_qty,
        COALESCE(SUM(ps.qty), 0) as total_stock,
        a.name as almox_name, a.type as almox_type
      FROM products p
      LEFT JOIN product_stocks ps ON ps.product_id = p.id
      LEFT JOIN almoxarifados a   ON a.id = ps.almoxarifado_id
      GROUP BY p.id, a.id
      ORDER BY p.name, a.name
    `).all();
    res.json({ totalTokens, totalSales, topProducts, estoque });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ Bar Caixa rodando em http://localhost:${PORT}`);
  console.log(`   Banco de dados: ${path.join(__dirname, 'bar-caixa.db')}\n`);
});
