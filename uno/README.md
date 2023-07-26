# Uno Clone

A clone of Mattel's Uno game (designed by Merle Robbins).

This requires running through the multiplayer server.


## General Design

The game's underlying design is using a MVC (Model View Controller) pattern.  The host and clients use the same view (here being the the whole user interface) and model (the discard pile + deck + player hands), but the controller is different between the host and client.
