const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(process.argv[2], 'utf8');
const settings = source.match(/const settings = (\{[\s\S]*?\n    \});/)[1];
const route = source.match(/function getPageKind\(\) \{[\s\S]*?\n    \}/)[0];
const ctx = {GM_getValue: (_k,d)=>d, STORAGE_KEYS:{}, location:{hostname:'www.bilibili.com',pathname:'/'}};
vm.createContext(ctx);
const policy = vm.runInContext('('+settings+')',ctx);
vm.runInContext(route,ctx);
vm.runInContext(source.slice(source.indexOf('    function extractUid('),source.indexOf('    function fadeOutAndRemove(')),ctx);
const routes = [];
for(const [hostname,pathname] of [['www.bilibili.com','/'],['www.bilibili.com','/video/BVtest'],['search.bilibili.com','/all'],['www.bilibili.com','/v/popular/'],['www.bilibili.com','/zh-Hans']]){
  ctx.location={hostname,pathname}; routes.push(vm.runInContext('getPageKind()',ctx));
}
const uids=['https://space.bilibili.com/123','//space.bilibili.com/zh-Hans/456','https://example.com/ad/999'].map(url=>{ctx.url=url;return vm.runInContext('extractUid(url)',ctx);});
console.log(JSON.stringify({settings:policy,routes,uids}));
