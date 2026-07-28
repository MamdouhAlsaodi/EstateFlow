# EstateFlow — Content and Marketing Automation

## 1. Goal

Turn approved property and campaign data into controlled, measurable content operations without letting automation invent property facts or publish externally without authorization.

## 2. Core entities

- `Campaign`
- `AudienceSegment`
- `ContentItem`
- `ContentVariant`
- `ContentApproval`
- `PublishingSchedule`
- `ChannelConnection`
- `PublishingAttempt`
- `AttributionTouch`
- `PerformanceSnapshot`

## 3. Content lifecycle

```text
idea → draft → review → approved → scheduled → publishing → published
                                                └→ failed → retry/review
```

Cancelled and archived are terminal operational states. A published item is never rewritten in place; edits create a new variant/version.

## 4. Listing-to-content workflow

1. A listing reaches `approved` or `published` readiness.
2. The system reads an allowlisted property-data projection.
3. It generates channel-specific drafts using only verified fields.
4. Missing facts remain explicit placeholders; the system never invents price, location, area, availability, or legal claims.
5. A human reviews text, image selection, CTA, and target channel.
6. Approval stores reviewer, timestamp, content hash, selected channel, schedule, timezone, and adapter-configuration version.
7. Immediately before publication, the system revalidates that content hash and channel/schedule/configuration are unchanged. Any change returns the item to review instead of inheriting stale approval.
8. The channel adapter attempts publication and stores the provider result.
9. Performance is entered manually or synchronized later through an approved API.

## 5. Campaign and attribution

A Campaign contains:

- Name, objective, channel, audience, owner.
- Planned and actual budget.
- Start/end dates.
- UTM source, medium, campaign, content, and term.
- Linked ContentItems, Leads, Deals, expenses, and revenue.

### MVP attribution

- Capture first-touch and last-touch UTM data.
- Preserve a Lead's full touch history.
- Allow an authorized user to mark/refine an unknown source with an audit note.
- Report both first-touch and last-touch results; do not present one as unquestionable truth.

## 6. Initial channel plan

### Phase 1

- Content calendar and manual publishing confirmation.
- Share-ready text/image bundles for WhatsApp and social channels.
- UTM link generation.
- Manual performance entry with source evidence.

### Phase 2

- Approved API adapter for one commercially important channel.
- Scheduled publication, delivery status, retry, and failure visibility.

### Deferred

- Browser automation that violates provider terms.
- Fully autonomous public posting.
- Cross-channel budget optimization before reliable conversion data exists.

## 7. Reuse in MamtrexS

The same engine can manage agency clients by replacing `Property` context with `ClientAccount`, `Brand`, `Service`, and `Deliverable`. Campaign, ContentItem, approval, schedule, attribution, expense, and revenue entities remain shared.

## 8. Pilot dashboard

The office owner should see:

- Content due for review today.
- Approved and scheduled content.
- Failed publishing attempts requiring attention.
- Campaign budget versus actual spend.
- Leads and won Deals by source/campaign.
- CPL, CAC, attributed revenue, and ROI with data-completeness warnings.
