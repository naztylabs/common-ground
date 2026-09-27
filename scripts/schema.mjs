import { writeFile } from 'node:fs/promises';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Registry, Update } from '../dist/model.js';
for(const [name,schema] of [['knowledge',Registry],['update',Update]]) {
 await writeFile(`schemas/${name}.schema.json`,JSON.stringify(zodToJsonSchema(schema,{name}),null,2)+'\n');
}
