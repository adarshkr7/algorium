"use client";

/**
 * Thin fetch wrapper for the browser.
 *
 * Every API route answers `{ error, code }` on failure, so this surfaces that
 * message instead of the generic "Failed to fetch" the pages used to show.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

export async function apiFetch<T = unknown>(
  path: string,
  { body, headers, ...init }: RequestOptions = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      "Can't reach the server. Check your connection and try again.",
      0,
      "NETWORK_ERROR",
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | (Record<string, unknown> & { error?: string; code?: string; details?: unknown })
    | null;

  if (!response.ok) {
    throw new ApiError(
      payload?.error ?? `Request failed (${response.status})`,
      response.status,
      payload?.code,
      payload?.details,
    );
  }

  return payload as T;
}

/** Extracts a displayable message from anything thrown by `apiFetch`. */
export function errorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
