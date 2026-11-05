export type ApiStatus = "ok" | "unreachable";

export async function checkApi(
  fetchHealth: () => Promise<Response>,
): Promise<ApiStatus> {
  try {
    const response = await fetchHealth();
    if (!response.ok) return "unreachable";

    const body = (await response.json()) as { status?: unknown };
    return body.status === "ok" ? "ok" : "unreachable";
  } catch {
    return "unreachable";
  }
}
