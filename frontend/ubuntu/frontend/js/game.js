// Lógica do jogo integrada com Supabase e suporte a saldo real/demo
document.addEventListener('DOMContentLoaded', function() {
    const supabase = window.supabaseClient;

    // Elementos do DOM
    const rangeBtns = document.querySelectorAll('.range-btn');
    const guessNumberInput = document.getElementById('guess-number');
    const rangeInfo = document.getElementById('range-info');
    const chancesInfo = document.getElementById('chances-info');
    const betAmountInput = document.getElementById('bet-amount');
    const quickBetBtns = document.querySelectorAll('.quick-bet-btn');
    const placeBetBtn = document.getElementById('place-bet-btn');
    const gameResult = document.getElementById('game-result');
    const gameHint = document.getElementById('game-hint');
    const recentBetsBody = document.getElementById('recent-bets-body');
    const userBalanceElement = document.getElementById('user-balance');
    const userBalanceDemoElement = document.getElementById('user-balance-demo');
    const depositBtn = document.getElementById('deposit-btn');
    const depositModal = document.getElementById('deposit-modal');
    const closeModal = document.querySelector('.close-modal');
    const depositForm = document.getElementById('deposit-form');
    const betModeInputs = document.getElementsByName('bet-mode');

    // Variáveis do jogo
    let currentRange = 10;
    let currentMultiplier = 1.2;
    let currentChances = 3;
    let userBalance = 0;
    let userBalanceDemo = 0;
    let gameActive = false;
    let targetNumber = null;
    let remainingChances = 0;
    let currentBetAmount = 0;
    let currentUser = null;
    let betMode = 'real';

    // Polling para saldo real após depósito PIX
    let saldoPollingInterval = null;
    let saldoAnterior = null;

    // Inicializar o jogo
    init();

    async function init() {
        // Verificar autenticação
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            alert('Você precisa fazer login para jogar.');
            window.location.href = 'login.html';
            return;
        }

        currentUser = user;
        window.currentUser = user; // Disponível globalmente para PIX

        // Carregar dados do usuário: ambos os saldos
        await loadUserData();

        // Carregar apostas recentes
        await loadRecentBets();

        // Configurar event listeners
        setupEventListeners();

        // Definir a primeira faixa como ativa
        if (rangeBtns.length > 0) {
            rangeBtns[0].click();
        }

        // Inicializar Mercado Pago
        if (window.mercadoPagoPayments) {
            await window.mercadoPagoPayments.initialize();
        }
    }

    // Carregar dados do usuário: agora pega ambos os saldos
    async function loadUserData() {
        try {
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', currentUser.id)
                .single();

            if (error) {
                console.error('Erro ao carregar perfil:', error);
                return;
            }

            userBalance = profile.balance || 0;
            userBalanceDemo = profile.balance_demo || 0;
            updateBalance();

        } catch (error) {
            console.error('Erro ao carregar dados do usuário:', error);
        }
    }

    // Configurar event listeners (adiciona seleção do modo de aposta)
    function setupEventListeners() {
        // Seleção de faixa
        rangeBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                rangeBtns.forEach(b => b.classList.remove('active'));
                this.classList.add('active');

                currentRange = parseInt(this.dataset.range);
                currentMultiplier = parseFloat(this.dataset.multiplier);
                currentChances = parseInt(this.dataset.chances);

                guessNumberInput.setAttribute('max', currentRange);
                rangeInfo.textContent = `Faixa atual: 1-${currentRange}`;
                chancesInfo.textContent = `Chances: ${currentChances}`;

                if (gameActive) {
                    resetGame();
                }
            });
        });

        // Botões de aposta rápida
        quickBetBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                betAmountInput.value = this.dataset.amount;
            });
        });

        // Botão de apostar
        placeBetBtn.addEventListener('click', handleBet);

        // Modal de depósito
        depositBtn.addEventListener('click', function() {
            depositModal.style.display = 'flex';
        });

        closeModal.addEventListener('click', function() {
            depositModal.style.display = 'none';
        });

        window.addEventListener('click', function(e) {
            if (e.target === depositModal) {
                depositModal.style.display = 'none';
            }
        });

        depositForm.addEventListener('submit', handleDeposit);

        // NOVO: escuta mudanças na seleção do modo de aposta
        betModeInputs.forEach(input => {
            input.addEventListener('change', function() {
                betMode = this.value;
                updateBalance();
            });
        });
    }

    // Lidar com apostas
    async function handleBet() {
        const guessNumber = parseInt(guessNumberInput.value);
        const betAmount = parseFloat(betAmountInput.value);

        // Validações
        if (isNaN(guessNumber) || guessNumber < 1 || guessNumber > currentRange) {
            alert(`Por favor, escolha um número entre 1 e ${currentRange}.`);
            return;
        }

        if (isNaN(betAmount) || betAmount < 1) {
            alert('Por favor, insira um valor válido para a aposta.');
            return;
        }

        if (betMode === 'real' && betAmount > userBalance) {
            alert('Saldo real insuficiente para esta aposta.');
            return;
        }
        if (betMode === 'demo' && betAmount > userBalanceDemo) {
            alert('Saldo demo insuficiente para esta aposta.');
            return;
        }

        // Se o jogo não estiver ativo, iniciar um novo jogo
        if (!gameActive) {
            await startNewGame(betAmount);
        }

        // Processar a tentativa
        await processGuess(guessNumber);
    }

    // Iniciar um novo jogo
    async function startNewGame(betAmount) {
        targetNumber = Math.floor(Math.random() * currentRange) + 1;
        gameActive = true;
        remainingChances = currentChances;
        currentBetAmount = betAmount;

        chancesInfo.textContent = `Chances restantes: ${remainingChances}`;
        gameHint.style.display = 'none';
        gameResult.style.display = 'none';

        rangeBtns.forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.5';
        });

        placeBetBtn.textContent = 'Tentar';
    }

    // Processar uma tentativa
    async function processGuess(guessNumber) {
        const isCorrect = guessNumber === targetNumber;

        if (isCorrect) {
            await endGame(true);
        } else {
            remainingChances--;
            chancesInfo.textContent = `Chances restantes: ${remainingChances}`;

            showHint(guessNumber);

            if (remainingChances <= 0) {
                await endGame(false);
            }
        }
    }

    // Mostrar dica
    function showHint(guessNumber) {
        gameHint.innerHTML = '';
        gameHint.className = 'game-hint';

        if (guessNumber < targetNumber) {
            gameHint.classList.add('higher');
            gameHint.innerHTML = `
                <p><i class="fas fa-arrow-up hint-icon"></i> O número é MAIOR que ${guessNumber}</p>
            `;
        } else {
            gameHint.classList.add('lower');
            gameHint.innerHTML = `
                <p><i class="fas fa-arrow-down hint-icon"></i> O número é MENOR que ${guessNumber}</p>
            `;
        }

        gameHint.style.display = 'block';
    }

    // Finalizar o jogo
    async function endGame(isWin) {
        gameActive = false;

        let resultAmount = 0;
        if (isWin) {
            resultAmount = currentBetAmount * currentMultiplier;
            await updateUserBalance(resultAmount); // Add full prize if won
        } else {
            await updateUserBalance(-currentBetAmount); // Deduct bet amount only if lost
        }

        // Salvar aposta no banco de dados
        await saveBet(targetNumber, currentBetAmount, resultAmount, isWin);

        // Exibir resultado
        showResult(isWin, targetNumber, currentBetAmount, resultAmount);

        // Carregar apostas recentes atualizadas
        await loadRecentBets();

        // Resetar o jogo
        resetGame();
    }

    // Resetar o jogo
    function resetGame() {
        gameActive = false;
        targetNumber = null;
        remainingChances = 0;
        currentBetAmount = 0;

        rangeBtns.forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
        });

        placeBetBtn.textContent = 'Apostar';
        chancesInfo.textContent = `Chances: ${currentChances}`;
    }

    // Exibir resultado
    function showResult(isWin, number, betAmount, resultAmount) {
        gameResult.innerHTML = '';
        gameResult.className = 'game-result';

        if (isWin) {
            gameResult.classList.add('win');
            gameResult.innerHTML = `
                <h3>Parabéns! Você acertou!</h3>
                <p>Número sorteado: <span class="result-number">${number}</span></p>
                <p class="result-message">Você ganhou R$ ${resultAmount.toFixed(2)}!</p>
                <button class="btn btn-primary" onclick="location.reload()">Jogar Novamente</button>
            `;
        } else {
            gameResult.classList.add('lose');
            gameResult.innerHTML = `
                <h3>Que pena! Você perdeu.</h3>
                <p>Número sorteado: <span class="result-number">${number}</span></p>
                <p class="result-message">Você perdeu R$ ${betAmount.toFixed(2)}.</p>
                <button class="btn btn-primary" onclick="location.reload()">Tentar Novamente</button>
            `;
        }

        gameResult.style.display = 'block';
        gameHint.style.display = 'none';
    }

    // Atualizar saldo do usuário (real ou demo)
    async function updateUserBalance(amount) {
        try {
            if (betMode === 'real') {
                userBalance += amount;
                const { error } = await supabase
                    .from('profiles')
                    .update({ balance: userBalance })
                    .eq('id', currentUser.id);
                if (error) throw error;
            } else {
                userBalanceDemo += amount;
                const { error } = await supabase
                    .from('profiles')
                    .update({ balance_demo: userBalanceDemo })
                    .eq('id', currentUser.id);
                if (error) throw error;
            }
            updateBalance();
        } catch (error) {
            console.error('Erro ao atualizar saldo:', error);
        }
    }

    // Atualizar saldo exibido
    function updateBalance() {
        if (userBalanceElement) {
            userBalanceElement.textContent = `Saldo Real: R$ ${userBalance.toFixed(2)}`;
        }
        if (userBalanceDemoElement) {
            userBalanceDemoElement.textContent = `Saldo Demo: R$ ${userBalanceDemo.toFixed(2)}`;
        }
    }

    // Salvar aposta no banco de dados
    async function saveBet(number, betAmount, resultAmount, isWin) {
        try {
            const { error } = await supabase
                .from('bets')
                .insert([
                    {
                        user_id: currentUser.id,
                        target_number: number,
                        bet_amount: betAmount,
                        result_amount: resultAmount,
                        is_win: isWin,
                        range_min: 1,
                        range_max: currentRange,
                        multiplier: currentMultiplier,
                        chances: currentChances,
                        created_at: new Date().toISOString(),
                        mode: betMode
                    }
                ]);
            if (error) {
                console.error('Erro ao salvar aposta:', error);
            }
        } catch (error) {
            console.error('Erro ao salvar aposta:', error);
        }
    }

    // Carregar apostas recentes
    async function loadRecentBets() {
        try {
            const { data: bets, error } = await supabase
                .from('bets')
                .select('*')
                .eq('user_id', currentUser.id)
                .order('created_at', { ascending: false })
                .limit(5);

            if (error) {
                console.error('Erro ao carregar apostas:', error);
                return;
            }

            recentBetsBody.innerHTML = '';

            bets.forEach(bet => {
                const time = new Date(bet.created_at).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit'
                });

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${time}</td>
                    <td>${bet.range_min}-${bet.range_max}</td>
                    <td>${bet.is_win ? bet.target_number : '?'}</td>
                    <td>${bet.target_number}</td>
                    <td>R$ ${bet.bet_amount.toFixed(2)}</td>
                    <td>${bet.mode === 'demo' ? '<span class="badge badge-demo">Demo</span>' : '<span class="badge badge-real">Real</span>'}</td>
                    <td class="${bet.is_win ? 'win-result' : 'lose-result'}">
                        ${bet.is_win ? '+' : '-'}R$ ${bet.is_win ? bet.result_amount.toFixed(2) : bet.bet_amount.toFixed(2)}
                    </td>
                `;
                recentBetsBody.appendChild(row);
            });

        } catch (error) {
            console.error('Erro ao carregar apostas recentes:', error);
        }
    }

    // Função para inserir transação na tabela 'transactions'
    async function inserirTransacao(userId, valor, tipo, metodo) {
        const { error } = await window.supabaseClient
            .from('transactions')
            .insert([{
                user_id: userId,
                type: tipo,
                amount: valor,
                payment_method: metodo,
                status: 'completed'
            }]);
        if (error) {
            alert('Erro ao registrar transação: ' + error.message);
            console.error(error);
        }
    }

    // Lidar com depósito
    async function handleDeposit(e) {
        e.preventDefault();

        const depositInput = document.getElementById('deposit-amount');
        if (!depositInput) {
            alert('Campo de valor não encontrado!');
            return;
        }

        const depositAmount = parseFloat(depositInput.value);
        const paymentMethodInput = document.querySelector('input[name="payment-method"]:checked');
        if (!paymentMethodInput) {
            alert('Escolha o método de pagamento!');
            return;
        }
        const paymentMethod = paymentMethodInput.value;

        if (isNaN(depositAmount) || depositAmount < 10) {
            alert('Por favor, insira um valor válido para o depósito (mínimo R$ 10).');
            return;
        }

        if (!window.mercadoPagoPayments) {
            alert('O sistema de pagamentos não está disponível.');
            return;
        }

        if ((paymentMethod === 'pix') && (!currentUser || !currentUser.email)) {
            alert('Usuário não autenticado ou e-mail não disponível!');
            return;
        }

        try {
            const btn = e.target.querySelector('button[type="submit"]') || e.target;
            btn.disabled = true;

            if (paymentMethod === 'mercado-pago') {
                await window.mercadoPagoPayments.processPayment(depositAmount);
                // Após depósito via cartão, recarregar saldo imediatamente
                await loadUserData();
            } else if (paymentMethod === 'pix') {
                // Chama o Pix do Mercado Pago
                await window.mercadoPagoPayments.processPixPayment(depositAmount, currentUser.email, currentUser.id);
                // Inicia polling para atualizar saldo automaticamente
                startBalancePolling();
            } else {
                await simulateDeposit(depositAmount, paymentMethod);
            }
        } catch (error) {
            console.error('Erro no depósito:', error, error?.message, error?.stack);
            alert('Erro ao processar depósito: ' + (error?.message || error));
        } finally {
            const btn = e.target.querySelector('button[type="submit"]') || e.target;
            btn.disabled = false;
        }
    }

    // Simular depósito (para métodos que não são Mercado Pago ou Pix)
    async function simulateDeposit(amount, method) {
        await updateUserBalance(amount);
        await inserirTransacao(currentUser.id, amount, 'deposit', method);
        alert(`Depósito de R$ ${amount.toFixed(2)} realizado com sucesso via ${method === 'pix' ? 'PIX' : 'Cartão de Crédito'}!`);
        depositModal.style.display = 'none';
    }

    // Polling: checa saldo real no backend a cada 5s após PIX
    function startBalancePolling() {
        if (saldoPollingInterval) clearInterval(saldoPollingInterval);
        saldoAnterior = userBalance;

        saldoPollingInterval = setInterval(async () => {
            try {
                // Chama endpoint backend para saldo atualizado
                const resp = await fetch(`/api/saldo?user_id=${currentUser.id}`);
                const data = await resp.json();
                if (data && typeof data.balance === 'number') {
                    if (data.balance > saldoAnterior) {
                        userBalance = data.balance;
                        updateBalance();
                        alert('Depósito via Pix confirmado! Seu saldo foi atualizado.');
                        depositModal.style.display = 'none';
                        clearInterval(saldoPollingInterval);
                    }
                }
            } catch (err) {
                console.warn('Erro ao checar saldo:', err);
            }
        }, 5000);
    }
});