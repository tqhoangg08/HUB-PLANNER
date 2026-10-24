# Transcript toolbar follow-up

The requested mobile-browser layout now has one contextual primary action and one overflow button. An empty transcript (no subjects, including empty semester shells) offers **Nhập bảng điểm**; a populated transcript offers **Chỉnh sửa**; editing offers **Lưu** because the existing implementation explicitly commits a draft. The menu retains **Hủy chỉnh sửa**. Desktop keeps **Nhập**, **In**, the primary action and the overflow button; an empty transcript avoids duplicating the primary import action and exposes manual editing in the menu. Report remains available in a neutral menu item.

The existing asynchronous save handler retains the draft on failure. A separate alert below the toolbar exposes **Thử lại**, calling that same handler; it is shown only while editing so a discarded draft has no dead retry action. PDF confirmation, upload callback, print/export scope dialog, report form and permissions remain in Dashboard. The toolbar owns presentation/menu state only. Ten existing handler ASTs were compared with `db0ec74657ff22fe029b69f6659fbc66b941e7f2` and are unchanged.

## Measurements and validation

On the actual rendered component, the prior toolbar measured 91.19px at 360/390px with four visible actions and wrapping. The new toolbar measures 61px at those widths, with two actions on one row. Primary/overflow touch areas are 108×44 and 44×44px; desktop has four 44px-high actions. Inter is measured after loading the fixture's real fonts. The title may wrap at narrow widths or enlarged text rather than clipping.

Chromium 155 and WebKit 26.5 each passed three toolbar scenarios on final source, plus two affected Dashboard route regressions (student/guest, normal and 320px reflow, 200% text and text-spacing override). Responsive measurements cover 320/360/375/390/430/768/1440px. Scenarios exercise menu focus, Arrow keys/Home/End, Escape, outside dismissal, print dialog, report dialog, empty-state import confirmation/callback, manual entry, actual draft value editing, failed save/retry, successful save and cancellation. Console/runtime errors and unexpected fixture writes are asserted empty. Transcript/model, Overlay and PDF regressions: **18/18 PASS**. Frontend/Cloudflare typecheck and build: **PASS**, with the existing build chunk-size warning.

WebKit initially exposed blur-to-body before menu click; pointer dismissal now uses the outside listener and does not unmount a menu item before its click. Tab/Shift+Tab continue from the trigger without leaving focus on an unmounted item. The menu chooses available space above/below its trigger, avoids the mobile fixed header and can scroll within the visible viewport. The final interaction tests pass on both engines. The screenshot fixture's global animation suppression initially prevented SweetAlert cleanup; that test restores the real alert animation and waits for actual removal and background-lock cleanup. No production alert or shared Overlay code changed.

[Measurements, source hashes and limits](validation.json) · [Chromium final](transcript-chromium-source-final.log) · [WebKit final](transcript-webkit-source-final.log) · [Model/PDF/Overlay](transcript-model-regression.log).

| View | Before | After |
| --- | --- | --- |
| Browser 360px | [Before](before-360.png) | [After](after-360.png) |
| Browser 390px | — | [Chromium](after-390.png), [WebKit](webkit-after-390.png), [Menu](webkit-menu.png) |
| Desktop 1440px | [Before](before-1440.png) | [After](after-1440.png) |

The standalone implementation remains `MobileDashboardNative` through `MobileLearning`; those files are unchanged. Physical iPhone Safari and the OS file chooser were not tested. This is browser fixture evidence, not a production smoke test. No merge, deployment, production writes, Auth/API/database changes or shared Overlay changes.
