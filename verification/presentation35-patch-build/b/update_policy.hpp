#pragma once
#include <array>
std::array<int,3> releaseVersion(const std::string& s){
    if(!std::regex_match(s,std::regex(R"((0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5}))")))throw std::runtime_error("版本号格式无效");
    std::array<int,3> out{};std::stringstream in(s);std::string part;for(int i=0;i<3;i++){std::getline(in,part,'.');out[i]=std::stoi(part);}return out;
}
bool trustedUpdatePackage(const std::string& url){return std::regex_match(url,std::regex(R"(https://bili\.gvqi\.top/releases/Bili-Space-[0-9]+\.[0-9]+\.[0-9]+-win64\.zip)"));}
json validateUpdate(const json& value,const std::string& current){
    if(!value.is_object()||value.value("schema",0)!=1||value.value("appId",std::string{})!="bili-space"||value.value("platform",std::string{})!="windows-x64")throw std::runtime_error("更新清单不适用于此客户端");
    auto latest=releaseVersion(value.at("version").get<std::string>()),minimum=releaseVersion(value.at("minimumSupportedVersion").get<std::string>()),installed=releaseVersion(current);
    if(value.at("downloadUrl")!="https://bili.gvqi.top/releases/Bili-Space-"+value.at("version").get<std::string>()+"-win64.zip")throw std::runtime_error("包体名称与版本不匹配");
    if(minimum>latest||!value.at("force").is_boolean()||!trustedUpdatePackage(value.at("downloadUrl").get<std::string>())||!std::regex_match(value.at("sha256").get<std::string>(),std::regex("[a-f0-9]{64}")))throw std::runtime_error("更新清单校验失败");
    if(!value.at("size").is_number_integer())throw std::runtime_error("更新包大小无效");auto size=value.at("size").get<long long>();if(size<1||size>1024LL*1024*1024)throw std::runtime_error("更新包大小无效");
    const auto& notes=value.at("changelog");if(!notes.is_array()||notes.empty()||notes.size()>100)throw std::runtime_error("缺少更新日志");for(const auto& line:notes)if(!line.is_string()||line.get<std::string>().size()>4000)throw std::runtime_error("更新日志无效");
    auto result=value;result["available"]=latest>installed;result["required"]=latest>installed&&(value.at("force").get<bool>()||installed<minimum);return result;
}
