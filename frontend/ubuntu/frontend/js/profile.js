// Função utilitária para pegar o ID do usuário autenticado
async function getUserId() {
    const { data, error } = await window.supabaseClient.auth.getUser();
    if (error || !data.user) {
        return null;
    }
    return data.user.id;
}

// Seletores dos elementos HTML
const userNameElem = document.getElementById('profile-username');
const userEmailElem = document.getElementById('profile-email');
const userBalanceElem = document.getElementById('user-balance');
const totalBets = document.getElementById('total-bets');
const totalWins = document.getElementById('total-wins');
const winRate = document.getElementById('win-rate');
const totalProfit = document.getElementById('total-profit');
const betHistoryBody = document.getElementById('bet-history-body');
const transactionsBody = document.getElementById('transactions-body');
const joinedDateElem = document.getElementById('profile-joined-date');

// Carrega o perfil do usuário
async function loadUserProfile(userId) {
    const { data: profile, error } = await window.supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (error || !profile) {
        console.error('Erro ao carregar perfil:', error);
        alert('Erro ao carregar perfil do usuário.');
        return;
    }

    if (userNameElem) userNameElem.textContent = profile.name || 'Usuário';
    if (userEmailElem) userEmailElem.textContent = profile.email || '';
    if (userBalanceElem) userBalanceElem.textContent = 'R$ ' + Number(profile.balance ?? 0).toFixed(2);
    if (totalBets) totalBets.textContent = profile.total_bets ?? 0;
    if (totalWins) totalWins.textContent = profile.total_wins ?? 0;
    if (winRate) winRate.textContent = (profile.total_bets && profile.total_bets > 0)
        ? ((profile.total_wins / profile.total_bets) * 100).toFixed(1) + '%'
        : '0%';
    if (totalProfit) totalProfit.textContent = 'R$ ' + (profile.total_profit ? Number(profile.total_profit).toFixed(2) : '0,00');
    if (joinedDateElem) joinedDateElem.textContent = profile.created_at
        ? new Date(profile.created_at).toLocaleDateString('pt-BR')
        : '';
}

// Carrega histórico de apostas
async function loadBetHistory(userId) {
    const { data: bets, error } = await window.supabaseClient
        .from('bets')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Erro ao carregar histórico de apostas:', error);
        alert('Erro ao carregar histórico de apostas.');
        return;
    }

    betHistoryBody.innerHTML = '';
    if (!bets || bets.length === 0) {
        betHistoryBody.innerHTML = '<tr><td colspan="6">Nenhuma aposta encontrada.</td></tr>';
        return;
    }

    bets.forEach(bet => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(bet.created_at).toLocaleDateString('pt-BR')}</td>
            <td>${bet.range_min} - ${bet.range_max}</td>
            <td>${bet.target_number}</td>
            <td>${bet.drawn_number ?? '-'}</td>
            <td>R$ ${Number(bet.bet_amount).toFixed(2)}</td>
            <td style="color:${bet.is_win ? 'green' : 'red'};">
                ${bet.is_win ? 'Vitória' : 'Derrota'}
            </td>
        `;
        betHistoryBody.appendChild(tr);
    });
}

// Carrega histórico de transações
async function loadTransactionHistory(userId) {
    const { data: transactions, error } = await window.supabaseClient
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Erro ao carregar histórico de transações:', error);
        alert('Erro ao carregar histórico de transações.');
        return;
    }

    transactionsBody.innerHTML = '';
    if (!transactions || transactions.length === 0) {
        transactionsBody.innerHTML = '<tr><td colspan="4">Nenhuma transação encontrada.</td></tr>';
        return;
    }

    transactions.forEach(tx => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(tx.created_at).toLocaleDateString('pt-BR')}</td>
            <td>${tx.type === 'deposit' ? 'Depósito' : 'Saque'}</td>
            <td>R$ ${Number(tx.amount).toFixed(2)}</td>
            <td>${tx.status ?? '-'}</td>
        `;
        transactionsBody.appendChild(tr);
    });
}

