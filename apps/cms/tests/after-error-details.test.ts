import { describe, expect, it } from "vitest";

import { keepErrorDetails } from "../src/hooks/after-error";

/** A hook's validation error keeps its field messages, whatever Payload's copy built. */
describe("keepErrorDetails", () => {
  const data = { errors: [{ path: "fonts.6.family", message: "Police introuvable sur Google Fonts : Garamont Pro" }] };
  const err = Object.assign(new Error("The following field is invalid: fonts.6.family"), { name: "ValidationError", status: 400, data });

  it("puts the field messages back when the response lost them", () => {
    const r = keepErrorDetails(err, { errors: [{ message: "The following field is invalid: fonts.6.family" }] });
    expect(r).toEqual({ status: 400, response: { errors: [{ name: "ValidationError", data, message: "The following field is invalid: fonts.6.family" }] } });
  });

  it("leaves a response that already has them, and server errors, alone", () => {
    expect(keepErrorDetails(err, { errors: [{ data, message: "x" }] })).toBeUndefined();
    expect(keepErrorDetails(Object.assign(new Error("boom"), { status: 500, data: { secret: 1 } }), { errors: [{ message: "Something went wrong." }] })).toBeUndefined();
    expect(keepErrorDetails(new Error("plain"), undefined)).toBeUndefined();
  });
});
