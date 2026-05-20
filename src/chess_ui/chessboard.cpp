#include "chessboard.h"
#include <QPainter>
#include <QMouseEvent>
#include <QResizeEvent>
#include <QDebug>
#include <QSvgRenderer>
#include <QDir>
#include <QMessageBox>
#include <QTimer>

#include <iostream>

ChessBoard::ChessBoard(QWidget *parent) 
    : QWidget(parent), hasSelection(false), isDragging(false), squareSize(60) {
    engine.initialize();
    initializeBoard();
    loadPieceImages();
    setMinimumSize(480, 480);
    setMouseTracking(true);
}

ChessBoard::~ChessBoard() {
    // Clean up SVG renderers
    for (auto *renderer : svgRenderers) {
        delete renderer;
    }
    svgRenderers.clear();
}

void ChessBoard::initializeBoard() {
    board.resize(BOARD_SIZE, std::vector<ChessPiece>(BOARD_SIZE));
    syncBoardWithEngine();  // Initialize board from engine
}

void ChessBoard::newGame() {
    engineThinking = false;
    engine.setPosition();
    syncBoardWithEngine();
    update();
    // If human plays black the engine moves first
    if (vsEngine && engine.sideToMove() != humanColor)
        QTimer::singleShot(200, this, &ChessBoard::triggerEngineMove);
}

void ChessBoard::setPositionFromFen(const QString &fen) {
    engineThinking = false;
    engine.setPosition(fen.toStdString());
    syncBoardWithEngine();
    update();
    if (vsEngine && engine.sideToMove() != humanColor)
        QTimer::singleShot(200, this, &ChessBoard::triggerEngineMove);
}

void ChessBoard::setVsEngine(bool enabled, const QString &enginePath) {
    vsEngine = enabled;
    if (enabled) {
        if (!uciEngine) {
            uciEngine = new UciEngine(this);
            connect(uciEngine, &UciEngine::engineReady,   this, &ChessBoard::onEngineReady);
            connect(uciEngine, &UciEngine::bestMoveReady, this, &ChessBoard::onEngineBestMove);
            connect(uciEngine, &UciEngine::engineError,   this, &ChessBoard::onEngineError);
        }
        QString path = enginePath.isEmpty() ? uciEnginePath : enginePath;
        if (!path.isEmpty())
            uciEnginePath = path;
        if (!uciEngine->isRunning() && !uciEnginePath.isEmpty()) {
            if (!uciEngine->start(uciEnginePath)) {
                vsEngine = false;
                return;
            }
        } else if (uciEngine->isRunning()) {
            // Already running (e.g. re-enabling after a new game) — move immediately if needed
            if (engine.sideToMove() != humanColor)
                QTimer::singleShot(100, this, &ChessBoard::triggerEngineMove);
        }
    }
}

void ChessBoard::onEngineReady() {
    // Engine handshake complete — trigger its first move if it plays the current side
    if (vsEngine && engine.sideToMove() != humanColor)
        QTimer::singleShot(100, this, &ChessBoard::triggerEngineMove);
}

void ChessBoard::setHumanColor(Stockfish::Color color) {
    humanColor = color;
}

void ChessBoard::triggerEngineMove() {
    if (!vsEngine || !uciEngine || engineThinking) return;
    engineThinking = true;
    uciEngine->requestMove(QString::fromStdString(engine.getFEN()));
}

void ChessBoard::onEngineBestMove(const QString &move) {
    engineThinking = false;
    std::string moveStr = move.toStdString();
    if (engine.isLegalMove(moveStr) && engine.makeMove(moveStr)) {
        syncBoardWithEngine();
        emit moveMade(move);
        update();
        if (engine.isGameOver())
            emit gameOver("Game Over");
        else if (vsEngine && engine.sideToMove() != humanColor)
            QTimer::singleShot(100, this, &ChessBoard::triggerEngineMove);
    } else {
        qDebug() << "Engine returned illegal move:" << move;
    }
}

void ChessBoard::onEngineError(const QString &msg) {
    engineThinking = false;
    QMessageBox::warning(this, "Engine Error", msg);
}

