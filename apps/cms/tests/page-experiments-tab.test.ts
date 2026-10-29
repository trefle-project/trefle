import { describe, expect, it, vi } from "vitest";
import type { Payload } from "payload";
import type { ReactElement } from "react";

// The real children pull @payloadcms/ui (CSS) — stand-ins are enough to
// check what the view hands them.
vi.mock("../src/components/ExperimentStats", () => ({ ExperimentStats: () => null }));
vi.mock("../src/components/PromoteActions.client", () => ({ default: () => null }));
vi.mock("../src/components/VariantActions.client", () => ({ default: () => null }));

import PageExperimentsTab from "../src/components/PageExperimentsTab";
import { ExperimentStats } from "../src/components/ExperimentStats";

// Regression: the "Tests A/B" view read `req.searchParams`, but Payload gives
// a custom edit view `searchParams` and no `req` — every page's tab crashed
// (digest 624654279, production 2026-10-11). These calls pass exactly what
// Payload passes: `doc`, `payload`, `searchParams`, no `req`.

const running = { id: 7, name: "Titre court", status: "running", startedAt: "2026-10-01T00:00:00.000Z", endedAt: null };

const fakePayload = (experiments: unknown[]): Payload =>
  ({
    find: async ({ collection }: { collection: string }) =>
      collection === "pages" ? { docs: [{ id: 2, title: "Variante B", status: "published" }] } : { docs: experiments },
  }) as unknown as Payload;

function findElement(node: unknown, type: unknown): ReactElement | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findElement(child, type);
      if (hit) return hit;
    }
    return null;
  }
  const el = node as ReactElement<{ children?: unknown }>;
  if (el.type === type) return el;
  return findElement(el.props?.children, type);
}

describe("PageExperimentsTab", () => {
  it("renders without `req` when no test is running", async () => {
    const tree = await PageExperimentsTab({ doc: { id: 1, title: "Accueil" }, payload: fakePayload([]) });
    expect(findElement(tree, ExperimentStats)).toBeNull();
  });

  it("passes the period from the URL to the stats", async () => {
    const tree = await PageExperimentsTab({
      doc: { id: 1, title: "Accueil" },
      payload: fakePayload([running]),
      searchParams: { from: "2026-10-05", to: ["2026-10-09", "ignored"] },
    });
    const stats = findElement(tree, ExperimentStats) as ReactElement<{ since: string | null; until: string | null }>;
    expect(stats.props.since).toBe("2026-10-05");
    expect(stats.props.until).toBe("2026-10-09");
  });

  it("defaults to the test's start, unbounded, without a period", async () => {
    const tree = await PageExperimentsTab({ doc: { id: 1, title: "Accueil" }, payload: fakePayload([running]), searchParams: {} });
    const stats = findElement(tree, ExperimentStats) as ReactElement<{ since: string | null; until: string | null }>;
    expect(stats.props.since).toBe(running.startedAt);
    expect(stats.props.until).toBeNull();
  });
});
