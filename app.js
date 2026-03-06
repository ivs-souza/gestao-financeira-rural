/* ==========================================================================
   1. ESTADO GLOBAL E INICIALIZAÇÃO
   ========================================================================== */
let transactions = [];
let marketAlerts = [];
let currentType = '';
let currentFilter = 'all';

const currentYear = new Date().getFullYear();
let currentMonthFilter = new Date().getMonth().toString();
let currentYearFilter = currentYear.toString();

const categories = {
    income: ['Venda de Produção', 'Venda de Animais', 'Outras Receitas'],
    expense: ['Insumos', 'Mão de Obra', 'Manutenção', 'Combustível', 'Medicamentos/Nutrição', 'Impostos', 'Outras Despesas']
};

let photoBase64 = null;

// Lógica de Inicialização a ser chamada no carregamento
function initData() {
    const rawData = localStorage.getItem('rural_data');
    if (rawData) {
        transactions = JSON.parse(rawData);
        // Garantindo que as datas são objetos Date
        transactions = transactions.map(t => ({
            ...t,
            date: new Date(t.date)
        }));
    }

    const rawAlerts = localStorage.getItem('rural_alerts');
    if (rawAlerts) {
        marketAlerts = JSON.parse(rawAlerts);
    }

    // Theme setup
    const savedTheme = localStorage.getItem('rural_theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        const themeBtn = document.getElementById('btn-theme-toggle');
        if (themeBtn) themeBtn.textContent = '☀️';
    }
}

/* ==========================================================================
   2. NAVEGAÇÃO E ABAS
   ========================================================================== */
window.showPage = (pageId) => {
    // 1. Esconde TODAS as abas explicitamente
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
        tab.classList.remove('active');
        tab.style.display = 'none';
    });

    // 2. Remove "active" de todos os botões da barra inferior
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(nav => {
        nav.classList.remove('active');
    });

    // 3. Mostra a aba alvo
    const targetTab = document.getElementById(pageId);
    if (targetTab) {
        targetTab.classList.add('active');
        targetTab.style.display = 'block';
    }

    // 4. Ativa o botão correspondente da barra inferior
    const activeNav = Array.from(navItems).find(nav => nav.getAttribute('data-target') === pageId);
    if (activeNav) {
        activeNav.classList.add('active');
    }

    // 5. Tratamento de Persistência do Perfil
    if (pageId === 'tab-perfil') {
        loadProfile();
    }

    // 6. SINCRONIZAÇÃO OBRIGATÓRIA: Repopula os dados
    updateDashboard();
    renderTransactions();
};

/* ==========================================================================
   3. FILTRAGEM E RENDERIZAÇÃO
   ========================================================================== */
const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
};

// Pega transações baseadas no mês e ano selecionados
const getFilteredTransactions = () => {
    return transactions.filter(t => {
        // Garantindo que temos um objeto Date válido antes de checar mês/ano
        const validDate = t.date instanceof Date ? t.date : new Date(t.date);

        const tMonth = validDate.getMonth().toString();
        const tYear = validDate.getFullYear().toString();

        const monthMatch = currentMonthFilter === 'all' ? true : tMonth === currentMonthFilter;
        const yearMatch = tYear === currentYearFilter;

        return monthMatch && yearMatch;
    });
};

const updateDashboard = () => {
    const filtered = getFilteredTransactions();

    const income = filtered.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const expense = filtered.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
    const balance = income - expense;

    const totalIncomeEl = document.getElementById('total-income');
    const totalExpenseEl = document.getElementById('total-expense');
    const totalBalanceEl = document.getElementById('total-balance');
    const filteredTotalEl = document.getElementById('filtered-total');
    const dailyAvgEl = document.getElementById('daily-avg');

    if (totalIncomeEl) totalIncomeEl.textContent = formatCurrency(income);
    if (totalExpenseEl) totalExpenseEl.textContent = formatCurrency(expense);

    if (totalBalanceEl) {
        totalBalanceEl.textContent = formatCurrency(balance);
        totalBalanceEl.style.color = balance < 0 ? 'var(--color-expense)' : 'var(--color-text)';
    }

    if (filteredTotalEl) {
        filteredTotalEl.textContent = `Saldo do Filtro: ${formatCurrency(balance)}`;
        filteredTotalEl.style.color = balance < 0 ? 'var(--color-expense)' : 'var(--color-income)';
    }

    if (dailyAvgEl) {
        const avg = balance / 30;
        dailyAvgEl.textContent = `Média Diária: ${formatCurrency(avg)}`;
    }
};

