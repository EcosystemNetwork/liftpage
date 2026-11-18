import { nid } from "./id";
import { jsonFile } from "./json-file";
import { hashPassword } from "./password";
import type { AccountsFile, PublicUser, Role, User } from "./types";

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertAccounts(value: unknown): AccountsFile {
  if (!value || typeof value !== "object") throw new Error("Accounts file is not an object");
  const file = value as AccountsFile;
  if (!Array.isArray(file.users)) throw new Error("Accounts file is missing users");
  file.metrics ??= [];
  return file;
}

const store = jsonFile<AccountsFile>("accounts.json", () => ({ users: [], metrics: [] }), assertAccounts);

let bootstrapped = false;

/**
 * Creates the first admin from LIFTPAGE_ADMIN_EMAIL / LIFTPAGE_ADMIN_PASSWORD
 * when the file has no admin yet. Does nothing once an admin exists.
 */
async function bootstrap() {
  if (bootstrapped) return;
  bootstrapped = true;
  const email = process.env.LIFTPAGE_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.LIFTPAGE_ADMIN_PASSWORD;
  if (!email || !password) return;
  const current = await store.load();
  if (current.users.some((user) => user.role === "admin")) return;
  const passwordHash = await hashPassword(password);
  await store.update((file) => {
    if (file.users.some((user) => user.role === "admin")) return;
    const existing = file.users.find((user) => user.email === email);
    if (existing) {
      existing.role = "admin";
      existing.passwordHash = passwordHash;
      existing.disabled = false;
      existing.sessionVersion += 1;
      return;
    }
    file.users.push(newUser({ email, name: "Owner", company: "LiftPage", role: "admin", passwordHash }));
  });
}

export function hasAdminEnv(): boolean {
  return Boolean(process.env.LIFTPAGE_ADMIN_EMAIL && process.env.LIFTPAGE_ADMIN_PASSWORD);
}

export function newUser(input: { email: string; name: string; company: string; role: Role; passwordHash: string }): User {
  return {
    id: nid("user"),
    ...input,
    createdAt: new Date().toISOString(),
    disabled: false,
    sessionVersion: 1,
  };
}

export function toPublic(user: User): PublicUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, sessionVersion, ...rest } = user;
  return rest;
}

export async function loadAccounts(): Promise<AccountsFile> {
  await bootstrap();
  return store.load();
}

export async function updateAccounts<R = void>(mutate: (file: AccountsFile) => R | Promise<R>): Promise<R> {
  await bootstrap();
  return (await store.update(mutate)).result;
}

export async function findUser(id: string): Promise<User | undefined> {
  return (await loadAccounts()).users.find((user) => user.id === id);
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const key = email.trim().toLowerCase();
  return (await loadAccounts()).users.find((user) => user.email === key);
}

export function signupOpen(): boolean {
  return process.env.LIFTPAGE_OPEN_SIGNUP !== "false";
}
