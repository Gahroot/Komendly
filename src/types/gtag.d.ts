interface Window {
  gtag: (
    command: "event" | "config" | "js",
    targetId: string | Date,
    config?: Record<string, unknown>
  ) => void;
  dataLayer: unknown[];
}
