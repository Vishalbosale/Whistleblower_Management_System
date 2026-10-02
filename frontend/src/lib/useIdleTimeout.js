import { useEffect, useRef } from "react";

// Any of these resets the idle clock; deliberately broad so a user reading a
// long complaint (no keys, occasional scroll) doesn't get logged out under
// them.
const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "wheel", "touchstart"];

// Calls `onIdle` after `timeoutMs` of no activity. `onIdle` is read from a
// ref on each fire so callers can pass an inline function without the
// listeners being torn down and re-added every render.
export const useIdleTimeout = (timeoutMs, onIdle, enabled = true) => {
  const timerRef = useRef(null);
  const onIdleRef = useRef(onIdle);

  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const resetTimer = () => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onIdleRef.current(), timeoutMs);
    };

    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, resetTimer));
    };
  }, [timeoutMs, enabled]);
};
