import React, { useRef } from 'react'

export default function useAnimationFrame(callback: (deltaInMs: number) => void, dependencies: any[])  {
  // Use useRef for mutable variables that we want to persist
  // without triggering a re-render on their change
  const requestRef = useRef() as RequestRefType;
  const previousTimeRef = useRef() as TimeRefType;

  const animate = (time: DOMHighResTimeStamp) => {
    if (previousTimeRef.current != undefined) {
      const deltaTime = time - previousTimeRef.current;
      callback(deltaTime)
    }
    previousTimeRef.current = time;
    requestRef.current = requestAnimationFrame(animate);
  }

  React.useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, dependencies); // Make sure the effect runs only once
}

interface TimeRefType {
  current?: DOMHighResTimeStamp
}

interface RequestRefType {
  current: number
}