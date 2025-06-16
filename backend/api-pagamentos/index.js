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

// CORS
app.use(cors({
  origin: 'https://numero-randomico.netlify.app', // Troque para o domínio real do seu front
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
}));

app.use(express.json());

// DEBUG vars de ambiente
console.log('[DEBUG] MP_ACCESS_TOKEN:', !!process.env.MP_ACCESS_TOKEN);
console.log('[DEBUG] MAIL_USER:', process.env.MAIL_USER);
console.log('[DEBUG] MAIL_PASS:', process.env.MAIL_PASS ? '****' : 'NÃO DEFINIDA');

// Inicialize Mercado Pago
const mpClient = new mercadopago.MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});
const preference = new mercadopago.Preference(mpClient);

// === [ROTA DE PAGAMENTO - CHECKOUT PADRÃO] ===
app.post('/api/create-payment-preference', async (req, res) => {
  try {
    const { amount, description, user_id } = req.body;
    if (!amount) {
      return res.status(400).json({ error: 'amount obrigatório' });
    }

    // Use a URL pública do seu backend hospedado!
    const notification_url = "https://random-num.onrender.com/webhook-mercadopago";

    const preferenceData = {
      items: [
        {
          title: description || 'Depósito',
          unit_price: Number(amount),
          quantity: 1,
          currency_id: "BRL" // <-- OBRIGATÓRIO PARA EVITAR ERRO 400!
        }
      ],
      external_reference: user_id,
      payment_methods: {
        excluded_payment_types: [],
        installments: 1,
      },
      notification_url // <- ADICIONADO!
    };

    const result = await preference.create({ body: preferenceData });
    console.log('[DEBUG] MercadoPago preference.create result:', result);
    // Correção: preference_id vem de result.id, não result.body.id!
    res.json({ preference_id: result.id });
  } catch (error) {
    console.error('[ERROR] MercadoPago:', error);
    if (error.cause && Array.isArray(error.cause)) {
      error.cause.forEach((e, i) => {
        console.error(`[ERROR] MercadoPago cause ${i}:`, e);
      });
    }
    res.status(500).json({ error: 'Erro ao criar preferência de pagamento', details: error.message || error });
  }
});

// === [ROTA DE PAGAMENTO PIX DIRETO] ===
app.post('/pagamento', async (req, res) => {
  try {
    const { amount, email, user_id } = req.body; // user_id agora é obrigatório!
    if (!amount || !email || !user_id) {
      return res.status(400).json({ error: 'amount, email e user_id são obrigatórios' });
    }

    const paymentData = {
      transaction_amount: Number(amount),
      description: 'Depósito via Pix',
      payment_method_id: 'pix',
      payer: {
        email: email,
        first_name: 'Cliente',
      },
      external_reference: user_id // IMPORTANTÍSSIMO para creditar saldo depois!
    };

    const payment = new mercadopago.Payment(mpClient);

    const result = await payment.create({ body: paymentData });

    // Retornar apenas os dados relevantes para o frontend
    if (
      result &&
      result.point_of_interaction &&
      result.point_of_interaction.transaction_data &&
      result.point_of_interaction.transaction_data.qr_code_base64
    ) {
      res.json({
        id: result.id,
        status: result.status,
        point_of_interaction: result.point_of_interaction
      });
    } else {
      // Se não veio o QR, loga tudo para debug
      console.error('[ERROR] Resposta inesperada do Mercado Pago:', JSON.stringify(result, null, 2));
      res.status(500).json({ error: 'Erro ao gerar pagamento Pix', details: 'Resposta inesperada do Mercado Pago', full: result });
    }
  } catch (error) {
    // Mostra erro detalhado do Mercado Pago (se houver)
    if (error.cause && Array.isArray(error.cause)) {
      error.cause.forEach((e, i) => {
        console.error(`[ERROR] Pix Cause ${i}:`, e);
      });
    }
    console.error('[ERROR] Pix:', error);
    res.status(500).json({ error: 'Erro ao gerar pagamento Pix', details: error.message || error });
  }
});

// === [WEBHOOK MERCADO PAGO] ===
app.post('/webhook-mercadopago', async (req, res) => {
  try {
    // Mercado Pago pode enviar tanto application/json quanto x-www-form-urlencoded
    let body = req.body;
    // Render/Express pode não parsear corretamente body se o header não for JSON, então garanta isso em produção!
    // Para pagamentos: virá { "type": "payment", "data": { "id": ... } }
    if (body && body.type === "payment" && body.data && body.data.id) {
      const payment = new mercadopago.Payment(mpClient);
      const result = await payment.get({ id: body.data.id });

      // Só credita se aprovado!
      if (result.status === 'approved') {
        const userId = result.external_reference;
        const valor = result.transaction_amount;

        if (!userId) {
          console.error('[WEBHOOK] Sem external_reference, impossível creditar saldo.');
        } else {
          // Atualiza saldo (credita)
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('balance')
            .eq('id', userId)
            .single();

          if (profileError || !profile) {
            console.error('[WEBHOOK] Usuário não encontrado:', userId);
          } else {
            const novoSaldo = parseFloat(profile.balance) + valor;
            const { error: updateError } = await supabase
              .from('profiles')
              .update({ balance: novoSaldo })
              .eq('id', userId);

            if (updateError) {
              console.error('[WEBHOOK] Erro ao atualizar saldo:', updateError);
            } else {
              // Registra a transação como "completed"
              await supabase
                .from('transactions')
                .insert([{
                  user_id: userId,
                  type: 'deposit',
                  amount: valor,
                  payment_method: 'pix',
                  status: 'completed'
                }]);
              console.log(`[WEBHOOK] Saldo creditado para o usuário ${userId}: +R$${valor}`);
            }
          }
        }
      }
    }
    res.sendStatus(200);
  } catch (error) {
    console.error('[WEBHOOK] Erro:', error);
    res.sendStatus(500);
  }
});

// === [ROTA DE CONSULTA DE SALDO] ===
app.get('/api/saldo', async (req, res) => {
  try {
    const user_id = req.query.user_id;
    if (!user_id) {
      return res.status(400).json({ error: 'user_id obrigatório' });
    }
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', user_id)
      .single();

    if (error || !profile) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    res.json({ balance: parseFloat(profile.balance) });
  } catch (error) {
    console.error('[SALDO] Erro ao buscar saldo:', error);
    res.status(500).json({ error: 'Erro ao buscar saldo.' });
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

    if (profileError || !profile) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const saldoAtual = parseFloat(profile.balance);
    if (saldoAtual < valor) {
      return res.status(400).json({ error: 'Saldo insuficiente para saque.' });
    }

    // 2. Descontar valor
    const novoSaldo = saldoAtual - valor;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ balance: novoSaldo })
      .eq('id', user_id);

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