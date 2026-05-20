
# Chess with Self-Capture

This project is a fork of [Stockfish](https://stockfishchess.org/), the open-source chess engine, with modifications by Mattias Wikström.

### Modifications in this fork

This code modifies Stockfish so that it becomes possible to capture your own pieces.

For more information on this chess variant, see https://arxiv.org/pdf/2009.04374 .

# A graphical user interface for self-capture chess
The directory src/chess_ui contains code for a simple chess GUI which allows you to play self-capture chess either against Stockfish or another human player. There is support for playing as either black or white and for resetting the game to a custom position.

The reason for including this GUI is that many chess GUIs fail to work correctly with self-capture chess.

# A web interface
A web version of the code can be tried at https://mattias-wikstrom.github.io/chess_with_selfcapture/ .

# Quotes from the paper
'Self-capture is sometimes referred to as “Reform Chess” or
“Free Capture Chess”' (p. 2)

On the frequency of self-captures when AlphaZero played against itself (p. 10):
'In Self-capture chess, 52.5% of games featured self-capture
moves, which represented 0.7% of all moves played. The
most common self-captures involved sacrificing a pawn
(86.9%), although sacrificing a bishop (5.3%) or a knight
(4.5%) was not uncommon. Rook self-capture sacrifices
were rare (2.3%) and occasionally AlphaZero would selfcapture a queen (1%), though these were mostly unnecessary
captures in winning positions, given that AlphaZero was not
incentivised to win in the fastest possible way.'

Qualitative assessment of self-capture chess (p. 18):
'Self-capture chess is quite entertaining, as it introduces additional options for sacrificing material – and material sacrifices have a certain aesthetic appeal. Self-capture moves can
feature in all stages of the game. Not every game involves
self-captures, as giving away material is not always required,
but they do feature in a substantial percentage of the games,
and in some games they occur multiple times. Self-capture
moves can be used to open files and squares for the pieces
in the attack; opening up a blockade by sacrificing a pawn
in the pawn chain; or in defence, while escaping the mating
net.'

Motivation behind self-capture chess (p. 85):
'The ability to capture one’s own pieces could help break
“deadlocks” and offer additional ways of infiltrating the
opponent’s position, as well as quickly open files for the
attack. Self-captures provide additional defensive resources
as well, given that the King that is under attack can consider
escaping by self-capturing its own adjacent pieces.'


Vladimir Kramnik on self-capture chess (pp. 86-87):
'I like this variation a lot, I would even go as far
as to say that to me this is simply an improved
version of regular chess.'
'Regardless of its relatively minor effect on the
openings, self-captures add aesthetically beautiful motifs in the middlegames and provide
additional options and winning motifs in the
endgames.'
'Taking one’s own piece represents another way of
sacrificing in chess, and material sacrifices make
chess games more spectacular and enjoyable both
for public and for the players. Most of the times
this is used as an attacking idea, to gain initiative
and compromise the opponent’s king.'
'In terms of endgames, self-captures affect a wide
spectrum of otherwise drawish endgame positions
winning for the stronger side.'
'To conclude, I would highly recommend this variation for chess lovers who value beauty in the
game on top of everything else.'

#Chess positions shown in the paper
Position shown on page 5:
r1b2bk1/pp3p2/2n1rn2/q2pp1B1/2P4P/P3P3/1PQN1PP1/2KR1B1R w - - 0 1
'An example from Self-capture chess: a self-capture move
Rxh4 generates threats against the Black king.'

Position shown on page 86:
r1b1kb1r/1ppp2pp/p1n5/5p2/B2Nn2q/6P1/PPP2P1P/RNBQR1K1 b kq - 0 1
'[...] in self-capture chess Black can respond to
g3 by taking its own pawn on h7 with the queen,
gaining a tempo on the open file.'

Position shown on page 87:
1b6/1P6/8/5B2/3k4/8/6K1/8 w - - 0 1
'In this position, under Classical rules, the game
would be an easy draw for Black. In Self-capture
chess, however, this is a trivial win for White, who
can play Bc8 and then capture the bishop with the
b7 pawn, promoting to a queen!'

Position shown on page 87:
8/4bk2/3pRp2/p1pP1Pp1/PpP3Pp/1P3K1P/8/8 w - - 0 1
'This endgame, which represents a fortress in classical chess, becomes a trivial win in self-capture
chess, due to the possibilities for the White king
to infiltrate the Black position either via e4 and a
self-capture on d5 or via e2, d3 and a self-capture
on c4.'

Position shown on page 88:
8/5pk1/QPp5/3p4/P2P4/4PK2/5r1r/8 w - - 0 1
'Unlike in classical chess, White can still play on here, and
AlphaZero does, by advancing the king forward with a selfcapture!'

Position shown on page 89:
2kr4/1b2np2/p1p1p3/4P3/Ppp1P3/2N3P1/1P2BP2/2K4R w - - 0 1
'Here we come to the first self-capture of the game, White
decides to give up the a4 pawn in order to get the knight to
an active square.'

## License

Stockfish is licensed under the GPL v3. This fork follows the same license.
