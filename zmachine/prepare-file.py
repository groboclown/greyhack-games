#!/usr/bin/python3

"""Convert a Z-Machine story file to a format ready for use by this program."""

import os
import sys
import base64


if __name__ == "__main__":
    if "-h" in sys.argv or "--help" in sys.argv or len(sys.argv) not in (3, 4):
        sys.stderr.write(f"Usage: {sys.argv[0]} [-p] (input story file) (output file)\n")
        sys.stderr.write("  Use '-p' to break the file into 100k sized parts.\n")
        sys.stderr.write("  This will prefix each part with 'index-'\n")
        sys.exit(1)
    
    use_parts = False
    arg_start = 1
    if sys.argv[1] == "-p":
        use_parts = True
        arg_start = 2
    inp = sys.argv[arg_start]
    out = os.path.abspath(sys.argv[arg_start + 1])
    out_name = os.path.basename(out)
    out_dir = os.path.dirname(out)
    if not os.path.isfile(inp):
        sys.stderr.write(f"Failure: input file '{out}' does not exist, or is not a file\n")
        sys.exit(1)

    # These files get big, as greyhack thinks of them.  May need to compress it.

    try:
        with open(inp, "rb") as fis:
            raw = fis.read()
        if use_parts:
            idx = 0
            while len(raw) > 0:
                out = f"{out_dir}/{idx:02d}-{out_name}"
                if os.path.exists(out):
                    sys.stderr.write(f"Failure: output file '{out}' already exists\n")
                    sys.exit(1)
                data = base64.a85encode(raw[:102400]).decode("ascii")
                raw = raw[102400:]
                with open(out, "w", encoding="utf-8") as fos:
                    fos.write(data)
                idx += 1
        else:
            if os.path.exists(out):
                sys.stderr.write(f"Failure: output file '{out}' already exists\n")
                sys.exit(1)
            data = base64.a85encode(raw).decode("ascii")
            with open(out, "w", encoding="utf-8") as fos:
                fos.write(data)
    except Exception as err:
        sys.stderr.write(f"Failure: {err}")
        sys.exit(1)
