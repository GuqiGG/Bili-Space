#define wWinMain testedApplicationMain
#include TARGET_CPP
#undef wWinMain
#include <iostream>
int wmain(){
 json result;const std::wstring samples[]={L"BV1cjHK6GEJE",L"https://www.bilibili.com/video/BV1cjHK6GEJE?t=4.4",L"https://evilbilibili.com/video/BV1cjHK6GEJE",L"https://www.bilibili.com/video/BV1cjHK6GEJEx",L"https://evil.com/BV1cjHK6GEJE",L"not a video"};
 for(const auto& value:samples){
#if HAS_LINKS
 result[utf8(value)]=utf8(clipboardVideoUrl(value));
#else
 result[utf8(value)]="not implemented";
#endif
 }
#if HAS_LINKS
 if(clipboardVideoUrl(samples[0])!=L"https://www.bilibili.com/video/BV1cjHK6GEJE")return 1;
 if(clipboardVideoUrl(samples[1])!=samples[1])return 2;
 for(int i=2;i<6;i++)if(!clipboardVideoUrl(samples[i]).empty())return 3;
 if(externalWebUrl(L"javascript:alert(1)")||externalWebUrl(L"https://user:pass@example.com/"))return 4;
 if(!externalWebUrl(L"https://wwem.lanzouq.com/iSzsD2vewxad"))return 5;
#endif
 std::cout<<result.dump()<<std::endl;return 0;
}
