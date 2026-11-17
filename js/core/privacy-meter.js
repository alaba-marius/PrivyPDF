// Counts requests made to other origins since this page loaded, for the
// Privacy box live counter. Uses a PerformanceObserver on "resource"
// entries and compares each entry's URL origin with location.origin.
//
// Honest limits: it only sees resource-timing entries for resources the
// browser loads after the observer starts (buffered entries are included),
// so it cannot account for requests already in flight on load, requests
// blocked by the CSP before the page script runs, or activity from browser
// extensions. Same-origin requests for the app's own assets are not counted.
let count = 0;
const subscribers = new Set();
let observer;

function isOtherOrigin(url) {
  try {
    return new URL(url).origin !== location.origin;
  } catch {
    return false;
  }
}

function notify() {
  subscribers.forEach((fn) => fn(count));
}

export function startPrivacyMeter() {
  if (typeof PerformanceObserver === "undefined") return;
  observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === "resource" && isOtherOrigin(entry.name)) count += 1;
    }
    notify();
  });
  observer.observe({ type: "resource", buffered: true });
}

export function getCount() {
  return count;
}

export function subscribe(fn) {
  subscribers.add(fn);
  fn(count);
  return () => {
    subscribers.delete(fn);
  };
}

export function resetCount() {
  count = 0;
  notify();
}
