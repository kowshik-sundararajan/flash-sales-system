import { useEffect, useState } from "react";
import { checkApi, type ApiStatus } from "../lib/checkApi";

export function useApiStatus() {
  const [status, setStatus] = useState<ApiStatus>();

  useEffect(() => {
    void checkApi(() => fetch("/api/health")).then(setStatus);
  }, []);

  return status ?? "checking";
}
