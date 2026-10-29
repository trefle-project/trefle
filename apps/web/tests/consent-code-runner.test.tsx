// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CONSENT_EVENT, ConsentCodeRunner, activateConsentTemplates } from "../src/components/consent-code-runner";
import { serializeConsentCookie } from "../src/lib/consent-cookie";

/**
 * 014-custom-code-editing, FR-008/FR-022, research R4 — consent-dependent
 * code runs only after « Accepter », in order, and one failing script
 * doesn't stop the others. jsdom never loads external scripts, so their
 * load/error events are dispatched by hand to drive the ordering; inline
 * scripts are inert comments — real execution is covered end to end.
 */
const NONCE = "N0NCE";
const template = (inner: string) => `<template data-tf-consent="">${inner}</template>`;

/** Inline scripts inserted by the runner, in the order it inserted them. */
function recordInsertions() {
  const inserted: HTMLScriptElement[] = [];
  const observer = new MutationObserver((records) => {
    for (const r of records) r.addedNodes.forEach((n) => n instanceof HTMLScriptElement && inserted.push(n));
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return { inserted, stop: () => observer.disconnect() };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  document.body.innerHTML = "";
  document.cookie = "tf_consent=; Max-Age=0; Path=/";
});
afterEach(() => vi.useRealTimers());

async function mountRunner(props: { always?: boolean } = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<ConsentCodeRunner nonce={NONCE} {...props} />));
  return root;
}

describe("ConsentCodeRunner", () => {
  it("does nothing while the visitor hasn't chosen", async () => {
    document.body.innerHTML = template('<div id="w">widget</div>');
    await mountRunner();
    expect(document.querySelector("template[data-tf-consent]")).not.toBeNull();
    expect(document.getElementById("w")).toBeNull();
  });

  it("activates at mount when the visitor accepted on an earlier visit", async () => {
    document.cookie = serializeConsentCookie("accepted");
    document.body.innerHTML = template('<div id="w">widget</div>');
    await mountRunner();
    await act(flush);
    expect(document.getElementById("w")).not.toBeNull();
    expect(document.querySelector("template[data-tf-consent]")).toBeNull();
  });

  it("stays inert after a previous « Refuser »", async () => {
    document.cookie = serializeConsentCookie("rejected");
    document.body.innerHTML = template('<div id="w">widget</div>');
    await mountRunner();
    await act(flush);
    expect(document.getElementById("w")).toBeNull();
  });

  it("activates when « Accepter » is clicked, not on « Refuser »", async () => {
    document.body.innerHTML = template('<div id="w">widget</div>');
    await mountRunner();
    await act(async () => window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: "rejected" })));
    expect(document.getElementById("w")).toBeNull();
    await act(async () => window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: "accepted" })));
    await act(flush);
    expect(document.getElementById("w")).not.toBeNull();
  });

  it("activates at once in preview (`always`)", async () => {
    document.body.innerHTML = template('<div id="w">widget</div>');
    await mountRunner({ always: true });
    await act(flush);
    expect(document.getElementById("w")).not.toBeNull();
  });
});

describe("activateConsentTemplates", () => {
  it("recreates scripts with the nonce, keeping their attributes", async () => {
    document.body.innerHTML = template('<script data-x="1" nonce="stale">/*a*/</script>');
    const rec = recordInsertions();
    await activateConsentTemplates(document, NONCE);
    rec.stop();
    const [script] = rec.inserted;
    expect(script!.nonce).toBe(NONCE);
    expect(script!.getAttribute("data-x")).toBe("1");
    expect(script!.text).toBe('/*a*/');
  });

  it("inserts the widget markup before its script runs", async () => {
    document.body.innerHTML = template('<div id="cal"></div><script>1</script>');
    const rec = recordInsertions();
    await activateConsentTemplates(document, NONCE);
    rec.stop();
    const script = rec.inserted[0]!;
    expect(document.getElementById("cal")!.compareDocumentPosition(script) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("waits for an external script to load before inserting the next one", async () => {
    document.body.innerHTML = template('<script src="https://cdn.example/lib.js"></script><script>/*init*/</script>');
    const rec = recordInsertions();
    const done = activateConsentTemplates(document, NONCE);
    await flush();
    expect(rec.inserted.map((s) => s.src || s.text)).toEqual(["https://cdn.example/lib.js"]);
    rec.inserted[0]!.dispatchEvent(new Event("load"));
    await done;
    rec.stop();
    expect(rec.inserted.map((s) => s.src || s.text)).toEqual(["https://cdn.example/lib.js", "/*init*/"]);
  });

  it("moves on after a failed external script (FR-022)", async () => {
    document.body.innerHTML = template('<script src="https://blocked.example/x.js"></script><script>/*after*/</script>');
    const rec = recordInsertions();
    const done = activateConsentTemplates(document, NONCE);
    await flush();
    rec.inserted[0]!.dispatchEvent(new Event("error"));
    await done;
    rec.stop();
    expect(rec.inserted.map((s) => s.text)).toContain("/*after*/");
  });

  it("doesn't wait for a script the vendor marked async", async () => {
    document.body.innerHTML = template('<script async src="https://cdn.example/a.js"></script><script>/*next*/</script>');
    const rec = recordInsertions();
    await activateConsentTemplates(document, NONCE);
    rec.stop();
    expect(rec.inserted).toHaveLength(2);
    expect(rec.inserted[0]!.async).toBe(true);
  });

  it("doesn't wait forever for a script that never settles", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = template('<script src="https://hung.example/x.js"></script><script>/*after*/</script>');
    const rec = recordInsertions();
    const done = activateConsentTemplates(document, NONCE);
    await vi.advanceTimersByTimeAsync(10_000);
    await done;
    rec.stop();
    expect(rec.inserted.map((s) => s.text)).toContain("/*after*/");
  });

  it("activates several templates in document order, each once", async () => {
    document.body.innerHTML = template('<p id="one"></p>') + "<hr>" + template('<p id="two"></p>');
    await activateConsentTemplates(document, NONCE);
    expect(document.querySelectorAll("template[data-tf-consent]")).toHaveLength(0);
    expect(document.body.innerHTML).toBe('<p id="one"></p><hr><p id="two"></p>');
    await activateConsentTemplates(document, NONCE);
    expect(document.querySelectorAll("#one")).toHaveLength(1);
  });
});
