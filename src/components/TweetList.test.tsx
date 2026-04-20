import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import TweetList from "./TweetList";
import { ThemeProvider } from "@/lib/theme-context";
import React from "react";

// Mock framer-motion
vi.mock("framer-motion", () => {
  const { forwardRef } = require("react");
  const React = require("react");
  return {
    motion: {
      div: forwardRef(({ children, ...props }: any, ref: any) => {
        return React.createElement("div", { ref, ...props }, children);
      }),
    },
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});

// Mock next/image
vi.mock("next/image", () => ({
  default: (props: any) => <img {...props} />,
}));

// Mock next/router — Tweet uses useRouter for card click navigation
vi.mock("next/router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const mockTweets = [
  { id: "1", text: "Tweet one", title: "One", createdAt: "2026-01-01T00:00:00Z", username: "KJFUTURES", name: "KJ" },
  { id: "2", text: "Tweet two", title: "Two", createdAt: "2026-01-02T00:00:00Z", username: "KJFUTURES", name: "KJ" },
  { id: "3", text: "Tweet three", title: "Three", createdAt: "2026-01-03T00:00:00Z", username: "KJFUTURES", name: "KJ" },
];

describe("TweetList", () => {
  it("shows skeleton cards when isLoading is true", () => {
    const { container } = renderWithTheme(<TweetList tweets={[]} isLoading={true} />);
    // Skeleton loading renders MUI Skeleton components
    const skeletons = container.querySelectorAll(".MuiSkeleton-root");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows empty state when tweets array is empty", () => {
    renderWithTheme(<TweetList tweets={[]} isLoading={false} />);
    expect(screen.getByText("No tweets found")).toBeInTheDocument();
  });

  it("renders correct number of tweet cards", () => {
    renderWithTheme(<TweetList tweets={mockTweets} isLoading={false} />);
    expect(screen.getByText("Tweet one")).toBeInTheDocument();
    expect(screen.getByText("Tweet two")).toBeInTheDocument();
    expect(screen.getByText("Tweet three")).toBeInTheDocument();
  });

  it("shows bottom spinner when loadingMore is true", () => {
    renderWithTheme(<TweetList tweets={mockTweets} isLoading={false} loadingMore={true} />);
    expect(screen.getByText("Tweet one")).toBeInTheDocument();
    expect(screen.getByText("Loading more...")).toBeInTheDocument();
  });

  it("shows error state with retry button", () => {
    const onRetry = vi.fn();
    renderWithTheme(
      <TweetList tweets={[]} isLoading={false} error="Failed to load tweets" onRetry={onRetry} />
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Failed to load tweets")).toBeInTheDocument();
    expect(screen.getByText("Try Again")).toBeInTheDocument();
  });

  it("error state takes priority over empty state", () => {
    renderWithTheme(
      <TweetList tweets={[]} isLoading={false} error="API error" />
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.queryByText("No tweets found")).not.toBeInTheDocument();
  });
});