// Alternador de abas
document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', async function () {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));

            this.classList.add('active');
            const tab = this.getAttribute('data-tab');
            document.getElementById(`${tab}-tab`).classList.add('active');

            const userId = await getUserId();
            if (tab === 'transactions' && userId) {
                loadTransactionHistory(userId);
            }
            if (tab === 'history' && userId) {
                loadBetHistory(userId);
            }
        });
    });
});

// Inicialização
async function init() {
    const userId = await getUserId();
    if (!userId) {
        alert('Usuário não autenticado.');
        window.location.href = "login.html";
        return;
    }

    await loadUserProfile(userId);
    await loadBetHistory(userId);
    // Transações carregam na aba
}
init();

// ===============================
//  DEPÓSITO VIA MERCADO PAGO/PIX
// ===============================
(function() {
    const supabase = window.supabaseClient;
    let currentUser = null;
    let userBalance = 0;

    // Elementos do DOM necessários
    const depositBtn = document.getElementById('deposit-btn');
    const depositModal = document.getElementById('deposit-modal');
    const closeModal = depositModal ? depositModal.querySelector('.close-modal') : null;
    const depositForm = document.getElementById('deposit-form');
    const userBalanceElem = document.getElementById('user-balance');

    async function getCurrentUser() {
        if (currentUser) return currentUser;
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
            alert('Você precisa estar logado!');
            window.location.href = "login.html";
            return null;
        }
        currentUser = data.user;
        return currentUser;
    }

    // Atualiza saldo na tela e no banco
    async function updateUserBalance(amount) {
        userBalance += amount;
        if (userBalanceElem) {
            userBalanceElem.textContent = 'R$ ' + userBalance.toFixed(2);
        }
        await supabase
            .from('profiles')
            .update({ balance: userBalance })
            .eq('id', currentUser.id);
    }

    // Insere transação no banco
    async function inserirTransacao(userId, valor, tipo, metodo) {
        await supabase
            .from('transactions')
            .insert([{
                user_id: userId,
                type: tipo,
                amount: valor,
                payment_method: metodo,
                status: 'completed'
            }]);
    }

    // Simula depósito (caso queira testar sem integração real)
    async function simulateDeposit(amount, method) {
        await updateUserBalance(amount);
        await inserirTransacao(currentUser.id, amount, 'deposit', method);
        alert(`Depósito de R$ ${amount.toFixed(2)} realizado com sucesso via ${method === 'pix' ? 'PIX' : method === 'credit-card' ? 'Cartão de Crédito' : 'Outro método'}!`);
        depositModal.style.display = 'none';

        // Atualiza histórico após depósito
        const userId = currentUser.id;
        if (userId) {
            loadTransactionHistory(userId);
            loadUserProfile(userId);
        }
    }

    // Lógica do depósito
    async function handleDeposit(e) {
        e.preventDefault();
        await getCurrentUser();

        const depositAmount = parseFloat(document.getElementById('deposit-amount').value);
        const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;

        if (isNaN(depositAmount) || depositAmount < 10) {
            alert('Por favor, insira um valor válido para o depósito (mínimo R$ 10).');
            return;
        }

        try {
            if (paymentMethod === 'pix') {
                // Integração Mercado Pago Pix via Node/Express
                const email = currentUser.email;
                await window.mercadoPagoPayments.processPixPayment(depositAmount, email);
                depositModal.style.display = 'none';
                return;
            } else if (paymentMethod === 'credit-card') {
                alert('Pagamento com cartão não implementado ainda.');
                return;
            } else if (paymentMethod === 'mercado-pago') {
                // Checkout padrão Mercado Pago
                await window.mercadoPagoPayments.processPayment(depositAmount);
                depositModal.style.display = 'none';
                return;
            } else {
                await simulateDeposit(depositAmount, paymentMethod);
            }
        } catch (error) {
            alert('Erro ao processar depósito: ' + error.message);
        }
    }

    // Eventos para modal
    if (depositBtn)
        depositBtn.addEventListener('click', () => { depositModal.style.display = 'flex'; });
    if (closeModal)
        closeModal.addEventListener('click', () => { depositModal.style.display = 'none'; });
    window.addEventListener('click', function(e) {
        if (e.target === depositModal) depositModal.style.display = 'none';
    });
    if (depositForm)
        depositForm.addEventListener('submit', handleDeposit);

    // Carrega saldo inicial
    (async function() {
        await getCurrentUser();
        if (currentUser) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('balance')
                .eq('id', currentUser.id)
                .single();
            userBalance = profile?.balance || 0;
            if (userBalanceElem) userBalanceElem.textContent = 'R$ ' + userBalance.toFixed(2);
        }
    })();
})();

