#include "engine_integration.h"
#include <cctype>
#include <iostream>

using namespace Stockfish;

ChessEngine::ChessEngine() : stateIndex(0) {
    initialize();
}

ChessEngine::~ChessEngine() {
    // Cleanup if needed
}

void ChessEngine::initialize() {
    Stockfish::Bitboards::init();
    Stockfish::Position::init();
    setPosition();
}

void ChessEngine::setPosition(const std::string& fen) {
    stateIndex = 0;
    pos.set(fen.c_str(), false, &states[stateIndex]);
}

bool ChessEngine::makeMove(const std::string& moveString) {
    try {
        Stockfish::Move m = moveFromString(moveString);
        
        if (!(m.is_ok() && pos.pseudo_legal(m) && pos.legal(m))) {
            return false;
        }
        
        ++stateIndex;
        if (stateIndex >= MAX_MOVES) {
            std::cerr << "Exceeded maximum move depth!\n";
            return false;
        }
        
        pos.do_move(m, states[stateIndex], nullptr);
        return true;
        
    } catch (const std::invalid_argument& e) {
        return false;
    }
}

bool ChessEngine::isLegalMove(const std::string& moveString) const {
    try {
        Stockfish::Move m = moveFromString(moveString);
        return m.is_ok() && pos.pseudo_legal(m) && pos.legal(m);
    } catch (const std::invalid_argument& e) {
        return false;
    }
}

bool ChessEngine::isGameOver() const {
    return pos.is_draw(0) || pos.is_repetition(0) || pos.checkers(); // Add more conditions as needed
}

std::string ChessEngine::getFEN() const {
    return pos.fen();
}

Stockfish::Color ChessEngine::sideToMove() const {
    return pos.side_to_move();
}

Stockfish::Piece ChessEngine::pieceOn(int file, int rank) const {
    // Convert from our coordinate system (0-7 for both file and rank)
    // to Stockfish's system (a1=0, h8=63)
    Square sq = Square((7 - rank) * 8 + file);
    return pos.piece_on(sq);
}

std::string ChessEngine::toAlgebraic(int file, int rank) {
    char fileChar = 'a' + file;
    char rankChar = '1' + (7 - rank); // Convert to chess rank (1-8 from bottom)
    return std::string(1, fileChar) + std::string(1, rankChar);
}

std::pair<int, int> ChessEngine::fromAlgebraic(const std::string& algebraic) {
    if (algebraic.size() != 2) return {-1, -1};
    
    int file = algebraic[0] - 'a';
    int rank = 7 - (algebraic[1] - '1'); // Convert from chess rank to our system
    
    return {file, rank};
}

Stockfish::Move ChessEngine::moveFromString(const std::string& input) const {
  if (input.size() < 4)
        throw std::invalid_argument("Move string too short");

    auto file_to_index = [](char f) {
        if (f < 'a' || f > 'h')
            throw std::invalid_argument("Invalid file letter");
        return f - 'a';
    };

    auto rank_to_index = [](char r) {
        if (r < '1' || r > '8')
            throw std::invalid_argument("Invalid rank number");
        return r - '1';
    };

    Square from = Square(rank_to_index(input[1]) * 8 + file_to_index(input[0]));
    Square to   = Square(rank_to_index(input[3]) * 8 + file_to_index(input[2]));

    if (input.size() == 4) {
        if ((pos.piece_on(from) == Piece::W_PAWN || pos.piece_on(from) == Piece::B_PAWN)
            && pos.piece_on(to) == Piece::NO_PIECE 
            && input[0] != input[2]) {
            // This is either an /en passant/ capture or an invalid move
            return Move::make<EN_PASSANT>(from, to);
        } else if (
            (pos.piece_on(from) == Piece::W_KING && from == Square::SQ_E1 &&
                (to == Square::SQ_A1 || to == Square::SQ_H1 ||
                 to == Square::SQ_C1 || to == Square::SQ_G1))
            ||
            (pos.piece_on(from) == Piece::B_KING && from == Square::SQ_E8 &&
                (to == Square::SQ_A8 || to == Square::SQ_H8 ||
                 to == Square::SQ_C8 || to == Square::SQ_G8))
        ) {
            // Map traditional castling destination (g/c file) to rook square (h/a file)
            if (to == Square::SQ_G1) to = Square::SQ_H1;
            else if (to == Square::SQ_C1) to = Square::SQ_A1;
            else if (to == Square::SQ_G8) to = Square::SQ_H8;
            else if (to == Square::SQ_C8) to = Square::SQ_A8;
            return Move::make<CASTLING>(from, to);
        } else {
            return Move(from, to);
        }
    }

    // Promotion move like "e7e8q"
    if (input.size() == 5) {
        PieceType pt;
        switch (std::tolower(input[4])) {
            case 'n': pt = KNIGHT; break;
            case 'b': pt = BISHOP; break;
            case 'r': pt = ROOK;   break;
            case 'q': pt = QUEEN;  break;
            default:
                throw std::invalid_argument("Invalid promotion piece");
        }
        return Move::make<PROMOTION>(from, to, pt);
    }

    throw std::invalid_argument("Invalid move string length");
}
