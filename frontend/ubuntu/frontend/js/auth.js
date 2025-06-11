document.addEventListener('DOMContentLoaded', function() {
    const supabase = window.supabaseClient;

    checkAuthState();

    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const resetPasswordForm = document.getElementById('reset-password-form');
    const logoutBtn = document.getElementById('logout-btn');

    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (registerForm) registerForm.addEventListener('submit', handleRegister);
    if (resetPasswordForm) resetPasswordForm.addEventListener('submit', handleResetPassword);
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

    async function handleResetPassword(e) {
        e.preventDefault();
        const email = document.getElementById('email').value;
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/reset-password.html'
            });
            if (error) throw error;
            alert('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
        } catch (error) {
            console.error('Erro na recuperação de senha:', error);
            alert('Erro na recuperação de senha: ' + error.message);
        }
    }

    async function handleLogout(e) {
        e.preventDefault();
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            alert('Logout realizado com sucesso!');
            window.location.href = 'index.html';
        } catch (error) {
            console.error('Erro no logout:', error);
            alert('Erro no logout: ' + error.message);
        }
    }

    supabase.auth.onAuthStateChange((event, session) => {
        console.log('Auth state changed:', event, session);
        if (event === 'SIGNED_IN' && session && session.user) {
            handleAuthenticatedUser(session.user);
        } else if (event === 'SIGNED_OUT') {
            handleUnauthenticatedUser();
        }
    });
});