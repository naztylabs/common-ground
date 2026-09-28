import { writeFile } from 'node:fs/promises';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Registry, Update } from '../dist/model.js';
import { Patch, Admission } from '../dist/workflow.js';
for(const [name,schema] of [['knowledge',Registry],['update',Update],['patch',Patch],['admission',Admission]]) {
 await writeFile(`schemas/${name}.schema.json`,JSON.stringify(zodToJsonSchema(schema,{name}),null,2)+'\n');
}
