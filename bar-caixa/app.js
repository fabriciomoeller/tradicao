'use strict';

// ─────────────────────────────────────────────
// DATABASE  (LocalStorage  +  SQLite via API)
// ─────────────────────────────────────────────
const DB = {
  KEY: 'bar-caixa-v1',
  _syncTimer: null,
  serverOk: false,     // true quando o servidor responde

  get() {
    try {
      const raw = localStorage.getItem(this.KEY);
      return raw ? JSON.parse(raw) : this._default();
    } catch { return this._default(); }
  },

  _default() {
    return {
      settings: {
        storeName: 'Bar Tradição',
        pixKey: '',
        pixName: 'Bar Tradicao',
        pixCity: 'SAO PAULO',
        pixDesc: 'BARCAIXA'
      },
      categories: [],
      products: [],
      tokenSales: [],   // { id, ts, amount, method, denoms:{1:n,2:n,...} }
      sales: [],        // { id, ts, items:[{pid,name,price,qty}], total }
      cashRegister: { openedAt: new Date().toISOString(), history: [] }
    };
  },

  // Carrega estado do servidor (chamado na inicialização)
  async loadFromServer() {
    try {
      const res = await fetch('/api/state', { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return false;
      const data = await res.json();
      localStorage.setItem(this.KEY, JSON.stringify(data));
      this.serverOk = true;
      return true;
    } catch {
      return false;  // servidor indisponível — usa localStorage
    }
  },

  update(fn) {
    const d = this.get();
    fn(d);
    localStorage.setItem(this.KEY, JSON.stringify(d));
    this._scheduleSync();
    return d;
  },

  // Debounce para não sobrecarregar com saves simultâneos
  _scheduleSync() {
    clearTimeout(this._syncTimer);
    this._syncTimer = setTimeout(() => this._sync(), 250);
  },

  async _sync() {
    try {
      const res = await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.get()),
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok && !this.serverOk) {
        this.serverOk = true;
        UI.toast('Conectado ao servidor SQLite', 'success');
      }
    } catch {
      if (this.serverOk) {
        this.serverOk = false;
        UI.toast('Servidor offline — salvando localmente', 'warning');
      }
    }
  },

  // Garante envio imediato ao fechar/recarregar a página (evita perda por debounce)
  flushSync() {
    clearTimeout(this._syncTimer);
    const blob = new Blob([JSON.stringify(this.get())], { type: 'application/json' });
    navigator.sendBeacon('/api/state', blob);
  }
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const fmt = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const norm = s => s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

// ─────────────────────────────────────────────
// CATEGORIAS
// ─────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  { id: 'cat-cerveja',      name: 'Cerveja',      color: '#C8860A', icon: '🍺' },
  { id: 'cat-vinho',        name: 'Vinho',        color: '#8B3146', icon: '🍷' },
  { id: 'cat-refrigerante', name: 'Refrigerante', color: '#7B3FA0', icon: '🥤' },
  { id: 'cat-agua',         name: 'Água',         color: '#0288D1', icon: '💧' },
  { id: 'cat-porcao',       name: 'Porção',       color: '#D97706', icon: '🍽' },
  { id: 'cat-petisco',      name: 'Petisco',      color: '#A0522D', icon: '🥜' },
  { id: 'cat-outro',        name: 'Outro',        color: '#4f46e5', icon: '📦' },
];

const Categories = {
  all() {
    const d = DB.get();
    return (d.categories && d.categories.length) ? d.categories : DEFAULT_CATEGORIES;
  },

  byId(id) { return this.all().find(c => c.id === id) || null; },

  byName(name) {
    if (!name) return null;
    const key = name.toLowerCase().trim();
    return this.all().find(c => c.name.toLowerCase().trim() === key) || null;
  },

  save(cat) {
    DB.update(d => {
      if (!d.categories || !d.categories.length) d.categories = DEFAULT_CATEGORIES.map(c => ({ ...c }));
      const idx = d.categories.findIndex(c => c.id === cat.id);
      if (idx >= 0) d.categories[idx] = cat;
      else d.categories.push(cat);
    });
    UI.renderProductList();
    UI.renderPDVGrid();
  },

  delete(id) {
    const cat = this.byId(id);
    if (!cat) return;
    if (!confirm(`Excluir a categoria "${cat.name}"?\nProdutos nessa categoria passarão para "Outro".`)) return;
    DB.update(d => {
      if (!d.categories || !d.categories.length) d.categories = DEFAULT_CATEGORIES.map(c => ({ ...c }));
      d.categories = d.categories.filter(c => c.id !== id);
      const outro = d.categories.find(c => c.name.toLowerCase() === 'outro');
      d.products.forEach(p => {
        const still = d.categories.find(c => c.name.toLowerCase().trim() === (p.category || '').toLowerCase().trim());
        if (!still) p.category = outro ? outro.name : 'Outro';
      });
    });
    UI.renderProductList();
    UI.renderPDVGrid();
    UI.showCategoryList();
  }
};

