import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import Tweet from "./Tweet";
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

// Mock next/router — Tweet uses useRouter for card click navigation
vi.mock("next/router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const defaultProps = {
  id: "123",
  text: "This is a test tweet about trading futures",
  title: "Test Tweet",
  createdAt: new Date().toISOString(),
  username: "KJFUTURES",
  name: "KJ",
};

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("Tweet", () => {
  it("renders name, username, title, and text", () => {
    renderWithTheme(<Tweet {...defaultProps} />);

    expect(screen.getByText("KJ")).toBeInTheDocument();
    expect(screen.getByText(/KJFUTURES/)).toBeInTheDocument();
    expect(screen.getByText("Test Tweet")).toBeInTheDocument();
    expect(screen.getByText("This is a test tweet about trading futures")).toBeInTheDocument();
  });

  it("highlights search term in text and title", () => {
    renderWithTheme(<Tweet {...defaultProps} searchTerm="trading" />);

    const highlights = screen.getAllByText("trading");
    expect(highlights.length).toBeGreaterThan(0);
  });

  it("does not add highlight markup when searchTerm is empty", () => {
    renderWithTheme(<Tweet {...defaultProps} searchTerm="" />);
    expect(screen.getByText("This is a test tweet about trading futures")).toBeInTheDocument();
  });

  it("renders media image when mediaUrls provided", () => {
    renderWithTheme(
      <Tweet {...defaultProps} mediaUrls={["https://pbs.twimg.com/media/test.jpg"]} />
    );

    const img = screen.getByAltText("Tweet media");
    expect(img).toBeInTheDocument();
  });

  it("renders like count", () => {
    renderWithTheme(<Tweet {...defaultProps} likes={42} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });
});
