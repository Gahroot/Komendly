"use client";

import { Component, type ReactNode } from "react";

/** Ozzy is decoration: if he ever throws, render nothing instead of taking the page down. */
export class OzzyBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    if (process.env.NODE_ENV !== "production") console.warn("[ozzy] render failed, hiding mascot", error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
