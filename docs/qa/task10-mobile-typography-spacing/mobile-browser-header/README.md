# Browser mobile header alignment

The [reported 320px screenshot](reported-before.png) shows Install, Login, and Menu below the brand. The pre-fix browser fixture measured a 118px header at 320px: `mobile-design.css` forced the header wrapper to `flex-direction: column`, while the brand row could wrap because its logo, text, and three touch targets did not fit the inner padding.

The browser header now uses one row at normal 320, 375, 390, and 430 CSS px. Its inner horizontal padding and action gaps are reduced; the brand takes a bounded basis. At 320–389px only the decorative brand subtitle is compacted, and at 320–359px the brand title and login surface use a small local adjustment. The three actions retain 44×44px minimum hit targets. When text is enlarged to 200%, the row may wrap to preserve readable content and access to every action; it does not create horizontal page overflow.

Measured Chromium and WebKit header heights: **64px** at 320, 375, 390, and 430px. Both engines report at least a 2px gap between the brand text and the action group. The old fixture measured **118px** at 320px.

After screenshots: [Chromium 320](after-chromium-320.png), [Chromium 390](after-chromium-390.png), [WebKit 320](after-webkit-320.png), [WebKit 390](after-webkit-390.png). [Chromium](chromium-geometry.json) and [WebKit](webkit-geometry.json) geometry, browser logs, typechecks, and build logs are adjacent.

The tests render the actual `DesktopLayout` mobile-browser header through the existing isolated React fixture for Guest and Student. They block unexpected API writes and check runtime errors. Desktop, standalone/PWA, Auth, and business behavior are unchanged by this scoped CSS patch. The build's existing chunk-size warning remains.

Browser emulation is not physical iPhone Safari acceptance: `REAL_DEVICE_ACCEPTANCE=NOT_VERIFIED`.
