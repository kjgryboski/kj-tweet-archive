import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import ThemeToggle from "./ThemeToggle";
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

describe("ThemeToggle", () => {
  it("calls toggleColorMode on click", async () => {
    const user = userEvent.setup();
    const toggleColorMode = vi.fn();
    renderWithTheme(<ThemeToggle toggleColorMode={toggleColorMode} mode="light" />);

    const button = screen.getByRole("button", { name: "Switch to dark mode" });
    await user.click(button);

    expect(toggleColorMode).toHaveBeenCalledOnce();
  });

  it("renders moon icon in light mode (aria-label Switch to dark mode)", () => {
    const toggleColorMode = vi.fn();
    renderWithTheme(<ThemeToggle toggleColorMode={toggleColorMode} mode="light" />);

    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeInTheDocument();
  });

  it("renders sun icon in dark mode (aria-label Switch to light mode)", () => {
    const toggleColorMode = vi.fn();
    renderWithTheme(<ThemeToggle toggleColorMode={toggleColorMode} mode="dark" />);

    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeInTheDocument();
  });
});
