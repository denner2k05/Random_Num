// Carrega variáveis de ambiente primeiro!
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mercadopago = require('mercadopago');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');

// === SUPABASE CLIENT ===
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Captura erros globais para debug de promessas não tratadas
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});

const app = express();

// === CORS CORRIGIDO ===
app.use(cors({
  origin: 'https://numero-randomico.netlify.app', // ALTERA para o domínio real do seu front
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
}));

app.use(express.json());

// DEBUG vars de ambiente
console.log('[DEBUG] MAIL_USER:', process.env.MAIL_USER);
console.log('[DEBUG] MAIL_PASS:', process.env.MAIL_PASS ? '****' : 'NÃO DEFINIDA');

// Inicialize Mercado Pago
const client = new mercadopago.MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});
const preference = new mercadopago.Preference(client);

// === [ROTA DE PAGAMENTO] ===
app.post('/api/create-payment-preference', async (req, res) => {
  try {
    const { amount, description, user_id } = req.body;
    if (!amount) {
      return res.status(400).json({ error: 'amount obrigatório' });
    }

    const preferenceData = {
      items: [
        {
          title: description || 'Depósito',
          unit_price: Number(amount),
          quantity: 1,
        }
      ],
      external_reference: user_id,
    };

    const result = await preference.create({ body: preferenceData });
    res.json({ preference_id: result.id });
  } catch (error) {
    console.error('[ERROR] MercadoPago:', error);
    res.status(500).json({ error: 'Erro ao criar preferência de pagamento', details: error.message || error });
  }
});

// === [CONFIGURAÇÃO NODEMAILER] ===
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

// === [ROTA DE SAQUE] ===
app.post('/api/solicitar-saque', async (req, res) => {
  console.log('🟢 Recebido POST em /api/solicitar-saque!!!');
  const { valor, metodo, pixKeyType, pixKey, bankName, accountNumber, branchNumber, usuario, user_id } = req.body;

  console.log('user_id recebido:', user_id, '| valor:', valor);

  if (!user_id || typeof valor !== 'number' || valor <= 0) {
    return res.status(400).json({ error: 'Dados inválidos para saque.' });
  }

  try {
    // 1. Buscar saldo atual
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', user_id)
      .single();

    console.log('profile retornado do Supabase:', profile);
    console.log('profileError:', profileError);

    if (profileError || !profile) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const saldoAtual = parseFloat(profile.balance);
    if (saldoAtual < valor) {
      return res.status(400).json({ error: 'Saldo insuficiente para saque.' });
    }

    // 2. Descontar valor
    const novoSaldo = saldoAtual - valor;
    console.log('Descontando valor. Saldo atual:', saldoAtual, '| Valor:', valor, '| Novo saldo:', novoSaldo);

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ balance: novoSaldo })
      .eq('id', user_id);

    console.log('updateError:', updateError);

    if (updateError) {
      return res.status(500).json({ error: 'Erro ao atualizar saldo.' });
    }

    // 3. Registrar transação
    await supabase
      .from('transactions')
      .insert([{
        user_id: user_id,
        type: 'withdrawal',
        amount: valor,
        payment_method: metodo,
        status: 'pending'
      }]);

    // 4. Enviar e-mail
    let saqueInfo = `<b>Solicitação de saque recebida:</b><br>`;
    saqueInfo += `<b>Usuário:</b> ${usuario || 'Desconhecido'}<br>`;
    saqueInfo += `<b>Valor:</b> R$ ${Number(valor).toFixed(2)}<br>`;
    saqueInfo += `<b>Método:</b> ${metodo}<br>`;
    if (metodo === 'pix') {
      saqueInfo += `<b>Tipo de chave PIX:</b> ${pixKeyType || ''}<br>`;
      saqueInfo += `<b>Chave PIX:</b> ${pixKey || ''}<br>`;
    }
    if (metodo === 'bank-transfer') {
      saqueInfo += `<b>Banco:</b> ${bankName || ''}<br>`;
      saqueInfo += `<b>Conta:</b> ${accountNumber || ''}<br>`;
      saqueInfo += `<b>Agência:</b> ${branchNumber || ''}<br>`;
    }

    await transporter.sendMail({
      from: process.env.MAIL_USER,
      to: 'maiconsantoslnum@gmail.com',
      subject: 'Nova solicitação de saque',
      html: saqueInfo
    });

    res.status(200).json({ success: true, message: 'Solicitação de saque enviada e saldo descontado!' });

  } catch (err) {
    console.error('❌ Erro no saque:', err);
    res.status(500).json({ success: false, error: 'Erro ao processar o saque.' });
  }
});

// === [START SERVER - Porta dinâmica para Railway] ===
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Backend correto rodando!`);
  console.log(`API rodando em http://localhost:${PORT}`);
});
