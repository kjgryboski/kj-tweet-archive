import { describe, it, expect } from "vitest";
import { resolveSelector, resolveChildSelector } from "./scraper-selectors";

describe("resolveSelector", () => {
  it("returns first matching selector (primary)", () => {
    const container = document.createElement("div");
    const article = document.createElement("article");
    article.setAttribute("data-testid", "tweet");
    container.appendChild(article);

    const result = resolveSelector(container, "tweetContainer");
    expect(result).not.toBeNull();
    expect(result!.selector).toBe('[data-testid="tweet"]');
    expect(result!.elements).toHaveLength(1);
  });

  it("falls back when primary selector fails", () => {
    const container = document.createElement("div");
    const article = document.createElement("article");
    article.setAttribute("role", "article");
    container.appendChild(article);

    const result = resolveSelector(container, "tweetContainer");
    expect(result).not.toBeNull();
    expect(result!.selector).toBe('article[role="article"]');
    expect(result!.elements).toHaveLength(1);
  });

  it("returns null when all selectors fail", () => {
    const container = document.createElement("div");
    const result = resolveSelector(container, "tweetContainer");
    expect(result).toBeNull();
  });
});

describe("resolveChildSelector", () => {
  it("queries within parent element, not document", () => {
    const parent = document.createElement("article");
    const textDiv = document.createElement("div");
    textDiv.setAttribute("data-testid", "tweetText");
    textDiv.textContent = "Hello";
    parent.appendChild(textDiv);

    const outsideDiv = document.createElement("div");
    outsideDiv.setAttribute("data-testid", "tweetText");
    outsideDiv.textContent = "Outside";
    document.body.appendChild(outsideDiv);

    const result = resolveChildSelector(parent, "tweetText");
    expect(result).not.toBeNull();
    expect(result!.elements).toHaveLength(1);
    expect(result!.elements[0].textContent).toBe("Hello");

    document.body.removeChild(outsideDiv);
  });
});
