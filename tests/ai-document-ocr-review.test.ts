import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessOcrReviewNeed,compareOcrReadings,buildOcrReviewDraft} from '../shared/ai-document-ocr-review.ts';
import {normalizeAcceptanceText} from '../shared/ai-advisor-acceptance-text.ts';
const input={sourceHash:'a'.repeat(64),baseRevision:'v1-'+ 'b'.repeat(32),pageNumber:3,
  baselineText:'Nội dung OCR cần kiểm tra.',trialText:'Nội dung OCR cần kiểm tra.',trialUncertainTokens:0,method:'optical-trial'};
test('confidence cannot approve a review draft, even when both reads agree',()=>{
  const draft=buildOcrReviewDraft(input);
  assert.equal(draft.approved,false);assert.equal(draft.promotionAllowed,false);
  assert.equal(draft.status,'pending_admin_review');assert.equal(draft.comparison.accuracyVerified,false);
  assert.equal(draft.originalAction,'READ_ONLY');assert.equal(draft.oldRevisionAction,'RETAIN_IMMUTABLE');
});
test('unclear words and ambiguous list markers require visual review, not inferred numbers',()=>{
  for(const text of ['[không đọc rõ] Nội dung','I. Nội dung','l.. Nội dung'])assert.equal(assessOcrReviewNeed(text,0).requiresReview,true);
  assert.equal(assessOcrReviewNeed('1. Nội dung\n2. Nội dung',0).requiresReview,false);
  assert.equal(assessOcrReviewNeed('Nội dung',1).requiresReview,true);
});
test('exact OCR comparison preserves Vietnamese accents, punctuation, negation and numbers',()=>{
  assert.equal(compareOcrReadings('Dữ liệu.', 'Dữ liệu.'.normalize('NFD')).tokenEditDistance,0);
  for(const [a,b]of [['tốn','tôn'],['100','10'],['không được','được'],['A; B','A: B']]){
    assert.ok(compareOcrReadings(a,b).tokenEditDistance>0);assert.equal(compareOcrReadings(a,b).accuracyVerified,false);
  }
  assert.equal(compareOcrReadings('A B C','A C').tokenEditDistance,1);
  assert.throws(()=>compareOcrReadings('x '.repeat(2001),'x'),/LIMIT/);
});
test('review identity must bind to a valid original hash, revision and physical page',()=>{
  for(const patch of [{sourceHash:'invalid'},{baseRevision:'../old'},{pageNumber:0},{pageNumber:41},{trialText:''},{trialUncertainTokens:-1}])
    assert.throws(()=>buildOcrReviewDraft({...input,...patch}),/INVALID/);
});
test('semantic acceptance allows quoted line wrapping but does not hide wrong Vietnamese accents',()=>{
  assert.equal(normalizeAcceptanceText('> Trung\n> thực, khiêm tốn.'),'trung thực, khiêm tốn.');
  assert.notEqual(normalizeAcceptanceText('khiêm tôn'),normalizeAcceptanceText('khiêm tốn'));
  assert.notEqual(normalizeAcceptanceText('phần đấu'),normalizeAcceptanceText('phấn đấu'));
  assert.notEqual(normalizeAcceptanceText('không được'),normalizeAcceptanceText('được'));
});
test('local trial tools cannot write production, copy PDFs into Git or promote a trial',()=>{
  const prepare=readFileSync('scripts/prepare-advisor-ocr-review-staging.mjs','utf8');
  assert.match(prepare,/hub-advisor-pr88-app-staging/);assert.match(prepare,/88d702e1-60d3-490a-8514-38ef881cf133/);
  assert.match(prepare,/OUTSIDE_GIT_REQUIRED/);assert.match(prepare,/READ_ONLY_REQUIRED/);
  assert.match(prepare,/UNCHANGED_PAGE_SERIALIZATION_MISMATCH/);
  assert.match(prepare,/OPTICAL_TRIAL_SOURCE_MISMATCH/);
  assert.doesNotMatch(prepare,/UPDATE ai_documents|DELETE FROM|INSERT INTO/);
  const recognition=readFileSync('scripts/diagnose-advisor-page-ocr.mjs','utf8');
  assert.doesNotMatch(recognition,/api\.cloudflare|gemini|replace\([^\n]*tôn/);
});
