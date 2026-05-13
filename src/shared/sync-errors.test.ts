import { describe, expect, it } from "vitest";
import { hintForErrno, translateSyncError } from "./sync-errors";

function errnoError(code: string, message: string): NodeJS.ErrnoException {
  const e: NodeJS.ErrnoException = new Error(message);
  e.code = code;
  return e;
}

describe("translateSyncError", () => {
  it("maps EPERM to the read-only device hint with the eperm anchor", () => {
    const out = translateSyncError(errnoError("EPERM", "EPERM: operation not permitted, fsync"));
    expect(out.message).toBe("Device is read-only or refused the write (EPERM)");
    expect(out.hint).toMatch(/eject/i);
    expect(out.helpAnchor).toBe("eperm");
  });

  it("maps EROFS to the same anchor with its own message", () => {
    const out = translateSyncError(errnoError("EROFS", "EROFS: read-only file system"));
    expect(out.message).toContain("read-only");
    expect(out.helpAnchor).toBe("eperm");
  });

  it("maps EIO to the device-not-recognized anchor", () => {
    const out = translateSyncError(errnoError("EIO", "EIO: i/o error"));
    expect(out.helpAnchor).toBe("device-not-recognized");
  });

  it("falls back to the raw message for unknown codes", () => {
    const out = translateSyncError(errnoError("EBOGUS", "EBOGUS: not a real errno"));
    expect(out.message).toBe("EBOGUS: not a real errno");
    expect(out.hint).toBeUndefined();
    expect(out.helpAnchor).toBeUndefined();
  });

  it("strips the leading 'Error:' prefix for unknown errors", () => {
    const out = translateSyncError(new Error("something broke"));
    expect(out.message).toBe("something broke");
  });

  it("coerces non-Error values to a string", () => {
    const out = translateSyncError("plain string");
    expect(out.message).toBe("plain string");
    expect(out.helpAnchor).toBeUndefined();
  });

  it("ENOENT has a hint but no anchor (source-side issue, not a FAQ topic)", () => {
    const out = translateSyncError(errnoError("ENOENT", "ENOENT: no such file"));
    expect(out.hint).toBeDefined();
    expect(out.helpAnchor).toBeUndefined();
  });
});

describe("hintForErrno", () => {
  it("returns null for unknown codes", () => {
    expect(hintForErrno("EBOGUS")).toBeNull();
  });

  it("returns the entry verbatim for known codes (no errno tag in message)", () => {
    const out = hintForErrno("ENOSPC");
    expect(out).not.toBeNull();
    expect(out!.message).toBe("Device full");
    expect(out!.hint).toMatch(/smart fit/i);
  });
});
