cmake_minimum_required(VERSION 3.16)
project(ChessUI)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find Qt5 (without SVG for now to get it working)
find_package(Qt5 REQUIRED COMPONENTS Core Widgets Svg)
find_package(Threads REQUIRED)

# Set up automoc, autorcc, autouic for Qt5
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

# Create executable
add_executable(ChessUI
    main.cpp
    chessboard.cpp
    engine_integration.cpp
    ../bitboard.cpp  
    ../misc.cpp  
    ../movegen.cpp  
    ../position.cpp
    ../engine.cpp
    ../memory.cpp
    ../movepick.cpp
    ../search.cpp
    ../tt.cpp
    ../ucioption.cpp
    ../benchmark.cpp
    ../evaluate.cpp
    ../misc.cpp
    ../thread.cpp
    ../tune.cpp
    ../bitboard.cpp 
    ../score.cpp
    ../timeman.cpp
    ../uci.cpp
    ../nnue/features/half_ka_v2_hm.cpp
    ../nnue/network.cpp  
    ../nnue/nnue_accumulator.cpp 
    ../nnue/nnue_misc.cpp 
    ../syzygy/tbprobe.cpp
)

# Link Qt5 libraries (just Core and Widgets for now)
target_link_libraries(ChessUI Qt5::Core Qt5::Widgets Qt5::Svg Threads::Threads)

# Include directories
target_include_directories(ChessUI PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
target_include_directories(ChessUI PRIVATE ..)

message(STATUS "Qt5 version found: ${Qt5_VERSION}")