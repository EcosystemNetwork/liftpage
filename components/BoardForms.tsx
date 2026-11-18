"use client";

import { useActionState, useState } from "react";
import { openBoard, reviewPost, syncNow } from "@/app/actions/boards";
import { PLATFORM_NAME, PLATFORMS, type Status } from "@/lib/types";
import { INPUT, LABEL } from "@/lib/ui";
import { Message, RowButton, Submit } from "./forms";

/** A client's three moves on one post. Changes needs a note; approve only applies to drafts. */
export function ReviewPost({ postId, status, locked }: { postId: string; status: Status; locked: boolean }) {
  const [state, action] = useActionState(reviewPost, undefined);
  const [mode, setMode] = useState<"changes" | "comment" | null>(null);
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {status === "draft" && !locked ? (
          <form action={action}>
            <input type="hidden" name="postId" value={postId} />
            <input type="hidden" name="kind" value="approved" />
            <RowButton>Approve</RowButton>
          </form>
        ) : null}
        {!locked ? (
          <button type="button" onClick={() => setMode(mode === "changes" ? null : "changes")} className="btn-ghost btn-sm">
            Request changes
          </button>
        ) : null}
        <button type="button" onClick={() => setMode(mode === "comment" ? null : "comment")} className="btn-ghost btn-sm">
          Comment
        </button>
      </div>
      {mode ? (
        <form action={action} className="grid gap-2">
          <input type="hidden" name="postId" value={postId} />
          <input type="hidden" name="kind" value={mode} />
          <label className={LABEL}>
            {mode === "changes" ? "What should change?" : "Comment"}
            <textarea name="text" required rows={3} maxLength={1000} className="field py-2.5" />
          </label>
          <Submit busy="Sending" className="justify-self-start">
            {mode === "changes" ? "Send back" : "Post comment"}
          </Submit>
        </form>
      ) : null}
      <Message state={state} />
    </div>
  );
}

export function OpenBoardForm({ clientId, company }: { clientId: string; company: string }) {
  const [state, action] = useActionState(openBoard, undefined);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="clientId" value={clientId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={LABEL}>
          Name
          <input name="name" defaultValue={state?.fields?.name ?? company} required className={INPUT} />
        </label>
        <label className={LABEL}>
          Handle
          <input name="handle" defaultValue={state?.fields?.handle} placeholder="@company" className={INPUT} />
        </label>
      </div>
      <label className={LABEL}>
        Voice
        <textarea name="voice" defaultValue={state?.fields?.voice} required rows={3} className="field py-2.5" />
      </label>
      <label className={LABEL}>
        Offer
        <textarea name="offers" defaultValue={state?.fields?.offers} required rows={2} className="field py-2.5" />
      </label>
      <fieldset className="grid gap-2 text-sm">
        <legend className="mb-2">Platforms</legend>
        <div className="flex flex-wrap gap-3">
          {PLATFORMS.map((platform) => (
            <label key={platform} className="inline-flex min-h-9 items-center gap-2">
              <input type="checkbox" name="platforms" value={platform} defaultChecked />
              {PLATFORM_NAME[platform]}
            </label>
          ))}
        </div>
      </fieldset>
      <Message state={state} />
      <Submit busy="Opening" className="justify-self-start">
        Open a board
      </Submit>
    </form>
  );
}

export function SyncButton({ userId }: { userId?: string }) {
  const [state, action] = useActionState(syncNow, undefined);
  return (
    <form action={action} className="grid gap-2">
      {userId ? <input type="hidden" name="userId" value={userId} /> : null}
      <RowButton>Sync now</RowButton>
      <Message state={state} />
    </form>
  );
}
