import {mkdirSync,copyFileSync} from 'node:fs';
mkdirSync('public',{recursive:true});
for(const f of ['index.html','style.css','app.js']) copyFileSync(f,`public/${f}`);
