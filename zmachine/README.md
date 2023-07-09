# Play Infocom and Inform Games in Grey Hack.

The interpreter loads old Infocom style text adventures and allows you to play them.

The files need to be encoded into Ascii85, so that the program can load the contents.  Grey Hack only allows us to load text files, hence the limitation.  You can convert it by using the following Python code, switching out `myfile.z5` for the appropriate file name:

```python
import base64

source = "myfile.z5"
target = "myfile.z5.txt"
with open(source, "br") as inp:
    with open(target, "w", encoding="utf-8") as out:
        out.write(base64.a85encode(inp.read()).decode("ascii"))
```

Or, you can use the fine [Grey Hack Importer](https://github.com/groboclown/greyhack-importer/) tool, which supports storing binary files as Ascii85 encoded files on the game computer.


# Current Limitations

It only has enough of the interpreter written to play up to version 3 story files.  This isn't many of the original Infocom games, but is a start.

The Grey Hack game has file size limits which severely restricts the size of game you can play.  The interpreter allows for breaking up your game file into multiple parts and passing each one, in order, as the arguments.  This seems to have some issues, though.

The save game / restore game isn't written right.  Restoring your game will put the came into a very strange state.


# Notes on the License

While the interpreter code is under the MIT license, like the rest of the project, the code contains heavy references and quotes from the Z-Machine specification.  That text is copyright 1993-2018 by the Interactive Fiction Technology Foundation, and licensed under the [Creative Commons Attribution-ShareAlike 4.0 International Public License](LICENSE-spec).
