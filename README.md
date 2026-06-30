# BRazucaFlow API

API REST do **BRazucaFlow**, uma plataforma de gerenciamento financeiro para controle de contas, movimentações, cadastros, relatórios, auditoria e manutenção.

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Sequelize](https://img.shields.io/badge/Sequelize-6-52B0E7?logo=sequelize&logoColor=white)](https://sequelize.org/)
[![Status](https://img.shields.io/badge/status-em%20desenvolvimento-F9C74F)](#status-do-projeto)

## Acesso online

| Recurso | Endereço |
| --- | --- |
| API publicada | [api.brazukaflow.com.br](https://api.brazukaflow.com.br/) |
| Documentação técnica | [api.brazukaflow.com.br/docs](https://api.brazukaflow.com.br/docs) |
| Aplicação web | [brazukaflow.com.br](https://brazukaflow.com.br/) |
| Repositório do frontend | [brazukaflow_front_app](https://github.com/jeissonrc/brazukaflow_front_app) |

> A instância gratuita do serviço pode levar alguns segundos para responder ao primeiro acesso após um período de inatividade.

## Visão geral

A API concentra as regras de negócio e a persistência do BRazucaFlow. Entre as principais responsabilidades estão:

- autenticação com JWT e controle de acesso por perfil;
- contas a pagar e a receber, incluindo geração em massa;
- confirmação e reversão de pagamentos e recebimentos;
- geração vinculada de receitas e despesas;
- receitas, despesas e contas de caixa;
- plano de contas, categorias, tipos de pagamento e origens;
- dashboard financeiro com dados consolidados;
- auditoria das ações realizadas no sistema;
- limpeza controlada e exportação dos logs;
- backup SQL completo da estrutura e dos dados.

## Perfis de acesso

| Perfil | Responsabilidade |
| --- | --- |
| Super Admin | Acesso integral, auditoria, manutenção e exportação de backup |
| Administrador | Gerenciamento operacional e dos principais cadastros do sistema |
| Operacional | Rotinas financeiras e manutenção dos próprios dados permitidos |

As permissões são validadas no backend. Ocultar uma função no frontend não substitui a autorização realizada pela API.

## Tecnologias

- Node.js 18+
- Express 5
- Sequelize 6
- MySQL
- JSON Web Token
- bcrypt

## Endpoints

Todos os recursos, exceto o login, exigem um token JWT válido.

| Módulo | Prefixo |
| --- | --- |
| Usuários e autenticação | `/api/users` |
| Perfis | `/api/profiles` |
| Contas a pagar | `/api/accounts-payable` |
| Contas a receber | `/api/accounts-receivable` |
| Receitas | `/api/incomes` |
| Despesas | `/api/expenses` |
| Contas de caixa | `/api/cash-accounts` |
| Categorias do plano de contas | `/api/category-types` |
| Tipos de contas | `/api/account-types` |
| Tipos de pagamento | `/api/payment-types` |
| Formas de pagamento | `/api/payment-methods` |
| Origens de contas | `/api/origin-accounts` |
| Dashboard | `/api/dashboard` |
| Auditoria | `/api/audit-logs` |
| Backups | `/api/backups` |

A relação completa de métodos, parâmetros, filtros e exemplos está disponível na [documentação técnica online](https://api.brazukaflow.com.br/docs).

## Autenticação

O login é realizado por meio de:

```http
POST /api/users/login
Content-Type: application/json
```

```json
{
  "username": "<usuario>",
  "password": "<senha>"
}
```

Quando a autenticação é válida, a resposta contém os dados públicos do usuário e um token com duração de 8 horas. Esse token deve acompanhar as rotas protegidas:

```http
Authorization: Bearer <token>
```

Credenciais reais não são mantidas neste README nem devem ser versionadas no repositório.

## Formato das respostas

As respostas de sucesso seguem uma estrutura comum:

```json
{
  "success": true,
  "data": {},
  "status": 200
}
```

Os erros utilizam códigos HTTP adequados e uma mensagem descritiva, sem exposição de senhas ou segredos de autenticação.

## Ambiente de produção

O serviço publicado utiliza variáveis de ambiente gerenciadas pela plataforma de hospedagem:

| Variável | Finalidade |
| --- | --- |
| `NODE_ENV` | Identificação do ambiente de execução |
| `PORT` | Porta fornecida pela plataforma |
| `DB_HOST` | Host do MySQL |
| `DB_PORT` | Porta do MySQL |
| `DB_NAME` | Nome do banco |
| `DB_USER` | Usuário do banco |
| `DB_PASSWORD` | Senha do banco |
| `DB_SSL` | Ativação de conexão SSL |
| `JWT_SECRET` | Assinatura dos tokens JWT |
| `FRONTEND_URL` | Origem autorizada para o frontend |

Os valores dessas variáveis devem permanecer exclusivamente no ambiente seguro de deploy.

## Backup e restauração

O endpoint de backup gera um arquivo SQL contendo:

- comandos de criação das tabelas;
- chaves e relacionamentos;
- registros existentes no momento da exportação;
- controle temporário das verificações de chaves estrangeiras.

Os identificadores são normalizados para a sintaxe portátil do MySQL, permitindo restaurar o arquivo em ambientes MySQL compatíveis. A restauração deve ser feita em um banco selecionado previamente e com acesso administrativo apropriado.

## Organização

```text
src/
├── config/        # Banco de dados e autenticação
├── constants/     # Identificadores e papéis do sistema
├── controllers/   # Entrada e saída das requisições
├── middlewares/   # Autenticação, respostas e erros
├── models/        # Mapeamento das entidades Sequelize
├── routes/        # Definição dos endpoints
├── seeders/       # Estrutura e registros essenciais
└── services/      # Regras de negócio e acesso aos dados
public/
├── index.html     # Página institucional da API
└── docs/          # Documentação técnica publicada
server.js          # Inicialização do serviço
```

## Segurança

- Senhas são armazenadas com hash bcrypt.
- Tokens JWT expiram após 8 horas.
- Rotas privadas exigem autenticação.
- Operações administrativas possuem validação de perfil.
- Ações relevantes são registradas na auditoria.
- Senhas, tokens e variáveis sensíveis não devem ser enviados ao Git.

## Status do projeto

Projeto em desenvolvimento ativo. A versão publicada corresponde à API `1.0.0`.
