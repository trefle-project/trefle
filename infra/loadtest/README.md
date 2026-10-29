# Load tests (017-edge-protection, research R16)

k6 scenarios run from a machine **outside** the VPS — a dev tool, not part of
the stack. They record a baseline before the Cloudflare switch and the same
runs after it (SC-006: no regression on page views; images and fonts reach
the origin once per file).

| Scenario | Measures | Default |
|---|---|---|
| `pages.js` | page views on the test page (the VPS renders each one) | 50/s for 1 min |
| `images.js` | the test page's images, with and without WebP in `Accept` | 100/s for 1 min |
| `leads.js` | lead submissions keep succeeding under load | 1 every ~7 s, 1 min |
| `leads-distinct.js` | one submission per source address (V6) | 1 per instance |

Tune with `RATE`, `DURATION`, `VUS`, `MAX_VUS`. `lib.js` holds the shared bits.

## Before running

1. **Off-peak only**, and tell whoever watches the sites.
2. A **dedicated test page** on the main domain, published, with the lead form
   and a few images (e.g. `/loadtest`), so real pages' statistics stay clean.
   Its view counter and A/B statistics will move — that is expected.
3. After the switch, let the k6 machine through the lead-form rate limit for
   the run, and remove it right after:
   ```bash
   LOADTEST_IP=<k6 machine address> infra/cloudflare/apply.sh
   ```
   (`infra/cloudflare/apply.sh` again without `LOADTEST_IP` afterwards.)

## Run

From this directory:

```bash
docker run --rm -v "$PWD:/s" -w /s -e BASE_URL=https://example.com -e PAGE_PATH=/loadtest grafana/k6 run --summary-export results/$(date +%F)-baseline-pages.json pages.js
docker run --rm -v "$PWD:/s" -w /s -e BASE_URL=https://example.com -e PAGE_PATH=/loadtest grafana/k6 run --summary-export results/$(date +%F)-baseline-images.json images.js
docker run --rm -v "$PWD:/s" -w /s -e BASE_URL=https://example.com -e PAGE_PATH=/loadtest grafana/k6 run --summary-export results/$(date +%F)-baseline-leads.json leads.js
```

After the switch, the same commands with `after` instead of `baseline`.
Commit the summaries in `results/` (a k6 container cannot write there on a
fresh server unless the folder is writable: `chmod 777 results`).

`leads-distinct.js` needs many source addresses at once (k6 cloud with
several load zones, or the same command on many small hosts); a single
machine only proves one address.

## 020 — pages from the edge cache

Since 020 page views are served by the edge Worker; the server renders a
page once per change, not once per view. Run the generator from a machine
with enough downlink (~10 KB per page view: a 1,000/s run needs ~10 MB/s) —
a Hetzner Cloud CPX32 for an hour did, the test laptop does not.

- `pages.js` with `EDGE=1` expects every response from the cache
  (`Cf-Cache-Status: HIT`, `X-Trefle-Edge-Served: 1`):
  ```bash
  docker run --rm -v "$PWD:/s" -w /s -e BASE_URL=https://example.com -e PAGE_PATH=/loadtest -e RATE=1000 -e DURATION=10m -e EDGE=1 -e VUS=200 -e MAX_VUS=1500 grafana/k6 run pages.js
  ```
  On a fresh server, run long scenarios detached (`nohup … &`) so a dropped
  SSH session does not stop them.
- `ab.js` — new visitors (no cookies) on a page under an A/B test: counts
  each arm (`arm_variant` / `arm_control`, `VARIANT_TEXT` = text only the
  variant has) and checks the cookie and that no internal header leaks.
- **Renders at the server**: the page hosts have an access log (query
  strings and addresses removed). For the run's window, on the VPS:
  ```bash
  docker logs --since 15m trefle-caddy-1 2>&1 | grep '"host":"example.com"' | grep -c '"uri":"/loadtest"'
  ```
  Expected: a handful (the first request after each purge), not one per
  view.
- **10,000/s** (SC-002) needs several generators (k6 Cloud with several load
  zones, or the same command on several hosts at once); each Cloudflare
  location fills its own copy once.

Results so far: `results/2026-10-12-020-test-host.md` (1,000/s, 1 render),
`results/2026-10-12-020-ab-edge.md` (A/B split).

## Read the results

- **Pages**: `http_reqs` rate and `http_req_duration` p95 — after ≥ before.
- **Images and fonts reaching the origin** (SC-004), on the VPS, for the
  minute of the run:
  ```bash
  docker logs --since 5m trefle-caddy-1 2>&1 | grep -c '"host":"img.example.com"'
  ```
  Before the switch: about every request. After: about one per image URL and
  format.
- **Leads**: every check passes; then delete the test leads in the admin
  (Leads, filtered on the test page).
