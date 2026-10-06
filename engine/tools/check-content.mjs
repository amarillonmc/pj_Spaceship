import {loadContent} from '../server/content.mjs';
import {fileURLToPath} from 'node:url';
const content=await loadContent(fileURLToPath(new URL('../../',import.meta.url)));
console.log(JSON.stringify(content.coverage,null,2));
