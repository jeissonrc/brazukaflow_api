// Importa o Express (framework que cria o servidor e gerencia rotas)
const express = require('express');

// Inicializa a aplicação
const app = express();

// Importa as rotas dos módulos
const userRoutes = require('./routes/userRoutes');
const profileRoutes = require('./routes/profileRoutes');
const accountsPayableRoutes = require('./routes/accountsPayableRoutes');
const accountsReceivableRoutes = require('./routes/accountsReceivableRoutes');
const categoryTypeRoutes = require('./routes/categoryTypeRoutes');
const accountTypeRoutes = require('./routes/accountTypeRoutes');
const paymentTypeRoutes = require('./routes/paymentTypeRoutes');
const cashAccountRoutes = require('./routes/cashAccountRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const incomeRoutes = require('./routes/incomeRoutes');
const paymentMethodRoutes = require('./routes/paymentMethodRoutes');
const originAccountsRoutes = require('./routes/originAccountsRoutes');
const auditLogRoutes = require('./routes/auditLogRoutes');
const backupRoutes = require('./routes/backupRoutes');
const homeDashboardRoutes = require('./routes/homeDashboardRoutes');

// Importa os middlewares personalizados
// - responseMiddleware: garante respostas padronizadas
// - errorMiddleware: lida com erros e envia mensagens amigáveis
const responseMiddleware = require('./middlewares/responseMiddleware');
const errorMiddleware = require('./middlewares/errorMiddleware');

// Habilita o Express para receber requisições em JSON
app.use(express.json());

// CORS para permitir acesso do frontend local
app.use((req, res, next) => {
  const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

// Middleware global para formatar respostas antes de enviar ao cliente
app.use(responseMiddleware);

// Cadastro das rotas da API
app.use('/api/users', userRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/accounts-payable', accountsPayableRoutes);
app.use('/api/accounts-receivable', accountsReceivableRoutes);
app.use('/api/category-types', categoryTypeRoutes);
app.use('/api/account-types', accountTypeRoutes);
app.use('/api/payment-types', paymentTypeRoutes);
app.use('/api/cash-accounts', cashAccountRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/incomes', incomeRoutes);
app.use('/api/payment-methods', paymentMethodRoutes);
app.use('/api/origin-accounts', originAccountsRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/dashboard', homeDashboardRoutes);


// Middleware final — pega QUALQUER erro que acontecer no sistema e envia uma resposta ao cliente (sempre deve ser o último .use())
app.use(errorMiddleware);

// Exporta o app para que o server.js possa iniciar o servidor
module.exports = app;
