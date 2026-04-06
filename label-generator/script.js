// Configurações globais
let currentBackgroundImage = null;
let currentPage = 1;
let totalPages = 1;
let allPages = [];

// Carrega configurações do .env (simulado)
const defaultConfig = {
    LABEL_WIDTH: 7,
    LABEL_HEIGHT: 3.5,
    MARGIN_TOP: 1,
    MARGIN_BOTTOM: 1,
    MARGIN_LEFT: 1,
    MARGIN_RIGHT: 1,
    BACKGROUND_OPACITY: 0.3,
    FONT_SIZE: 14,
    FONT_FAMILY: 'Arial',
    TEXT_COLOR: '#000000'
};

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    loadDefaultValues();
    setupEventListeners();
    loadDefaultBackgroundImage();
});

function loadDefaultBackgroundImage() {
    fetch('imagem/nasrudin.jpeg')
        .then(res => res.blob())
        .then(blob => {
            const reader = new FileReader();
            reader.onload = function(e) {
                currentBackgroundImage = e.target.result;
            };
            reader.readAsDataURL(blob);
        })
        .catch(() => {}); // ignora se não encontrar
}

function loadDefaultValues() {
    // Carrega valores padrão nos campos
    document.getElementById('labelWidth').value = defaultConfig.LABEL_WIDTH;
    document.getElementById('labelHeight').value = defaultConfig.LABEL_HEIGHT;
    document.getElementById('marginTop').value = defaultConfig.MARGIN_TOP;
    document.getElementById('marginBottom').value = defaultConfig.MARGIN_BOTTOM;
    document.getElementById('marginLeft').value = defaultConfig.MARGIN_LEFT;
    document.getElementById('marginRight').value = defaultConfig.MARGIN_RIGHT;
    document.getElementById('backgroundOpacity').value = defaultConfig.BACKGROUND_OPACITY;
    document.getElementById('fontSize').value = defaultConfig.FONT_SIZE;
    document.getElementById('fontFamily').value = defaultConfig.FONT_FAMILY;
    document.getElementById('textColor').value = defaultConfig.TEXT_COLOR;
}

function setupEventListeners() {
    // Event listener para upload de imagem
    document.getElementById('backgroundImage').addEventListener('change', handleImageUpload);

    // Event listeners para atualização em tempo real
    const inputs = document.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        const isTicketInput = input.classList.contains('ticket-value') || input.classList.contains('ticket-quantity');
        const handler = isTicketInput
            ? debounce(() => { if (allPages.length > 0) generateLabels(); }, 300)
            : debounce(updatePreview, 300);
        input.addEventListener('change', handler);
        input.addEventListener('input', handler);
    });
}

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            currentBackgroundImage = e.target.result;
            updatePreview();
        };
        reader.readAsDataURL(file);
    }
}

function addTicket() {
    const ticketValues = document.getElementById('ticketValues');
    const ticketGroup = document.createElement('div');
    ticketGroup.className = 'ticket-group';

    ticketGroup.innerHTML = `
        <label>Valor R$:</label>
        <input type="number" class="ticket-value" step="0.01" min="0" value="1.00">
        <label>Quantidade:</label>
        <input type="number" class="ticket-quantity" min="1" value="1">
        <button class="remove-ticket" onclick="removeTicket(this)">Remover</button>
    `;

    ticketValues.appendChild(ticketGroup);

    // Adiciona event listeners aos novos campos
    const newInputs = ticketGroup.querySelectorAll('input');
    newInputs.forEach(input => {
        input.addEventListener('change', debounce(() => { if (allPages.length > 0) generateLabels(); }, 300));
        input.addEventListener('input', debounce(() => { if (allPages.length > 0) generateLabels(); }, 300));
    });
}

function removeTicket(button) {
    const ticketGroup = button.parentElement;
    ticketGroup.remove();
    if (allPages.length > 0) generateLabels();
}

function getTicketData() {
    const tickets = [];
    const ticketGroups = document.querySelectorAll('.ticket-group');

    ticketGroups.forEach(group => {
        const value = parseFloat(group.querySelector('.ticket-value').value) || 0;
        const quantity = parseInt(group.querySelector('.ticket-quantity').value) || 0;

        if (value > 0 && quantity > 0) {
            tickets.push({ value, quantity });
        }
    });

    return tickets;
}

function generateLabels() {
    const tickets = getTicketData();
    const customText = document.getElementById('customText').value.trim();

    if (tickets.length === 0) {
        alert('Adicione pelo menos um valor de ticket!');
        return;
    }

    // Gera array de etiquetas
    const labels = [];
    tickets.forEach(ticket => {
        for (let i = 0; i < ticket.quantity; i++) {
            const symbol = document.getElementById('currencySymbol').value.trim();
            const labelText = [symbol ? `${symbol} ${ticket.value.toFixed(2)}` : ticket.value.toFixed(2)];
            if (customText) {
                labelText.push(customText);
            }
            labels.push(labelText);
        }
    });

    // Calcula quantas etiquetas cabem por página
    const labelsPerPage = calculateLabelsPerPage();

    // Divide as etiquetas em páginas
    allPages = [];
    for (let i = 0; i < labels.length; i += labelsPerPage) {
        allPages.push(labels.slice(i, i + labelsPerPage));
    }

    totalPages = allPages.length;
    currentPage = 1;

    updatePreview();
    updatePageControls();
}

