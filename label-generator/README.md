# Gerador de Etiquetas - Tradição

Um aplicativo web para criar e imprimir etiquetas personalizadas em papel A4, ideal para tickets de dinheiro e etiquetas de preço.

## Funcionalidades

- **Configuração flexível**: Personalize tamanho, margens, fontes e cores
- **Imagem de fundo**: Carrega `nasrudin.jpeg` por padrão; suporte a qualquer imagem com controle de opacidade e zoom
- **Espaçamento configurável**: Controle o espaço entre etiquetas em milímetros
- **Símbolo de moeda opcional**: Configure `R$`, `$`, `€` ou deixe em branco
- **Fontes otimizadas para números**: Oswald, Bebas Neue, Roboto Condensed e DM Mono via Google Fonts
- **Múltiplos valores**: Configure diferentes valores e quantidades para tickets
- **Visualização em tempo real**: Veja como ficará antes de imprimir
- **Paginação automática**: Cálculo preciso de etiquetas por página considerando dimensões, margens e espaçamento
- **Impressão otimizada**: Etiquetas sem bordas arredondadas e borda discreta para recorte limpo

## 📋 Requisitos

- Navegador web moderno (Chrome, Firefox, Safari, Edge)
- Impressora configurada para papel A4

## 🔧 Instalação

1. Clone ou baixe este repositório
2. Abra o arquivo `label-generator/index.html` em seu navegador
3. Ou sirva os arquivos através de um servidor web local

## 📖 Como Usar

### 1. Configuração Básica

1. **Dimensões da Etiqueta**: 
   - Configure largura e altura em centímetros
   - Exemplo: 7cm x 3,5cm

2. **Margens e Espaçamento**:
   - Defina margens superior, inferior, esquerda e direita da folha
   - Configure o espaçamento entre etiquetas (padrão: 0mm para recorte limpo)
   - Campos agrupados em duas colunas para interface compacta

3. **Aparência**:
   - Escolha tamanho e família da fonte (Oswald, Bebas Neue, Roboto Condensed, DM Mono e clássicas)
   - Selecione cor do texto
   - Imagem de fundo carregada automaticamente; ajuste opacidade e zoom

### 2. Configuração dos Valores

1. **Adicionar Valores**:
   - Digite o valor em reais (ex: 5.00)
   - Defina quantas etiquetas desse valor
   - Use o botão "Adicionar Valor" para mais tipos

2. **Texto Personalizado**:
   - Adicione texto extra que aparecerá em todas as etiquetas
   - Exemplo: nome da empresa, evento, etc.

### 3. Gerar e Imprimir

1. Clique em **"Gerar Etiquetas"** para criar o layout
2. Use os controles de página para navegar entre folhas
3. Clique em **"Imprimir"** quando estiver satisfeito

## ⚙️ Arquivo de Configuração (.env)

O arquivo `.env` permite definir valores padrão:

```env
# Configurações da Etiqueta
LABEL_WIDTH=7
LABEL_HEIGHT=3.5
LABEL_UNIT=cm

# Margens (em cm)
MARGIN_TOP=1
MARGIN_BOTTOM=1
MARGIN_LEFT=1
MARGIN_RIGHT=1

# Imagem de fundo
BACKGROUND_IMAGE=
BACKGROUND_OPACITY=0.8

# Fonte do texto
FONT_SIZE=14
FONT_FAMILY=Arial
TEXT_COLOR=#000000

# Valores padrão para os tickets
DEFAULT_VALUES=5.00,10.00,20.00
DEFAULT_QUANTITIES=5,3,2
```

## 💡 Exemplos de Uso

### Histórias de Nasrudin
- **Valores**: R$ 1,00 (50), R$ 2,00 (50), R$ 5,00 (50), R$ 10,00 (50), R$ 20,00 (30), R$ 50,00 (15)
- **Texto personalizado**: "Histórias de Nasrudin"
- **Imagem de fundo**: `nasrudin.jpeg` com opacidade 0.8
- **Arquivo de configuração**: `exemplo-nasrudin.json`

### Tickets para Festa Junina
- **Valores**: R$ 2,00 (50 tickets), R$ 5,00 (30 tickets), R$ 10,00 (20 tickets)
- **Texto personalizado**: "Festa Junina 2024"
- **Imagem**: Logo da escola/organização
- **Arquivo de configuração**: `exemplo-festa-junina.json`

### Etiquetas de Preço
- **Valores**: Diferentes preços dos produtos
- **Texto personalizado**: Nome da loja
- **Dimensões**: Menores (5cm x 2,5cm)

### Rifas/Sorteios
- **Valores**: Valor único (ex: R$ 10,00)
- **Quantidade**: Conforme número de bilhetes
- **Numeração**: Use texto personalizado para identificação

## 🖨️ Dicas de Impressão

1. **Configuração da impressora**:
   - Selecione papel A4
   - Configure margens como "Nenhuma" ou "Mínimas"
   - Use qualidade "Normal" ou "Alta"

2. **Teste antes de imprimir tudo**:
   - Imprima uma página de teste
   - Verifique alinhamento e qualidade
   - Ajuste configurações se necessário

3. **Papel recomendado**:
   - Papel A4 branco 75-90g/m²
   - Para etiquetas adesivas: use papel A4 adesivo

## 🔧 Personalização Avançada

### Modificar Estilos
Edite o arquivo `styles.css` para personalizar:
- Cores do tema
- Fontes adicionais  
- Layout da interface

### Adicionar Funcionalidades
No arquivo `script.js` você pode:
- Adicionar novos formatos de papel
- Implementar novos layouts
- Integrar com APIs externas

## 📱 Responsividade

O aplicativo funciona em diferentes dispositivos:
- **Desktop**: Experiência completa
- **Tablet**: Layout adaptado
- **Mobile**: Interface simplificada

## 🐛 Solução de Problemas

### As etiquetas não aparecem
- Verifique se clicou em "Gerar Etiquetas"
- Confirme que há pelo menos um valor configurado
- Verifique as dimensões e margens

### Impressão cortada
- Ajuste as margens da página
- Verifique configurações da impressora
- Teste com margens maiores

### Imagem de fundo não aparece
- Verifique o formato da imagem (JPG, PNG)
- Confirme que a opacidade não está em 0
- Tente uma imagem menor

## 📄 Estrutura de Arquivos

```
label-generator/
├── index.html                      # Página principal
├── styles.css                      # Estilos e layout
├── script.js                       # Lógica da aplicação
├── imagem/
│   └── nasrudin.jpeg               # Imagem de fundo padrão
├── exemplo-festa-junina.json       # Configuração de exemplo (Festa Junina)
├── exemplo-nasrudin.json           # Configuração de exemplo (Nasrudin)
└── README.md                       # Este arquivo
```

### Importar Configurações de Exemplo
1. Clique em **"Importar Configuração"**
2. Selecione um dos arquivos de exemplo (`.json`)
3. As configurações serão carregadas automaticamente

## 🤝 Contribuindo

1. Faça um fork do projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## 📝 Licença

Este projeto é de código aberto. Use livremente para fins pessoais e comerciais.

## 🆘 Suporte

Para dúvidas ou problemas:
1. Verifique este README
2. Consulte os comentários no código
3. Abra uma issue no repositório

---

**Desenvolvido com ❤️ para facilitar a criação de etiquetas personalizadas**
