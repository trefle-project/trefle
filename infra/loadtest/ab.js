// 020-edge-html-cache, quickstart V9 — fresh visitors on a page under an A/B
// test served from the edge: every request without cookies (a new visitor),
// counting which arm each one gets. The arm is told apart by text that only
// the variant contains (VARIANT_TEXT). Checks: 200 from the Worker, a variant
// cookie, no internal header.
//   docker run --rm -v "$PWD:/s" -w /s -e BASE_URL -e PAGE_PATH -e VARIANT_TEXT -e RATE -e DURATION grafana/k6 run ab.js
import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

import { BASE_URL, PAGE_PATH, rateScenario } from "./lib.js";

const VARIANT_TEXT = __ENV.VARIANT_TEXT || "VARIANTE B";
const variant = new Counter("arm_variant");
const control = new Counter("arm_control");

export const options = {
  scenarios: { visitors: rateScenario(200) },
  thresholds: { http_req_failed: ["rate<0.01"], checks: ["rate>0.99"] },
};

export default function () {
  // A fresh jar per request: no cookie is sent, every request is a new visitor.
  const res = http.get(`${BASE_URL}${PAGE_PATH}`, { jar: new http.CookieJar(), headers: { "Accept-Encoding": "gzip" }, tags: { name: "ab" } });
  if (res.status === 200 && typeof res.body === "string") (res.body.includes(VARIANT_TEXT) ? variant : control).add(1);
  check(res, {
    "200": (r) => r.status === 200,
    "served by the Worker": (r) => r.headers["X-Trefle-Edge-Served"] === "1",
    "variant cookie": (r) => /tf-ab-/.test(r.headers["Set-Cookie"] || ""),
    "no internal header": (r) => !r.headers["X-Trefle-Ab"] && !r.headers["X-Middleware-Rewrite"] && !r.headers["Cache-Tag"],
  });
}