function getPageLayout() {
    const labelWidth = parseFloat(document.getElementById('labelWidth').value);
    const labelHeight = parseFloat(document.getElementById('labelHeight').value);
    const marginTop = parseFloat(document.getElementById('marginTop').value);
    const marginBottom = parseFloat(document.getElementById('marginBottom').value);
    const marginLeft = parseFloat(document.getElementById('marginLeft').value);
    const marginRight = parseFloat(document.getElementById('marginRight').value);
    const labelGap = (parseFloat(document.getElementById('labelGap').value) || 0) / 10; // mm -> cm

    const pageWidth = 21;
    const pageHeight = 29.7;
    const usableWidth = pageWidth - marginLeft - marginRight;
    const usableHeight = pageHeight - marginTop - marginBottom;

    const labelsPerRow = Math.floor((usableWidth + labelGap) / (labelWidth + labelGap));
    const labelsPerColumn = Math.floor((usableHeight + labelGap) / (labelHeight + labelGap));

    return { labelsPerRow, labelsPerColumn, labelWidth, labelHeight, labelGap, marginTop, marginBottom, marginLeft, marginRight };
}

function calculateLabelsPerPage() {
    const { labelsPerRow, labelsPerColumn } = getPageLayout();
    return labelsPerRow * labelsPerColumn;
}

function updatePreview() {
    if (allPages.length === 0) return;

    const preview = document.getElementById('preview');
    const currentLabels = allPages[currentPage - 1] || [];

    preview.innerHTML = '';

    if (currentLabels.length === 0) return;

    // Cria a página A4
    const page = createA4Page(currentLabels);
    preview.appendChild(page);
}

function createA4Page(labels) {
    const page = document.createElement('div');
    page.className = 'a4-page';

    const { labelsPerRow, labelWidth, labelHeight, labelGap, marginTop, marginBottom, marginLeft, marginRight } = getPageLayout();
    const labelsPerColumn = Math.ceil(labels.length / labelsPerRow);

    // Cria o container das etiquetas
    const labelsContainer = document.createElement('div');
    labelsContainer.className = 'labels-container';

    labelsContainer.style.cssText = `
        display: grid;
        grid-template-columns: repeat(${labelsPerRow}, ${labelWidth}cm);
        grid-template-rows: repeat(${labelsPerColumn}, ${labelHeight}cm);
        margin: ${marginTop}cm ${marginRight}cm ${marginBottom}cm ${marginLeft}cm;
        gap: ${labelGap * 10}mm;
        justify-content: start;
    `;

    // Cria as etiquetas
    labels.forEach(labelText => {
        const label = createLabel(labelText);
        labelsContainer.appendChild(label);
    });

    page.appendChild(labelsContainer);
    return page;
}

function createLabel(textLines) {
    const label = document.createElement('div');
    label.className = 'label';

    const fontSize = document.getElementById('fontSize').value;
    const fontFamily = document.getElementById('fontFamily').value;
    const textColor = document.getElementById('textColor').value;
    const backgroundOpacity = document.getElementById('backgroundOpacity').value;
    const backgroundZoom = parseFloat(document.getElementById('backgroundZoom').value) || 100;

    // Aplica estilos
    label.style.fontFamily = fontFamily;
    label.style.color = textColor;

    // Adiciona imagem de fundo se houver
    if (currentBackgroundImage) {
        const bgImg = document.createElement('img');
        bgImg.src = currentBackgroundImage;
        bgImg.style.position = 'absolute';
        bgImg.style.top = '50%';
        bgImg.style.left = '50%';
        bgImg.style.width = '100%';
        bgImg.style.height = '100%';
        bgImg.style.objectFit = 'contain';
        bgImg.style.opacity = backgroundOpacity;
        bgImg.style.transform = `translate(-50%, -50%) scale(${backgroundZoom / 100})`;
        bgImg.style.zIndex = '0';
        label.appendChild(bgImg);
    }

    // Adiciona texto
    const textDiv = document.createElement('div');
    textDiv.className = 'label-text';

    if (Array.isArray(textLines)) {
        textLines.forEach(line => {
            const lineDiv = document.createElement('div');
            lineDiv.textContent = line;
            textDiv.appendChild(lineDiv);
        });
    } else {
        textDiv.textContent = textLines;
    }

    textDiv.style.fontSize = `${fontSize}px`;
    label.appendChild(textDiv);
    return label;
}

