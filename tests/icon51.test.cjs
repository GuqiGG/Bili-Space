const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
// macOS shows a generic white document icon when CFBundleIconFile is missing or points
// at an .icns that is not in Contents/Resources. Both halves are asserted here, because
// a green build does not prove the Dock icon looks right.
test('macOS bundle declares an icon and the build actually writes the icns',()=>{
 const plist=fs.readFileSync('src/macos/Info.plist.in','utf8');
 const declared=plist.match(/<key>CFBundleIconFile<\/key><string>([^<]+)<\/string>/);
 assert(declared,'Info.plist must declare CFBundleIconFile');
 const iconName=declared[1];
 const cmake=fs.readFileSync('CMakeLists.txt','utf8');
 assert.match(cmake,new RegExp(`build_icns\\.py`),'CMake must run the icns builder');
 assert.match(cmake,new RegExp(`${iconName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\.icns`),'CMake must write the declared icon name');
});
test('the icns builder emits a valid container with the sizes macOS asks for',()=>{
 const out=path.join(os.tmpdir(),`bili-space-icns-${process.pid}.icns`);
 execFileSync(process.env.PYTHON||'python',['scripts/build_icns.py','--output',out],{stdio:'ignore'});
 const bytes=fs.readFileSync(out);
 try{
  assert.equal(bytes.subarray(0,4).toString(),'icns','magic must be icns');
  const declared=bytes.readUInt32BE(4);
  assert.equal(declared,bytes.length,'declared length must match the file');
  const chunks=[];let offset=8;
  while(offset<bytes.length){const type=bytes.subarray(offset,offset+4).toString();const size=bytes.readUInt32BE(offset+4);assert(size>=8,'chunk size sane');chunks.push(type);offset+=size;}
  assert.equal(offset,bytes.length,'chunks must tile the file exactly');
  for(const needed of ['ic07','ic08','ic09','ic10'])assert(chunks.includes(needed),`missing ${needed}`);
  assert(chunks.length>=10,'must carry Retina slots too');
 }finally{fs.rmSync(out,{force:true});}
});
