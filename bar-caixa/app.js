'use strict';

// ─────────────────────────────────────────────
// DATABASE  (memória + SQLite via API — sem cache no navegador)
// ─────────────────────────────────────────────
const DB = {
  _state: null,
  _syncTimer: null,
  serverOk: false,

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
      almoxarifados: [],
      productStocks: [],
      stockMovements: [],
      products: [],
      tokenSales: [],
      sales: [],
      cashRegister: { openedAt: new Date().toISOString(), accumulatedProfit: 0, history: [] },
      fixedCosts: []
    };
  },

  get() {
    return this._state || this._default();
  },

  // Carrega estado do servidor (chamado na inicialização)
  async loadFromServer() {
    try {
      const res = await fetch('/api/state', { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return false;
      this._state = await res.json();
      this.serverOk = true;
      // Limpa localStorage legado se existir
      try { localStorage.removeItem('bar-caixa-v1'); } catch {}
      return true;
    } catch {
      if (!this._state) this._state = this._default();
      return false;
    }
  },

  update(fn) {
    if (!this._state) this._state = this._default();
    fn(this._state);
    this._scheduleSync();
    return this._state;
  },

  _scheduleSync() {
    clearTimeout(this._syncTimer);
    this._syncTimer = setTimeout(() => this._sync(), 250);
  },

  async _sync() {
    if (!this._state) return;
    try {
      const res = await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this._state),
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok && !this.serverOk) {
        this.serverOk = true;
        UI.toast('Conectado ao servidor SQLite', 'success');
      }
    } catch {
      if (this.serverOk) {
        this.serverOk = false;
        UI.toast('Servidor offline — dados não salvos!', 'danger');
      }
    }
  },

  flushSync() {
    clearTimeout(this._syncTimer);
    if (!this._state) return;
    const blob = new Blob([JSON.stringify(this._state)], { type: 'application/json' });
    navigator.sendBeacon('/api/state', blob);
  }
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const fmt = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
// Retorna "YYYY-MM-DDTHH:MM" para datetime-local (hora local)
const nowLocal = () => { const d = new Date(); d.setSeconds(0,0); return d.toISOString().slice(0,16); };
// Converte datetime-local (sem timezone) para ISO com offset local
const localToISO = s => s ? new Date(s).toISOString() : new Date().toISOString();
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

// ─────────────────────────────────────────────
// CUSTOS FIXOS
// ─────────────────────────────────────────────
const FixedCosts = {
  all() { return (DB.get().fixedCosts || []); },

  total() { return this.all().reduce((s, c) => s + c.qty * c.unitCost, 0); },

  save(item) {
    DB.update(d => {
      if (!d.fixedCosts) d.fixedCosts = [];
      const idx = d.fixedCosts.findIndex(c => c.id === item.id);
      if (idx >= 0) d.fixedCosts[idx] = item;
      else d.fixedCosts.push({ ...item, id: uid() });
    });
    UI.renderLucro();
  },

  delete(id) {
    if (!confirm('Excluir este custo fixo?')) return;
    DB.update(d => { d.fixedCosts = (d.fixedCosts || []).filter(c => c.id !== id); });
    UI.renderLucro();
  }
};

// ─────────────────────────────────────────────
// ALMOXARIFADOS
// ─────────────────────────────────────────────
const ALMOX_TYPES = [
  { id: 'consignado', name: 'Consignado', icon: '📋' },
  { id: 'freezer',    name: 'Freezer',    icon: '🧊' },
  { id: 'proprio',    name: 'Próprio',    icon: '🏪' },
  { id: 'outro',      name: 'Outro',      icon: '📦' },
];

const Almoxarifados = {
  all()    { return DB.get().almoxarifados || []; },
  byId(id) { return this.all().find(a => a.id === id) || null; },
  typeInfo(type) { return ALMOX_TYPES.find(t => t.id === type) || ALMOX_TYPES[3]; },

  save(a) {
    DB.update(d => {
      if (!d.almoxarifados) d.almoxarifados = [];
      const idx = d.almoxarifados.findIndex(x => x.id === a.id);
      if (idx >= 0) d.almoxarifados[idx] = a;
      else d.almoxarifados.push(a);
    });
  },

  delete(id) {
    const a = this.byId(id);
    if (!a) return;
    const prods = Products.all().filter(p => p.activeAlmoxId === id);
    if (prods.length > 0) {
      alert(`Não é possível excluir: ${prods.length} produto(s) usam este almoxarifado como fonte de vendas.\nAltere o almoxarifado de venda desses produtos primeiro.`);
      return;
    }
    if (!confirm(`Excluir o almoxarifado "${a.name}"?\nTodo o estoque registrado nele será perdido.`)) return;
    DB.update(d => {
      d.almoxarifados = d.almoxarifados.filter(x => x.id !== id);
      d.productStocks = (d.productStocks || []).filter(ps => ps.almoxarifadoId !== id);
      d.products.forEach(p => {
        p.stock = (d.productStocks || [])
          .filter(ps => ps.productId === p.id)
          .reduce((s, ps) => s + ps.qty, 0);
      });
    });
    UI.renderProductList();
    UI.renderPDVGrid();
    UI.showAlmoxList();
  }
};

