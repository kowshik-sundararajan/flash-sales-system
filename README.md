# Flash sale

A flash sale system for one product with limited stock.

## Tech stack

- API: Node.js (TypeScript) with Fastify
- Web: React, Vite, served by nginx
- Data: Redis and MongoDB
- Tests: Vitest, testcontainers, k6

## 1. Requirements

- One product, limited stock, a sale window with a start and an end, one item per user.
- Endpoints: sale status (upcoming, active, ended), attempt a purchase, check whether a user got an item.
- A simple frontend. The page also shows `sold_out` (active, nothing left).
- Non-functional: high throughput and scalability, fault tolerance, no overselling under concurrency.
- Stress tests with instructions, expected outcome and an explanation of the results.

For the purposes of this exercise, authentication is ignored.

## 2. Architecture

### High-level design

```mermaid
flowchart LR
    client(["Browser"])
    nginx["nginx"]
    api["API x3"]
    redis[("Redis")]
    worker["Worker x2"]
    mongo[("MongoDB")]

    client --> nginx
    nginx --> api
    api -->|"purchase (Lua)"| redis
    api -->|"lookup"| redis
    api -->|"sale page"| mongo
    redis -->|"stream"| worker
    worker -->|"persist"| mongo
```

**Write path (purchase the product):**

1. The browser sends `POST /api/sales/:saleId/purchases` to **nginx**, which rate-limits and picks an **API** replica.
2. The **API** validates the request and runs one Lua script on **Redis**.
3. The script checks the window, one-per-user and stock, then decrements stock, sets the user key and appends to the purchase stream, all atomically. The API answers 201 or 409.
4. A **Worker** reads the stream in batches and writes the purchases to **MongoDB**, then updates the remaining stock.

**Read path:**

1. Sale page: the **API** reads the sale from **MongoDB**, so stock can lag slightly.
2. Purchase lookup: the **API** reads the user key from **Redis**, so it is correct as soon as the purchase commits.

### Flows

#### Purchase the product

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant N as nginx
    participant A as API
    participant R as Redis

    U->>N: POST /purchases {userId}
    N->>A: forward
    A->>R: EVAL purchase script
    alt window, user and stock checks pass
        R-->>A: PURCHASED
        A-->>U: 201
    else rejected by a check
        R-->>A: NOT_STARTED / ENDED / ALREADY_PURCHASED / SOLD_OUT
        A-->>U: 409
    else Redis down or slow
        A-->>U: 503 (safe to retry)
    end
```

#### Sync purchases to MongoDB

```mermaid
sequenceDiagram
    autonumber
    participant W as Worker
    participant R as Redis stream
    participant M as MongoDB

    loop every batch
        W->>R: XREADGROUP (up to 500)
        R-->>W: entries
        W->>M: insertMany
        W->>M: update remaining stock
        W->>R: XACK + XDEL
    end
```

Malformed entries go to a dead-letter stream, and a failed batch is not acked, so it is retried.

A purchase is decided entirely in Redis; workers copy it to Mongo afterwards. The sale page reads Mongo, so its stock trails the real count.

### API

| Method | Path                                   | Purpose                        |
| ------ | -------------------------------------- | ------------------------------ |
| GET    | `/api/sales/:saleId`                   | Sale status and stock          |
| POST   | `/api/sales/:saleId/purchases`         | Try to purchase the product    |
| GET    | `/api/sales/:saleId/purchases/:userId` | Did this user make a purchase? |
| GET    | `/api/health`                          | Redis and Mongo check          |

#### `GET /api/sales/:saleId`

200:

```json
{
  "saleId": "8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f",
  "status": "active",
  "startsAt": 1762650000000,
  "endsAt": 1762653600000,
  "stock": { "initial": 100, "remaining": 42 },
  "product": { "id": "...", "name": "Best Headphones" },
  "serverTime": 1762650123456
}
```

`status` is `upcoming`, `active`, `sold_out` or `ended`. Times are epoch milliseconds. Errors: 404 `sale_not_found`, 400 `invalid_request`, 503.

#### `POST /api/sales/:saleId/purchases`

Body: `{"userId": "alice"}`. The answer is always `{"code": "..."}`.

| HTTP | `code`                  | Meaning                                                                      |
| ---- | ----------------------- | ---------------------------------------------------------------------------- |
| 201  | `PURCHASED`             | You got the item                                                             |
| 409  | `ALREADY_PURCHASED`     | This user already has one                                                    |
| 409  | `SOLD_OUT`              | No stock left                                                                |
| 409  | `NOT_STARTED` / `ENDED` | Outside the sale window                                                      |
| 503  | `NOT_CONFIGURED`        | The sale is not set up in Redis                                              |
| 400  | n/a                     | `invalid_request` (bad body)                                                 |
| 503  | n/a                     | `temporarily_unavailable` (Redis down or slow). Not purchased, safe to retry |

#### `GET /api/sales/:saleId/purchases/:userId`

- 200 `{"purchasedAt": 1762650100000}` (epoch ms)
- 404 `{"error": "purchase_not_found"}`
- 400 `invalid_request`, 503 if Redis is down

#### `GET /api/health`

- 200 `{"status": "ok"}`
- 503 `{"status": "unavailable"}` if Redis or Mongo does not answer within 1 s

#### Errors

- 503 comes with `Retry-After: 1` and `{"error": "temporarily_unavailable"}`.
- 429 `{"error": "too_many_requests"}` with `Retry-After: 1` comes from nginx when one address sends more than 100 requests a second.
- Any other unexpected error is a 500.

```bash
curl -X POST localhost:8080/api/sales/8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f/purchases \
  -H 'content-type: application/json' -d '{"userId":"alice"}'
