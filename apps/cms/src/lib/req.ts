/** Parse a request JSON body, tolerating a missing parser or malformed body. */
export async function readJson<T = unknown>(req: {
  json?: () => Promise<unknown>;
}): Promise<T | undefined> {
  try {
    return (await req.json?.()) as T | undefined;
  } catch {
    return undefined;
  }
}
