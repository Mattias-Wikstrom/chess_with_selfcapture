#include <iostream>
#include <string>
#include "misc.h"
#include "types.h"
#include "position.h"
#include "movegen.h"
//#include "variant.h"
#include <cctype>
#include <stdexcept>

#include "bitboard.h"
//#include "endgame.h"
//#include "psqt.h"
#include "search.h"
#include "syzygy/tbprobe.h"
#include "thread.h"
#include "tt.h"
#include "uci.h"

//#include "piece.h"
//#include "xboard.h"

using namespace Stockfish;

/*constexpr auto& s_cout = std::cout;

using Manip = std::ostream& (*)(std::ostream&);
constexpr Manip s_endl = std::endl<char>;*/
#define s_cout sync_cout
#define s_endl sync_endl

// TODO: Cheeck why this function seems to work better than _to_move
Move move_from_string(const std::string& input, const Stockfish::Position& pos) {
    if (input.size() < 4) {
        return Move(65); // Return null move (we cannot use exceptions)
    }

    auto file_to_index = [](char f) {
        if (f < 'a' || f > 'h')
            return 0; // (we cannot use exceptions)
        return f - 'a';
    };

    auto rank_to_index = [](char r) {
        if (r < '1' || r > '8')
            return 0; // (we cannot use exceptions)
        return r - '1';
    };

    Square from = Square(rank_to_index(input[1]) * 8 + file_to_index(input[0]));
    Square to   = Square(rank_to_index(input[3]) * 8 + file_to_index(input[2]));

    if (pos.piece_on(from) == PieceType::KING) {
        s_cout << "KING" << s_endl;
    }

    if ((from == Square::SQ_E8 && to == Square::SQ_A8)
    || (from == Square::SQ_E8 && to == Square::SQ_H8)) {
        s_cout << "8th rank" << s_endl;
    }

    if (input.size() == 4) {
        if ((pos.piece_on(from) == Piece::W_PAWN || pos.piece_on(from) == Piece::B_PAWN)
            && pos.piece_on(to) == PieceType::NO_PIECE_TYPE 
            && input[0] != input[2]) {
            // This is either an /en passant/ capture or an invalid move
            return Move::make<EN_PASSANT>(from, to);
        } else if (
            (pos.piece_on(from) == Piece::W_KING &&
                (from == Square::SQ_E1 && to == Square::SQ_A1) 
                || (from == Square::SQ_E1 && to == Square::SQ_H1))
            ||
            (pos.piece_on(from) == Piece::B_KING &&
                (from == Square::SQ_E8 && to == Square::SQ_A8)
                || (from == Square::SQ_E8 && to == Square::SQ_H8))
        ) {
            s_cout << "Attempting a castling move." << s_endl;
            // This is either a castling move or an invalid move
            return Move::make<CASTLING>(from, to);
        } else {
            return Move::make<(MoveType) 0>(from, to);
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
                return Move(65); // Return null move (we cannot use exceptions)
                //throw std::invalid_argument("Invalid promotion piece");
        }
        return Move::make<PROMOTION>(from, to, pt);
    }

    return Move(65); // Return null move (we cannot use exceptions)
}

void printBoard(const Stockfish::Position& pos) {
    // Implement a function to print the board in a user-friendly format
    s_cout << pos.fen() << s_endl;
}

bool isGameOver(const Stockfish::Position& pos) {
    // You can check for draw or checkmate conditions
    if (pos.is_draw(0)) {
        s_cout << "The game is a draw." << s_endl;
        return true;
    }
    if (pos.is_repetition(0)) {
        s_cout << "The game is a draw by repetition." << s_endl;
        return true;
    }
    return false;
}

std::string getPlayerMove(const std::string& playerLabel) {
    std::string move;
    s_cout << "(" << playerLabel << ") Enter your move (e.g., e2e4): " << s_endl;
    std::cin >> move;
    return move;
}

inline std::string _square(Square const & s)
{
    return std::string(1, 'a' + file_of(s)) + std::string(1, '1' + rank_of(s));
}

template<GenType T>
void printMoveList(std::ostream& out, const std::string& label, const Position& pos) {
    out << label << ":\n";
    int cnt = 0;
    for (const auto& m : MoveList<T>(pos)) {
        out << UCIEngine::move(m, pos.is_chess960()) << std::endl;
        ++cnt;
    }
    out << "Count: " << cnt << std::endl << std::endl;
}

