import { useApiStatus } from "../hooks/useApiStatus";

export function ApiStatusBadge() {
  return <p>API: {useApiStatus()}</p>;
}
