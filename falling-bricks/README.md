# About

A block movement style game, for the Grey Hack game.

[Preview Image](falling-bricks.gif) *Warning - flashes heavily; standard seizure warnings apply.*


## Installing

Copy the text of [`fallingbricks.src`](fallingbricks.src) into the Grey Hack game, in a new text file, say `Downloads/fallingbricks.src`

Then, build it.  For example:

```bash
$ build Downloads/fallingbricks.src /home/guest
```


## Playing

Start two terminal windows.  The first one shows the game state, the other one controls it.

Each terminal will run the `fallingbricks`

**Terminal 1:**

Start the display:

```bash
$ /home/guest/fallingbricks /home/guest/c.txt -d
```

**Terminal 2:**

Start the controller:

```bash
$ /home/guest/fallingbricks /home/guest/c.txt
```

You'll need the controller terminal to have the focus in order to play.  To play:

* Left arrow - move the block left.
* Right arrow - move the block right.
* Down arrow - advance the block down.
* up arrow - rotate the block.
* z - rotate the block one way.
* x - rotate the block the other way.


# Bugs

* There's a super annoying flicker.  The refresh rate needs to be set just right.
