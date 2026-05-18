#include <QApplication>
#include <QMainWindow>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QPushButton>
#include <QCheckBox>
#include <QComboBox>
#include <QLabel>
#include <QWidget>
#include <QFileDialog>
#include <QCoreApplication>
#include <QDir>
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

        // Control panel
        QWidget *controlPanel = new QWidget(this);
        QHBoxLayout *controlLayout = new QHBoxLayout(controlPanel);

        QPushButton *newGameBtn = new QPushButton("New Game", this);

        vsEngineCheck = new QCheckBox("Play vs Engine", this);

        colorCombo = new QComboBox(this);
        colorCombo->addItem("Play as White");
        colorCombo->addItem("Play as Black");

        statusLabel = new QLabel("White's turn", this);

        controlLayout->addWidget(newGameBtn);
        controlLayout->addWidget(vsEngineCheck);
        controlLayout->addWidget(colorCombo);
        controlLayout->addWidget(statusLabel);
        controlLayout->addStretch();

        mainLayout->addWidget(controlPanel);
        mainLayout->addWidget(chessBoard, 1);

        setCentralWidget(centralWidget);

        // Default engine path: look for stockfish sibling to the app binary,
        // or fall back to the source tree location.
        QString defaultEnginePath = QCoreApplication::applicationDirPath() + "/../stockfish";
        if (!QFile::exists(defaultEnginePath))
            defaultEnginePath = QCoreApplication::applicationDirPath() + "/../../stockfish";
        enginePath = QDir::cleanPath(defaultEnginePath);

        connect(newGameBtn, &QPushButton::clicked, this, &MainWindow::onNewGame);
        connect(vsEngineCheck, &QCheckBox::toggled, this, &MainWindow::onVsEngineToggled);
        connect(colorCombo, QOverload<int>::of(&QComboBox::currentIndexChanged),
                this, &MainWindow::onColorChanged);
        connect(chessBoard, &ChessBoard::moveMade, this, &MainWindow::onMoveMade);
        connect(chessBoard, &ChessBoard::gameOver, this, &MainWindow::onGameOver);
    }

private slots:
    void onNewGame() {
        chessBoard->newGame();
        statusLabel->setText("White's turn");
    }

    void onVsEngineToggled(bool checked) {
        if (checked) {
            // Let the user pick an engine binary if the default doesn't exist
            if (!QFile::exists(enginePath)) {
                enginePath = QFileDialog::getOpenFileName(
                    this, "Select Stockfish engine binary", QDir::homePath());
                if (enginePath.isEmpty()) {
                    vsEngineCheck->setChecked(false);
                    return;
                }
            }
            chessBoard->setVsEngine(true, enginePath);
        } else {
            chessBoard->setVsEngine(false);
        }
    }

    void onColorChanged(int index) {
        Stockfish::Color humanColor = (index == 0) ? Stockfish::WHITE : Stockfish::BLACK;
        chessBoard->setHumanColor(humanColor);
    }

    void onMoveMade(const QString &move) {
        Q_UNUSED(move);
        // Update status based on whose turn it is (ChessBoard doesn't expose it directly,
        // so we just toggle — a proper impl would query the engine side to move)
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
    ChessBoard *chessBoard;
    QLabel *statusLabel;
    QCheckBox *vsEngineCheck;
    QComboBox *colorCombo;
    QString enginePath;
};

#include "main.moc"

int main(int argc, char *argv[]) {
    QApplication app(argc, argv);

    MainWindow window;
    window.show();

    return app.exec();
}