function updatePageControls() {
    document.getElementById('pageInfo').textContent = `Página ${currentPage} de ${totalPages}`;
    document.getElementById('prevBtn').disabled = currentPage <= 1;
    document.getElementById('nextBtn').disabled = currentPage >= totalPages;
}

function previousPage() {
    if (currentPage > 1) {
        currentPage--;
        updatePreview();
        updatePageControls();
    }
}

function nextPage() {
    if (currentPage < totalPages) {
        currentPage++;
        updatePreview();
        updatePageControls();
    }
}

function printLabels() {
    if (allPages.length === 0) {
        alert('Gere as etiquetas primeiro!');
        return;
    }

    const printArea = document.getElementById('printArea');
    printArea.innerHTML = '';

    // Cria todas as páginas para impressão
    allPages.forEach((labels, index) => {
        const page = createA4Page(labels);
        printArea.appendChild(page);
    });

    // Imprime
    window.print();
}

// Função utilitária para debounce
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Função para exportar configurações
function exportConfig() {
    const config = {
        labelWidth: document.getElementById('labelWidth').value,
        labelHeight: document.getElementById('labelHeight').value,
        marginTop: document.getElementById('marginTop').value,
        marginBottom: document.getElementById('marginBottom').value,
        marginLeft: document.getElementById('marginLeft').value,
        marginRight: document.getElementById('marginRight').value,
        backgroundOpacity: document.getElementById('backgroundOpacity').value,
        fontSize: document.getElementById('fontSize').value,
        fontFamily: document.getElementById('fontFamily').value,
        textColor: document.getElementById('textColor').value,
        currencySymbol: document.getElementById('currencySymbol').value,
        customText: document.getElementById('customText').value,
        tickets: getTicketData()
    };

    const dataStr = JSON.stringify(config, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

    const exportFileDefaultName = 'etiquetas-config.json';

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
}

// Função para importar configurações
function importConfig(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const config = JSON.parse(e.target.result);
                loadConfig(config);
            } catch (error) {
                alert('Erro ao carregar configuração: arquivo inválido');
            }
        };
        reader.readAsText(file);
    }
}

function loadConfig(config) {
    // Carrega configurações nos campos
    Object.keys(config).forEach(key => {
        const element = document.getElementById(key);
        if (element && config[key] !== undefined) {
            element.value = config[key];
        }
    });

    // Carrega tickets
    if (config.tickets && Array.isArray(config.tickets)) {
        const ticketValues = document.getElementById('ticketValues');
        ticketValues.innerHTML = '';

        config.tickets.forEach(ticket => {
            const ticketGroup = document.createElement('div');
            ticketGroup.className = 'ticket-group';
            ticketGroup.innerHTML = `
                <label>Valor R$:</label>
                <input type="number" class="ticket-value" step="0.01" min="0" value="${ticket.value}">
                <label>Quantidade:</label>
                <input type="number" class="ticket-quantity" min="1" value="${ticket.quantity}">
                <button class="remove-ticket" onclick="removeTicket(this)">Remover</button>
            `;
            ticketValues.appendChild(ticketGroup);
        });
    }

    // Atualiza preview
    updatePreview();
}

// Função para salvar como PDF (requer biblioteca externa)
function savePDF() {
    if (typeof html2pdf === 'undefined') {
        alert('Biblioteca PDF não carregada. Use a função de impressão do navegador.');
        return;
    }

    const printArea = document.getElementById('printArea');
    if (printArea.children.length === 0) {
        alert('Gere as etiquetas primeiro!');
        return;
    }

    const opt = {
        margin: 0,
        filename: 'etiquetas.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'cm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(printArea).save();
}

// Função para validar dimensões
function validateDimensions() {
    const labelWidth = parseFloat(document.getElementById('labelWidth').value);
    const labelHeight = parseFloat(document.getElementById('labelHeight').value);
    const marginLeft = parseFloat(document.getElementById('marginLeft').value);
    const marginRight = parseFloat(document.getElementById('marginRight').value);
    const marginTop = parseFloat(document.getElementById('marginTop').value);
    const marginBottom = parseFloat(document.getElementById('marginBottom').value);

    const pageWidth = 21; // A4 width in cm
    const pageHeight = 29.7; // A4 height in cm

    const usableWidth = pageWidth - marginLeft - marginRight;
    const usableHeight = pageHeight - marginTop - marginBottom;

    if (labelWidth > usableWidth) {
        alert('A largura da etiqueta é muito grande para a página!');
        return false;
    }

    if (labelHeight > usableHeight) {
        alert('A altura da etiqueta é muito grande para a página!');
        return false;
    }

    const labelsPerPage = calculateLabelsPerPage();
    if (labelsPerPage === 0) {
        alert('As dimensões não permitem nenhuma etiqueta na página!');
        return false;
    }

    return true;
}

// Event listeners adicionais quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', function() {
    // Validação em tempo real
    const dimensionInputs = ['labelWidth', 'labelHeight', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight'];
    dimensionInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('blur', validateDimensions);
        }
    });
});
