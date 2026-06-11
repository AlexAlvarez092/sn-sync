import * as assert from "assert";
import {
  normalizeOptionalString,
  isLikelySysId,
  decodeHtmlEntities,
} from "@shared/services/snStringService.js";

suite("snStringService", () => {
  test("normalizeOptionalString trims and returns undefined for empty strings", () => {
    assert.strictEqual(normalizeOptionalString("  hello  "), "hello");
    assert.strictEqual(normalizeOptionalString("   "), undefined);
    assert.strictEqual(normalizeOptionalString(""), undefined);
    assert.strictEqual(
      normalizeOptionalString(123 as unknown as string),
      undefined,
    );
  });

  test("normalizeOptionalString allows empty strings when flag is set", () => {
    assert.strictEqual(normalizeOptionalString("  ", true), "");
    assert.strictEqual(normalizeOptionalString("hello", true), "hello");
  });

  test("isLikelySysId validates 32-character hex strings", () => {
    assert.strictEqual(isLikelySysId("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"), true);
    assert.strictEqual(isLikelySysId("A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6"), true);
    assert.strictEqual(
      isLikelySysId("  a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6  "),
      true,
    );
    assert.strictEqual(isLikelySysId("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d"), false);
    assert.strictEqual(
      isLikelySysId("g1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"),
      false,
    );
    assert.strictEqual(isLikelySysId("not-a-sys-id-at-all-hello-world"), false);
    assert.strictEqual(isLikelySysId(""), false);
  });

  test("isLikelySysId rejects non-hex characters", () => {
    assert.strictEqual(isLikelySysId("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"), false);
    assert.strictEqual(isLikelySysId("g1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"), false);
  });

  test("decodeHtmlEntities decodes common HTML entities", () => {
    assert.strictEqual(decodeHtmlEntities("&amp;"), "&");
    assert.strictEqual(decodeHtmlEntities("&lt;"), "<");
    assert.strictEqual(decodeHtmlEntities("&gt;"), ">");
    assert.strictEqual(decodeHtmlEntities("&quot;"), '"');
    assert.strictEqual(decodeHtmlEntities("&apos;"), "'");
    assert.strictEqual(decodeHtmlEntities("&nbsp;"), " ");
  });

  test("decodeHtmlEntities decodes numeric character references", () => {
    assert.strictEqual(decodeHtmlEntities("&#65;"), "A");
    assert.strictEqual(decodeHtmlEntities("&#x41;"), "A");
    assert.strictEqual(decodeHtmlEntities("&#x48;"), "H");
  });

  test("decodeHtmlEntities handles mixed content", () => {
    assert.strictEqual(
      decodeHtmlEntities("Test &amp; &lt;result&gt;"),
      "Test & <result>",
    );
    assert.strictEqual(decodeHtmlEntities("&#65; &amp; &#x42;"), "A & B");
  });

  test("decodeHtmlEntities handles invalid entities gracefully", () => {
    assert.strictEqual(decodeHtmlEntities("&invalid;"), "&invalid;");
    assert.strictEqual(
      decodeHtmlEntities("&#999999999999;"),
      "&#999999999999;",
    );
    assert.strictEqual(decodeHtmlEntities("&#xGGGGG;"), "&#xGGGGG;");
  });

  test("decodeHtmlEntities preserves non-entity content", () => {
    assert.strictEqual(decodeHtmlEntities("plain text"), "plain text");
    assert.strictEqual(decodeHtmlEntities("with & symbol"), "with & symbol");
    assert.strictEqual(decodeHtmlEntities(""), "");
  });

  test("decodeHtmlEntities handles decimal entities out of Unicode range", () => {
    assert.strictEqual(decodeHtmlEntities("&#1200000;"), "&#1200000;");
    assert.strictEqual(decodeHtmlEntities("&#9999999;"), "&#9999999;");
  });

  test("decodeHtmlEntities handles hex entities out of Unicode range", () => {
    assert.strictEqual(decodeHtmlEntities("&#xFFFFFF;"), "&#xFFFFFF;");
  });

  test("normalizeOptionalString handles non-string inputs", () => {
    assert.strictEqual(normalizeOptionalString(null), undefined);
    assert.strictEqual(normalizeOptionalString(undefined), undefined);
    assert.strictEqual(normalizeOptionalString({}), undefined);
    assert.strictEqual(normalizeOptionalString(42), undefined);
  });
});
