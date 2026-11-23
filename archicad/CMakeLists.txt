# SpaceNode for Archicad — add-on build. Mirrors the official
# GRAPHISOFT/archicad-addon-cmake template; the shared Tools/ come from
# .deps/tools (tools/archicad.py deps). Normally driven by tools/archicad.py.
cmake_minimum_required (VERSION 3.19)

set (SN_TOOLS_DIR "${CMAKE_CURRENT_LIST_DIR}/.deps/tools" CACHE PATH "archicad-addon-cmake-tools checkout")
if (NOT EXISTS "${SN_TOOLS_DIR}/CMakeCommon.cmake")
    message (FATAL_ERROR "Missing ${SN_TOOLS_DIR}. Run: python3 archicad/tools/archicad.py deps")
endif ()
include ("${SN_TOOLS_DIR}/CMakeCommon.cmake")

set_property (GLOBAL PROPERTY USE_FOLDERS ON)
set (AC_API_DEVKIT_DIR "$ENV{AC_API_DEVKIT_DIR}" CACHE PATH "API DevKit directory (its Support folder).")

if (NOT DEFINED AC_VERSION)
    message (FATAL_ERROR "AC_VERSION is not set!")
endif ()
message (STATUS "Archicad Version: ${AC_VERSION}")
SetGlobalCompilerDefinitions (${AC_VERSION})

if (NOT DEFINED GS_CONFIG_JSON_PATH)
    set (GS_CONFIG_JSON_PATH "${CMAKE_CURRENT_LIST_DIR}/config.json")
endif ()
ReadConfigJson ()
set (AC_ADDON_LANGUAGE "${addOnDefaultLanguage}" CACHE STRING "Add-On language code.")

project (${addOnName}-${AC_VERSION})

# The UI is one self-contained HTML (inlined font) embedded as a 'DATA' resource.
find_package (Python3 3.10 REQUIRED COMPONENTS Interpreter)
execute_process (
    COMMAND "${Python3_EXECUTABLE}" "${CMAKE_CURRENT_LIST_DIR}/tools/gen_ui.py"
    RESULT_VARIABLE genUiResult
)
if (NOT genUiResult EQUAL 0)
    message (FATAL_ERROR "tools/gen_ui.py failed")
endif ()
set_property (DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS
    "${CMAKE_CURRENT_LIST_DIR}/ui/panel.html" "${CMAKE_CURRENT_LIST_DIR}/ui/assets/geist-latin.woff2" "${CMAKE_CURRENT_LIST_DIR}/ui/assets/symbol.svg")

set (AC_ADDON_FOR_DISTRIBUTION OFF CACHE BOOL "")

set (AddOnSourcesFolder Src)
set (AddOnResourcesFolder .)
set (PCH_HEADER "Src/PrecompiledHeader.hpp")

GenerateAddOnProject (CMakeTarget ${AC_VERSION} "${AC_API_DEVKIT_DIR}" ${AddOnSourcesFolder} ${AddOnResourcesFolder} ${AC_ADDON_LANGUAGE} ${addOnDefaultLanguage} ${PCH_HEADER})

# ── SpaceNode sources outside Src/ (the template only globs Src/) ──────────────
file (GLOB SN_CORE_SOURCES CONFIGURE_DEPENDS "${CMAKE_CURRENT_LIST_DIR}/core/*.cpp")
file (GLOB SN_CORE_HEADERS CONFIGURE_DEPENDS "${CMAKE_CURRENT_LIST_DIR}/core/*.hpp" "${CMAKE_CURRENT_LIST_DIR}/platform/*.hpp")
target_sources (CMakeTarget PRIVATE ${SN_CORE_SOURCES} ${SN_CORE_HEADERS} "${CMAKE_CURRENT_LIST_DIR}/platform/ConfiguredApiBaseUrl.cpp")
source_group ("Core" FILES ${SN_CORE_SOURCES} ${SN_CORE_HEADERS})

if (WIN32)
    set (SN_PLATFORM_SOURCE "${CMAKE_CURRENT_LIST_DIR}/platform/win/WinPlatform.cpp")
    target_sources (CMakeTarget PRIVATE "${SN_PLATFORM_SOURCE}")
    # Self-contained translation unit: native wchar_t (Win32 wide APIs), no PCH
    # (the template builds with /Zc:wchar_t-, which the PCH would pin).
    set_source_files_properties ("${SN_PLATFORM_SOURCE}" PROPERTIES COMPILE_OPTIONS "/Zc:wchar_t" SKIP_PRECOMPILE_HEADERS ON)
    target_link_libraries (CMakeTarget winhttp.lib crypt32.lib advapi32.lib shell32.lib ole32.lib)
else ()
    enable_language (OBJCXX)
    set (SN_PLATFORM_SOURCE "${CMAKE_CURRENT_LIST_DIR}/platform/mac/MacPlatform.mm")
    target_sources (CMakeTarget PRIVATE "${SN_PLATFORM_SOURCE}")
    set_source_files_properties ("${SN_PLATFORM_SOURCE}" PROPERTIES LANGUAGE OBJCXX COMPILE_OPTIONS "-fobjc-arc" SKIP_PRECOMPILE_HEADERS ON)
    find_library (SN_FOUNDATION Foundation)
    find_library (SN_SECURITY Security)
    find_library (SN_APPKIT AppKit)
    target_link_libraries (CMakeTarget ${SN_FOUNDATION} ${SN_SECURITY} ${SN_APPKIT})
endif ()
