import * as assert from "assert";
import { hashText } from "@shared/services/hashService.js";

suite("hashService", () => {
  test("hashText returns stable sha256 hash with prefix", () => {
    const first = hashText("hello");
    const second = hashText("hello");
    const third = hashText("hello world");

    assert.ok(first.startsWith("sha256:"));
    assert.strictEqual(first, second);
    assert.notStrictEqual(first, third);
  });

  test("hashText normalizes line endings", () => {
    const lf = hashText("line1\nline2\n");
    const crlf = hashText("line1\r\nline2\r\n");

    assert.strictEqual(lf, crlf);
  });
});
