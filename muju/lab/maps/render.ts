import {readFileSync,writeFileSync} from 'node:fs';
const data=readFileSync('lab/results/map-study-2026-09-07/comparison.json','utf8').replace(/</g,'\\u003c');
const template=readFileSync('lab/maps/viewer.template.html','utf8');
writeFileSync('lab/results/map-study-2026-09-07/index.html',template.replace('__STUDY_DATA__',data));
console.log('Rendered lab/results/map-study-2026-09-07/index.html');
