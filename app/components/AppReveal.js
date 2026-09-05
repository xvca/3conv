"use client";

import { useEffect, useRef, useState } from "react";

export default function AppReveal({ children }) {
  const [fontState, setFontState] = useState("loading");
  const rootRef = useRef(null);

  useEffect(() => {
    let settled = false;
    const finish = (state) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      setFontState(state);
    };
    // Don't strand the UI on a slow/blocked font. Keep the fallback for this
    // visit in that case, so a late download cannot cause another font flash.
    const timer = setTimeout(() => finish("fallback"), 2500);
    if (!document.fonts) {
      finish("fallback");
    } else {
      const family = getComputedStyle(rootRef.current).fontFamily;
      Promise.all([400, 500, 600].map((weight) => document.fonts.load(`${weight} 16px ${family}`)))
        .then(() => finish("ready"), () => finish("fallback"));
    }
    return () => {
      settled = true;
      clearTimeout(timer);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="app-reveal"
      data-font-state={fontState}
      inert={fontState === "loading"}
      aria-hidden={fontState === "loading" ? true : undefined}
    >
      {children}
    </div>
  );
}
