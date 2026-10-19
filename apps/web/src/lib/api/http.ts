import { NextResponse } from "next/server";
import { problem } from "@leadorbit/api-contracts";
import { AuthError } from "@leadorbit/db";

export function jsonOk<T>(body: T, init?: ResponseInit) {
  return NextResponse.json(body, init);
}

export function jsonProblem(status: number, title: string, detail?: string) {
  return NextResponse.json(problem(status, title, detail), {
    status,
    headers: { "content-type": "application/problem+json" },
  });
}

export function fromAuthError(err: unknown) {
  if (err instanceof AuthError) {
    const status =
      err.code === "unauthorized"
        ? 401
        : err.code === "forbidden"
          ? 403
          : err.code === "not_found"
            ? 404
            : err.code === "conflict"
              ? 409
              : 400;
    return jsonProblem(status, err.name, err.message);
  }
  console.error(err);
  return jsonProblem(500, "Internal Server Error", "Unexpected error");
}

export async function requireUser() {
  const { getSessionUser } = await import("../auth/session");
  const user = await getSessionUser();
  if (!user) throw new AuthError("Authentication required", "unauthorized");
  return user;
}