const createTransactionElement = (t) => {
    const item = document.createElement('div');
    item.className = 'transaction-item';

    const sign = t.type === 'income' ? '+' : '-';
    const categoryBadge = t.category ? `<span style="background: var(--color-bg); padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; color: var(--color-text-light); margin-left: 0.5rem; border: 1px solid #eee;">${t.category}</span>` : '';
    const litersHtml = t.liters ? `<br><small style="color: var(--color-text-light); font-weight: 500;">${t.liters} Litros</small>` : '';
    const retroHtml = t.retroactive ? `<br><small style="color: rgb(100, 100, 100); display: inline-flex; align-items: center; gap: 4px; margin-top: 2px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> Lançamento tardio</small>` : '';
    const receiptHtml = t.photoData ? `<button class="btn-view-receipt" onclick="openReceiptViewer('${t.id}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
        Ver Comprovante
    </button>` : '';

    // Date safety
    const safeDate = t.date instanceof Date ? t.date : new Date(t.date);

    item.innerHTML = `
      <div class="transaction-info">
        <span class="transaction-title" style="display:flex; align-items:center;">${t.desc} ${categoryBadge}</span>
        <span class="transaction-date">${safeDate.toLocaleDateString('pt-BR')} ${litersHtml} ${retroHtml} ${receiptHtml}</span>
      </div>
      <div class="transaction-amount ${t.type}">
        ${sign} ${formatCurrency(t.amount)}
      </div>
    `;
    return item;
};

window.renderTransactions = () => {
    const tlResumo = document.getElementById('transactions-list');
    const tlEntradas = document.getElementById('transactions-list-entradas');
    const tlSaidas = document.getElementById('transactions-list-saidas');

    if (tlResumo) tlResumo.innerHTML = '';
    if (tlEntradas) tlEntradas.innerHTML = '';
    if (tlSaidas) tlSaidas.innerHTML = '';

    const emptyMsg = '<div style="padding: 2.5rem; text-align: center; color: var(--color-text-light);">Nenhuma transação encontrada.</div>';

    let filtered = getFilteredTransactions();

    if (filtered.length === 0) {
        if (tlResumo) tlResumo.innerHTML = emptyMsg;
        if (tlEntradas) tlEntradas.innerHTML = emptyMsg;
        if (tlSaidas) tlSaidas.innerHTML = emptyMsg;
        return;
    }

    // Ordenar Data decrescente
    const sorted = filtered.sort((a, b) => b.date - a.date);

    let hasResumo = false;
    let hasIncome = false;
    let hasExpense = false;

    // Injeta na aba Resumo (Tudo)
    if (tlResumo) {
        sorted.forEach(t => {
            tlResumo.appendChild(createTransactionElement(t));
            hasResumo = true;
        });
        if (!hasResumo) tlResumo.innerHTML = emptyMsg;
    }

    // Injeta na aba Entradas (Só income)
    if (tlEntradas) {
        const sortedIncomes = sorted.filter(t => t.type === 'income');
        if (sortedIncomes.length === 0) {
            tlEntradas.innerHTML = emptyMsg;
        } else {
            sortedIncomes.forEach(t => {
                tlEntradas.appendChild(createTransactionElement(t));
                hasIncome = true;
            });
        }
    }

    // Injeta na aba Saídas (Só expense)
    if (tlSaidas) {
        const sortedExpenses = sorted.filter(t => t.type === 'expense');
        if (sortedExpenses.length === 0) {
            tlSaidas.innerHTML = emptyMsg;
        } else {
            sortedExpenses.forEach(t => {
                tlSaidas.appendChild(createTransactionElement(t));
                hasExpense = true;
            });
        }
    }
};

/* ==========================================================================
   3.5 ABA DE MERCADO
   ========================================================================== */
const PRECOS_MERCADO = {
    boi: "282.50",
    soja: "134.20",
    milho: "58.90"
};