```

How a purchase works:

1. One Lua script on Redis checks, atomically, that the sale is configured, the time is inside the window, the user has no key, and stock is above zero.
2. If so, the same script decrements stock, sets the user key, and appends to the sale's stream. The API answers 201.
3. Workers read the stream via a consumer group in batches of up to 500, `insertMany` into Mongo (unordered), set `stock.remaining` from the stored count, then ack and delete the entries.

Redis keys for a sale share the hash tag `{sale:<id>}`.

## 3. Running the app

```bash
docker compose up --build
```

Stop with `docker compose down` (add `-v` to delete the Mongo and Redis volumes).

## 4. Running the tests

### Unit and integration tests

```bash
npm ci
npm run check
```

### Stress tests (k6)

```bash
npm run stress
```

Four scenarios:

1. Hammer: one user fires 500 requests at once. Expected: 1 `PURCHASED`, 499 `ALREADY_PURCHASED`.
2. Surge: 10,000 users, up to 500 at a time, go for the remaining 99 items. Expected: 99 `PURCHASED`, 9,901 `SOLD_OUT`.
3. Watchers: 300 people refresh the sale page every second for 15 seconds.
4. Flood: one address sends 1,000 requests without the `X-Load-Test: stress-test` header that the other scenarios send to skip the limit (demo only). Expected: at least one 429.

nginx rate-limits each client address to 100 requests per second.

#### Results

16,015 requests at about 537 per second, with up to 800 virtual users at once and no failed requests.

| Scenario | Outcome              | Count | Expected | Result |
| -------- | -------------------- | ----: | -------: | :----: |
| Hammer   | `PURCHASED`          |     1 |        1 |   ✅   |
| Hammer   | `ALREADY_PURCHASED`  |   499 |      499 |   ✅   |
| Surge    | `PURCHASED`          |    99 |       99 |   ✅   |
| Surge    | `SOLD_OUT`           | 9,901 |    9,901 |   ✅   |
| Flood    | 429 rate limited     |   791 |      > 0 |   ✅   |
| All      | Unexpected responses |     0 |        0 |   ✅   |

Response time at the 95th percentile (p95) against its threshold, in milliseconds:

```mermaid
xychart-beta
    title "p95 response time (ms)"
    x-axis ["Surge", "Watchers"]
    y-axis "ms" 0 --> 1000
    bar [104, 114]
    line [1000, 500]
```

The bars are the measured p95 (surge 104 ms, watchers 114 ms). The line is the threshold (1,000 ms and 500 ms). Overall: median 23 ms, p95 104 ms, p99 143 ms, max 204 ms.

## 5. Decisions and trade-offs

| Decision                                          | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Cost                                                                                                                               |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Redis Lua script as the purchase gate             | **Atomicity and consistency:** the window, one-per-user and stock checks run as one isolated step on Redis's single thread, so there is no race and no oversell. **Throughput and low latency:** one round trip, in-memory, no locks, and no row contention like a hot Mongo document. **Availability:** the hot path needs only Redis, so purchases survive a Mongo outage. **Horizontal scalability:** the API tier is stateless, so replicas scale out | Redis is the source of truth while a sale runs and a single-core bottleneck for one hot sale. The page lags (eventual consistency) |
| Redis Streams instead of Kafka or a message queue | **No dual write:** the `XADD` is in the same Lua script as the stock decrement, so a purchase has a stream entry or nothing. A broker outside Redis needs a second network call, and a crash between the two loses or duplicates a purchase (outbox pattern needed). **Simplicity:** no new infrastructure. **Consumer groups** give competing consumers, backpressure through batching, and at-least-once delivery with idempotent writes (unique index) | Less durable and less scalable than Kafka: no partitioned log, long retention or easy replay. Fine for one sale, not for a fleet   |
| Dead-letter stream                                | **Fault isolation (poison-pill handling):** a malformed entry is moved aside instead of blocking the batch, so one bad message cannot stall the pipeline. **Recovery:** entries from a crashed worker are reclaimed after 30 s idle (self-healing), and the stream is kept for inspection                                                                                                                                                                 | Nothing replays or alerts on the dead-letter stream yet                                                                            |
| Redis AOF with `appendfsync everysec`             | **Durability and throughput trade-off:** a batched fsync keeps writes fast while limiting loss to about 1 s, instead of `always` (an fsync per write, slow) or `no` (OS decides, unbounded loss)                                                                                                                                                                                                                                                          | A crash can lose about 1 s of acknowledged purchases. Not built: `always`, a replica with `WAIT`, a reconcile script               |
| Delete acked stream entries                       | **Bounded memory and capacity:** Redis stays small so the hot path stays fast. **Single source of truth:** Mongo is the permanent record, and Redis is a transient buffer                                                                                                                                                                                                                                                                                 | No audit trail or replay from Redis                                                                                                |

## 7. Improvements

Known gaps, and what I would do about each. None of these is built.

| Gap                                  | Improvement                                                             |
| ------------------------------------ | ----------------------------------------------------------------------- |
| Identity                             | Real identity (login) and per-user limits;                              |
| Idempotency                          | `Idempotency-Key` header if the rule ever allows several items per user |
| Each worker syncs one static sale ID | Workers discover active sales from Mongo                                |
| Dead-letter stream handling          | Alerting and reconciliation strategy                                    |
| Single Redis and MongoDB nodes       | Redis replica with Sentinel, MongoDB replica set                        |
| No end-to-end tests of the UI        | Browser tests (for example Playwright)                                  |