void ChessBoard::syncBoardWithEngine() {
    // Sync our board representation with the engine's state
    for (int row = 0; row < BOARD_SIZE; ++row) {
        for (int col = 0; col < BOARD_SIZE; ++col) {
            Stockfish::Piece piece = engine.pieceOn(col, row);
            
            if (piece == Stockfish::NO_PIECE) {
                board[row][col] = ChessPiece();
                continue;
            }
            
            // Convert Stockfish piece to our piece type
            UIPieceType type;
            switch (type_of(piece)) {
                case Stockfish::PAWN:   type = UIPieceType::Pawn; break;
                case Stockfish::KNIGHT: type = UIPieceType::Knight; break;
                case Stockfish::BISHOP: type = UIPieceType::Bishop; break;
                case Stockfish::ROOK:   type = UIPieceType::Rook; break;
                case Stockfish::QUEEN:  type = UIPieceType::Queen; break;
                case Stockfish::KING:   type = UIPieceType::King; break;
                default: type = UIPieceType::None; break;
            }
            
            PieceColor color = color_of(piece) == Stockfish::WHITE ? 
                              PieceColor::White : PieceColor::Black;
            
            board[row][col] = ChessPiece(type, color);
        }
    }
}


/*bool ChessBoard::isValidMove(const QPoint& from, const QPoint& to) const {
    std::string fromSquare = ChessEngine::toAlgebraic(from.x(), from.y());
    std::string toSquare = ChessEngine::toAlgebraic(to.x(), to.y());
    std::string moveString = fromSquare + toSquare;
    
    return engine.isLegalMove(moveString);
}*/

void ChessBoard::loadPieceImages() {
    // List of all piece codes
    QList<QString> pieceCodes = {
        "wK", "wQ", "wR", "wB", "wN", "wP",
        "bK", "bQ", "bR", "bB", "bN", "bP"
    };
    
    for (const QString &code : pieceCodes) {
        QString path = QString("../resources/pieces/%1.svg").arg(code);
        QSvgRenderer *renderer = new QSvgRenderer(path, this);
        
        if (!renderer->isValid()) {
            delete renderer;
            path = QString("resources/pieces/%1.svg").arg(code);
            renderer = new QSvgRenderer(path, this);
        }
        
        if (renderer->isValid()) {
            svgRenderers[code] = renderer;
        } else {
            delete renderer;
        }
    }
}

void ChessBoard::paintEvent(QPaintEvent *event) {
    Q_UNUSED(event);
    
    QPainter painter(this);
    painter.setRenderHint(QPainter::Antialiasing);
    
    drawBoard(painter);
    if (hasSelection && !isDragging) {
        drawSelection(painter);
    }
    drawPieces(painter);
    
    // Draw the dragged piece on top of everything
    if (isDragging) {
        drawDraggedPiece(painter);
    }
}

void ChessBoard::drawBoard(QPainter &painter) {
    for (int row = 0; row < BOARD_SIZE; ++row) {
        for (int col = 0; col < BOARD_SIZE; ++col) {
            QColor color = ((row + col) % 2 == 0) ? lightSquareColor : darkSquareColor;
            painter.fillRect(col * squareSize, row * squareSize, squareSize, squareSize, color);
        }
    }
}

void ChessBoard::drawPieces(QPainter &painter) {
    painter.setRenderHint(QPainter::Antialiasing);
    painter.setRenderHint(QPainter::SmoothPixmapTransform);
    
    for (int row = 0; row < BOARD_SIZE; ++row) {
        for (int col = 0; col < BOARD_SIZE; ++col) {
            // Skip the square we're dragging from
            if (isDragging && dragStartSquare.x() == col && dragStartSquare.y() == row) {
                continue;
            }
            
            const ChessPiece &piece = board[row][col];
            if (piece.isEmpty()) continue;
            
            QString imageCode = piece.getImageCode();
            
            if (svgRenderers.contains(imageCode)) {
                QSvgRenderer *renderer = svgRenderers[imageCode];
                
                int x = col * squareSize;
                int y = row * squareSize;
                int padding = squareSize / 8;
                
                QRectF targetRect(
                    x + padding,
                    y + padding,
                    squareSize - 2 * padding,
                    squareSize - 2 * padding
                );
                
                renderer->render(&painter, targetRect);
            } else {
                // Fallback to text
                QString symbol = piece.getSymbol();
                QColor textColor = (piece.color == PieceColor::White) ? Qt::white : Qt::black;
                
                QFont font = painter.font();
                font.setPointSize(squareSize / 2);
                painter.setFont(font);
                painter.setPen(textColor);
                painter.drawText(col * squareSize, row * squareSize, 
                               squareSize, squareSize, 
                               Qt::AlignCenter, symbol);
            }
        }
    }
}

