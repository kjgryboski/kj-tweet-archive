import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import SearchBar from "./SearchBar";
import { ThemeProvider } from "@/lib/theme-context";
import React from "react";

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", () => {
  const { forwardRef } = require("react");
  return {
    motion: {
      div: forwardRef(({ children, ...props }: any, ref: any) => {
        const React = require("react");
        return React.createElement("div", { ref, ...props }, children);
      }),
    },
  };
});

// Mock next/image
vi.mock("next/image", () => ({
  default: (props: any) => <img {...props} />,
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const mockTweets = [
  { id: "1", text: "Trading futures today", title: "Trading", createdAt: "2026-01-01T00:00:00Z", username: "KJFUTURES", name: "KJ" },
  { id: "2", text: "Market analysis report", title: "Market", createdAt: "2026-01-02T00:00:00Z", username: "KJFUTURES", name: "KJ" },
  { id: "3", text: "Trading strategies for beginners", title: "Strategies", createdAt: "2026-01-03T00:00:00Z", username: "KJFUTURES", name: "KJ" },
];

describe("SearchBar", () => {
  it("Enter key triggers onSearch with input value", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    renderWithTheme(<SearchBar tweets={mockTweets} onSearch={onSearch} />);

    const input = screen.getByPlaceholderText("SEARCH TWEET");
    await user.type(input, "trading");
    await user.keyboard("{Enter}");

    expect(onSearch).toHaveBeenCalledWith("trading");
  });

  it("Clear button resets and calls onSearch empty string", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    renderWithTheme(<SearchBar tweets={mockTweets} onSearch={onSearch} />);

    const input = screen.getByPlaceholderText("SEARCH TWEET");
    await user.type(input, "trading");
    await user.keyboard("{Enter}");

    const clearButton = screen.getByLabelText("clear search");
    await user.click(clearButton);

    expect(onSearch).toHaveBeenLastCalledWith("");
    expect(input).toHaveValue("");
  });

  it("Shows result count after matching search", async () => {
    const user = userEvent.setup();
    Element.prototype.scrollIntoView = vi.fn();
    renderWithTheme(<SearchBar tweets={mockTweets} />);

    const input = screen.getByPlaceholderText("SEARCH TWEET");
    await user.type(input, "trading");
    await user.keyboard("{Enter}");

    expect(screen.getByText("1 of 2 results")).toBeInTheDocument();
  });

  it("Navigation buttons cycle through results", async () => {
    const user = userEvent.setup();
    Element.prototype.scrollIntoView = vi.fn();
    renderWithTheme(<SearchBar tweets={mockTweets} />);

    const input = screen.getByPlaceholderText("SEARCH TWEET");
    await user.type(input, "trading");
    await user.keyboard("{Enter}");

    // Initially showing "1 of 2 results"
    expect(screen.getByText("1 of 2 results")).toBeInTheDocument();

    // Click next (KeyboardArrowDownIcon button) to go to result 2
    // Buttons rendered: [search, clear, prev(up), next(down)]
    const allButtons = screen.getAllByRole("button");
    const nextButton = allButtons[allButtons.length - 1]; // last button is "next"
    await user.click(nextButton);
    expect(screen.getByText("2 of 2 results")).toBeInTheDocument();

    // Click next again to wrap around to result 1
    await user.click(nextButton);
    expect(screen.getByText("1 of 2 results")).toBeInTheDocument();
  });

  it("Works without onSearch callback (no crash)", async () => {
    const user = userEvent.setup();
    Element.prototype.scrollIntoView = vi.fn();
    renderWithTheme(<SearchBar tweets={mockTweets} />);

    const input = screen.getByPlaceholderText("SEARCH TWEET");
    await user.type(input, "trading");
    await user.keyboard("{Enter}");

    // Should not throw and should still show results
    expect(screen.getByText("1 of 2 results")).toBeInTheDocument();
  });
});
