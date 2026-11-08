// k6 stress test for the purchase endpoint
// Run with `npm run stress`. k6 runs TypeScript directly.
//
// Scenarios (run together):
//   hammer   one user fires 500 requests at once
//   surge    10,000 different users try to buy the stock
//   watchers 300 people refresh the sale page every second
//   flood    one address sends 1,000 requests without the bypass header: must get 429s
//
// Thresholds fail the run unless: the hammering user gets exactly one item,
// the surge sells the rest of the stock and everyone else is told "sold out",
// and no request fails with a server or network error.

import http from "k6/http";
import exec from "k6/execution";
import { sleep } from "k6";
import { Counter } from "k6/metrics";
import type { Options } from "k6/options";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";
const SALE_ID = __ENV.SALE_ID || "8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f";
const STOCK = Number(__ENV.STOCK || 100);
const SURGE_USERS = Number(__ENV.SURGE_USERS || 10000);
const HAMMER_REQUESTS = 500;

const SALE_URL = `${BASE_URL}/api/sales/${SALE_ID}`;
// Skips nginx's per-IP rate limit
const LOAD = { "x-load-test": "stress-test" };

http.setResponseCallback(http.expectedStatuses(200, 201, 409));

const counters = {
  PURCHASED: new Counter("purchased"),
  ALREADY_PURCHASED: new Counter("already_purchased"),
  SOLD_OUT: new Counter("sold_out"),
};
const unexpected = new Counter("unexpected");
const rateLimited = new Counter("rate_limited");

export const options: Options = {
  scenarios: {
    hammer: {
      executor: "shared-iterations",
      exec: "hammer",
      vus: 50,
      iterations: HAMMER_REQUESTS,
      maxDuration: "30s",
    },
    surge: {
      executor: "shared-iterations",
      exec: "surge",
      startTime: "5s",
      vus: 500,
      iterations: SURGE_USERS,
      maxDuration: "60s",
    },
    flood: {
      executor: "shared-iterations",
      exec: "flood",
      startTime: "2s",
      vus: 100,
      iterations: 1000,
      maxDuration: "20s",
    },
    watchers: {
      executor: "constant-vus",
      exec: "watch",
      vus: 300,
      duration: "15s",
    },
  },
  thresholds: {
    "purchased{scenario:hammer}": ["count==1"],
    "already_purchased{scenario:hammer}": [`count==${HAMMER_REQUESTS - 1}`],
    "purchased{scenario:surge}": [`count==${STOCK - 1}`],
    "sold_out{scenario:surge}": [`count==${SURGE_USERS - (STOCK - 1)}`],
    "rate_limited{scenario:flood}": ["count>0"],
    unexpected: ["count==0"],
    http_req_failed: ["rate==0"],
    "http_req_duration{scenario:surge}": ["p(95)<1000"],
    "http_req_duration{scenario:watchers}": ["p(95)<500"],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

export function setup(): void {
  for (let i = 0; i < 90; i++) {
    const res = http.get(SALE_URL);
    if (res.status === 200 && res.json("status") === "active") return;
    sleep(1);
  }
  throw new Error(`the sale at ${SALE_URL} never became active`);
}

function buy(userId: string): void {
  const res = http.post(`${SALE_URL}/purchases`, JSON.stringify({ userId }), {
    headers: { "content-type": "application/json", ...LOAD },
  });
  const code = res.status === 0 ? "" : String(res.json("code"));
  const ok = res.status === (code === "PURCHASED" ? 201 : 409);
  const counter = counters[code as keyof typeof counters];
  if (ok && counter) counter.add(1);
  else unexpected.add(1);
}

export function hammer(): void {
  buy("hammer1");
}

export function surge(): void {
  buy(`buyer${exec.scenario.iterationInTest}`);
}

export function flood(): void {
  const res = http.get(SALE_URL, {
    responseCallback: http.expectedStatuses(200, 429),
  });
  if (res.status === 429) rateLimited.add(1);
  else if (res.status !== 200) unexpected.add(1);
}

export function watch(): void {
  http.get(SALE_URL, { headers: LOAD });
  sleep(1);
}