void ChessBoard::drawDraggedPiece(QPainter &painter) {
    if (!draggedPiece.isEmpty()) {
        QString imageCode = draggedPiece.getImageCode();
        
        if (svgRenderers.contains(imageCode)) {
            QSvgRenderer *renderer = svgRenderers[imageCode];
            
            // Get current mouse position
            QPoint mousePos = mapFromGlobal(QCursor::pos());
            
            // Calculate position centered on mouse
            int pieceSize = squareSize * 0.8;  // Slightly smaller when dragging
            int x = mousePos.x() - pieceSize / 2;
            int y = mousePos.y() - pieceSize / 2;
            
            QRectF targetRect(x, y, pieceSize, pieceSize);
            renderer->render(&painter, targetRect);
            
            // Draw a semi-transparent version at the original position
            painter.setOpacity(0.3);
            int origX = dragStartSquare.x() * squareSize;
            int origY = dragStartSquare.y() * squareSize;
            int padding = squareSize / 8;
            QRectF origTargetRect(
                origX + padding,
                origY + padding,
                squareSize - 2 * padding,
                squareSize - 2 * padding
            );
            renderer->render(&painter, origTargetRect);
            painter.setOpacity(1.0);
            
        } else {
            // Text fallback for dragged piece
            QString symbol = draggedPiece.getSymbol();
            QColor textColor = (draggedPiece.color == PieceColor::White) ? Qt::white : Qt::black;
            
            QFont font = painter.font();
            font.setPointSize(squareSize / 2);
            painter.setFont(font);
            painter.setPen(textColor);
            
            QPoint mousePos = mapFromGlobal(QCursor::pos());
            int x = mousePos.x() - squareSize / 2;
            int y = mousePos.y() - squareSize / 2;
            
            painter.drawText(x, y, squareSize, squareSize, Qt::AlignCenter, symbol);
        }
    }
}

void ChessBoard::drawSelection(QPainter &painter) {
    painter.fillRect(selectedSquare.x() * squareSize, 
                    selectedSquare.y() * squareSize, 
                    squareSize, squareSize, selectionColor);
}

void ChessBoard::mousePressEvent(QMouseEvent *event) {
    QPoint boardPos = screenToBoard(event->pos());
    if (isValidBoardPosition(boardPos)) {
        const ChessPiece &piece = board[boardPos.y()][boardPos.x()];
        
        if (piece.isValid()) {
            // Start dragging if there's a piece
            startDrag(boardPos);
        } else {
            // Clear selection if clicking empty square
            hasSelection = false;
        }
        update();
    }
}

void ChessBoard::mouseMoveEvent(QMouseEvent *event) {
    if (isDragging) {
        // Update the display while dragging
        update();
    }
}

void ChessBoard::mouseReleaseEvent(QMouseEvent *event) {
    if (isDragging) {
        QPoint boardPos = screenToBoard(event->pos());
        if (isValidBoardPosition(boardPos)) {
            endDrag(boardPos);
        } else {
            // Cancel drag if released outside the board
            isDragging = false;
            draggedPiece = ChessPiece();
        }
        update();
    }
}

/*void ChessBoard::endDrag(const QPoint &boardPos) {
    if (!isDragging) return;
    
    std::string fromSquare = ChessEngine::toAlgebraic(dragStartSquare.x(), dragStartSquare.y());
    std::string toSquare = ChessEngine::toAlgebraic(boardPos.x(), boardPos.y());
    std::string moveString = fromSquare + toSquare;
    
    if (isValidMove(dragStartSquare, boardPos)) {
        // Valid move - execute it
        if (engine.makeMove(moveString)) {
            syncBoardWithEngine();  // Update board from engine
            emit moveMade(QString::fromStdString(moveString));
            
            qDebug() << "Move executed:" << QString::fromStdString(moveString);
            
            // Check for game over
            if (engine.isGameOver()) {
                emit gameOver("Game Over");  // You can add more specific results
            }
        }
    } else {
        // Invalid move - return piece to original position
        board[dragStartSquare.y()][dragStartSquare.x()] = draggedPiece;
        qDebug() << "Invalid move:" << QString::fromStdString(moveString);
    }
    
    // Reset drag state
    isDragging = false;
    draggedPiece = ChessPiece();
    update();
}*/

