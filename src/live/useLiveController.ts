import { useEffect, useState, useSyncExternalStore } from 'react';
import { LiveController, type LivePosition } from './controller';

/** Owns one `LiveController` for the lifetime of the component and exposes its state to React. */
export function useLiveController(onPosition: (position: LivePosition) => void) {
  const [controller] = useState(() => new LiveController());

  useEffect(() => {
    controller.setOnPosition(onPosition);
  }, [controller, onPosition]);

  useEffect(() => {
    controller.mount();
    return () => controller.unmount();
  }, [controller]);

  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  return { controller, state };
}
