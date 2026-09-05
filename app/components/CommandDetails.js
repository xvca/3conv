"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const resizeDuration = 0.26;
const ease = [0.22, 1, 0.36, 1];

export default function CommandDetails({ command, cost }) {
  const [expanded, setExpanded] = useState(false);
  const [height, setHeight] = useState(null);
  const contentRef = useRef(null);
  const hoverTimeoutRef = useRef(null);
  const contentId = useId();
  const reduceMotion = useReducedMotion();

  useLayoutEffect(() => {
    const content = contentRef.current;
    const measure = () => {
      // Round up so fractional line heights never crop the bottom of a glyph.
      setHeight(Math.ceil(content.getBoundingClientRect().height));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => {
      observer.disconnect();
      clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  return (
    <div className="command-area">
      <section
        className="command-card"
        aria-label="Generated FFmpeg command"
        onPointerEnter={(event) => {
          // Touch also emits pointer-enter: don't let it toggle before the tap.
          if (event.pointerType !== "mouse" || !window.matchMedia("(any-hover: hover)").matches) return;
          clearTimeout(hoverTimeoutRef.current);
          setExpanded(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "mouse") return;
          clearTimeout(hoverTimeoutRef.current);
          hoverTimeoutRef.current = setTimeout(() => setExpanded(false), 180);
        }}
      >
        <button
          type="button"
          className="command-toggle"
          aria-expanded={expanded}
          aria-controls={contentId}
          aria-label={expanded ? "Collapse command" : "Expand command"}
          onClick={() => {
            clearTimeout(hoverTimeoutRef.current);
            setExpanded((value) => !value);
          }}
        >
          <span className="command-label">FFmpeg command</span>
          <span className="command-action" aria-hidden="true">
            {expanded ? "Less" : "Expand"}
            <motion.svg
              width="12" height="12" viewBox="0 0 16 16" fill="none"
              initial={false}
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease }}
            >
              <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </motion.svg>
          </span>
        </button>
        <motion.div
          id={contentId}
          className="command-viewport"
          initial={false}
          animate={{ height: height ?? "auto" }}
          transition={{ duration: reduceMotion ? 0 : resizeDuration, ease }}
        >
          <div ref={contentRef}>
            <AnimatePresence initial={false} mode="wait">
              <motion.code
                key={expanded ? "expanded" : "collapsed"}
                className={`command-text ${expanded ? "is-expanded" : "is-collapsed"}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { delay: reduceMotion ? 0 : resizeDuration, duration: reduceMotion ? 0 : 0.16 } }}
                exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : 0.08 } }}
              >
                {command}
              </motion.code>
            </AnimatePresence>
          </div>
        </motion.div>
      </section>
      {cost !== null && <div className="cost">Generation cost: ${cost.toFixed(6)}</div>}
    </div>
  );
}
