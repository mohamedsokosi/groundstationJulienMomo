import { useEffect, useRef, useState } from 'react';

export function useAnimatedDomain(target, duration = 300) {
    const [value, setValue] = useState(target);
    const rafRef = useRef(null);
    const startRef = useRef(null);
    const fromRef = useRef(target);

    useEffect(() => {
        if (target === value) return;
        cancelAnimationFrame(rafRef.current);
        fromRef.current = value;
        startRef.current = null;

        const animate = (now) => {
            if (!startRef.current) startRef.current = now;
            const p = Math.min((now - startRef.current) / duration, 1);
            const e = 1 - (1 - p) ** 3;
            setValue(fromRef.current + (target - fromRef.current) * e);
            if (p < 1) rafRef.current = requestAnimationFrame(animate);
        };
        rafRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target]);

    return value;
}
