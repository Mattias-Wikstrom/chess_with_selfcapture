
#include <string>
#include "types.h"
#include "position.h"
#include "movegen.h"
#include <stdexcept>

class ChessEngine {
public:
    ChessEngine();
    ~ChessEngine();
    
    void initialize();
    void setPosition(const std::string& fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    bool makeMove(const std::string& moveString);
    bool isLegalMove(const std::string& moveString) const;
    bool isGameOver() const;
    std::string getFEN() const;
    Stockfish::Color sideToMove() const;
    Stockfish::Piece pieceOn(int file, int rank) const;
    
    // Convert between coordinate systems
    static std::string toAlgebraic(int file, int rank);
    static std::pair<int, int> fromAlgebraic(const std::string& algebraic);
    
private:
    Stockfish::Position pos;
    static constexpr int MAX_MOVES = 256;
    Stockfish::StateInfo states[MAX_MOVES];
    int stateIndex;
    
    Stockfish::Move moveFromString(const std::string& input) const;
};
