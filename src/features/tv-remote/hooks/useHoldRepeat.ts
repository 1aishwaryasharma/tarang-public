import { useCallback, useEffect, useRef } from 'react';

const REPEAT_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 150;

/** onPress fires once on touch-down. With onRepeat the key repeats while held. */
type Options = { onPress: () => void; onRepeat?: () => void; disabled?: boolean };

export function useHoldRepeat({ onPress, onRepeat, disabled }: Options) {
  const delayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const latest = useRef({ onPress, onRepeat });
  latest.current = { onPress, onRepeat };

  const onPressOut = useCallback(() => {
    if (delayTimer.current) clearTimeout(delayTimer.current);
    if (intervalTimer.current) clearInterval(intervalTimer.current);
    delayTimer.current = null;
    intervalTimer.current = null;
  }, []);

  const onPressIn = useCallback(() => {
    onPressOut();
    latest.current.onPress();
    if (!latest.current.onRepeat) return;
    delayTimer.current = setTimeout(() => {
      intervalTimer.current = setInterval(() => latest.current.onRepeat?.(), REPEAT_INTERVAL_MS);
    }, REPEAT_DELAY_MS);
  }, [onPressOut]);

  useEffect(() => {
    if (disabled) onPressOut();
  }, [disabled, onPressOut]);

  useEffect(() => onPressOut, [onPressOut]);

  return { onPressIn, onPressOut };
}