// Emoji por produto (usa ícone da categoria se disponível)
function productIcon(p) {
  const n = (p.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (n.includes('guarana')) return '🥤';
  if (n.includes('coca'))    return '🥤';
  const cat = Categories.byName(p.category);
  return cat ? cat.icon : '📦';
}

// Comprime e recorta imagem para quadrado de `size`px → base64 JPEG
function compressImage(file, size = 140) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const s = Math.min(img.width, img.height);
        const ox = (img.width  - s) / 2;
        const oy = (img.height - s) / 2;
        ctx.drawImage(img, ox, oy, s, s, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Retorna a cor do produto: nome tem prioridade sobre a categoria
function productColor(p) {
  const n = (p.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (n.includes('coca') && n.includes('zero')) return '#8B0000';
  if (n.includes('coca'))                        return '#E31A1A';
  if (n.includes('guarana') && n.includes('zero')) return '#1B4D2E';
  if (n.includes('guarana'))                     return '#2E8B3A';
  if (n.includes('heineken'))                    return '#1A4A22';

  const cat = Categories.byName(p.category);
  return cat ? cat.color : '#4f46e5';
}

// ─────────────────────────────────────────────
// PIX  (EMV / BR.GOV.BCB.PIX)
// ─────────────────────────────────────────────
const Pix = {
  _emv(id, value) {
    return `${id}${String(value.length).padStart(2, '0')}${value}`;
  },

  _crc16(str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
        crc &= 0xFFFF;
      }
    }
    return crc;
  },

  payload(amount) {
    const { pixKey, pixName, pixCity, pixDesc } = DB.get().settings;
    if (!pixKey) return null;

    const e = this._emv.bind(this);

    // Normaliza chave PIX: BCB exige CPF/CNPJ sem formatação, e-mail em minúsculo
    let key = pixKey.trim();
    const digits = key.replace(/[\.\-\/\(\)\s]/g, '');
    if (/^\d{11}$/.test(digits))      key = digits;              // CPF: 11 dígitos puros
    else if (/^\d{14}$/.test(digits)) key = digits;              // CNPJ: 14 dígitos puros
    else if (key.includes('@'))        key = key.toLowerCase();  // E-mail: lowercase
    // Telefone (+5511...) e EVP (UUID com hífens): mantém como está

    const mAcct    = e('00', 'BR.GOV.BCB.PIX') + e('01', key);
    const txid     = norm(pixDesc || 'BARCAIXA').replace(/[^A-Z0-9]/g, '').slice(0, 25) || '***';
    const addData  = e('05', txid);
    const name     = norm(pixName || 'Estabelecimento').replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 25) || 'Estabelecimento';
    const city     = norm(pixCity || 'CIDADE').replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 15) || 'CIDADE';

    let p =
      e('00', '01') +
      e('26', mAcct) +
      e('52', '0000') +
      e('53', '986') +
      e('54', amount.toFixed(2)) +
      e('58', 'BR') +
      e('59', name) +
      e('60', city) +
      e('62', addData) +
      '6304';

    return p + this._crc16(p).toString(16).toUpperCase().padStart(4, '0');
  },

  renderQR(amount, containerId) {
    const el = document.getElementById(containerId);
    el.innerHTML = '';
    const code = this.payload(amount);
    if (!code) {
      el.innerHTML = '<p style="color:var(--danger)">⚠ Configure a chave PIX nas configurações.</p>';
      return null;
    }
    try {
      const qr = qrcode(0, 'M');
      qr.addData(code, 'Byte');   // Byte mode obrigatório: cobre email (@), UUID (-), telefone (+)
      qr.make();
      el.innerHTML = qr.createImgTag(4, 0);
      const img = el.querySelector('img');
      if (img) img.style.cssText = 'display:block;margin:0 auto;max-width:210px;max-height:210px';
    } catch {
      el.innerHTML = `<p style="font-family:monospace;font-size:0.72rem;word-break:break-all;color:var(--muted)">${code}</p>`;
    }
    return code;
  }
};

// ─────────────────────────────────────────────
// TOKENS  (Venda de Fichas)
// ─────────────────────────────────────────────
const Tokens = {
  cart: {},   // {denom: qty}

  add(d) {
    this.cart[d] = (this.cart[d] || 0) + 1;
    this._render();
  },
  remove(d) {
    if (!this.cart[d]) return;
    if (this.cart[d] > 1) this.cart[d]--; else delete this.cart[d];
    this._render();
  },
  clear() { this.cart = {}; this._render(); },
  total() { return Object.entries(this.cart).reduce((s, [d,q]) => s + +d * q, 0); },

  _render() {
    const t = this.total();
    document.getElementById('ficha-total').textContent = fmt(t);
    const wrap = document.getElementById('ficha-breakdown');
    wrap.innerHTML = '';
    [1, 2, 5, 10, 20].forEach(d => {
      const q = this.cart[d] || 0;
      if (!q) return;
      const chip = document.createElement('div');
      chip.className = 'ficha-chip';
      chip.innerHTML = `<span>${q}× R$&nbsp;${d}</span><button class="remove" onclick="Tokens.remove(${d})" title="Remover uma">×</button>`;
      wrap.appendChild(chip);
    });
  },

  pay(method) {
    const t = this.total();
    if (t <= 0) { UI.toast('Adicione denominações primeiro!', 'warning'); return; }

    if (method === 'pix') {
      const s = DB.get().settings;
      if (!s.pixKey) {
        UI.toast('Configure a chave PIX nas configurações!', 'danger');
        UI.showSettings();
        return;
      }
      let pixCode = null;
      UI.showModal(`
        <h2>📱 Pagamento via PIX</h2>
        <div class="pix-amount-display">${fmt(t)}</div>
        <div id="qr-code-wrap"></div>
        <div class="pix-key-box">${esc(s.pixKey)}</div>
        <button class="pix-copy-btn" id="pix-copy-btn">📋 Copiar código PIX</button>
        <div class="alert alert-warning">Confirme o recebimento antes de entregar as fichas.</div>
        <div class="modal-actions">
          <button class="btn-cancel" onclick="UI.closeModal()">Cancelar</button>
          <button class="btn-primary" onclick="Tokens._confirm('pix')">✓ Pagamento confirmado</button>
        </div>
      `, () => {
        pixCode = Pix.renderQR(t, 'qr-code-wrap');
        const copyBtn = document.getElementById('pix-copy-btn');
        if (copyBtn && pixCode) {
          copyBtn.onclick = () => {
            navigator.clipboard.writeText(pixCode).then(() => UI.toast('Código copiado!', 'success')).catch(() => {});
          };
        }
      });
    } else {
      this._confirm('dinheiro');
    }
  },

  _confirm(method) {
    const t = this.total();
    const denoms = { ...this.cart };
    DB.update(d => {
      d.tokenSales.push({ id: uid(), ts: new Date().toISOString(), amount: t, method, denoms });
    });
    UI.closeModal();
    this.clear();
    UI.toast(`${fmt(t)} em fichas registrado (${method === 'pix' ? 'PIX' : 'Dinheiro'})!`, 'success');
    if (UI.currentTab === 'caixa') UI.renderCaixa();
  }
};