let currentDolarPrice = 'Carregando...';
let currentDolarVar = 0;
let currentDolarRaw = 0;
let lastMarketUpdate = '';

function syncAgroData() {
    return [
        { name: 'Boi Gordo (B3 Mar/26)', price: 'R$ ' + PRECOS_MERCADO.boi.replace('.', ','), var: -0.71, rawPrice: parseFloat(PRECOS_MERCADO.boi) },
        { name: 'Soja (Paranaguá)', price: 'R$ ' + PRECOS_MERCADO.soja.replace('.', ','), var: 1.04, rawPrice: parseFloat(PRECOS_MERCADO.soja) },
        { name: 'Milho (Esalq/B3)', price: 'R$ ' + PRECOS_MERCADO.milho.replace('.', ','), var: 0.01, rawPrice: parseFloat(PRECOS_MERCADO.milho) }
    ];
}

async function carregarCotacoes() {
    try {
        const resp = await fetch('https://economia.awesomeapi.com.br/last/USD-BRL');
        if (!resp.ok) throw new Error('API do Dólar indisponível');

        const data = await resp.json();
        const bid = parseFloat(data.USDBRL.bid);
        currentDolarPrice = bid.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        currentDolarVar = parseFloat(data.USDBRL.pctChange);
        currentDolarRaw = bid;
        lastMarketUpdate = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        console.log('Dólar atualizado:', currentDolarPrice);

        window.renderMarket(true);
    } catch (error) {
        console.error('Erro ao buscar dólar:', error);
        currentDolarPrice = 'Indisponível';
        lastMarketUpdate = 'Erro';
        window.renderMarket(true);
    }
}

