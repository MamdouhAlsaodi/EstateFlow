"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CONTENT_CHANNELS,
  type GeneratedDraft,
  type GenerationTemplatesResponse,
  type GenerationSlot,
} from "./content-contract";
import { splitPlaceholderSegments } from "./content-contract";
import {
  contentChannelLabels,
  generationPanelIntro,
  generationProvenanceLabel,
  generationSlotLabels,
} from "./content-labels";
import { fetchGenerationTemplates, generateContentDraft } from "./content-api";
import styles from "./content-views.module.css";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * EF-403 — Arabic generate-to-review flow. A generate button scoped to one
 * property: the deterministic template renders a DRAFT whose missing facts
 * are highlighted placeholders; the draft enters the normal review queue and
 * the provenance stamp (property version + template version) is shown.
 */
export function ContentGenerationPanel({
  organizationId,
}: Readonly<{ organizationId: string }>) {
  const [templates, setTemplates] =
    useState<GenerationTemplatesResponse | null>(null);
  const [channel, setChannel] = useState<string>("INSTAGRAM");
  const [propertyId, setPropertyId] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<GeneratedDraft | null>(null);

  const refreshTemplates = useCallback(async () => {
    setError(null);
    try {
      const response = await fetchGenerationTemplates({ organizationId });
      setTemplates(response);
      if (response.items.length > 0) setChannel(response.items[0].channel);
    } catch {
      setError("تعذر تحميل قوالب التوليد من الخادم. حاول مرة أخرى.");
    }
  }, [organizationId]);

  useEffect(() => {
    void refreshTemplates();
  }, [refreshTemplates]);

  const availableChannels =
    templates?.items.map((template) => template.channel) ?? [];

  async function submitGenerate(): Promise<void> {
    if (!UUID.test(propertyId.trim())) {
      setError("أدخل معرّف عقار صحيحاً (UUID).");
      return;
    }
    if (
      !CONTENT_CHANNELS.includes(channel as (typeof CONTENT_CHANNELS)[number])
    ) {
      setError("اختر قناة صحيحة.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      setDraft(
        await generateContentDraft(
          { organizationId },
          { propertyId: propertyId.trim(), channel },
        ),
      );
    } catch (caught) {
      setDraft(null);
      setError(
        caught instanceof TypeError
          ? "تعذر توليد المسودة: تحقق من معرّف العقار وصلاحياتك."
          : "تعذر توليد المسودة. تحقق من بيانات العقار (البيانات المحتوية على وعود قانونية ترفض آلياً).",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="content-generate-title">
      <h2 id="content-generate-title">توليد مسودة من عقار</h2>
      <p>{generationPanelIntro}</p>
      <div className={styles.generationControls}>
        <label>
          معرّف العقار
          <input
            value={propertyId}
            onChange={(event) => setPropertyId(event.target.value)}
            dir="ltr"
            placeholder="00000000-0000-4000-8000-000000000000"
          />
        </label>
        <label>
          قناة النشر
          <select
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
          >
            {(availableChannels.length > 0
              ? availableChannels
              : CONTENT_CHANNELS
            ).map((value) => (
              <option key={value} value={value}>
                {
                  contentChannelLabels[
                    value as keyof typeof contentChannelLabels
                  ]
                }
              </option>
            ))}
          </select>
        </label>
      </div>
      <div
        style={{
          marginTop: "0.75rem",
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <button
          className="button button-primary"
          type="button"
          disabled={pending}
          onClick={() => void submitGenerate()}
        >
          {pending ? "جارٍ التوليد…" : "توليد مسودة"}
        </button>
        <button
          className="button button-secondary"
          type="button"
          disabled={pending}
          onClick={() => void refreshTemplates()}
        >
          تحديث القوالب
        </button>
        <Link
          className="button button-secondary"
          href={`/ar/organizations/${organizationId}/content/review-queue`}
        >
          فتح قائمة المراجعة
        </Link>
      </div>
      {error && (
        <div role="alert" style={{ color: "#b3423a", marginTop: "0.75rem" }}>
          <span>{error}</span>
        </div>
      )}
      {draft && (
        <div className={styles.draftPreview} data-testid="generated-draft">
          <strong>{draft.item.title}</strong>
          <p style={{ margin: 0 }}>
            <PlaceholderText value={draft.item.body} />
          </p>
          {draft.placeholders.length > 0 && (
            <div>
              <p style={{ margin: "0 0 0.4rem" }}>
                عناصر نائبة تحتاج استكمالاً يدوياً قبل الاعتماد:
              </p>
              <div className={styles.slotChips}>
                {draft.placeholders.map((slot) => (
                  <SlotChip key={slot} slot={slot} />
                ))}
              </div>
            </div>
          )}
          <p className={styles.provenanceLine}>
            {generationProvenanceLabel(
              draft.templateId,
              draft.templateVersion,
              draft.item.sourcePropertyVersion ?? 0,
            )}{" "}
            — أُنشئت كمسودة عادية: مراجعة ← اعتماد، بلا أي تجاوز للدورة.
          </p>
        </div>
      )}
    </section>
  );
}

function PlaceholderText({ value }: Readonly<{ value: string }>) {
  return (
    <>
      {splitPlaceholderSegments(value).map((segment, index) =>
        segment.placeholder ? (
          <mark key={index} className={styles.placeholderMark}>
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

function SlotChip({ slot }: Readonly<{ slot: GenerationSlot }>) {
  const label = generationSlotLabels[slot] ?? slot;
  return (
    <span className={styles.slotChip}>
      {label} <span dir="ltr">[{slot}]</span>
    </span>
  );
}