void ChessBoard::resizeEvent(QResizeEvent *event) {
    Q_UNUSED(event);
    squareSize = qMin(width(), height()) / BOARD_SIZE;
    update();
}

QPoint ChessBoard::screenToBoard(const QPoint &screenPos) const {
    int col = screenPos.x() / squareSize;
    int row = screenPos.y() / squareSize;
    return QPoint(col, row);
}

bool ChessBoard::isValidBoardPosition(const QPoint &pos) const {
    return pos.x() >= 0 && pos.x() < BOARD_SIZE && 
           pos.y() >= 0 && pos.y() < BOARD_SIZE;
}

void ChessBoard::handleSquareClick(const QPoint &boardPos) {
    if (hasSelection && selectedSquare == boardPos) {
        // Deselect if clicking the same square
        hasSelection = false;
    } else {
        selectedSquare = boardPos;
        hasSelection = true;
        
        const ChessPiece &piece = board[boardPos.y()][boardPos.x()];
        if (piece.isValid()) {
            qDebug() << "Selected:" << piece.getSymbol() 
                     << "at" << char('a' + boardPos.x()) << (8 - boardPos.y());
        }
    }
}

void ChessBoard::startDrag(const QPoint &boardPos) {
    // Block interaction while the engine is thinking or when it's the engine's turn
    if (vsEngine && (engineThinking || engine.sideToMove() != humanColor))
        return;

    const ChessPiece &startDragpiece = board[boardPos.y()][boardPos.x()];
    if (startDragpiece.isEmpty()) return;

    // Check if it's the correct side to move
    PieceColor currentSide = (engine.sideToMove() == Stockfish::WHITE) ?
                            PieceColor::White : PieceColor::Black;
    if (startDragpiece.color != currentSide) {
        qDebug() << "Not your turn!";
        return;
    }
    
    dragStartSquare = boardPos;
    draggedPiece = startDragpiece;
    isDragging = true;
    pendingPromotion = false;
    
    // Remove the piece from the board temporarily for visual effect
    //board[boardPos.y()][boardPos.x()] = ChessPiece();
}

void ChessBoard::endDrag(const QPoint &boardPos) {
    if (!isDragging) return;
    
    dragEndSquare = boardPos;

    if (needsPromotion(dragStartSquare, boardPos)) {
        pendingPromotion = true;
        PromotionDialog dialog(this, draggedPiece.color);
        if (dialog.exec() == QDialog::Accepted) {
            completeMove(dialog.getSelectedPiece());
        } else {
            board[dragStartSquare.y()][dragStartSquare.x()] = draggedPiece;
        }
    } else {
        completeMove();
    }
    
    // Reset drag state
    isDragging = false;
    draggedPiece = ChessPiece();
    pendingPromotion = false;
    update();
}

void ChessBoard::completeMove(UIPieceType promotionPiece) {
    std::string fromSquare = ChessEngine::toAlgebraic(dragStartSquare.x(), dragStartSquare.y());
    std::string toSquare = ChessEngine::toAlgebraic(dragEndSquare.x(), dragEndSquare.y());
    std::string moveString = fromSquare + toSquare;
    
    if (promotionPiece != UIPieceType::None) {
        char promoChar;
        switch (promotionPiece) {
            case UIPieceType::Rook:   promoChar = 'r'; break;
            case UIPieceType::Bishop: promoChar = 'b'; break;
            case UIPieceType::Knight: promoChar = 'n'; break;
            default: promoChar = 'q'; break;
        }
        moveString += promoChar;
    }

    
    if (engine.isLegalMove(moveString)) {
        // Valid move - execute it
        if (engine.makeMove(moveString)) {
            syncBoardWithEngine();
            emit moveMade(QString::fromStdString(moveString));

            qDebug() << "Move executed:" << QString::fromStdString(moveString);

            if (engine.isGameOver()) {
                emit gameOver("Game Over");
            } else if (vsEngine && engine.sideToMove() != humanColor) {
                QTimer::singleShot(100, this, &ChessBoard::triggerEngineMove);
            }
        }
    } else {
        // Invalid move - return piece to original position
        board[dragStartSquare.y()][dragStartSquare.x()] = draggedPiece;
        qDebug() << "Invalid move:" << QString::fromStdString(moveString);
    }
}

