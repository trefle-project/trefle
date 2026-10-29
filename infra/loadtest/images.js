// Image fetches (imgproxy URLs from the test page). Before the switch every
// request reaches the VPS; after it, only the first per URL and format should
// (SC-004 — count them in the Caddy access log).
//   docker run --rm -v "$PWD:/s" -w /s -e BASE_URL -e PAGE_PATH -e RATE grafana/k6 run images.js
import http from "k6/http";
import { check } from "k6";

import { BASE_URL, PAGE_PATH, rateScenario } from "./lib.js";

export const options = {
  scenarios: { images: rateScenario(100) },
  thresholds: { http_req_failed: ["rate<0.01"] },
};

export function setup() {
  const html = http.get(`${BASE_URL}${PAGE_PATH}`).body;
  const urls = [...html.matchAll(/<img[^>]+src="(https:\/\/[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  if (urls.length === 0) throw new Error(`no <img> on ${BASE_URL}${PAGE_PATH}`);
  return { urls };
}

const ACCEPT = ["image/avif,image/webp,*/*", "image/png,image/*;q=0.8,*/*;q=0.5"];

export default function ({ urls }) {
  const url = urls[Math.floor(Math.random() * urls.length)];
  const accept = ACCEPT[Math.floor(Math.random() * ACCEPT.length)];
  const res = http.get(url, { headers: { Accept: accept }, tags: { name: "image" } });
  check(res, {
    "200": (r) => r.status === 200,
    "WebP only when accepted": (r) => accept.includes("webp") || !String(r.headers["Content-Type"]).includes("webp"),
  });
}
