# Where'sMyMoney

Aplicação web para análise de faturas de cartão de crédito.

## Stack

- **Frontend**: React + Vite + Tailwind CSS + Recharts
- **Backend**: Node.js + Express
- **Banco**: PostgreSQL 16
- **Infra**: Docker Compose

---

## Início Rápido

### Pré-requisitos

- [Docker](https://docs.docker.com/get-docker/) e Docker Compose instalados

### Subir tudo com um comando

```bash
docker-compose up --build
```

Aguarde os containers iniciarem (cerca de 1-2 minutos na primeira vez).

### Acessar

| Serviço    | URL                        |
|------------|----------------------------|
| Frontend   | http://localhost:5173      |
| Backend    | http://localhost:3001      |
| API Health | http://localhost:3001/api/health |

---

## Desenvolvimento Local (sem Docker)

### Backend

```bash
cd backend
npm install
# Edite .env com suas credenciais do Postgres
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## Formatos de Arquivo Suportados

### CSV Genérico
A coluna de data, descrição e valor são detectadas automaticamente por nome.

**Exemplo:**
```
Data,Descrição,Valor
15/04/2024,UBER TRIP,25.90
16/04/2024,IFOOD PEDIDO,48.00
17/04/2024,NETFLIX,55.90
```

### OFX (Open Financial Exchange)
Padrão bancário usado por muitos bancos brasileiros.

### Nubank CSV
```
date,category,title,amount
2024-04-15,transport,Uber,-25.90
```

---

## Funcionalidades

- ✅ Upload de fatura CSV/OFX/TXT
- ✅ Categorização automática por palavras-chave
- ✅ Edição manual de categoria por transação
- ✅ Gráfico de pizza por categoria
- ✅ Gráfico de área (gastos ao longo do mês)
- ✅ Bar chart top 10 estabelecimentos
- ✅ Tabela com filtro, busca e paginação
- ✅ Múltiplas faturas (histórico)

---

## Estrutura do Projeto

```
fatura-app/
├── docker-compose.yml
├── postgres/
│   └── init.sql           # Schema + categorias padrão
├── backend/
│   ├── src/
│   │   ├── server.js
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── models/db.js
│   │   └── utils/faturaParser.js
│   └── package.json
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   ├── pages/
    │   ├── components/
    │   └── utils/
    └── package.json
```

---

## API Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /api/faturas | Lista faturas |
| POST | /api/faturas/upload | Importa fatura (multipart) |
| GET | /api/faturas/:id | Detalhe + transações |
| GET | /api/faturas/:id/resumo | Resumo analítico |
| DELETE | /api/faturas/:id | Remove fatura |
| GET | /api/faturas/:id/transacoes | Lista com filtros |
| PATCH | /api/transacoes/:id/categoria | Atualiza categoria |
| GET | /api/categorias | Lista categorias |
