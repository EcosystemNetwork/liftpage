import "server-only";
import { currentUser } from "./dal";
import { HRError } from "./harnessrouter";
import { limited } from "./rate";
import { StudioError, checkUploads, MAX_TEXT, type Upload } from "./studio";
import { AI_HOURLY, canUse } from "./tools";
import type { User } from "./types";

/*
 * Who may use the content studio. Reading your own tasks needs only a sign-in (the store
 * filters by user). Sending the agent anything needs the "studio" tool (admins always have it)
 * and counts against the same hourly AI cap as every other tool.
 */

export async function studioReader(): Promise<User> {
  const user = await currentUser();
  if (!user) throw new StudioError(401, "Sign in first.");
  return user;
}

export async function studioSender(): Promise<User> {
  const user = await studioReader();
  if (!canUse(user, "studio")) throw new StudioError(403, "The content studio isn't switched on for your account. Ask LiftPage.");
  if (await limited(`ai:${user.id}`, AI_HOURLY[user.role], 3_600_000)) {
    throw new StudioError(429, "That's a lot of AI requests this hour. Wait a while.");
  }
  return user;
}

/** The text and files of a request, from multipart form data. */
export async function readRequest(request: Request): Promise<{ text: string; uploads: Upload[] }> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new StudioError(400, "That request couldn't be read. Try again.");
  }
  const text = String(form.get("text") ?? "").trim();
  if (!text) throw new StudioError(400, "Tell the agent what you want to make.");
  if (text.length > MAX_TEXT) throw new StudioError(400, "That's too long. Keep it under 20,000 characters, or attach it as a file.");
  const files = await Promise.all(
    form
      .getAll("files")
      .filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f)
      .map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
  );
  return { text, uploads: checkUploads(files) };
}

/** Runs a route body; errors become plain sentences. Upstream text and ids never leave. */
export async function studioRoute(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof StudioError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof HRError) {
      console.error("studio harnessrouter", error.status, error.code);
      if (error.status === 404) return Response.json({ error: "That file is no longer available." }, { status: 404 });
      if (error.status === 415) return Response.json({ error: "This file has no preview. Download it instead." }, { status: 415 });
      return Response.json({ error: "The content agent had a problem. Try again in a moment." }, { status: 502 });
    }
    console.error("studio", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
