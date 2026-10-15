# Dependency security remediation

Date: 2026-10-15. Baseline main: `0194b1cdcef558c66e9c4cbf4a2db1cdb298d9e1`.
Scholarship compatibility target: backend `b0d30980e902cbb0cbef37a4d91d7c3cfa2657f5`, frontend `092aac420b6c4afbe31fe31af7495b3d363ccab6`.

## Scope and evidence

Fresh `npm audit --omit=dev --json`: 7 affected packages (6 high, 1 moderate), **67 individual GHSA records**. react-router-dom inherits react-router findings and adds no GHSA. This is dependency metadata, not evidence of successful exploitation. The table's patched column is the **tested remediation version**, not a claim about the first patched release. GHSA links are canonical identifiers; CVE aliases are not guessed.

No application dependency major upgrades, force audit fixes, overrides, Auth Worker/production-configuration/migration changes, live authentication, production requests or real student data. Primary local modifications preserved.

## Versions and dependency chains

| Package | Before | Patched target | Relationship |
| --- | --- | --- | --- |
| axios | 1.16.1 | 1.20.0 | Direct |
| brace-expansion | 5.0.6 | 5.0.12 | Transitive |
| dompurify | 3.4.5 | 3.4.16 | Direct |
| form-data | 4.0.5 | 4.0.6 | Transitive |
| react-router | 7.12.0 | 7.18.2 | Transitive |
| react-router-dom | 7.12.0 | 7.18.2 | Direct |
| undici | 7.28.0 | 7.29.1 | Transitive |

Axios/Router need minor updates within their existing major to cover all advisories; DOMPurify/form-data/brace-expansion/undici use patch updates. Transitive constraints already permit the patched versions; do not add them as direct app dependencies.

### axios

Direct dependency; no application import or transitive consumer found. Installed in production npm tree; browser and Worker inclusion checked below. Node HTTP/HTTP2/proxy/data URI and serializer advisories require a consumer and attacker-controlled input; prototype gadgets also require prior prototype pollution. No production exploit demonstrated. Retained and upgraded for compatibility.

### brace-expansion

Transitive: @google/genai > google-auth-library > gaxios > rimraf > glob > minimatch > brace-expansion (also gcp-metadata/gtoken branches). Build-only workbox-build also shares v5. Vulnerabilities require attacker-controlled expansion patterns; no application API exposing glob patterns found. Worker graph checked below; Node SDK/tools remain consumers. Old v1/v2 dev instances are distinct from these v5 advisories.

### dompurify

Direct and transitive via jspdf > dompurify. Browser PDF-export dependency, not the AI Markdown renderer. utils/pdfExport.ts uses text/autoTable, not doc.html(); application does not call IN_PLACE/setConfig/hooks/custom-element/Trusted Types sanitization. Advisory-specific modes not found reachable in current app; future/optional jsPDF HTML mode still warrants patching. No demonstrated production XSS.

### form-data

Transitive: axios > form-data, and groq-sdk > @types/node-fetch > form-data. Node multipart serialization only; browser FormData is native. No application use of this library with attacker-supplied field names/filenames found. Groq uses formdata-node at runtime; a types-package chain does not prove runtime execution. CRLF injection preconditions are not established in production.

### react-router

Transitive: react-router-dom > react-router. BrowserRouter SPA in legacy-entry.tsx/recovery-entry.tsx; Worker serves static assets and its own API routes, no React Router framework SSR/RSC/action/single-fetch/manifest/prerender server. Navigation/backslash handling and route matching are relevant client surfaces; SSR/RSC-only preconditions are absent from current entrypoints. No production exploit demonstrated.

### react-router-dom

Direct. npm marks this package through react-router, not a separate GHSA; same SPA reachability and patch as react-router.

### undici

Transitive: cheerio > undici (production Node server/api-handlers/cron.js and scripts/hub-roster-parser.mjs). Worker uses cheerio/slim, which excludes fetch/undici; browser does not import it. App uses load(html), not undici cache/retry/dump interceptors, BalancedPool, cookie helpers or WebSocketStream. Network fetch/WebSocket advisories require those paths; no production exploit demonstrated. Dev-only miniflare pins its own undici; separately audited below. Node built-in fetch uses its bundled undici and is not upgraded by npm.

## Individual advisories

Each row inherits the dependency chain/runtime assessment for its package above. All rows are remediated in the production npm dependency tree by that package’s tested patched target; dev-only copies are assessed below. A high package aggregate does not mean every advisory is high.

