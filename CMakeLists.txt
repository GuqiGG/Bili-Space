cmake_minimum_required(VERSION 3.24)
project(BetterBiliSpace VERSION 0.1.71 LANGUAGES CXX)
if(APPLE)
  enable_language(OBJCXX)
  set(CMAKE_OSX_DEPLOYMENT_TARGET "14.0")
  find_package(Python3 COMPONENTS Interpreter REQUIRED)
  add_executable(BiliSpaceMac MACOSX_BUNDLE src/macos_main.mm)
  set_target_properties(BiliSpaceMac PROPERTIES OUTPUT_NAME "Bili-Space" MACOSX_BUNDLE_INFO_PLIST "${CMAKE_SOURCE_DIR}/src/macos/Info.plist.in" MACOSX_BUNDLE_BUNDLE_VERSION "${PROJECT_VERSION}" MACOSX_BUNDLE_SHORT_VERSION_STRING "${PROJECT_VERSION}")
  target_compile_options(BiliSpaceMac PRIVATE -fobjc-arc -Wall)
  target_link_libraries(BiliSpaceMac PRIVATE "-framework Cocoa" "-framework WebKit")
  add_custom_command(TARGET BiliSpaceMac POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory "$<TARGET_BUNDLE_CONTENT_DIR:BiliSpaceMac>/Resources"
    COMMAND ${CMAKE_COMMAND} -E copy_directory "${CMAKE_SOURCE_DIR}/assets" "$<TARGET_BUNDLE_CONTENT_DIR:BiliSpaceMac>/Resources/assets"
    COMMAND ${Python3_EXECUTABLE} "${CMAKE_SOURCE_DIR}/scripts/build_web_bundle.py" --output "$<TARGET_BUNDLE_CONTENT_DIR:BiliSpaceMac>/Resources"
    COMMAND ${Python3_EXECUTABLE} "${CMAKE_SOURCE_DIR}/scripts/build_icns.py" --output "$<TARGET_BUNDLE_CONTENT_DIR:BiliSpaceMac>/Resources/Bili-Space.icns")
  return()
elseif(UNIX)
  find_package(Python3 COMPONENTS Interpreter REQUIRED)
  add_custom_target(BiliSpaceLinux ALL COMMAND ${Python3_EXECUTABLE} "${CMAKE_SOURCE_DIR}/scripts/package_linux.py" WORKING_DIRECTORY "${CMAKE_SOURCE_DIR}")
  return()
endif()
enable_language(RC)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(WEBVIEW2_SDK "${CMAKE_SOURCE_DIR}/.tools/webview2" CACHE PATH "Extracted WebView2 NuGet SDK")
add_executable(BetterBiliSpace WIN32 src/main.cpp src/app.rc)
set_target_properties(BetterBiliSpace PROPERTIES OUTPUT_NAME "Bili-Space")
target_include_directories(BetterBiliSpace PRIVATE vendor "${CMAKE_SOURCE_DIR}" "${WEBVIEW2_SDK}/build/native/include")
target_compile_definitions(BetterBiliSpace PRIVATE UNICODE _UNICODE NOMINMAX)
target_link_libraries(BetterBiliSpace PRIVATE ole32 user32 gdi32 shell32 dwmapi uuid ws2_32 winhttp comdlg32 mfplat mfreadwrite mfuuid bcrypt crypt32 gdiplus advapi32)
if(MINGW AND CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  target_compile_options(BetterBiliSpace PRIVATE -fms-extensions)
endif()
add_custom_command(TARGET BetterBiliSpace POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E copy "${WEBVIEW2_SDK}/build/native/x64/WebView2Loader.dll" "$<TARGET_FILE_DIR:BetterBiliSpace>"
  COMMAND ${CMAKE_COMMAND} -E copy_directory "${CMAKE_SOURCE_DIR}/assets" "$<TARGET_FILE_DIR:BetterBiliSpace>/assets"
  COMMAND ${CMAKE_COMMAND} -E copy_directory "${CMAKE_SOURCE_DIR}/runtime" "$<TARGET_FILE_DIR:BetterBiliSpace>/runtime")
