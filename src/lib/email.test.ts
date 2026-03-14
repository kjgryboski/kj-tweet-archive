import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn();
vi.mock("resend", () => {
  return {
    Resend: class {
      emails = { send: mockSend };
    },
  };
});

import { sendAlert } from "./email";

beforeEach(() => {
  mockSend.mockReset();
  process.env.RESEND_API_KEY = "test-key";
});

describe("sendAlert", () => {
  it("calls Resend with correct params", async () => {
    mockSend.mockResolvedValue({ id: "123" });

    await sendAlert("[KJ Tweets] Test", "Test body");

    expect(mockSend).toHaveBeenCalledWith({
      from: "KJ Tweets Alerts <onboarding@resend.dev>",
      to: "kj@kj.ventures",
      subject: "[KJ Tweets] Test",
      text: "Test body",
    });
  });

  it("does not throw on Resend error", async () => {
    mockSend.mockRejectedValue(new Error("Resend down"));
    await expect(sendAlert("Subject", "Body")).resolves.toBeUndefined();
  });

  it("skips sending when RESEND_API_KEY is not set", async () => {
    delete process.env.RESEND_API_KEY;
    await sendAlert("Subject", "Body");
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("uses ALERT_EMAIL env var when set", async () => {
    process.env.ALERT_EMAIL = "custom@example.com";
    mockSend.mockResolvedValue({ id: "456" });

    await sendAlert("Test", "Body");

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: "custom@example.com" })
    );

    delete process.env.ALERT_EMAIL;
  });
});
