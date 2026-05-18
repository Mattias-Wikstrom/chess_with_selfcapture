#include <QApplication>
#include <QMainWindow>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QPushButton>
#include <QComboBox>
#include <QLabel>
#include <QWidget>
#include <QFileDialog>
#include <QCoreApplication>
#include <QDir>
#include <QDialog>
#include <QLineEdit>
#include <QDialogButtonBox>
#include <QMessageBox>
#include "chessboard.h"

class MainWindow : public QMainWindow {
    Q_OBJECT
public:
    MainWindow(QWidget *parent = nullptr) : QMainWindow(parent) {
        setWindowTitle("Self-Capture Chess");
        setMinimumSize(640, 680);

        QWidget *centralWidget = new QWidget(this);
        QVBoxLayout *mainLayout = new QVBoxLayout(centralWidget);

        chessBoard = new ChessBoard(this);

        QWidget *controlPanel = new QWidget(this);
        QVBoxLayout *controlLayout = new QVBoxLayout(controlPanel);
        controlLayout->setContentsMargins(0, 0, 0, 0);

        // Row 1: mode selection
        QWidget *row1 = new QWidget(controlPanel);
        QHBoxLayout *row1Layout = new QHBoxLayout(row1);
        row1Layout->setContentsMargins(0, 0, 0, 0);

        modeCombo = new QComboBox(this);
        modeCombo->addItem("Play as White vs Engine");
        modeCombo->addItem("Play as Black vs Engine");
        modeCombo->addItem("Player vs Player");
        modeCombo->addItem("Engine vs Engine");

        row1Layout->addWidget(modeCombo);
        row1Layout->addStretch();

        // Row 2: game controls
        QWidget *row2 = new QWidget(controlPanel);
        QHBoxLayout *row2Layout = new QHBoxLayout(row2);
        row2Layout->setContentsMargins(0, 0, 0, 0);

        QPushButton *newGameBtn = new QPushButton("New Game", this);
        QPushButton *setPositionBtn = new QPushButton("Set Position (FEN)", this);

        row2Layout->addWidget(newGameBtn);
        row2Layout->addWidget(setPositionBtn);
        row2Layout->addStretch();

        // Row 3: status
        QWidget *row3 = new QWidget(controlPanel);
        QHBoxLayout *row3Layout = new QHBoxLayout(row3);
        row3Layout->setContentsMargins(0, 0, 0, 0);

        statusLabel = new QLabel("White's turn", this);
        row3Layout->addWidget(statusLabel);
        row3Layout->addStretch();

        controlLayout->addWidget(row1);
        controlLayout->addWidget(row2);
        controlLayout->addWidget(row3);

        mainLayout->addWidget(controlPanel);
        mainLayout->addWidget(chessBoard, 1);

        setCentralWidget(centralWidget);

        QString defaultEnginePath = QCoreApplication::applicationDirPath() + "/../stockfish";
        if (!QFile::exists(defaultEnginePath))
            defaultEnginePath = QCoreApplication::applicationDirPath() + "/../../stockfish";
        enginePath = QDir::cleanPath(defaultEnginePath);

        connect(newGameBtn, &QPushButton::clicked, this, &MainWindow::onNewGame);
        connect(setPositionBtn, &QPushButton::clicked, this, &MainWindow::onSetPosition);
        connect(modeCombo, QOverload<int>::of(&QComboBox::currentIndexChanged),
                this, &MainWindow::onModeChanged);
        connect(chessBoard, &ChessBoard::moveMade, this, &MainWindow::onMoveMade);
        connect(chessBoard, &ChessBoard::gameOver, this, &MainWindow::onGameOver);

        // Apply initial mode
        applyMode(modeCombo->currentIndex());
    }

private slots:
    void onNewGame() {
        chessBoard->newGame();
        statusLabel->setText("White's turn");
    }

    void onSetPosition() {
        QDialog dialog(this);
        dialog.setWindowTitle("Set Position (FEN)");
        QVBoxLayout *layout = new QVBoxLayout(&dialog);

        QLabel *label = new QLabel("Enter FEN string:", &dialog);
        QLineEdit *fenEdit = new QLineEdit(&dialog);
        fenEdit->setPlaceholderText("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
        fenEdit->setMinimumWidth(480);

        QDialogButtonBox *buttons = new QDialogButtonBox(
            QDialogButtonBox::Ok | QDialogButtonBox::Cancel, &dialog);

        layout->addWidget(label);
        layout->addWidget(fenEdit);
        layout->addWidget(buttons);

        connect(buttons, &QDialogButtonBox::accepted, &dialog, &QDialog::accept);
        connect(buttons, &QDialogButtonBox::rejected, &dialog, &QDialog::reject);

        if (dialog.exec() != QDialog::Accepted)
            return;

        QString fen = fenEdit->text().trimmed();
        if (fen.isEmpty())
            return;

        try {
            chessBoard->setPositionFromFen(fen);
            QStringList parts = fen.split(' ');
            if (parts.size() >= 2 && parts[1] == "b")
                statusLabel->setText("Black's turn");
            else
                statusLabel->setText("White's turn");
        } catch (...) {
            QMessageBox::warning(this, "Invalid FEN", "The FEN string is invalid.");
        }
    }

    void onModeChanged(int index) {
        applyMode(index);
    }

    void onMoveMade(const QString &move) {
        Q_UNUSED(move);
        QString current = statusLabel->text();
        if (current.startsWith("White"))
            statusLabel->setText("Black's turn");
        else if (current.startsWith("Black"))
            statusLabel->setText("White's turn");
    }

    void onGameOver(const QString &result) {
        statusLabel->setText("Game over: " + result);
    }

private:
    void applyMode(int index) {
        // 0: White vs Engine, 1: Black vs Engine, 2: PvP, 3: EvE
        bool vsEngine = (index == 0 || index == 1 || index == 3);

        if (vsEngine && !QFile::exists(enginePath)) {
            enginePath = QFileDialog::getOpenFileName(
                this, "Select Stockfish engine binary", QDir::homePath());
            if (enginePath.isEmpty()) {
                modeCombo->setCurrentIndex(2); // fall back to PvP
                return;
            }
        }

        if (index == 0) {
            chessBoard->setVsEngine(true, enginePath);
            chessBoard->setHumanColor(Stockfish::WHITE);
        } else if (index == 1) {
            chessBoard->setVsEngine(true, enginePath);
            chessBoard->setHumanColor(Stockfish::BLACK);
        } else if (index == 2) {
            chessBoard->setVsEngine(false);
        } else {
            // Engine vs engine: engine plays both sides
            chessBoard->setVsEngine(true, enginePath);
            chessBoard->setHumanColor(Stockfish::COLOR_NB); // no human
        }
    }

    ChessBoard *chessBoard;
    QLabel *statusLabel;
    QComboBox *modeCombo;
    QString enginePath;
};

#include "main.moc"

int main(int argc, char *argv[]) {
    QApplication app(argc, argv);

    MainWindow window;
    window.show();

    return app.exec();
}
