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

// Migrações: adiciona colunas novas sem quebrar banco existente
try { db.exec(`ALTER TABLE products ADD COLUMN rank       INTEGER NOT NULL DEFAULT 999`); } catch {}
try { db.exec(`ALTER TABLE products ADD COLUMN image      TEXT`);                          } catch {}
try { db.exec(`ALTER TABLE products ADD COLUMN cost_price REAL NOT NULL DEFAULT 0`);       } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS products (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    price         REAL NOT NULL DEFAULT 0,
    cost_price    REAL NOT NULL DEFAULT 0,
    stock         INTEGER NOT NULL DEFAULT 0,
    initial_stock INTEGER NOT NULL DEFAULT 0,
    sold_qty      INTEGER NOT NULL DEFAULT 0,
    category      TEXT NOT NULL DEFAULT 'outro',
    sku           TEXT NOT NULL DEFAULT '',
    rank          INTEGER NOT NULL DEFAULT 999
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

  CREATE TABLE IF NOT EXISTS cash_register_sessions (
    id         TEXT PRIMARY KEY,
    opened_at  TEXT NOT NULL,
    closed_at  TEXT,
    summary    TEXT
  );

  -- índices úteis para relatórios
  CREATE INDEX IF NOT EXISTS idx_token_sales_ts ON token_sales(ts);
  CREATE INDEX IF NOT EXISTS idx_sales_ts       ON sales(ts);
  CREATE INDEX IF NOT EXISTS idx_sale_items_sid ON sale_items(sale_id);
`);

// ─────────────────────────────────────────────
// Statements preparados (reutilizados)
// ─────────────────────────────────────────────
const stmts = {
  // settings
  upsertSetting : db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'),
  allSettings   : db.prepare('SELECT key, value FROM settings'),

  // products
  upsertProduct : db.prepare(`
    INSERT OR REPLACE INTO products (id, name, price, cost_price, stock, initial_stock, sold_qty, category, sku, rank, image)
    VALUES (@id, @name, @price, @cost_price, @stock, @initial_stock, @sold_qty, @category, @sku, @rank, @image)
  `),
  allProductIds : db.prepare('SELECT id FROM products'),
  deleteProduct : db.prepare('DELETE FROM products WHERE id = ?'),
  allProducts   : db.prepare('SELECT * FROM products'),

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
  countItems    : db.prepare('SELECT COUNT(*) as n FROM sale_items WHERE sale_id = ?'),

  // cash register
  upsertSession : db.prepare(`
    INSERT OR REPLACE INTO cash_register_sessions (id, opened_at, closed_at, summary)
    VALUES (@id, @opened_at, @closed_at, @summary)
  `),
  openSession   : db.prepare('SELECT * FROM cash_register_sessions WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1'),
  allSessions   : db.prepare('SELECT * FROM cash_register_sessions ORDER BY opened_at'),
};

// ─────────────────────────────────────────────
// Leitura do estado completo do SQLite → JSON
// ─────────────────────────────────────────────
function readState() {
  const settings = {};
  stmts.allSettings.all().forEach(r => { settings[r.key] = r.value; });

  const categories = settings.categories_json ? JSON.parse(settings.categories_json) : [];

  const products = stmts.allProducts.all().map(p => ({
    id: p.id, name: p.name, price: p.price, costPrice: p.cost_price ?? 0, stock: p.stock,
    initialStock: p.initial_stock, soldQty: p.sold_qty,
    category: p.category, sku: p.sku, rank: p.rank ?? 999, image: p.image || null
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
  const open = sessions.find(s => !s.closed_at);

  return {
    categories,
    settings: {
      storeName: settings.storeName || 'Bar Tradição',
      pixKey:    settings.pixKey    || '',
      pixName:   settings.pixName   || 'Bar Tradicao',
      pixCity:   settings.pixCity   || 'SAO PAULO'
    },
    products,
    tokenSales,
    sales,
    cashRegister: {
      openedAt: open ? open.opened_at : new Date().toISOString(),
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

  // ── products (upsert + remoção dos excluídos) ──
  const existProds = new Set(stmts.allProductIds.all().map(r => r.id));
  const incomProds = new Set((state.products || []).map(p => p.id));
  existProds.forEach(id => { if (!incomProds.has(id)) stmts.deleteProduct.run(id); });
  (state.products || []).forEach(p =>
    stmts.upsertProduct.run({
      id: p.id, name: p.name, price: p.price, cost_price: p.costPrice ?? 0, stock: p.stock,
      initial_stock: p.initialStock ?? p.stock,
      sold_qty: p.soldQty ?? 0,
      category: p.category || 'outro',
      sku: p.sku || '',
      rank: p.rank ?? 999,
      image: p.image || null
    })
  );

  // ── token_sales (insert novos + remove os que sumiram do estado — ex: fechamento) ──
  const existTokens = new Set(stmts.allTokenIds.all().map(r => r.id));
  const incomTokens = new Set((state.tokenSales || []).map(t => t.id));
  existTokens.forEach(id => { if (!incomTokens.has(id)) stmts.deleteToken.run(id); });
  (state.tokenSales || []).forEach(t =>
    stmts.insertToken.run({ id: t.id, ts: t.ts, amount: t.amount, method: t.method, denoms: JSON.stringify(t.denoms || {}) })
  );

  // ── sales + sale_items (insert novos + remove os que sumiram) ──
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
    // sessão aberta
    const open = stmts.openSession.get();
    if (!open) {
      stmts.upsertSession.run({
        id: 'sess-' + Date.now(),
        opened_at: state.cashRegister.openedAt,
        closed_at: null,
        summary: null
      });
    }
    // histórico (fechamentos anteriores)
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

// Arquivos estáticos (index.html, app.js, styles.css)
app.use(express.static(__dirname));

// GET /api/state — frontend lê estado do banco
app.get('/api/state', (_req, res) => {
  try { res.json(readState()); }
  catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// POST /api/state — frontend envia estado para persistir
app.post('/api/state', (req, res) => {
  try {
    persistState(req.body);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Relatório rápido via SQL (bônus — útil para debug)
app.get('/api/report', (_req, res) => {
  try {
    const totalTokens = db.prepare(`SELECT COALESCE(SUM(amount),0) as v, method FROM token_sales GROUP BY method`).all();
    const totalSales  = db.prepare(`SELECT COALESCE(SUM(total),0) as v FROM sales`).get();
    const topProducts = db.prepare(`
      SELECT name, SUM(qty) as qty, SUM(price*qty) as total
      FROM sale_items GROUP BY name ORDER BY total DESC LIMIT 20
    `).all();
    const estoque = db.prepare(`SELECT name, stock, initial_stock, sold_qty FROM products ORDER BY name`).all();
    res.json({ totalTokens, totalSales, topProducts, estoque });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ Bar Caixa rodando em http://localhost:${PORT}`);
  console.log(`   Banco de dados: ${path.join(__dirname, 'bar-caixa.db')}\n`);
});
