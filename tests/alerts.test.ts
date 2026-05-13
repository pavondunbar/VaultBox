import { describe, it, expect, vi } from "vitest";
import { fireAlert, onAlert, type Alert } from "@/lib/monitoring/alerts";

describe("alerting", () => {
  it("fires alert to registered handlers", async () => {
    const received: Alert[] = [];
    onAlert((alert) => { received.push(alert); });

    await fireAlert("warning", "Test Alert", "Something happened", { key: "value" });

    const alert = received.find((a) => a.title === "Test Alert");
    expect(alert).toBeDefined();
    expect(alert!.severity).toBe("warning");
    expect(alert!.message).toBe("Something happened");
    expect(alert!.metadata).toEqual({ key: "value" });
  });

  it("includes timestamp on alerts", async () => {
    const received: Alert[] = [];
    onAlert((alert) => { received.push(alert); });

    await fireAlert("info", "Timestamp Test", "check time");

    const alert = received.find((a) => a.title === "Timestamp Test");
    expect(alert!.timestamp).toBeInstanceOf(Date);
  });
});
