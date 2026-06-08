# Recommendation Frontend

React + Vite frontend for the recommendation system demo.

## Modes

- Store mode keeps the shopping interface and refreshes recommended products after search or cart actions.
- Experiment mode exposes dataset, user ID, algorithm, Top-K, training history, recommendations, and offline metrics.

## Development

Start the backend API first:

```bash
cd ../backend
uvicorn src.api_server:app --reload --host 127.0.0.1 --port 8000
```

Then start the frontend:

```bash
corepack pnpm install
corepack pnpm dev
```

The default API endpoint is `http://localhost:8000`. Override it with:

```bash
VITE_API_BASE_URL=http://localhost:8000 corepack pnpm dev
```

## Build

```bash
corepack pnpm build
```
