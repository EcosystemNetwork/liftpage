"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { captionPhotoAction, deletePhotoAction, photosAdded, savePhoto } from "@/app/actions/client";
import { formatStamp } from "@/lib/time";
import type { ClientPhoto } from "@/lib/types";
import { KICKER } from "@/lib/ui";
import { Message, RowButton, Submit } from "./forms";

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
const MAX = 25 * 1024 * 1024;

/**
 * A client's photos for LiftPage to use. Files go straight to private storage on signed
 * URLs, a few at a time; each one is recorded once it lands. `clientId` is set when an
 * admin manages a client's library; `readOnly` is the admin's preview of the client view.
 */
export function PhotoLibrary({ photos, clientId, readOnly = false }: { photos: ClientPhoto[]; clientId?: string; readOnly?: boolean }) {
  return (
    <div className="grid gap-4">
      {readOnly ? null : <Uploader clientId={clientId} />}
      {photos.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo) => (
            <li key={photo.id} className="panel grid content-start gap-2 overflow-hidden p-2">
              <a href={photo.url} target="_blank" rel="noopener noreferrer" className="block aspect-square overflow-hidden rounded-lg bg-sunken">
                {/* Signed, short-lived URLs from private storage: next/image would cache them past expiry. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt={photo.caption || "Uploaded photo"} loading="lazy" className="size-full object-cover" />
              </a>
              <p className={`${KICKER} px-1 text-muted`}>{formatStamp(photo.at)}</p>
              {readOnly ? (
                photo.caption ? <p className="px-1 text-sm">{photo.caption}</p> : null
              ) : (
                <PhotoControls photo={photo} />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel px-5 py-6 text-muted">No photos yet. Your shop, your team, your products: anything you&rsquo;d like us to post.</p>
      )}
    </div>
  );
}

function Uploader({ clientId }: { clientId?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState<{ ok?: string; error?: string }>();

  async function upload(file: File): Promise<string | null> {
    // Some phones hand over HEIC with no type; trust the extension then.
    const type = file.type || (/\.hei[cf]$/i.test(file.name) ? "image/heic" : "");
    if (!TYPES.includes(type)) return `${file.name}: photos only (JPEG, PNG, WebP, GIF, HEIC).`;
    if (file.size > MAX) return `${file.name}: over 25 MB.`;
    const response = await fetch("/api/photos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, size: file.size, clientId }),
    });
    const ticket = (await response.json().catch(() => ({}))) as { path?: string; signedUrl?: string; error?: string };
    if (!response.ok || !ticket.signedUrl || !ticket.path) return ticket.error || `${file.name}: no upload slot.`;
    const put = await fetch(ticket.signedUrl, { method: "PUT", headers: { "Content-Type": type, "x-upsert": "false" }, body: file });
    if (!put.ok) return `${file.name}: storage refused it (${put.status}).`;
    const saved = await savePhoto({ path: ticket.path, type, size: file.size, clientId });
    return saved.error ? `${file.name}: ${saved.error}` : null;
  }

  async function onPick(files: FileList | null) {
    const list = [...(files ?? [])].slice(0, 30);
    if (!list.length) return;
    setResult(undefined);
    const errors: string[] = [];
    let done = 0;
    // Three at a time: quick on wifi, gentle on a phone connection.
    const queue = [...list];
    const worker = async () => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        setBusy(`Uploading ${done + 1} of ${list.length}`);
        try {
          const error = await upload(file);
          if (error) errors.push(error);
        } catch {
          errors.push(`${file.name}: the upload dropped. Try it again.`);
        }
        done += 1;
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    const added = list.length - errors.length;
    if (added) await photosAdded(added, clientId);
    setBusy("");
    if (input.current) input.current.value = "";
    setResult(
      errors.length
        ? { error: `${added ? `Added ${added}. ` : ""}${errors.slice(0, 4).join(" ")}${errors.length > 4 ? ` And ${errors.length - 4} more.` : ""}` }
        : { ok: `Added ${added} ${added === 1 ? "photo" : "photos"}. LiftPage can see ${added === 1 ? "it" : "them"} now.` },
    );
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      <label className={`btn-primary justify-self-start ${busy ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
        {busy || "Add photos"}
        <input
          ref={input}
          type="file"
          accept={`${TYPES.join(",")},.heic,.heif`}
          multiple
          disabled={Boolean(busy)}
          onChange={(event) => onPick(event.currentTarget.files)}
          className="sr-only"
        />
      </label>
      <p className="-mt-1 text-xs text-muted">Up to 30 at a time, 25 MB each. Only you and LiftPage can see them.</p>
      <div aria-live="polite">
        <Message state={result} />
      </div>
    </div>
  );
}

function PhotoControls({ photo }: { photo: ClientPhoto }) {
  const [state, run] = useActionState(captionPhotoAction, undefined);
  return (
    <div className="grid gap-2 px-1 pb-1">
      <form action={run} className="grid gap-2">
        <input type="hidden" name="photoId" value={photo.id} />
        <label className="grid gap-1 text-xs text-muted">
          <span className="sr-only">Note for LiftPage</span>
          <input name="caption" maxLength={500} defaultValue={photo.caption} placeholder="Note for us (optional)" className="field min-h-9 text-sm" />
        </label>
        <div className="flex flex-wrap gap-2">
          <Submit busy="Saving" className="btn-sm">
            Save
          </Submit>
        </div>
        {state?.error ? <Message state={state} /> : null}
      </form>
      <form
        action={deletePhotoAction}
        onSubmit={(event) => {
          if (!window.confirm("Delete this photo?")) event.preventDefault();
        }}
      >
        <input type="hidden" name="photoId" value={photo.id} />
        <RowButton tone="heat">Delete</RowButton>
      </form>
    </div>
  );
}
