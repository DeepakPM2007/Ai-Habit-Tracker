export function subscribeToNetworkStatus(callback: (online: boolean) => void) {
  const emit = () => callback(navigator.onLine);
  window.addEventListener("online", emit);
  window.addEventListener("offline", emit);
  emit();

  return () => {
    window.removeEventListener("online", emit);
    window.removeEventListener("offline", emit);
  };
}
