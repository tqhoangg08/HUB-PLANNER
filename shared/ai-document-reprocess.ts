export type ReprocessDocumentIdentity={id:string;mimeType:string;sourceHash:string;version:number;derivedRevision:string|null;visibility:'public'|'program'|'admin'};
/** Planning only. Never mutates a source object, index, D1 status or live revision. */
export const buildDocumentReprocessPlan=(documents:readonly ReprocessDocumentIdentity[])=>{
  if(documents.length>40)throw Error('reprocess batch limit');
  const ids=new Set<string>();
  return documents.map(d=>{
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(d.id)||!/^[a-f0-9]{64}$/i.test(d.sourceHash)||d.mimeType!=='application/pdf'||!Number.isInteger(d.version)||d.version<1||!['public','program','admin'].includes(d.visibility))throw Error('invalid reprocess identity');
    if(ids.has(d.id))throw Error('duplicate reprocess identity');ids.add(d.id);
    return{documentId:d.id,expectedSourceHash:d.sourceHash,expectedVersion:d.version,rollbackRevision:d.derivedRevision,visibility:d.visibility,
      originalAction:'READ_ONLY' as const,derivativeAction:'NEW_REVISION_SIDE_BY_SIDE' as const,promotion:'COMPARE_AND_SWAP_AFTER_ALL_PAGES_READY' as const,
      requiresHumanApproval:true,requiresPdfVisualReview:true,requiresAuthorizedRetrievalBenchmark:true};
  });
};
