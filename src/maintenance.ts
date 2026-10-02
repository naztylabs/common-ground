import { Store, same } from './store.js';
import { validateKnowledge, tidyPlan } from './navigation.js';
import { refreshKnowledgeExport } from './export.js';

export async function checkKnowledge(store:Store,target='all',cleanup=false,cursor?:string,limit?:number,expectedAffected?:unknown,allResults=true) {
  const registry=await store.read();
  const result=await validateKnowledge(store,target,cursor,limit,allResults);
  if(expectedAffected && !same(expectedAffected,result.affected))throw new Error('Affected knowledge changed; rerun the check and confirm the new cleanup scope.');
  if(!same(registry,await store.read()))throw new Error('Knowledge changed; rerun the check.');
  const cleanupPlan=cleanup && result.affected.chapters.length
    ? {...await store.requestTidy(result.affected.chapters,registry),targets:result.affected.chapters,
      next:'Start task_context if needed. Read every required chapter and source/documentation using read_knowledge checklist/review. Submit verified corrections with prepare_patch (or prepare_update) and tidyId, then commit_update. Re-run validate. Do not add facts or expand ownership without developer approval.'}
    : null;
  return {...result,cleanup:cleanupPlan,markdown:await refreshKnowledgeExport(store)};
}
export async function startTidy(store:Store,target:string,cursor?:string,limit?:number) {
  const registry=await store.read();
  return {...await tidyPlan(store,target,cursor,limit),...(!cursor?await store.requestTidy(target,registry):{}),markdown:await refreshKnowledgeExport(store)};
}
export function staleMessage(result:Awaited<ReturnType<typeof checkKnowledge>>) {
  return (['pillars','chapters','facts'] as const).filter(kind=>result.affected[kind].length).map(kind=>
    `The following ${kind.slice(0,-1).toUpperCase()} is out of date:\n${result.affected[kind].map(id=>`  ${id}`).join('\n')}`).join('\n');
}
