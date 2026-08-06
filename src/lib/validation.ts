import { z } from "zod";

/**
 * Shared request schemas. Routes validate with `parseBody(req, Schema)` so a
 * malformed payload returns a 400 with the offending field instead of a 500
 * from deep inside Prisma.
 */

export const CF_HANDLE = z
  .string()
  .trim()
  .min(1, "Codeforces handle is required")
  .max(24, "Handle is too long")
  .regex(
    /^[A-Za-z0-9_.-]+$/,
    "Handles may only contain letters, digits, dot, dash and underscore",
  );

export const ROOM_CODE = z
  .string()
  .trim()
  .length(6, "Room codes are exactly 6 characters")
  .regex(/^[A-Za-z0-9]+$/, "Invalid room code")
  .transform((v) => v.toUpperCase());

export const PASSWORD = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long")
  .regex(/\d/, "Password must contain at least one number");

export const EMAIL = z
  .string()
  .trim()
  .toLowerCase()
  .email("Invalid email format")
  .max(254);

export const UUID = z.string().uuid("Invalid id");

// ── Contest configuration ────────────────────────────────────────────────────

export const CONTEST_MODES = ["BLITZ", "CLASSIC", "LOCKOUT"] as const;
export const POINTING_SYSTEMS = ["ICPC", "POINTS"] as const;
export const HOSTING_TYPES = ["PLAYER_HOST", "SUPERVISED"] as const;
export const TAG_MATCH_MODES = ["ANY", "ALL"] as const;

export const MIN_PROBLEMS = 1;
export const MAX_PROBLEMS = 8;
export const MIN_DURATION = 5;
export const MAX_DURATION = 300;
export const MIN_CF_RATING = 800;
export const MAX_CF_RATING = 3500;

const tagList = z
  .array(z.string().trim().min(1).max(40))
  .max(20, "At most 20 tags")
  .default([]);

export const CreateContestSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Give your duel a name")
      .max(60, "Name must be 60 characters or fewer"),
    mode: z.enum(CONTEST_MODES),
    pointingSystem: z.enum(POINTING_SYSTEMS).default("ICPC"),
    hostingType: z.enum(HOSTING_TYPES).default("PLAYER_HOST"),
    problemCount: z.coerce
      .number()
      .int()
      .min(MIN_PROBLEMS, `At least ${MIN_PROBLEMS} problem`)
      .max(MAX_PROBLEMS, `At most ${MAX_PROBLEMS} problems`)
      .default(3),
    durationMinutes: z.coerce
      .number()
      .int()
      .min(MIN_DURATION, `Minimum duration is ${MIN_DURATION} minutes`)
      .max(MAX_DURATION, `Maximum duration is ${MAX_DURATION} minutes`)
      .default(30),
    minRating: z.coerce
      .number()
      .int()
      .min(MIN_CF_RATING)
      .max(MAX_CF_RATING)
      .default(800),
    maxRating: z.coerce
      .number()
      .int()
      .min(MIN_CF_RATING)
      .max(MAX_CF_RATING)
      .default(1600),
    ratings: z
      .array(z.coerce.number().int().min(MIN_CF_RATING).max(MAX_CF_RATING))
      .max(MAX_PROBLEMS)
      .optional(),
    allowedTags: tagList,
    excludedTags: tagList,
    tagMatchMode: z.enum(TAG_MATCH_MODES).default("ANY"),
    seed: z.string().trim().max(64).default(""),
    isPublic: z.boolean().default(false),
    isSolo: z.boolean().default(false),
    bestOf: z.union([z.literal(1), z.literal(3), z.literal(5)]).default(1),
  })
  .refine((v) => v.minRating <= v.maxRating, {
    message: "Minimum rating cannot exceed maximum rating",
    path: ["minRating"],
  })
  .refine((v) => !(v.isSolo && v.hostingType === "SUPERVISED"), {
    message: "A supervised room cannot also be a solo practice run",
    path: ["isSolo"],
  })
  .refine((v) => !(v.isSolo && v.bestOf > 1), {
    message: "Best-of series require an opponent",
    path: ["bestOf"],
  })
  .refine((v) => !(v.bestOf > 1 && v.hostingType === "SUPERVISED"), {
    message: "Best-of series are only available when the host plays",
    path: ["bestOf"],
  });

export type CreateContestInput = z.infer<typeof CreateContestSchema>;

// ── Auth ─────────────────────────────────────────────────────────────────────

export const LoginInitiateSchema = z.object({
  handle: CF_HANDLE,
  forceVerify: z.boolean().optional().default(false),
});

export const LoginVerifySchema = z.object({
  handle: CF_HANDLE,
});

export const PasswordAuthSchema = z.object({
  handle: CF_HANDLE,
  password: z.string().min(1, "Password is required").max(128),
});

export const RegisterSchema = z.object({
  handle: CF_HANDLE,
  email: EMAIL,
  password: PASSWORD,
  passwordToken: z.string().min(1, "Missing registration token"),
});

export const SendOtpSchema = z.object({
  handleOrEmail: z
    .string()
    .trim()
    .min(1, "Enter your handle or email")
    .max(254),
});

export const ResetPasswordSchema = z.object({
  /** Accepts either the handle or the email the OTP was sent to. */
  handleOrEmail: z
    .string()
    .trim()
    .min(1, "Enter your handle or email")
    .max(254),
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "OTP must be 6 digits"),
  newPassword: PASSWORD,
});

// ── Rooms ────────────────────────────────────────────────────────────────────

/**
 * The client used to send its own user id in the body, which the server then
 * had to check against the session. The id is now taken from the session
 * directly, so these bodies are empty — kept as schemas for future fields.
 */
export const EmptyBodySchema = z.object({}).passthrough().default({});

export const ContactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: EMAIL,
  subject: z.string().trim().min(1, "Subject is required").max(120),
  message: z
    .string()
    .trim()
    .min(10, "Please write at least 10 characters")
    .max(4000, "Message is too long"),
});

export const RematchSchema = z.object({
  /** Carry the original settings but let the requester tweak the duration. */
  durationMinutes: z.coerce
    .number()
    .int()
    .min(MIN_DURATION)
    .max(MAX_DURATION)
    .optional(),
});
