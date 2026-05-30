import * as assert from "assert";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import { normalizeAndValidateInstanceUrl } from "@shared/services/snInstanceUrlPolicyService.js";

suite("snInstanceUrlPolicyService", () => {
  test("accepts and normalizes default ServiceNow host URLs", () => {
    const normalized = normalizeAndValidateInstanceUrl(
      "https://Dev1.Service-Now.com/path?q=1",
      {
        allowCustomHosts: false,
        customHosts: [],
      },
    );

    assert.strictEqual(normalized, "https://dev1.service-now.com");
  });

  test("rejects non-https URLs", () => {
    assert.throws(
      () =>
        normalizeAndValidateInstanceUrl("http://dev1.service-now.com", {
          allowCustomHosts: false,
          customHosts: [],
        }),
      (error: unknown) =>
        error instanceof Error &&
        error.message ===
          `${SN_SYNC_MESSAGES.AUTH_INVALID_INSTANCE_URL_PREFIX} Only HTTPS URLs are allowed.`,
    );
  });

  test("rejects empty and malformed URLs", () => {
    assert.throws(
      () =>
        normalizeAndValidateInstanceUrl("   ", {
          allowCustomHosts: false,
          customHosts: [],
        }),
      (error: unknown) =>
        error instanceof Error &&
        error.message ===
          `${SN_SYNC_MESSAGES.AUTH_INVALID_INSTANCE_URL_PREFIX} URL is required.`,
    );

    assert.throws(
      () =>
        normalizeAndValidateInstanceUrl("https://", {
          allowCustomHosts: false,
          customHosts: [],
        }),
      (error: unknown) =>
        error instanceof Error &&
        error.message ===
          `${SN_SYNC_MESSAGES.AUTH_INVALID_INSTANCE_URL_PREFIX} URL must be a valid absolute URL.`,
    );
  });

  test("rejects embedded credentials and non-default ports", () => {
    assert.throws(
      () =>
        normalizeAndValidateInstanceUrl(
          "https://admin:secret@dev1.service-now.com",
          {
            allowCustomHosts: false,
            customHosts: [],
          },
        ),
      (error: unknown) =>
        error instanceof Error &&
        error.message ===
          `${SN_SYNC_MESSAGES.AUTH_INVALID_INSTANCE_URL_PREFIX} Embedded credentials in the URL are not allowed.`,
    );

    assert.throws(
      () =>
        normalizeAndValidateInstanceUrl("https://dev1.service-now.com:8443", {
          allowCustomHosts: false,
          customHosts: [],
        }),
      (error: unknown) =>
        error instanceof Error &&
        error.message ===
          `${SN_SYNC_MESSAGES.AUTH_INVALID_INSTANCE_URL_PREFIX} Only the default HTTPS port is allowed.`,
    );
  });

  test("rejects hosts outside default policy when custom hosts are disabled", () => {
    assert.throws(
      () =>
        normalizeAndValidateInstanceUrl("https://sn.example.net", {
          allowCustomHosts: false,
          customHosts: ["sn.example.net"],
        }),
      (error: unknown) =>
        error instanceof Error &&
        error.message ===
          `${SN_SYNC_MESSAGES.AUTH_INVALID_INSTANCE_URL_PREFIX} Host is not allowed. Enable 'sn-sync.auth.allowCustomHosts' and add the exact hostname to 'sn-sync.auth.customHosts'.`,
    );
  });

  test("allows custom host when enabled and included in allowlist", () => {
    const normalized = normalizeAndValidateInstanceUrl(
      "https://SN.Example.net",
      {
        allowCustomHosts: true,
        customHosts: ["sn.example.net"],
      },
    );

    assert.strictEqual(normalized, "https://sn.example.net");
  });

  test("allows custom host when allowlist entry is provided as full URL", () => {
    const normalized = normalizeAndValidateInstanceUrl(
      "https://portal-dev.example.net",
      {
        allowCustomHosts: true,
        customHosts: ["https://portal-dev.example.net/"],
      },
    );

    assert.strictEqual(normalized, "https://portal-dev.example.net");
  });

  test("ignores malformed custom-host entries and keeps host policy enforced", () => {
    assert.throws(
      () =>
        normalizeAndValidateInstanceUrl("https://other.example.net", {
          allowCustomHosts: true,
          customHosts: [
            "https://custom.example.net/path",
            "user@custom.example.net",
            ".custom.example.net",
            "custom.example.net.",
            "localhost",
            "127.0.0.1",
          ],
        }),
      (error: unknown) =>
        error instanceof Error &&
        error.message ===
          `${SN_SYNC_MESSAGES.AUTH_INVALID_INSTANCE_URL_PREFIX} Host is not allowed. Enable 'sn-sync.auth.allowCustomHosts' and add the exact hostname to 'sn-sync.auth.customHosts'.`,
    );
  });

  test("ignores custom-host URL entries that include embedded credentials", () => {
    assert.throws(
      () =>
        normalizeAndValidateInstanceUrl("https://custom.example.net", {
          allowCustomHosts: true,
          customHosts: ["https://user:secret@custom.example.net"],
        }),
      (error: unknown) =>
        error instanceof Error &&
        error.message ===
          `${SN_SYNC_MESSAGES.AUTH_INVALID_INSTANCE_URL_PREFIX} Host is not allowed. Enable 'sn-sync.auth.allowCustomHosts' and add the exact hostname to 'sn-sync.auth.customHosts'.`,
    );
  });

  test("ignores empty custom-host entries and keeps host policy enforced", () => {
    assert.throws(
      () =>
        normalizeAndValidateInstanceUrl("https://custom.example.net", {
          allowCustomHosts: true,
          customHosts: ["   "],
        }),
      (error: unknown) =>
        error instanceof Error &&
        error.message ===
          `${SN_SYNC_MESSAGES.AUTH_INVALID_INSTANCE_URL_PREFIX} Host is not allowed. Enable 'sn-sync.auth.allowCustomHosts' and add the exact hostname to 'sn-sync.auth.customHosts'.`,
    );
  });

  test("rejects localhost and ip literal hosts", () => {
    assert.throws(
      () =>
        normalizeAndValidateInstanceUrl("https://localhost", {
          allowCustomHosts: true,
          customHosts: ["localhost"],
        }),
      (error: unknown) =>
        error instanceof Error &&
        error.message ===
          `${SN_SYNC_MESSAGES.AUTH_INVALID_INSTANCE_URL_PREFIX} IP addresses and localhost are not allowed.`,
    );

    assert.throws(
      () =>
        normalizeAndValidateInstanceUrl("https://127.0.0.1", {
          allowCustomHosts: true,
          customHosts: ["127.0.0.1"],
        }),
      (error: unknown) =>
        error instanceof Error &&
        error.message ===
          `${SN_SYNC_MESSAGES.AUTH_INVALID_INSTANCE_URL_PREFIX} IP addresses and localhost are not allowed.`,
    );
  });
});