void playChess() {
    Stockfish::Position pos;

    // Preallocate enough StateInfo objects for the game
    constexpr int MAX_MOVES = 256;
    Stockfish::StateInfo states[MAX_MOVES];
    int stateIndex = 0;

    // Set the initial position (you can use FEN or the default starting position)
    pos.set(std::string {"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"}, false, &states[stateIndex]);

    bool isWhite;
    std::string colorChoice;

    while (true) {
        s_cout << "Choose your color (White/Black or W/B): " << s_endl;
        std::cin >> colorChoice;

        // Normalize input (make lowercase)
        std::transform(colorChoice.begin(), colorChoice.end(), colorChoice.begin(),
                       [](unsigned char c) { return std::tolower(c); });

        if (colorChoice == "white" || colorChoice == "w") {
            s_cout << "You will play as White.\n\n" << s_endl;
            isWhite = true;
            break;
        } 
        else if (colorChoice == "black" || colorChoice == "b") {
            s_cout << "You will play as Black.\n\n" << s_endl;
            isWhite = false;
            break;
        } 
        else {
            s_cout << "Invalid choice. Please type 'White', 'Black', 'W', or 'B'.\n" << s_endl;
        }
    }

    // Game loop
    while (true) {
        std::ostringstream ss;
        ss << pos << std::endl;

        ss << "Possible moves: ";
        
        for (const auto& m : MoveList<LEGAL>(pos)) {
            ss << "[" << _square(m.from_sq()) << " -> " << _square(m.to_sq());
            
            if (m.type_of() != MoveType::NORMAL) {
                ss << " type: " << m.type_of();
            }
            
            if (m.type_of() == MoveType::PROMOTION) {
                ss << " pr: " << m.promotion_type();
            }
            
            ss << "] ";
        }
        
        s_cout << ss.str() << s_endl;

        std::ostringstream out;

        out << "show_moves:\n\n";
        
        printMoveList<CAPTURES>(out, "CAPTURES", pos);
        printMoveList<QUIETS>(out, "QUIETS", pos);
        
        if (pos.checkers()) {
            printMoveList<EVASIONS>(out, "EVASIONS", pos);
            printMoveList<NON_EVASIONS>(out, "NON_EVASIONS", pos);
        }

        printMoveList<LEGAL>(out, "LEGAL", pos);

        s_cout << out.str().c_str() << s_endl;

        s_cout << "nonPawnKey[WHITE]:" << pos.state()->nonPawnKey[WHITE] << s_endl;
        s_cout << "nonPawnMaterial[WHITE]:" << pos.state()->nonPawnMaterial[WHITE] << s_endl;
        s_cout << "nonPawnKey[BLACK]:" << pos.state()->nonPawnKey[BLACK] << s_endl;
        s_cout << "nonPawnMaterial[BLACK]:" << pos.state()->nonPawnMaterial[BLACK] << s_endl;
        
        bool isFirstPlayer = pos.side_to_move() == Stockfish::WHITE && isWhite
            || pos.side_to_move() == Stockfish::BLACK && !isWhite;

        std::string move = getPlayerMove(isFirstPlayer ? "First player" : "Second player");

        Stockfish::Move m = move_from_string(move, pos);

        if (!(m.is_ok() && pos.pseudo_legal(m) && pos.legal(m))) {
            if (!m.is_ok()) {
                s_cout << "(is_ok returned false.)" << s_endl;
            } else if (!pos.pseudo_legal(m)) {
                s_cout << "(pseudo_legal returned false.)" << s_endl;
            } else if (!pos.legal(m)) {
                s_cout << "(legal returned false.)" << s_endl;
            }
            
            s_cout << "Invalid move. Try again." << s_endl;
            continue;
        }

        // Increment state index for new move
        ++stateIndex;
        if (stateIndex >= MAX_MOVES) {
            s_cout << "Exceeded maximum move depth!\n" << s_endl;
            break;
        }

            s_cout << "[" << _square(m.from_sq()) << " -> " << _square(m.to_sq()) << "]" << s_endl;
            
            if (m.type_of() != MoveType::NORMAL) {
                s_cout << " type: " << m.type_of() << s_endl;
            }
            
            if (m.type_of() == MoveType::PROMOTION) {
                s_cout << " pr: " << m.promotion_type() << s_endl;
            }
            
            s_cout << "] " << s_endl;

        
        pos.do_move(m, states[stateIndex]);

        // Check if the game is over
        if (isGameOver(pos)) {
            break;
        }
    }
}

int alt_main(int argc, char* argv[]) {    
    /*Stockfish::Bitboards::init();
    Stockfish::Position::init();
    variants.init();*/

    //s_cout << engine_info() << s_endl;

  //pieceMap.init();
  //variants.init();


  //CommandLine::init(argc, argv);
  //UCI::init(Options);
  /*Tune::init();
  PSQT::init(variants.find(Options["UCI_Variant"])->second);
*/
  Bitboards::init();
  Position::init();

  //Bitbases::init();
  //Endgames::init();

// s_cout << "Threads: " << Options["Threads"] << s_endl;
  //Threads.set(size_t(Options["Threads"]));
 // Search::clear(); // After threads are up
//  Eval::NNUE::init();

    playChess();

/*Threads.set(0);
  variants.clear_all();
  pieceMap.clear_all();
  delete XBoard::stateMachine;
  */

    return 0;
}

