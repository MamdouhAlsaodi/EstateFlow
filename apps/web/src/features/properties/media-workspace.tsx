"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createUploadIntent,
  confirmUpload,
  fetchMedia,
  removeMedia,
  setMediaCover,
  uploadMediaBytes,
} from "./media-api";
import {
  formatBytes,
  mediaBytesUrl,
  MEDIA_KIND_LABELS,
  MEDIA_STATUS_LABELS,
  MEDIA_VARIANT_LABELS,
  type MediaItem,
} from "./media-contract";

const IMAGE_CONTENT_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const VIDEO_CONTENT_TYPES: ReadonlySet<string> = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

type UploadStep =
  "idle" | "intent" | "uploading" | "confirming" | "done" | "failed";

const STEP_LABELS: Readonly<Record<Exclude<UploadStep, "idle">, string>> = {
  intent: "طلب رابط رفع موقّع",
  uploading: "رفع مباشر إلى التخزين",
  confirming: "تأكيد والتحقق من البايتات",
  done: "تمت الإضافة إلى الشبكة",
  failed: "فشل الرفع",
};

export function MediaWorkspace({
  organizationId,
  propertyId,
}: Readonly<{ organizationId: string; propertyId: string }>) {
  const [media, setMedia] = useState<readonly MediaItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<UploadStep>("idle");
  const fileInput = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await fetchMedia(organizationId, propertyId);
      setMedia(list.items);
      setError(null);
    } catch {
      setError("تعذر تحميل وسائط العقار");
    }
  }, [organizationId, propertyId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleUpload = useCallback(async () => {
    const file = fileInput.current?.files?.[0];
    if (!file) {
      setError("اختر ملفًا أولًا.");
      return;
    }
    const isImage = IMAGE_CONTENT_TYPES.has(file.type);
    const isVideo = VIDEO_CONTENT_TYPES.has(file.type);
    if (!isImage && !isVideo) {
      setError(
        "الصيغ المدعومة: JPEG أو PNG أو WEBP للصور، و MP4/WEBM/MOV للفيديو.",
      );
      return;
    }
    const limit = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (file.size > limit || file.size < 1) {
      setError("حجم الملف يتجاوز الحد المسموح لنوعه.");
      return;
    }
    const baseName = file.name.split("/").pop() ?? file.name;
    if (
      !/^[A-Za-z0-9._-]{1,120}$/.test(baseName) ||
      baseName.split(".").length !== 2
    ) {
      setError("اسم الملف يجب أن يكون لاتينيًا بامتداد واحد فقط.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setStep("intent");
      const intent = await createUploadIntent({
        organizationId,
        propertyId,
        kind: isImage ? "IMAGE" : "VIDEO",
        contentType: file.type,
        byteSize: file.size,
        fileName: baseName,
      });
      setStep("uploading");
      await uploadMediaBytes({
        organizationId,
        propertyId,
        storageKey: intent.storageKey,
        token: intent.token,
        file,
      });
      setStep("confirming");
      await confirmUpload({
        organizationId,
        propertyId,
        mediaId: intent.mediaId,
        token: intent.token,
      });
      setStep("done");
      if (fileInput.current) fileInput.current.value = "";
      await refresh();
    } catch {
      setStep("failed");
      setError(
        "تعذر إكمال رفع الوسائط — تحقق من الصيغة والحجم ثم أعد المحاولة.",
      );
    } finally {
      setBusy(false);
    }
  }, [organizationId, propertyId, refresh]);

  const handleCover = useCallback(
    async (mediaId: string) => {
      setBusy(true);
      setError(null);
      try {
        await setMediaCover({ organizationId, propertyId, mediaId });
        await refresh();
      } catch {
        setError("تعذر تعيين الغلاف — يجب أن تكون الصورة مؤكدة.");
      } finally {
        setBusy(false);
      }
    },
    [organizationId, propertyId, refresh],
  );

  const handleDelete = useCallback(
    async (mediaId: string) => {
      setBusy(true);
      setError(null);
      try {
        await removeMedia({ organizationId, propertyId, mediaId });
        await refresh();
      } catch {
        setError("تعذر حذف الوسيط.");
      } finally {
        setBusy(false);
      }
    },
    [organizationId, propertyId, refresh],
  );

  const stepOrder: readonly Exclude<UploadStep, "idle">[] = [
    "intent",
    "uploading",
    "confirming",
    "done",
  ];

  return (
    <section className="grid" aria-labelledby="media-heading">
      <h2 id="media-heading">وسائط العقار</h2>
      <p className="meta">
        الرفع يتم عبر نية موقّعة قصيرة العمر وتحميل مباشر إلى التخزين، ثم تأكيد
        يفحص البايتات الفعلية (التوقيع الرقمي للصورة، الأبعاد، الحجم) قبل
        الظهور.
      </p>
      <div className="toolbar">
        <label className="fileLabel">
          <span>اختر صورة أو فيديو</span>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
            disabled={busy}
          />
        </label>
        <button type="button" onClick={handleUpload} disabled={busy}>
          {busy ? "جارٍ التنفيذ…" : "رفع وتأكيد"}
        </button>
      </div>
      {step !== "idle" ? (
        <ol className="steps" aria-label="خطوات الرفع">
          {stepOrder.map((name) => (
            <li
              key={name}
              className={`${"step"} ${step === name ? "stepActive" : ""}`}
              aria-current={step === name ? "step" : undefined}
            >
              {STEP_LABELS[name]}
            </li>
          ))}
        </ol>
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {media.length === 0 ? (
        <p className="meta">لا توجد وسائط بعد.</p>
      ) : (
        <ul className="thumbnails">
          {media.map((item) => (
            <MediaCard
              key={item.mediaId}
              item={item}
              organizationId={organizationId}
              propertyId={propertyId}
              busy={busy}
              onCover={handleCover}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function MediaCard({
  item,
  organizationId,
  propertyId,
  busy,
  onCover,
  onDelete,
}: Readonly<{
  item: MediaItem;
  organizationId: string;
  propertyId: string;
  busy: boolean;
  onCover: (mediaId: string) => void;
  onDelete: (mediaId: string) => void;
}>) {
  const showImage =
    item.kind === "IMAGE" &&
    (item.status === "CONFIRMED" || item.status === "PROCESSING");
  const dimensions =
    item.width && item.height ? `${item.width}×${item.height}` : "—";
  return (
    <li className="thumbCard">
      <div className="thumbFrame">
        {showImage ? (
          // The variant endpoint streams stored bytes; keys stay server-side.
          <img
            className="thumbImage"
            src={mediaBytesUrl(
              organizationId,
              propertyId,
              item.mediaId,
              "THUMB",
            )}
            alt={item.fileName}
            loading="lazy"
          />
        ) : (
          <span className="placeholder" aria-hidden>
            {item.kind === "IMAGE" ? "🖼" : "🎬"}
          </span>
        )}
      </div>
      {item.isCover ? <span className="coverBadge">الغلاف</span> : null}
      <strong>{item.fileName}</strong>
      <span
        className={`meta ${item.status === "PENDING" ? "statusPending" : ""}`}
      >
        {MEDIA_KIND_LABELS[item.kind]} · {MEDIA_STATUS_LABELS[item.status]} ·{" "}
        {dimensions} · {formatBytes(item.byteSize)}
      </span>
      {item.variants.length > 0 ? (
        <span className="meta">
          مشتقات:{" "}
          {item.variants
            .map(
              (variant) =>
                `${MEDIA_VARIANT_LABELS[variant.variant]} ${variant.width}×${variant.height}`,
            )
            .join(" · ")}
        </span>
      ) : null}
      {item.processingNote ? (
        <span className="meta statusProcessing">
          معالجة الفيديو غير مفعّلة في هذه المرحلة.
        </span>
      ) : null}
      <div className="actions">
        {item.kind === "IMAGE" &&
        item.status === "CONFIRMED" &&
        !item.isCover ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onCover(item.mediaId)}
          >
            تعيين كغلاف
          </button>
        ) : null}
        {item.status !== "PENDING" ? null : (
          <span className="meta">أكمل التأكيد لإظهارها.</span>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => onDelete(item.mediaId)}
        >
          حذف
        </button>
      </div>
    </li>
  );
}
