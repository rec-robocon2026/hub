"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Thin bar at the top of the page: starts the moment an internal link or form is used,
 * finishes when the new page is on screen. Makes every click feel acknowledged.
 */
export function NavProgress() {
  const path = usePathname();
  const search = useSearchParams();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const route = `${path}?${search}`;
  const last = useRef(route);

  // Page changed → finish the bar.
  useEffect(() => {
    if (last.current === route) return;
    last.current = route;
    if (timer.current) clearInterval(timer.current);
    const done = requestAnimationFrame(() => setWidth(100));
    const hide = setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 250);
    return () => {
      cancelAnimationFrame(done);
      clearTimeout(hide);
    };
  }, [route]);

  useEffect(() => {
    const start = () => {
      if (timer.current) clearInterval(timer.current);
      setVisible(true);
      setWidth(12);
      // Creep towards 90% so a slow page still looks alive, never "done".
      timer.current = setInterval(() => setWidth((w) => (w < 90 ? w + (90 - w) * 0.08 : w)), 120);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/files/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // same page / #anchor
      start();
    };
    const onSubmit = (e: SubmitEvent) => {
      // Only GET forms (search) navigate. Action forms show their own "Saving…" on the button.
      const form = e.target as HTMLFormElement;
      if (!e.defaultPrevented && form.method.toLowerCase() === "get" && typeof form.getAttribute("action") === "string") start();
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  // Safety net: if a navigation never lands (offline, error), don't leave the bar hanging.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      if (timer.current) clearInterval(timer.current);
      setWidth(100);
      setTimeout(() => {
        setVisible(false);
        setWidth(0);
      }, 250);
    }, 8000);
    return () => clearTimeout(t);
  }, [visible]);

  return <div className="nav-progress" aria-hidden style={{ width: `${width}%`, opacity: visible ? 1 : 0 }} />;
}
