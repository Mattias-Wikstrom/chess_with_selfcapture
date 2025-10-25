#include <QApplication>
#include <QMainWindow>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QPushButton>
#include <QLabel>
#include <QWidget>
#include "chessboard.h"

class MainWindow : public QMainWindow {
public:
    MainWindow(QWidget *parent = nullptr) : QMainWindow(parent) {
        setWindowTitle("Self-Capture Chess");
        setMinimumSize(600, 600);
        
        // Create central widget and main layout
        QWidget *centralWidget = new QWidget(this);
        QVBoxLayout *mainLayout = new QVBoxLayout(centralWidget);
        
        // Create chess board
        chessBoard = new ChessBoard(this);
        
        // Create control panel
        QWidget *controlPanel = new QWidget(this);
        QHBoxLayout *controlLayout = new QHBoxLayout(controlPanel);
        
        //QPushButton *newGameBtn = new QPushButton("New Game", this);
        //QPushButton *resetBtn = new QPushButton("Reset Board", this);
        statusLabel = new QLabel("White's turn", this);
        
        //controlLayout->addWidget(newGameBtn);
        //controlLayout->addWidget(resetBtn);
        controlLayout->addWidget(statusLabel);
        controlLayout->addStretch();
        
        // Add widgets to main layout
        mainLayout->addWidget(controlPanel);
        mainLayout->addWidget(chessBoard, 1);
        
        setCentralWidget(centralWidget);
        
        // Connect signals
        //connect(newGameBtn, &QPushButton::clicked, this, &MainWindow::onNewGame);
        //connect(resetBtn, &QPushButton::clicked, this, &MainWindow::onResetBoard);
    }

private slots:
    void onNewGame() {
        // TODO: Implement new game logic
        statusLabel->setText("New game started - White's turn");
    }
    
    void onResetBoard() {
        // TODO: Implement board reset
        statusLabel->setText("Board reset - White's turn");
    }

private:
    ChessBoard *chessBoard;
    QLabel *statusLabel;
};

int main(int argc, char *argv[]) {
    QApplication app(argc, argv);
    
    MainWindow window;
    window.show();
    
    return app.exec();
}
