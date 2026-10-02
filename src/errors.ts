/** Stable CLI error envelope. Unclassified domain failures use OPERATION_FAILED. */
export class GroundError extends Error {
  constructor(public code:string,message:string,public fields:string[]=[],public recovery='Inspect the command help and correct the request.') {super(message);}
}
export function errorPayload(error:unknown) {
  const value=error as {code?:string;message?:string;issues?:{path:(string|number)[];message:string}[]};
  if(error instanceof GroundError)return {code:error.code,message:error.message,fields:error.fields,recovery:error.recovery};
  if(Array.isArray(value.issues))return {code:'INVALID_INPUT',message:value.issues.map(i=>`${i.path.join('.')||'input'}: ${i.message}`).join('; '),fields:[...new Set(value.issues.map(i=>i.path.join('.')||'input'))],recovery:'Inspect cground schema <operation> and correct the affected fields.'};
  return {code:value.code??'OPERATION_FAILED',message:value.message??String(error),fields:[] as string[],recovery:'Inspect cground <command> --help. Reload current knowledge and source before retrying a conflicting update.'};
}
