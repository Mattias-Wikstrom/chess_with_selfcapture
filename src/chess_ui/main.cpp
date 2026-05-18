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

        // Control panel — two rows to keep everything visible
        QWidget *controlPanel = new QWidget(this);
        QVBoxLayout *controlLayout = new QVBoxLayout(controlPanel);
        controlLayout->setContentsMargins(0, 0, 0, 0);

        QWidget *row1 = new QWidget(controlPanel);
        QHBoxLayout *row1Layout = new QHBoxLayout(row1);
        row1Layout->setContentsMargins(0, 0, 0, 0);

        QWidget *row2 = new QWidget(controlPanel);
        QHBoxLayout *row2Layout = new QHBoxLayout(row2);
        row2Layout->setContentsMargins(0, 0, 0, 0);

        QPushButton *newGameBtn = new QPushButton("New Game", this);
        QPushButton *setPositionBtn = new QPushButton("Set Position (FEN)", this);

        vsEngineCheck = new QCheckBox("Play vs Engine", this);

        colorCombo = new QComboBox(this);
        colorCombo->addItem("Play as White");
        colorCombo->addItem("Play as Black");

        statusLabel = new QLabel("White's turn", this);

        row1Layout->addWidget(newGameBtn);
        row1Layout->addWidget(vsEngineCheck);
        row1Layout->addWidget(colorCombo);
        row1Layout->addWidget(statusLabel);
        row1Layout->addStretch();

        row2Layout->addWidget(setPositionBtn);
        row2Layout->addStretch();

        controlLayout->addWidget(row1);
        controlLayout->addWidget(row2);

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
        connect(setPositionBtn, &QPushButton::clicked, this, &MainWindow::onSetPosition);
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
