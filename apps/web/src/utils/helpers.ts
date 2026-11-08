export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// Hours only when there are some, so a one hour sale reads 59:43, not 00:59:43.
export function formatCountdown(ms: number): string {
  const full = formatDuration(ms);
  return full.startsWith("00:") ? full.slice(3) : full;
}
