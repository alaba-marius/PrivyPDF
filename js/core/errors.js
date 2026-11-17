// Central error handler. Surface failures through a friendly toast and a
// short console.error context string. File names and contents are never
// logged or shown to the user.
export class AppError extends Error {
  constructor(message, { context } = {}) {
    super(message);
    this.name = "AppError";
    this.context = context || "";
  }
}

let toast;
let lastToastMessage = "";
let lastToastTime = 0;
const TOAST_DEDUPE_MS = 3000;

export function setToast(fn) {
  toast = fn;
}

function report(error, context) {
  const message = error && error.message ? error.message : String(error ?? "An error occurred");
  console.error(`App error${context ? ": " + context : ""}`, message);
  const userMessage = `Something went wrong${context ? " (" + context + ")" : ""}.`;
  const now = Date.now();
  // Dedupe identical error toasts: the same message within 3 seconds shows one toast.
  if (toast && (userMessage !== lastToastMessage || now - lastToastTime > TOAST_DEDUPE_MS)) {
    toast(userMessage, { type: "error" });
    lastToastMessage = userMessage;
    lastToastTime = now;
  }
}

export function installErrorHandler() {
  window.addEventListener("error", (event) => {
    const message =
      event.message || (event.error && event.error.message) || "An error occurred";
    report(new Error(message), "uncaught error");
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = (reason && reason.message) || String(reason ?? "A request failed");
    report(new Error(message), "unhandled rejection");
    event.preventDefault();
  });
}

// Wraps an async action so rejections route through the same handler and
// never crash the page unobserved.
export function withErrorHandling(fn, context) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      report(error, context);
    }
  };
}
