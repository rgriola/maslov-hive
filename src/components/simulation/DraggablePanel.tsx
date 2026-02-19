'use client';

import React, { useState, useEffect, useRef, ReactNode } from 'react';

/**
 * Props for the DraggablePanel component.
 */
interface DraggablePanelProps {
    /** Top-level children to render inside the draggable container */
    children: ReactNode;
    /** Unique ID for saving position to localStorage */
    id: string;
    /** Initial top position (CSS value) */
    initialTop?: string | number;
    /** Initial left position (CSS value) */
    initialLeft?: string | number;
    /** Initial right position (CSS value) */
    initialRight?: string | number;
    /** Initial bottom position (CSS value) */
    initialBottom?: string | number;
    /** Z-index for the panel */
    zIndex?: number;
    /** Whether the panel should be centered by default (e.g. for dashboards) */
    center?: boolean;
}

/**
 * A wrapper component that makes any panel draggable and remembers its position.
 */
export function DraggablePanel({
    children,
    id,
    initialTop,
    initialLeft,
    initialRight,
    initialBottom,
    zIndex = 50,
    center = false
}: DraggablePanelProps) {
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const [mounted, setMounted] = useState(false);

    // Load position from localStorage on mount
    useEffect(() => {
        setMounted(true);
        const saved = localStorage.getItem(`panel-pos-${id}`);
        if (saved) {
            try {
                setPos(JSON.parse(saved));
            } catch (e) {
                console.error('Failed to parse panel position', e);
            }
        }
    }, [id]);

    const onMouseDown = (e: React.MouseEvent) => {
        // Only drag from non-interactive elements (don't drag on buttons or links)
        const target = e.target as HTMLElement;
        if (['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;

        setIsDragging(true);
        dragStart.current = {
            x: e.clientX - pos.x,
            y: e.clientY - pos.y
        };

        // Optional: Prevent default to avoid text selection while dragging
        // e.preventDefault(); 
    };

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;

            const newPos = {
                x: e.clientX - dragStart.current.x,
                y: e.clientY - dragStart.current.y
            };

            setPos(newPos);
        };

        const onMouseUp = () => {
            if (isDragging) {
                setIsDragging(false);
                localStorage.setItem(`panel-pos-${id}`, JSON.stringify(pos));
            }
        };

        if (isDragging) {
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [isDragging, pos, id]);

    // Avoid Hydration mismatch
    if (!mounted) return <div style={{ visibility: 'hidden' }}>{children}</div>;

    const style: React.CSSProperties = {
        position: 'absolute',
        top: initialTop,
        left: initialLeft,
        right: initialRight,
        bottom: initialBottom,
        transform: center
            ? `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`
            : `translate(${pos.x}px, ${pos.y}px)`,
        zIndex,
        cursor: isDragging ? 'grabbing' : 'grab',
        pointerEvents: 'auto',
        // We don't want the draggable wrapper to have its own background or borders
        display: 'inline-block',
    };

    return (
        <div onMouseDown={onMouseDown} style={style}>
            {children}
        </div>
    );
}
