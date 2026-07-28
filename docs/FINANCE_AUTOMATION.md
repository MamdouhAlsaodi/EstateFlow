# EstateFlow — Finance Core and Automation Contract

## 1. Purpose

Finance is not a decorative dashboard. It is the auditable operational record connecting Lead → Deal → Commission → Invoice/Receivable → Payment → Campaign outcome.

The core must be reusable by MamtrexS, while real-estate terms remain adapters around shared financial primitives.

## 2. Shared financial model

### Core entities

- `Organization`
- `Account`
- `JournalEntry`
- `JournalLine`
- `Invoice`
- `InvoiceLine`
- `PaymentRecord`
- `Expense`
- `CommissionPlan`
- `CommissionAccrual`
- `FinancialDocument`
- `AccountingPeriod`
- `AuditEvent`

### EstateFlow references

Financial records may reference:

- `property_id`
- `lead_id`
- `deal_id`
- `broker_id`
- `campaign_id`

References are dimensions, not replacements for balanced journal lines.

## 3. Ledger invariants

1. Every posted journal entry balances: total debit equals total credit.
2. Draft entries may be edited; posted entries are immutable.
3. Corrections create a reversal and a replacement entry.
4. Money uses integer minor units plus ISO currency code; never floating point.
5. Every mutation records actor, organization, timestamp, reason, and correlation ID.
6. Period closing prevents ordinary posting into a closed period.
7. A commission cannot become payable without an explicit triggering event.
8. Partial payments reduce the open balance without overwriting invoice history.
9. Reopening a closed period requires Owner permission, written reason, independent finance review before Pilot, and an audit event containing actor, timestamp, reason, and before-period totals. Corrections still use reversal and replacement entries.
10. A configurable maker-checker threshold governs commission transition to payable/posting; no amount is hard-coded before office policy is approved.

## 4. Operational flows

### Closed deal

`Lead closed won` → create Deal → calculate expected commission → manager confirms → commission accrual posted → receivable/invoice created when applicable → payment recorded → commission payable/paid state updated.

### Expense

Expense draft → evidence metadata attached → approval if required → posted journal entry → linked to office, property, or campaign.

### Overdue receivable

Invoice reaches due date with open balance → automation event → reminder draft → approved channel delivery → escalation task if still unpaid.

### Campaign ROI

Campaign spend posted as expenses → Leads attributed → won Deals contribute recognized revenue → dashboard calculates:

- `CPL = campaign spend / leads`
- `CAC = campaign spend / acquired customers`
- `ROI = (attributed revenue - campaign spend) / campaign spend`

Metrics return `not enough data` rather than fake zero when the denominator is absent.

## 5. MVP reports

- Daily/weekly cash-in and cash-out.
- Outstanding receivables by aging bucket.
- Commission expected, due, and paid by broker.
- Revenue and gross margin by Deal/Property.
- Expenses by category and Campaign.
- Campaign spend, Leads, wins, attributed revenue, CPL, CAC, and ROI.
- Owner weekly summary with data freshness timestamp.

## 6. Automation contract

### Rule

```text
Trigger → Conditions → Actions
```

Each rule includes:

- Organization owner.
- Enabled/disabled state.
- Version.
- Trigger type and schema version.
- Conditions.
- Ordered actions.
- Approval policy.
- Cooldown/deduplication policy.
- Failure and escalation policy.

### Execution guarantees

- Transactional outbox publishes domain events after database commit.
- Every execution has an idempotency key.
- The key is deterministically derived from organization, rule/version, event, action, target, and schedule bucket; a database unique constraint rejects terminal-state replays.
- Retries use bounded exponential backoff.
- Permanent failures enter a visible failed/dead-letter state.
- No external message/post is considered sent without provider confirmation.
- Sensitive payloads are redacted from logs.
- All actions create audit events.

## 7. Initial automation library

| ID | Trigger | Action | Approval |
|---|---|---|---|
| AUT-L01 | Lead created | Assign owner, create first-contact task due within SLA | Automatic |
| AUT-L02 | Lead inactive beyond stage SLA | Reminder to broker; escalate to manager after grace period | Automatic |
| AUT-V01 | Viewing confirmed | Schedule reminders at 24h and 1h | Automatic |
| AUT-V02 | Viewing completed | Request outcome and create follow-up task | Automatic |
| AUT-F01 | Receivable due soon | Create payment reminder draft | Human before external send |
| AUT-F02 | Receivable overdue | Notify owner and create collection task | Automatic internal |
| AUT-C01 | Commission becomes due | Notify manager and broker; add payable task | Automatic internal notification; payable posting follows configured maker-checker policy |
| AUT-M01 | Listing approved | Generate channel-specific content drafts | Human approval required |
| AUT-M02 | Content approved and scheduled | Revalidate approved content hash and unchanged channel/schedule configuration, then publish; otherwise return to review | Human approval remains valid only while hash/config are unchanged |
| AUT-M03 | Campaign ends | Generate performance summary | Automatic internal |

## 8. Security and compliance boundary

- EstateFlow financial reports are operational unless a qualified local accounting/tax review approves legal document behavior.
- No payment gateway or bank credential in MVP.
- External provider tokens use a secret store, never database plaintext or repository files.
- Automation permissions cannot exceed the initiating organization and configured service account scope.
- Human approval remains mandatory for external marketing posts and sensitive collection messages in the first pilot.
- Name, phone, email, free-text notes, and precise geo are PII and are redacted from logs. Owner exports hide PII by default and per-field inclusion changes are audited.
- Pilot readiness requires privacy inventory, retention/deletion/exit policy, data-location decision, and qualified review of applicable local obligations; this document is not legal or accounting certification.
