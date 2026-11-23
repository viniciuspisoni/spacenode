# Portable core tests (macOS / Windows / Linux) — no Archicad, no DevKit, no network.
#   cmake -S archicad/tests -B archicad/build/tests && cmake --build archicad/build/tests && ctest --test-dir archicad/build/tests --output-on-failure
cmake_minimum_required (VERSION 3.19)
project (spacenode_archicad_core_tests CXX)

set (CMAKE_CXX_STANDARD 20)
set (CMAKE_CXX_STANDARD_REQUIRED ON)
find_package (Threads REQUIRED)

file (GLOB CORE_SOURCES CONFIGURE_DEPENDS "${CMAKE_CURRENT_LIST_DIR}/../core/*.cpp")
add_executable (core_tests core_tests.cpp ${CORE_SOURCES})
target_link_libraries (core_tests PRIVATE Threads::Threads)
if (MSVC)
    target_compile_options (core_tests PRIVATE /W4 /WX /permissive-)
else ()
    target_compile_options (core_tests PRIVATE -Wall -Wextra -Wpedantic -Werror)
endif ()

enable_testing ()
add_test (NAME core COMMAND core_tests)
