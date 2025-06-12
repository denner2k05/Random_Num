document.addEventListener('DOMContentLoaded', function() {
    const supabase = window.supabaseClient;

    // --- FLUXO DE RECUPERAÇÃO DE SENHA (RESET) ---
    // Adiciona o formulário de nova senha caso não exista (compatível com seu HTML atual)
    function injectNewPasswordFormIfNeeded() {
        if (!document.getElementById('new-password-form')) {
            const authContainer = document.querySelector('.auth-container');
            const form = document.createElement('form');
            form.className = 'auth-form';
            form.id = 'new-password-form';
            form.style.display = 'none';
            form.innerHTML = `
                <div class="form-group">
                    <label for="new-password">Nova Senha</label>
                    <input type="password" id="new-password" name="new-password" required minlength="6">
                </div>
                <button type="submit" class="btn btn-primary btn-block">Redefinir Senha</button>
            `;
            if (authContainer) authContainer.appendChild(form);
        }
    }
    injectNewPasswordFormIfNeeded();

    // Função para mostrar/esconder formulários conforme o fluxo
    function showForm(formId) {
        const resetPasswordForm = document.getElementById('reset-password-form');
        const newPasswordForm = document.getElementById('new-password-form');
        if (resetPasswordForm) resetPasswordForm.style.display = 'none';
        if (newPasswordForm) newPasswordForm.style.display = 'none';
        const el = document.getElementById(formId);
        if (el) el.style.display = 'block';
    }

    // --- Detecta se é pelo link de recovery do Supabase ---
    const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));
    if (hashParams.get('type') === 'recovery') {
        showForm('new-password-form');
    } else {
        showForm('reset-password-form');
    }

    // --- Envio do e-mail de recuperação ---
    const resetPasswordForm = document.getElementById('reset-password-form');
    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            const email = document.getElementById('email').value;
            try {
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin + '/reset-password.html'
                });
                if (error) throw error;
                alert('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
            } catch (error) {
                alert('Erro na recuperação de senha: ' + error.message);
            }
        });
    }

    // --- Redefinição de senha com token recovery ---
    const newPasswordForm = document.getElementById('new-password-form');
    if (newPasswordForm) {
        newPasswordForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            const newPassword = document.getElementById('new-password').value;
            try {
                const { error } = await supabase.auth.updateUser({ password: newPassword });
                if (error) throw error;
                alert('Senha redefinida com sucesso! Faça login novamente.');
                window.location.href = 'login.html';
            } catch (error) {
                alert('Erro ao redefinir senha: ' + error.message);
            }
        });
    }


    // --- MANTÉM O RESTANTE DO FLUXO CASO USE ESTE ARQUIVO EM OUTRAS PÁGINAS ---
    // (login, registro, logout, etc - só executa se existir os formulários correspondentes)

    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const logoutBtn = document.getElementById('logout-btn');

    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (registerForm) registerForm.addEventListener('submit', handleRegister);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    async function checkAuthState() {
        try {
            const { data: { user }, error } = await supabase.auth.getUser();

            if (error) throw error;

            if (user) {
                handleAuthenticatedUser(user);
            } else {
                handleUnauthenticatedUser();
            }
        } catch (error) {
            console.error('Erro ao verificar autenticação:', error);
            handleUnauthenticatedUser();
        }
    }

    function handleAuthenticatedUser(user) {
        const currentPage = window.location.pathname.split('/').pop();
        updateUserInterface(user);

        if (["login.html", "register.html", "reset-password.html", "index.html"].includes(currentPage)) {
            window.location.href = 'game.html';
        }
    }

    function handleUnauthenticatedUser() {
        const currentPage = window.location.pathname.split('/').pop();

        // Se acabou de deslogar, não mostrar alert
        if (localStorage.getItem('logout')) {
            localStorage.removeItem('logout');
            window.location.href = 'login.html';
            return;
        }

        if (["game.html", "profile.html"].includes(currentPage)) {
            alert('Você precisa fazer login para acessar esta página.');
            window.location.href = 'login.html';
        }
    }

    async function updateUserInterface(user) {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Erro ao buscar perfil:', error);
            return;
        }

        if (!profile) {
            await createUserProfile(user);
        }

        if (profile) {
            const balanceElement = document.getElementById('user-balance');
            if (balanceElement) balanceElement.textContent = `R$ ${(profile.balance || 0).toFixed(2)}`;
        }
    }

    async function createUserProfile(user) {
        const { data: exists } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', user.id)
            .single();

        if (exists) return;

        // Corrigido: NÃO envie o campo created_at, deixe o banco criar automaticamente!
        const { error } = await supabase
            .from('profiles')
            .insert([{
                id: user.id,
                email: user.email,
                name: user.user_metadata?.name || '',
                balance: 100.00
            }]);

        if (error) {
            console.error('Erro ao criar perfil:', error);
        } else {
            console.log('Perfil criado com sucesso');
        }
    }

    async function handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            alert('Login realizado com sucesso!');
            window.location.href = 'game.html';
        } catch (error) {
            console.error('Erro no login:', error);
            alert('Erro no login: ' + error.message);
        }
    }

    async function handleRegister(e) {
        e.preventDefault();
        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        const terms = document.getElementById('terms').checked;

        if (password !== confirmPassword) {
            alert('As senhas não coincidem.');
            return;
        }
        if (password.length < 6) {
            alert('A senha deve ter pelo menos 6 caracteres.');
            return;
        }
        if (!terms) {
            alert('Você deve aceitar os termos de uso.');
            return;
        }

        try {
            const { error } = await supabase.auth.signUp({
                email,
                password,
                options: { data: { name } }
            });
            if (error) throw error;
            alert('Conta criada com sucesso! Verifique seu e-mail para confirmar a conta.');
            window.location.href = 'login.html';
        } catch (error) {
            console.error('Erro no registro:', error);
            alert('Erro no registro: ' + error.message);
        }
    }

    async function handleLogout(e) {
        e.preventDefault();
        try {
            // Marca que foi logout manual
            localStorage.setItem('logout', '1');
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            alert('Logout realizado com sucesso!');
            window.location.href = 'index.html';
        } catch (error) {
            console.error('Erro no logout:', error);
            alert('Erro no logout: ' + error.message);
        }
    }

    // Assegura que o checkAuthState só rode se não estiver no fluxo de recovery
    if (!hashParams.get('type')) {
        checkAuthState();

        supabase.auth.onAuthStateChange((event, session) => {
            console.log('Auth state changed:', event, session);
            if (event === 'SIGNED_IN' && session && session.user) {
                handleAuthenticatedUser(session.user);
            } else if (event === 'SIGNED_OUT') {
                handleUnauthenticatedUser();
            }
        });
    }
});