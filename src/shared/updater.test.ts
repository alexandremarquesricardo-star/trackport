import { describe, expect, it } from "vitest";
import { updateStateReducer, type UpdateState } from "./updater";

const idle: UpdateState = { phase: "idle" };
const checking: UpdateState = { phase: "checking" };

describe("updateStateReducer", () => {
  it("transitions idle → checking on a `checking` event", () => {
    expect(updateStateReducer(idle, { kind: "checking" })).toEqual({ phase: "checking" });
  });

  it("transitions checking → available with version + releaseNotes", () => {
    const next = updateStateReducer(checking, {
      kind: "available",
      version: "0.2.0",
      releaseNotes: "Bug fixes.",
    });
    expect(next).toEqual({
      phase: "available",
      version: "0.2.0",
      releaseNotes: "Bug fixes.",
    });
  });

  it("collapses checking → idle on `not-available` (no 'you're up to date' noise)", () => {
    expect(updateStateReducer(checking, { kind: "not-available" })).toEqual({ phase: "idle" });
  });

  it("does NOT yank a user out of downloading on a stray `not-available`", () => {
    const downloading: UpdateState = {
      phase: "downloading",
      percent: 42,
      bytesPerSecond: 1024,
      transferred: 100,
      total: 200,
    };
    expect(updateStateReducer(downloading, { kind: "not-available" })).toBe(downloading);
  });

  it("transitions to downloading with full progress payload on `progress`", () => {
    const available: UpdateState = {
      phase: "available",
      version: "0.2.0",
      releaseNotes: null,
    };
    const next = updateStateReducer(available, {
      kind: "progress",
      percent: 17.5,
      bytesPerSecond: 2048,
      transferred: 350,
      total: 2000,
    });
    expect(next).toEqual({
      phase: "downloading",
      percent: 17.5,
      bytesPerSecond: 2048,
      transferred: 350,
      total: 2000,
    });
  });

  it("transitions downloading → ready on `downloaded`", () => {
    const downloading: UpdateState = {
      phase: "downloading",
      percent: 99,
      bytesPerSecond: 0,
      transferred: 1990,
      total: 2000,
    };
    expect(updateStateReducer(downloading, { kind: "downloaded", version: "0.2.0" })).toEqual({
      phase: "ready",
      version: "0.2.0",
    });
  });

  it("captures error messages from any prior state", () => {
    expect(updateStateReducer(checking, { kind: "error", message: "ENOTFOUND" })).toEqual({
      phase: "error",
      message: "ENOTFOUND",
    });
    expect(updateStateReducer(idle, { kind: "error", message: "fetch failed" })).toEqual({
      phase: "error",
      message: "fetch failed",
    });
  });

  it("recovers from error → checking when a fresh check starts", () => {
    const errored: UpdateState = { phase: "error", message: "transient" };
    expect(updateStateReducer(errored, { kind: "checking" })).toEqual({ phase: "checking" });
  });
});
