# EventsBoard toolbar follow-up

The [reported desktop view](before-user-reported.png) had a long notice wrapping below the title, a short search field, and wide empty gaps between filter controls. This follow-up uses the requested sentence verbatim, sets it to 12px and one line from 1024px upward, lets search fill the available toolbar space, and groups Filter, Date, Sort, and Refresh with 8px gaps. The 36px desktop control height and 44px mobile controls remain unchanged.

| Browser | Width | Search width | Notice height | Toolbar height | Page overflow |
| --- | ---: | ---: | ---: | ---: | --- |
| Chromium | 390 | 358px | 33.59px (wraps) | 96px | no |
| Chromium | 1024 | 404.25px | 16.80px | 36px | no |
| Chromium | 1440 | 820.25px | 16.80px | 36px | no |
| WebKit | 390 | 358px | 33.59px (wraps) | 96px | no |
| WebKit | 1024 | 398.25px | 16.80px | 36px | no |
| WebKit | 1440 | 814.25px | 16.80px | 36px | no |

[Chromium desktop](chromium-1440.png) · [WebKit desktop](webkit-1440.png) · [Chromium mobile](chromium-390.png) · [WebKit mobile](webkit-390.png). The 1024px screenshots and [Chromium](chromium-geometry.json)/[WebKit](webkit-geometry.json) measurements are saved alongside these. The fixture mounts the actual `EventsBoard` in React StrictMode with isolated API data. Its browser test checks the exact sentence, computed font size, single-line desktop geometry, adjacent controls, working header actions, no horizontal overflow, and no runtime errors or production writes.

At 390px the sentence wraps so that it remains readable without shrinking further or causing page overflow. Browser WebKit emulation does not establish physical iPhone Safari acceptance.
