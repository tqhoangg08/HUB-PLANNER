# AI Advisor diagnostics

Run from the repository root:

```powershell
npm run diagnose:gemini
npm run diagnose:gemini -- --compare-chat-keys
npm run diagnose:gemini -- --model=gemini-3.5-flash-lite
```

The script reads `.env.local`, then `.env`, without overwriting existing process
environment variables. It defaults to `gemini-3.1-flash-lite`, the Worker's
current fallback model; it also prints the local configured model so differences
are visible. Local credentials are not assumed to match deployed secrets.

Each HTTP call has a 12-second deadline covering headers and body, without SDK
retries. Calls are sequential. Inference calls may consume provider quota or incur
normal API charges. No files are uploaded or deleted and no configuration is
modified. Interactions requests set `store: false`.

The optional comparison uses at most four distinct existing chat keys for plain
text requests only. Different keys do not necessarily belong to different Google
projects. Keys, store paths, document IDs, generated answers, and document contents
are omitted from output. Provider errors are sanitized.

## Reading the results

- `plain_generate`: a minimal request without documents, history, system prompt,
  thinking settings, or the application server.
- `plain_interactions`: equivalent control using the previously used API.
- `store_inventory`: document counts and stored bytes.
- `document_metadata`: first page of active public documents with application IDs.
  `truncated: true` means this is not an exhaustive inventory.
- `filtered_file_search`: File Search using up to 12 public document IDs from that
  page. This is a provider/store diagnostic, not the production D1 category and
  visibility authorization check.
- `filtered_interactions`: the same question and filter through the old API.
- `summary`: distinguishes plain-request failure and citation-bearing search.
  A matching metadata ID is not full production authorization or answer validation.

Any failed HTTP probe makes the process exit with code 1; this is expected during
an outage. A skipped search is explicitly marked, not counted as a success.

Interpretation:

| Observation | Next investigation |
| --- | --- |
| Plain requests fail without files | Provider/model/project/network, not document volume alone |
| Plain works, filtered search fails | File Search, store, model/tool compatibility, metadata filter |
| Store reads work but inference fails | Storage/index availability does not establish model availability |
| One key works, another fails | Compare their Google projects, billing, quotas, and restrictions |
| Local works, production fails | Compare deployed model/settings and execution environment |
| HTTP 200 but no valid citations | Inspect grounding format and production D1 source resolution |

## Observed on 2026-09-24

Local direct REST requests to `gemini-3.1-flash-lite` returned 503 for the
File Search key and four distinct chat keys, even with only `Reply only OK`.
The plain Interactions control also returned 503. Store and document listing
requests returned 200: 3 active documents, 0 pending, 0 failed, 27,615,041 bytes.
Filtered GenerateContent File Search returned 503 as well.

These observations reproduce an inference failure independently of the app's
retrieval prompt and uploaded documents. They do not establish a global Google
outage or prove the keys belong to different projects. No production model,
retry policy, source validation, or fallback response was changed.

Before changing production behavior, require a successful comparison that includes
File Search and valid citations; a successful plain request alone is insufficient.
