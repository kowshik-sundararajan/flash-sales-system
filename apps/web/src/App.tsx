import { useEffect, useState } from "react";
import { checkApi, type ApiStatus } from "./lib/checkApi";

export function App() {
  const [status, setStatus] = useState<ApiStatus | "checking">("checking");

  useEffect(() => {
    let active = true;

    void checkApi(() => fetch("/api/health")).then((result) => {
      if (active) setStatus(result);
    });

    return () => {
      active = false;
    };
  }, []);

  return <p>API: {status}</p>;
}
