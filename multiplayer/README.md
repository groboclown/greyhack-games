# Multi-Player Game Lobby

Code for managing a game server, and for clients to connect to it.

## Connecting to a Server and Running a Game

You need to install and build the files [`controller.gs`](controller.gs) and [`lobby.gs`](lobby.gs).  The `controller` program is how you interact with the lobby, and the `lobby` program monitors the server for game updates, and runs the games you connect to.

You will need a server connection file.  It's a plain text file that has the format:

```
ip=(server ip address)
username=(username used to connect to the server)
password=(password used to connect to the server)
port=(port number to connect to the server)
service=(service name, one of 'ftp' or 'ssh')
dir=(server's absolute game directory)
```

First, you launch the `controller` program in one terminal.  This will be what you type in to send commands to the lobby.

Second, you launch the `lobby` program in a second terminal as:

```bash
$ lobby configfile.txt MyHandle
```

You interact with the lobby through the controller terminal.  *Make sure you disconnect nicely, or you won't be able to log in again under that handle without some server surgery.*

The lobby tool allows you to talk with other players on the server in between games, host a new instance of a game, join a pending instance of a game, and start a game with all the players.

The `controller` runs in either key mode or line mode.  Key mode reads each key you type into the terminal, and line mode reads until you press the enter key.  The lobby requires line mode, while some games require key mode.


## Running a Game Lobby Server

A game lobby server requires these things:
    * A computer with a public network address;
    * either FTP or SSH server running on it;
    * at least one user account for players to use to log into the server;
    * a set of files.

The [`example-server`](example-server) shows a [import](https://github.com/groboclown/greyhack-importer) compatible layout for setting up a server's users, groups, file structure, and installs an FTP server (use with caution).  It also installs some sample games.

You'll need to distribute a server connection file as outlined above.  The IP address can be discovered by running `ifconfig`.

## Uploading Games

To upload a game, you

### Game Requirements

The game must be uploaded to the server in the server's shared base directory, under `Games/(simple game name)`.  The folder must contain:

* `about.txt` A long description about the game.  It can contain nice markup tags like `<color>`.
* `gameinfo.txt` A "properties" like file.  The file has Unix line endings (char(10)), and each line is in the format 'key=value'.  It can contain these keys:
    * `name` (required) The human readable name of the game.
    * `desc` (required) A short, one sentence description of the game.
    * `min-players` (required) Minimum number of players needed to start the game.
    * `max-players` (required) Maximum number of players allowed in a game.
    * `client` (required) The name of the source file for non-hosting players.  See below for details.
    * `client-bin` (optional) The location of the compiled binary file, if a bundle was used as the client source.  Can use `~/` or `-/` prefix to indicate relative to the user's home directory.
    * `host` (optional) The name of the source file for the hosting player.  If not given, then all players use the same client file.
    * `host-bin` (optional) The location of the compiled binary file, if a bundle was used as the host source.  Can use `~/` or `-/` prefix to indicate relative to the user's home directory.

When the client is launched, the custom object (`get_custom_object`) contains these values:
    * `gameDir` The File object with the active game directory on the server.  This will contain the file `.host.txt` which contains the ordered list of players, with the hosting player first, separated by a newline (`char(10)`).
    * `server` The server `host_computer` object for the game server.
    * `controller` The local controller File object, needed if the game uses real-time controls.
    * `playerName` The registered player name when joining the pending game on the game server.

An example for interacting with the server and other players is in the [`gamelib.gs`](gamelib.gs) file.


### Uploaded Source

All sources for the game must be located in the owning game directory (`Games/(simple game name)`).

There are two formats of files supported.

* A single source file, which must have a `.src` extension.  This is compiled in-place.
* A bundle file or files.  A bundle has the form `bundle:(file1),(file2),...`, listing out the files (without directory parts) of the game bundle files.  These will be passed as files to the [importer tool](https://github.com/groboclown/greyhack-importer).


## Underlying Server Design

Like all multi-player interactions, the games must communicate through files.  To prevent issues with file corruption or other issues, each player writes their actions to a file owned by the player, and other players read from those files.  There is no central, shared state file.  For programs that require a shared state, one player will have their program act as the central server and will write to the shared state file in addition to the player's file.

The general server structure starts with a shared base directory.  For the sake of example, let's say it's `/share`

The Lobby is the directory `/share/Lobby`, and each player has their own file in `/share/Lobby`.  When a player connects, a new file `/share/Lobby/playername` is created.

The games available to play are put into `/share/Games`, so that there will be `/share/Games/Battleship` and `/share/Games/PubG`.  For the purposes of the lobby, the game folder will also include the directories `Pending` and `Active`.

`Pending` contains one folder for each game that's waiting to start.  The player to create the folder acts as the host for the game, which is put into a special `.host.txt` file and the folder named `.chat.d`.  When a person wants to join the pending game, they create a file in the folder with their player name and the contents of the file are the player's status.  The person hosting the game should also create such a file.  Chat for the pending game can be done in the `.chat.d` folder.

`Active` contains one folder for each active game.  Inside them is the game specific files.
