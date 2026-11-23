/** Recompute attribution and sensitivity from saved, read-only Analytics. */
import { readFile, writeFile } from 'node:fs/promises';
const analytics=JSON.parse(await readFile('docs/benchmarks/d1-audit-daily-2026-11-20-22.json','utf8')).data.viewer.accounts[0];
const main={day20:6740470,day21:7885259,day22:6638920},auth={day20:107036,day21:45140,day22:35706};
const categories=q=> /FROM (?:\(SELECT \* FROM )?course_filter_facets\b/.test(q)?'Course facets (including count)':
  /DISTINCT TRIM\(general_class\)/.test(q)?'Student directory class list':
  /^SELECT p\.semester/.test(q.trim())?'Catalogue schema probe':
  /SELECT COUNT\(\*\) AS total,[\s\S]*outranking/.test(q)?'Imported exact ranking forecast':
  /push_subscriptions|push_delivery_attempts/.test(q)?'Push subscriptions and attempts':
  /scholarship_/.test(q)?'Scholarships':
  /^(SELECT \* FROM course_schedules WHERE semester=|SELECT semester,catalogue_visibility,COUNT|SELECT semester,course_code_search,COUNT|SELECT COUNT\(\*\) AS count,COALESCE\(MAX\(source_position\)|SELECT \* FROM user_schedules ORDER BY|SELECT \* FROM user_schedule_course_snapshots ORDER BY|SELECT COUNT\(\*\) AS n FROM user_schedules|INSERT INTO course_mutation_receipts)/.test(q.trim())?'Operator-shaped snapshots/import guards (attribution inferred)':
  /course_schedules/.test(q)?'Other course queries':
  /FROM event_candidates[\s\S]*image_url/.test(q)?'Candidate banner authorization lookup':
  /FROM ai_chat_logs[\s\S]*conversation_id/.test(q)?'Conversation owner lookup':'Other';
const days=[];
for(const [day,rows] of Object.entries(analytics)) {
  const groups={};for(const row of rows){const key=categories(row.dimensions.query);groups[key]=(groups[key]||0)+row.sum.rowsRead;}
  const covered=rows.reduce((sum,r)=>sum+r.sum.rowsRead,0),directory=groups['Student directory class list']||0,facet=groups['Course facets (including count)']||0;
  days.push({date:'2026-11-'+day.slice(3),timezone:'UTC (Cloudflare daily quota day; local midnight is not the quota reset)',mainRowsRead:main[day],authRowsRead:auth[day],accountRowsRead:main[day]+auth[day],insightsCovered:covered,unattributed:main[day]-covered,
    groups:Object.fromEntries(Object.entries(groups).sort((a,b)=>b[1]-a[1])),
    sensitivity:[0.15,0.25,0.35,0.60,0.98].map(facetRemainingRatio=>({facetRemainingRatio,
      projectedAccountRows:Math.round(main[day]+auth[day]-facet*(1-facetRemainingRatio)-directory*(1-2445/20814))})),
    notes:'Sensitivity only, not measured production savings. Keeps all non-facet/non-directory reads unchanged. Bound filter values and gate state are unavailable in Insights; no assumption about exact request mix.'});
}
const output={source:'Cloudflare GraphQL d1AnalyticsAdaptiveGroups and d1QueriesAdaptiveGroups, retrieved 2026-11-23; no application workload replay on production',days};
await writeFile('docs/benchmarks/d1-audit-summary.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output,null,2));
