# Report generation

This module turns structured property facts into a grounded report:

- `summary`
- `pros`
- `cons`
- `caveats`

It does not call OpenAI and does not invent missing facts. Every generated item carries the `factIds` and `sourceIds` that support it. Required facts with no value are shown as caveats.

```ts
import { buildGroundedReport } from "./src/lib/report";

const report = buildGroundedReport({
  propertyLabel: "123 Main St",
  overallScore: {
    id: "overall",
    label: "Buyability score",
    value: 74,
    max: 100,
  },
  scores: [
    {
      id: "affordability",
      label: "Affordability",
      value: 82,
      max: 100,
      reason: "monthly cost is within the target range",
    },
  ],
  facts: [
    {
      id: "flood-risk",
      label: "Flood risk",
      valueText: "high",
      polarity: "negative",
      reason: "the property is in a mapped flood zone",
    },
    {
      id: "inspection",
      label: "Inspection result",
      required: true,
    },
  ],
});
```

For future LLM integration, pass a `ReportNarrativeProvider` to `generateGroundedReport`.
The provider receives the deterministic draft and should preserve the same grounding.
