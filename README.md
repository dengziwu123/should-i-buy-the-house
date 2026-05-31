# Should I Buy The House

A Next.js MVP that analyzes a US property address and purchase price, then returns a balanced investment verdict with grounded pros, cons, assumptions, caveats, and sources.

## Run

```bash
npm install
npm run dev
```

The local `RENTCAST_API_KEY` is optional. Without it, the app still returns a transparent low-confidence report using public/open-data fallbacks and clearly labeled assumptions.

The local `OPENAI_API_KEY` is also optional. With it, the app asks OpenAI's Responses API for a grounded JSON pros/cons narrative. Without it, the same structured facts are converted into a deterministic fallback report.

## Test

```bash
npm test
```
