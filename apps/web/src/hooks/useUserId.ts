import { useState } from "react";
import { generateAndSetUserId, getUserId } from "../lib/userId";

export function useUserId() {
  const [userId, setUserId] = useState(() => getUserId());

  return { userId, regenerate: () => setUserId(generateAndSetUserId()) };
}
