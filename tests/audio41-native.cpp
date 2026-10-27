#include "../src/main.cpp"
#include <cassert>
#include <iostream>
int wmain(){testing=true;config=defaults();assert(config.at("soundBalance")==true);mergeConfig({{"soundBalance",false}});assert(config.at("soundBalance")==false);
 updateState={{"available",true},{"required",false},{"ignored",false},{"version","0.1.99"}};assert(updatePayload()["prompt"]==true);
 updateAction("notice-shown","wrong");assert(updatePayload()["prompt"]==true);updateAction("notice-shown","0.1.99");assert(updatePayload()["prompt"]==false);
 updateState["version"]="0.2.0";assert(updatePayload()["prompt"]==true);updateState["ignored"]=true;assert(updatePayload()["prompt"]==false);updateState["ignored"]=false;updateState["required"]=true;assert(updatePayload()["prompt"]==false);
 std::cout<<"Native default, persistence and once-per-launch update acknowledgement PASS\n";return 0;}
