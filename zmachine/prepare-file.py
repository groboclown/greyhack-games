#!/usr/bin/python3

"""Convert a Z-Machine story file to a format ready for use by this program."""

import os
import sys
import base64


if __name__ == "__main__":
    if "-h" in sys.argv or "--help" in sys.argv or len(sys.argv) != 3:
        sys.stderr.write(f"Usage: {sys.argv[0]} (input story file) (output file)\n")
        sys.exit(1)
    inp = sys.argv[1]
    out = sys.argv[2]
    if os.path.exists(out):
        sys.stderr.write(f"Failure: output file '{out}' already exists\n")
        sys.exit(1)
    if not os.path.isfile(inp):
        sys.stderr.write(f"Failure: input file '{out}' does not exist, or is not a file\n")
        sys.exit(1)

    # These files get big, as greyhack thinks of them.  May need to compress it.

    try:
        with open(inp, "rb") as fis:
            data = base64.a85encode(fis.read()).decode("ascii")
        with open(out, "w", encoding="utf-8") as fos:
            fos.write(data)
    except Exception as err:
        sys.stderr.write(f"Failure: {err}")
        sys.exit(1)