window.renderMarket = (isUpdate = false) => {
    const marketContainer = document.getElementById('market-cards');
    if (!marketContainer) return;

    let marketData = syncAgroData();
    marketData.push({ name: 'Dólar Comercial', price: currentDolarPrice, var: currentDolarVar, rawPrice: currentDolarRaw });

    marketContainer.innerHTML = '';

    marketData.forEach(item => {
        let isAlertTriggered = false;

        // Verifica se há alertas que batem com esta commodity
        marketAlerts.forEach(alert => {
            if (item.name.includes(alert.commodity) || alert.commodity.includes(item.name)) {
                if (alert.condition === 'greater' && item.rawPrice >= alert.target) {
                    isAlertTriggered = true;
                } else if (alert.condition === 'less' && item.rawPrice <= alert.target) {
                    isAlertTriggered = true;
                }
            }
        });

        const card = document.createElement('div');
        card.className = `market-card ${isAlertTriggered ? 'alert-triggered' : ''}`;

        // Lógica de cores baseada nas variáveis de cor do CSS
        const isUp = item.var >= 0;
        const colorVar = isUp ? 'var(--color-income)' : 'var(--color-expense)';
        const signStr = isUp ? '+' : '';
        const arrowSvg = isUp
            ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`
            : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

        card.style.borderTopColor = colorVar;

        const isDolar = item.name === 'Dólar Comercial';
        let dateLabel = isDolar ? lastMarketUpdate : new Date().toLocaleDateString('pt-BR');

        card.innerHTML = `
            ${isAlertTriggered ? `<div class="alert-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg></div>` : ''}
            <div class="market-title">${item.name}</div>
            <div class="market-price">${item.price}</div>
            <div class="market-var ${isUp ? 'up' : 'down'}">
                ${arrowSvg} ${signStr}${item.var.toFixed(2).replace('.', ',')}%
            </div>
            <div style="font-size: 0.65rem; color: var(--text-secondary); margin-top: 4px; opacity: 0.8;">
                Atualizado em: ${dateLabel}
            </div>
        `;

        marketContainer.appendChild(card);
    });

    renderDashboardAlerts();

    if (!isUpdate && currentDolarPrice === 'Carregando...') {
        carregarCotacoes();
    }
};

window.renderDashboardAlerts = () => {
    const list = document.getElementById('dashboard-active-alerts-list');
    const section = document.getElementById('dashboard-active-alerts-section');
    if (!list || !section) return;

    list.innerHTML = '';

    if (marketAlerts.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';

    marketAlerts.forEach((alert, index) => {
        const item = document.createElement('div');
        item.className = 'dashboard-alert-item';

        const condText = alert.condition === 'greater' ? 'Maior que' : 'Menor que';

        item.innerHTML = `
            <div>
                <strong>${alert.commodity}</strong><br>
                <span style="color: var(--color-text-light);">${condText} R$ ${alert.target.toFixed(2).replace('.', ',')}</span>
            </div>
            <button class="btn-remove-alert" onclick="removeAlert(${index})">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
        `;
        list.appendChild(item);
    });
};

/* ==========================================================================
   4. PERFIL
   ========================================================================== */
window.loadProfile = () => {
    try {
        const profileStr = localStorage.getItem('rural_profile');
        const oldUser = localStorage.getItem('rural_user');

        const profNome = document.getElementById('prof-nome');
        const profPropriedade = document.getElementById('prof-propriedade');
        const profCpf = document.getElementById('prof-cpf');
        const profIe = document.getElementById('prof-ie');
        const profLocal = document.getElementById('prof-local');
        const profTipo = document.getElementById('prof-tipo');
        const headerTitle = document.querySelector('header h1');

        if (profileStr) {
            const profile = JSON.parse(profileStr);
            if (profNome && profile.nome !== undefined) profNome.value = profile.nome;
            if (profPropriedade && profile.propriedade !== undefined) {
                profPropriedade.value = profile.propriedade;
                if (headerTitle) headerTitle.textContent = `Fazenda: ${profile.propriedade}`;
            }
            if (profCpf && profile.cpf !== undefined) profCpf.value = profile.cpf;
            if (profIe && profile.ie !== undefined) profIe.value = profile.ie;
            if (profLocal && profile.local !== undefined) profLocal.value = profile.local;
            if (profTipo && profile.tipo !== undefined) profTipo.value = profile.tipo;
        } else if (oldUser) {
            if (profPropriedade) profPropriedade.value = oldUser;
            if (headerTitle) headerTitle.textContent = `Gestão: ${oldUser}`;
        }
    } catch (err) {
        console.error("Erro silencioso contido ao carregar perfil:", err);
    }
};

/* ==========================================================================
   5. MODAIS DA TRANSAÇÃO
   ========================================================================== */
const openModal = (type) => {
    currentType = type;

    const receiptPhotoInput = document.getElementById('receipt-photo');
    const receiptPreviewName = document.getElementById('receipt-preview-name');
    const dateInput = document.getElementById('date-input');
    const categoryInput = document.getElementById('category');
    const modalTitle = document.getElementById('modal-title');
    const litersGroup = document.getElementById('liters-group');
    const litersInput = document.getElementById('liters');
    const modal = document.getElementById('modal');
    const descInput = document.getElementById('desc');

    if (receiptPhotoInput) receiptPhotoInput.value = '';
    if (receiptPreviewName) receiptPreviewName.textContent = '';

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    if (dateInput) dateInput.value = `${yyyy}-${mm}-${dd}`;

    if (categoryInput) {
        categoryInput.innerHTML = '';
        categories[type].forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            categoryInput.appendChild(opt);
        });
    }

    if (type === 'income') {
        if (modalTitle) {
            modalTitle.textContent = 'Nova Entrada';
            modalTitle.style.color = 'var(--color-income)';
        }
        if (litersGroup) litersGroup.style.display = 'block';
    } else {
        if (modalTitle) {
            modalTitle.textContent = 'Nova Saída';
            modalTitle.style.color = 'var(--color-expense)';
        }
        if (litersGroup) {
            litersGroup.style.display = 'none';
            if (litersInput) litersInput.value = '';
        }
    }

    if (modal) modal.classList.add('active');
    setTimeout(() => { if (descInput) descInput.focus(); }, 100);
};

const closeModal = () => {
    const modal = document.getElementById('modal');
    const form = document.getElementById('transaction-form');
    const receiptPreviewName = document.getElementById('receipt-preview-name');

    if (modal) modal.classList.remove('active');
    if (form) form.reset();
    currentType = '';
    photoBase64 = null;
    if (receiptPreviewName) receiptPreviewName.textContent = '';
};

window.openReceiptViewer = (id) => {
    const transaction = transactions.find(t => t.id.toString() === id.toString());
    const receiptModal = document.getElementById('receipt-modal');
    const receiptViewerImg = document.getElementById('receipt-viewer-img');

    if (transaction && transaction.photoData && receiptModal) {
        if (receiptViewerImg) receiptViewerImg.src = transaction.photoData;
        receiptModal.classList.add('active');
    }
};

const closeReceiptViewer = () => {
    const receiptModal = document.getElementById('receipt-modal');
    const receiptViewerImg = document.getElementById('receipt-viewer-img');

    if (receiptModal) {
        receiptModal.classList.remove('active');
        setTimeout(() => { if (receiptViewerImg) receiptViewerImg.src = ''; }, 300);
    }
};

/* ==========================================================================
   6. EVENT LISTENERS E LOAD
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {

    // 1. Carregar dados das transações
    initData();

    // 2. Autenticação Simples
    const authScreen = document.getElementById('auth-screen');
    const authForm = document.getElementById('auth-form');
    const userNameInput = document.getElementById('user-name');
    const headerTitle = document.querySelector('header h1');

    const savedUser = localStorage.getItem('rural_user');
    if (savedUser && authScreen) {
        authScreen.style.display = 'none';
        if (headerTitle) headerTitle.textContent = `Gestão: ${savedUser}`;
    }

    if (authForm) {
        authForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = userNameInput ? userNameInput.value.trim() : '';
            if (name) {
                localStorage.setItem('rural_user', name);
                if (headerTitle) headerTitle.textContent = `Gestão: ${name}`;
                if (authScreen) authScreen.style.display = 'none';
            }
        });
    }

    // 3. Inicializar e aplicar Listeners em Botões de Navegação (.nav-item)
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(nav => {
        nav.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = nav.getAttribute('data-target');
            if (targetId) {
                showPage(targetId);
            }
        });
    });

    // Filtros de Ano (popular dinâmico)
    const yearFilterEl = document.getElementById('year-filter');
    const monthFilterEl = document.getElementById('month-filter');

    if (yearFilterEl) {
        let startYear = currentYear - 5;
        for (let y = startYear; y <= currentYear + 1; y++) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            if (y === currentYear) opt.selected = true;
            yearFilterEl.appendChild(opt);
        }

        yearFilterEl.addEventListener('change', (e) => {
            currentYearFilter = e.target.value;
            updateDashboard();
            renderTransactions();
        });
    }

    if (monthFilterEl) {
        monthFilterEl.value = currentMonthFilter;
        monthFilterEl.addEventListener('change', (e) => {
            currentMonthFilter = e.target.value;
            updateDashboard();
            renderTransactions();
        });
    }

    // Formulário do Perfil
    const profileForm = document.getElementById('profile-form-inner');
    if (profileForm) {
        profileForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const profNome = document.getElementById('prof-nome');
            const profPropriedade = document.getElementById('prof-propriedade');
            const profCpf = document.getElementById('prof-cpf');
            const profIe = document.getElementById('prof-ie');
            const profLocal = document.getElementById('prof-local');
            const profTipo = document.getElementById('prof-tipo');

            const profile = {
                nome: profNome ? profNome.value.trim() : '',
                propriedade: profPropriedade ? profPropriedade.value.trim() : '',
                cpf: profCpf ? profCpf.value.trim() : '',
                ie: profIe ? profIe.value.trim() : '',
                local: profLocal ? profLocal.value.trim() : '',
                tipo: profTipo ? profTipo.value.trim() : ''
            };

            localStorage.setItem('rural_profile', JSON.stringify(profile));
            if (profile.propriedade) localStorage.setItem('rural_user', profile.propriedade);

            if (headerTitle) headerTitle.textContent = `Fazenda: ${profile.propriedade}`;
            alert('Perfil salvo com sucesso!');

            loadProfile();
            updateDashboard();
            renderTransactions();
        });
    }

    // Botão Sair
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            if (confirm('Tem certeza que deseja sair ou trocar de usuário?')) {
                localStorage.removeItem('rural_user');
                localStorage.removeItem('rural_profile');
                location.reload();
            }
        });
    }

    // Criar Transação (Botões Abrir Modal)
    const btnNewIncome = document.getElementById('btn-new-income');
    const btnNewExpense = document.getElementById('btn-new-expense');
    const btnNewIncomeTab = document.getElementById('btn-new-income-tab');
    const btnNewExpenseTab = document.getElementById('btn-new-expense-tab');
    const btnCancel = document.getElementById('btn-cancel');

    if (btnNewIncome) btnNewIncome.addEventListener('click', () => openModal('income'));
    if (btnNewExpense) btnNewExpense.addEventListener('click', () => openModal('expense'));
    if (btnNewIncomeTab) btnNewIncomeTab.addEventListener('click', () => openModal('income'));
    if (btnNewExpenseTab) btnNewExpenseTab.addEventListener('click', () => openModal('expense'));
    if (btnCancel) btnCancel.addEventListener('click', closeModal);

    // Fechar Modal Clicando Fora e ESC
    const modal = document.getElementById('modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    const receiptModal = document.getElementById('receipt-modal');
    if (receiptModal) {
        receiptModal.addEventListener('click', (e) => {
            if (e.target === receiptModal) closeReceiptViewer();
        });
    }

    const btnCloseReceipt = document.getElementById('btn-close-receipt');
    if (btnCloseReceipt) {
        btnCloseReceipt.addEventListener('click', closeReceiptViewer);
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (modal && modal.classList.contains('active')) closeModal();
            if (receiptModal && receiptModal.classList.contains('active')) closeReceiptViewer();
        }
    });

    // Formulario Injetar Salvar Nova Transação
    const form = document.getElementById('transaction-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();

            let isValid = true;
            const descInput = document.getElementById('desc');
            const categoryInput = document.getElementById('category');
            const amountInput = document.getElementById('amount');
            const litersInput = document.getElementById('liters');
            const dateInput = document.getElementById('date-input');

            const desc = descInput ? descInput.value.trim() : '';
            const category = categoryInput ? categoryInput.value : '';
            const amountStr = amountInput ? amountInput.value.replace(',', '.') : '0';
            const amount = parseFloat(amountStr);

            let liters = null;
            if (currentType === 'income' && litersInput && litersInput.value.trim() !== '') {
                const litersStr = litersInput.value.replace(',', '.');
                liters = parseFloat(litersStr);
            }

            if (!desc && descInput) {
                descInput.style.borderColor = 'var(--color-expense)';
                isValid = false;
            }

            if ((isNaN(amount) || amount <= 0) && amountInput) {
                amountInput.style.borderColor = 'var(--color-expense)';
                isValid = false;
            }

            if (!isValid) return;

            let selectedDate = new Date();
            let isRetroactive = false;

            if (dateInput && dateInput.value) {
                const dateParts = dateInput.value.split('-');
                selectedDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]), 12, 0, 0);
                const todayStr = new Date().toISOString().slice(0, 10);
                isRetroactive = dateInput.value < todayStr;
            }

            const newTransaction = {
                id: Date.now(),
                desc,
                category,
                amount,
                type: currentType,
                date: selectedDate,
                liters: liters,
                retroactive: isRetroactive,
                photoData: photoBase64
            };

            transactions.push(newTransaction);

            try {
                localStorage.setItem('rural_data', JSON.stringify(transactions));
            } catch (err) {
                if (err.name === 'QuotaExceededError') {
                    alert('Aviso: Armazenamento do navegador cheio. A imagem não foi salva.');
                    newTransaction.photoData = null;
                    localStorage.setItem('rural_data', JSON.stringify(transactions));
                }
            }

            updateDashboard();
            renderTransactions();
            closeModal();
        });
    }

    // Inputs (Redefinir as cores ao editar)
    const amountInput = document.getElementById('amount');
    const descInput = document.getElementById('desc');
    if (descInput) descInput.addEventListener('focus', () => descInput.style.borderColor = '');
    if (amountInput) amountInput.addEventListener('focus', () => amountInput.style.borderColor = '');

    // Comprovantes
    const receiptPhotoInput = document.getElementById('receipt-photo');
    const receiptPreviewName = document.getElementById('receipt-preview-name');
    if (receiptPhotoInput) {
        receiptPhotoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                if (receiptPreviewName) receiptPreviewName.textContent = file.name;
                const reader = new FileReader();
                reader.onload = (event) => photoBase64 = event.target.result;
                reader.readAsDataURL(file);
            } else {
                photoBase64 = null;
                if (receiptPreviewName) receiptPreviewName.textContent = '';
            }
        });
    }

    // Export e Backup
    const btnExport = document.getElementById('btn-export');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            const dataStr = JSON.stringify({
                user: localStorage.getItem('rural_user'),
                transactions: transactions
            }, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
            const exportFileDefaultName = `backup_rural_${new Date().toISOString().slice(0, 10)}.json`;

            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            linkElement.click();
        });
    }

    const btnImportTrigger = document.getElementById('btn-import-trigger');
    const fileInput = document.getElementById('file-input');

    if (btnImportTrigger && fileInput) {
        btnImportTrigger.addEventListener('click', () => fileInput.click());
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const importedData = JSON.parse(event.target.result);
                    if (confirm(`Deseja restaurar os dados de: ${importedData.user}?`)) {
                        localStorage.setItem('rural_user', importedData.user);
                        localStorage.setItem('rural_data', JSON.stringify(importedData.transactions));
                        location.reload();
                    }
                } catch (err) {
                    alert("Erro ao ler o arquivo de backup.");
                }
            };
            reader.readAsText(file);
        });
    }

    const btnProExport = document.getElementById('btn-pro-export');
    if (btnProExport) {
        btnProExport.onclick = function (e) {
            e.preventDefault(); // Impede qualquer comportamento padrão do navegador

            // 1. Verificação de dados
            if (!transactions || transactions.length === 0) {
                alert('Não há dados para exportar. Adicione transações primeiro.');
                return;
            }

            const profileStr = localStorage.getItem('rural_profile');
            const profile = profileStr ? JSON.parse(profileStr) : {};

            // 2. Construção do CSV String
            let csv = "\uFEFF"; // BOM para acentos no Excel

            // Cabeçalho do Perfil
            csv += `RELATORIO FINANCEIRO RURAL\r\n`;
            csv += `PROPRIEDADE:;${profile.propriedade || 'N/A'}\r\n`;
            csv += `PRODUTOR:;${profile.nome || 'N/A'}\r\n`;
            csv += `DATA:;${new Date().toLocaleDateString('pt-BR')}\r\n\r\n`;

            // Cabeçalho da Tabela
            csv += "Data;Tipo;Categoria;Descricao;Liters;Valor\r\n";

            let totalIn = 0;
            let totalOut = 0;

            // Ordenar dados
            const sorted = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

            sorted.forEach(t => {
                const date = new Date(t.date).toLocaleDateString('pt-BR');
                const type = t.type === 'income' ? 'Entrada' : 'Saida';
                const val = parseFloat(t.amount) || 0;

                if (t.type === 'income') totalIn += val;
                else totalOut += val;

                const desc = (t.desc || "").replace(/;/g, ','); // Remove ponto-e-vírgula da descrição
                const cat = (t.category || "");
                const lit = t.liters ? t.liters.toString().replace('.', ',') : '';
                const valStr = val.toFixed(2).replace('.', ',');

                csv += `${date};${type};${cat};${desc};${lit};${valStr}\r\n`;
            });

            // Totais
            csv += `\r\n;;;;TOTAL ENTRADAS:;${totalIn.toFixed(2).replace('.', ',')}\r\n`;
            csv += `;;;;TOTAL SAIDAS:;${totalOut.toFixed(2).replace('.', ',')}\r\n`;
            csv += `;;;;SALDO:;${(totalIn - totalOut).toFixed(2).replace('.', ',')}\r\n`;

            // 3. Método de Download Seguro usando Blob
            try {
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');

                a.style.display = 'none';
                a.href = url;
                a.download = `livro_caixa_${(profile.propriedade || 'rural').replace(/\s+/g, '_')}.csv`;

                document.body.appendChild(a);
                a.click(); // Dispara o clique

                // Limpeza
                setTimeout(() => {
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                }, 100);

                console.log("Download disparado via Blob");
            } catch (err) {
                console.error("Erro no download:", err);
                alert("Erro ao baixar. Tente usar o Google Chrome se estiver no Safari.");
            }
        };
    }

    window.renderActiveAlerts = () => {
        const list = document.getElementById('active-alerts-list');
        if (!list) return;
        list.innerHTML = '';

        if (marketAlerts.length === 0) {
            list.innerHTML = '<div style="color: var(--color-text-light);">Nenhum alerta configurado.</div>';
            return;
        }

        marketAlerts.forEach((alert, index) => {
            const div = document.createElement('div');
            div.className = 'active-alert-item';
            div.innerHTML = `
                <span>${alert.commodity} ${alert.condition === 'greater' ? '>' : '<'} R$ ${alert.target}</span>
                <button class="btn-remove-alert" onclick="removeAlert(${index})">X</button>
            `;
            list.appendChild(div);
        });
    };

    window.renderDashboardAlerts = () => {
        const list = document.getElementById('dashboard-active-alerts-list');
        if (!list) return;
        list.innerHTML = '';

        if (marketAlerts.length === 0) {
            list.innerHTML = '<div style="color: var(--color-text-light);">Nenhum alerta configurado.</div>';
            return;
        }

        marketAlerts.forEach((alert, index) => {
            const div = document.createElement('div');
            div.className = 'active-alert-item-dashboard'; // Use a specific class for dashboard items
            div.innerHTML = `
                <span>${alert.commodity} ${alert.condition === 'greater' ? '>' : '<'} R$ ${alert.target}</span>
                <button class="btn-remove-alert" onclick="removeAlert(${index})">X</button>
            `;
            list.appendChild(div);
        });
    };

    window.removeAlert = (index) => {
        marketAlerts.splice(index, 1);
        localStorage.setItem('rural_alerts', JSON.stringify(marketAlerts));

        // Updates both modals and dashboard layout sync
        if (typeof renderActiveAlerts === 'function') renderActiveAlerts();
        if (typeof renderDashboardAlerts === 'function') renderDashboardAlerts();
        if (typeof renderMarket === 'function') renderMarket(true);
    };

    // Carga final. Atualiza as views via showPage simulando clique ou chamando inicial
    loadProfile();
    updateDashboard();
    renderTransactions();
    renderMarket();
    renderActiveAlerts();

    // Eventos dos Alertas
    const alertModal = document.getElementById('alert-modal');
    const alertForm = document.getElementById('alert-form');

    // Função para garantir a abertura do modal
    function toggleAlertModal(show) {
        const modal = document.getElementById('alert-modal');
        if (modal) {
            modal.style.display = show ? 'flex' : 'none';
            if (show) {
                modal.classList.add('active');
                renderActiveAlerts();
            } else {
                modal.classList.remove('active');
            }
        }
    }

    // Forçar o clique no botão
    document.body.addEventListener('click', function (e) {
        if (e.target && (e.target.id === 'btn-criar-alerta' || e.target.closest('#btn-criar-alerta'))) {
            console.log('Alerta acionado!');
            toggleAlertModal(true);
        }
        if (e.target && (e.target.id === 'btn-cancel-alert' || e.target.closest('#btn-cancel-alert'))) {
            toggleAlertModal(false);
            if (alertForm) alertForm.reset();
        }
    });

    if (alertModal) {
        alertModal.addEventListener('click', (e) => {
            if (e.target === alertModal) {
                toggleAlertModal(false);
                if (alertForm) alertForm.reset();
            }
        });
    }

    if (alertForm) {
        alertForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const commodity = document.getElementById('alert-commodity').value;
            const condition = document.getElementById('alert-condition').value;
            const targetVal = parseFloat(document.getElementById('alert-target').value.replace(',', '.'));

            if (isNaN(targetVal) || targetVal <= 0) {
                alert('Informe um valor válido.');
                return;
            }

            marketAlerts.push({ commodity, condition, target: targetVal });
            localStorage.setItem('rural_alerts', JSON.stringify(marketAlerts));

            alertForm.reset();
            toggleAlertModal(false);
            renderMarket();
        });
    }

    const btnThemeToggle = document.getElementById('btn-theme-toggle');
    if (btnThemeToggle) {
        btnThemeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');

            if (isDark) {
                btnThemeToggle.textContent = '☀️';
                localStorage.setItem('rural_theme', 'dark');
            } else {
                btnThemeToggle.textContent = '🌙';
                localStorage.setItem('rural_theme', 'light');
            }
        });
    }
});
