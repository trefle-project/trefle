import { describe, expect, it } from "vitest";

import { codeIdsIn, withNonce } from "../src/custom-code";

describe("withNonce (014, research R2)", () => {
  it("adds the nonce to a bare and to an attributed script tag", () => {
    expect(withNonce("<script>a()</script>", "N1")).toBe('<script nonce="N1">a()</script>');
    expect(withNonce('<script async src="https://x.example/a.js"></script>', "N1")).toBe(
      '<script nonce="N1" async src="https://x.example/a.js"></script>',
    );
  });

  it("replaces a nonce pasted with the snippet, whatever its quoting", () => {
    expect(withNonce('<script nonce="old">a()</script>', "N2")).toBe('<script nonce="N2">a()</script>');
    expect(withNonce("<script type='module' nonce='old'>a()</script>", "N2")).toBe(
      "<script nonce=\"N2\" type='module'>a()</script>",
    );
    expect(withNonce("<script nonce=old defer>a()</script>", "N2")).toBe('<script nonce="N2" defer>a()</script>');
  });

  it("handles upper case and several scripts", () => {
    expect(withNonce("<SCRIPT>a()</SCRIPT><p>x</p><script src=b.js></script>", "N")).toBe(
      '<script nonce="N">a()</SCRIPT><p>x</p><script nonce="N" src=b.js></script>',
    );
  });

  it("leaves everything that isn't a script opening tag byte-identical", () => {
    const snippet =
      '<!-- Meta Pixel -->\n<noscript><img height="1" width="1" src="https://www.facebook.com/tr?id=1&ev=PageView"/></noscript>\n<scripts>not a script</scripts><div data-script="x"></div>';
    expect(withNonce(snippet, "N")).toBe(snippet);
  });

  it("can't be broken out of by a hostile nonce value", () => {
    expect(withNonce("<script>a()</script>", 'x"><img src=x onerror=alert(1)>')).toBe(
      '<script nonce="ximgsrc=xonerror=alert1">a()</script>',
    );
  });
});

describe("codeIdsIn (014, research R6)", () => {
  it("returns nothing for HTML without code blocks", () => {
    expect(codeIdsIn('<div data-block="hero"></div>')).toEqual([]);
    expect(codeIdsIn("")).toEqual([]);
  });

  it("returns every id in document order, single or double quoted", () => {
    expect(
      codeIdsIn(
        `<div data-block="custom-code" data-code-id="a1"></div><section><div data-code-id='b2' data-block="custom-code"></div></section>`,
      ),
    ).toEqual(["a1", "b2"]);
  });

  it("ignores look-alike attributes", () => {
    expect(codeIdsIn('<div xdata-code-id="nope" data-code-idx="nope"></div>')).toEqual([]);
  });
});
