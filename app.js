/* ==========================================================================
   1. ESTADO GLOBAL E INICIALIZAÇÃO
   ========================================================================== */
// Global User ID to track current authenticated session
let globalUserId = null;

// Removed immediate welcome check, Auth state observer will handle routing


let transactions = [];
let animals = [];
let marketAlerts = [];
let systemNotifications = [];
let currentType = '';
let currentFilter = 'all';
let animalEditId = null;

// Referências globais para destruir gráficos anteriores ao re-renderizar
let expensesChartInstance = null;
let milkPriceChartInstance = null;
let simulatorChartInstance = null;

const currentYear = new Date().getFullYear();
let currentTimeFilter = 'this_month';

const categories = {
    income: ['Venda de Produção', 'Venda de Animais', 'Outras Receitas'],
    expense: ['Ração', 'Mão de Obra', 'Manutenção', 'Combustível', 'Medicamentos/Nutrição', 'Impostos', 'Outras Despesas']
};

let photoBase64 = null;
let editId = null;
let transactionToDelete = null;

// Lógica de Inicialização a ser chamada pós-auth
async function loadFirebaseData(userId) {
    try {
        const db = window.firebaseDb;
        const { doc, getDoc, collection, getDocs } = window;
        
        // 1. Carregar Perfil/Metadata principal
        const profileRef = window.firebaseDocWrapper(db, 'users', userId);
        const profileSnap = await window.firebaseGetDocWrapper(profileRef);
        
        if (profileSnap.exists()) {
            const data = profileSnap.data();
            
            // Atribuir ao local profile backup (para o resto do app acessar sincronamente como se fosse localStorage)
            localStorage.setItem('rural_profile', JSON.stringify(data.profile || {}));
            localStorage.setItem('rural_user', data.profile?.propriedade || 'Usuário');
            if (data.activeModule) localStorage.setItem('rural_active_module', data.activeModule);
            if (data.goal) localStorage.setItem('rural_goal', data.goal);
            if (data.milkTarget) localStorage.setItem('rural_milk_target', data.milkTarget);
            
            marketAlerts = data.alerts || [];
            systemNotifications = data.notifications || [];
            
            // Theme setup
            if (data.theme === 'dark') {
                document.body.classList.add('dark-mode');
                const themeBtn = document.getElementById('btn-theme-toggle');
                if (themeBtn) themeBtn.textContent = '☀️';
            }
        }

        // 2. Carregar Transações da subcoleção
        const txsRef = window.firebaseCollectionWrapper(db, 'users', userId, 'transactions');
        const txsSnap = await window.firebaseGetDocsWrapper(txsRef);
        
        const loadedTxs = [];
        txsSnap.forEach((doc) => {
            const tData = doc.data();
            loadedTxs.push({
                ...tData,
                date: new Date(tData.dateStr) // Restore Date object
            });
        });
        
        // Sort by date descending
        loadedTxs.sort((a, b) => b.date - a.date);
        transactions = loadedTxs;

        // 3. Carregar Animais da subcoleção
        const animalsRef = window.firebaseCollectionWrapper(db, 'users', userId, 'animals');
        const animalsSnap = await window.firebaseGetDocsWrapper(animalsRef);
        
        const loadedAnimals = [];
        animalsSnap.forEach((doc) => {
            loadedAnimals.push({
                id: doc.id,
                ...doc.data()
            });
        });
        animals = loadedAnimals;

        // Atualizar interface
        const savedUser = localStorage.getItem('rural_user');
        const farmDisplay = document.getElementById('farm-name-display');
        if (savedUser && farmDisplay) farmDisplay.textContent = savedUser;

        updateDashboard();
        renderTransactions();
        renderAnimals();
        
    } catch (error) {
        console.error("Erro ao carregar dados do Firebase:", error);
        window.addNotification("Erro de conexão ao baixar dados da nuvem.", "critical");
    }
}

/* ==========================================================================
   1.5 SISTEMA DE NOTIFICAÇÕES
   ========================================================================== */
window.addNotification = (message, type = 'info') => {
    const newNotif = {
        id: Date.now().toString(),
        message,
        type,
        read: false,
        timestamp: new Date().toISOString()
    };
    systemNotifications.unshift(newNotif); // Add to beginning
    if (systemNotifications.length > 50) systemNotifications.pop(); // Keep max 50
    
    // Atualiza Firebase assincronamente (Fire & Forget)
    if (globalUserId && window.firebaseDb) {
        const db = window.firebaseDb;
        window.firebaseSetDocWrapper(window.firebaseDocWrapper(db, 'users', globalUserId), {
            notifications: systemNotifications
        }, { merge: true }).catch(err => console.error("Erro salvando notificação", err));
    }

    renderSystemNotifications();
};

