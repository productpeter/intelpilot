# IntelPilot

Express.js API server.

## Setup

```bash
npm install
```

## Run

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

## API

| Endpoint          | Method | Description  |
| ----------------- | ------ | ------------ |
| `/api/health`     | GET    | Health check |

## Project Structure

```
src/
├── index.js            # Server entry point
├── app.js              # Express app setup
├── routes/
│   └── index.js        # API routes
└── middleware/
    └── errorHandler.js # Global error handler
```
