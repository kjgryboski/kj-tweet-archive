import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import BackToTop from "./BackToTop";
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

describe("BackToTop", () => {
  it("hidden before scroll threshold (button exists in DOM)", () => {
    const { container } = renderWithTheme(<BackToTop />);

    // MUI Zoom applies visibility:hidden when `in={false}`
    // Use querySelector to find by aria-label since visibility:hidden hides from accessibility tree
    const button = container.querySelector('[aria-label="Back to top"]');
    expect(button).toBeInTheDocument();
    expect(button).toHaveStyle("visibility: hidden");
  });

  it("visible after scrolling past 500px", async () => {
    const { container } = renderWithTheme(<BackToTop />);

    // Simulate scroll past 500px threshold
    Object.defineProperty(window, "scrollY", { value: 600, writable: true, configurable: true });
    await act(async () => {
      fireEvent.scroll(window);
    });

    // After scroll, Zoom `in={true}` — visibility:hidden is removed
    const button = container.querySelector('[aria-label="Back to top"]');
    expect(button).toBeInTheDocument();
    expect(button).not.toHaveStyle("visibility: hidden");
  });
});