// ─────────────────────────────────────────────
// PRODUCTS
// ─────────────────────────────────────────────
const Products = {
  all()    { return DB.get().products; },
  byId(id) { return this.all().find(p => p.id === id); },

  save(p) {
    DB.update(d => {
      const idx = d.products.findIndex(x => x.id === p.id);
      if (idx >= 0) {
        // preserve sold/initialStock
        d.products[idx] = { ...d.products[idx], ...p };
      } else {
        d.products.push({ ...p, id: uid(), soldQty: 0, initialStock: p.stock });
      }
    });
    UI.renderProductList();
    UI.renderPDVGrid();
  },

  delete(id) {
    if (!confirm('Excluir este produto?')) return;
    DB.update(d => { d.products = d.products.filter(p => p.id !== id); });
    UI.renderProductList();
    UI.renderPDVGrid();
  },

  updateStock(id, newStock) {
    DB.update(d => {
      const p = d.products.find(x => x.id === id);
      if (!p) return;
      const diff = newStock - p.stock;
      p.stock = newStock;
      if (diff > 0) p.initialStock = (p.initialStock || 0) + diff;
    });
    UI.renderProductList();
    UI.renderPDVGrid();
  },

  deduct(id, qty) {
    DB.update(d => {
      const p = d.products.find(x => x.id === id);
      if (p) { p.stock = Math.max(0, p.stock - qty); p.soldQty = (p.soldQty || 0) + qty; }
    });
  },

  importCSV(text) {
    // Formato normalizado (com cabeçalho):
    //   Nome;Categoria;Compra;Venda;Estoque
    // • Separador: ponto-e-vírgula
    // • Compra/Venda: preço unitário (vírgula ou ponto como decimal)
    // • Primeira linha é sempre o cabeçalho (ignorada)
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
    const byName = {};

    const toFloat = v => parseFloat(String(v || '0').replace(',', '.')) || 0;
    const allCats = Categories.all();

    for (let i = 1; i < lines.length; i++) {     // i=1: pula cabeçalho
      const cols = lines[i].split(';');
      if (cols.length < 4) continue;

      const name     = (cols[0] || '').trim();
      const rawCat   = (cols[1] || '').trim();
      const matched  = allCats.find(c => c.name.toLowerCase() === rawCat.toLowerCase());
      const category = matched ? matched.name : (allCats.find(c => c.name.toLowerCase() === 'outro')?.name || 'Outro');
      const costPrice = toFloat(cols[2]);
      const price     = toFloat(cols[3]);
      const stock     = parseInt(cols[4]) || 1;

      if (!name || name.length < 2 || price <= 0) continue;

      const key = name.toLowerCase();
      if (byName[key]) { byName[key].stock += stock; }
      else { byName[key] = { name, price, costPrice, stock, category }; }
    }

    const toImport = Object.values(byName);
    DB.update(d => {
      const existing = new Set(d.products.map(p => p.name.toLowerCase().trim()));
      toImport.forEach(p => {
        if (!existing.has(p.name.toLowerCase())) {
          d.products.push({ id: uid(), soldQty: 0, initialStock: p.stock, ...p });
        }
      });
    });
    return toImport.length;
  }
};

// ─────────────────────────────────────────────
// SALES  (Carrinho PDV)
// ─────────────────────────────────────────────
const Sales = {
  cart: [],   // {pid, name, price, qty}

  addToCart(pid) {
    const p = Products.byId(pid);
    if (!p || p.stock <= 0) { UI.toast('Produto sem estoque!', 'danger'); return; }
    const item = this.cart.find(i => i.pid === pid);
    const inCart = item ? item.qty : 0;
    if (inCart >= p.stock) { UI.toast('Estoque insuficiente!', 'danger'); return; }
    if (item) item.qty++;
    else this.cart.push({ pid, name: p.name, price: p.price, qty: 1 });
    this._renderCart();
  },

  removeFromCart(pid) {
    const item = this.cart.find(i => i.pid === pid);
    if (!item) return;
    if (item.qty > 1) item.qty--;
    else this.cart = this.cart.filter(i => i.pid !== pid);
    this._renderCart();
  },

  clearCart() { this.cart = []; this._renderCart(); },
  total() { return this.cart.reduce((s, i) => s + i.price * i.qty, 0); },

  _renderCart() {
    const el = document.getElementById('cart-items');
    if (this.cart.length === 0) {
      el.innerHTML = '<div class="empty-state"><span class="es-icon">🛒</span>Nenhum item adicionado</div>';
    } else {
      el.innerHTML = this.cart.map(i => `
        <div class="cart-item">
          <span class="ci-name" title="${esc(i.name)}">${esc(i.name)}</span>
          <div class="ci-qty">
            <button class="ci-qty-btn" onclick="Sales.removeFromCart('${i.pid}')">−</button>
            <span>${i.qty}</span>
            <button class="ci-qty-btn" onclick="Sales.addToCart('${i.pid}')">+</button>
          </div>
          <span class="ci-price">${fmt(i.price * i.qty)}</span>
        </div>`).join('');
    }
    document.getElementById('cart-total').textContent = fmt(this.total());
  },

  checkout() {
    if (this.cart.length === 0) { UI.toast('Carrinho vazio!', 'warning'); return; }
    const items = this.cart.map(i => ({ ...i }));
    const total = this.total();

    // Atualiza estoque em um único DB.update para evitar race condition
    DB.update(d => {
      items.forEach(item => {
        const p = d.products.find(x => x.id === item.pid);
        if (p) {
          p.stock   = Math.max(0, p.stock - item.qty);
          p.soldQty = (p.soldQty || 0) + item.qty;
        }
      });
      d.sales.push({ id: uid(), ts: new Date().toISOString(), items, total });
    });

    // Sync imediato para SQLite (cancela debounce pendente)
    clearTimeout(DB._syncTimer);
    DB._sync();

    UI.toast(`Venda de ${fmt(total)} confirmada!`, 'success');
    this.clearCart();
    UI.renderPDVGrid();
    if (UI.currentTab === 'caixa') UI.renderCaixa();
  }
};

