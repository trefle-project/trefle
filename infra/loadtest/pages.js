// Page views on the dedicated test page: the renderer's throughput (lot 1
// renders every request — no HTML cache — so this measures the VPS).
// 020-edge-html-cache — with EDGE=1 the page is expected from the edge cache
// instead (HIT, served by the Worker): run it against the test host
// (BASE_URL=https://edge-check.example.com) or, after go-live,
// any page host.
//   docker run --rm -v "$PWD:/s" -w /s -e BASE_URL -e PAGE_PATH -e RATE grafana/k6 run pages.js
import http from "k6/http";
import { check } from "k6";

import { BASE_URL, PAGE_PATH, rateScenario } from "./lib.js";

export const options = {
  scenarios: { pages: rateScenario(50) },
  thresholds: { http_req_failed: ["rate<0.01"], http_req_duration: ["p(95)<1000"] },
};

const EDGE = __ENV.EDGE === "1";

export default function () {
  const res = http.get(`${BASE_URL}${PAGE_PATH}`, { tags: { name: "page" }, headers: { "Accept-Encoding": "gzip" } });
  if (EDGE) {
    check(res, {
      "200": (r) => r.status === 200,
      "from the edge cache": (r) => r.headers["Cf-Cache-Status"] === "HIT",
      "served by the Worker": (r) => r.headers["X-Trefle-Edge-Served"] === "1",
    });
  } else {
    check(res, { "200": (r) => r.status === 200, "not cached at the edge": (r) => r.headers["Cf-Cache-Status"] !== "HIT" });
  }
}
