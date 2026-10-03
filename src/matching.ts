/** Shared technical tokens. Versions remain atomic; identifiers split at camel-case boundaries. */
export function words(text:string):string[] {
  const normalized=text.replace(/(\p{Ll}|\p{N})(\p{Lu})/gu,'$1 $2').replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu,'$1 $2').toLowerCase();
  return [...new Set((normalized.match(/v?\d+(?:\.\d+)+(?:[-+][\p{L}\p{N}]+(?:[.-][\p{L}\p{N}]+)*)?|[\p{L}\p{N}]+/gu)??[]).map(token=>token.replace(/^v(?=\d+\.)/,'')))];
}
const stopWords=new Set(['a','an','the','and','or','of','to','in','on','for','from','with','by','is','are','was','be','this','that','it','its','how','what','where','which','when','does','do','can','our','my']);
export const queryTerms=(text:string)=>words(text).filter(term=>!stopWords.has(term));
export const isVersion=(term:string)=>/^\d+(?:\.\d+)+(?:[-+].+)?$/.test(term);

export function termMatch(text:string,term:string):number {
  const tokens=words(text);
  if(tokens.includes(term))return 2;
  return !isVersion(term)&&term.length>3&&tokens.some(token=>!isVersion(token)&&token.includes(term))?1:0;
}

/** Query weights derive from the current registry, never from durable search statistics. */
export function termWeights(terms:string[],documents:string[]) {
  const frequencies=new Map(terms.map(term=>[term,documents.filter(text=>termMatch(text,term)>0).length]));
  const commonTerms=terms.filter(term=>documents.length>=3&&frequencies.get(term)!/documents.length>=0.6&&!isVersion(term));
  const weights=new Map(terms.map(term=>[term,commonTerms.includes(term)?0.2:1+Math.log2((documents.length+1)/(frequencies.get(term)!+1))]));
  return {weights,commonTerms,distinctiveTerms:terms.filter(term=>!commonTerms.includes(term))};
}

export function matchFields(terms:string[],topic:string,statement:string,weights?:Map<string,number>) {
  const strengths=terms.map(term=>Math.max(termMatch(topic,term)*2,termMatch(statement,term)));
  return {matchedTerms:terms.filter((_,index)=>strengths[index]>0),weight:strengths.reduce((n,strength,index)=>n+strength*(weights?.get(terms[index])??1),0)};
}

/** A literal path in query text gets the same priority as --path, without filesystem probing. */
export function queryPath(query:string|undefined):string|undefined {
  const candidate=query?.trim().replace(/^['"`]|['"`]$/g,'');
  if(!candidate||!candidate.includes('/')||/\s/.test(candidate)||candidate.startsWith('/')||candidate.includes('\\')||candidate.split('/').some(p=>!p||p==='.'||p==='..'))return undefined;
  return candidate;
}
