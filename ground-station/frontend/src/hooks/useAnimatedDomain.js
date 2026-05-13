import { useEffect, useRef, useState } from 'react';

export function useAnimatedDomain(target, duration = 700) {
    const valueRef = useRef(target);
    const [displayed, setDisplayed] = useState(target);
    const rafRef = useRef(null);

    useEffect(() => {
        if (target === valueRef.current) return;
        cancelAnimationFrame(rafRef.current);
        const from = valueRef.current;
        const t0 = performance.now();
        const tick = (now) => {
            const p = Math.min((now - t0) / duration, 1);
            const e = p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
            const v = from + (target - from) * e;
            valueRef.current = v;
            setDisplayed(v);
            if (p < 1) rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [target, duration]);

    return displayed;
}