// Mostrar saldo disponível na área de saque
async function mostrarSaldoSaque() {
    const userId = await getUserId();
    if (!userId) return;
    const { data: profile, error } = await window.supabaseClient
        .from('profiles')
        .select('balance')
        .eq('id', userId)
        .single();
    if (error) return;
    const saldo = profile?.balance || 0;
    const withdrawalBalanceElem = document.getElementById('withdrawal-balance');
    if (withdrawalBalanceElem) {
        withdrawalBalanceElem.textContent = 'R$ ' + Number(saldo).toFixed(2);
    }
}

// Exibir campos dinâmicos do método de saque
document.getElementById('withdrawal-method').addEventListener('change', function() {
    document.querySelector('.pix-key-group').style.display = this.value === 'pix' ? 'block' : 'none';
    document.querySelector('.bank-details-group').style.display = this.value === 'bank-transfer' ? 'block' : 'none';
});

// Submissão de saque com envio para backend que dispara e-mail
document.getElementById('withdrawal-form').addEventListener('submit', async function(e) {
    e.preventDefault();

    const valor = parseFloat(document.getElementById('withdrawal-amount').value);
    const metodo = document.getElementById('withdrawal-method').value;

    if (isNaN(valor) || valor < 20) {
        alert('Valor mínimo para saque é R$ 20,00');
        return;
    }
    if (!metodo) {
        alert('Selecione o método de saque!');
        return;
    }

    let saqueData = { valor, metodo };

    if (metodo === 'pix') {
        const pixKeyType = document.getElementById('pix-key-type').value;
        const pixKey = document.getElementById('pix-key').value.trim();
        if (!pixKeyType || !pixKey) {
            alert('Informe o tipo e a chave PIX.');
            return;
        }
        saqueData = { ...saqueData, pixKeyType, pixKey };
    }

    if (metodo === 'bank-transfer') {
        const bankName = document.getElementById('bank-name').value.trim();
        const accountNumber = document.getElementById('account-number').value.trim();
        const branchNumber = document.getElementById('branch-number').value.trim();
        if (!bankName || !accountNumber || !branchNumber) {
            alert('Preencha todos os dados bancários para transferência!');
            return;
        }
        saqueData = { ...saqueData, bankName, accountNumber, branchNumber };
    }

    // Envia solicitação de saque para o backend (que envia o e-mail)
    fetch('http://localhost:3000/api/solicitar-saque', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ...saqueData,
            usuario: userEmailElem ? userEmailElem.textContent : 'desconhecido'
        })
    })
    .then(async response => {
        const data = await response.json();
        if (data.success) {
            alert('Solicitação de saque enviada!');
        } else {
            alert('Erro ao enviar solicitação de saque por e-mail.');
        }
        mostrarSaldoSaque();
        carregarHistoricoSaques();
    })
    .catch(() => {
        alert('Erro ao enviar solicitação de saque.');
    });
});

async function carregarHistoricoSaques() {
    const userId = await getUserId();
    if (!userId) return;
    const { data: saques, error } = await window.supabaseClient
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('type', 'withdrawal')
        .order('created_at', { ascending: false });
    const tbody = document.getElementById('withdrawals-history');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (error || !saques || saques.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4">Nenhum saque encontrado.</td></tr>';
        return;
    }
    saques.forEach(saque => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(saque.created_at).toLocaleDateString('pt-BR')}</td>
            <td>R$ ${Number(saque.amount).toFixed(2)}</td>
            <td>${saque.payment_method ? saque.payment_method.toUpperCase() : '-'}</td>
            <td>${saque.status || '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Chame ao carregar a página/aba:
document.addEventListener('DOMContentLoaded', () => {
    mostrarSaldoSaque();
    carregarHistoricoSaques();
});
