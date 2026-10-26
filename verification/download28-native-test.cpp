#define BILI_DOWNLOAD_TEST
#include "../src/main.cpp"
int wmain(int argc,wchar_t** argv){if(argc!=3)return 2;runDownload(argv[1],fs::path(argv[2]));return 0;}
