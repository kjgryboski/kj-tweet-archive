export const SELECTORS = {
  tweetContainer: ['[data-testid="tweet"]', 'article[role="article"]', 'article'],
  tweetText: ['[data-testid="tweetText"]', 'div[lang][dir="ltr"]'],
  socialContext: ['[data-testid="socialContext"]'],
  timeElement: ['time[datetime]'],
} as const;

export type SelectorKey = keyof typeof SELECTORS;

export type SelectorResult = {
  selector: string;
  elements: Element[];
} | null;

export function resolveSelector(
  root: ParentNode,
  key: SelectorKey
): SelectorResult {
  for (const selector of SELECTORS[key]) {
    const elements = Array.from(root.querySelectorAll(selector));
    if (elements.length > 0) {
      return { selector, elements };
    }
  }
  return null;
}

export function resolveChildSelector(
  parent: Element,
  key: SelectorKey
): SelectorResult {
  for (const selector of SELECTORS[key]) {
    const elements = Array.from(parent.querySelectorAll(selector));
    if (elements.length > 0) {
      return { selector, elements };
    }
  }
  return null;
}
