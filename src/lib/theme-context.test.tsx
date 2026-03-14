import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ThemeProvider, useThemeContext } from "./theme-context";
import React from "react";

beforeEach(() => {
  localStorage.clear();
});

describe("useThemeContext", () => {
  it("throws when used outside ThemeProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => {
      renderHook(() => useThemeContext());
    }).toThrow("useThemeContext must be used within a ThemeProvider");
    spy.mockRestore();
  });

  it("toggleColorMode switches light to dark", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider>{children}</ThemeProvider>
    );
    const { result } = renderHook(() => useThemeContext(), { wrapper });

    expect(result.current.colorMode).toBe("light");

    act(() => {
      result.current.toggleColorMode();
    });

    expect(result.current.colorMode).toBe("dark");
  });

  it("persists mode to localStorage", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider>{children}</ThemeProvider>
    );
    const { result } = renderHook(() => useThemeContext(), { wrapper });

    act(() => {
      result.current.toggleColorMode();
    });

    expect(localStorage.getItem("colorMode")).toBe("dark");
  });
});
