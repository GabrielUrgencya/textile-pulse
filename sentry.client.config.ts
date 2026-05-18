import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring
  tracesSampleRate: 0.1, // 10% of transactions in production
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  // Data scrubbing — AC8: strip sensitive data before sending
  beforeSend(event) {
    if (event.request?.data) {
      const data =
        typeof event.request.data === "string"
          ? event.request.data
          : JSON.stringify(event.request.data);

      // Scrub PIN, tokens, passwords
      if (/pin|token|password|secret|authorization/i.test(data)) {
        event.request.data = "[REDACTED]";
      }
    }

    // Scrub sensitive headers
    if (event.request?.headers) {
      const sensitiveHeaders = ["authorization", "cookie", "x-api-key"];
      for (const header of sensitiveHeaders) {
        if (event.request.headers[header]) {
          event.request.headers[header] = "[REDACTED]";
        }
      }
    }

    return event;
  },

  // Ignore common non-actionable errors
  ignoreErrors: [
    "ResizeObserver loop",
    "Network request failed",
    "Load failed",
    "AbortError",
  ],
});
