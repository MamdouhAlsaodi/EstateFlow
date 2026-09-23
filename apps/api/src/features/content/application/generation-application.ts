/**
 * EF-403 — safe listing-to-content generation application.
 *
 * Deterministic templates only: there is no LLM, provider call, or free-form
 * text anywhere in this path. A generation command reads the allowlisted
 * property projection, renders the channel template (missing facts become
 * visible placeholders), stamps provenance (property version + template
 * version), and inserts the result as a NORMAL DRAFT that enters the EF-402
 * workflow — review → approval, with no bypass. Owner/Manager/Broker may
 * generate; CLIENT never touches content.
 */

import type { PropertyContentProjection } from "../../properties/domain/content-projection.js";
import {
  createContentItem,
  transitionContentItem,
  CONTENT_AUTHORING_ROLES,
  type ContentChannel,
  type ContentItem,
} from "../domain/content.js";
import {
  listGenerationTemplates,
  renderGenerationTemplate,
  type GenerationTemplateDescriptor,
} from "../domain/generation-template.js";
import type {
  ContentMembership,
  ContentMembershipReader,
  ContentRepository,
} from "./content-repository.js";

export type ContentActor = Readonly<{ verified: boolean }>;

/** Outcome of reading the allowlisted projection for one property. */
export type PropertyProjectionOutcome =
  | { kind: "found"; projection: PropertyContentProjection }
  | { kind: "archived" }
  | { kind: "not-found" };

export interface PropertyProjectionReader {
  findContentProjection(
    organizationId: string,
    propertyId: string,
  ): Promise<PropertyProjectionOutcome>;
}

type CommandBase = Readonly<{
  actor: ContentActor;
  userId: string;
  organizationId: string;
}>;

export type GenerateContentCommand = CommandBase &
  Readonly<{
    contentItemId: string;
    propertyId: string;
    channel: ContentChannel;
    templateVersion?: number;
    createdAt: Date;
  }>;

export type ListGenerationTemplatesCommand = CommandBase;

export type GeneratedContentResult = Readonly<{
  kind: "generated";
  item: ContentItem;
  placeholders: readonly string[];
  templateId: string;
  templateVersion: number;
}>;

export type GenerateContentResult =
  | GeneratedContentResult
  | { kind: "access-denied" }
  | { kind: "not-found"; resource: "property" }
  | { kind: "conflict"; reason: "property-archived" | "generation-race" };

export class GenerationApplication {
  constructor(
    private readonly repository: ContentRepository,
    private readonly membershipReader: ContentMembershipReader,
    private readonly projectionReader: PropertyProjectionReader,
  ) {}

  /** Channel template catalog (deterministic metadata, same for everyone). */
  async listTemplates(
    input: ListGenerationTemplatesCommand,
  ): Promise<
    readonly GenerationTemplateDescriptor[] | { kind: "access-denied" }
  > {
    const access = await this.authorize(input, CONTENT_AUTHORING_ROLES);
    if (access.kind !== "authorized") return access.result;
    return listGenerationTemplates();
  }

  async generateContentDraft(
    input: GenerateContentCommand,
  ): Promise<GenerateContentResult> {
    const access = await this.authorize(input, CONTENT_AUTHORING_ROLES);
    if (access.kind !== "authorized") return access.result;
    const outcome = await this.projectionReader.findContentProjection(
      input.organizationId,
      input.propertyId,
    );
    if (outcome.kind === "not-found")
      return { kind: "not-found", resource: "property" };
    if (outcome.kind === "archived")
      return { kind: "conflict", reason: "property-archived" };
    // Deterministic render: f(projection, channel, templateVersion). Policy
    // violations (legal-claim wording, including inside property values) and
    // unknown channels/versions throw typed errors the boundary maps to 400.
    const rendered = renderGenerationTemplate({
      channel: input.channel,
      ...(input.templateVersion === undefined
        ? {}
        : { templateVersion: input.templateVersion }),
      projection: outcome.projection,
    });
    const item = createContentItem({
      id: input.contentItemId,
      organizationId: input.organizationId,
      title: rendered.title,
      body: rendered.body,
      channel: input.channel,
      sourcePropertyId: outcome.projection.propertyId,
      sourcePropertyVersion: outcome.projection.version,
      generatedTemplateId: rendered.templateId,
      generatedTemplateVersion: rendered.templateVersion,
      createdBy: input.userId,
      createdAt: input.createdAt,
    });
    // The generated item enters the normal workflow as a DRAFT: the audited
    // IDEA → DRAFT transition is part of the same atomic insert, and every
    // later step (review → approval) is the unchanged EF-402 lifecycle.
    const { item: draft, transition } = transitionContentItem(item, {
      toStatus: "DRAFT",
      actorId: input.userId,
      at: input.createdAt,
    });
    const recorded = await this.repository.createGeneratedDraft({
      item: draft,
      transition,
    });
    if (!recorded) return { kind: "conflict", reason: "generation-race" };
    return {
      kind: "generated",
      item: recorded,
      placeholders: rendered.placeholders,
      templateId: rendered.templateId,
      templateVersion: rendered.templateVersion,
    };
  }

  private async authorize(
    input: CommandBase,
    roles: readonly string[],
  ): Promise<
    | { kind: "authorized" }
    | { kind: "denied"; result: { kind: "access-denied" } }
  > {
    if (!input.actor.verified || input.userId.trim().length === 0)
      return { kind: "denied", result: { kind: "access-denied" } };
    const membership: ContentMembership | null =
      await this.membershipReader.findMembership(
        input.organizationId,
        input.userId,
      );
    if (
      !membership ||
      membership.organizationId !== input.organizationId ||
      membership.status !== "ACTIVE" ||
      !roles.includes(membership.role)
    )
      return { kind: "denied", result: { kind: "access-denied" } };
    return { kind: "authorized" };
  }
}
