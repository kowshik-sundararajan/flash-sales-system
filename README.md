# Flash sale

A flash sale backend and a simple React frontend: one product, limited stock, a sale window and one item per user, built to hold up under high concurrency without overselling.

This is the project skeleton. Design decisions are in [docs/decisions.md](docs/decisions.md).

## Run

```bash
nvm use
npm ci
npm run dev:api
npm run dev:web
```

Run the two dev commands in separate terminals, then open http://localhost:5173. The page shows "API: ok" when it can reach the API.

## Test

```bash
npm run check
```

This runs the type checks, lint and the unit tests.
