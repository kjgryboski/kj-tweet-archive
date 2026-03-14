import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import SearchBar from "./SearchBar";
import { ThemeProvider } from "@/lib/theme-context";
import React from "react";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("SearchBar", () => {
  it("Enter key triggers onServerSearch with input value", async () => {
    const user = userEvent.setup();
    const onServerSearch = vi.fn();
    const onClear = vi.fn();
    renderWithTheme(<SearchBar onServerSearch={onServerSearch} onClear={onClear} />);

    const input = screen.getByPlaceholderText("SEARCH TWEET");
    await user.type(input, "trading");
    await user.keyboard("{Enter}");

    expect(onServerSearch).toHaveBeenCalledWith("trading");
  });

  it("Clear button resets and calls onClear", async () => {
    const user = userEvent.setup();
    const onServerSearch = vi.fn();
    const onClear = vi.fn();
    renderWithTheme(<SearchBar onServerSearch={onServerSearch} onClear={onClear} />);

    const input = screen.getByPlaceholderText("SEARCH TWEET");
    await user.type(input, "trading");
    await user.keyboard("{Enter}");

    const clearButton = screen.getByLabelText("clear search");
    await user.click(clearButton);

    expect(onClear).toHaveBeenCalled();
    expect(input).toHaveValue("");
  });

  it("Shows result count after search", async () => {
    const user = userEvent.setup();
    const onServerSearch = vi.fn();
    const onClear = vi.fn();
    renderWithTheme(
      <SearchBar onServerSearch={onServerSearch} onClear={onClear} resultCount={5} />
    );

    const input = screen.getByPlaceholderText("SEARCH TWEET");
    await user.type(input, "trading");
    await user.keyboard("{Enter}");

    expect(screen.getByText("5 results found")).toBeInTheDocument();
  });

  it("Shows singular 'result' for count of 1", async () => {
    const user = userEvent.setup();
    const onServerSearch = vi.fn();
    const onClear = vi.fn();
    renderWithTheme(
      <SearchBar onServerSearch={onServerSearch} onClear={onClear} resultCount={1} />
    );

    const input = screen.getByPlaceholderText("SEARCH TWEET");
    await user.type(input, "test");
    await user.keyboard("{Enter}");

    expect(screen.getByText("1 result found")).toBeInTheDocument();
  });

  it("Empty input triggers onClear instead of search", async () => {
    const user = userEvent.setup();
    const onServerSearch = vi.fn();
    const onClear = vi.fn();
    renderWithTheme(<SearchBar onServerSearch={onServerSearch} onClear={onClear} />);

    const input = screen.getByPlaceholderText("SEARCH TWEET");
    await user.click(input);
    await user.keyboard("{Enter}");

    expect(onServerSearch).not.toHaveBeenCalled();
    expect(onClear).toHaveBeenCalled();
  });
});
