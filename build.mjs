import {mkdirSync,copyFileSync} from 'node:fs';
mkdirSync('public',{recursive:true});
for(const f of ['index.html','style.css','app.js','topic-map.js','topic-map.css']) copyFileSync(f,`public/${f}`);