// ─────────────────────────────────────────────
// REPORTS
// ─────────────────────────────────────────────
const Reports = {
  summary(data) {
    data = data || DB.get();
    const ts = data.tokenSales;
    const sl = data.sales;
    const totalTokens = ts.reduce((s, t) => s + t.amount, 0);
    const totalPix    = ts.filter(t => t.method === 'pix').reduce((s, t) => s + t.amount, 0);
    const totalCash   = ts.filter(t => t.method === 'dinheiro').reduce((s, t) => s + t.amount, 0);
    const totalSales  = sl.reduce((s, t) => s + t.total, 0);
    const totalItems  = sl.reduce((s, t) => s + t.items.reduce((si, i) => si + i.qty, 0), 0);

    const prodMap = {};
    data.products.forEach(p => { prodMap[p.id] = p.category || 'Outro'; });

    const byProduct = {};
    sl.forEach(sale => sale.items.forEach(i => {
      if (!byProduct[i.name]) byProduct[i.name] = { qty: 0, total: 0, category: prodMap[i.pid] || i.category || 'Outro' };
      byProduct[i.name].qty   += i.qty;
      byProduct[i.name].total += i.price * i.qty;
    }));

    return { totalTokens, totalPix, totalCash, totalSales, totalItems,
             byProduct, salesCount: sl.length, tokenSalesCount: ts.length };
  },

  close() {
    if (!confirm('Fechar o caixa e resetar as vendas do dia?')) return;
    const data = DB.get();
    const s = this.summary(data);
    const report = { id: uid(), openedAt: data.cashRegister.openedAt,
                     closedAt: new Date().toISOString(), summary: s };
    DB.update(d => {
      d.cashRegister.history.push(report);
      d.cashRegister.openedAt = new Date().toISOString();
      d.tokenSales = [];
      d.sales = [];
      d.products.forEach(p => { p.soldQty = 0; p.initialStock = p.stock; });
    });
    Charts.render();
    UI.renderCaixa();
    UI.showModal(this._reportHTML(report));
  },

  _prodRowsByCategory(byProduct, emptyMsg = 'Nenhuma venda.') {
    const entries = Object.entries(byProduct);
    if (!entries.length) return `<p style="color:var(--muted);font-size:0.875rem;padding:0.5rem 0">${emptyMsg}</p>`;

    // agrupar por categoria
    const cats = {};
    entries.forEach(([name, v]) => {
      const cat = v.category || 'Outro';
      if (!cats[cat]) cats[cat] = { total: 0, items: [] };
      cats[cat].total += v.total;
      cats[cat].items.push([name, v]);
    });

    return Object.entries(cats)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([cat, g]) => {
        const rows = g.items
          .sort((a, b) => b[1].total - a[1].total)
          .map(([name, v]) => `
            <div style="display:flex;justify-content:space-between;padding:0.3rem 0 0.3rem 0.75rem;font-size:0.85rem;color:var(--muted)">
              <span>${esc(name)}</span>
              <span>${v.qty}× &nbsp;<span style="font-weight:600;color:var(--text)">${fmt(v.total)}</span></span>
            </div>`).join('');
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:0.55rem 0;border-top:1px solid var(--border);margin-top:0.25rem">
            <strong style="font-size:0.92rem;color:var(--text);text-transform:uppercase;letter-spacing:0.04em">${esc(cat)}</strong>
            <strong style="font-weight:700;color:var(--success);font-size:0.95rem">${fmt(g.total)}</strong>
          </div>
          ${rows}`;
      }).join('');
  },

  _reportHTML(report) {
    const s = report.summary;
    const prodRows = this._prodRowsByCategory(s.byProduct, 'Nenhuma venda.');

    const d1 = new Date(report.openedAt).toLocaleString('pt-BR');
    const d2 = new Date(report.closedAt).toLocaleString('pt-BR');

    return `
      <h2>📋 Relatório de Fechamento</h2>
      <p style="color:var(--muted);font-size:0.82rem;margin-bottom:1rem">${d1} → ${d2}</p>

      <div class="report-section">
        <h3>Fichas vendidas</h3>
        <div class="report-row"><span>Via PIX</span><span class="rr-value">${fmt(s.totalPix)}</span></div>
        <div class="report-row"><span>Em Dinheiro</span><span class="rr-value">${fmt(s.totalCash)}</span></div>
        <div class="report-row"><strong>Total</strong><strong class="rr-value">${fmt(s.totalTokens)}</strong></div>
      </div>

      <div class="report-section">
        <h3>Produtos vendidos — ${s.salesCount} pedidos / ${s.totalItems} itens</h3>
        ${prodRows}
        <div class="report-row" style="margin-top:0.5rem">
          <strong>Total em produtos</strong>
          <strong class="rr-value">${fmt(s.totalSales)}</strong>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn-secondary" onclick="window.print()">🖨 Imprimir</button>
        <button class="btn-primary" onclick="UI.closeModal()">Fechar</button>
      </div>`;
  }
};

// ─────────────────────────────────────────────
// CHARTS
// ─────────────────────────────────────────────
const Charts = {
  _inst: null,

  render() {
    const products = Products.all().filter(p => (p.initialStock || 0) > 0 || (p.soldQty || 0) > 0);
    const canvas = document.getElementById('stock-chart');

    if (this._inst) { this._inst.destroy(); this._inst = null; }

    if (products.length === 0) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const labels    = products.map(p => p.name.length > 22 ? p.name.slice(0, 20) + '…' : p.name);
    const sold      = products.map(p => p.soldQty || 0);
    const remaining = products.map(p => Math.max(0, (p.initialStock || 0) - (p.soldQty || 0)));

    this._inst = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Vendido',    data: sold,      backgroundColor: 'rgba(239,68,68,0.8)',  borderColor: 'rgba(239,68,68,1)',  borderWidth: 1 },
          { label: 'Disponível', data: remaining, backgroundColor: 'rgba(34,197,94,0.5)',  borderColor: 'rgba(34,197,94,0.8)', borderWidth: 1 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true, ticks: { color: '#8888aa', font: { size: 11 }, maxRotation: 45 }, grid: { color: 'rgba(45,45,78,0.7)' } },
          y: { stacked: true, ticks: { color: '#8888aa' }, grid: { color: 'rgba(45,45,78,0.7)' }, beginAtZero: true }
        },
        plugins: {
          legend: { labels: { color: '#e8e8f0' } },
          tooltip: {
            callbacks: {
              label(ctx) { return ` ${ctx.dataset.label}: ${ctx.parsed.y} un`; },
              footer(items) {
                const total  = items.reduce((s, i) => s + i.parsed.y, 0);
                const soldIt = items.find(i => i.dataset.label === 'Vendido');
                if (!soldIt || total === 0) return '';
                return `${((soldIt.parsed.y / total) * 100).toFixed(0)}% vendido`;
              }
            }
          }
        }
      }
    });
  }
};

// ─────────────────────────────────────────────
// UI
// ─────────────────────────────────────────────
const UI = {
  currentTab: 'fichas',

  showTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    this.currentTab = tab;
    if (tab === 'estoque') Charts.render();
    if (tab === 'caixa')   this.renderCaixa();
    if (tab === 'pdv')     this.renderPDVGrid();
    if (tab === 'produtos') this.renderProductList();
  },

  // ── PDV ──
  renderPDVGrid() {
    const grid = document.getElementById('product-grid');
    const filterInput = document.getElementById('pdv-filter');
    const query = filterInput ? filterInput.value.trim().toLowerCase() : '';
    const prods = Products.all();
    if (prods.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <span class="es-icon">📦</span>
        Nenhum produto cadastrado.<br>Adicione na aba <strong>Produtos</strong>.
      </div>`;
      return;
    }
    const filtered = query
      ? prods.filter(p =>
          p.name.toLowerCase().includes(query) ||
          (p.category || '').toLowerCase().includes(query))
      : prods;
    if (filtered.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><span class="es-icon">🔍</span>Nenhum produto encontrado para "<strong>${esc(query)}</strong>".</div>`;
      return;
    }
    // Sort: rank primeiro, depois in-stock, depois nome
    const sorted = [...filtered].sort((a, b) => {
      if ((a.stock > 0) !== (b.stock > 0)) return a.stock > 0 ? -1 : 1;
      const ra = a.rank ?? 999, rb = b.rank ?? 999;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
    grid.innerHTML = sorted.map(p => {
      const color = productColor(p);
      const media = p.image
        ? `<img class="p-img" src="${p.image}" alt="">`
        : `<div class="p-emoji" style="color:${color}">${productIcon(p)}</div>`;
      return `
      <div class="product-card ${p.stock <= 0 ? 'out' : ''}"
           style="border-left:4px solid ${color}"
           onclick="Sales.addToCart('${p.id}')">
        <div class="p-media">${media}</div>
        <div class="p-name">${esc(p.name)}</div>
        <div class="p-price" style="color:${color}">${fmt(p.price)}</div>
        <div class="p-stock">${p.stock <= 0 ? '⚠ Sem estoque' : `Estoque: ${p.stock}`}</div>
      </div>`;
    }).join('');
  },

  // ── PRODUTOS ──
  renderProductList() {
    const el = document.getElementById('produtos-list');
    const filterInput = document.getElementById('produtos-filter');
    const query = filterInput ? filterInput.value.trim().toLowerCase() : '';
    const prods = Products.all();
    if (prods.length === 0) {
      el.innerHTML = `<div class="empty-state">
        <span class="es-icon">📦</span>Nenhum produto.<br>Use "+ Novo Produto" ou "Importar CSV".
      </div>`;
      return;
    }
    const filtered = query
      ? prods.filter(p =>
          p.name.toLowerCase().includes(query) ||
          (p.category || '').toLowerCase().includes(query))
      : prods;
    if (filtered.length === 0) {
      el.innerHTML = `<div class="empty-state"><span class="es-icon">🔍</span>Nenhum produto encontrado para "<strong>${esc(query)}</strong>".</div>`;
      return;
    }
    const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    el.innerHTML = `<table class="data-table">
      <thead><tr>
        <th>#</th><th>Produto</th><th>Categoria</th><th>Compra (unit.)</th><th>Venda (unit.)</th>
        <th>Estoque</th><th>Vendido</th><th>Status</th><th>Ações</th>
      </tr></thead>
      <tbody>
        ${sorted.map(p => {
          const status = p.stock <= 0 ? ['badge-out','Sem estoque']
                       : p.stock <= 3 ? ['badge-low','Baixo']
                       : ['badge-ok','OK'];
          const color = productColor(p);
          const catObj = Categories.byName(p.category);
          const catIcon  = catObj ? catObj.icon  : '📦';
          const catColor = catObj ? catObj.color : '#4f46e5';
          return `<tr>
            <td style="color:var(--muted);font-size:0.8rem;text-align:center">${p.rank ?? 999}</td>
            <td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:6px;vertical-align:middle"></span>${esc(p.name)}</td>
            <td><span class="cat-badge" style="--cat-color:${catColor}">${catIcon} ${esc(p.category || '-')}</span></td>
            <td>${p.costPrice ? fmt(p.costPrice) : '—'}</td>
            <td>${fmt(p.price)}</td>
            <td>${p.stock}</td>
            <td>${p.soldQty || 0}</td>
            <td><span class="badge ${status[0]}">${status[1]}</span></td>
            <td style="white-space:nowrap;display:flex;gap:0.4rem">
              <button class="action-btn ab-edit"   onclick="UI.showProductForm('${p.id}')">✏ Editar</button>
              <button class="action-btn ab-stock"  onclick="UI.showStockModal('${p.id}')">📦</button>
              <button class="action-btn ab-delete" onclick="Products.delete('${p.id}')">🗑</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  },

  // ── CAIXA ──
  renderCaixa() {
    const data = DB.get();
    const s    = Reports.summary(data);
    const openedAt = new Date(data.cashRegister.openedAt);
    const el = document.getElementById('caixa-summary');

    const prodRows = Reports._prodRowsByCategory(s.byProduct, 'Nenhuma venda neste período.');

    el.innerHTML = `
      <p style="color:var(--muted);font-size:0.82rem;margin-bottom:1rem">
        Aberto em: ${openedAt.toLocaleDateString('pt-BR')} às ${openedAt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
      </p>

      <div class="cards-grid">
        <div class="stat-card"><div class="sc-label">Total Fichas Vendidas</div><div class="sc-value">${fmt(s.totalTokens)}</div></div>
        <div class="stat-card"><div class="sc-label">Via PIX</div><div class="sc-value sc-pix">${fmt(s.totalPix)}</div></div>
        <div class="stat-card"><div class="sc-label">Em Dinheiro</div><div class="sc-value sc-cash">${fmt(s.totalCash)}</div></div>
        <div class="stat-card"><div class="sc-label">Total Vendas (produtos)</div><div class="sc-value">${fmt(s.totalSales)}</div></div>
        <div class="stat-card"><div class="sc-label">Itens vendidos</div><div class="sc-value sc-plain">${s.totalItems}</div></div>
        <div class="stat-card"><div class="sc-label">Pedidos</div><div class="sc-value sc-plain">${s.salesCount}</div></div>
      </div>

      ${s.salesCount > 0 ? `
        <div class="report-section">
          <h3>Vendas por produto</h3>
          ${prodRows}
        </div>` : ''}

      <button class="btn-danger" onclick="Reports.close()">🔒 Fechar Caixa e Gerar Relatório</button>`;
  },

  // ── MODALS ──
  showProductForm(id) {
    const p = id ? Products.byId(id) : null;
    const cats = Categories.all();
    const pCatKey = (p?.category || '').toLowerCase().trim();
    this.showModal(`
      <h2>${p ? 'Editar Produto' : 'Novo Produto'}</h2>
      <div class="form-group">
        <label>Nome</label>
        <input id="pf-name" type="text" value="${p ? esc(p.name) : ''}" placeholder="Ex: Cerveja Corona 330ml">
      </div>
      <div class="form-group">
        <label>Preço unitário de compra (R$)</label>
        <input id="pf-cost" type="number" step="0.01" min="0" value="${p ? (p.costPrice || '') : ''}">
      </div>
      <div class="form-group">
        <label>Preço unitário de venda (R$)</label>
        <input id="pf-price" type="number" step="0.01" min="0" value="${p ? p.price : ''}">
      </div>
      <div class="form-group">
        <label>Estoque inicial</label>
        <input id="pf-stock" type="number" min="0" value="${p ? p.stock : '1'}">
      </div>
      <div class="form-group">
        <label>Categoria</label>
        <select id="pf-cat">
          ${cats.map(c => `<option value="${c.name}" ${c.name.toLowerCase() === pCatKey ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Posição no PDV <span style="color:var(--muted);font-size:0.8rem">(1 = primeiro, 999 = último)</span></label>
        <input id="pf-rank" type="number" min="1" max="999" value="${p?.rank ?? 999}">
      </div>
      <div class="form-group">
        <label>Foto do produto</label>
        ${p?.image ? `<div style="margin-bottom:0.5rem"><img src="${p.image}" style="width:80px;height:80px;object-fit:cover;border-radius:0.5rem;border:1px solid var(--border)"></div>` : ''}
        <input id="pf-image" type="file" accept="image/*">
        <p style="font-size:0.75rem;color:var(--muted);margin-top:0.25rem">A imagem será recortada em quadrado e comprimida automaticamente.</p>
      </div>
      <div class="modal-actions">
        <button class="btn-cancel" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="UI._saveProductForm('${id||''}')">Salvar</button>
      </div>`);
  },

  _saveProductForm(id) {
    const name      = document.getElementById('pf-name').value.trim();
    const costPrice = parseFloat(document.getElementById('pf-cost').value) || 0;
    const price     = parseFloat(document.getElementById('pf-price').value);
    const stock     = parseInt(document.getElementById('pf-stock').value);
    const cat       = document.getElementById('pf-cat').value;
    const rank      = parseInt(document.getElementById('pf-rank').value) || 999;
    if (!name || isNaN(price) || price < 0 || isNaN(stock) || stock < 0) {
      this.toast('Preencha todos os campos corretamente!', 'danger'); return;
    }
    const existing = id ? Products.byId(id) : null;
    const file = document.getElementById('pf-image').files[0];
    const base = existing ? { ...existing, name, costPrice, price, stock, category: cat, rank }
                          : { name, costPrice, price, stock, category: cat, rank };
    if (file) {
      compressImage(file).then(img => {
        Products.save({ ...base, image: img });
        this.closeModal();
        this.toast('Produto salvo!', 'success');
      });
    } else {
      Products.save(base);
      this.closeModal();
      this.toast('Produto salvo!', 'success');
    }
  },

  showStockModal(id) {
    const p = Products.byId(id);
    if (!p) return;
    this.showModal(`
      <h2>📦 Atualizar Estoque</h2>
      <p style="color:var(--muted);margin-bottom:1rem;font-size:0.875rem">${esc(p.name)}</p>
      <p style="margin-bottom:0.75rem">Atual: <strong>${p.stock}</strong> &nbsp;|&nbsp; Inicial: ${p.initialStock || 0} &nbsp;|&nbsp; Vendido: ${p.soldQty || 0}</p>
      <div class="form-group">
        <label>Novo estoque</label>
        <input id="sm-stock" type="number" min="0" value="${p.stock}">
      </div>
      <div class="modal-actions">
        <button class="btn-cancel" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="UI._saveStock('${id}')">Atualizar</button>
      </div>`);
  },

  _saveStock(id) {
    const v = parseInt(document.getElementById('sm-stock').value);
    if (isNaN(v) || v < 0) { this.toast('Valor inválido!', 'danger'); return; }
    Products.updateStock(id, v);
    this.closeModal();
    this.toast('Estoque atualizado!', 'success');
    if (this.currentTab === 'estoque') Charts.render();
  },

  showImportCSV() {
    this.showModal(`
      <h2>⬆ Importar CSV</h2>
      <div class="alert alert-info" style="margin-bottom:1rem">
        <strong>Formato esperado (separador <code>;</code>):</strong><br>
        <code>Nome;Categoria;Compra;Venda;Estoque</code><br><br>
        • <strong>Compra</strong> e <strong>Venda</strong>: preço unitário (use vírgula ou ponto)<br>
        • <strong>Categoria</strong>: cerveja, vinho, refrigerante, agua, porcao, petisco, outro<br>
        • A primeira linha deve ser o cabeçalho (será ignorada)<br>
        • Baixe o arquivo de exemplo em <a href="/exemplo-importacao.csv" download style="color:var(--accent)">exemplo-importacao.csv</a>
      </div>
      <div class="form-group">
        <label>Arquivo CSV</label>
        <input id="csv-file" type="file" accept=".csv,.txt">
      </div>
      <div class="alert alert-warning">Produtos com nomes duplicados serão ignorados.</div>
      <div class="modal-actions">
        <button class="btn-cancel" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="UI._doImport()">Importar</button>
      </div>`);
  },

  _doImport() {
    const file = document.getElementById('csv-file').files[0];
    if (!file) { this.toast('Selecione um arquivo!', 'warning'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const count = Products.importCSV(e.target.result);
      this.closeModal();
      this.toast(`${count} produto(s) importado(s)!`, count > 0 ? 'success' : 'warning');
      this.renderProductList();
      this.renderPDVGrid();
    };
    reader.readAsText(file, 'UTF-8');
  },

  showSettings() {
    const s = DB.get().settings;
    this.showModal(`
      <h2>⚙ Configurações</h2>
      <div class="form-group">
        <label>Nome do estabelecimento</label>
        <input id="cfg-name" type="text" value="${esc(s.storeName)}">
      </div>
      <hr class="divider">
      <p style="font-size:0.82rem;color:var(--muted);margin-bottom:0.75rem">Configurações PIX (para gerar QR Code)</p>
      <div class="form-group">
        <label>Chave PIX</label>
        <input id="cfg-pix-key" type="text" value="${esc(s.pixKey)}" placeholder="CPF, CNPJ, e-mail ou chave aleatória">
        <p style="font-size:0.75rem;color:var(--muted);margin-top:0.25rem">CPF/CNPJ: pode digitar com ou sem pontuação (ex: <code>12.345.678/0001-90</code> ou <code>12345678000190</code>). Telefone: inclua +55 (ex: <code>+5511999998888</code>). A formatação é removida automaticamente.</p>
      </div>
      <div class="form-group">
        <label>Nome do recebedor (sem acentos, máx 25 chars)</label>
        <input id="cfg-pix-name" type="text" value="${esc(s.pixName)}" placeholder="NOME SOBRENOME">
      </div>
      <div class="form-group">
        <label>Cidade (sem acentos, máx 15 chars)</label>
        <input id="cfg-pix-city" type="text" value="${esc(s.pixCity)}" placeholder="SAO PAULO">
      </div>
      <div class="form-group">
        <label>Identificador da origem <span style="color:var(--muted);font-size:0.8rem">(aparece no extrato — só letras e números, máx 25 chars)</span></label>
        <input id="cfg-pix-desc" type="text" value="${esc(s.pixDesc || 'BARCAIXA')}" placeholder="BARCAIXA">
        <p style="font-size:0.75rem;color:var(--muted);margin-top:0.25rem">Use para filtrar entradas no app do banco. Ex: FESTAJUNINA2025, BARZINHOAMIGOS.</p>
      </div>
      <div class="modal-actions">
        <button class="btn-cancel" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="UI._saveSettings()">Salvar</button>
      </div>`);
  },

  _saveSettings() {
    DB.update(d => {
      d.settings = {
        storeName: document.getElementById('cfg-name').value.trim() || 'Bar Tradição',
        pixKey:    document.getElementById('cfg-pix-key').value.trim(),
        pixName:   document.getElementById('cfg-pix-name').value.trim(),
        pixCity:   document.getElementById('cfg-pix-city').value.trim(),
        pixDesc:   document.getElementById('cfg-pix-desc').value.trim()
      };
    });
    document.getElementById('store-name').textContent = DB.get().settings.storeName;
    this.closeModal();
    this.toast('Configurações salvas!', 'success');
  },

  // ── CATEGORIAS ──
  showCategoryList() {
    const cats = Categories.all();
    this.showModal(`
      <h2>🏷 Categorias</h2>
      <div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:1.25rem">
        ${cats.map(c => `
          <div style="display:flex;align-items:center;gap:0.75rem;padding:0.6rem 0.875rem;
               background:var(--card);border:1px solid var(--border);border-radius:0.5rem;
               border-left:4px solid ${c.color}">
            <span style="font-size:1.4rem;flex-shrink:0">${c.icon}</span>
            <span style="flex:1;font-weight:600">${esc(c.name)}</span>
            <span style="font-size:0.75rem;color:var(--muted);font-family:monospace">${c.color}</span>
            <div style="width:16px;height:16px;border-radius:50%;background:${c.color};flex-shrink:0"></div>
            <button class="action-btn ab-edit"   onclick="UI.showCategoryForm('${c.id}')">✏</button>
            <button class="action-btn ab-delete" onclick="Categories.delete('${c.id}')">🗑</button>
          </div>`).join('')}
      </div>
      <div class="modal-actions">
        <button class="btn-cancel"  onclick="UI.closeModal()">Fechar</button>
        <button class="btn-primary" onclick="UI.showCategoryForm('')">+ Nova Categoria</button>
      </div>`);
  },

  showCategoryForm(id) {
    const c = id ? Categories.byId(id) : null;
    this.showModal(`
      <h2>${c ? 'Editar Categoria' : 'Nova Categoria'}</h2>
      <div class="form-group">
        <label>Nome</label>
        <input id="cf-name" type="text" value="${c ? esc(c.name) : ''}" placeholder="Ex: Cerveja">
      </div>
      <div class="form-group">
        <label>Cor de destaque</label>
        <div style="display:flex;gap:0.75rem;align-items:center">
          <input id="cf-color" type="color" value="${c ? c.color : '#4f46e5'}"
                 style="width:56px;height:44px;padding:2px 4px;cursor:pointer;border-radius:0.5rem;border:1px solid var(--border);background:var(--card)">
          <span id="cf-color-preview" style="flex:1;height:44px;border-radius:0.5rem;background:${c ? c.color : '#4f46e5'};transition:background 0.15s"></span>
        </div>
      </div>
      <div class="form-group">
        <label>Ícone (emoji)</label>
        <input id="cf-icon" type="text" value="${c ? c.icon : '📦'}" maxlength="4"
               style="font-size:1.6rem;text-align:center;letter-spacing:0.1rem" placeholder="📦">
      </div>
      <div class="modal-actions">
        <button class="btn-cancel"  onclick="UI.showCategoryList()">Voltar</button>
        <button class="btn-primary" onclick="UI._saveCategoryForm('${id || ''}')">Salvar</button>
      </div>`,
      () => {
        const colorInput   = document.getElementById('cf-color');
        const colorPreview = document.getElementById('cf-color-preview');
        if (colorInput) colorInput.addEventListener('input', () => {
          colorPreview.style.background = colorInput.value;
        });
      }
    );
  },

  _saveCategoryForm(id) {
    const name  = document.getElementById('cf-name').value.trim();
    const color = document.getElementById('cf-color').value || '#4f46e5';
    const icon  = document.getElementById('cf-icon').value.trim() || '📦';
    if (!name) { this.toast('Nome é obrigatório!', 'danger'); return; }
    Categories.save({ id: id || ('cat-' + uid()), name, color, icon });
    this.toast('Categoria salva!', 'success');
    this.showCategoryList();
  },

  // ── MODAL helpers ──
  showModal(html, afterRender) {
    document.getElementById('modal-content').innerHTML = html;
    document.getElementById('modal-overlay').classList.remove('hidden');
    if (afterRender) setTimeout(afterRender, 60);
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
  },

  overlayClick(e) {
    if (e.target === document.getElementById('modal-overlay')) this.closeModal();
  },

  // ── TOAST ──
  toast(msg, type = 'success') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast alert alert-${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }
};

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Tenta carregar do servidor SQLite; se falhar, usa localStorage
  const fromServer = await DB.loadFromServer();
  if (!fromServer) {
    console.info('Servidor indisponível — usando localStorage');
  }

  document.getElementById('store-name').textContent = DB.get().settings.storeName;
  Sales._renderCart();
  UI.renderPDVGrid();
  UI.showTab('fichas');

  // Garante que o estado (incluindo ranks) seja persistido antes de fechar/recarregar
  window.addEventListener('beforeunload', () => DB.flushSync());
});
