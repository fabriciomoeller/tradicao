# Guia de Configuração - Gerador de Etiquetas

## 📋 Configurações Básicas

### Dimensões da Etiqueta

As dimensões são definidas em **centímetros** e determinam o tamanho de cada etiqueta individual:

- **Largura**: 1cm a 20cm (padrão: 7cm)
- **Altura**: 1cm a 15cm (padrão: 3.5cm)

**Exemplos comuns:**
- Tickets pequenos: 5cm x 3cm
- Tickets médios: 7cm x 3.5cm
- Etiquetas grandes: 10cm x 5cm

### Margens da Página

As margens controlam o espaçamento entre as etiquetas e as bordas da folha A4:

- **Superior/Inferior**: 0cm a 5cm (padrão: 1cm)
- **Esquerda/Direita**: 0cm a 5cm (padrão: 1cm)

**Dica**: Margens maiores são úteis para impressoras que não imprimem até a borda.

## 🎨 Personalização Visual

### Fonte

- **Tamanho**: 8px a 48px (padrão: 14px)
- **Família**: Arial, Times New Roman, Helvetica, Georgia, Verdana
- **Cor**: Qualquer cor em hexadecimal (padrão: #000000 - preto)

### Imagem de Fundo

1. **Formatos suportados**: JPG, PNG, GIF, BMP, WebP
2. **Opacidade**: 0.0 (transparente) a 1.0 (opaco)
3. **Recomendação**: Use opacidade entre 0.2 e 0.4 para não interferir no texto

## 💰 Configuração de Valores

### Adicionando Valores

1. Digite o valor em reais (ex: 5.00, 10.50)
2. Defina a quantidade de etiquetas
3. Use "Adicionar Valor" para mais tipos
4. Use "Remover" para excluir valores

### Texto Personalizado

Adicione informações extras que aparecerão em todas as etiquetas:
- Nome do evento
- Nome da empresa
- Data
- Instruções especiais

## 🔧 Arquivo .env

### Estrutura do Arquivo

```env
# Dimensões da etiqueta
LABEL_WIDTH=7
LABEL_HEIGHT=3.5
LABEL_UNIT=cm

# Margens da página
MARGIN_TOP=1
MARGIN_BOTTOM=1
MARGIN_LEFT=1
MARGIN_RIGHT=1

# Imagem de fundo
BACKGROUND_IMAGE=
BACKGROUND_OPACITY=0.3

# Layout automático
LABELS_PER_ROW=3
LABELS_PER_COLUMN=8

# Configurações de texto
FONT_SIZE=14
FONT_FAMILY=Arial
TEXT_COLOR=#000000

# Valores padrão
DEFAULT_VALUES=5.00,10.00,20.00
DEFAULT_QUANTITIES=5,3,2
```

### Modificando Configurações Padrão

1. Edite o arquivo `.env`
2. Recarregue a página no navegador
3. Os novos valores aparecerão automaticamente

## 📐 Cálculo Automático de Layout

O sistema calcula automaticamente quantas etiquetas cabem por página baseado em:

### Fórmula de Cálculo

```
Largura útil = 21cm - margem_esquerda - margem_direita
Altura útil = 29.7cm - margem_superior - margem_inferior

Etiquetas por linha = Largura útil ÷ Largura da etiqueta
Etiquetas por coluna = Altura útil ÷ Altura da etiqueta

Total por página = Etiquetas por linha × Etiquetas por coluna
```

### Exemplos Práticos

**Configuração 1:**
- Etiqueta: 7cm × 3.5cm
- Margens: 1cm em todos os lados
- Resultado: 3 × 8 = 24 etiquetas por página

**Configuração 2:**
- Etiqueta: 5cm × 2.5cm  
- Margens: 1.5cm em todos os lados
- Resultado: 3 × 10 = 30 etiquetas por página

## ⚠️ Limitações e Validações

### Validações Automáticas

O sistema verifica automaticamente:
- Se as etiquetas cabem na página
- Se as dimensões são válidas
- Se há pelo menos um valor configurado

### Mensagens de Erro Comuns

1. **"A largura da etiqueta é muito grande"**
   - Reduza a largura ou as margens laterais

2. **"As dimensões não permitem nenhuma etiqueta"**
   - Verifique se etiqueta + margens não excedem o papel A4

3. **"Adicione pelo menos um valor de ticket"**
   - Configure ao menos um valor com quantidade > 0

## 💾 Salvando e Carregando Configurações

### Exportar Configurações

1. Configure todas as opções desejadas
2. Clique em "Exportar Configuração"
3. Salve o arquivo JSON gerado

### Importar Configurações

1. Clique em "Importar Configuração"
2. Selecione um arquivo JSON válido
3. As configurações serão carregadas automaticamente

### Formato do Arquivo de Configuração

```json
{
  "labelWidth": "7",
  "labelHeight": "3.5",
  "marginTop": "1",
  "marginBottom": "1",
  "marginLeft": "1",
  "marginRight": "1",
  "backgroundOpacity": "0.3",
  "fontSize": "16",
  "fontFamily": "Arial",
  "textColor": "#000080",
  "customText": "Texto personalizado",
  "tickets": [
    {
      "value": 5.00,
      "quantity": 10
    }
  ]
}
```

## 🖨️ Configurações de Impressão

### Configurações da Impressora

1. **Papel**: A4 (21cm × 29.7cm)
2. **Orientação**: Retrato
3. **Margens**: Nenhuma ou mínimas
4. **Qualidade**: Normal ou Alta
5. **Cores**: Conforme necessário

### Teste de Impressão

1. Imprima apenas uma página primeiro
2. Verifique alinhamento das etiquetas
3. Ajuste margens se necessário
4. Teste com papel comum antes do papel final

### Solucionando Problemas de Impressão

**Etiquetas cortadas:**
- Aumente as margens da página
- Verifique configurações da impressora

**Desalinhamento:**
- Ajuste margens finas
- Verifique se o papel está bem posicionado

**Texto ilegível:**
- Aumente o tamanho da fonte
- Reduza a opacidade da imagem de fundo

## 📱 Uso em Dispositivos Móveis

### Limitações Mobile
- Visualização reduzida
- Alguns controles adaptados
- Impressão limitada

### Recomendações
- Use desktop/laptop para melhor experiência
- Configure no computador e imprima do mobile se necessário

## 🔍 Dicas Avançadas

### Otimização de Papel
- Calcule quantas etiquetas precisa
- Ajuste configurações para maximizar uso da folha
- Considere sobras para reposição

### Qualidade de Impressão
- Use imagens de alta resolução para fundo
- Teste diferentes papéis
- Considere laminação para durabilidade

### Backup de Configurações
- Mantenha arquivos JSON de configurações frequentes
- Documente configurações específicas para eventos

## ❓ FAQ - Perguntas Frequentes

**Q: Posso usar outros tamanhos de papel?**
A: Atualmente suporta apenas A4, mas o código pode ser modificado.

**Q: Quantas etiquetas diferentes posso criar?**
A: Não há limite, mas considere a performance com muitas configurações.

**Q: A imagem de fundo afeta a legibilidade?**
A: Sim, use opacidade baixa (0.2-0.4) e imagens claras.

**Q: Posso imprimir frente e verso?**
A: Sim, mas configure cuidadosamente para alinhamento correto.

**Q: Como fazer etiquetas numeradas?**
A: Use o campo "Texto personalizado" e gere em lotes menores.