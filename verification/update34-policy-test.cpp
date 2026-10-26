#include <string>
#include <regex>
#include <sstream>
#include <iostream>
#include <cassert>
#include "../vendor/json.hpp"
using json=nlohmann::json;
#include "../src/update_policy.hpp"
int main(){json v={{"schema",1},{"appId","bili-space"},{"platform","windows-x64"},{"version","0.1.35"},{"minimumSupportedVersion","0.1.0"},{"force",false},{"downloadUrl","https://bili.gvqi.top/releases/Bili-Space-0.1.35-win64.zip"},{"sha256",std::string(64,'a')},{"size",1234},{"changelog",{"changes"}}};int assertions=0;auto ok=[&](bool yes){assert(yes);assertions++;};ok(releaseVersion("0.1.100")>releaseVersion("0.1.99"));ok(validateUpdate(v,"0.1.34")["available"]==true);ok(validateUpdate(v,"0.1.35")["required"]==false);v["force"]=true;ok(validateUpdate(v,"0.1.34")["required"]==true);ok(validateUpdate(v,"0.1.36")["required"]==false);v["force"]=false;v["minimumSupportedVersion"]="0.1.35";ok(validateUpdate(v,"0.1.34")["required"]==true);for(auto version:{"0.1","01.1.2","0.1.2-beta","-1.0.0","1.0.9999999","1.0.0\n"}){bool rejected=false;try{releaseVersion(version);}catch(...){rejected=true;}ok(rejected);}for(auto url:{"http://bili.gvqi.top/releases/Bili-Space-0.1.35-win64.zip","https://bili.gvqi.top.evil.test/releases/Bili-Space-0.1.35-win64.zip","https://user@bili.gvqi.top/releases/Bili-Space-0.1.35-win64.zip","https://bili.gvqi.top/releases/../x.exe"})ok(!trustedUpdatePackage(url));for(const auto& field:{"sha256","downloadUrl","force","changelog","size","platform"}){auto bad=v;bad[field]=nullptr;bool rejected=false;try{validateUpdate(bad,"0.1.34");}catch(...){rejected=true;}ok(rejected);}std::cout<<json({{"assertions",assertions},{"pass",true}}).dump();}
