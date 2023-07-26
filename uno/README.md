# Uno Clone

A clone of Mattel's Uno game (designed by Merle Robbins).

This requires running through the multiplayer server.


## General Design

The game's underlying design is using a MVC (Model View Controller) pattern.  The host and clients use the same view (here being the the whole user interface) and model (the discard pile + deck + player hands), but the controller is different between the host and client.


## Known Issues

1. "Next Player Turn" can show "?" if the direction loops over the index.
2. Need to show the card that was discarded.
3. Playing wild cards MUST require the player to declare the new suit.