window.renderSystemNotifications = () => {
    const badge = document.getElementById('notification-badge');
    const list = document.getElementById('notification-list');

    if (!badge || !list) return;

    const unreadCount = systemNotifications.filter(n => !n.read).length;

    if (unreadCount > 0) {
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }

    list.innerHTML = '';

    if (systemNotifications.length === 0) {
        list.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--color-text-light); font-size: 0.9rem;">Nenhuma notificação no momento.</div>';
        return;
    }

    systemNotifications.forEach(n => {
        const item = document.createElement('div');
        item.className = 'notification-item';

        let iconHtml = '';
        if (n.type === 'warning' || n.type === 'critical') {
            iconHtml = '<div class="notification-icon warning"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></div>';
        } else if (n.type === 'success') {
            iconHtml = '<div class="notification-icon success"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg></div>';
        } else {
            iconHtml = '<div class="notification-icon" style="background: rgba(100,100,100,0.1); color: var(--color-text)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg></div>';
        }

        const date = new Date(n.timestamp);
        const timeStr = date.toLocaleDateString('pt-BR') + ' às ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        item.innerHTML = `
            ${iconHtml}
            <div class="notification-content">
                <div class="notification-message" style="${!n.read ? 'font-weight: 600;' : ''}">${n.message}</div>
                <div class="notification-time">${timeStr}</div>
            </div>
        `;
        list.appendChild(item);
    });
};

window.toggleNotificationDropdown = (forceClose = false) => {
    const dropdown = document.getElementById('notification-dropdown');
    const badge = document.getElementById('notification-badge');
    if (!dropdown) return;

    if (forceClose) {
        dropdown.style.display = 'none';
        return;
    }

    if (dropdown.style.display === 'none' || dropdown.style.display === '') {
        dropdown.style.display = 'flex';
        // Mark all as read when opening
        let modified = false;
        systemNotifications.forEach(n => {
            if (!n.read) { n.read = true; modified = true; }
        });
        if (modified) {
            localStorage.setItem('rural_notifications', JSON.stringify(systemNotifications));
            if (badge) badge.style.display = 'none';
            renderSystemNotifications();
        }
    } else {
        dropdown.style.display = 'none';
    }
};

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

// Filtra transações por data
const filterTransactionsByDate = (txs) => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYearStr = currentYear.toString();

    return txs.filter(t => {
        const validDate = t.date instanceof Date ? t.date : new Date(t.date);

        if (isNaN(validDate.getTime())) {
            return currentTimeFilter === 'all';
        }

        const tMonth = validDate.getMonth();
        const tYear = validDate.getFullYear().toString();

        if (currentTimeFilter === 'this_month') {
            return tMonth === currentMonth && tYear === currentYearStr;
        } else if (currentTimeFilter === 'this_year') {
            return tYear === currentYearStr;
        } else if (currentTimeFilter === 'last_3_months') {
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(currentMonth - 3);
            return validDate >= threeMonthsAgo && validDate <= today;
        } else {
            return true;
        }
    });
};

// Pega transações baseadas no mês e ano selecionados e Filtro de Segmento (Leite/Pecuária)
const getFilteredTransactions = () => {
    const activeModule = localStorage.getItem('rural_active_module') || 'Misto';

    const dateFiltered = filterTransactionsByDate(transactions);

    return dateFiltered.filter(t => {
        // Logical rule: 'Leite' is default for old transactions without activity tag
        let activityMatch = true;

        if (activeModule === 'Leite') {
            activityMatch = (t.activity === 'leite' || !t.activity);
        } else if (activeModule === 'Corte') {
            activityMatch = (t.activity === 'pecuaria');
        }

        return activityMatch;
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
        totalBalanceEl.style.color = 'white'; // Always white since background is colored

        const balanceCard = totalBalanceEl.closest('.card');
        if (balanceCard) {
            if (balance < 0) {
                balanceCard.style.background = 'linear-gradient(135deg, var(--color-expense) 0%, #c62828 100%)';
            } else {
                balanceCard.style.background = 'linear-gradient(135deg, var(--color-income) 0%, #2e7d32 100%)';
            }
        }

        if (balance < 0) {
            const lastNotif = systemNotifications.length > 0 ? systemNotifications[0] : null;
            // Evitar spam de notificação idêntica
            if (!lastNotif || lastNotif.message !== 'Atenção: Saldo em Vermelho!') {
                if (typeof addNotification === 'function') addNotification('Atenção: Saldo em Vermelho!', 'critical');
            }
        }
    }

    if (filteredTotalEl) {
        filteredTotalEl.textContent = `Saldo do Filtro: ${formatCurrency(balance)}`;
        filteredTotalEl.style.color = balance < 0 ? 'var(--color-expense)' : 'var(--color-income)';
    }

    // VISÃO GERAL (MISTO) SPECIFIC UI
    const activeModule = localStorage.getItem('rural_active_module') || 'Misto';
    const comparisonChartContainer = document.getElementById('comparison-chart-container');
    const recentFeedContainer = document.getElementById('recent-feed-container');
    const balanceTitleEl = document.getElementById('balance-title');

    if (balanceTitleEl) {
        if (activeModule === 'Misto') balanceTitleEl.textContent = 'Saldo Total (Fazenda)';
        else if (activeModule === 'Leite') balanceTitleEl.textContent = 'Saldo Total (Leite)';
        else if (activeModule === 'Corte') balanceTitleEl.textContent = 'Saldo Total (Pecuária)';
    }

    if (activeModule === 'Misto') {
        if (comparisonChartContainer) comparisonChartContainer.style.display = 'block';
        if (recentFeedContainer) {
            recentFeedContainer.style.display = 'block';
            renderRecentFeed();
        }
    } else {
        if (comparisonChartContainer) comparisonChartContainer.style.display = 'none';
        if (recentFeedContainer) recentFeedContainer.style.display = 'none';
    }

    if (dailyAvgEl) {
        let daysInPeriod = 30; // default approximation
        if (currentTimeFilter === 'this_month') {
            daysInPeriod = new Date(currentYear, new Date().getMonth() + 1, 0).getDate();
        } else if (currentTimeFilter === 'this_year') {
            const startOfYear = new Date(currentYear, 0, 1);
            daysInPeriod = Math.floor((new Date() - startOfYear) / (1000 * 60 * 60 * 24)) || 1;
        } else if (currentTimeFilter === 'last_3_months') {
            daysInPeriod = 90;
        } else {
            daysInPeriod = 365;
        }

        const avg = balance / daysInPeriod;
        dailyAvgEl.textContent = `Média Diária: ${formatCurrency(avg)}`;
        dailyAvgEl.style.color = avg < 0 ? 'var(--color-expense)' : 'var(--color-text-light)';
    }

    // PREÇO MÉDIO DE LEITE
    const milkMetricCard = document.getElementById('milk-metric-card');
    const avgMilkPriceEl = document.getElementById('avg-milk-price');
    const milkIncomes = filtered.filter(t => t.type === 'income' && t.category === 'Venda de Leite');

    if (milkMetricCard && avgMilkPriceEl) {
        if (milkIncomes.length > 0) {
            milkMetricCard.style.display = 'block';
            const totalMilkRevenue = milkIncomes.reduce((acc, t) => acc + t.amount, 0);
            const totalMilkLiters = milkIncomes.reduce((acc, t) => acc + (t.liters || 0), 0);

            let avgPrice = 0;
            if (totalMilkLiters > 0) {
                avgPrice = totalMilkRevenue / totalMilkLiters;
            }

            avgMilkPriceEl.textContent = formatCurrency(avgPrice);

            const savedMilkTarget = localStorage.getItem('rural_milk_target');
            if (savedMilkTarget) {
                const target = parseFloat(savedMilkTarget);
                if (avgPrice < target) {
                    avgMilkPriceEl.style.color = 'var(--color-expense)';
                    AvgNotifyThresholdTracker(avgPrice, target);
                } else {
                    avgMilkPriceEl.style.color = 'var(--color-income)';
                }
            } else {
                avgMilkPriceEl.style.color = 'var(--color-text)';
            }
        } else {
            milkMetricCard.style.display = 'none';
        }
    }

    // Helper p/ Notificação Laticínio
    function AvgNotifyThresholdTracker(current, target) {
        const currentMonthKey = `${currentYear}-${new Date().getMonth()}`;
        const notifiedKey = `rural_notifiedMilk_${currentMonthKey}`;
        let lastNotified = localStorage.getItem(notifiedKey);

        if (lastNotified !== 'true' && typeof addNotification === 'function') {
            addNotification('Atenção: O preço médio por litro está abaixo da sua meta! 📉', 'warning');
            localStorage.setItem(notifiedKey, 'true');
        }
    }

    // SIMULADOR DE METAS DE SAFRA
    const goalProgressSection = document.getElementById('goal-progress-section');
    const goalPercentageText = document.getElementById('goal-percentage');
    const goalProgressFill = document.getElementById('goal-progress-fill');
    const goalCurrentText = document.getElementById('goal-current-text');
    const goalTargetText = document.getElementById('goal-target-text');

    const savedGoalStr = localStorage.getItem('rural_goal');
    if (savedGoalStr && goalProgressSection) {
        const goalValue = parseFloat(savedGoalStr);
        if (goalValue > 0) {
            goalProgressSection.style.display = 'block';
            goalCurrentText.textContent = formatCurrency(Math.max(0, balance));
            goalTargetText.textContent = formatCurrency(goalValue);

            let percentage = (Math.max(0, balance) / goalValue) * 100;
            if (percentage > 100) percentage = 100;

            goalPercentageText.textContent = percentage.toFixed(0) + '%';
            goalProgressFill.style.width = percentage + '%';

            // Lógica de Cores da Barra e Notificações
            const currentMonthKey = `${currentYear}-${new Date().getMonth()}`;
            const notifiedMetaKey = `rural_notifiedMeta_${currentMonthKey}`;
            let lastNotified = localStorage.getItem(notifiedMetaKey) || '0'; // '0', '50', ou '100'

            if (percentage >= 100) {
                goalProgressFill.style.background = '#FFD700'; // Dourado
                goalPercentageText.style.color = '#FFD700';

                if (lastNotified !== '100' && typeof addNotification === 'function') {
                    addNotification('Meta batida! Sua safra está sendo um sucesso! 🏆', 'success');
                    localStorage.setItem(notifiedMetaKey, '100');
                }
            } else {
                goalProgressFill.style.background = 'rgb(0, 150, 0)'; // Verde Normal
                goalPercentageText.style.color = 'var(--color-income)';

                if (percentage >= 50 && lastNotified !== '50' && lastNotified !== '100' && typeof addNotification === 'function') {
                    addNotification('Parabéns! Você chegou na metade da sua meta de lucro! 📈', 'info');
                    localStorage.setItem(notifiedMetaKey, '50');
                }
            }
        } else {
            goalProgressSection.style.display = 'none';
        }
    } else if (goalProgressSection) {
        goalProgressSection.style.display = 'none';
    }

    // CHAMAR RENDERIZAÇÃO DE GRÁFICOS
    renderCharts(filtered);
    renderMarket(filtered);
    renderProjection();
    renderAnimals();
    renderManejoAlerts();
};

/* ==========================================================================
   PREDICTIVE INTELLIGENCE LOGIC
   ========================================================================== */
function renderProjection() {
    try {
        const projCard = document.getElementById('projection-card');
        const projTitle = document.getElementById('proj-title');
        const projProfit = document.getElementById('proj-profit');
        const projLiters = document.getElementById('proj-liters');
        const projMessage = document.getElementById('proj-message');

        if (!projCard || transactions.length === 0) return;

        if (!projTitle || !projProfit || !projLiters || !projMessage) {
            console.warn("renderProjection: Missing DOM elements! Skipping projection render.");
            return;
        }

        // Obter mês e ano atual real independente de filtro
        const today = new Date();
        const currentMonthReal = today.getMonth();
        const currentYearReal = today.getFullYear();

        // Calcular data limite 3 meses
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(currentMonthReal - 3);

        // Filtrar dados dos últimos 3 meses até o momento atual
        const trailingTransactions = transactions.filter(t => {
            if (!t || !t.date) return false;
            const tDate = new Date(t.date);
            return !isNaN(tDate) && tDate >= threeMonthsAgo && tDate <= today;
        });

        if (trailingTransactions.length === 0) {
            projCard.style.display = 'none';
            return;
        }

        // Agregar Entradas, Saídas e Litros dos últimos 3 meses
        let sumIncome = 0;
        let sumExpense = 0;
        let sumLiters = 0;

        trailingTransactions.forEach(t => {
            const amt = parseFloat(t.amount) || 0;
            if (t.type === 'income') {
                sumIncome += amt;
                if ((t.category === 'Venda de Produção' || t.category === 'Venda de Leite') && t.liters && parseFloat(t.liters) > 0) {
                    sumLiters += parseFloat(t.liters);
                }
            } else {
                sumExpense += amt;
            }
        });

        // Média de 3 meses
        const avgProfit = Math.max(0, (sumIncome - sumExpense) / 3);
        const avgLiters = sumLiters / 3;

        // Calcular o Lucro Líquido apenas do Mês ATUAL
        let currentMonthIncome = 0;
        let currentMonthExpense = 0;
        trailingTransactions.forEach(t => {
            const tDate = new Date(t.date);
            if (!isNaN(tDate) && tDate.getMonth() === currentMonthReal && tDate.getFullYear() === currentYearReal) {
                const amt = parseFloat(t.amount) || 0;
                if (t.type === 'income') currentMonthIncome += amt;
                else currentMonthExpense += amt;
            }
        });
        const currentProfit = currentMonthIncome - currentMonthExpense;

        projProfit.textContent = formatCurrency(avgProfit);
        projLiters.textContent = avgLiters.toFixed(0) + ' L';

        const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
        const nextMonthIndex = (currentMonthReal + 1) % 12;
        projTitle.textContent = `Previsão para ${monthNames[nextMonthIndex]}`;

        projMessage.className = '';

        if (avgProfit < currentProfit) {
            projMessage.textContent = "Tendência de queda: Revise seus custos de ração 📉";
            projMessage.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
            projMessage.style.color = 'var(--color-expense)';
        } else {
            projMessage.textContent = "Parabéns! Sua safra está no caminho para bater a meta! 🏆";
            projMessage.style.backgroundColor = 'rgba(0, 150, 0, 0.1)';
            projMessage.style.color = 'var(--color-income)';
        }

        projCard.style.display = 'block';
    } catch (e) {
        console.error("renderProjection Crash: ", e);
    }
}

/* ==========================================================================
   IMPACT SIMULATOR LOGIC
   ========================================================================== */
function renderSimulator(filteredData) {
    const simCard = document.getElementById('simulator-card');
    const milkRange = document.getElementById('sim-milk-range');
    const costRange = document.getElementById('sim-cost-range');
    const milkLabel = document.getElementById('sim-milk-label');
    const costLabel = document.getElementById('sim-cost-label');
    const ctx = document.getElementById('simulatorChart');

    if (!simCard || !milkRange || !costRange || !ctx) return;

    if (filteredData.length === 0) {
        simCard.style.display = 'none';
        return;
    }
    simCard.style.display = 'block';

    const deltaMilkPrice = parseFloat(milkRange.value) || 0;
    const deltaCostPercent = parseFloat(costRange.value) || 0;

    milkLabel.textContent = (deltaMilkPrice >= 0 ? '+ ' : '- ') + formatCurrency(Math.abs(deltaMilkPrice)) + '/L';
    milkLabel.style.color = deltaMilkPrice >= 0 ? 'var(--color-income)' : 'var(--color-expense)';

    costLabel.textContent = (deltaCostPercent >= 0 ? '+ ' : '- ') + Math.abs(deltaCostPercent) + '%';
    costLabel.style.color = deltaCostPercent <= 0 ? 'var(--color-income)' : 'var(--color-expense)';

    let baseIncomeOthers = 0;
    let baseLiters = 0;
    let baseMilkRevenue = 0;
    let baseExpense = 0;

    filteredData.forEach(t => {
        const amt = parseFloat(t.amount) || 0;
        if (t.type === 'income') {
            if ((t.category === 'Venda de Produção' || t.category === 'Venda de Leite') && t.liters && parseFloat(t.liters) > 0) {
                baseLiters += parseFloat(t.liters);
                baseMilkRevenue += amt;
            } else {
                baseIncomeOthers += amt;
            }
        } else {
            baseExpense += amt;
        }
    });

    const currentProfit = (baseIncomeOthers + baseMilkRevenue) - baseExpense;

    const baseMilkPrice = baseLiters > 0 ? (baseMilkRevenue / baseLiters) : 0;
    const newMilkPrice = Math.max(0, baseMilkPrice + deltaMilkPrice);
    const simulatedMilkRevenue = baseLiters * newMilkPrice;

    const simulatedExpense = baseExpense * (1 + (deltaCostPercent / 100));
    const simulatedProfit = (baseIncomeOthers + simulatedMilkRevenue) - simulatedExpense;

    const isDark = document.body.classList.contains('dark-mode');
    const textColor = isDark ? '#e0e0e0' : '#666';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

    if (simulatorChartInstance) {
        simulatorChartInstance.destroy();
    }

    simulatorChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Cenário Atual', 'Cenário Simulado'],
            datasets: [{
                label: 'Lucro Líquido (R$)',
                data: [currentProfit, simulatedProfit],
                backgroundColor: [
                    currentProfit >= 0 ? 'rgba(0, 150, 0, 0.6)' : 'rgba(200, 0, 0, 0.6)',
                    simulatedProfit >= 0 ? 'rgba(0, 150, 0, 0.9)' : 'rgba(200, 0, 0, 0.9)'
                ],
                borderColor: [
                    currentProfit >= 0 ? 'rgba(0, 150, 0, 1)' : 'rgba(200, 0, 0, 1)',
                    simulatedProfit >= 0 ? 'rgba(0, 150, 0, 1)' : 'rgba(200, 0, 0, 1)'
                ],
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return formatCurrency(context.raw);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: gridColor },
                    ticks: {
                        color: textColor,
                        callback: function (value) {
                            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
                        }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: textColor, font: { weight: 'bold' } }
                }
            }
        }
    });
}

// Escutar sliders globals para recalcular na hora
document.addEventListener('DOMContentLoaded', () => {
    const milkRange = document.getElementById('sim-milk-range');
    const costRange = document.getElementById('sim-cost-range');

    if (milkRange) {
        milkRange.addEventListener('input', () => {
            renderSimulator(getFilteredTransactions());
        });
    }

    if (costRange) {
        costRange.addEventListener('input', () => {
            renderSimulator(getFilteredTransactions());
        });
    }
});

let comparisonChartInstance = null;

/* ==========================================================================
   CHART.JS LOGIC
   ========================================================================== */
function renderCharts(filteredData) {
    const chartsContainer = document.getElementById('charts-container');
    if (!chartsContainer || filteredData.length === 0) {
        if (chartsContainer) chartsContainer.style.display = 'none';
        return;
    }

    chartsContainer.style.display = 'grid'; // Retorna p/ grid em vez de none

    // Coletar cor baseada no tema
    const isDark = document.body.classList.contains('dark-mode');
    const textColor = isDark ? '#e0e0e0' : '#666';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

    renderExpensesDonut(filteredData, textColor);
    renderMilkPriceLine(filteredData, textColor, gridColor);
    renderComparisonChart(filteredData, textColor, gridColor);
}

function renderComparisonChart(filteredData, textColor, gridColor) {
    const ctxEl = document.getElementById('comparisonChart');
    if (!ctxEl) return;

    if (comparisonChartInstance) {
        comparisonChartInstance.destroy();
    }

    const activeModule = localStorage.getItem('rural_active_module') || 'Misto';
    if (activeModule !== 'Misto') {
        return; // Only render when Dashboard is global
    }

    // Calcular Balanço por Atividade
    let milkIncome = 0, milkExpense = 0;
    let meatIncome = 0, meatExpense = 0;

    filteredData.forEach(t => {
        const amt = parseFloat(t.amount) || 0;
        const isLeite = (t.activity !== 'pecuaria');

        if (t.type === 'income') {
            if (isLeite) milkIncome += amt;
            else meatIncome += amt;
        } else {
            if (isLeite) milkExpense += amt;
            else meatExpense += amt;
        }
    });

    if (milkIncome === 0 && meatIncome === 0 && milkExpense === 0 && meatExpense === 0) {
        ctxEl.style.display = 'none';
        return;
    }

    ctxEl.style.display = 'block';

    comparisonChartInstance = new Chart(ctxEl, {
        type: 'bar',
        data: {
            labels: ['Leite 🐄', 'Pecuária 🥩'],
            datasets: [
                {
                    label: 'Faturamento',
                    data: [milkIncome, meatIncome],
                    backgroundColor: '#00E676', // Neon Green
                    borderRadius: 6,
                    barPercentage: 0.8,
                    categoryPercentage: 0.7
                },
                {
                    label: 'Custos',
                    data: [milkExpense, meatExpense],
                    backgroundColor: '#FF5252', // Vibrant Red
                    borderRadius: 6,
                    barPercentage: 0.8,
                    categoryPercentage: 0.7
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: textColor,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 15,
                        font: { size: 12, weight: 'bold' }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return context.dataset.label + ': ' + new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.raw);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: gridColor },
                    ticks: {
                        color: textColor,
                        callback: function (value) {
                            return 'R$ ' + (value / 1000 >= 1 ? (value / 1000).toFixed(1) + 'k' : value);
                        }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: textColor, font: { weight: 'bold' } }
                }
            }
        }
    });
}

function renderExpensesDonut(filteredData, textColor) {
    const ctx = document.getElementById('expensesChart');
    if (!ctx) return;

    if (expensesChartInstance) {
        expensesChartInstance.destroy();
    }

    // 1. Agregar despesas por categoria
    const expenses = filteredData.filter(t => t.type === 'expense');

    if (expenses.length === 0) {
        // Sem dados suficientes para gráfico
        ctx.style.display = 'none';
        return;
    }

    ctx.style.display = 'block';

    const catTotals = {};
    expenses.forEach(t => {
        const cat = t.category || 'Outras';
        catTotals[cat] = (catTotals[cat] || 0) + parseFloat(t.amount);
    });

    const labels = Object.keys(catTotals);
    const data = Object.values(catTotals);

    // Paleta de Cores Dinâmica Padrão Agro
    const bgColors = [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#E7E9ED'
    ];

    expensesChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: bgColors.slice(0, labels.length),
                borderWidth: 2,
                borderColor: document.body.classList.contains('dark-mode') ? '#1e1e1e' : '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: textColor, font: { size: 11, family: "'Inter', sans-serif" } }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let val = context.parsed;
                            return ' R$ ' + val.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                        }
                    }
                }
            }
        } // end options
    });
}

function renderMilkPriceLine(filteredData, textColor, gridColor) {
    const ctx = document.getElementById('milkPriceChart');
    if (!ctx) return;

    if (milkPriceChartInstance) {
        milkPriceChartInstance.destroy();
    }

    // Para evolução, queremos todos os registros de leite independente do mês selecionado
    // Se o user quiser ver "Todos os meses", mostramos o ano atual inteiro.
    // Vamos usar a variável global 'transactions' ao invés de 'filteredData' para ver a linha do tempo.
    const milkSales = transactions.filter(t => {
        const d = new Date(t.date);
        return t.type === 'income' && t.category === 'Venda de Leite' && d.getFullYear() === currentYear;
    });

    if (milkSales.length === 0) {
        ctx.style.display = 'none';
        return;
    }

    ctx.style.display = 'block';

    // Agrupar vendas por mês (0 a 11)
    const monthlyAgg = {};
    milkSales.forEach(t => {
        const d = new Date(t.date);
        const m = d.getMonth(); // 0 a 11
        if (!monthlyAgg[m]) {
            monthlyAgg[m] = { revenue: 0, liters: 0 };
        }
        monthlyAgg[m].revenue += parseFloat(t.amount);
        monthlyAgg[m].liters += parseFloat(t.liters || 0);
    });

    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const labels = [];
    const prices = [];

    // Ordenar de Janeiro a Dezembro o que tiver
    const sortedMonths = Object.keys(monthlyAgg).map(Number).sort((a, b) => a - b);

    sortedMonths.forEach(m => {
        labels.push(monthNames[m]);
        const agg = monthlyAgg[m];
        let avg = agg.liters > 0 ? (agg.revenue / agg.liters) : 0;
        prices.push(avg);
    });

    milkPriceChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Preço Médio (R$/L)',
                data: prices,
                borderColor: '#4BC0C0',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderWidth: 2,
                pointBackgroundColor: '#4BC0C0',
                fill: true,
                tension: 0.3 // curva mais suave
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { family: "'Inter', sans-serif" } }
                },
                y: {
                    grid: { color: gridColor },
                    ticks: {
                        color: textColor,
                        font: { family: "'Inter', sans-serif" },
                        callback: function (value) { return 'R$ ' + value; }
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let val = context.parsed.y;
                            return ' R$ ' + val.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                        }
                    }
                }
            }
        }
    });
}

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
      
      <div style="display: flex; align-items: center; gap: 1rem;">
          <div class="transaction-amount ${t.type}">
            ${sign} ${formatCurrency(t.amount)}
          </div>
          
          <div class="transaction-actions" style="display: flex; gap: 0.5rem; opacity: 0.7;">
              <button onclick="editTransaction(${t.id})" style="background: transparent; border: none; cursor: pointer; color: var(--color-text-light); transition: opacity 0.2s; padding: 4px;" title="Editar">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
              <button onclick="deleteTransaction(${t.id})" style="background: transparent; border: none; cursor: pointer; color: rgb(200, 0, 0); transition: opacity 0.2s; padding: 4px;" title="Excluir">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
              </button>
          </div>
      </div>
    `;
    return item;
    return item;
};

window.renderRecentFeed = () => {
    const feedContainer = document.getElementById('recent-transactions-list');
    if (!feedContainer) return;

    // Get the global unfiltered transactions, sort by newest first, and take top 5
    const recentTx = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

    feedContainer.innerHTML = '';

    if (recentTx.length === 0) {
        feedContainer.innerHTML = '<p style="text-align: center; color: var(--color-text-light); font-size: 0.9rem; margin-top: 1rem;">Nenhuma movimentação recente</p>';
        return;
    }

    recentTx.forEach(t => {
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '0.8rem';
        item.style.background = 'var(--color-bg)';
        item.style.borderRadius = '8px';
        item.style.borderLeft = `4px solid ${t.type === 'income' ? 'var(--color-income)' : 'var(--color-expense)'}`;

        const isLeite = t.activity !== 'pecuaria'; // retro-compatible default
        const emoji = isLeite ? '🐄' : '🥩';

        const amountStr = formatCurrency(t.amount);
        const nameStr = t.desc;
        const color = t.type === 'income' ? 'var(--color-income)' : 'var(--color-expense)';

        // Ensure date is a Date object
        const validDate = t.date instanceof Date ? t.date : new Date(t.date);

        item.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.8rem;">
                <span style="font-size: 1.2rem;" title="${isLeite ? 'Leite' : 'Pecuária'}">${emoji}</span>
                <div style="display: flex; flex-direction: column;">
                    <span style="font-weight: 600; font-size: 0.9rem; color: var(--color-text);">${nameStr}</span>
                    <span style="font-size: 0.75rem; color: var(--color-text-light);">${validDate.toLocaleDateString('pt-BR', { timeZone: 'UTC' })} • ${t.category}</span>
                </div>
            </div>
            <span style="font-weight: 700; font-size: 0.95rem; color: ${color};">${t.type === 'income' ? '+' : '-'}${amountStr}</span>
        `;
        feedContainer.appendChild(item);
    });
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
   3.7 MÓDULO REBANHO (LÓGICA TÉCNICA)
   ========================================================================== */
window.renderAnimals = () => {
    const list = document.getElementById('animals-list');
    const totalAnimalsEl = document.getElementById('total-animals');
    const totalLactatingEl = document.getElementById('total-lactating');
    const totalDryEl = document.getElementById('total-dry');

    if (!list) return;

    list.innerHTML = '';
    let countLactating = 0;
    let countDry = 0;

    if (animals.length === 0) {
        list.innerHTML = '<div style="padding: 2.5rem; text-align: center; color: var(--color-text-light);">Nenhum animal cadastrado no rebanho.</div>';
        if (totalAnimalsEl) totalAnimalsEl.textContent = '0';
        if (totalLactatingEl) totalLactatingEl.textContent = '0';
        if (totalDryEl) totalDryEl.textContent = '0';
        return;
    }

    const today = new Date();
    today.setHours(0,0,0,0);

    // Sort by Brinco/ID
    const sortedAnimals = [...animals].sort((a,b) => (a.animalId || "").localeCompare(b.animalId || ""));

    sortedAnimals.forEach(animal => {
        const lastCalvingStr = animal.lastCalving.replace(/-/g, '/');
        const lastCalving = new Date(lastCalvingStr);
        lastCalving.setHours(0, 0, 0, 0);
        
        const del = Math.floor((today - lastCalving) / (1000 * 60 * 60 * 24));
        
        let status = 'Novilha';
        let statusClass = 'status-novilha';
        
        if (del >= 0) {
            if (del < 305) {
                status = 'Lactação';
                statusClass = 'status-lactacao';
                countLactating++;
            } else {
                status = 'Secagem Necessária';
                statusClass = 'status-secagem';
                countDry++;
            }
        }

        // Progress Calculation (305 days cycle)
        let progress = (del / 305) * 100;
        if (progress > 100) progress = 100;
        if (progress < 0) progress = 0;

        // Proximo Parto logic
        let nextCalvingDate = null;
        let daysToCalving = null;
        if (animal.insemination) {
            const insDateStr = animal.insemination.replace(/-/g, '/');
            const insDate = new Date(insDateStr);
            insDate.setHours(0, 0, 0, 0);
            
            nextCalvingDate = new Date(insDate);
            nextCalvingDate.setDate(insDate.getDate() + 283);
            daysToCalving = Math.floor((nextCalvingDate - today) / (1000 * 60 * 60 * 24));
        }

        const card = document.createElement('div');
        card.className = 'animal-card';
        card.innerHTML = `
            <div class="animal-card-header">
                <div class="animal-info">
                    <div class="animal-avatar">🐄</div>
                    <div>
                        <div class="animal-name">${animal.animalId} ${animal.name ? '- ' + animal.name : ''}</div>
                        <div class="animal-breed">${animal.breed || 'Raça não inf.'}</div>
                    </div>
                </div>
                <div class="status-tag ${statusClass}">${status}</div>
            </div>

            <div class="lactation-progress-container">
                <div class="lactation-progress-labels">
                    <span>DEL: ${del >= 0 ? del : 0} dias</span>
                    <span>Meta: 305 dias</span>
                </div>
                <div class="lactation-progress-bar-bg">
                    <div class="lactation-progress-fill" style="width: ${progress}%; background-color: ${del >= 305 ? '#ed8936' : 'var(--color-income)'}"></div>
                </div>
            </div>

            <div class="animal-details">
                <div>
                    <strong>Último Parto:</strong><br>
                    ${lastCalving.toLocaleDateString('pt-BR')}
                </div>
                <div>
                    <strong>Próximo Parto:</strong><br>
                    ${nextCalvingDate ? nextCalvingDate.toLocaleDateString('pt-BR') : 'Não inseminada'}
                    ${daysToCalving !== null ? `<br><small>(${daysToCalving} dias rest.)</small>` : ''}
                </div>
            </div>
            
            <div style="display: flex; gap: 10px; margin-top: 10px; justify-content: flex-end;">
                <button onclick="editAnimal('${animal.id}')" style="background: transparent; color: var(--color-income); padding: 5px; font-size: 0.8rem; border: 1px solid var(--color-income); border-radius: 4px;">Editar</button>
                <button onclick="deleteAnimal('${animal.id}')" style="background: transparent; color: var(--color-expense); padding: 5px; font-size: 0.8rem; border: 1px solid var(--color-expense); border-radius: 4px;">Excluir</button>
            </div>
        `;
        list.appendChild(card);
    });

    if (totalAnimalsEl) totalAnimalsEl.textContent = animals.length;
    if (totalLactatingEl) totalLactatingEl.textContent = countLactating;
    if (totalDryEl) totalDryEl.textContent = countDry;
};

window.saveAnimal = async (e) => {
    e.preventDefault();
    if (!globalUserId) return;

    const animalId = document.getElementById('animal-id').value.trim();
    const name = document.getElementById('animal-name').value.trim();
    const breed = document.getElementById('animal-breed').value.trim();
    const lastCalving = document.getElementById('animal-last-calving').value;
    const insemination = document.getElementById('animal-insemination').value;

    if (!animalId || !lastCalving) {
        alert("Brinco e Data de Parto são obrigatórios.");
        return;
    }

    const animalData = {
        animalId,
        name,
        breed,
        lastCalving,
        insemination: insemination || null,
        updatedAt: new Date().toISOString()
    };

    try {
        const db = window.firebaseDb;
        const id = animalEditId || Date.now().toString();
        const animalRef = window.firebaseDocWrapper(db, 'users', globalUserId, 'animals', id);
        
        await window.firebaseSetDocWrapper(animalRef, animalData);
        
        // Update local state
        const index = animals.findIndex(a => a.id === id);
        if (index !== -1) {
            animals[index] = { id, ...animalData };
        } else {
            animals.push({ id, ...animalData });
        }

        closeAnimalModal();
        renderAnimals();
        updateDashboard();
    } catch (error) {
        console.error("Erro ao salvar animal:", error);
        alert("Erro ao salvar animal: " + error.message);
    }
};

window.deleteAnimal = async (id) => {
    if (!confirm("Deseja realmente excluir este animal do rebanho?")) return;
    
    try {
        const db = window.firebaseDb;
        const animalRef = window.firebaseDocWrapper(db, 'users', globalUserId, 'animals', id);
        await window.firebaseDeleteDocWrapper(animalRef);
        
        animals = animals.filter(a => a.id !== id);
        renderAnimals();
        updateDashboard();
    } catch (error) {
        console.error("Erro ao excluir animal:", error);
    }
};

window.editAnimal = (id) => {
    const animal = animals.find(a => a.id === id);
    if (!animal) return;

    // Abrir o modal
    const modal = document.getElementById('animal-modal');
    if (modal) modal.classList.add('active');

    // Preencher campos
    document.getElementById('animal-id').value = animal.animalId || '';
    document.getElementById('animal-name').value = animal.name || '';
    document.getElementById('animal-breed').value = animal.breed || '';
    document.getElementById('animal-last-calving').value = animal.lastCalving || '';
    document.getElementById('animal-insemination').value = animal.insemination || '';

    animalEditId = id;
};

window.openAnimalModal = () => {
    const modal = document.getElementById('animal-modal');
    const form = document.getElementById('animal-form');
    if (form) form.reset();
    if (modal) modal.classList.add('active');
    animalEditId = null;
};

window.closeAnimalModal = () => {
    const modal = document.getElementById('animal-modal');
    const form = document.getElementById('animal-form');
    if (modal) modal.classList.remove('active');
    if (form) form.reset();
    animalEditId = null;
};

window.renderManejoAlerts = () => {
    const section = document.getElementById('dashboard-manejo-alerts-section');
    const list = document.getElementById('dashboard-manejo-alerts-list');
    if (!section || !list) return;

    list.innerHTML = '';
    const alerts = [];
    const today = new Date();
    today.setHours(0,0,0,0);

    animals.forEach(animal => {
        const lastCalvingStr = animal.lastCalving.replace(/-/g, '/');
        const lastCalving = new Date(lastCalvingStr);
        lastCalving.setHours(0, 0, 0, 0);

        const del = Math.floor((today - lastCalving) / (1000 * 60 * 60 * 24));

        // 1. Alerta de Secagem (DEL >= 305)
        if (del >= 305) {
            alerts.push({
                type: 'secagem',
                message: `Vaca ${animal.animalId}: Iniciar Secagem (DEL ${del} dias)`
            });
        } 
        
        // 2. Alerta de Nutrição (Pico de Produção - 60 dias)
        if (del === 60) {
            alerts.push({
                type: 'nutricao',
                message: `Vaca ${animal.animalId}: Pico de Produção (Ajustar Nutrição)`
            });
        }

        // 3. Alerta de Pré-Parto (15 dias antes)
        if (animal.insemination) {
            const insDateStr = animal.insemination.replace(/-/g, '/');
            const insDate = new Date(insDateStr);
            insDate.setHours(0, 0, 0, 0);

            const calvingDate = new Date(insDate);
            calvingDate.setDate(insDate.getDate() + 283);
            const daysToParto = Math.floor((calvingDate - today) / (1000 * 60 * 60 * 24));

            if (daysToParto <= 15 && daysToParto >= 0) {
                alerts.push({
                    type: 'parto',
                    message: `Vaca ${animal.animalId}: Pré-Parto Crítico (${daysToParto} dias rest.)`
                });
            }
        }
    });

    if (alerts.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    alerts.forEach(alert => {
        const div = document.createElement('div');
        div.className = 'dashboard-alert-item';
        
        // Color customization based on type
        let borderColor = '#ed8936'; // orange (secagem/nutricao)
        if (alert.type === 'parto') borderColor = 'var(--color-expense)'; // red-ish
        if (alert.type === 'nutricao') borderColor = 'var(--color-income)'; // green-ish
        
        div.style.borderLeftColor = borderColor;
        div.innerHTML = `<span><strong>Manejo:</strong> ${alert.message}</span>`;
        list.appendChild(div);
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
        const profSegmento = document.getElementById('prof-segmento');
        const profGoal = document.getElementById('prof-goal');
        const profMilkTarget = document.getElementById('prof-milk-target');

        if (profileStr) {
            const profile = JSON.parse(profileStr);
            if (profNome && profile.nome !== undefined) profNome.value = profile.nome;
            if (profPropriedade && profile.propriedade !== undefined) {
                profPropriedade.value = profile.propriedade;
                const farmDisplay = document.getElementById('farm-name-display');
                if (farmDisplay) farmDisplay.textContent = profile.propriedade;
            }
            if (profCpf && profile.cpf !== undefined) profCpf.value = profile.cpf;
            if (profIe && profile.ie !== undefined) profIe.value = profile.ie;
            if (profLocal && profile.local !== undefined) profLocal.value = profile.local;
            if (profTipo && profile.tipo !== undefined) profTipo.value = profile.tipo;
            if (profSegmento && profile.segmento !== undefined) profSegmento.value = profile.segmento;

            // Toggle Segment Buttons in Dashboard depending on Profile
            const btnLeite = document.getElementById('module-leite-btn');
            const btnCorte = document.getElementById('module-corte-btn');
            const seg = profile.segmento || 'Misto';
            if (btnLeite) btnLeite.style.display = (seg === 'Misto' || seg === 'Leite') ? 'flex' : 'none';
            if (btnCorte) btnCorte.style.display = (seg === 'Misto' || seg === 'Corte') ? 'flex' : 'none';

        } else if (oldUser) {
            if (profPropriedade) profPropriedade.value = oldUser;
            const farmDisplay = document.getElementById('farm-name-display');
            if (farmDisplay) farmDisplay.textContent = oldUser;
        }

        const savedGoal = localStorage.getItem('rural_goal');
        if (savedGoal && profGoal) {
            profGoal.value = savedGoal;
        }

        const savedMilkTarget = localStorage.getItem('rural_milk_target');
        if (savedMilkTarget && profMilkTarget) {
            profMilkTarget.value = savedMilkTarget;
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
    const headsGroup = document.getElementById('heads-group');
    const headsInput = document.getElementById('heads');
    const modal = document.getElementById('modal');
    const descInput = document.getElementById('desc');

    let currentSegment = 'Misto';
    const rawProfile = localStorage.getItem('rural_profile');
    if (rawProfile) {
        const profile = JSON.parse(rawProfile);
        if (profile.segmento) currentSegment = profile.segmento;
    }
    const currentActiveModule = localStorage.getItem('rural_active_module') || 'Misto';

    // Evaluate active context (if module is specifically selected, that rules, else profile rules)
    const contextSegment = currentActiveModule !== 'Misto' ? currentActiveModule : currentSegment;

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
    } else {
        if (modalTitle) {
            modalTitle.textContent = 'Nova Saída';
            modalTitle.style.color = 'var(--color-expense)';
        }
    }

    const tSegLeite = document.getElementById('t_seg_leite');
    const tSegCorte = document.getElementById('t_seg_corte');

    if (tSegLeite && tSegCorte) {
        if (contextSegment === 'Corte') {
            tSegCorte.checked = true;
        } else {
            tSegLeite.checked = true;
        }
    }

    // Trigger visual update for Liters/Heads fields
    if (typeof window.updateModalInputs === 'function') {
        window.updateModalInputs();
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
    editId = null;
    if (receiptPreviewName) receiptPreviewName.textContent = '';
};

// --- FUNÇÕES DE CRUD EM TEMPO DE EXECUÇÃO ---
window.deleteTransaction = (id) => {
    transactionToDelete = id;
    const modal = document.getElementById('delete-confirm-modal');
    if (modal) modal.classList.add('active');
};

window.editTransaction = (id) => {
    const t = transactions.find(t => t.id === id);
    if (!t) return;

    // Configura o modal p/ a edição
    openModal(t.type);
    editId = id;

    const descInput = document.getElementById('desc');
    const categoryInput = document.getElementById('category');
    const amountInput = document.getElementById('amount');
    const litersInput = document.getElementById('liters');
    const dateInput = document.getElementById('date-input');

    if (descInput) descInput.value = t.desc || '';
    if (categoryInput) categoryInput.value = t.category || '';
    if (amountInput) amountInput.value = t.amount || '';
    if (litersInput && t.liters) litersInput.value = t.liters;

    // Sync Atividade Segment Toggle for Editing
    const tSegLeite = document.getElementById('t_seg_leite');
    const tSegCorte = document.getElementById('t_seg_corte');
    const headsInput = document.getElementById('heads');

    if (tSegLeite && tSegCorte) {
        if (t.activity === 'pecuaria') {
            tSegCorte.checked = true;
        } else {
            tSegLeite.checked = true;
        }
        if (typeof window.updateModalInputs === 'function') {
            window.updateModalInputs();
        }
    }

    if (headsInput && t.heads) headsInput.value = t.heads;

    // Set date correctly based on timezone/stored format
    if (dateInput) {
        const d = new Date(t.date);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
    }

    if (t.photoData) {
        photoBase64 = t.photoData;
        const receiptPreviewName = document.getElementById('receipt-preview-name');
        if (receiptPreviewName) receiptPreviewName.textContent = '(Comprovante já anexado)';
    }
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

    // 0. Habilitar Persistência Offline do Firestore
    if (window.firebaseDb && window.enableIndexedDbPersistenceWrapper) {
        window.enableIndexedDbPersistenceWrapper(window.firebaseDb)
            .then(() => {
                console.log("Persistência Offline habilitada com sucesso. Os dados serão salvos localmente e sincronizados quando houver internet.");
            })
            .catch((err) => {
                if (err.code == 'failed-precondition') {
                    console.warn("Aviso: Múltiplas abas abertas. A persistência offline do Firestore só funciona em uma aba contínua.");
                } else if (err.code == 'unimplemented') {
                    console.warn("Aviso: O navegador não suporta a persistência offline do Firestore.");
                }
            });
    }

    // 1. Firebase Auth Observer
    const authScreenOriginal = document.getElementById('auth-screen');
    const firebaseAuthScreen = document.getElementById('firebase-auth-screen');
    const recentFeed = document.getElementById('recent-feed');
    
    if (window.firebaseAuth && window.onAuthStateChangedWrapper) {
        window.onAuthStateChangedWrapper(window.firebaseAuth, (user) => {
            if (user) {
                // Usuário logado
                globalUserId = user.uid;
                if (firebaseAuthScreen) firebaseAuthScreen.style.display = 'none';
                
                // Mostra Dashboard se escondido
                const appContainer = document.querySelector('.app-container');
                const bottomNav = document.querySelector('.bottom-nav');
                if (appContainer) appContainer.style.display = 'block';
                if (bottomNav) bottomNav.style.display = 'flex';

                // Verifica se já fez o "Welcome" (setup inicial)
                const profileRef = window.firebaseDocWrapper(window.firebaseDb, 'users', user.uid);
                window.firebaseGetDocWrapper(profileRef).then(snap => {
                    if (!snap.exists() || !snap.data().profile?.propriedade) {
                        // Primeira vez logando, precisa definir o nome da fazenda
                        if (authScreenOriginal) authScreenOriginal.style.display = 'flex';
                    } else {
                        if (authScreenOriginal) authScreenOriginal.style.display = 'none';
                        loadFirebaseData(user.uid);
                    }
                });
            } else {
                // Não logado
                globalUserId = null;
                
                // 3- Limpeza de Estado: Zerar dados locais
                transactions = [];
                marketAlerts = [];
                systemNotifications = [];
                localStorage.removeItem('rural_user');
                localStorage.removeItem('rural_profile');
                localStorage.removeItem('rural_active_module');
                localStorage.removeItem('rural_goal');
                localStorage.removeItem('rural_milk_target');
                
                // Limpar UI residual
                // No longer overwriting header title with static string
                if (typeof updateDashboard === 'function') updateDashboard();
                if (typeof renderTransactions === 'function') renderTransactions();
                if (typeof renderMarket === 'function') renderMarket();
                if (typeof renderSystemNotifications === 'function') renderSystemNotifications();

                // 4- Redirecionamento e Observer UI: Mostrar tela de login novamente
                if (firebaseAuthScreen) firebaseAuthScreen.style.display = 'flex';
                if (authScreenOriginal) authScreenOriginal.style.display = 'none';
                
                const appContainer = document.querySelector('.app-container');
                const bottomNav = document.querySelector('.bottom-nav');
                if (appContainer) appContainer.style.display = 'none'; // Esconder Dashboard
                if (bottomNav) bottomNav.style.display = 'none';

                const fbAuthForm = document.getElementById('firebase-auth-form');
                if (fbAuthForm) fbAuthForm.reset();
            }
        });
    }

    // Lógica do Form de Auth Firebase
    const btnFbSignup = document.getElementById('btn-fb-signup');
    const btnFbLogin = document.getElementById('btn-fb-login');
    const authErrorMsg = document.getElementById('auth-error-message');
    
    const getAuthCredentials = () => {
        const email = document.getElementById('fb-email').value.trim();
        const pwd = document.getElementById('fb-password').value.trim();
        if (authErrorMsg) authErrorMsg.style.display = 'none';
        return { email, pwd };
    };

    if (btnFbLogin) {
        btnFbLogin.addEventListener('click', async (e) => {
            e.preventDefault();
            const { email, pwd } = getAuthCredentials();
            if(!email || !pwd) return;
            try {
                await window.signInWrapper(window.firebaseAuth, email, pwd);
            } catch (err) {
                if(authErrorMsg) {
                    authErrorMsg.textContent = "Erro ao entrar: " + err.message;
                    authErrorMsg.style.display = 'block';
                }
            }
        });
    }

    if (btnFbSignup) {
        btnFbSignup.addEventListener('click', async (e) => {
            e.preventDefault();
            const { email, pwd } = getAuthCredentials();
            if(!email || !pwd) return;
            try {
                const userCred = await window.signUpWrapper(window.firebaseAuth, email, pwd);
                // Criação do documento base
                await window.firebaseSetDocWrapper(
                    window.firebaseDocWrapper(window.firebaseDb, 'users', userCred.user.uid), 
                    { created_at: new Date().toISOString() }
                );
            } catch (err) {
                if(authErrorMsg) {
                    authErrorMsg.textContent = "Erro ao cadastrar: " + err.message;
                    authErrorMsg.style.display = 'block';
                }
            }
        });
    }

    // 2. Setup Inicial (Welcome Screen original)
    const btnStartManage = document.getElementById('btn-start-manage');
    const userNameInput = document.getElementById('user-name');
    if (btnStartManage) {
        btnStartManage.addEventListener('click', async (e) => {
            e.preventDefault();
            const name = userNameInput ? userNameInput.value.trim() : 'Minha Fazenda';

            const initialProfile = {
                nome: '',
                propriedade: name,
                cpf: '',
                ie: '',
                local: '',
                tipo: '',
                segmento: 'Misto' // Atividade inicial
            };
            
            if (globalUserId && window.firebaseDb) {
                await window.firebaseSetDocWrapper(
                    window.firebaseDocWrapper(window.firebaseDb, 'users', globalUserId), 
                    { profile: initialProfile }, 
                    { merge: true }
                );
                
                if (authScreenOriginal) authScreenOriginal.style.display = 'none';
                loadFirebaseData(globalUserId);
                showPage('tab-resumo');
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

    // Filtro de Tempo (Período)
    const timeFilterEl = document.getElementById('time-filter');

    if (timeFilterEl) {
        timeFilterEl.value = currentTimeFilter;
        timeFilterEl.addEventListener('change', (e) => {
            currentTimeFilter = e.target.value;
            updateDashboard();
            renderTransactions();
        });
    }
    // Autocomplete IBGE para Cidades  
    const setupIBGEAutocomplete = () => {
        const inputLocal = document.getElementById('prof-local');
        const suggestionsList = document.getElementById('city-suggestions');
        if (!inputLocal || !suggestionsList) return;

        let ibgeCitiesCache = null;

        // Baixa a lista de cidades ao focar no campo pela primeira vez
        inputLocal.addEventListener('focus', async () => {
            if (!ibgeCitiesCache) {
                try {
                    const response = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios');
                    const data = await response.json();

                    // Formata "Nome da Cidade - UF" com tratativa segura para hierarquias ausentes
                    ibgeCitiesCache = data.map(city => {
                        let uf = '';
                        if (city.microrregiao?.mesorregiao?.UF?.sigla) {
                            uf = city.microrregiao.mesorregiao.UF.sigla;
                        } else if (city['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla) {
                            uf = city['regiao-imediata']['regiao-intermediaria'].UF.sigla;
                        }
                        return uf ? `${city.nome} - ${uf}` : city.nome;
                    });
                } catch (err) {
                    console.error("Falha ao buscar cidades do IBGE:", err);
                }
            }
        });

        // Filtra os resultados instantaneamente (local cache) ao digitar
        inputLocal.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase();
            suggestionsList.innerHTML = '';

            // Só dispara com 3 letras e se o download da API terminou
            if (!ibgeCitiesCache || val.length < 3) {
                suggestionsList.style.display = 'none';
                return;
            }

            const filtered = ibgeCitiesCache.filter(city => city.toLowerCase().includes(val)).slice(0, 15);

            if (filtered.length === 0) {
                suggestionsList.style.display = 'none';
                return;
            }

            filtered.forEach(city => {
                const li = document.createElement('li');
                li.textContent = city;
                li.addEventListener('click', () => {
                    inputLocal.value = city;
                    suggestionsList.style.display = 'none';
                });
                suggestionsList.appendChild(li);
            });

            suggestionsList.style.display = 'block';
        });

        // Fechar dropdown clicando fora
        document.addEventListener('click', (e) => {
            if (e.target !== inputLocal && e.target !== suggestionsList) {
                suggestionsList.style.display = 'none';
            }
        });
    };
    setupIBGEAutocomplete();

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
            const profSegmento = document.getElementById('prof-segmento');
            const profGoal = document.getElementById('prof-goal');
            const profMilkTarget = document.getElementById('prof-milk-target');

            const profile = {
                nome: profNome ? profNome.value.trim() : '',
                propriedade: profPropriedade ? profPropriedade.value.trim() : '',
                cpf: profCpf ? profCpf.value.trim() : '',
                ie: profIe ? profIe.value.trim() : '',
                local: profLocal ? profLocal.value.trim() : '',
                tipo: profTipo ? profTipo.value.trim() : '',
                segmento: profSegmento ? profSegmento.value : 'Misto'
            };

            const goal = profGoal && profGoal.value ? profGoal.value : null;
            const milkTarget = profMilkTarget && profMilkTarget.value ? profMilkTarget.value : null;

            if (globalUserId && window.firebaseDb) {
                // Sincroniza via Firebase
                window.firebaseSetDocWrapper(
                    window.firebaseDocWrapper(window.firebaseDb, 'users', globalUserId),
                    {
                        profile: profile,
                        goal: goal,
                        milkTarget: milkTarget,
                        activeModule: profile.segmento
                    }, 
                    { merge: true }
                ).then(() => {
                    // Atualiza cache local visual
                    localStorage.setItem('rural_profile', JSON.stringify(profile));
                    if (profile.propriedade) localStorage.setItem('rural_user', profile.propriedade);
                    localStorage.setItem('rural_active_module', profile.segmento);
                    
                    if (goal) localStorage.setItem('rural_goal', goal);
                    else localStorage.removeItem('rural_goal');
                    
                    if (milkTarget) localStorage.setItem('rural_milk_target', milkTarget);
                    else localStorage.removeItem('rural_milk_target');

                    const farmDisplay = document.getElementById('farm-name-display');
                    if (farmDisplay) farmDisplay.textContent = profile.propriedade;
                    
                    if(typeof window.addNotification === 'function') {
                        window.addNotification('Perfil salvo e sincronizado na nuvem com sucesso!', 'success');
                    } else {
                        alert('Perfil salvo com sucesso!');
                    }
                }).catch(err => {
                    console.error("Erro salvando perfil:", err);
                    alert("Erro ao salvar perfil: " + err.message);
                });
            } else {
                alert("Erro: Faça login novamente para salvar o perfil na nuvem.");
            }

            loadProfile();
            updateDashboard();
            renderTransactions();
        });
    }

    // Botão Sair
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', async (e) => {
            e.preventDefault();
            if (confirm('Tem certeza que deseja sair ou trocar de usuário?')) {
                // 1- Função de Logout via Firebase
                if (window.firebaseAuth) {
                    try {
                        console.log("Executando sign out do Firebase...");
                        await window.signOutWrapper(window.firebaseAuth);
                        // Observador de estado detectará e limpará a tela e ocultará o app-container!
                    } catch (err) {
                        console.error('Logout error:', err);
                        alert("Erro ao sair: " + err.message);
                    }
                } else {
                    // Fallback
                    location.reload();
                }
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

    // Módulo Rebanho Events
    const btnNewAnimal = document.getElementById('btn-new-animal');
    const btnCancelAnimal = document.getElementById('btn-cancel-animal');
    const animalForm = document.getElementById('animal-form');

    if (btnNewAnimal) btnNewAnimal.addEventListener('click', openAnimalModal);
    if (btnCancelAnimal) btnCancelAnimal.addEventListener('click', closeAnimalModal);
    if (animalForm) animalForm.addEventListener('submit', saveAnimal);

    // Fechar Modal Clicando Fora e ESC
    const modal = document.getElementById('modal');
    const deleteConfirmModal = document.getElementById('delete-confirm-modal');

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    if (deleteConfirmModal) {
        deleteConfirmModal.addEventListener('click', (e) => {
            if (e.target === deleteConfirmModal) deleteConfirmModal.classList.remove('active');
        });
    }

    // Botões do Modal de Exclusão
    const btnCancelDelete = document.getElementById('btn-cancel-delete');
    const btnConfirmDelete = document.getElementById('btn-confirm-delete');

    if (btnCancelDelete) {
        btnCancelDelete.addEventListener('click', () => {
            if (deleteConfirmModal) deleteConfirmModal.classList.remove('active');
            transactionToDelete = null;
        });
    }

    if (btnConfirmDelete) {
        btnConfirmDelete.addEventListener('click', () => {
            if (transactionToDelete !== null) {
                transactions = transactions.filter(t => t.id !== transactionToDelete);
                
                if (globalUserId && window.firebaseDb) {
                    const txRef = window.firebaseDocWrapper(window.firebaseDb, 'users', globalUserId, 'transactions', transactionToDelete.toString());
                    window.firebaseDeleteDocWrapper(txRef).catch(err => console.error("Firebase delete tx error", err));
                }

                updateDashboard();
                renderTransactions();

                if (typeof addNotification === 'function') {
                    addNotification('Lançamento excluído com sucesso.', 'info');
                }
            }
            if (deleteConfirmModal) deleteConfirmModal.classList.remove('active');
            transactionToDelete = null;
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
            // 5 - Validação: e.preventDefault() no início para evitar recarregamento da página
            e.preventDefault();
            console.log("Submit event fired on transaction-form");

            let isValid = true;

            try {
                // 1 - Restauração do Form: capturar os campos internamente p/ segurança
                const descInput = document.getElementById('desc');
                const categoryInput = document.getElementById('category');
                const amountInput = document.getElementById('amount');
                const litersInput = document.getElementById('liters');
                const dateInput = document.getElementById('date-input');

                // Reset error borders
                if (descInput) descInput.style.borderColor = '#ddd';
                if (amountInput) amountInput.style.borderColor = '#ddd';
                if (dateInput) dateInput.style.borderColor = '#ddd';

                const desc = descInput ? descInput.value.trim() : '';
                const category = categoryInput ? categoryInput.value : '';
                const amountStr = amountInput ? amountInput.value.replace(/\./g, '').replace(',', '.') : '0';
                const amount = parseFloat(amountStr);

                console.log("Salvando transação...", { desc, category, amountStr, amount });

                let liters = null;
                if (currentType === 'income' && litersInput && litersInput.value.trim() !== '') {
                    const litersStr = litersInput.value.replace(/\./g, '').replace(',', '.');
                    liters = parseFloat(litersStr);
                }

                if (!desc && descInput) {
                    descInput.style.borderColor = 'var(--color-expense)';
                    console.log("Validation failed: desc is empty");
                    isValid = false;
                }

                if ((isNaN(amount) || amount <= 0) && amountInput) {
                    amountInput.style.borderColor = 'var(--color-expense)';
                    console.log("Validation failed: amount is invalid");
                    isValid = false;
                }

                if (!dateInput || !dateInput.value) {
                    if (dateInput) dateInput.style.borderColor = 'var(--color-expense)';
                    console.log("Validation failed: date is empty");
                    isValid = false;
                }

                if (!isValid) {
                    alert("Por favor, preencha todos os campos obrigatórios (Data, Descrição e Valor).");
                    console.log("Form is invalid, returning...");
                    return;
                }

                console.log("Form is valid, processing...");
                let selectedDate = new Date();
                let isRetroactive = false;

                if (dateInput && dateInput.value) {
                    // 3 - Fuso Horário e 1 - Ajuste de Comparação
                    const dateString = dateInput.value.replace(/-/g, '/');
                    selectedDate = new Date(dateString);
                    selectedDate.setHours(0, 0, 0, 0);

                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    // 2 - Regra de Alerta: estritamente menor que hoje
                    isRetroactive = selectedDate < today;
                }

                const headsInput = document.getElementById('heads');
                const heads = (headsInput && headsInput.value.trim() !== '') ? headsInput.value.trim() : null;

                const tSegCorteRadio = document.getElementById('t_seg_corte');
                const activityVal = (tSegCorteRadio && tSegCorteRadio.checked) ? 'pecuaria' : 'leite';

                const newTransaction = {
                    id: editId ? editId : Date.now(),
                    desc,
                    category,
                    amount,
                    type: currentType,
                    date: selectedDate,
                    liters: liters,
                    heads: heads,
                    activity: activityVal,
                    retroactive: isRetroactive,
                    photoData: photoBase64
                };

                // Remoção do sync retroativo de localStorage (usado para multiplas abas antigamente)
                // O estado de 'transactions' em memória já é a fonte da verdade neste momento.

                // 2 - Lógica Dupla (Salvar/Editar): Verificar o editingId (editId)
                if (editId) {
                    const index = transactions.findIndex(t => t.id === editId);
                    if (index !== -1) {
                        transactions[index] = newTransaction;
                    } else {
                        transactions.push(newTransaction);
                    }
                } else {
                    transactions.push(newTransaction);
                }

                // Salvar no storage (Firebase)
                if (globalUserId && window.firebaseDb) {
                    // Prepara dados compatíveis com JSON
                    const fbData = { ...newTransaction, dateStr: newTransaction.date.toISOString() };
                    delete fbData.date; // Remover objeto Date para evitar conflitos de Timestamp

                    const txRef = window.firebaseDocWrapper(window.firebaseDb, 'users', globalUserId, 'transactions', newTransaction.id.toString());
                    
                    window.firebaseSetDocWrapper(txRef, fbData).catch(err => {
                        console.error("Erro salvando transação no Firebase:", err);
                        if (err.code === 'resource-exhausted') {
                             // Fallback for large images
                            alert('Aviso: Imagem muito grande para salvar.');
                        }
                    });
                }

                // 4 - Gatilhos de Atualização
                renderTransactions();
                updateDashboard(); // Esta função já atira o renderCharts() e renderProjection()

                if (isRetroactive && typeof addNotification === 'function') {
                    addNotification('Lançamento retroativo registrado com sucesso', 'success');
                }

                // Finalmente, fechar o form/modal
                closeModal();

                // Só pra garantir o estado zerado para o proximo push
                editId = null;
                photoBase64 = null;
                if (form.reset) form.reset();

            } catch (error) {
                console.error("Erro critico ao salvar transacao:", error);
                alert("Ocorreu um erro ao salvar a transação. Verifique o console.");
            }
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

    const btnPdfReport = document.getElementById('btn-pdf-report');
    if (btnPdfReport) {
        btnPdfReport.addEventListener('click', (e) => {
            e.preventDefault();

            const profileStr = localStorage.getItem('rural_profile');
            const profile = profileStr ? JSON.parse(profileStr) : {};

            const printPropriedade = document.getElementById('print-propriedade');
            const printProdutor = document.getElementById('print-produtor');
            const printIe = document.getElementById('print-ie');
            const printDate = document.getElementById('print-date');

            if (printPropriedade) printPropriedade.textContent = profile.propriedade || 'Gestão Financeira Rural';
            if (printProdutor) printProdutor.textContent = `Produtor: ${profile.nome || 'Não informado'}`;
            if (printIe) printIe.textContent = `IE: ${profile.ie || 'Não informada'}`;

            if (printDate) {
                const today = new Date();
                const hh = String(today.getHours()).padStart(2, '0');
                const mn = String(today.getMinutes()).padStart(2, '0');
                printDate.textContent = `Emitido em: ${today.toLocaleDateString('pt-BR')} às ${hh}:${mn}`;
            }

            window.print();
        });
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
        
        if (globalUserId && window.firebaseDb) {
            window.firebaseSetDocWrapper(window.firebaseDocWrapper(window.firebaseDb, 'users', globalUserId), {
                alerts: marketAlerts
            }, { merge: true }).catch(err => console.error("Firebase alert delete error", err));
        } else {
            localStorage.setItem('rural_alerts', JSON.stringify(marketAlerts));
        }

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

    const toggleAlertModal = (show) => {
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
    };

    // Filtros de Setor na Visão Geral
    const setupModuleButtons = () => {
        const btnLeite = document.getElementById('module-leite-btn');
        const btnCorte = document.getElementById('module-corte-btn');
        const btnMisto = document.getElementById('module-misto-btn');

        const setActiveModule = (moduleName) => {
            localStorage.setItem('rural_active_module', moduleName);
            updateDashboard();
            renderTransactions();
            renderMarket();
        };

        if (btnLeite) btnLeite.addEventListener('click', () => setActiveModule('Leite'));
        if (btnCorte) btnCorte.addEventListener('click', () => setActiveModule('Corte'));
        if (btnMisto) btnMisto.addEventListener('click', () => setActiveModule('Misto'));
    };
    setupModuleButtons();

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

        // Notification Center interactions
        const isBellClicked = e.target.id === 'btn-notifications' || e.target.closest('#btn-notifications');
        const isDropdownClicked = e.target.closest('#notification-dropdown');
        const isClearAll = e.target.id === 'btn-clear-notifications';

        if (isBellClicked) {
            toggleNotificationDropdown();
        } else if (isClearAll) {
            systemNotifications = [];
            
            if (globalUserId && window.firebaseDb) {
                window.firebaseSetDocWrapper(window.firebaseDocWrapper(window.firebaseDb, 'users', globalUserId), {
                    notifications: []
                }, { merge: true }).catch(err => console.error("Firebase clear notes error", err));
            } else {
                localStorage.setItem('rural_notifications', JSON.stringify([]));
            }
            renderSystemNotifications();
            toggleNotificationDropdown(true); // close
        } else if (!isDropdownClicked) {
            // Click outside
            toggleNotificationDropdown(true);
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
            
            if (globalUserId && window.firebaseDb) {
                window.firebaseSetDocWrapper(window.firebaseDocWrapper(window.firebaseDb, 'users', globalUserId), {
                    alerts: marketAlerts
                }, { merge: true }).catch(err => console.error("Firebase create alert error", err));
            } else {
                localStorage.setItem('rural_alerts', JSON.stringify(marketAlerts));
            }

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
            
            if (globalUserId && window.firebaseDb) {
                window.firebaseSetDocWrapper(window.firebaseDocWrapper(window.firebaseDb, 'users', globalUserId), {
                    theme: isDark ? 'dark' : 'light'
                }, { merge: true }).catch(err => console.error("Firebase theme save error", err));
            }
        });
    }

    // Dashboard Module Buttons
    const btnLeite = document.getElementById('module-leite-btn');
    const btnCorte = document.getElementById('module-corte-btn');

    if (btnLeite) {
        btnLeite.addEventListener('click', () => {
            localStorage.setItem('rural_active_module', 'Leite');
            updateDashboard();
            renderTransactions();
        });
    }

    if (btnCorte) {
        btnCorte.addEventListener('click', () => {
            localStorage.setItem('rural_active_module', 'Corte');
            updateDashboard();
            renderTransactions();
        });
    }

    // Modal Segment Toggles Listener
    const tSegLeiteRadio = document.getElementById('t_seg_leite');
    const tSegCorteRadio = document.getElementById('t_seg_corte');

    window.updateModalInputs = () => {
        const litersGroup = document.getElementById('liters-group');
        const headsGroup = document.getElementById('heads-group');
        const litersInput = document.getElementById('liters');
        const headsInput = document.getElementById('heads');

        // Check which radio is active (default Leite if none)
        const activeSeg = (tSegCorteRadio && tSegCorteRadio.checked) ? 'Corte' : 'Leite';

        if (currentType === 'income') {
            if (litersGroup) litersGroup.style.display = (activeSeg === 'Leite') ? 'block' : 'none';
        } else {
            if (litersGroup) {
                litersGroup.style.display = 'none';
                if (litersInput) litersInput.value = '';
            }
        }

        if (headsGroup) {
            if (activeSeg === 'Corte') {
                headsGroup.style.display = 'block';
            } else {
                headsGroup.style.display = 'none';
                if (headsInput) headsInput.value = '';
            }
        }
    };

    if (tSegLeiteRadio) tSegLeiteRadio.addEventListener('change', window.updateModalInputs);
    if (tSegCorteRadio) tSegCorteRadio.addEventListener('change', window.updateModalInputs);

});