// ─────────────────────────────────────────────
// STOCK  (controle de estoque por almoxarifado)
// ─────────────────────────────────────────────
const Stock = {
  // Todas as entradas de estoque de um produto
  forProduct(productId) {
    return (DB.get().productStocks || []).filter(ps => ps.productId === productId);
  },

  // Quantidade em um almoxarifado específico
  qty(productId, almoxId) {
    const entry = (DB.get().productStocks || []).find(ps => ps.productId === productId && ps.almoxarifadoId === almoxId);
    return entry ? entry.qty : 0;
  },

  // Total geral (soma de todos os almoxarifados)
  total(productId) {
    return (DB.get().productStocks || [])
      .filter(ps => ps.productId === productId)
      .reduce((s, ps) => s + ps.qty, 0);
  },

  // Sincroniza p.stock com a soma dos productStocks (chamado após qualquer movimentação)
  _syncTotal(d, productId) {
    const prod = d.products.find(x => x.id === productId);
    if (prod) {
      prod.stock = (d.productStocks || [])
        .filter(ps => ps.productId === productId)
        .reduce((s, ps) => s + ps.qty, 0);
    }
  },

  // Entrada de estoque em um almoxarifado
  entrada(productId, almoxId, qty, note = '', unitCost = 0, ts = null) {
    const p = Products.byId(productId);
    const a = Almoxarifados.byId(almoxId);
    if (!p || !a || qty <= 0) return false;
    DB.update(d => {
      if (!d.productStocks)  d.productStocks  = [];
      if (!d.stockMovements) d.stockMovements = [];
      const entry = d.productStocks.find(ps => ps.productId === productId && ps.almoxarifadoId === almoxId);
      if (entry) entry.qty += qty;
      else d.productStocks.push({ productId, almoxarifadoId: almoxId, qty });
      d.stockMovements.push({
        id: uid(), ts: ts || new Date().toISOString(), type: 'entrada',
        productId, productName: p.name,
        fromAlmoxId: null, fromAlmoxName: null,
        toAlmoxId: almoxId, toAlmoxName: a.name,
        qty, unitCost, note
      });
      this._syncTotal(d, productId);
    });
    return true;
  },

  // Transferência entre almoxarifados
  transferir(productId, fromAlmoxId, toAlmoxId, qty, ts = null) {
    const p     = Products.byId(productId);
    const fromA = Almoxarifados.byId(fromAlmoxId);
    const toA   = Almoxarifados.byId(toAlmoxId);
    if (!p || !fromA || !toA || qty <= 0) return false;
    if (this.qty(productId, fromAlmoxId) < qty) return false;
    DB.update(d => {
      if (!d.productStocks)  d.productStocks  = [];
      if (!d.stockMovements) d.stockMovements = [];
      const fromEntry = d.productStocks.find(ps => ps.productId === productId && ps.almoxarifadoId === fromAlmoxId);
      if (fromEntry) fromEntry.qty = Math.max(0, fromEntry.qty - qty);
      const toEntry = d.productStocks.find(ps => ps.productId === productId && ps.almoxarifadoId === toAlmoxId);
      if (toEntry) toEntry.qty += qty;
      else d.productStocks.push({ productId, almoxarifadoId: toAlmoxId, qty });
      d.stockMovements.push({
        id: uid(), ts: ts || new Date().toISOString(), type: 'transferencia',
        productId, productName: p.name,
        fromAlmoxId, fromAlmoxName: fromA.name,
        toAlmoxId, toAlmoxName: toA.name,
        qty, note: ''
      });
      // Transferência não muda o total — não precisa syncTotal
    });
    return true;
  },

  // Ajuste manual (define quantidade absoluta)
  ajustar(productId, almoxId, newQty, note = 'Ajuste manual') {
    const p = Products.byId(productId);
    const a = Almoxarifados.byId(almoxId);
    if (!p || !a || newQty < 0) return false;
    const oldQty = this.qty(productId, almoxId);
    const diff   = newQty - oldQty;
    if (diff === 0) return true;
    DB.update(d => {
      if (!d.productStocks)  d.productStocks  = [];
      if (!d.stockMovements) d.stockMovements = [];
      const entry = d.productStocks.find(ps => ps.productId === productId && ps.almoxarifadoId === almoxId);
      if (entry) entry.qty = newQty;
      else d.productStocks.push({ productId, almoxarifadoId: almoxId, qty: newQty });
      d.stockMovements.push({
        id: uid(), ts: new Date().toISOString(), type: 'ajuste',
        productId, productName: p.name,
        fromAlmoxId: diff < 0 ? almoxId : null, fromAlmoxName: diff < 0 ? a.name : null,
        toAlmoxId:   diff > 0 ? almoxId : null, toAlmoxName:   diff > 0 ? a.name : null,
        qty: Math.abs(diff), note
      });
      this._syncTotal(d, productId);
    });
    return true;
  },

  // Exclui uma movimentação e recalcula productStocks do zero para aquele produto
  deleteMovement(id) {
    let ok = false;
    DB.update(d => {
      const idx = (d.stockMovements || []).findIndex(m => m.id === id);
      if (idx < 0) return;
      const m = d.stockMovements[idx];
      if (m.type === 'venda') return; // vendas são gerenciadas pelo caixa
      ok = true;
      const productId = m.productId;

      // Remove o movimento
      d.stockMovements.splice(idx, 1);

      // Recalcula productStocks do produto do zero a partir dos movimentos restantes
      // (mais confiável que reversão incremental, que depende de ordem e estado atual)
      const newStocks = {}; // almoxId -> qty
      (d.stockMovements || []).forEach(mv => {
        if (mv.productId !== productId) return;
        if (mv.type === 'entrada' && mv.toAlmoxId) {
          newStocks[mv.toAlmoxId] = (newStocks[mv.toAlmoxId] || 0) + mv.qty;
        } else if (mv.type === 'transferencia') {
          if (mv.fromAlmoxId) newStocks[mv.fromAlmoxId] = (newStocks[mv.fromAlmoxId] || 0) - mv.qty;
          if (mv.toAlmoxId)   newStocks[mv.toAlmoxId]   = (newStocks[mv.toAlmoxId]   || 0) + mv.qty;
        } else if (mv.type === 'devolucao' && mv.fromAlmoxId) {
          newStocks[mv.fromAlmoxId] = (newStocks[mv.fromAlmoxId] || 0) - mv.qty;
        } else if (mv.type === 'ajuste') {
          // ajuste define delta; fromAlmoxId = saída, toAlmoxId = entrada
          if (mv.fromAlmoxId) newStocks[mv.fromAlmoxId] = (newStocks[mv.fromAlmoxId] || 0) - mv.qty;
          if (mv.toAlmoxId)   newStocks[mv.toAlmoxId]   = (newStocks[mv.toAlmoxId]   || 0) + mv.qty;
        }
        // vendas: ignoradas aqui — productStocks é decrementado pelo checkout diretamente
        // e não é recalculável de forma confiável sem saber o activeAlmoxId histórico
      });

      // Desconta vendas do almoxarifado ativo (vendas sempre saem do activeAlmoxId)
      const prod = (d.products || []).find(p => p.id === productId);
      if (prod?.activeAlmoxId && prod.soldQty > 0) {
        newStocks[prod.activeAlmoxId] = (newStocks[prod.activeAlmoxId] || 0) - prod.soldQty;
      }

      // Zera entradas de almoxarifados que não aparecem nos movimentos restantes
      (d.productStocks || []).forEach(ps => {
        if (ps.productId === productId && !(ps.almoxarifadoId in newStocks)) {
          ps.qty = 0;
        }
      });

      // Aplica os novos valores no productStocks
      Object.entries(newStocks).forEach(([almoxId, qty]) => {
        const ps = (d.productStocks || []).find(ps => ps.productId === productId && ps.almoxarifadoId === almoxId);
        const val = Math.max(0, qty);
        if (ps) ps.qty = val;
        else if (val > 0) (d.productStocks || []).push({ productId, almoxarifadoId: almoxId, qty: val });
      });

      // Sincroniza p.stock
      if (prod) prod.stock = (d.productStocks || []).filter(ps => ps.productId === productId).reduce((s, ps) => s + ps.qty, 0);
    });
    return ok;
  },

  // Edita apenas campos não-inventariais de uma movimentação (ts e note)
  updateMovement(id, { ts, note }) {
    DB.update(d => {
      const m = (d.stockMovements || []).find(x => x.id === id);
      if (!m || m.type === 'venda') return;
      if (ts   !== undefined) m.ts   = ts;
      if (note !== undefined) m.note = note;
    });
  },

  // Devolução ao fornecedor (saída do almoxarifado sem destino interno)
  devolver(productId, almoxId, qty, note = '', ts = null) {
    const p = Products.byId(productId);
    const a = Almoxarifados.byId(almoxId);
    if (!p || !a || qty <= 0) return false;
    if (this.qty(productId, almoxId) < qty) return false;
    DB.update(d => {
      if (!d.productStocks)  d.productStocks  = [];
      if (!d.stockMovements) d.stockMovements = [];
      const entry = d.productStocks.find(ps => ps.productId === productId && ps.almoxarifadoId === almoxId);
      if (entry) entry.qty = Math.max(0, entry.qty - qty);
      // Usa o custo da última entrada neste almoxarifado como referência de valor
      const lastEntrada = [...(d.stockMovements || [])]
        .filter(m => m.type === 'entrada' && m.productId === productId && m.toAlmoxId === almoxId)
        .sort((x, y) => y.ts.localeCompare(x.ts))[0];
      const unitCost = lastEntrada?.unitCost || p.costPrice || 0;
      d.stockMovements.push({
        id: uid(), ts: ts || new Date().toISOString(), type: 'devolucao',
        productId, productName: p.name,
        fromAlmoxId: almoxId, fromAlmoxName: a.name,
        toAlmoxId: null, toAlmoxName: null,
        qty, unitCost, note: note || 'Devolução ao fornecedor'
      });
      this._syncTotal(d, productId);
    });
    return true;
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
        d.products[idx] = { ...d.products[idx], ...p };
      } else {
        const newId = uid();
        d.products.push({ ...p, id: newId, soldQty: 0, initialStock: 0, stock: 0 });
      }
    });
    UI.renderProductList();
    UI.renderPDVGrid();
  },

  delete(id) {
    if (!confirm('Excluir este produto?')) return;
    DB.update(d => {
      d.products     = d.products.filter(p => p.id !== id);
      d.productStocks = (d.productStocks || []).filter(ps => ps.productId !== id);
    });
    UI.renderProductList();
    UI.renderPDVGrid();
  },

  deduct(id, qty) {
    DB.update(d => {
      const p = d.products.find(x => x.id === id);
      if (!p) return;
      if (p.activeAlmoxId) {
        const entry = (d.productStocks || []).find(ps => ps.productId === id && ps.almoxarifadoId === p.activeAlmoxId);
        if (entry) entry.qty = Math.max(0, entry.qty - qty);
      }
      p.stock   = Math.max(0, p.stock - qty);
      p.soldQty = (p.soldQty || 0) + qty;
    });
  },

  importCSV(text, almoxId) {
    // Formato normalizado (com cabeçalho):
    //   Nome;Categoria;Compra;Venda;Estoque
    // • Separador: ponto-e-vírgula
    // • Compra/Venda: preço unitário (vírgula ou ponto como decimal)
    // • Primeira linha é sempre o cabeçalho (ignorada)
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
    const byName = {};

    const toFloat = v => parseFloat(String(v || '0').replace(',', '.')) || 0;
    const allCats = Categories.all();

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(';');
      if (cols.length < 4) continue;

      const name     = (cols[0] || '').trim();
      const rawCat   = (cols[1] || '').trim();
      const matched  = allCats.find(c => c.name.toLowerCase() === rawCat.toLowerCase());
      const category = matched ? matched.name : (allCats.find(c => c.name.toLowerCase() === 'outro')?.name || 'Outro');
      const costPrice = toFloat(cols[2]);
      const price     = toFloat(cols[3]);
      const stock     = parseInt(cols[4]) || 0;

      if (!name || name.length < 2 || price <= 0) continue;

      const key = name.toLowerCase();
      if (byName[key]) { byName[key].stock += stock; }
      else { byName[key] = { name, price, costPrice, stock, category }; }
    }

    const toImport = Object.values(byName);
    const almox    = almoxId ? Almoxarifados.byId(almoxId) : null;

    DB.update(d => {
      if (!d.productStocks)  d.productStocks  = [];
      if (!d.stockMovements) d.stockMovements = [];
      const existing = new Set(d.products.map(p => p.name.toLowerCase().trim()));
      toImport.forEach(p => {
        if (existing.has(p.name.toLowerCase())) return;
        const newId = uid();
        d.products.push({
          id: newId, soldQty: 0, initialStock: p.stock, stock: p.stock,
          activeAlmoxId: almoxId || null,
          ...p
        });
        if (almoxId && p.stock > 0) {
          d.productStocks.push({ productId: newId, almoxarifadoId: almoxId, qty: p.stock });
          d.stockMovements.push({
            id: uid(), ts: new Date().toISOString(), type: 'entrada',
            productId: newId, productName: p.name,
            fromAlmoxId: null, fromAlmoxName: null,
            toAlmoxId: almoxId, toAlmoxName: almox?.name || '',
            qty: p.stock, note: 'Importação CSV'
          });
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
    if (!p) return;
    // Verifica estoque no almoxarifado ativo; fallback no total
    const activeStock = p.activeAlmoxId ? Stock.qty(pid, p.activeAlmoxId) : p.stock;
    if (activeStock <= 0) {
      const almoxName = p.activeAlmoxId ? (Almoxarifados.byId(p.activeAlmoxId)?.name || 'almoxarifado ativo') : 'estoque';
      UI.toast(`Sem estoque no ${almoxName}!`, 'danger');
      return;
    }
    const item   = this.cart.find(i => i.pid === pid);
    const inCart = item ? item.qty : 0;
    if (inCart >= activeStock) { UI.toast('Estoque insuficiente!', 'danger'); return; }
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

    DB.update(d => {
      if (!d.stockMovements) d.stockMovements = [];
      items.forEach(item => {
        const p = d.products.find(x => x.id === item.pid);
        if (!p) return;
        if (p.activeAlmoxId) {
          const entry = (d.productStocks || []).find(ps => ps.productId === item.pid && ps.almoxarifadoId === p.activeAlmoxId);
          if (entry) entry.qty = Math.max(0, entry.qty - item.qty);
          const almox = (d.almoxarifados || []).find(a => a.id === p.activeAlmoxId);
          d.stockMovements.push({
            id: uid(), ts: new Date().toISOString(), type: 'venda',
            productId: item.pid, productName: item.name,
            fromAlmoxId: p.activeAlmoxId, fromAlmoxName: almox?.name || '',
            toAlmoxId: null, toAlmoxName: null,
            qty: item.qty, note: ''
          });
        }
        p.stock   = Math.max(0, p.stock - item.qty);
        p.soldQty = (p.soldQty || 0) + item.qty;
      });
      d.sales.push({ id: uid(), ts: new Date().toISOString(), items, total });
    });

    clearTimeout(DB._syncTimer);
    DB._sync();

    UI.toast(`Venda de ${fmt(total)} confirmada!`, 'success');
    this.clearCart();
    UI.renderPDVGrid();
    if (UI.currentTab === 'caixa')   UI.renderCaixa();
    if (UI.currentTab === 'estoque') UI.renderEstoque();
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

    const prodMap  = {};
    const costMap  = {};
    data.products.forEach(p => {
      prodMap[p.id] = p.category || 'Outro';
      costMap[p.id] = p.costPrice || 0;
    });

    const byProduct = {};
    sl.forEach(sale => sale.items.forEach(i => {
      if (!byProduct[i.name]) byProduct[i.name] = { qty: 0, total: 0, cost: 0, category: prodMap[i.pid] || i.category || 'Outro' };
      byProduct[i.name].qty   += i.qty;
      byProduct[i.name].total += i.price * i.qty;
      byProduct[i.name].cost  += (costMap[i.pid] || 0) * i.qty;
    }));

    const totalCost        = Object.values(byProduct).reduce((s, v) => s + v.cost, 0);
    const totalFixedCosts  = FixedCosts.total();
    const totalProfit      = totalSales - totalCost - totalFixedCosts;

    return { totalTokens, totalPix, totalCash, totalSales, totalItems,
             totalCost, totalFixedCosts, totalProfit,
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
      d.cashRegister.accumulatedProfit = (d.cashRegister.accumulatedProfit || 0) + (s.totalProfit || 0);
      d.tokenSales = [];
      d.sales = [];
      d.products.forEach(p => { p.soldQty = 0; p.initialStock = p.stock; });
    });
    Charts.render();
    UI.renderCaixa();
    if (UI.currentTab === 'lucro') UI.renderLucro();
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

  exportMarkdown() {
    const data   = DB.get();
    const s      = Reports.summary(data);
    const store  = data.settings?.storeName || 'Bar';
    const now    = new Date();
    const openedAt = new Date(data.cashRegister.openedAt);
    const fmtDate  = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const fmtTime  = d => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const fmtMD    = v => `R$ ${v.toFixed(2).replace('.', ',')}`;
    const pct      = (n, d) => d === 0 ? '—' : (n / d * 100).toFixed(1) + '%';

    const accumulatedProfit = data.cashRegister.accumulatedProfit || 0;
    const totalProfit       = s.totalProfit + accumulatedProfit;

    // ── Produtos agrupados por categoria ──
    const cats = {};
    Object.entries(s.byProduct).forEach(([name, v]) => {
      const cat = v.category || 'Outro';
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push({ name, ...v, profit: v.total - v.cost });
    });

    let salesSection = '';
    Object.entries(cats)
      .sort((a, b) => b[1].reduce((s,i)=>s+i.total,0) - a[1].reduce((s,i)=>s+i.total,0))
      .forEach(([cat, items]) => {
        const catTotal   = items.reduce((s,i)=>s+i.total, 0);
        const catProfit  = items.reduce((s,i)=>s+i.profit, 0);
        salesSection += `\n### ${cat}\n\n`;
        salesSection += `| Produto | Qtd | Receita | Custo | Lucro | Margem |\n`;
        salesSection += `|---------|----:|--------:|------:|------:|-------:|\n`;
        items.sort((a,b)=>b.total-a.total).forEach(i => {
          salesSection += `| ${i.name} | ${i.qty} | ${fmtMD(i.total)} | ${fmtMD(i.cost)} | ${fmtMD(i.profit)} | ${pct(i.profit, i.total)} |\n`;
        });
        salesSection += `| **Total ${cat}** | | **${fmtMD(catTotal)}** | | **${fmtMD(catProfit)}** | **${pct(catProfit, catTotal)}** |\n`;
      });

    if (!salesSection) salesSection = '\n_Nenhuma venda registrada nesta sessão._\n';

    // ── Estoque ──
    const prods   = Products.all().sort((a,b) => (a.category||'').localeCompare(b.category||'')||a.name.localeCompare(b.name));
    const almoxes = Almoxarifados.all();
    const almoxHeaders = almoxes.map(a => ` ${a.name} `).join('|');
    let stockSection = `| Produto | Categoria |${almoxHeaders}| Total | Vendido | Status |\n`;
    const sepAlmox   = almoxes.map(() => `----:`).join('|');
    stockSection    += `|---------|-----------|${sepAlmox}|------:|--------:|--------|\n`;
    const stockWarnings = [];
    prods.forEach(p => {
      const psTotal   = almoxes.reduce((s, a) => s + Stock.qty(p.id, a.id), 0);
      const almoxCols = almoxes.map(a => ` ${Stock.qty(p.id, a.id)} `).join('|');
      const status    = p.stock <= 0 ? '⚠ Esgotado' : p.stock <= 3 ? '🔶 Baixo' : '✅ OK';
      const flag      = psTotal !== p.stock ? ' ⚠️' : '';
      if (flag) stockWarnings.push(`- **${p.name}**: soma dos almoxarifados = ${psTotal}, total registrado = ${p.stock} (divergência — use Ajuste para corrigir)`);
      stockSection += `| ${p.name}${flag} | ${p.category || '-'} |${almoxCols}| ${p.stock} | ${p.soldQty || 0} | ${status} |\n`;
    });
    const stockNote = stockWarnings.length
      ? `\n> ⚠️ **Divergências detectadas** (marcadas com ⚠️ na tabela — a soma dos almoxarifados não bate com o total do produto, provavelmente por venda registrada no almoxarifado errado):\n>\n${stockWarnings.map(w => '> ' + w).join('\n')}\n`
      : '';

    // ── Consignado ──
    const consignadoIds = new Set(almoxes.filter(a => a.type === 'consignado').map(a => a.id));
    const freezerIds    = new Set(almoxes.filter(a => a.type === 'freezer').map(a => a.id));
    const prodMap       = {};
    prods.forEach(p => { prodMap[p.id] = p; });

    const consigByProd = {};
    const cGet = (pid, name) => {
      if (!consigByProd[pid]) consigByProd[pid] = { name, qtdEntrada: 0, valEntrada: 0, qtdTransferido: 0, qtdDevolvido: 0, valDevolvido: 0, valVendido: 0, saldoConsig: 0, saldoFreezer: 0 };
      return consigByProd[pid];
    };
    (data.stockMovements || []).forEach(m => {
      const unitCost = m.unitCost || prodMap[m.productId]?.costPrice || 0;
      if (m.type === 'entrada' && consignadoIds.has(m.toAlmoxId)) {
        const r = cGet(m.productId, m.productName);
        r.qtdEntrada  += m.qty;
        r.valEntrada  += m.qty * unitCost;
      } else if (m.type === 'transferencia' && consignadoIds.has(m.fromAlmoxId)) {
        cGet(m.productId, m.productName).qtdTransferido += m.qty;
      } else if (m.type === 'devolucao') {
        const r = cGet(m.productId, m.productName);
        r.qtdDevolvido  += m.qty;
        r.valDevolvido  += m.qty * unitCost;
      }
    });
    (data.sales || []).forEach(sale => {
      (sale.items || []).forEach(i => {
        if (consigByProd[i.pid]) consigByProd[i.pid].valVendido += i.price * i.qty;
      });
    });
    (data.products || []).forEach(p => {
      if (!consigByProd[p.id]) return;
      consigByProd[p.id].qtdVendido = p.soldQty || 0;
    });
    (data.productStocks || []).forEach(ps => {
      const r = consigByProd[ps.productId];
      if (!r) return;
      if (consignadoIds.has(ps.almoxarifadoId)) r.saldoConsig   += ps.qty;
      if (freezerIds.has(ps.almoxarifadoId))    r.saldoFreezer  += ps.qty;
    });

    const consigItems = Object.values(consigByProd).filter(r => r.qtdEntrada > 0 || r.qtdDevolvido > 0);
    let consigSection = '';
    if (consigItems.length === 0) {
      consigSection = '_Nenhuma entrada consignada registrada._\n';
    } else {
      const totEntrada   = consigItems.reduce((s,r)=>s+r.valEntrada,   0);
      const totDevolvido = consigItems.reduce((s,r)=>s+r.valDevolvido, 0);
      const totVendido   = consigItems.reduce((s,r)=>s+r.valVendido,   0);
      consigSection  = `| Produto | Entrou (un) | Valor entrada | Transferido | Vendido (un) | Receita venda | Devolvido (un) | Valor devolvido | Saldo consig. | Saldo freezer |\n`;
      consigSection += `|---------|------------:|--------------:|------------:|-------------:|--------------:|---------------:|----------------:|--------------:|--------------:|\n`;
      consigItems.sort((a,b)=>b.valEntrada-a.valEntrada).forEach(r => {
        consigSection += `| ${r.name} | ${r.qtdEntrada} | ${fmtMD(r.valEntrada)} | ${r.qtdTransferido||'—'} | ${r.qtdVendido||'—'} | ${r.valVendido ? fmtMD(r.valVendido) : '—'} | ${r.qtdDevolvido||'—'} | ${r.qtdDevolvido ? fmtMD(r.valDevolvido) : '—'} | ${r.saldoConsig||'—'} | ${r.saldoFreezer||'—'} |\n`;
      });
      consigSection += `| **TOTAL** | | **${fmtMD(totEntrada)}** | | | **${fmtMD(totVendido)}** | | **${fmtMD(totDevolvido)}** | | |\n`;
      consigSection += `\n> **Leitura:** Entrada = Transferido para freezers + Devolvido ao fornecedor + Saldo consig.\n`;
      consigSection += `> Ambas as saídas (Venda e Devolução) reduzem a obrigação com o fornecedor.\n`;
    }

    // ── Custos fixos ──
    const fixedCostsList = FixedCosts.all();
    let fixedSection = `| Descrição | Qtd | Custo Unit. | Total |\n`;
    fixedSection    += `|-----------|----:|------------:|------:|\n`;
    if (fixedCostsList.length === 0) {
      fixedSection += `| _Nenhum custo fixo cadastrado_ | | | |\n`;
    } else {
      fixedCostsList.forEach(c => {
        fixedSection += `| ${c.name} | ${c.qty} | ${fmtMD(c.unitCost)} | ${fmtMD(c.qty * c.unitCost)} |\n`;
      });
      fixedSection += `| **TOTAL** | | | **${fmtMD(s.totalFixedCosts)}** |\n`;
    }

    // ── Catálogo de preços ──
    let catalogSection = `| Produto | Categoria | Custo | Preço de Venda | Margem |\n`;
    catalogSection    += `|---------|-----------|------:|---------------:|-------:|\n`;
    prods.forEach(p => {
      const margin = p.costPrice ? pct(p.price - p.costPrice, p.price) : '—';
      catalogSection += `| ${p.name} | ${p.category || '-'} | ${p.costPrice ? fmtMD(p.costPrice) : '—'} | ${fmtMD(p.price)} | ${margin} |\n`;
    });

    const md = `# Relatório de Evento — ${store}

**Data:** ${fmtDate(now)}
**Período:** ${fmtDate(openedAt)} ${fmtTime(openedAt)} → ${fmtDate(now)} ${fmtTime(now)}
**Gerado em:** ${now.toLocaleString('pt-BR')}

---

## 1. Resumo Financeiro

| | Valor |
|---|---:|
| Fichas vendidas — PIX | ${fmtMD(s.totalPix)} |
| Fichas vendidas — Dinheiro | ${fmtMD(s.totalCash)} |
| **Total fichas** | **${fmtMD(s.totalTokens)}** |
| Receita produtos | ${fmtMD(s.totalSales)} |
| Custo produtos | ${fmtMD(s.totalCost)} |
| Custos fixos | ${fmtMD(s.totalFixedCosts)} |
| **Lucro sessão atual** | **${fmtMD(s.totalProfit)}** |
| Lucro acumulado (fechamentos anteriores) | ${fmtMD(accumulatedProfit)} |
| **Lucro total do evento** | **${fmtMD(totalProfit)}** |
| Margem geral | ${pct(s.totalProfit, s.totalSales)} |
| Pedidos | ${s.salesCount} |
| Itens vendidos | ${s.totalItems} |

---

## 2. Custos Fixos do Evento

${fixedSection}
---

## 3. Vendas por Categoria e Produto
${salesSection}
---

## 4. Posição de Estoque
${stockNote}
${stockSection}
---

## 5. Controle Consignado

${consigSection}
---

## 6. Catálogo de Preços

${catalogSection}
---

_Relatório gerado pelo sistema Bar Caixa — ${store}_
`;

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `relatorio-${store.toLowerCase().replace(/\s+/g,'-')}-${now.toISOString().slice(0,10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    UI.toast('Relatório exportado!', 'success');
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
    const remaining = products.map(p => Math.max(0, p.stock || 0));
    const revenue   = products.map(p => +((p.soldQty || 0) * Math.max(0, (p.price || 0) - (p.costPrice || 0))).toFixed(2));

    this._inst = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Vendido',          data: sold,    backgroundColor: 'rgba(239,68,68,0.8)', borderColor: 'rgba(239,68,68,1)',   borderWidth: 1, stack: 'qty', yAxisID: 'y' },
          { label: 'Disponível',       data: remaining, backgroundColor: 'rgba(34,197,94,0.5)', borderColor: 'rgba(34,197,94,0.8)', borderWidth: 1, stack: 'qty', yAxisID: 'y' },
          { label: 'Lucro (R$)', data: revenue, type: 'line', yAxisID: 'y2',
            borderColor: 'rgba(251,191,36,0.9)', backgroundColor: 'rgba(251,191,36,0.15)',
            pointBackgroundColor: 'rgba(251,191,36,1)', pointRadius: 3, pointHoverRadius: 5,
            borderWidth: 2, tension: 0.3, fill: false }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true, ticks: { color: '#8888aa', font: { size: 11 }, maxRotation: 45 }, grid: { color: 'rgba(45,45,78,0.7)' } },
          y:  { stacked: true, position: 'left',  ticks: { color: '#8888aa' }, grid: { color: 'rgba(45,45,78,0.7)' }, beginAtZero: true, title: { display: true, text: 'Unidades', color: '#8888aa' } },
          y2: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false },
                ticks: { color: 'rgba(251,191,36,0.8)', callback: v => 'R$\u00a0' + v.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) },
                title: { display: true, text: 'Lucro (R$)', color: 'rgba(251,191,36,0.8)' } }
        },
        plugins: {
          legend: { labels: { color: '#e8e8f0' } },
          tooltip: {
            callbacks: {
              label(ctx) {
                if (ctx.dataset.label === 'Lucro (R$)') return ` Receita: R$ ${ctx.parsed.y.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
                return ` ${ctx.dataset.label}: ${ctx.parsed.y} un`;
              },
              footer(items) {
                const idx = items[0].dataIndex;
                const s = sold[idx] || 0;
                const r = remaining[idx] || 0;
                const total = s + r;
                if (total === 0) return '';
                return `${((s / total) * 100).toFixed(0)}% vendido`;
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
    if (tab === 'estoque')       this.renderEstoque();
    if (tab === 'almoxarifados') this.renderAlmoxTab();
    if (tab === 'caixa')         this.renderCaixa();
    if (tab === 'lucro')         this.renderLucro();
    if (tab === 'pdv')           this.renderPDVGrid();
    if (tab === 'produtos')      this.renderProductList();
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
      const activeStock = p.activeAlmoxId ? Stock.qty(p.id, p.activeAlmoxId) : p.stock;
      const almoxName   = p.activeAlmoxId ? (Almoxarifados.byId(p.activeAlmoxId)?.name || '') : '';
      const stockLabel  = activeStock <= 0
        ? '⚠ Sem estoque'
        : `${activeStock} un${almoxName ? ` · ${almoxName}` : ''}`;
      return `
      <div class="product-card ${activeStock <= 0 ? 'out' : ''}"
           style="border-left:4px solid ${color}"
           onclick="Sales.addToCart('${p.id}')">
        <div class="p-media">${media}</div>
        <div class="p-name">${esc(p.name)}</div>
        <div class="p-price" style="color:${color}">${fmt(p.price)}</div>
        <div class="p-stock">${stockLabel}</div>
      </div>`;
    }).join('');
  },

  // ── PRODUTOS ──
  _selectedCats: null, // null = todas
  _prodSort:    { col: 'name', dir: 1 }, // col: chave, dir: 1 asc / -1 desc
  _estoqueSort: { col: 'name', dir: 1 },
  _estoqueQuery: '',
  _estoqueCats: null, // null = todas

  toggleCatDropdown() {
    const dd = document.getElementById('cat-multiselect-dropdown');
    if (!dd) return;
    if (dd.classList.contains('hidden')) {
      this._buildCatOptions();
      dd.classList.remove('hidden');
    } else {
      dd.classList.add('hidden');
    }
  },

  _buildCatOptions() {
    const list = document.getElementById('cat-options-list');
    if (!list) return;
    const cats = Categories.all();
    const sel = this._selectedCats;
    list.innerHTML = cats.map(c => `
      <label class="multiselect-option">
        <input type="checkbox" value="${esc(c.name)}"
          ${!sel || sel.has(c.name) ? 'checked' : ''}
          onchange="UI._onCatCheck()">
        <span class="cat-badge" style="--cat-color:${c.color}">${c.icon} ${esc(c.name)}</span>
      </label>`).join('');
    const allChk = document.getElementById('cat-check-all');
    if (allChk) allChk.checked = !sel;
  },

  toggleAllCats(checked) {
    this._selectedCats = checked ? null : new Set();
    this._buildCatOptions();
    this._updateCatLabel();
    this.renderProductList();
  },

  _onCatCheck() {
    const checkboxes = document.querySelectorAll('#cat-options-list input[type=checkbox]');
    const checked = [...checkboxes].filter(cb => cb.checked).map(cb => cb.value);
    const allChk = document.getElementById('cat-check-all');
    if (checked.length === checkboxes.length) {
      this._selectedCats = null;
      if (allChk) allChk.checked = true;
    } else {
      this._selectedCats = new Set(checked);
      if (allChk) allChk.checked = false;
    }
    this._updateCatLabel();
    this.renderProductList();
  },

  _updateCatLabel() {
    const lbl = document.getElementById('cat-multiselect-label');
    if (!lbl) return;
    if (!this._selectedCats) {
      lbl.textContent = 'Todas as categorias';
    } else if (this._selectedCats.size === 0) {
      lbl.textContent = 'Nenhuma categoria';
    } else if (this._selectedCats.size === 1) {
      lbl.textContent = [...this._selectedCats][0];
    } else {
      lbl.textContent = `${this._selectedCats.size} categorias`;
    }
  },

  _sortProd(col) {
    if (this._prodSort.col === col) {
      this._prodSort.dir *= -1;
    } else {
      this._prodSort = { col, dir: 1 };
    }
    this.renderProductList();
  },

  _sortEstoque(col) {
    if (this._estoqueSort.col === col) {
      this._estoqueSort.dir *= -1;
    } else {
      this._estoqueSort = { col, dir: 1 };
    }
    this.renderEstoque();
  },

  _toggleEstoqueCatDropdown() {
    const dd = document.getElementById('estoque-cat-dropdown');
    if (!dd) return;
    if (dd.classList.contains('hidden')) {
      this._buildEstoqueCatOptions();
      dd.classList.remove('hidden');
    } else {
      dd.classList.add('hidden');
    }
  },

  _buildEstoqueCatOptions() {
    const list = document.getElementById('estoque-cat-options-list');
    if (!list) return;
    const cats = Categories.all();
    const sel = this._estoqueCats;
    list.innerHTML = cats.map(c => `
      <label class="multiselect-option">
        <input type="checkbox" value="${esc(c.name)}"
          ${!sel || sel.has(c.name) ? 'checked' : ''}
          onchange="UI._onEstoqueCatCheck()">
        <span class="cat-badge" style="--cat-color:${c.color}">${c.icon} ${esc(c.name)}</span>
      </label>`).join('');
    const allChk = document.getElementById('estoque-cat-check-all');
    if (allChk) allChk.checked = !sel;
  },

  _toggleAllEstoqueCats(checked) {
    this._estoqueCats = checked ? null : new Set();
    this._buildEstoqueCatOptions();
    this._updateEstoqueCatLabel();
    this.renderEstoque();
  },

  _onEstoqueCatCheck() {
    const checkboxes = document.querySelectorAll('#estoque-cat-options-list input[type=checkbox]');
    const checked = [...checkboxes].filter(cb => cb.checked).map(cb => cb.value);
    const allChk = document.getElementById('estoque-cat-check-all');
    if (checked.length === checkboxes.length) {
      this._estoqueCats = null;
      if (allChk) allChk.checked = true;
    } else {
      this._estoqueCats = new Set(checked);
      if (allChk) allChk.checked = false;
    }
    this._updateEstoqueCatLabel();
    this.renderEstoque();
  },

  _updateEstoqueCatLabel() {
    const lbl = document.getElementById('estoque-cat-label');
    if (!lbl) return;
    if (!this._estoqueCats) {
      lbl.textContent = 'Todas as categorias';
    } else if (this._estoqueCats.size === 0) {
      lbl.textContent = 'Nenhuma categoria';
    } else if (this._estoqueCats.size === 1) {
      lbl.textContent = [...this._estoqueCats][0];
    } else {
      lbl.textContent = `${this._estoqueCats.size} categorias`;
    }
  },

  renderProductList() {
    const el = document.getElementById('produtos-list');
    const prods = Products.all();
    if (prods.length === 0) {
      el.innerHTML = `<div class="empty-state">
        <span class="es-icon">📦</span>Nenhum produto.<br>Use "+ Novo Produto" ou "Importar CSV".
      </div>`;
      return;
    }
    const query = (document.getElementById('produtos-filter')?.value || '').trim().toLowerCase();
    const sel = this._selectedCats;
    const filtered = prods.filter(p => {
      if (sel && !sel.has(p.category || '')) return false;
      if (query && !p.name.toLowerCase().includes(query)) return false;
      return true;
    });
    if (filtered.length === 0) {
      el.innerHTML = `<div class="empty-state"><span class="es-icon">🔍</span>Nenhum produto encontrado para as categorias selecionadas.</div>`;
      return;
    }
    const { col, dir } = this._prodSort;
    const sorted = [...filtered].sort((a, b) => {
      let av, bv;
      if (col === 'name')      { av = a.name || '';               bv = b.name || '';               return dir * av.localeCompare(bv); }
      if (col === 'category')  { av = a.category || '';           bv = b.category || '';           return dir * av.localeCompare(bv); }
      if (col === 'costPrice') { av = a.costPrice || 0;           bv = b.costPrice || 0; }
      if (col === 'price')     { av = a.price || 0;               bv = b.price || 0; }
      if (col === 'stock')     { av = a.stock ?? 0;               bv = b.stock ?? 0; }
      if (col === 'soldQty')   { av = a.soldQty || 0;             bv = b.soldQty || 0; }
      if (col === 'rank')      { av = a.rank ?? 999;              bv = b.rank ?? 999; }
      return dir * (av - bv);
    });

    const th = (label, key) => {
      const active = col === key;
      const arrow  = active ? (dir === 1 ? ' ▲' : ' ▼') : '';
      return `<th class="sortable-th${active ? ' sort-active' : ''}" onclick="UI._sortProd('${key}')">${label}${arrow}</th>`;
    };

    const allAlmox = Almoxarifados.all();

    el.innerHTML = `<table class="data-table">
      <thead><tr>
        ${th('#','rank')}${th('Produto','name')}${th('Categoria','category')}
        ${th('Compra','costPrice')}${th('Venda','price')}
        ${th('Total','stock')}${th('Vendido','soldQty')}
        <th>Almox. Venda</th><th>Status</th><th>Ações</th>
      </tr></thead>
      <tbody>
        ${sorted.map(p => {
          const activeStock = p.activeAlmoxId ? Stock.qty(p.id, p.activeAlmoxId) : p.stock;
          const status = activeStock <= 0 ? ['badge-out','Sem estoque']
                       : activeStock <= 3 ? ['badge-low','Baixo']
                       : ['badge-ok','OK'];
          const color    = productColor(p);
          const catObj   = Categories.byName(p.category);
          const catIcon  = catObj ? catObj.icon  : '📦';
          const catColor = catObj ? catObj.color : '#4f46e5';
          const almoxName = p.activeAlmoxId ? (Almoxarifados.byId(p.activeAlmoxId)?.name || '—') : '—';
          // Mini-breakdown por almoxarifado
          const stocks = Stock.forProduct(p.id);
          const breakdown = stocks.length > 0
            ? stocks.map(ps => {
                const a = Almoxarifados.byId(ps.almoxarifadoId);
                return `<span style="font-size:0.72rem;color:var(--muted)">${a ? a.name : ps.almoxarifadoId}: ${ps.qty}</span>`;
              }).join(' · ')
            : `<span style="font-size:0.72rem;color:var(--muted)">—</span>`;
          return `<tr>
            <td style="color:var(--muted);font-size:0.8rem;text-align:center">${p.rank ?? 999}</td>
            <td>
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:6px;vertical-align:middle"></span>
              ${esc(p.name)}
              <div>${breakdown}</div>
            </td>
            <td><span class="cat-badge" style="--cat-color:${catColor}">${catIcon} ${esc(p.category || '-')}</span></td>
            <td>${p.costPrice ? fmt(p.costPrice) : '—'}</td>
            <td>${fmt(p.price)}</td>
            <td>${p.stock}</td>
            <td>${p.soldQty || 0}</td>
            <td style="font-size:0.8rem">${esc(almoxName)}</td>
            <td><span class="badge ${status[0]}">${status[1]}</span></td>
            <td style="white-space:nowrap;display:flex;gap:0.4rem">
              <button class="action-btn ab-edit"   onclick="UI.showProductForm('${p.id}')">✏ Editar</button>
              <button class="action-btn ab-stock"  onclick="UI.showStockAlmoxModal('${p.id}')">📦</button>
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

  // ── LUCRO ──
  renderLucro() {
    const data = DB.get();
    const s    = Reports.summary(data);
    const el   = document.getElementById('lucro-summary');

    const accumulatedProfit = data.cashRegister.accumulatedProfit || 0;
    const totalProfit       = s.totalProfit + accumulatedProfit;
    const fixedCosts        = FixedCosts.all();
    const totalFixedCosts   = s.totalFixedCosts;

    // Agrupa byProduct por categoria
    const cats = {};
    Object.entries(s.byProduct).forEach(([name, v]) => {
      const cat = v.category || 'Outro';
      if (!cats[cat]) cats[cat] = { qty: 0, cost: 0, revenue: 0, profit: 0, items: [] };
      const profit = v.total - v.cost;
      cats[cat].qty     += v.qty;
      cats[cat].cost    += v.cost;
      cats[cat].revenue += v.total;
      cats[cat].profit  += profit;
      cats[cat].items.push({ name, qty: v.qty, cost: v.cost, revenue: v.total, profit });
    });

    const catEntries = Object.entries(cats).sort((a, b) => b[1].revenue - a[1].revenue);

    const totalQtyAll     = catEntries.reduce((s, [, g]) => s + g.qty, 0);
    const totalCostAll    = catEntries.reduce((s, [, g]) => s + g.cost, 0);
    const totalRevenueAll = catEntries.reduce((s, [, g]) => s + g.revenue, 0);
    const totalProfitCur  = totalRevenueAll - totalCostAll - totalFixedCosts;

    const pct = (num, den) => den === 0 ? '—' : (num / den * 100).toFixed(1) + '%';

    const tableRows = catEntries.length === 0
      ? `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:1.5rem">Nenhuma venda nesta sessão.</td></tr>`
      : catEntries.map(([cat, g]) => {
          const prodRows = g.items
            .sort((a, b) => b.revenue - a.revenue)
            .map(i => `
              <tr class="lucro-prod-row">
                <td style="padding-left:1.5rem;color:var(--muted)">${esc(i.name)}</td>
                <td class="lucro-num">${i.qty}</td>
                <td class="lucro-num lucro-pct">${pct(i.qty, totalQtyAll)}</td>
                <td class="lucro-num">${fmt(i.cost)}</td>
                <td class="lucro-num">${fmt(i.revenue)}</td>
                <td class="lucro-num ${i.profit >= 0 ? 'lucro-pos' : 'lucro-neg'}">${fmt(i.profit)}</td>
                <td class="lucro-num lucro-pct">${pct(i.profit, i.revenue)}</td>
              </tr>`).join('');
          return `
            <tr class="lucro-cat-row">
              <td><strong>${esc(cat)}</strong></td>
              <td class="lucro-num"><strong>${g.qty}</strong></td>
              <td class="lucro-num lucro-pct"><strong>${pct(g.qty, totalQtyAll)}</strong></td>
              <td class="lucro-num"><strong>${fmt(g.cost)}</strong></td>
              <td class="lucro-num"><strong>${fmt(g.revenue)}</strong></td>
              <td class="lucro-num ${g.profit >= 0 ? 'lucro-pos' : 'lucro-neg'}"><strong>${fmt(g.profit)}</strong></td>
              <td class="lucro-num lucro-pct"><strong>${pct(g.profit, g.revenue)}</strong></td>
            </tr>
            ${prodRows}`;
        }).join('');

    // ── Linhas de custos fixos ──
    const fixedRows = fixedCosts.length === 0
      ? `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:1rem">Nenhum custo fixo cadastrado.</td></tr>`
      : fixedCosts.map(c => `
          <tr>
            <td>${esc(c.name)}</td>
            <td class="lucro-num">${c.qty}</td>
            <td class="lucro-num">${fmt(c.unitCost)}</td>
            <td class="lucro-num lucro-neg"><strong>${fmt(c.qty * c.unitCost)}</strong></td>
            <td style="white-space:nowrap;display:flex;gap:0.4rem">
              <button class="action-btn ab-edit"   onclick="UI.showFixedCostForm('${c.id}')">✏ Editar</button>
              <button class="action-btn ab-delete" onclick="FixedCosts.delete('${c.id}')">🗑</button>
            </td>
          </tr>`).join('');

    el.innerHTML = `
      <div class="cards-grid" style="margin-bottom:1.25rem">
        <div class="stat-card">
          <div class="sc-label">Receita produtos</div>
          <div class="sc-value">${fmt(totalRevenueAll)}</div>
        </div>
        <div class="stat-card">
          <div class="sc-label">Custo produtos</div>
          <div class="sc-value sc-danger">${fmt(totalCostAll)}</div>
        </div>
        <div class="stat-card">
          <div class="sc-label">Custos fixos</div>
          <div class="sc-value sc-danger">${fmt(totalFixedCosts)}</div>
        </div>
        <div class="stat-card">
          <div class="sc-label">Lucro desta sessão</div>
          <div class="sc-value ${totalProfitCur >= 0 ? 'sc-success' : 'sc-danger'}">${fmt(totalProfitCur)}</div>
        </div>
        <div class="stat-card">
          <div class="sc-label">Lucro acumulado (fechamentos)</div>
          <div class="sc-value ${accumulatedProfit >= 0 ? 'sc-success' : 'sc-danger'}">${fmt(accumulatedProfit)}</div>
        </div>
        <div class="stat-card">
          <div class="sc-label">Lucro total do evento</div>
          <div class="sc-value ${totalProfit >= 0 ? 'sc-success' : 'sc-danger'}">${fmt(totalProfit)}</div>
        </div>
      </div>

      <div class="report-section">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem">
          <h3 style="margin:0">Custos Fixos do Evento</h3>
          <button class="btn-primary" style="font-size:0.8rem;padding:0.35rem 0.8rem" onclick="UI.showFixedCostForm()">+ Adicionar</button>
        </div>
        <table class="data-table">
          <thead><tr>
            <th>Descrição</th>
            <th class="lucro-num">Qtd</th>
            <th class="lucro-num">Custo Unit.</th>
            <th class="lucro-num">Total</th>
            <th>Ações</th>
          </tr></thead>
          <tbody>${fixedRows}</tbody>
          ${fixedCosts.length > 0 ? `<tfoot><tr class="lucro-total-row">
            <td colspan="3"><strong>TOTAL CUSTOS FIXOS</strong></td>
            <td class="lucro-num lucro-neg"><strong>${fmt(totalFixedCosts)}</strong></td>
            <td></td>
          </tr></tfoot>` : ''}
        </table>
      </div>

      <div class="report-section">
        <h3>Sessão atual — por categoria</h3>
        <table class="data-table lucro-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th class="lucro-num">Qtd</th>
              <th class="lucro-num lucro-pct">% Qtd</th>
              <th class="lucro-num">Custo</th>
              <th class="lucro-num">Venda</th>
              <th class="lucro-num">Lucro</th>
              <th class="lucro-num lucro-pct">% Margem</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
          <tfoot>
            <tr class="lucro-total-row">
              <td><strong>Subtotal produtos</strong></td>
              <td class="lucro-num"><strong>${totalQtyAll}</strong></td>
              <td class="lucro-num lucro-pct"><strong>100%</strong></td>
              <td class="lucro-num"><strong>${fmt(totalCostAll)}</strong></td>
              <td class="lucro-num"><strong>${fmt(totalRevenueAll)}</strong></td>
              <td class="lucro-num lucro-pos"><strong>${fmt(totalRevenueAll - totalCostAll)}</strong></td>
              <td class="lucro-num lucro-pct"><strong>${pct(totalRevenueAll - totalCostAll, totalRevenueAll)}</strong></td>
            </tr>
            ${totalFixedCosts > 0 ? `<tr style="color:var(--muted);font-size:0.85rem">
              <td colspan="5" style="text-align:right;padding-right:1rem">(-) Custos fixos</td>
              <td class="lucro-num lucro-neg"><strong>${fmt(totalFixedCosts)}</strong></td>
              <td></td>
            </tr>` : ''}
            <tr class="lucro-total-row">
              <td><strong>LUCRO LÍQUIDO</strong></td>
              <td colspan="4"></td>
              <td class="lucro-num ${totalProfitCur >= 0 ? 'lucro-pos' : 'lucro-neg'}"><strong>${fmt(totalProfitCur)}</strong></td>
              <td class="lucro-num lucro-pct"><strong>${pct(totalProfitCur, totalRevenueAll)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  },

  // ── MODALS ──
  showFixedCostForm(id) {
    const c = id ? FixedCosts.all().find(x => x.id === id) : null;
    this.showModal(`
      <h2>${c ? 'Editar Custo Fixo' : 'Novo Custo Fixo'}</h2>
      <div class="form-group">
        <label>Descrição</label>
        <input id="fc-name" type="text" value="${c ? esc(c.name) : ''}" placeholder="Ex: Caixa térmica 360L">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Quantidade</label>
          <input id="fc-qty" type="number" min="1" step="1" value="${c ? c.qty : 1}">
        </div>
        <div class="form-group">
          <label>Custo unitário (R$)</label>
          <input id="fc-unit" type="number" min="0" step="0.01" value="${c ? c.unitCost : ''}">
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="UI._saveFixedCost('${c ? c.id : ''}')">Salvar</button>
      </div>`);
  },

  _saveFixedCost(id) {
    const name     = document.getElementById('fc-name').value.trim();
    const qty      = parseFloat(document.getElementById('fc-qty').value);
    const unitCost = parseFloat(document.getElementById('fc-unit').value);
    if (!name)              { this.toast('Informe a descrição!', 'warning'); return; }
    if (isNaN(qty) || qty <= 0)         { this.toast('Quantidade inválida!', 'warning'); return; }
    if (isNaN(unitCost) || unitCost < 0){ this.toast('Custo inválido!', 'warning'); return; }
    FixedCosts.save({ id: id || null, name, qty, unitCost });
    this.closeModal();
    this.toast('Custo fixo salvo!', 'success');
  },

  showProductForm(id) {
    const p        = id ? Products.byId(id) : null;
    const cats     = Categories.all();
    const almoxes  = Almoxarifados.all();
    const pCatKey  = (p?.category || '').toLowerCase().trim();
    const almoxOpts = almoxes.map(a => {
      const ti = Almoxarifados.typeInfo(a.type);
      return `<option value="${a.id}" ${p?.activeAlmoxId === a.id ? 'selected' : ''}>${ti.icon} ${esc(a.name)}</option>`;
    }).join('');

    const isNew = !p;
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
        <label>Almoxarifado de venda <span style="color:var(--muted);font-size:0.8rem">(de onde o PDV debita)</span></label>
        <select id="pf-almox">
          <option value="">— nenhum —</option>
          ${almoxOpts}
        </select>
      </div>
      ${isNew ? `
      <div class="form-row">
        <div class="form-group">
          <label>Estoque inicial (opcional)</label>
          <input id="pf-stock" type="number" min="0" placeholder="0">
        </div>
        <div class="form-group">
          <label>Almoxarifado de entrada</label>
          <select id="pf-stock-almox">
            <option value="">— mesmo da venda —</option>
            ${almoxes.map(a => {
              const ti = Almoxarifados.typeInfo(a.type);
              return `<option value="${a.id}">${ti.icon} ${esc(a.name)}</option>`;
            }).join('')}
          </select>
        </div>
      </div>` : ''}
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
    const name         = document.getElementById('pf-name').value.trim();
    const costPrice    = parseFloat(document.getElementById('pf-cost').value) || 0;
    const price        = parseFloat(document.getElementById('pf-price').value);
    const cat          = document.getElementById('pf-cat').value;
    const rank         = parseInt(document.getElementById('pf-rank').value) || 999;
    const activeAlmoxId = document.getElementById('pf-almox')?.value || null;

    if (!name || isNaN(price) || price < 0) {
      this.toast('Preencha nome e preço corretamente!', 'danger'); return;
    }

    const existing = id ? Products.byId(id) : null;
    const file     = document.getElementById('pf-image').files[0];
    const base     = existing
      ? { ...existing, name, costPrice, price, category: cat, rank, activeAlmoxId: activeAlmoxId || existing.activeAlmoxId || null }
      : { name, costPrice, price, category: cat, rank, activeAlmoxId: activeAlmoxId || null };

    const doSave = (imgData) => {
      const finalObj = imgData ? { ...base, image: imgData } : base;
      Products.save(finalObj);

      // Entrada de estoque inicial (apenas para novos produtos)
      if (!id) {
        const stockEl     = document.getElementById('pf-stock');
        const stockAlmoxEl = document.getElementById('pf-stock-almox');
        const qty         = stockEl ? (parseInt(stockEl.value) || 0) : 0;
        const entAlmoxId  = stockAlmoxEl?.value || activeAlmoxId;
        if (qty > 0 && entAlmoxId) {
          // Precisa do ID real do produto recém-criado
          const newProd = Products.all().find(p => p.name === name);
          if (newProd) Stock.entrada(newProd.id, entAlmoxId, qty, 'Estoque inicial');
        }
      }

      this.closeModal();
      this.toast('Produto salvo!', 'success');
    };

    if (file) compressImage(file).then(doSave);
    else doSave(null);
  },

  showStockAlmoxModal(id) {
    const p = Products.byId(id);
    if (!p) return;
    const almoxes = Almoxarifados.all();
    const stocks  = Stock.forProduct(id);

    const rows = almoxes.map(a => {
      const ps  = stocks.find(s => s.almoxarifadoId === a.id);
      const qty = ps ? ps.qty : 0;
      const ti  = Almoxarifados.typeInfo(a.type);
      const isActive = p.activeAlmoxId === a.id;
      return `<tr>
        <td>${ti.icon} ${esc(a.name)}${isActive ? ' <span style="font-size:0.7rem;color:var(--accent);font-weight:600">VENDA</span>' : ''}</td>
        <td style="text-align:center;font-weight:600">${qty}</td>
        <td style="white-space:nowrap;display:flex;gap:0.35rem;justify-content:flex-end;flex-wrap:wrap">
          <button class="action-btn ab-edit" onclick="UI.showEntradaModal('${id}','${a.id}')">+ Entrada</button>
          ${a.type === 'consignado' && qty > 0 ? `<button class="action-btn ab-delete" onclick="UI.showDevolucaoModal('${id}','${a.id}')">↩ Devolver</button>` : ''}
          <button class="action-btn ab-edit" onclick="UI.showAjusteModal('${id}','${a.id}')">✏ Ajuste</button>
        </td>
      </tr>`;
    }).join('');

    const noAlmox = almoxes.length === 0
      ? `<p style="color:var(--muted)">Nenhum almoxarifado cadastrado. Crie um na aba <strong>Almoxarifados</strong>.</p>`
      : '';

    this.showModal(`
      <h2>📦 Estoque — ${esc(p.name)}</h2>
      <p style="color:var(--muted);font-size:0.82rem;margin-bottom:1rem">
        Total: <strong>${p.stock}</strong> &nbsp;|&nbsp; Vendido: ${p.soldQty || 0}
      </p>
      ${noAlmox}
      ${almoxes.length > 0 ? `
      <table class="data-table" style="margin-bottom:1rem">
        <thead><tr><th>Almoxarifado</th><th style="text-align:center">Qtd</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>` : ''}
      <div class="modal-actions" style="gap:0.5rem;flex-wrap:wrap">
        <button class="btn-cancel" onclick="UI.closeModal()">Fechar</button>
        <button class="btn-secondary" onclick="UI.showTransferenciaModal('${id}')">⇄ Transferir</button>
      </div>`);
  },

  showImportCSV() {
    const almoxes = Almoxarifados.all();
    const almoxOpts = almoxes.map(a => {
      const ti = Almoxarifados.typeInfo(a.type);
      return `<option value="${a.id}">${ti.icon} ${esc(a.name)}</option>`;
    }).join('');
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
      ${almoxes.length > 0 ? `
      <div class="form-group">
        <label>Almoxarifado de destino do estoque</label>
        <select id="csv-almox">
          <option value="">— não definir agora —</option>
          ${almoxOpts}
        </select>
        <p style="font-size:0.75rem;color:var(--muted);margin-top:0.25rem">O estoque do CSV será lançado neste almoxarifado como "Entrada".</p>
      </div>` : ''}
      <div class="alert alert-warning">Produtos com nomes duplicados serão ignorados.</div>
      <div class="modal-actions">
        <button class="btn-cancel" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="UI._doImport()">Importar</button>
      </div>`);
  },

  _doImport() {
    const file     = document.getElementById('csv-file').files[0];
    const almoxSel = document.getElementById('csv-almox');
    const almoxId  = almoxSel ? almoxSel.value : '';
    if (!file) { this.toast('Selecione um arquivo!', 'warning'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const count = Products.importCSV(e.target.result, almoxId || null);
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

  // ── ESTOQUE ──
  renderEstoque() {
    const el = document.getElementById('estoque-content');
    if (!el) return;
    const almoxes  = Almoxarifados.all();
    const products = Products.all();
    const data     = DB.get();

    if (almoxes.length === 0) {
      el.innerHTML = `<div class="empty-state">
        <span class="es-icon">🏪</span>
        Nenhum almoxarifado cadastrado.<br>Crie um na aba <strong>Almoxarifados</strong> para começar.
      </div>`;
      return;
    }

    // Cards resumo por almoxarifado
    const cards = almoxes.map(a => {
      const ti   = Almoxarifados.typeInfo(a.type);
      const total = (data.productStocks || [])
        .filter(ps => ps.almoxarifadoId === a.id)
        .reduce((s, ps) => s + ps.qty, 0);
      const prods = new Set((data.productStocks || []).filter(ps => ps.almoxarifadoId === a.id && ps.qty > 0).map(ps => ps.productId)).size;
      return `<div class="stat-card">
        <div class="sc-label">${ti.icon} ${esc(a.name)}</div>
        <div class="sc-value sc-plain">${total} un</div>
        <div style="font-size:0.75rem;color:var(--muted);margin-top:0.25rem">${prods} produto(s)</div>
      </div>`;
    }).join('');

    // Agrega movimentos por produto para cálculo de Saldo
    const entradasByProd   = {};
    const devolucoesByProd = {};
    (data.stockMovements || []).forEach(m => {
      if (m.type === 'entrada')   entradasByProd[m.productId]   = (entradasByProd[m.productId]   || 0) + m.qty;
      if (m.type === 'devolucao') devolucoesByProd[m.productId] = (devolucoesByProd[m.productId] || 0) + m.qty;
    });

    // Aplica filtros de texto e categoria
    const esQuery = this._estoqueQuery.toLowerCase();
    const esSel   = this._estoqueCats;
    const filtered = products.filter(p => {
      if (esSel && !esSel.has(p.category || '')) return false;
      if (esQuery && !p.name.toLowerCase().includes(esQuery)) return false;
      return true;
    });

    // Pré-computa dados de cada produto para permitir ordenação por qualquer coluna
    const rows_data = filtered.map(p => {
      const devolvido   = devolucoesByProd[p.id] || 0;
      const totalEntrou = entradasByProd[p.id] || 0;
      const saldo       = Math.max(0, totalEntrou - (p.soldQty || 0) - devolvido);
      return { p, devolvido, saldo };
    });

    const { col: esCol, dir: esDir } = this._estoqueSort;
    rows_data.sort((a, b) => {
      if (esCol === 'name')      return esDir * (a.p.name || '').localeCompare(b.p.name || '');
      if (esCol === 'category')  return esDir * (a.p.category || '').localeCompare(b.p.category || '');
      if (esCol === 'soldQty')   return esDir * ((a.p.soldQty || 0) - (b.p.soldQty || 0));
      if (esCol === 'devolvido') return esDir * (a.devolvido - b.devolvido);
      if (esCol === 'saldo')     return esDir * (a.saldo - b.saldo);
      return 0;
    });

    const esTh = (label, key, extra = '') => {
      const active = esCol === key;
      const arrow  = active ? (esDir === 1 ? ' ▲' : ' ▼') : '';
      return `<th class="sortable-th${active ? ' sort-active' : ''}" onclick="UI._sortEstoque('${key}')"${extra}>${label}${arrow}</th>`;
    };

    const catLabelText = !esSel ? 'Todas as categorias'
      : esSel.size === 0 ? 'Nenhuma categoria'
      : esSel.size === 1 ? [...esSel][0]
      : `${esSel.size} categorias`;

    const filterBar = `
      <div class="produtos-filter-bar">
        <input id="estoque-filter" type="text" placeholder="Filtrar por nome…"
          value="${esc(this._estoqueQuery)}"
          oninput="UI._estoqueQuery=this.value;UI.renderEstoque()" autocomplete="off">
        <div class="multiselect-wrap" id="estoque-cat-wrap">
          <button type="button" class="multiselect-toggle" onclick="UI._toggleEstoqueCatDropdown()">
            <span id="estoque-cat-label">${catLabelText}</span>
            <span class="multiselect-arrow">▾</span>
          </button>
          <div class="multiselect-dropdown hidden" id="estoque-cat-dropdown">
            <label class="multiselect-option multiselect-all">
              <input type="checkbox" id="estoque-cat-check-all" ${!esSel ? 'checked' : ''}
                onchange="UI._toggleAllEstoqueCats(this.checked)"> Todas
            </label>
            <div id="estoque-cat-options-list"></div>
          </div>
        </div>
      </div>`;

    const headerCols = almoxes.map(a => `<th style="text-align:center">${esc(a.name)}</th>`).join('');
    const emptyMsg = filtered.length === 0
      ? `<tr><td colspan="99" style="text-align:center;color:var(--muted);padding:1.5rem">Nenhum produto encontrado.</td></tr>`
      : '';
    const rows = rows_data.map(({ p, devolvido, saldo }) => {
      const cols = almoxes.map(a => {
        const qty      = Stock.qty(p.id, a.id);
        const isActive = p.activeAlmoxId === a.id;
        const style    = isActive ? 'font-weight:700;color:var(--accent)' : qty === 0 ? 'color:var(--muted)' : '';
        return `<td style="text-align:center;${style}">${qty > 0 || isActive ? qty : '—'}${isActive ? '*' : ''}</td>`;
      }).join('');
      const status   = saldo <= 0 ? ['badge-out','Esgotado'] : saldo <= 3 ? ['badge-low','Baixo'] : ['badge-ok','OK'];
      const color    = productColor(p);
      const catObj   = Categories.byName(p.category);
      const catIcon  = catObj ? catObj.icon  : '📦';
      const catColor = catObj ? catObj.color : '#4f46e5';
      return `<tr>
        <td>
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:6px;vertical-align:middle"></span>
          <a href="#" style="color:inherit;text-decoration:underline dotted;cursor:pointer" onclick="event.preventDefault();UI.showStockAlmoxModal('${p.id}')">${esc(p.name)}</a>
        </td>
        <td><span class="cat-badge" style="--cat-color:${catColor}">${catIcon} ${esc(p.category || '-')}</span></td>
        ${cols}
        <td style="text-align:center">${p.soldQty||0}</td>
        <td style="text-align:center;color:${devolvido > 0 ? 'var(--warning)' : 'var(--muted)'}">${devolvido || '—'}</td>
        <td style="text-align:center;font-weight:700;color:${saldo <= 0 ? 'var(--danger)' : saldo <= 3 ? 'var(--warning)' : 'inherit'}">${saldo}</td>
        <td><span class="badge ${status[0]}">${status[1]}</span></td>
      </tr>`;
    }).join('');

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:0.5rem">
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
          <button class="btn-primary" onclick="UI.showEntradaModal()">+ Entrada</button>
          <button class="btn-secondary" onclick="UI.showTransferenciaModal()">⇄ Transferir</button>
          <button class="btn-secondary" onclick="UI.showDevolucaoModal()">↩ Devolver</button>
          <button class="btn-secondary" onclick="UI.showMovimentacoesModal()">📋 Movimentações</button>
          <button class="btn-secondary" onclick="UI.showRelatorioConsignadoModal()">📊 Consignado</button>
        </div>
      </div>

      <div class="cards-grid" style="margin-bottom:1.5rem">${cards}</div>

      ${filterBar}

      <div class="report-section">
        <h3>Estoque por Produto e Almoxarifado</h3>
        <p style="font-size:0.75rem;color:var(--muted);margin-bottom:0.75rem">* = almoxarifado de venda (PDV debita daqui)</p>
        <div style="overflow-x:auto">
          <table class="data-table">
            <thead><tr>
              ${esTh('Produto','name')}${esTh('Categoria','category')}
              ${headerCols}
              ${esTh('Vendido','soldQty',' style="text-align:center"')}
              ${esTh('Devolução','devolvido',' style="text-align:center"')}
              ${esTh('Saldo','saldo',' style="text-align:center"')}
              <th>Status</th>
            </tr></thead>
            <tbody>${emptyMsg || rows}</tbody>
          </table>
        </div>
      </div>

      <div class="report-section" style="margin-top:1.5rem">
        <h3>Gráfico de Estoque</h3>
        <div class="chart-container"><canvas id="stock-chart"></canvas></div>
      </div>`;

    Charts.render();

    // Restaura foco no campo de busca se o usuário estava digitando
    const filterInput = document.getElementById('estoque-filter');
    if (filterInput && this._estoqueQuery) {
      filterInput.focus();
      filterInput.setSelectionRange(filterInput.value.length, filterInput.value.length);
    }
  },

  // ── ALMOXARIFADOS TAB ──
  renderAlmoxTab() {
    const el = document.getElementById('almox-content');
    if (!el) return;
    const almoxes = Almoxarifados.all();
    const data    = DB.get();

    const rows = almoxes.map(a => {
      const ti    = Almoxarifados.typeInfo(a.type);
      const total = (data.productStocks || []).filter(ps => ps.almoxarifadoId === a.id).reduce((s, ps) => s + ps.qty, 0);
      const prods = new Set((data.productStocks || []).filter(ps => ps.almoxarifadoId === a.id && ps.qty > 0).map(ps => ps.productId)).size;
      return `<div style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem 1rem;
           background:var(--card);border:1px solid var(--border);border-radius:0.5rem;
           border-left:4px solid var(--accent)">
        <span style="font-size:1.4rem;flex-shrink:0">${ti.icon}</span>
        <div style="flex:1">
          <div style="font-weight:600">${esc(a.name)}</div>
          <div style="font-size:0.78rem;color:var(--muted)">${ti.name} · ${prods} produto(s) · ${total} unidades</div>
        </div>
        <button class="action-btn ab-edit"   onclick="UI.showAlmoxForm('${a.id}')">✏ Editar</button>
        <button class="action-btn ab-delete" onclick="Almoxarifados.delete('${a.id}')">🗑</button>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div class="section-header" style="margin-bottom:1rem">
        <h2>Almoxarifados</h2>
        <button class="btn-primary" onclick="UI.showAlmoxForm()">+ Novo</button>
      </div>
      ${almoxes.length === 0
        ? `<div class="empty-state"><span class="es-icon">🏪</span>Nenhum almoxarifado cadastrado.</div>`
        : `<div style="display:flex;flex-direction:column;gap:0.5rem">${rows}</div>`}
      <div style="margin-top:1.5rem">
        <button class="btn-secondary" onclick="UI.showMovimentacoesModal()">📋 Ver histórico de movimentações</button>
      </div>`;
  },

  showAlmoxList() {
    this.renderAlmoxTab();
  },

  showAlmoxForm(id) {
    const a = id ? Almoxarifados.byId(id) : null;
    const typeOpts = ALMOX_TYPES.map(t =>
      `<option value="${t.id}" ${a?.type === t.id ? 'selected' : ''}>${t.icon} ${t.name}</option>`
    ).join('');
    this.showModal(`
      <h2>${a ? 'Editar Almoxarifado' : 'Novo Almoxarifado'}</h2>
      <div class="form-group">
        <label>Nome</label>
        <input id="af-name" type="text" value="${a ? esc(a.name) : ''}" placeholder="Ex: Freezer Cerveja, Consignado">
      </div>
      <div class="form-group">
        <label>Tipo</label>
        <select id="af-type">${typeOpts}</select>
      </div>
      <div class="form-group">
        <label>Ordem de exibição</label>
        <input id="af-rank" type="number" min="1" max="999" value="${a?.rank ?? 999}">
      </div>
      <div class="modal-actions">
        <button class="btn-cancel" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="UI._saveAlmoxForm('${id||''}')">Salvar</button>
      </div>`);
  },

  _saveAlmoxForm(id) {
    const name = document.getElementById('af-name').value.trim();
    const type = document.getElementById('af-type').value;
    const rank = parseInt(document.getElementById('af-rank').value) || 999;
    if (!name) { this.toast('Informe o nome!', 'danger'); return; }
    Almoxarifados.save({ id: id || ('almox-' + uid()), name, type, rank });
    this.closeModal();
    this.toast('Almoxarifado salvo!', 'success');
    this.renderAlmoxTab();
  },

  showEntradaModal(productId, almoxId) {
    const products = Products.all();
    const almoxes  = Almoxarifados.all();
    if (almoxes.length === 0) { this.toast('Crie um almoxarifado primeiro!', 'warning'); return; }

    const defaultCost = productId ? (Products.byId(productId)?.costPrice ?? 0) : 0;
    const prodOpts = products.map(p =>
      `<option value="${p.id}" data-cost="${p.costPrice ?? 0}" ${p.id === productId ? 'selected' : ''}>${esc(p.name)}</option>`
    ).join('');
    const almoxOpts = almoxes.map(a => {
      const ti = Almoxarifados.typeInfo(a.type);
      return `<option value="${a.id}" ${a.id === almoxId ? 'selected' : ''}>${ti.icon} ${esc(a.name)}</option>`;
    }).join('');

    this.showModal(`
      <h2>+ Entrada de Estoque</h2>
      <div class="form-group">
        <label>Produto</label>
        <select id="en-prod" onchange="UI._updateEntradaCost()">${prodOpts}</select>
      </div>
      <div class="form-group">
        <label>Almoxarifado de destino</label>
        <select id="en-almox">${almoxOpts}</select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Quantidade</label>
          <input id="en-qty" type="number" min="1" value="1">
        </div>
        <div class="form-group">
          <label>Custo unitário (R$)</label>
          <input id="en-cost" type="number" min="0" step="0.01" value="${defaultCost.toFixed(2)}" placeholder="0,00">
        </div>
      </div>
      <div class="form-group">
        <label>Data / Hora</label>
        <input id="en-ts" type="datetime-local" value="${nowLocal()}">
      </div>
      <div class="form-group">
        <label>Observação (opcional)</label>
        <input id="en-note" type="text" placeholder="Ex: Entrega fornecedor 01/04">
      </div>
      <div class="modal-actions">
        <button class="btn-cancel" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="UI._saveEntrada()">Confirmar Entrada</button>
      </div>`);
  },

  _updateEntradaCost() {
    const sel  = document.getElementById('en-prod');
    const opt  = sel?.options[sel.selectedIndex];
    const cost = parseFloat(opt?.dataset?.cost || '0') || 0;
    const inp  = document.getElementById('en-cost');
    if (inp) inp.value = cost.toFixed(2);
  },

  _saveEntrada() {
    const pid      = document.getElementById('en-prod').value;
    const aid      = document.getElementById('en-almox').value;
    const qty      = parseInt(document.getElementById('en-qty').value);
    const unitCost = parseFloat(document.getElementById('en-cost').value) || 0;
    const note     = document.getElementById('en-note').value.trim();
    const ts       = localToISO(document.getElementById('en-ts').value);
    if (!pid || !aid || isNaN(qty) || qty <= 0) { this.toast('Preencha todos os campos!', 'danger'); return; }
    const ok = Stock.entrada(pid, aid, qty, note, unitCost, ts);
    if (!ok) { this.toast('Erro ao registrar entrada!', 'danger'); return; }
    this.closeModal();
    this.toast(`Entrada registrada!`, 'success');
    this.renderProductList();
    this.renderPDVGrid();
    if (this.currentTab === 'estoque') this.renderEstoque();
  },

  showTransferenciaModal(productId) {
    const products = Products.all();
    const almoxes  = Almoxarifados.all();
    if (almoxes.length < 2) { this.toast('Precisa de pelo menos 2 almoxarifados!', 'warning'); return; }

    const prodOpts = products.map(p =>
      `<option value="${p.id}" ${p.id === productId ? 'selected' : ''}>${esc(p.name)}</option>`
    ).join('');
    const almoxOpts = (sel) => almoxes.map(a => {
      const ti = Almoxarifados.typeInfo(a.type);
      return `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${ti.icon} ${esc(a.name)}</option>`;
    }).join('');

    const firstId  = almoxes[0]?.id || '';
    const secondId = almoxes[1]?.id || '';

    this.showModal(`
      <h2>⇄ Transferência de Estoque</h2>
      <div class="form-group">
        <label>Produto</label>
        <select id="tr-prod" onchange="UI._updateTransfDisp()">${prodOpts}</select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>De (origem)</label>
          <select id="tr-from" onchange="UI._updateTransfDisp()">${almoxOpts(firstId)}</select>
          <p id="tr-from-disp" style="font-size:0.78rem;color:var(--muted);margin-top:0.25rem"></p>
        </div>
        <div class="form-group">
          <label>Para (destino)</label>
          <select id="tr-to">${almoxOpts(secondId)}</select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Quantidade</label>
          <input id="tr-qty" type="number" min="1" value="1">
        </div>
        <div class="form-group">
          <label>Data / Hora</label>
          <input id="tr-ts" type="datetime-local" value="${nowLocal()}">
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn-cancel" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="UI._saveTransferencia()">Confirmar</button>
      </div>`,
      () => this._updateTransfDisp()
    );
  },

  _updateTransfDisp() {
    const pid = document.getElementById('tr-prod')?.value;
    const aid = document.getElementById('tr-from')?.value;
    const el  = document.getElementById('tr-from-disp');
    if (!el || !pid || !aid) return;
    const qty = Stock.qty(pid, aid);
    el.textContent = `Disponível: ${qty} un`;
  },

  _saveTransferencia() {
    const pid = document.getElementById('tr-prod').value;
    const fid = document.getElementById('tr-from').value;
    const tid = document.getElementById('tr-to').value;
    const qty = parseInt(document.getElementById('tr-qty').value);
    const ts  = localToISO(document.getElementById('tr-ts').value);
    if (fid === tid) { this.toast('Origem e destino são iguais!', 'danger'); return; }
    if (!pid || !fid || !tid || isNaN(qty) || qty <= 0) { this.toast('Preencha todos os campos!', 'danger'); return; }
    const available = Stock.qty(pid, fid);
    if (qty > available) { this.toast(`Estoque insuficiente na origem (${available} un)!`, 'danger'); return; }
    const ok = Stock.transferir(pid, fid, tid, qty, ts);
    if (!ok) { this.toast('Erro na transferência!', 'danger'); return; }
    this.closeModal();
    this.toast('Transferência realizada!', 'success');
    this.renderProductList();
    this.renderPDVGrid();
    if (this.currentTab === 'estoque') this.renderEstoque();
  },

  showDevolucaoModal(productId, almoxId) {
    const products  = Products.all();
    const almoxes   = Almoxarifados.all().filter(a => a.type === 'consignado');
    if (almoxes.length === 0) { this.toast('Nenhum almoxarifado do tipo Consignado!', 'warning'); return; }

    const defaultPid  = productId  || products[0]?.id  || '';
    const defaultAid  = almoxId    || almoxes[0]?.id   || '';
    const defaultQty  = productId && almoxId ? Stock.qty(productId, almoxId) : 0;

    const prodOpts  = products.map(p =>
      `<option value="${p.id}" ${p.id === defaultPid ? 'selected' : ''}>${esc(p.name)}</option>`
    ).join('');
    const almoxOpts = almoxes.map(a =>
      `<option value="${a.id}" ${a.id === defaultAid ? 'selected' : ''}>${esc(a.name)}</option>`
    ).join('');

    this.showModal(`
      <h2>↩ Devolução ao Fornecedor</h2>
      <p style="color:var(--muted);font-size:0.82rem;margin-bottom:1rem">
        Remove itens do consignado sem destino interno — registra devolução ao fornecedor.
      </p>
      <div class="form-group">
        <label>Produto</label>
        <select id="dv-prod" onchange="UI._updateDevolDisp()">${prodOpts}</select>
      </div>
      <div class="form-group">
        <label>Almoxarifado consignado de origem</label>
        <select id="dv-almox" onchange="UI._updateDevolDisp()">${almoxOpts}</select>
        <p id="dv-disp" style="font-size:0.78rem;color:var(--muted);margin-top:0.25rem">Disponível: ${defaultQty} un</p>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Quantidade devolvida</label>
          <input id="dv-qty" type="number" min="1" value="1">
        </div>
        <div class="form-group">
          <label>Data / Hora</label>
          <input id="dv-ts" type="datetime-local" value="${nowLocal()}">
        </div>
      </div>
      <div class="form-group">
        <label>Observação (opcional)</label>
        <input id="dv-note" type="text" placeholder="Ex: Devolução pós-evento 08/04">
      </div>
      <div class="modal-actions">
        <button class="btn-cancel" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="UI._saveDevolucao()">Confirmar Devolução</button>
      </div>`,
      () => this._updateDevolDisp()
    );
  },

  _updateDevolDisp() {
    const pid = document.getElementById('dv-prod')?.value;
    const aid = document.getElementById('dv-almox')?.value;
    const el  = document.getElementById('dv-disp');
    if (!el || !pid || !aid) return;
    el.textContent = `Disponível: ${Stock.qty(pid, aid)} un`;
  },

  _saveDevolucao() {
    const pid  = document.getElementById('dv-prod').value;
    const aid  = document.getElementById('dv-almox').value;
    const qty  = parseInt(document.getElementById('dv-qty').value);
    const note = document.getElementById('dv-note').value.trim();
    const ts   = localToISO(document.getElementById('dv-ts').value);
    if (!pid || !aid || isNaN(qty) || qty <= 0) { this.toast('Preencha todos os campos!', 'danger'); return; }
    const available = Stock.qty(pid, aid);
    if (qty > available) { this.toast(`Estoque insuficiente na origem (${available} un)!`, 'danger'); return; }
    const ok = Stock.devolver(pid, aid, qty, note, ts);
    if (!ok) { this.toast('Erro ao registrar devolução!', 'danger'); return; }
    this.closeModal();
    this.toast('Devolução registrada!', 'success');
    this.renderProductList();
    this.renderPDVGrid();
    if (this.currentTab === 'estoque') this.renderEstoque();
  },

  deleteMovimentacao(id) {
    const data = DB.get();
    const m    = (data.stockMovements || []).find(x => x.id === id);
    if (!m) return;
    const typeLabel = { entrada: 'Entrada', transferencia: 'Transferência', devolucao: 'Devolução', ajuste: 'Ajuste' };
    const label = typeLabel[m.type] || m.type;
    if (!confirm(`Excluir movimentação "${label}" de ${m.qty} un de "${m.productName}"?\n\nO efeito no estoque será revertido.`)) return;
    const ok = Stock.deleteMovement(id);
    if (!ok) { this.toast('Não é possível excluir movimentações de venda aqui.', 'warning'); return; }
    this.toast('Movimentação excluída e estoque revertido.', 'success');
    this.renderProductList();
    this.renderPDVGrid();
    if (this.currentTab === 'estoque') this.renderEstoque();
    this.showMovimentacoesModal(); // reabre atualizado
  },

  showEditMovimentacaoModal(id) {
    const data = DB.get();
    const m    = (data.stockMovements || []).find(x => x.id === id);
    if (!m || m.type === 'venda') return;
    const typeLabel = { entrada: 'Entrada', transferencia: 'Transferência', devolucao: 'Devolução', ajuste: 'Ajuste' };
    const tsLocal   = new Date(m.ts).toISOString().slice(0, 16); // para datetime-local
    this.showModal(`
      <h2>✏ Editar Movimentação</h2>
      <p style="color:var(--muted);font-size:0.82rem;margin-bottom:1rem">
        <strong>${typeLabel[m.type] || m.type}</strong> · ${esc(m.productName)} · ${m.qty} un
      </p>
      <div class="form-group">
        <label>Data / Hora</label>
        <input id="em-ts" type="datetime-local" value="${tsLocal}">
      </div>
      <div class="form-group">
        <label>Observação</label>
        <input id="em-note" type="text" value="${esc(m.note||'')}">
      </div>
      <div class="modal-actions">
        <button class="btn-cancel" onclick="UI.showMovimentacoesModal()">Cancelar</button>
        <button class="btn-primary" onclick="UI._saveEditMovimentacao('${id}')">Salvar</button>
      </div>`);
  },

  _saveEditMovimentacao(id) {
    const ts   = localToISO(document.getElementById('em-ts').value);
    const note = document.getElementById('em-note').value.trim();
    Stock.updateMovement(id, { ts, note });
    this.toast('Movimentação atualizada.', 'success');
    this.showMovimentacoesModal(); // reabre atualizado
  },

  showAjusteModal(productId, almoxId) {
    const p = Products.byId(productId);
    const a = Almoxarifados.byId(almoxId);
    if (!p || !a) return;
    const current = Stock.qty(productId, almoxId);
    this.showModal(`
      <h2>✏ Ajuste de Estoque</h2>
      <p style="color:var(--muted);font-size:0.82rem;margin-bottom:1rem">${esc(p.name)} — ${esc(a.name)}</p>
      <div class="form-group">
        <label>Quantidade atual</label>
        <input id="aj-qty" type="number" min="0" value="${current}">
      </div>
      <div class="form-group">
        <label>Motivo do ajuste (opcional)</label>
        <input id="aj-note" type="text" placeholder="Ex: Contagem física, perda, devolução">
      </div>
      <div class="modal-actions">
        <button class="btn-cancel" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="UI._saveAjuste('${productId}','${almoxId}')">Confirmar</button>
      </div>`);
  },

  _saveAjuste(productId, almoxId) {
    const newQty = parseInt(document.getElementById('aj-qty').value);
    const note   = document.getElementById('aj-note').value.trim() || 'Ajuste manual';
    if (isNaN(newQty) || newQty < 0) { this.toast('Quantidade inválida!', 'danger'); return; }
    Stock.ajustar(productId, almoxId, newQty, note);
    this.closeModal();
    this.toast('Estoque ajustado!', 'success');
    this.renderProductList();
    this.renderPDVGrid();
    if (this.currentTab === 'estoque') this.renderEstoque();
  },

  showMovimentacoesModal(sortCol = 'ts', sortDir = 'desc') {
    const data      = DB.get();
    const movements = (data.stockMovements || []).slice(0, 200); // últimas 200

    // Ordenação por coluna
    const sortFn = {
      ts:      (a, b) => (a.ts || '').localeCompare(b.ts || ''),
      type:    (a, b) => (a.type || '').localeCompare(b.type || ''),
      product: (a, b) => (a.productName || '').localeCompare(b.productName || ''),
      qty:     (a, b) => (a.qty || 0) - (b.qty || 0),
    };
    const cmp = sortFn[sortCol] || sortFn.ts;
    movements.sort((a, b) => sortDir === 'asc' ? cmp(a, b) : cmp(b, a));

    const arrow = (col) => {
      if (col !== sortCol) return '';
      return sortDir === 'asc' ? ' ▲' : ' ▼';
    };
    const nextDir = (col) => col === sortCol && sortDir === 'asc' ? 'desc' : 'asc';

    const typeLabel = {
      entrada:       { icon: '⬇', label: 'Entrada',       cls: 'badge-ok' },
      transferencia: { icon: '⇄', label: 'Transferência', cls: 'badge-low' },
      venda:         { icon: '🛒', label: 'Venda',         cls: 'badge-out' },
      devolucao:     { icon: '↩', label: 'Devolução',     cls: 'badge-out' },
      ajuste:        { icon: '✏', label: 'Ajuste',        cls: '' },
    };

    const rows = movements.map(m => {
      const tl   = typeLabel[m.type] || { icon: '•', label: m.type, cls: '' };
      const date = new Date(m.ts).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
      const flow = m.type === 'venda'
        ? `<span style="color:var(--muted)">${m.fromAlmoxName || '—'} → PDV</span>`
        : m.type === 'entrada'
        ? `<span style="color:var(--muted)">Fornecedor → ${m.toAlmoxName || '—'}</span>`
        : m.type === 'devolucao'
        ? `<span style="color:var(--muted)">${m.fromAlmoxName || '—'} → Fornecedor</span>`
        : `<span style="color:var(--muted)">${m.fromAlmoxName || '—'} → ${m.toAlmoxName || '—'}</span>`;
      const custo = (m.unitCost && m.unitCost > 0)
        ? `<span style="font-size:0.75rem;color:var(--muted)">${fmt(m.unitCost * m.qty)}</span>`
        : '—';
      const canEdit = m.type !== 'venda';
      const actions = canEdit
        ? `<div style="display:flex;gap:0.3rem;justify-content:flex-end">
             <button class="action-btn ab-edit"   onclick="UI.showEditMovimentacaoModal('${m.id}')"  title="Editar data/hora e observação">✏</button>
             <button class="action-btn ab-delete" onclick="UI.deleteMovimentacao('${m.id}')"          title="Excluir e reverter estoque">🗑</button>
           </div>`
        : '<span style="font-size:0.72rem;color:var(--muted)">PDV</span>';
      return `<tr>
        <td style="color:var(--muted);font-size:0.78rem;white-space:nowrap">${date}</td>
        <td><span class="badge ${tl.cls}" style="font-size:0.72rem">${tl.icon} ${tl.label}</span></td>
        <td>${esc(m.productName)}</td>
        <td style="text-align:center;font-weight:600">${m.qty}</td>
        <td>${custo}</td>
        <td>${flow}</td>
        <td style="color:var(--muted);font-size:0.78rem">${esc(m.note||'')}</td>
        <td>${actions}</td>
      </tr>`;
    }).join('');

    this.showModal(`
      <h2>📋 Histórico de Movimentações</h2>
      ${movements.length === 0
        ? '<p style="color:var(--muted)">Nenhuma movimentação registrada.</p>'
        : `<div style="overflow-x:auto;max-height:60vh;overflow-y:auto">
            <table class="data-table" style="font-size:0.82rem">
              <thead><tr>
                <th style="cursor:pointer" onclick="UI.showMovimentacoesModal('ts','${nextDir('ts')}')">Data/Hora${arrow('ts')}</th>
                <th style="cursor:pointer" onclick="UI.showMovimentacoesModal('type','${nextDir('type')}')">Tipo${arrow('type')}</th>
                <th style="cursor:pointer" onclick="UI.showMovimentacoesModal('product','${nextDir('product')}')">Produto${arrow('product')}</th>
                <th style="text-align:center;cursor:pointer" onclick="UI.showMovimentacoesModal('qty','${nextDir('qty')}')">Qtd${arrow('qty')}</th>
                <th>Valor custo</th><th>Fluxo</th><th>Obs.</th><th></th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`}
      <div class="modal-actions">
        <button class="btn-primary" onclick="UI.closeModal()">Fechar</button>
      </div>`, null, 'modal-wide');
  },

  showRelatorioConsignadoModal() {
    const data     = DB.get();
    const almoxes  = data.almoxarifados || [];
    const prodMap  = {};
    (data.products || []).forEach(p => { prodMap[p.id] = p; });

    const consignadoIds = new Set(almoxes.filter(a => a.type === 'consignado').map(a => a.id));
    const freezerIds    = new Set(almoxes.filter(a => a.type === 'freezer').map(a => a.id));

    // Acumula por produto
    const byProd = {};
    const get = (pid, name) => {
      if (!byProd[pid]) byProd[pid] = { name, qtdEntrada: 0, valorEntrada: 0, qtdDevolvido: 0, valorDevolvido: 0, valorVendido: 0, saldoConsignado: 0, saldoFreezer: 0 };
      return byProd[pid];
    };

    (data.stockMovements || []).forEach(m => {
      const unitCost = m.unitCost || prodMap[m.productId]?.costPrice || 0;
      if (m.type === 'entrada' && consignadoIds.has(m.toAlmoxId)) {
        const r = get(m.productId, m.productName);
        r.qtdEntrada   += m.qty;
        r.valorEntrada += m.qty * unitCost;
      } else if (m.type === 'devolucao') {
        const r = get(m.productId, m.productName);
        r.qtdDevolvido   += m.qty;
        r.valorDevolvido += m.qty * unitCost;
      }
    });

    // Saldo atual nos almoxarifados
    (data.productStocks || []).forEach(ps => {
      const r = byProd[ps.productId];
      if (!r) return;
      const unitCost = prodMap[ps.productId]?.costPrice || 0;
      if (consignadoIds.has(ps.almoxarifadoId)) r.saldoConsignado += ps.qty;
      if (freezerIds.has(ps.almoxarifadoId))    r.saldoFreezer    += ps.qty;
    });

    // Valor vendido (das vendas PDV)
    (data.sales || []).forEach(sale => {
      (sale.items || []).forEach(i => {
        if (byProd[i.pid]) byProd[i.pid].valorVendido += i.price * i.qty;
      });
    });

    const items = Object.values(byProd).filter(r => r.qtdEntrada > 0 || r.qtdDevolvido > 0);
    if (items.length === 0) {
      this.showModal(`
        <h2>📊 Relatório Consignado</h2>
        <p style="color:var(--muted)">Nenhuma entrada consignada registrada ainda.</p>
        <p style="font-size:0.82rem;color:var(--muted)">Use "+ Entrada" em um almoxarifado do tipo <strong>Consignado</strong> para começar.</p>
        <div class="modal-actions"><button class="btn-primary" onclick="UI.closeModal()">Fechar</button></div>`);
      return;
    }

    const totEntrada   = items.reduce((s, r) => s + r.valorEntrada, 0);
    const totDevolvido = items.reduce((s, r) => s + r.valorDevolvido, 0);
    const totVendido   = items.reduce((s, r) => s + r.valorVendido, 0);
    const totSaldoCons = items.reduce((s, r) => s + r.saldoConsignado, 0);
    const totSaldoFrz  = items.reduce((s, r) => s + r.saldoFreezer, 0);

    const rows = items.sort((a, b) => b.valorEntrada - a.valorEntrada).map(r => `
      <tr>
        <td>${esc(r.name)}</td>
        <td style="text-align:center">${r.qtdEntrada}</td>
        <td style="text-align:right">${fmt(r.valorEntrada)}</td>
        <td style="text-align:center">${r.qtdDevolvido || '—'}</td>
        <td style="text-align:right">${r.qtdDevolvido ? fmt(r.valorDevolvido) : '—'}</td>
        <td style="text-align:right">${r.valorVendido ? fmt(r.valorVendido) : '—'}</td>
        <td style="text-align:center;color:${r.saldoConsignado > 0 ? 'var(--warning)' : 'var(--muted)'}">${r.saldoConsignado || '—'}</td>
        <td style="text-align:center;color:${r.saldoFreezer > 0 ? 'var(--warning)' : 'var(--muted)'}">${r.saldoFreezer || '—'}</td>
      </tr>`).join('');

    this.showModal(`
      <h2>📊 Relatório Consignado</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:0.75rem;margin-bottom:1.25rem">
        <div class="stat-card"><div class="stat-label">Entrada consignada</div><div class="stat-value">${fmt(totEntrada)}</div></div>
        <div class="stat-card"><div class="stat-label">Devolvido</div><div class="stat-value">${fmt(totDevolvido)}</div></div>
        <div class="stat-card"><div class="stat-label">Vendido (PDV)</div><div class="stat-value">${fmt(totVendido)}</div></div>
        <div class="stat-card"><div class="stat-label">Saldo consignado</div><div class="stat-value" style="color:${totSaldoCons > 0 ? 'var(--warning)' : 'inherit'}">${totSaldoCons} un</div></div>
        <div class="stat-card"><div class="stat-label">Saldo freezers</div><div class="stat-value" style="color:${totSaldoFrz > 0 ? 'var(--warning)' : 'inherit'}">${totSaldoFrz} un</div></div>
      </div>
      <div style="overflow-x:auto;max-height:55vh;overflow-y:auto">
        <table class="data-table" style="font-size:0.8rem">
          <thead><tr>
            <th>Produto</th>
            <th style="text-align:center">Qtd entrada</th>
            <th style="text-align:right">Valor entrada</th>
            <th style="text-align:center">Qtd devolvido</th>
            <th style="text-align:right">Valor devolvido</th>
            <th style="text-align:right">Valor vendido</th>
            <th style="text-align:center">Saldo consig.</th>
            <th style="text-align:center">Saldo freezer</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="modal-actions">
        <button class="btn-primary" onclick="UI.closeModal()">Fechar</button>
      </div>`);
  },

  // ── MODAL helpers ──
  showModal(html, afterRender, extraClass) {
    const mc = document.getElementById('modal-content');
    mc.classList.remove('modal-wide');
    if (extraClass) mc.classList.add(extraClass);
    mc.innerHTML = html;
    document.getElementById('modal-overlay').classList.remove('hidden');
    if (afterRender) setTimeout(afterRender, 60);
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
  },

  overlayClick(e) {
    // Clique fora não fecha o modal — evita perda de dados em edição
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
  const fromServer = await DB.loadFromServer();
  if (!fromServer) {
    console.warn('Servidor indisponível — app em modo somente-leitura');
    UI.toast('Servidor indisponível! Verifique se o servidor está rodando.', 'danger');
  }

  document.getElementById('store-name').textContent = DB.get().settings.storeName;
  Sales._renderCart();
  UI.renderPDVGrid();
  UI.showTab('fichas');

  // Fecha dropdowns de categorias ao clicar fora
  document.addEventListener('click', e => {
    const wrap = document.getElementById('cat-multiselect-wrap');
    const dd   = document.getElementById('cat-multiselect-dropdown');
    if (wrap && dd && !wrap.contains(e.target)) dd.classList.add('hidden');

    const esWrap = document.getElementById('estoque-cat-wrap');
    const esDd   = document.getElementById('estoque-cat-dropdown');
    if (esWrap && esDd && !esWrap.contains(e.target)) esDd.classList.add('hidden');
  });

  // Garante que o estado (incluindo ranks) seja persistido antes de fechar/recarregar
  window.addEventListener('beforeunload', () => DB.flushSync());
});
