"use client";
// Stick-to-bottom (pattern from production chat UIs, e.g. diffusionstudio/editor stick-to-bottom, NextChat useScrollToBottom):
// follow new content while the reader is at the bottom; once they scroll up, stop following and offer a pill.
import { useCallback, useEffect, useRef, useState } from "react";

const THRESHOLD = 80;

export function useStickToBottom() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    stuck.current = true;
    setAtBottom(true);
    el.scrollTo({ top: el.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : behavior });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    let lastTop = el.scrollTop;
    const onScroll = () => {
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < THRESHOLD;
      // Scrolling up escapes the lock; reaching the bottom re-engages it.
      if (el.scrollTop < lastTop - 2 && !near) stuck.current = false;
      if (near) stuck.current = true;
      lastTop = el.scrollTop;
      setAtBottom(near);
    };
    const ro = new ResizeObserver(() => {
      if (stuck.current) el.scrollTop = el.scrollHeight;
      else setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < THRESHOLD);
    });
    ro.observe(content);
    el.addEventListener("scroll", onScroll, { passive: true });
    el.scrollTop = el.scrollHeight;
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  return { scrollRef, contentRef, atBottom, scrollToBottom };
}
