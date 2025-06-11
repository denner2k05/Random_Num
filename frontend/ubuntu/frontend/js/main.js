// Verificar se o usuário está logado
document.addEventListener('DOMContentLoaded', function() {
    // Aqui será implementada a verificação de autenticação com Supabase
    // Por enquanto, apenas simulamos a animação na página inicial
    
    // Animação dos números na página inicial
    if (document.querySelector('.number-animation')) {
        const numberElement = document.querySelector('.number-animation span');
        const numbers = ['?', '7', '23', '42', '88', '?'];
        let currentIndex = 0;
        
        setInterval(() => {
            currentIndex = (currentIndex + 1) % numbers.length;
            numberElement.textContent = numbers[currentIndex];
            
            // Adicionar classe para animação
            numberElement.classList.add('animate');
            
            // Remover classe após a animação
            setTimeout(() => {
                numberElement.classList.remove('animate');
            }, 500);
        }, 2000);
    }
});

// Função para redirecionar para a página de jogo se estiver logado
function checkAuthAndRedirect() {
    // Aqui será implementada a verificação de autenticação com Supabase
    // Por enquanto, apenas simulamos o comportamento
    
    const isLoggedIn = false; // Será substituído pela verificação real
    
    if (isLoggedIn) {
        window.location.href = 'game.html';
    }
}

// Smooth scroll para âncoras
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        
        const targetId = this.getAttribute('href');
        if (targetId === '#') return;
        
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
            window.scrollTo({
                top: targetElement.offsetTop - 100,
                behavior: 'smooth'
            });
        }
    });
});