bool ChessBoard::needsPromotion(const QPoint& from, const QPoint& to) const {
    const ChessPiece &piece = board[from.y()][from.x()];
    if (piece.type != UIPieceType::Pawn) return false;
    return (piece.color == PieceColor::White && to.y() == 0) ||
           (piece.color == PieceColor::Black && to.y() == 7);
}

bool ChessBoard::isValidMove(const QPoint& from, const QPoint& to) const {
    std::string fromSquare = ChessEngine::toAlgebraic(from.x(), from.y());
    std::string toSquare = ChessEngine::toAlgebraic(to.x(), to.y());
    std::string moveString = fromSquare + toSquare;

    if (engine.isLegalMove(moveString)) return true;

    if (needsPromotion(from, to)) {
        return engine.isLegalMove(moveString + "q") ||
               engine.isLegalMove(moveString + "r") ||
               engine.isLegalMove(moveString + "b") ||
               engine.isLegalMove(moveString + "n");
    }

    return false;
}

void ChessBoard::handlePromotion(UIPieceType promotionPiece) {
    if (pendingPromotion) {
        completeMove(promotionPiece);
        pendingPromotion = false;
    }
}

// Promotion Dialog Implementation
PromotionDialog::PromotionDialog(QWidget *parent, PieceColor color) 
    : QDialog(parent), selectedPiece(UIPieceType::Queen), pieceColor(color) {
    setWindowTitle("Pawn Promotion");
    setModal(true);
    setFixedSize(300, 150);
    
    QVBoxLayout *mainLayout = new QVBoxLayout(this);
    QLabel *label = new QLabel("Choose promotion piece:", this);
    mainLayout->addWidget(label);
    
    QHBoxLayout *buttonLayout = new QHBoxLayout();
    
    // Create promotion buttons
    QPushButton *queenBtn = new QPushButton("Queen", this);
    QPushButton *rookBtn = new QPushButton("Rook", this);
    QPushButton *bishopBtn = new QPushButton("Bishop", this);
    QPushButton *knightBtn = new QPushButton("Knight", this);
    
    // Style buttons based on piece color
    QString style = color == PieceColor::White ? 
        "QPushButton { background-color: white; color: black; border: 2px solid black; }" :
        "QPushButton { background-color: black; color: white; border: 2px solid white; }";
    
    queenBtn->setStyleSheet(style);
    rookBtn->setStyleSheet(style);
    bishopBtn->setStyleSheet(style);
    knightBtn->setStyleSheet(style);
    
    buttonLayout->addWidget(queenBtn);
    buttonLayout->addWidget(rookBtn);
    buttonLayout->addWidget(bishopBtn);
    buttonLayout->addWidget(knightBtn);
    
    mainLayout->addLayout(buttonLayout);
    
    // Connect buttons
    connect(queenBtn, &QPushButton::clicked, this, &PromotionDialog::onQueenClicked);
    connect(rookBtn, &QPushButton::clicked, this, &PromotionDialog::onRookClicked);
    connect(bishopBtn, &QPushButton::clicked, this, &PromotionDialog::onBishopClicked);
    connect(knightBtn, &QPushButton::clicked, this, &PromotionDialog::onKnightClicked);
}

void PromotionDialog::onQueenClicked() {
    selectedPiece = UIPieceType::Queen;
    accept();
}

void PromotionDialog::onRookClicked() {
    selectedPiece = UIPieceType::Rook;
    accept();
}

void PromotionDialog::onBishopClicked() {
    selectedPiece = UIPieceType::Bishop;
    accept();
}

void PromotionDialog::onKnightClicked() {
    selectedPiece = UIPieceType::Knight;
    accept();
}