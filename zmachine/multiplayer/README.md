# Multiplayer Enabled Version

This version of the z-machine interpreter runs only the Mini-Zork game.  Due to the size of the source, it's a bit unwieldy to get going, so it requires a bit of setup.

Build the game bundle.  This will be uploaded to the server, but must be built locally.
    ```bash
    cd zmachine/multiplayer
    python ghtar.py -o minizork.bundle minizork.bundle.json
    ```

Then import the bundle file and the `about.txt` and `gameinfo.txt` files into the `Games/minizork` directory on the server.

Currently there's a limitation on the lobby that can only have a single bundle file.  Multiple bundle files are not supported.