| Package / advisory | Severity | Affected range reported by npm | Patched target | Issue / required surface |
| --- | --- | --- | --- | --- |
| axios: [GHSA-xj6q-8x83-jv6g](https://github.com/advisories/GHSA-xj6q-8x83-jv6g) | moderate | `>=1.15.2 <1.18.0` | 1.20.0 | Axios: Prototype pollution auth subfields can inject Basic auth |
| axios: [GHSA-mmx7-hfxf-jppx](https://github.com/advisories/GHSA-mmx7-hfxf-jppx) | moderate | `>=1.0.0 <1.18.0` | 1.20.0 | Axios: Prototype pollution gadgets can alter axios request construction |
| axios: [GHSA-pmv8-rq9r-6j72](https://github.com/advisories/GHSA-pmv8-rq9r-6j72) | moderate | `>=1.0.0 <1.18.0` | 1.20.0 | Axios: Deep formToJSON Key Recursion Can Cause Denial of Service |
| axios: [GHSA-mwf2-3pr3-8698](https://github.com/advisories/GHSA-mwf2-3pr3-8698) | moderate | `>=1.13.0 <1.18.0` | 1.20.0 | Axios: HTTP/2 streamed uploads bypass maxBodyLength |
| axios: [GHSA-gcfj-64vw-6mp9](https://github.com/advisories/GHSA-gcfj-64vw-6mp9) | high | `>=1.15.2 <1.18.0` | 1.20.0 | Axios Node HTTP adapter can use an inherited proxy after interceptor config cloning |
| axios: [GHSA-7q8q-rj6j-mhjq](https://github.com/advisories/GHSA-7q8q-rj6j-mhjq) | moderate | `>=1.0.0 <1.18.0` | 1.20.0 | Axios: Nested axios option objects can consume polluted prototype values |
| axios: [GHSA-jqh4-m9w3-8hp9](https://github.com/advisories/GHSA-jqh4-m9w3-8hp9) | moderate | `>=1.7.0 <1.18.0` | 1.20.0 | Axios: Fetch adapter ReadableStream uploads bypass maxBodyLength |
| axios: [GHSA-f4gw-2p7v-4548](https://github.com/advisories/GHSA-f4gw-2p7v-4548) | moderate | `>=1.15.0 <1.18.0` | 1.20.0 | Axios: NO_PROXY bypass for 0.0.0.0 local addresses in axios |
| axios: [GHSA-42h9-826w-cgv3](https://github.com/advisories/GHSA-42h9-826w-cgv3) | moderate | `>=1.0.0 <1.18.0` | 1.20.0 | Axios: Excessive recursion in formDataToJSON can cause denial of service |
| axios: [GHSA-hcpx-6fm6-wx23](https://github.com/advisories/GHSA-hcpx-6fm6-wx23) | moderate | `>=1.15.1 <1.18.0` | 1.20.0 | Axios form serializer maxDepth bypass via {} metatoken |
| axios: [GHSA-vh66-26gq-q6x8](https://github.com/advisories/GHSA-vh66-26gq-q6x8) | moderate | `>=1.7.0 <1.20.0` | 1.20.0 | Axios: Prototype pollution gadget in fetch adapter can alter outbound requests |
| axios: [GHSA-9fr6-4gfg-395g](https://github.com/advisories/GHSA-9fr6-4gfg-395g) | moderate | `>=1.0.0 <1.20.0` | 1.20.0 | Axios: Prototype-Pollution Gadget in the Default Instance Allows Inherited Object.prototype.method to Override HTTP Method |
| axios: [GHSA-c29m-xwm3-cm6r](https://github.com/advisories/GHSA-c29m-xwm3-cm6r) | high | `>=1.16.1 <1.20.0` | 1.20.0 | Axios: ReDoS in fromDataURI data: URL parser freezes the Node event loop (DoS) |
| axios: [GHSA-mghh-pgcx-3jjj](https://github.com/advisories/GHSA-mghh-pgcx-3jjj) | high | `>=1.15.0 <1.20.0` | 1.20.0 | Axios: ReDoS (O(N²)) in shouldBypassProxy host normalization, reachable via untrusted redirect Location |
| axios: [GHSA-x97p-jq2g-jp4f](https://github.com/advisories/GHSA-x97p-jq2g-jp4f) | high | `>=1.15.1 <1.20.0` | 1.20.0 | Axios: Prototype Pollution Gadget in axios toFormData Options |
| axios: [GHSA-3pq3-5fj3-cg6v](https://github.com/advisories/GHSA-3pq3-5fj3-cg6v) | high | `>=1.13.0 <1.20.0` | 1.20.0 | Axios: HTTP/2 adapter bypasses configured DNS lookup and proxy controls |
| axios: [GHSA-542g-h47m-68v8](https://github.com/advisories/GHSA-542g-h47m-68v8) | high | `>=1.13.0 <1.20.0` | 1.20.0 | Axios: Denial of Service via Unhandled 'error' Event in HTTP/2 ClientHttp2Session Initialization |
| axios: [GHSA-j8rh-479h-cp32](https://github.com/advisories/GHSA-j8rh-479h-cp32) | moderate | `>=1.0.0 <1.20.0` | 1.20.0 | Axios: Header Injection via Inherited headers After Minimal Interceptor |
| axios: [GHSA-4hqw-qxg8-jxx2](https://github.com/advisories/GHSA-4hqw-qxg8-jxx2) | moderate | `>=1.12.0 <1.20.0` | 1.20.0 | Axios: Fetch Adapter Header Injection via Inherited FormData getHeaders |
| axios: [GHSA-m8m8-qj5v-23w3](https://github.com/advisories/GHSA-m8m8-qj5v-23w3) | high | `>=1.15.2 <1.20.0` | 1.20.0 | Axios: Node HTTP adapter prototype-pollution gadget allows request socket hijack via inherited createConnection |
| axios: [GHSA-44g4-m2mj-wpvx](https://github.com/advisories/GHSA-44g4-m2mj-wpvx) | moderate | `>=1.15.0 <1.20.0` | 1.20.0 | Axios: CIDR-form NO_PROXY entries are ignored, causing proxy exclusion bypass for internal IP ranges |
| brace-expansion: [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) | high | `>=3.0.0 <5.0.7` | 5.0.12 | brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups |
| brace-expansion: [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) | high | `>=4.0.0 <5.0.8` | 5.0.12 | brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash |
| brace-expansion: [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) | high | `>=4.0.0 <5.0.9` | 5.0.12 | brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation |
| brace-expansion: [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | moderate | `>=4.0.0 <5.0.12` | 5.0.12 | brace-expansion: Quadratic-time expansion of the {a},b} rewrite causes CPU denial of service |
| brace-expansion: [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | high | `>=4.0.0 <5.0.11` | 5.0.12 | brace-expansion: DoS via uncontrolled recursion on nested brace groups causing stack exhaustion |
| brace-expansion: [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | high | `>=4.0.0 <5.0.10` | 5.0.12 | brace-expansion: DoS via uncontrolled recursion in parseCommaParts causing stack exhaustion |
| dompurify: [GHSA-hpcv-96wg-7vj8](https://github.com/advisories/GHSA-hpcv-96wg-7vj8) | moderate | `<=3.4.5` | 3.4.16 | DOMPurify: Cross-realm IN_PLACE sanitization leaves executable markup intact via realm-bound instanceof checks |
| dompurify: [GHSA-r47g-fvhr-h676](https://github.com/advisories/GHSA-r47g-fvhr-h676) | moderate | `<=3.4.5` | 3.4.16 | DOMPurify: IN_PLACE mode preserves attributes of a clobbered root element, allowing XSS via attacker-controlled root DOM |
| dompurify: [GHSA-rp9w-3fw7-7cwq](https://github.com/advisories/GHSA-rp9w-3fw7-7cwq) | moderate | `<=3.4.6` | 3.4.16 | DOMPurify IN_PLACE Sanitization Bypass via Attached Shadow Root Inside <template>.content |
| dompurify: [GHSA-cmwh-pvxp-8882](https://github.com/advisories/GHSA-cmwh-pvxp-8882) | moderate | `<=3.4.10` | 3.4.16 | DOMPurify: Permanent ALLOWED_ATTR pollution via setConfig() bypassing the hook clone-guard (incomplete fix of the 3.4.7 hook-pollution patch) |
| dompurify: [GHSA-vxr8-fq34-vvx9](https://github.com/advisories/GHSA-vxr8-fq34-vvx9) | low | `<3.4.9` | 3.4.16 | DOMPurify: Trusted Types policy survives clearConfig() and can poison later RETURN_TRUSTED_TYPE output |
| dompurify: [GHSA-gvmj-g25r-r7wr](https://github.com/advisories/GHSA-gvmj-g25r-r7wr) | low | `>=3.0.0 <=3.4.7` | 3.4.16 | DOMPurify: SAFE_FOR_TEMPLATES bypass - template expressions survive sanitization inside <template> content when using DOM output modes |
| dompurify: [GHSA-x4vx-rjvf-j5p4](https://github.com/advisories/GHSA-x4vx-rjvf-j5p4) | low | `<=3.4.6` | 3.4.16 | DOMPurify: IN_PLACE mode trusts attacker-controlled nodeName on live non-form nodes, allowing script retention and XSS via attacker-supplied DOM objects |
| dompurify: [GHSA-76mc-f452-cxcm](https://github.com/advisories/GHSA-76mc-f452-cxcm) | moderate | `<3.4.7` | 3.4.16 | DOMPurify: Hook mutation of data.allowedTags / data.allowedAttributes permanently pollutes DEFAULT_ALLOWED_TAGS / DEFAULT_ALLOWED_ATTR |
| dompurify: [GHSA-55q2-fjhq-7xh7](https://github.com/advisories/GHSA-55q2-fjhq-7xh7) | moderate | `<=3.4.12` | 3.4.16 | DOMPurify: IN_PLACE hook removal leaves a detached subtree executable, causing XSS |
| dompurify: [GHSA-c2j3-45gr-mqc4](https://github.com/advisories/GHSA-c2j3-45gr-mqc4) | low | `<=3.4.11` | 3.4.16 | DOMPurify: CUSTOM_ELEMENT_HANDLING bypasses afterSanitizeElements for allowed custom elements. |
| dompurify: [GHSA-6688-9rhm-gjv2](https://github.com/advisories/GHSA-6688-9rhm-gjv2) | low | `<=3.4.15` | 3.4.16 | DOMPurify: IN_PLACE returns a force-removed rawtext root whose text carries attacker markup — pure HTML reparse executes |
| form-data: [GHSA-hmw2-7cc7-3qxx](https://github.com/advisories/GHSA-hmw2-7cc7-3qxx) | high | `>=4.0.0 <4.0.6` | 4.0.6 | form-data: CRLF injection in form-data via unescaped multipart field names and filenames |
| react-router: [GHSA-49rj-9fvp-4h2h](https://github.com/advisories/GHSA-49rj-9fvp-4h2h) | high | `>=7.0.0 <=7.14.1` | 7.18.2 | React Router's vendored turbo-stream v2 allows arbitrary constructor invocation via TYPE_ERROR deserialization leading to Unauth RCE |
| react-router: [GHSA-8646-j5j9-6r62](https://github.com/advisories/GHSA-8646-j5j9-6r62) | high | `>=7.7.0 <7.13.2` | 7.18.2 | React Router vulnerable to XSS in unstable RSC redirect handling via javascript: redirect targets |
| react-router: [GHSA-8x6r-g9mw-2r78](https://github.com/advisories/GHSA-8x6r-g9mw-2r78) | high | `>=7.0.0 <7.15.0` | 7.18.2 | React Router vulnerable to DoS via unbounded path expansion in __manifest endpoint |
| react-router: [GHSA-rxv8-25v2-qmq8](https://github.com/advisories/GHSA-rxv8-25v2-qmq8) | high | `>=7.0.0 <7.14.0` | 7.18.2 | React Router vulnerable to Denial of Service via reflected user input in single-fetch |
| react-router: [GHSA-84g9-w2xq-vcv6](https://github.com/advisories/GHSA-84g9-w2xq-vcv6) | low | `>=7.12.0 <7.15.1` | 7.18.2 | React Router: Potential CSRF via PUT/PATCH/DELETE document requests |
| react-router: [GHSA-wrjc-x8rr-h8h6](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6) | moderate | `>=6.0.0 <7.18.0` | 7.18.2 | React Router: Open redirect via backslash in <Link> and useNavigate (CVE-2025-68470 bypass) |
| react-router: [GHSA-h8fp-f39c-q6mh](https://github.com/advisories/GHSA-h8fp-f39c-q6mh) | moderate | `>=7.11.0 <7.18.0` | 7.18.2 | React Router: RSCErrorHandler Missing Protocol Validation (XSS) |
| react-router: [GHSA-337j-9hxr-rhxg](https://github.com/advisories/GHSA-337j-9hxr-rhxg) | moderate | `>=6.4.0 <7.18.0` | 7.18.2 | React Router: Arbitrary Constructor Injection via deserializeErrors() in React Router SSR Hydration |
| react-router: [GHSA-chx6-hx7r-mcp5](https://github.com/advisories/GHSA-chx6-hx7r-mcp5) | high | `>=7.0.0 <7.18.0` | 7.18.2 | React Router: Unauthenticated Denial of Service via Inefficient Route Matching |
| react-router: [GHSA-2j2x-hqr9-3h42](https://github.com/advisories/GHSA-2j2x-hqr9-3h42) | moderate | `>=7.0.0 <7.14.1` | 7.18.2 | React Router's same-origin redirect with path starting // causes open redirect via protocol-relative URL reinterpretation |
| react-router: [GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2) | high | `>=7.12.0 <7.18.2` | 7.18.2 | React Router: RSC Mode CSRF Bypass Allows Action Execution Before 400 Response |
| react-router: [GHSA-jjmj-jmhj-qwj2](https://github.com/advisories/GHSA-jjmj-jmhj-qwj2) | moderate | `>=7.9.6 <=7.12.0` | 7.18.2 | React Router: Open redirect leading to XSS |
| react-router: [GHSA-f22v-gfqf-p8f3](https://github.com/advisories/GHSA-f22v-gfqf-p8f3) | moderate | `>=7.5.1 <7.13.2` | 7.18.2 | React Router has stored XSS via unescaped Location header in prerendered redirect HTML |
| undici: [GHSA-8xcm-r25x-g524](https://github.com/advisories/GHSA-8xcm-r25x-g524) | moderate | `>=7.0.0 <7.29.0` | 7.29.1 | undici vulnerable to downstream response desynchronization via retry interceptor |
| undici: [GHSA-4cwx-7wf7-3272](https://github.com/advisories/GHSA-4cwx-7wf7-3272) | high | `>=7.0.0 <7.29.0` | 7.29.1 | undici vulnerable to cross-user information disclosure and parse-time crash via degenerate private cache directives |
| undici: [GHSA-m8rv-5g2x-5cg5](https://github.com/advisories/GHSA-m8rv-5g2x-5cg5) | moderate | `>=7.0.0 <7.29.0` | 7.29.1 | undici vulnerable to CRLF Injection via blob-like body 'type' property |
| undici: [GHSA-jr45-8vmc-qm54](https://github.com/advisories/GHSA-jr45-8vmc-qm54) | moderate | `>=7.0.0 <7.29.0` | 7.29.1 | undici vulnerable to cross-user information disclosure via whitespace around equals in Cache-Control directives |
| undici: [GHSA-v3r7-h72x-cjcm](https://github.com/advisories/GHSA-v3r7-h72x-cjcm) | moderate | `>=7.0.0 <7.29.0` | 7.29.1 | undici vulnerable to cookie attribute injection via unsanitized domain and unparsed setCookie fields |
| undici: [GHSA-3wwx-pv8p-q78v](https://github.com/advisories/GHSA-3wwx-pv8p-q78v) | moderate | `>=7.28.0 <7.29.1` | 7.29.1 | undici vulnerable to Denial of Service via unhandled error in WebSocket permessage-deflate decompression |
| undici: [GHSA-pmjh-fq2x-6v4x](https://github.com/advisories/GHSA-pmjh-fq2x-6v4x) | moderate | `>=7.11.0 <7.29.1` | 7.29.1 | undici vulnerable to Denial of Service via orphaned RetryHandler response body |
| undici: [GHSA-r53p-7pc4-xj5r](https://github.com/advisories/GHSA-r53p-7pc4-xj5r) | low | `>=7.0.0 <7.29.1` | 7.29.1 | undici vulnerable to downstream response splitting via retry interceptor |
| undici: [GHSA-rfgv-xxqx-mfg5](https://github.com/advisories/GHSA-rfgv-xxqx-mfg5) | high | `>=7.0.0 <7.29.1` | 7.29.1 | undici vulnerable to Denial of Service via unrequested WebSocket subprotocol |
| undici: [GHSA-3xpg-4rpp-hhhm](https://github.com/advisories/GHSA-3xpg-4rpp-hhhm) | moderate | `>=7.15.0 <7.29.1` | 7.29.1 | undici vulnerable to Denial of Service via unbounded decompression of compressed responses |
| undici: [GHSA-2jfj-6hjv-fm6j](https://github.com/advisories/GHSA-2jfj-6hjv-fm6j) | moderate | `>=7.0.0 <7.29.1` | 7.29.1 | undici vulnerable to cross-user cookie disclosure via Set-Cookie caching in shared caches |
| undici: [GHSA-2gqq-gqf2-x968](https://github.com/advisories/GHSA-2gqq-gqf2-x968) | low | `>=7.1.0 <7.29.1` | 7.29.1 | undici vulnerable to response truncation via oversized chunked responses in the dump interceptor |
| undici: [GHSA-w293-vg96-wgc3](https://github.com/advisories/GHSA-w293-vg96-wgc3) | high | `>=7.24.1 <7.29.1` | 7.29.1 | undici vulnerable to TLS certificate validation bypass via dropped connect options in BalancedPool |
| undici: [GHSA-8436-99hf-9mmv](https://github.com/advisories/GHSA-8436-99hf-9mmv) | low | `>=7.0.0 <7.29.1` | 7.29.1 | undici vulnerable to caching and replay of unsafe HTTP method responses |
| undici: [GHSA-rx4f-c7p8-82vq](https://github.com/advisories/GHSA-rx4f-c7p8-82vq) | moderate | `>=7.0.0 <7.29.1` | 7.29.1 | undici vulnerable to Denial of Service via WebSocketStream unclean close |

## Additional build/development findings

The expanded audit after the production fixes found 23 additional GHSA records (besides the 15 undici records already catalogued above). Compatible fixes were applied to 20 of these. All versions below remain within the existing parent constraints; updated tsx 4 owns its tested esbuild 0.28 upgrade. No application dependency major or Wrangler/Miniflare upgrade was introduced.

| Package / advisory | Severity | Affected range | Before → installed | Chain / disposition |
| --- | --- | --- | --- | --- |
| @babel/core: [GHSA-4x5r-pxfx-6jf8](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) | low | `<=7.29.0` | 7.29.0 → 7.29.7 | @vitejs/plugin-react@5.2.0 > @babel/core@7.29.7; PATCHED |
| baseline-browser-mapping: [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) | moderate | `>=2.0.0 <2.11.0` | 2.9.11 → 2.11.28 | autoprefixer@10.4.23 > browserslist@4.29.3 > baseline-browser-mapping@2.11.28; PATCHED |
| browserslist: [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx) | high | `<=4.28.6` | 4.28.1 → 4.29.3 | autoprefixer@10.4.23 > browserslist@4.29.3; PATCHED |
| browserslist: [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g) | high | `<=4.28.6` | 4.28.1 → 4.29.3 | autoprefixer@10.4.23 > browserslist@4.29.3; PATCHED |
| esbuild: [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr) | low | `>=0.27.3 <0.28.1` | 0.27.7 → 0.28.2 | vite@6.4.3 > tsx@4.23.15 > esbuild@0.28.2; PATCHED |
| fast-uri: [GHSA-v2hh-gcrm-f6hx](https://github.com/advisories/GHSA-v2hh-gcrm-f6hx) | high | `>=3.0.0 <=3.1.3` | 3.1.2 → 3.1.8 | vite-plugin-pwa@1.3.0 > workbox-build@7.4.1 > ajv@8.20.0 > fast-uri@3.1.8; PATCHED |
| fast-uri: [GHSA-7p8r-x3mc-p8w7](https://github.com/advisories/GHSA-7p8r-x3mc-p8w7) | high | `>=3.0.0 <3.1.5` | 3.1.2 → 3.1.8 | vite-plugin-pwa@1.3.0 > workbox-build@7.4.1 > ajv@8.20.0 > fast-uri@3.1.8; PATCHED |
| fast-uri: [GHSA-f65p-4m7j-42xc](https://github.com/advisories/GHSA-f65p-4m7j-42xc) | high | `>=3.0.0 <3.1.6` | 3.1.2 → 3.1.8 | vite-plugin-pwa@1.3.0 > workbox-build@7.4.1 > ajv@8.20.0 > fast-uri@3.1.8; PATCHED |
| fast-uri: [GHSA-fph4-wmhf-6fwf](https://github.com/advisories/GHSA-fph4-wmhf-6fwf) | high | `>=3.1.2 <3.1.6` | 3.1.2 → 3.1.8 | vite-plugin-pwa@1.3.0 > workbox-build@7.4.1 > ajv@8.20.0 > fast-uri@3.1.8; PATCHED |
| fast-uri: [GHSA-jqff-g426-hqxp](https://github.com/advisories/GHSA-jqff-g426-hqxp) | high | `>=3.0.0 <3.1.6` | 3.1.2 → 3.1.8 | vite-plugin-pwa@1.3.0 > workbox-build@7.4.1 > ajv@8.20.0 > fast-uri@3.1.8; PATCHED |
| fast-uri: [GHSA-4c8g-83qw-93j6](https://github.com/advisories/GHSA-4c8g-83qw-93j6) | high | `>=3.0.0 <3.1.3` | 3.1.2 → 3.1.8 | vite-plugin-pwa@1.3.0 > workbox-build@7.4.1 > ajv@8.20.0 > fast-uri@3.1.8; PATCHED |
| fast-uri: [GHSA-qw65-cvwx-89v3](https://github.com/advisories/GHSA-qw65-cvwx-89v3) | high | `>=3.0.0 <3.1.7` | 3.1.2 → 3.1.8 | vite-plugin-pwa@1.3.0 > workbox-build@7.4.1 > ajv@8.20.0 > fast-uri@3.1.8; PATCHED |
| fast-uri: [GHSA-hrr3-gc8f-f4qj](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj) | moderate | `>=3.0.0 <3.1.8` | 3.1.2 → 3.1.8 | vite-plugin-pwa@1.3.0 > workbox-build@7.4.1 > ajv@8.20.0 > fast-uri@3.1.8; PATCHED |
| nanoid: [GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv) | high | `<3.3.16` | 3.3.12 → 3.3.20 | postcss@8.5.23 > nanoid@3.3.20; PATCHED |
| nanoid: [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8) | high | `<3.3.18` | 3.3.12 → 3.3.20 | postcss@8.5.23 > nanoid@3.3.20; PATCHED |
| postcss: [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) | moderate | `<=8.5.22` | 8.5.15 → 8.5.23 | postcss@8.5.23; PATCHED |
| postcss: [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) | high | `<=8.5.17` | 8.5.15 → 8.5.23 | postcss@8.5.23; PATCHED |
| sharp: [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) | high | `<0.35.4` | 0.35.2 → 0.35.2 | wrangler@4.115.0 > miniflare@4.20260722.1 > sharp@0.35.2; DEFERRED: see mitigation below |
| sharp: [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) | high | `<0.35.5` | 0.35.2 → 0.35.2 | wrangler@4.115.0 > miniflare@4.20260722.1 > sharp@0.35.2; DEFERRED: see mitigation below |
| source-map-js: [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | high | `>=1.0.0 <1.2.2` | 1.2.1 → 1.2.2 | postcss@8.5.23 > source-map-js@1.2.2; PATCHED |
| uuid: [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | moderate | `<11.1.1` | 8.3.2 → 8.3.2 | exceljs@4.4.0 > uuid@8.3.2; DEFERRED: see mitigation below |
| vite: [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) | moderate | `<=6.4.2` | 6.4.2 → 6.4.3 | vite@6.4.3; PATCHED |
| vite: [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) | high | `<=6.4.2` | 6.4.2 → 6.4.3 | vite@6.4.3; PATCHED |

### Residual toolchain risk and mitigation

Full `npm audit` remains **FAIL: 6 affected dev packages (3 high / 3 moderate)**: miniflare, sharp, its nested undici, wrangler (inherited), uuid and exceljs (inherited). These represent **18 underlying GHSA records**: the 15 undici records above, two Sharp records and one uuid record. They are not present in the production-only audit.

- **Miniflare 4 / Sharp / undici:** stable Miniflare 4 releases up to 4.20260730.0 still pin sharp 0.35.2 and undici 7.28.0. Sharp needs ≥0.35.5; undici needs ≥7.29.1. Current Wrangler 4.115.0 is preserved. Registry inspection found Wrangler 4.151.0 points to Miniflare **5 beta**; migrating the emulated runtime needs separate compatibility review. Do not replace exact pins via overrides. Keep emulators on loopback with synthetic fixtures; do not expose emulated image/network services to untrusted users or use their caches across identities. Scholarship runtime tests use isolated ephemeral D1 and controlled requests. This mitigates exposure, not the vulnerable installation itself.
- **ExcelJS 4.4.0 > uuid 8.3.2:** uuid fixes the custom-buffer v3/v5/v6 issue at 11.1.1. ExcelJS currently calls only `uuidv4()` without a buffer (`lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js`), so that vulnerable path was not found reachable. The suggested audit downgrade to ExcelJS 3.4.0 is rejected: it changes the importer major and does not establish compatibility. Preserve import behavior; process only trusted, bounded files in isolated local tools until an upstream compatible migration is reviewed.
- **Node built-in fetch:** validation host Node 24.12.0 reports bundled undici 7.16.0. npm package updates do not patch Node itself. Do not infer a patched production Node runtime from the package audit; any Node-hosted legacy service requires its own supported-runtime/security review. Cloudflare Worker fetch is a separate runtime. No machine-wide runtime changes were made.

The locked production undici 7.29.1 is split from Miniflare’s exact dev pin 7.28.0; npm update initially kept the shared vulnerable version. Registry tarball/integrity metadata and the parent constraints were checked, then clean installation/tree validation were required. npm lock-only updates also dropped baseline optional WASM metadata; both original @emnapi/core and @emnapi/wasi-threads entries were restored after npm ci caught the missing entry. These platform entries are preserved, not hidden by disabling optional packages.

## Bundle and runtime evidence

Independent of npm dev/prod labels, the production Vite module graph for the complete Scholarship candidate contains the patched DOMPurify (jsPDF dynamic HTML support) and React Router core. react-router-dom is a reexport wrapper; its core code is in the browser bootstrap. **No rendered browser module** from axios, brace-expansion, form-data, undici, ExcelJS, uuid, Miniflare, Sharp or Wrangler was found. Excel export uses the existing custom ZIP implementation; ExcelJS consumers found in source are scripts/tests only.

Wrangler esbuild metadata for **both** main and the integrated Scholarship Worker contains **none** of the 12 packages checked above, including external npm imports. Google GenAI resolves to its web entrypoint, excluding google-auth-library/gaxios/glob; Cheerio resolves to browser/slim parsing without undici. The external Worker import is cloudflare:workers. Thus the residual emulator/native-image/ExcelJS packages are local tooling in these observed entrypoints. Any separately hosted legacy Node service still requires runtime review; package installation does not prove a vulnerable API is called.

Proof artifacts (raw audits, installed npm tree, Vite module provenance, both Worker metafiles and command logs) remain ignored under .cache/dependency-security in the isolated worktrees. They contain no student-source import.

## Actual validation

Windows, Node 24.12.0, npm 11.6.2; repository CI targets Node 22.

| Check | Main security implementation | Integrated Scholarship candidate |
| --- | --- | --- |
| npm ci | PASS: 938 packages, dev/optional included, normal lifecycle scripts | Identical lock verified; used the same frozen installation for validation |
| npm audit --omit=dev | PASS: 0 vulnerabilities (JSON and final human output) | Identical dependency lock |
| npm audit (all) | FAIL: 6 dev packages, 3 high / 3 moderate, detailed above | Identical dependency lock |
| npm ls (installed tree) | PASS, no problems, no overrides | Same resolved dependencies |
| npm run typecheck | PASS | PASS |
| npm run cf:typecheck | PASS, also rerun with the committed baseline declarations | PASS with committed declarations |
| npm run test:scholarships | Not present on main | 34/34 PASS |
| npm run test:scholarships:frontend | Not present on main | 32/32 PASS |
| npm test / npm run test | **891/891 PASS** | **925/925 PASS** |
| npm run build | PASS | PASS |
| npm run cf:check | PASS, dry-run only | PASS, dry-run only |

Both full suites have zero failures, cancellations or skips. npm test and npm run test execute the same script; no duplicate full run is claimed. There is **no npm run cf script**; the actual cf:typecheck and cf:check commands above cover the intended checks. Build retains the existing large-chunk warning; it is not treated as a test failure or a deploy authorization. Generated Worker declarations were restored to the original tracked files; no binding/flag/Auth Worker change is included.

The five new regressions are included in both full suites and separately passed: SPA/query/encoded login-return routing; local Axios/undici JSON and multipart including **CRLF header escaping**; Vietnamese HTML parsing and normal glob expansion; actual jsPDF/autoTable PDF output; actual AIMessageContent rendering rejecting raw HTML/javascript links while retaining safe links/GFM tables. Updated tsx 4.23.15 also passed real TypeScript execution with its own esbuild 0.28.2. Existing full suites cover Better Auth bridges/identity/authorization, AI Advisor, document ingestion, Worker routes and Scholarship publication/filter/import workflows using local/synthetic fixtures.

Additional **real Chrome headless test: 1/1 PASS** (tests/ai-text-documents.browser.test.ts): actual Admin document UI, table preview, draft/index/explicit publish/revision history and 1280px/390px responsive checks against an ephemeral synthetic fixture, without provider/deployment. Interactive CUA had two timeouts; manual Scholarship browser and live Google/email/OTP were **not** rerun or certified in this dependency task. No live authentication claim follows from synthetic regression tests.

An early baseline install was interrupted after stalling. The first final clean install caught the optional WASM lock omission; it failed and was repaired before the successful 938-package install. A transient registry ECONNRESET retried during installation. These earlier attempts are not reported as PASS.

## Integration and release decision

Verified implementation commit: **14e4ed5dbcb96526de4e91afc869d1f945650949**. Local-only integration merge: **37d09870dbdb04b68bb1fd24c9412eab0e41c152**. It contains fetched main **0194b1cdcef558c66e9c4cbf4a2db1cdb298d9e1**, backend **b0d30980e902cbb0cbef37a4d91d7c3cfa2657f5**, frontend **092aac420b6c4afbe31fe31af7495b3d363ccab6** and the security implementation as ancestors. A single package.json test-script conflict was resolved **only in that isolated candidate**, retaining Scholarship, document-tag and security test chains. The dependency lock is identical to the main security branch. Backend PR #91 and stacked frontend PR #94 retain their heads and base relation.

Only package.json, package-lock.json, the new dependency-security runtime test and this report change in the security PR. No application feature/table/filter/API/schema/migration/production configuration/Auth Worker change; Better Auth stays pinned to 1.6.26. Primary pre-existing dirty patch SHA-256 remained identical (78B8CFA9394DC775E783624C1406DBD363C8227496C3D98C5C20B37162F507F9). Unrelated untracked AI documentation remains untouched. Temporary dependency sharing in the local integration worktree is removed after validation; a future independent reproduction should start with npm ci.

**Dependency release assessment: CONDITIONAL.** The requested production dependencies are patched and Scholarship compatibility checks pass. Remaining tooling advisories require owner acceptance of the documented limited exposure or a separately assessed upstream toolchain/ExcelJS migration. No force fix, incompatible downgrade, beta runtime migration or masking override was used. GitHub CI for the final Draft PR is a separate check and is not presumed green from local results.

**No PR/main-branch merge or deployment was performed.** No remote D1 migration, production write, secret change or real student-data import/publication. Empty-data deployment remains a separate owner decision. The existing official-source/per-field republication-authorization blocker for real Scholarship data remains **BLOCKED**; dependency remediation is not legal clearance.
