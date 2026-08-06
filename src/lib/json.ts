/**
 * Prisma returns BigInt for Submission.cfSubmissionId. `JSON.stringify` throws
 * on BigInt, which meant every response that embedded a submission row (most
 * notably POST /api/contests/[id]/evaluate) crashed with a 500.
 *
 * `toJsonSafe` walks a value and converts BigInt to string, Date to ISO, and
 * leaves everything else untouched.
 */
export function toJsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, val) =>
      typeof val === "bigint" ? val.toString() : val,
    ),
  ) as T;
}
