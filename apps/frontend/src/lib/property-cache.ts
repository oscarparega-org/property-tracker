const eventName = 'properties-changed';

export function invalidateProperties() {
  window.dispatchEvent(new Event(eventName));
}

export function subscribeToPropertyInvalidation(listener: () => void) {
  window.addEventListener(eventName, listener);
  return () => window.removeEventListener(eventName, listener);
}
