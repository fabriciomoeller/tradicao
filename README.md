# Tradição

Conjunto de aplicações web para eventos e estabelecimentos, com ferramentas para geração de etiquetas e gestão de PDV.

## 📂 Projetos

### 1. **Gerador de Etiquetas** (`label-generator/`)

Aplicativo web para criar e imprimir etiquetas personalizadas em papel A4.

**Características:**
- Frontend puro (HTML + CSS + JavaScript)
- Tickets de dinheiro, etiquetas de preço, rifas
- Imagem de fundo personalizável com controle de opacidade e zoom
- Fontes otimizadas para números (Oswald, Bebas Neue, Roboto Condensed, DM Mono)
- Visualização em tempo real
- Paginação automática para impressão

**Como usar:**
```bash
# Abrir diretamente no navegador
open label-generator/index.html

# Ou servir com qualquer servidor estático
cd label-generator
python -m http.server 8000
# Acesse http://localhost:8000
```

**Exemplos inclusos:**
- `exemplo-festa-junina.json` — Tickets para festa com 4 valores
- `exemplo-nasrudin.json` — Histórias de Nasrudin com 6 valores e opacidade 0.8

📖 [Documentação completa](label-generator/README.md)

---

### 2. **Bar Caixa** (`bar-caixa/`)

PDV (Ponto de Venda) moderno para bares, com controle de estoque e caixa.

**Características:**
- Node.js + Express + SQLite
- API REST para gestão de estado
- Banco de dados persistente com `better-sqlite3`
- Seed automático a partir de CSVs
- Interface web responsiva
- Relatórios de vendas

**Como usar:**
```bash
cd bar-caixa

# Primeira execução
npm install

# Produção
npm start

# Desenvolvimento (watch mode)
npm run dev
```

**Configuração:**
- Porta padrão: 3000 (configurável com `PORT=8080 npm start`)
- Banco de dados: `bar-caixa.db` (gerado automaticamente)
- CSV de seed: `nota_de_vinho.csv` e `nota_de_bebida prática.csv` (na raiz)

**API Endpoints:**
- `GET /api/state` — Estado atual do caixa
- `POST /api/state` — Atualizar estado
- `GET /api/report` — Relatório de vendas

📖 [Documentação específica](bar-caixa/README.md) *(em desenvolvimento)*

---

## 📋 Estrutura do Repositório

```
Tradicao/
├── label-generator/
│   ├── index.html
│   ├── script.js
│   ├── styles.css
│   ├── imagem/nasrudin.jpeg
│   ├── exemplo-festa-junina.json
│   ├── exemplo-nasrudin.json
│   ├── README.md
│   └── ...
├── bar-caixa/
│   ├── server.js
│   ├── index.html
│   ├── package.json
│   ├── bar-caixa.db (gerado)
│   └── ...
├── nota_de_vinho.csv
├── nota_de_bebida prática.csv
└── README.md (este arquivo)
```

---

## 🚀 Início Rápido

### Apenas Etiquetas
```bash
# Abrir no navegador
open label-generator/index.html
```

### Apenas PDV
```bash
cd bar-caixa
npm install
npm start
# Acesse http://localhost:3000
```

### Ambos os Projetos
```bash
# Terminal 1: Gerador de Etiquetas (servidor estático)
cd label-generator
python -m http.server 8000

# Terminal 2: Bar Caixa
cd bar-caixa
npm install
npm start

# Acesse:
# - Etiquetas: http://localhost:8000
# - PDV: http://localhost:3000
```

---

## 💡 Casos de Uso

### Festa Junina / Festas Beneficentes
1. Use o **Gerador de Etiquetas** com `exemplo-festa-junina.json`
2. Configure valores de ingressos (R$ 2, 5, 10, 20)
3. Imprima os tickets para venda

### Bares e Restaurantes
1. Configure estoque no **Bar Caixa**
2. Use o sistema de PDV para vendas
3. Gere relatórios de caixa
4. Opcionalmente, crie etiquetas de preço com o **Gerador**

### Eventos Corporativos
1. Combine ambos: gere etiquetas para entrada/cashless
2. Use o PDV para controlar vendas de bebidas/comidas
3. Gere relatório integrado

---

## 🔧 Requisitos

### Gerador de Etiquetas
- Navegador web moderno (Chrome, Firefox, Safari, Edge)
- Impressora A4

### Bar Caixa
- Node.js 14+
- npm ou yarn
- Impressora (opcional, para cupons)

---

## 📝 Convenções

- **Idioma**: Português Brasileiro
- **Frontend**: Vanilla JavaScript (sem frameworks)
- **Backend**: Express.js + SQLite
- **Banco de dados**: SQLite com `better-sqlite3` (sem migrations externas)
- **Separadores CSV**: `;` (ponto e vírgula)

---

## 🤝 Contribuindo

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/minha-feature`)
3. Commit suas mudanças (`git commit -am 'Adiciona minha feature'`)
4. Push para a branch (`git push origin feature/minha-feature`)
5. Abra um Pull Request

---

## 📄 Licença

Este projeto é de código aberto. Use livremente para fins pessoais e comerciais.

---

## 🆘 Suporte

**Problemas com Gerador de Etiquetas:**
- Consulte [label-generator/README.md](label-generator/README.md)

**Problemas com Bar Caixa:**
- Verifique a configuração do Node.js e npm
- Confirme que a porta 3000 está disponível
- Verifique permissões de arquivo para `bar-caixa.db`

---

**Desenvolvido com ❤️ para facilitar a gestão de eventos e estabelecimentos**
