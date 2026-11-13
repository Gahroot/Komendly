import { cookies } from "next/headers";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

// Password hashing configuration
const SALT_LENGTH = 16;
const KEY_LENGTH = 64;
const ITERATIONS = 100000;
const DIGEST = "sha512";

// Session configuration
const SESSION_EXPIRY_DAYS = 30;
const SESSION_COOKIE_NAME = "session_token";

// Hash password using PBKDF2
export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(SALT_LENGTH).toString("hex");
    crypto.pbkdf2(
      password,
      salt,
      ITERATIONS,
      KEY_LENGTH,
      DIGEST,
      (err, derivedKey) => {
        if (err) reject(err);
        resolve(`${salt}:${derivedKey.toString("hex")}`);
      }
    );
  });
}

// Verify password against hash
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(":");
    crypto.pbkdf2(
      password,
      salt,
      ITERATIONS,
      KEY_LENGTH,
      DIGEST,
      (err, derivedKey) => {
        if (err) reject(err);
        resolve(key === derivedKey.toString("hex"));
      }
    );
  });
}

// Generate a secure session token
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Create a new session for a user
export async function createSession(userId: string): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

  await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });

  return token;
}

// Validate a session token and return user if valid
export async function validateSession(token: string) {
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session) {
    return null;
  }

  // Check if session has expired
  if (new Date() > session.expiresAt) {
    await invalidateSession(token);
    return null;
  }

  return { user: session.user, session };
}

// Invalidate a session
export async function invalidateSession(token: string): Promise<void> {
  await prisma.session.delete({ where: { token } }).catch(() => {
    // Session might already be deleted
  });
}

// Set the session cookie
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60,
  });
}

// Get the session token from cookies
export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE_NAME);
  return cookie?.value ?? null;
}

// Delete the session cookie
export async function deleteSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

// Get user by email
export async function getUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
}

// Create a new user
export async function createUser(data: {
  email: string;
  password: string;
  name: string;
}) {
  const hashedPassword = await hashPassword(data.password);

  return prisma.user.create({
    data: {
      email: data.email.toLowerCase(),
      passwordHash: hashedPassword,
      name: data.name,
    },
  });
}

/** The signed-in user from the session cookie only (never an API key). Key management uses this. */
export async function getCookieUser() {
  const token = await getSessionToken();
  if (!token) return null;
  const result = await validateSession(token);
  return result?.user ?? null;
}

/**
 * Current user: the hosted MCP server's agent (request-scoped), else the cookie session (priority), else a personal
 * API key (`Authorization: Bearer kmd_...`). Keys are refused on key management, admin and account/auth routes;
 * revoked/unknown keys resolve to no user. Over the per-key limits it throws a 429 (AdsHttpError).
 */
export async function getCurrentUser() {
  const { currentAgent } = await import("@/lib/agent-keys/context");
  const agent = currentAgent();
  if (agent) return agent.user;
  const cookieUser = await getCookieUser();
  if (cookieUser) return cookieUser;
  return bearerUser();
}

async function bearerUser() {
  const { headers } = await import("next/headers");
  const h = await headers();
  const keys = await import("@/lib/agent-keys/keys");
  const raw = keys.parseBearer(h.get("authorization"));
  if (!raw) return null;
  // Set by middleware for every bearer request (client values are overwritten there).
  const route = h.get(keys.ROUTE_HEADER);
  const path = route?.split(" ")[1];
  if (!route || !path || keys.isRefusedForApiKey(path)) return null;
  const { resolveApiKey, RATE_LIMIT_MESSAGE, JOB_LIMIT_MESSAGE } = await import("@/lib/agent-keys/resolve");
  const result = await resolveApiKey(raw, { via: keys.viaFrom(h.get(keys.CLIENT_HEADER)), job: keys.isJobCreatingRoute(route) });
  if (result.ok) return result.user;
  if (result.reason === "invalid") return null;
  const { AdsHttpError } = await import("@/lib/ads/workspace");
  throw new AdsHttpError(429, result.reason, result.reason === "rate_limited" ? RATE_LIMIT_MESSAGE : JOB_LIMIT_MESSAGE, { upgrade_url: keys.UPGRADE_URL });
}
