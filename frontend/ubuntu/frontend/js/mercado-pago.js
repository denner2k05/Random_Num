// Sistema de pagamentos com Mercado Pago + integração Pix via API Node/Express

// Troque aqui pela URL do seu backend no Render!
const BACKEND_URL = 'https://random-num.onrender.com';

class MercadoPagoPayments {
    constructor() {
        this.mp = null;
        this.initialized = false;
    }

    // Inicializar Mercado Pago (para checkout padrão, se necessário)
    async initialize() {
        if (this.initialized) return;
        try {
            await this.loadMercadoPagoSDK();
            const publicKey = window.mercadoPagoConfig?.publicKey;
            // Aceita qualquer chave não vazia (produção ou teste)
            if (publicKey && publicKey.trim() !== '') {
                this.mp = new window.MercadoPago(publicKey);
                this.initialized = true;
                console.log('Mercado Pago inicializado com sucesso');
            } else {
                console.warn('Chave pública do Mercado Pago não configurada');
            }
        } catch (error) {
            console.error('Erro ao inicializar Mercado Pago:', error);
        }
    }

    // Carregar SDK do Mercado Pago
    loadMercadoPagoSDK() {
        return new Promise((resolve, reject) => {
            if (window.MercadoPago) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://sdk.mercadopago.com/js/v2';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // Criar preferência de pagamento (para checkout padrão)
    async createPaymentPreference(amount, description = 'Depósito no Jogo de Adivinhação') {
        try {
            const response = await fetch(`${BACKEND_URL}/api/create-payment-preference`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    amount: amount,
                    description: description,
                    user_id: await this.getCurrentUserId()
                })
            });
            if (!response.ok) {
                throw new Error('Erro ao criar preferência de pagamento');
            }
            const data = await response.json();
            return data.preference_id;
        } catch (error) {
            console.error('Erro ao criar preferência:', error);
            throw error;
        }
    }

    // Pagamento Pix direto via API Node/Express
    async processPixPayment(amount, email, user_id) {
        // Agora exige os 3 argumentos obrigatórios!
        if (!amount || !email || !user_id) {
            throw new Error("amount, email e user_id são obrigatórios");
        }
        try {
            const response = await fetch(`${BACKEND_URL}/pagamento`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: amount,
                    email: email,
                    user_id: user_id
                })
            });
            const data = await response.json();
            if (!response.ok || data.error) {
                throw new Error(data.error || 'Erro ao criar pagamento PIX');
            }
            // Exiba o QR Code Pix (campo qr_code_base64)
            const qrBase64 = data.point_of_interaction?.transaction_data?.qr_code_base64;
            const qrCodePix = data.point_of_interaction?.transaction_data?.qr_code;
            if (qrBase64 || qrCodePix) {
                this.showPixQrModal(qrBase64, qrCodePix);
            } else {
                alert('Pagamento criado, mas sem QR Code.');
            }
        } catch (error) {
            alert('Erro ao criar pagamento PIX: ' + error.message);
            console.error(error);
        }
    }

    // Exibe modal com QR Code Pix e botão para copiar a chave Pix (copia e cola)
    showPixQrModal(qrBase64, qrCodeText) {
        // Garanta que existe um modal com id 'pix-qr-modal' e img 'pix-qr-img' no seu HTML!
        let modal = document.getElementById('pix-qr-modal');
        let img = document.getElementById('pix-qr-img');
        let codeText = document.getElementById('pix-qr-code-text');
        let copyBtn = document.getElementById('pix-copy-btn');
        let copyMsg = document.getElementById('pix-copy-msg');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'pix-qr-modal';
            modal.style = 'display:flex;justify-content:center;align-items:center;position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);z-index:9999;';
            img = document.createElement('img');
            img.id = 'pix-qr-img';
            img.style = 'max-width:350px;max-height:350px;display:block;margin:0 auto 15px auto;';
            codeText = document.createElement('textarea');
            codeText.id = 'pix-qr-code-text';
            codeText.style = 'width:100%;height:60px;display:block;margin:0 auto 10px auto;font-size:16px;resize:none;';
            codeText.readOnly = true;
            copyBtn = document.createElement('button');
            copyBtn.id = 'pix-copy-btn';
            copyBtn.textContent = 'Copiar chave Pix';
            copyBtn.style = 'display:block;margin:0 auto 10px auto;font-size:16px;padding:8px 16px;cursor:pointer;';
            copyMsg = document.createElement('span');
            copyMsg.id = 'pix-copy-msg';
            copyMsg.style = 'display:block;margin:0 auto 10px auto;color:green;font-weight:bold;';
            const closeBtn = document.createElement('button');
            closeBtn.textContent = 'Fechar';
            closeBtn.onclick = () => modal.style.display = 'none';
            closeBtn.style = 'display:block;margin:0 auto;';
            let inner = document.createElement('div');
            inner.style = 'background:#fff;padding:20px;border-radius:6px;text-align:center;max-width:400px;width:90vw;';
            inner.appendChild(img);
            inner.appendChild(codeText);
            inner.appendChild(copyBtn);
            inner.appendChild(copyMsg);
            inner.appendChild(closeBtn);
            modal.appendChild(inner);
            document.body.appendChild(modal);

            // Evento de copiar chave Pix
            copyBtn.onclick = async () => {
                try {
                    await navigator.clipboard.writeText(codeText.value);
                    copyMsg.textContent = 'Chave Pix copiada!';
                    setTimeout(() => {
                        copyMsg.textContent = '';
                    }, 2000);
                } catch (err) {
                    copyMsg.textContent = 'Erro ao copiar!';
                    setTimeout(() => {
                        copyMsg.textContent = '';
                    }, 2000);
                }
            };
        }
        img.src = 'data:image/png;base64,' + qrBase64;
        codeText.value = qrCodeText || '';
        modal.style.display = 'flex';
        if (copyMsg) copyMsg.textContent = '';
    }

    // Obter ID do usuário atual (Supabase)
    async getCurrentUserId() {
        if(!window.supabaseClient) return null;
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        return user?.id;
    }

    // Processar pagamento padrão via Checkout do Mercado Pago
    async processPayment(amount) {
        if (!this.initialized) {
            await this.initialize();
        }
        if (!this.mp) {
            throw new Error('Mercado Pago não está configurado');
        }
        try {
            const preferenceId = await this.createPaymentPreference(amount);
            this.mp.checkout({
                preference: {
                    id: preferenceId
                },
                autoOpen: true
            });
        } catch (error) {
            console.error('Erro ao processar pagamento:', error);
            throw error;
        }
    }

    // Pagamento com cartão (exemplo, checkout avançado)
    async processCardPayment(cardData, amount) {
        if (!this.initialized) {
            await this.initialize();
        }
        try {
            const token = await this.mp.createCardToken(cardData);
            const response = await fetch(`${BACKEND_URL}/api/process-card-payment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    token: token.id,
                    amount: amount,
                    user_id: await this.getCurrentUserId()
                })
            });
            if (!response.ok) {
                throw new Error('Erro ao processar pagamento');
            }
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Erro no pagamento com cartão:', error);
            throw error;
        }
    }
}

// Instância global do sistema de pagamentos
window.mercadoPagoPayments = new MercadoPagoPayments();