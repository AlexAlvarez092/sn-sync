import * as assert from "assert";
import { getErrorMessage } from "@shared/services/errorMessageService.js";

suite("errorMessageService", () => {
  test("returns the message when error is an Error instance", () => {
    const message = getErrorMessage(new Error("boom"));

    assert.strictEqual(message, "boom");
  });

  test("returns fallback when error is not an Error", () => {
    const message = getErrorMessage("boom");

    assert.strictEqual(message, "Unknown error");
  });
});
