# Tradição

Repositório com duas aplicações independentes para eventos/festas:

## Estrutura

```
Tradicao/
├── label-generator/                    # App 1: Gerador de Etiquetas (frontend puro)
│   ├── index.html, script.js, styles.css
│   └── imagem/nasrudin.jpeg            # Imagem de fundo padrão das etiquetas
├── bar-caixa/                          # App 2: PDV Bar/Caixa (Node.js + Express + SQLite)
│   ├── server.js                       # Servidor Express com API REST e SQLite (better-sqlite3)
│   ├── index.html                      # Frontend do PDV
│   └── bar-caixa.db                    # Banco SQLite (gerado automaticamente)
├── nota_de_vinho.csv                   # CSV de vinhos (seed do bar-caixa)
└── nota_de_bebida prática.csv          # CSV de bebidas (seed do bar-caixa)
```

## App 1: Gerador de Etiquetas

- **Frontend puro** (HTML + CSS + JS), sem dependências de backend
- Gera etiquetas para impressão em papel A4 (tickets de dinheiro, preços, rifas)
- Pode ser aberto diretamente no navegador ou servido por qualquer servidor web estático

## App 2: Bar Caixa (PDV)

- **Node.js + Express + better-sqlite3**
- Requer `node` para rodar (`cd bar-caixa && npm start`)
- Porta padrão: 3000 (configurável via `PORT` env var)
- Seed automático a partir dos CSVs na raiz na primeira execução
- API: `GET /api/state`, `POST /api/state`, `GET /api/report`

## Comandos

```bash
# Gerador de Etiquetas — abrir diretamente
open label-generator/index.html
# ou servir com qualquer servidor estático

# Bar Caixa
cd bar-caixa
npm install        # primeira vez
npm start          # produção (node server.js)
npm run dev        # desenvolvimento (node --watch server.js)
```

## Convenções

- Idioma: português brasileiro (interface, variáveis, comentários)
- Sem framework frontend — vanilla JS
- SQLite como banco único, sem migrations externas (migrações inline no server.js)
- CSVs usam `;` como separador
