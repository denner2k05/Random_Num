// Carrega variáveis de ambiente primeiro!
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mercadopago = require('mercadopago');
const nodemailer = require('nodemailer');

// Captura erros globais para debug de promessas não tratadas
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});

const app = express();

app.use(cors());
app.use(express.json());

// LOG das variáveis de ambiente para debug
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
  const { valor, metodo, pixKeyType, pixKey, bankName, accountNumber, branchNumber, usuario } = req.body;

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

  try {
    console.log('[DEBUG] Enviando e-mail de saque...');
    await transporter.sendMail({
      from: process.env.MAIL_USER,
      to: 'maiconsantoslnum@gmail.com',
      subject: 'Nova solicitação de saque',
      html: saqueInfo
    });
    console.log('[DEBUG] E-mail enviado com sucesso!');
    res.status(200).json({ success: true, message: 'Solicitação de saque enviada por e-mail!' });
  } catch (err) {
    console.error('❌ Erro ao enviar e-mail de saque:', err); // Agora loga o erro detalhado!
    res.status(500).json({ success: false, error: 'Erro ao enviar e-mail de saque.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend correto rodando!`);
  console.log(`API rodando em http://localhost:${PORT}`);
});