"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { renderSlide, SLIDE, type BrandKit, type Carousel, type VideoScript } from "@/lib/creative";
import { PLATFORM_NAME, PLATFORMS, type Platform } from "@/lib/types";
import { usageLabel, type Usage } from "@/lib/usage-format";

type Item =
  | { id: string; kind: "carousel"; title: string; data: Carousel; usage?: Usage; createdAt: string }
  | { id: string; kind: "video"; title: string; data: VideoScript; usage?: Usage; createdAt: string };

type Draft = { id: string; platform: Platform; hook: string };

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Draws the SVG on a canvas at full size and returns a PNG. */
async function toPng(svg: string): Promise<Blob> {
  const image = new Image();
  image.src = svgUrl(svg);
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = SLIDE.width;
  canvas.height = SLIDE.height;
  canvas.getContext("2d")!.drawImage(image, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't draw the slide."))), "image/png"));
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "slide";

export function CreativeStudio({
  brandId,
  kit,
  creatives,
  drafts,
  removeAction,
}: {
  brandId: string;
  kit: BrandKit;
  creatives: Item[];
  drafts: Draft[];
  removeAction: (data: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<"carousel" | "video">("carousel");
  const [platform, setPlatform] = useState<Platform | "">("");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function make(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/creative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, kind, brief, platform: platform || undefined }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nothing came back.");
      setBrief("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nothing came back.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section aria-labelledby="make" className="panel px-5 py-5">
        <h2 id="make" className="font-semibold">
          Make something
        </h2>
        <form onSubmit={make} className="mt-3 grid gap-3">
          <div className="flex flex-wrap gap-3 text-sm">
            <fieldset className="flex gap-2">
              <legend className="sr-only">Kind</legend>
              {(["carousel", "video"] as const).map((value) => (
                <label key={value} className={`cursor-pointer rounded-full border px-3 py-1 ${kind === value ? "border-ink bg-ink text-canvas" : "border-line text-muted"}`}>
                  <input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} className="sr-only" />
                  {value === "carousel" ? "Carousel" : "Video script"}
                </label>
              ))}
            </fieldset>
            <label className="flex items-center gap-2" htmlFor="creative-platform">
              For
              <select id="creative-platform" value={platform} onChange={(event) => setPlatform(event.target.value as Platform | "")} className="field">
                <option value="">Any network</option>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_NAME[p]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-sm" htmlFor="creative-brief">
            Brief
            <textarea
              id="creative-brief"
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              rows={4}
              placeholder="Five mistakes teams make shipping their first release, and how Acme avoids each. Ends with: book a demo."
              className="field"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy || brief.trim().length < 10} className="btn-primary disabled:opacity-50">
              {busy ? "Writing" : kind === "carousel" ? "Write the carousel" : "Write the script"}
            </button>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
          </div>
        </form>
      </section>

      <section aria-labelledby="made" className="grid gap-4">
        <h2 id="made" className="font-semibold">
          Made for this board
        </h2>
        {creatives.length ? (
          creatives.map((item) => (
            <article key={item.id} className="panel px-4 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">
                  <span className="eyebrow text-muted">{item.kind === "carousel" ? "Carousel" : "Video script"}</span> {item.title}
                </p>
                <div className="flex items-center gap-3">
                  {item.usage?.calls ? <span className="eyebrow text-muted">{usageLabel(item.usage)}</span> : null}
                  <form action={removeAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <button type="submit" className="text-sm text-muted hover:text-danger">
                      Delete
                    </button>
                  </form>
                </div>
              </div>
              {item.kind === "carousel" ? <CarouselView kit={kit} carousel={item.data} drafts={drafts} /> : <ScriptView script={item.data} />}
            </article>
          ))
        ) : (
          <p className="panel px-5 py-6 text-muted">Nothing yet. Write a carousel or a script above.</p>
        )}
      </section>
    </>
  );
}

function CarouselView({ kit, carousel, drafts }: { kit: BrandKit; carousel: Carousel; drafts: Draft[] }) {
  const svgs = useMemo(() => carousel.slides.map((slide, i) => renderSlide(kit, slide, i, carousel.slides.length)), [kit, carousel]);
  const [target, setTarget] = useState("");
  const [status, setStatus] = useState("");

  async function downloadAll() {
    setStatus("Drawing slides…");
    try {
      for (const [i, svg] of svgs.entries()) save(await toPng(svg), `${slug(carousel.title)}-${i + 1}.png`);
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Couldn't draw the slides.");
    }
  }

  /** Same path the desk uses: a signed upload slot, the PUT, then the post gets the path. */
  async function attach(index: number) {
    if (!target) return setStatus("Pick a draft first.");
    setStatus("Uploading…");
    try {
      const png = await toPng(svgs[index]);
      const slot = await fetch("/api/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: target, type: "image/png", size: png.size }) });
      const ticket = (await slot.json().catch(() => ({}))) as { path?: string; signedUrl?: string; type?: string; error?: string };
      if (!slot.ok || !ticket.signedUrl || !ticket.path) throw new Error(ticket.error || "No upload slot.");
      const put = await fetch(ticket.signedUrl, { method: "PUT", headers: { "Content-Type": "image/png", "x-upsert": "false" }, body: png });
      if (!put.ok) throw new Error("The upload didn't go through.");
      const saved = await fetch("/api/posts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: target, mediaPath: ticket.path, mediaType: "image/png" }) });
      if (!saved.ok) throw new Error(((await saved.json().catch(() => ({}))) as { error?: string }).error || "The post didn't save.");
      setStatus(`Slide ${index + 1} is on the draft.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "That didn't work.");
    }
  }

  return (
    <div className="mt-3 grid gap-3">
      <ol className="flex snap-x gap-3 overflow-x-auto pb-2">
        {svgs.map((svg, i) => (
          <li key={i} className="w-48 shrink-0 snap-start">
            {/* eslint-disable-next-line @next/next/no-img-element -- a data: SVG, nothing to optimize */}
            <img src={svgUrl(svg)} alt={`Slide ${i + 1}: ${carousel.slides[i].heading}`} width={SLIDE.width} height={SLIDE.height} className="h-auto w-full rounded-lg border border-line" />
            <div className="mt-1 flex gap-2 text-xs">
              <button type="button" className="link" onClick={async () => save(await toPng(svg), `${slug(carousel.title)}-${i + 1}.png`)}>
                PNG
              </button>
              {drafts.length ? (
                <button type="button" className="link" onClick={() => attach(i)}>
                  Put on draft
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" className="btn-ghost" onClick={downloadAll}>
          Download all
        </button>
        {drafts.length ? (
          <label className="flex items-center gap-2" htmlFor={`target-${carousel.title}`}>
            Draft
            <select id={`target-${carousel.title}`} value={target} onChange={(event) => setTarget(event.target.value)} className="field max-w-xs">
              <option value="">Pick a draft post</option>
              {drafts.map((draft) => (
                <option key={draft.id} value={draft.id}>
                  {PLATFORM_NAME[draft.platform]}: {draft.hook.slice(0, 60)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {status ? (
          <span role="status" className="text-muted">
            {status}
          </span>
        ) : null}
      </div>
      {carousel.caption ? (
        <details className="text-sm">
          <summary className="cursor-pointer">Caption</summary>
          <p className="mt-2 whitespace-pre-wrap">{carousel.caption}</p>
        </details>
      ) : null}
    </div>
  );
}

function ScriptView({ script }: { script: VideoScript }) {
  return (
    <div className="mt-3 grid gap-3 text-sm">
      <p>
        <span className="eyebrow text-muted">Hook · ~{script.seconds}s total</span> <strong>{script.hook}</strong>
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem]">
          <thead className="eyebrow text-muted">
            <tr className="border-b border-line text-left">
              <th className="px-2 py-1 font-normal">At</th>
              <th className="px-2 py-1 font-normal">Say</th>
              <th className="px-2 py-1 font-normal">On screen</th>
              <th className="px-2 py-1 font-normal">Shot</th>
            </tr>
          </thead>
          <tbody>
            {script.beats.map((beat, i) => (
              <tr key={i} className="border-b border-line align-top last:border-0">
                <td className="px-2 py-1 font-mono text-xs text-muted">{beat.at}</td>
                <td className="px-2 py-1">{beat.say}</td>
                <td className="px-2 py-1 font-medium">{beat.onScreen}</td>
                <td className="px-2 py-1 text-muted">{beat.shot}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {script.caption ? (
        <details>
          <summary className="cursor-pointer">Caption</summary>
          <p className="mt-2 whitespace-pre-wrap">{script.caption}</p>
        </details>
      ) : null}
    </div>
  );
}
