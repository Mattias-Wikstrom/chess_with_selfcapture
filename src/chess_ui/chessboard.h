#ifndef CHESSBOARD_H
#define CHESSBOARD_H

#include <QWidget>
#include <QPainter>
#include <QMouseEvent>
#include <QPoint>
#include <QSvgRenderer>
#include <QMap>
#include <QDebug>
#include <QDialog>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QPushButton>
#include <QLabel>
#include <vector>
#include "engine_integration.h"
#include "chesspiece.h"
#include "uci_engine.h"

// Promotion Dialog
class PromotionDialog : public QDialog {
    Q_OBJECT
public:
    PromotionDialog(QWidget *parent = nullptr, PieceColor color = PieceColor::White);
    UIPieceType getSelectedPiece() const { return selectedPiece; }

private slots:
    void onQueenClicked();
    void onRookClicked();
    void onBishopClicked();
    void onKnightClicked();

private:
    UIPieceType selectedPiece;
    PieceColor pieceColor;
};

class ChessBoard : public QWidget {
    Q_OBJECT

public:
    explicit ChessBoard(QWidget *parent = nullptr);
    ~ChessBoard();
    void initializeBoard();
    void newGame();
    void setPositionFromFen(const QString &fen);

    // Engine opponent
    void setVsEngine(bool enabled, const QString &enginePath = QString());
    void setHumanColor(Stockfish::Color color);  // which side the human plays
    
signals:
    void moveMade(const QString& move);  // Signal when a move is made
    void gameOver(const QString& result); // Signal when game ends

protected:
    void paintEvent(QPaintEvent *event) override;
    void mousePressEvent(QMouseEvent *event) override;
    void mouseMoveEvent(QMouseEvent *event) override;
    void mouseReleaseEvent(QMouseEvent *event) override;
    void resizeEvent(QResizeEvent *event) override;

private slots:
    void handlePromotion(UIPieceType promotionPiece);
    void onEngineReady();
    void onEngineBestMove(const QString &move);
    void onEngineError(const QString &msg);

private:
    static const int BOARD_SIZE = 8;
    std::vector<std::vector<ChessPiece>> board;
    QPoint selectedSquare;
    bool hasSelection;
    bool isDragging;
    int squareSize;
    
    bool pendingPromotion;  // Track if we're waiting for promotion choice
    
    // Drag and drop members
    QPoint dragStartSquare;
    QPoint dragEndSquare;  // Store where we're dragging to
    ChessPiece draggedPiece;
    
    // Engine integration (rules/position)
    ChessEngine engine;

    // UCI engine for computer opponent
    UciEngine *uciEngine = nullptr;
    bool vsEngine = false;
    bool engineThinking = false;
    Stockfish::Color humanColor = Stockfish::WHITE;
    QString uciEnginePath;

    void triggerEngineMove();

    QMap<QString, QSvgRenderer*> svgRenderers;
    
    void drawBoard(QPainter &painter);
    void drawPieces(QPainter &painter);
    void drawSelection(QPainter &painter);
    void drawDraggedPiece(QPainter &painter);
    void loadPieceImages();
    void startDrag(const QPoint &boardPos);
    void endDrag(const QPoint &boardPos);
    void syncBoardWithEngine();  // Sync UI with engine state
    bool needsPromotion(const QPoint& from, const QPoint& to) const;
    void completeMove(UIPieceType promotionPiece = UIPieceType::None);  // Default to queen
    bool isValidMove(const QPoint& from, const QPoint& to) const;
    QPoint screenToBoard(const QPoint &screenPos) const;
    bool isValidBoardPosition(const QPoint &pos) const;
    void handleSquareClick(const QPoint &boardPos);
    
    QColor lightSquareColor = QColor(240, 217, 181);
    QColor darkSquareColor = QColor(181, 136, 99);
    QColor selectionColor = QColor(100, 200, 100, 100);
    QColor validMoveColor = QColor(100, 200, 100, 80);  // For highlighting valid moves
};

#endif // CHESSBOARD_H