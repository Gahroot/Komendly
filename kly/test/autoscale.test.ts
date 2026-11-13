import { describe, expect, it } from "vitest";
import { MIN_VOLUME, nextVolume } from "../src/autoscale";

const healthy = { sends: 40, bounces: 0, complaints: 0, replyRate: 0.05, baselineReplyRate: 0.05 };

describe("autoscale", () => {
  it("runs at the ceiling when healthy (warm-up paces), recovers gradually after a cut", () => {
    expect(nextVolume(80, 80, healthy)).toMatchObject({ volume: 80, brake: false });
    expect(nextVolume(20, 80, healthy)).toMatchObject({ volume: 24, brake: true });
    expect(nextVolume(78, 80, { ...healthy, sends: 300 })).toMatchObject({ volume: 80, brake: false });
  });
  it("halves on a complaint or high bounces, never below the floor", () => {
    expect(nextVolume(40, 80, { ...healthy, complaints: 1 })).toMatchObject({ volume: 20, brake: true });
    expect(nextVolume(40, 80, { ...healthy, bounces: 2 }).volume).toBeGreaterThanOrEqual(40);
    expect(nextVolume(40, 80, { ...healthy, sends: 60, bounces: 4 }).volume).toBe(20);
    expect(nextVolume(6, 80, { ...healthy, complaints: 1 }).volume).toBe(MIN_VOLUME);
  });
  it("backs off when replies collapse", () => {
    expect(nextVolume(40, 80, { ...healthy, sends: 60, replyRate: 0.01 }).volume).toBe(30);
  });
  it("holds without enough data", () => {
    expect(nextVolume(30, 80, { ...healthy, sends: 5 }).volume).toBe(30);
  });
});
