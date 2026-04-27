"use client";

export function buildBrowserNavigationUrl(href: string): string {
  if (typeof window === "undefined") {
    return href;
  }

  return new URL(href, window.location.origin).toString();
}

export function navigateWithBrowser(
  href: string,
  { replace = false }: { replace?: boolean } = {}
) {
  if (typeof window === "undefined") {
    return;
  }

  const destination = buildBrowserNavigationUrl(href);

  try {
    if (window.top && window.top !== window.self) {
      if (replace) {
        window.top.location.replace(destination);
      } else {
        window.top.location.assign(destination);
      }
      return;
    }
  } catch {
    // Fall back to the current browsing context when the host blocks top access.
  }

  if (replace) {
    window.location.replace(destination);
    return;
  }

  window.location.assign(destination);
}

export function replaceWithBrowser(href: string) {
  navigateWithBrowser(href, { replace: true });
}
