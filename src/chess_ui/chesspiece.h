#ifndef CHESSPIECE_H
#define CHESSPIECE_H

#include <QString>
#include <QPainter>

enum class UIPieceType {
    None = 0,
    Pawn,
    Knight,
    Bishop,
    Rook,
    Queen,
    King
};

enum class PieceColor {
    White,
    Black,
    None
};

struct ChessPiece {
    UIPieceType type;
    PieceColor color;
    
    ChessPiece() : type(UIPieceType::None), color(PieceColor::None) {}
    ChessPiece(UIPieceType t, PieceColor c) : type(t), color(c) {}
    
    bool isValid() const { return type != UIPieceType::None; }
    bool isEmpty() const { return type == UIPieceType::None; }
    
    QString getSymbol() const {
        if (isEmpty()) return "";
        
        QChar symbol;
        switch(type) {
            case UIPieceType::King:   symbol = 'K'; break;
            case UIPieceType::Queen:  symbol = 'Q'; break;
            case UIPieceType::Rook:   symbol = 'R'; break;
            case UIPieceType::Bishop: symbol = 'B'; break;
            case UIPieceType::Knight: symbol = 'N'; break;
            case UIPieceType::Pawn:   symbol = 'P'; break;
            default: return "";
        }
        
        return (color == PieceColor::White) ? symbol : symbol.toLower();
    }
    
    QString getImagePath() const {
        if (isEmpty()) return "";
        
        QString colorStr = (color == PieceColor::White) ? "w" : "b";
        QString typeStr;
        
        switch(type) {
            case UIPieceType::King:   typeStr = "k"; break;
            case UIPieceType::Queen:  typeStr = "q"; break;
            case UIPieceType::Rook:   typeStr = "r"; break;
            case UIPieceType::Bishop: typeStr = "b"; break;
            case UIPieceType::Knight: typeStr = "n"; break;
            case UIPieceType::Pawn:   typeStr = "p"; break;
            default: return "";
        }
        
        return QString(":/pieces/%1%2.png").arg(colorStr).arg(typeStr);
    }

    QString getImageCode() const {
        if (isEmpty()) return "";
        
        QString colorStr = (color == PieceColor::White) ? "w" : "b";
        QString typeStr;
        
        switch(type) {
            case UIPieceType::King:   typeStr = "K"; break;  // Uppercase K
            case UIPieceType::Queen:  typeStr = "Q"; break;  // Uppercase Q
            case UIPieceType::Rook:   typeStr = "R"; break;  // Uppercase R
            case UIPieceType::Bishop: typeStr = "B"; break;  // Uppercase B
            case UIPieceType::Knight: typeStr = "N"; break;  // Uppercase N
            case UIPieceType::Pawn:   typeStr = "P"; break;  // Uppercase P
            default: return "";
        }
        
        return colorStr + typeStr;
    }
};

#endif // CHESSPIECE_H
