#!/usr/bin/python3
"""Generate the opcode lookup tables.

Stores the raw text from
    https://github.com/JaredReisinger/zspec/
and transforms it into greyhack code for use by
the script logic.

It generates:
    * std and extended opcode array, each index == opcode (255 of these).
        This is an array of per-version information, each item
        containing [introduced version number, mnemonic, operands type id, stores value?, branches?]
    Opcode 190 / 0xbe is special, as it indicates a lookup in the extended opcode table.

"""

from typing import List, Dict, Tuple
import sys
import re


# Turn the opcode into the opcode loading format.
# It's based on the operand type:
# $$00 - Large constant (0 to 65535) (2 byte operand length)
# $$01 - Small constant (0 to 255) (1 byte operand length)
# $$10 - Variable reference (1 byte)
# $$11 - omitted (0 bytes)
# 3 means a variable number of operands (0-4)
# 4 means double variable number of operands (0-8)
ARG_TYPE_ID_LOOKUP = {
    "": "[]",
    "S": "[1]",
    "L": "[0]",
    "V": "[2]",
    "S,S": "[1, 1]",
    "S,V": "[1, 2]",
    "V,S": "[2, 1]",
    "V,V": "[2, 2]",
    "?": "[3]",
    "E": "[3]",
    # only call_vs2, call_vn2, which can have up to 8 operands.
    "call": "[4]",
}

MNEMONIC_MATCH = re.compile(r"[^[]+\[\`\*([^*]+)\*\`\]\s*(.*)")

MAX_VERSION = 9


class LookupRow:
    """A single row in the lookup table"""

    __slots__ = (
        "opcode_type",
        "opcode_number",
        "opcode_byte",
        "versions",
        "mnemonic_raw",
        "version_start",
        "args",
        "stores",
        "branches",
        "mnemonic",
        "usage",
    )

    def __init__(
        self,
        *,
        opcode_type: str,
        opcode_number: int,
        opcode_byte: int,
        args: str,  # one of ARG_TYPE_ID_LOOKUP
        versions: List[int],
        stores: bool,
        branches: bool,
        mnemonic_raw: str,
        usage: List[str],
    ) -> None:
        # Very special form.  These two calls can have up to 8 operands.
        if mnemonic_raw in ("call_vs2", "call_vn2") and args == "?":
            args = "call"

        self.opcode_type = opcode_type
        self.opcode_number = opcode_number
        self.opcode_byte = opcode_byte
        assert args in ARG_TYPE_ID_LOOKUP
        self.args = args
        self.versions = versions
        self.stores = stores
        self.branches = branches
        self.mnemonic_raw = mnemonic_raw
        if versions and mnemonic_raw != "-":
            self.mnemonic = f"{mnemonic_raw}_v{versions[0]}"
        else:
            self.mnemonic = mnemonic_raw
        self.usage = usage
        self.version_start: int | None = None

    def clone(self, for_version: int) -> "LookupRow":
        ret = LookupRow(
            opcode_type=self.opcode_type,
            opcode_number=self.opcode_number,
            opcode_byte=self.opcode_byte,
            args=self.args,
            versions=self.versions,
            stores=self.stores,
            branches=self.branches,
            mnemonic_raw=self.mnemonic_raw,
            usage=self.usage,
        )
        ret.version_start = for_version
        ret.mnemonic = self.mnemonic
        return ret

    @staticmethod
    def parse_row(line: int, row: str, prev: "LookupRow | None") -> "LookupRow | None":
        """Parse the row into the lookup row.  It may need to borrow values from
        the previous value."""

        def strip_formatting(cell: str) -> str:
            ret = cell.strip().split(" ")[0]
            if ret in ("_", "^", ".3+", ".5+"):
                # just a trailing format
                ret = ""
            return ret

        cols = row.split("|")
        col_form = len(cols)
        inherit_bools = False
        if col_form == 6:
            # "                     >|144    <|`90`    |`10010000`    |S     |S"
            cols = [
                "",
                "",
                "",
                cols[1],
                cols[2],
                cols[3],
                cols[4],
                cols[5],
                "",
                "",
                "",
                "",
            ]
            inherit_bools = True
        elif col_form == 5:
            # "                                                                      ^| 4 |   |   | xref:15-opcodes.adoc#save[`*save*`] -> (result)"
            cols = ["", "", "", "", "", "", "", "", cols[1], cols[2], cols[3], cols[4]]
        elif col_form == 10:
            # "                     >|159    <|`9f`    |`10011111`    |S     |S     .2+^| 5 .2+|   .2+|   .2+<| xref:15-opcodes.adoc#call_1n[`*call_1n*`] routine"
            cols = [
                "",
                "",
                "",
                cols[1],
                cols[2],
                cols[3],
                cols[4],
                cols[5],
                cols[6],
                cols[7],
                cols[8],
                cols[9],
            ]
        elif col_form == 2 and "0xbe" in row:
            # Special note.
            return None
        if len(cols) != 12:
            raise ValueError(
                f"Invalid row {line} with unexpected column count {col_form}"
            )

        opcode_type = strip_formatting(cols[1])  # 0OP, 1OP, 2OP, VAR, or EXT
        if not opcode_type:
            if prev is None:
                raise ValueError(f"Invalid row {line} + previous row")
            opcode_type = prev.opcode_type

        opcode_number_str = strip_formatting(cols[2])
        if not opcode_number_str:
            if prev is None:
                raise ValueError(f"Invalid row {line} + previous row")
            opcode_number = prev.opcode_number
        elif opcode_number_str in ("-", "―"):
            # A placeholder
            return None
        else:
            try:
                opcode_number = int(opcode_number_str)
            except ValueError as err:
                raise ValueError(
                    f"Invalid row {line} opcode number '{opcode_number_str}'"
                ) from err

        opcode_byte_str = strip_formatting(cols[3])
        if not opcode_byte_str:
            # blank if the previous is the same byte but different version
            if prev is None:
                raise ValueError(f"Invalid row {line} + previous row")
            opcode_byte = prev.opcode_byte
        else:
            try:
                opcode_byte = int(opcode_byte_str)
            except ValueError as err:
                raise ValueError(
                    f"Invalid row {line} opcode byte '{opcode_byte_str}'"
                ) from err

        opcode_form = strip_formatting(cols[6])
        arg_list = strip_formatting(cols[7])
        if not opcode_form:
            if prev is None:
                raise ValueError(f"Invalid row {line} + previous row")
            args = prev.args
        else:
            if opcode_form == "S" and arg_list == "":
                args = ""
            elif opcode_form == "E":
                args = "E"
            else:
                args = arg_list
            if args not in ARG_TYPE_ID_LOOKUP:
                raise ValueError(
                    f"Invalid row {line} arg list '{opcode_form}' / '{arg_list}'"
                )

        # In the 6 column form, the version number is in the parent.
        # Otherwise, it should be in the row.
        versions: List[int] = []

        if col_form == 6:
            if prev is None:
                raise ValueError(f"Invalid row {line} + previous row")
            versions = prev.versions
        else:
            version_parts = strip_formatting(cols[8])
            # There are so many weird combinations of this, that it's easier just to
            # enumerate them, since the list isn't changing.
            if version_parts == "":
                start = 1
                while start <= MAX_VERSION:
                    versions.append(start)
                    start += 1
            elif version_parts in ("1", "2", "3", "4", "5", "6", "7", "8", "9"):
                start = int(version_parts)
                while start <= MAX_VERSION:
                    versions.append(start)
                    start += 1
            elif version_parts == "5/3":
                versions = [3, 5]
            elif version_parts == "1/-":
                versions = [1]
            elif version_parts == "6/*":
                versions = [6, 7, 8, 9]
            elif version_parts == "1/4":
                versions = [1, 2, 3, 4]
            elif version_parts == "5/6":
                versions = [5, 6]
            elif version_parts == "-":
                versions = []
            elif version_parts == "4/-":
                versions = [4]
            elif version_parts == "5/-":
                versions = [5]
            elif version_parts == "6/-":
                versions = [6]
            elif version_parts == "4/6":
                versions = [4, 5, 6]
            elif version_parts == "5/*":
                versions = [5, 6, 7, 8, 9]
            elif version_parts in ("-", "―"):
                # Not a valid opcode.
                versions = []
            else:
                raise ValueError(
                    f"Invalid row {line} has unexpected version '{version_parts}'"
                )

        if inherit_bools:
            if prev is None:
                raise ValueError(f"Invalid row {line} + previous row")
            is_store = prev.stores
            is_branch = prev.branches
        else:
            is_store = "*" in strip_formatting(cols[9])
            is_branch = "*" in strip_formatting(cols[10])

        usage_str = cols[11].strip()
        if usage_str in ("_illegal_", "-", "―"):
            mnemonic = "-"
            usage = []
        elif usage_str == "":
            if prev is None:
                raise ValueError(f"Invalid row {line} + previous row")
            mnemonic = prev.mnemonic_raw
            usage = prev.usage
        else:
            usage_match = MNEMONIC_MATCH.match(usage_str)
            if not usage_match:
                raise ValueError(f"Invalid row {line} usage string '{usage_str}'")
            mnemonic = usage_match.group(1)
            usage = usage_match.group(2).split(" ")
            if len(usage) == 1 and usage[0] == "":
                usage = []

        return LookupRow(
            opcode_type=opcode_type,
            opcode_number=opcode_number,
            opcode_byte=opcode_byte,
            args=args,
            versions=versions,
            stores=is_store,
            branches=is_branch,
            mnemonic_raw=mnemonic,
            usage=usage,
        )


def orderByVersion(rows: List[LookupRow]) -> List[LookupRow]:
    """Turn a list of rows for the same operand byte into ordered by
    version number.  These should be like 6, 3, 1, but for versions that
    are just a few (like 6/7)"""

    # Sort by version
    by_version: List[LookupRow] = []
    for version in range(1, MAX_VERSION + 1):
        matching: List[LookupRow] = []
        for row in rows:
            if version in row.versions:
                matching.append(row)
        if len(matching) == 1:
            by_version.append(matching[0].clone(version))
        elif len(matching) > 1:
            # else use the one whose lowest version number is highest.
            highest = matching[0].versions[0]
            highest_match = matching[0]
            for mtc in matching:
                if highest < mtc.versions[0]:
                    highest = mtc.versions[0]
                    highest_match = mtc
            by_version.append(highest_match.clone(highest))
        else:
            # Nothing for this version.  If the list is empty, that's
            # fine.  Otherwise, it's an unsupported opcode for this specific
            # version.
            if len(by_version) > 0:
                val = LookupRow(
                    opcode_type="-",
                    opcode_byte=0,
                    opcode_number=0,
                    args="",
                    versions=[],  # yes, empty
                    stores=False,
                    branches=False,
                    mnemonic_raw="-",
                    usage=[],
                )
                val.version_start = version
                by_version.append(val)

    if len(by_version) <= 1:
        # there are rows that don't have any versions, so a simple
        # up-front filter won't work.
        return by_version

    # Strip out duplicate mnemonics that are right next to each other.
    # This keeps the first one, which is lower.
    ret: List[LookupRow] = [by_version[0]]
    for row in by_version[1:]:
        if ret[-1].mnemonic != row.mnemonic:
            ret.append(row)

    # Reverse it
    ret.reverse()

    return ret


def parseLookup() -> List[LookupRow]:
    """Parse the lookup table"""
    ret: List[LookupRow] = []
    lineno = 1
    prev: LookupRow | None = None
    for row in LOOKUP.splitlines():
        row = row.strip()
        if not row:
            continue
        prev = LookupRow.parse_row(lineno, row, prev)
        if prev is not None:
            ret.append(prev)
        lineno += 1
    return ret


def groupRows(
    rows: List[LookupRow],
) -> Tuple[Dict[int, List[LookupRow]], Dict[int, List[LookupRow]]]:
    """Group the lookup rows by opcode byte, then each group by orderByVersion."""
    std: Dict[int, List[LookupRow]] = {}
    ext: Dict[int, List[LookupRow]] = {}
    for row in rows:
        if row.args == "E":
            ref = ext
        else:
            ref = std
        if row.opcode_byte not in ref:
            ref[row.opcode_byte] = []
        ref[row.opcode_byte].append(row)

    std_ret: Dict[int, List[LookupRow]] = {}
    for key, group in std.items():
        std_ret[key] = orderByVersion(group)
    ext_ret: Dict[int, List[LookupRow]] = {}
    for key, group in ext.items():
        ext_ret[key] = orderByVersion(group)

    return (std_ret, ext_ret)


def outputCode(name: str, ref: Dict[int, List[LookupRow]]) -> str:
    """outputs a opcode array."""

    def asb(val: bool) -> str:
        return "true" if val else "false"

    top = 0
    lines = []
    for idx in range(0, 256):
        if idx in ref and ref[idx]:
            rowList = ref[idx]
            top = idx + 1
            line = f"  [ // {idx}\n"

            for row in rowList:
                # [introduced version number, mnemonic, operands type id, stores value?, branches?]
                line += f"    [{row.version_start}, \"{row.mnemonic}\", {ARG_TYPE_ID_LOOKUP[row.args]}, {asb(row.stores)}, {asb(row.branches)}],\n"

            lines.append(line + "  ],")
        else:
            lines.append(f"  [], // {idx}")

    return "\n".join([f"{name} = [", *lines[:top], "]"])


def outputCodes(
    std: Dict[int, List[LookupRow]], ext: Dict[int, List[LookupRow]]
) -> str:
    """outputs the std and ext"""
    return (
        outputCode("STD_OPCODE_TABLE", std) + "\n" + outputCode("EXT_OPCODE_TABLE", ext)
    )


def output() -> str:
    """Generate the output."""
    std, ext = groupRows(parseLookup())
    return outputCodes(std, ext)


# Columns:    |Count   |Num      |Dec.    |Hex     |Binary        |Form   | Args  | V |St |Br | Instruction and syntax
#   Count: Opcode type (0OP, 1OP, 2OP, VAR, EXT)
#   Num: Opcode number
#   Dec: Decimal representation of the opcode byte
#   Hex: Hex representation of the opcode byte
#   Binary: Binary representation of the opcode byte
#   Form: operand description form (S, L, V, E)
#   Args: Ordered operand type (list of L, S, or V, or a ? to indicate variable count)
#   V: First Version introduced in.  The form "X/Y" means just that range.
#   St: Does the opcode include a storage value? (extra byte on the opcode)
#   Br: Does the opcode include a branch value? (extra address on the opcode)
#   Instruction and syntax: mnemonic + description of how it works.

LOOKUP = """
   |0OP     |  0      |176     |`b0`    |`10110000`    |S      |       |   |   |   | xref:15-opcodes.adoc#rtrue[`*rtrue*`]
   |0OP     |  1      |177     |`b1`    |`10110001`    |S      |       |   |   |   | xref:15-opcodes.adoc#rfalse[`*rfalse*`]
   |0OP     |  2      |178     |`b2`    |`10110010`    |S      |       |   |   |   | xref:15-opcodes.adoc#print[`*print*`] (literal string)
   |0OP     |  3      |179     |`b3`    |`10110011`    |S      |       |   |   |   | xref:15-opcodes.adoc#print_ret[`*print_ret*`] (literal string)
   |0OP     |  4      |180     |`b4`    |`10110100`    |S      |       |1/-|   |   | xref:15-opcodes.adoc#nop[`*nop*`]
.3+|0OP  .3+|  5   .3+|181  .3+|`b5` .3+|`10110101` .3+|S   .3+|       | 1 |   | * | xref:15-opcodes.adoc#save[`*save*`] ?(label)
                                                                      ^| 4 |   |   | xref:15-opcodes.adoc#save[`*save*`] -> (result)
                                                                      ^| 5 |   |   | _illegal_
.3+|0OP  .3+|  6   .3+|182  .3+|`b6` .3+|`10110110` .3+|S   .3+|       | 1 |   | * | xref:15-opcodes.adoc#restore[`*restore*`] ?(label)
                                                                      ^| 4 |   |   | xref:15-opcodes.adoc#restore[`*restore*`] -> (result)
                                                                      ^| 5 |   |   | _illegal_
   |0OP     |  7      |183     |`b7`    |`10110111`    |S      |       |   |   |   | xref:15-opcodes.adoc#restart[`*restart*`]
   |0OP     |  8      |184     |`b8`    |`10111000`    |S      |       |   |   |   | xref:15-opcodes.adoc#ret_popped[`*ret_popped*`]
.2+|0OP  .2+|  9   .2+|185  .2+|`b9` .2+|`10111001` .2+|S   .2+|       | 1 |   |   | xref:15-opcodes.adoc#pop[`*pop*`]
                                                                      ^|5/6| * |   | xref:15-opcodes.adoc#catch[`*catch*`] -> (result)
   |0OP     | 10      |186     |`ba`    |`10111010`    |S      |       |   |   |   | xref:15-opcodes.adoc#quit[`*quit*`]
   |0OP     | 11      |187     |`bb`    |`10111011`    |S      |       |   |   |   | xref:15-opcodes.adoc#new_line[`*new_line*`]
.2+|0OP  .2+| 12   .2+|188  .2+|`bc` .2+|`10111100` .2+|S   .2+|       | 3 |   |   | xref:15-opcodes.adoc#show_status[`*show_status*`]
                                                                      ^| 4 |   |   | _illegal_
   |0OP     | 13      |189     |`bd`    |`10111101`    |S      |       | 3 |   |   | xref:15-opcodes.adoc#verify[`*verify*`] ?(label)
11+| _0OP:14 is 190 (`0xbe`), the first byte for an extended opcode (see EXT)_
   |0OP     | 15      |191     |`bf`    |`10111111`    |S      |       |5/-|   |   | xref:15-opcodes.adoc#piracy[`*piracy*`]
.3+|1OP  .3+|  0      |128     |`80`    |`10000000`    |S     |L    .3+|   .3+|   .3+| * .3+| xref:15-opcodes.adoc#jz[`*jz*`] a ?(label)
                     >|144    <|`90`    |`10010000`    |S     |S
                     >|160    <|`a0`    |`10100000`    |S     |V
.3+|1OP  .3+|  1      |129     |`81`    |`10000001`    |S     |L    .3+|   .3+| * .3+| * .3+| xref:15-opcodes.adoc#get_sibling[`*get_sibling*`] object -> (result) ?(label)
                     >|145    <|`91`    |`10010001`    |S     |S
                     >|161    <|`a1`    |`10100001`    |S     |V
.3+|1OP  .3+|  2      |130     |`82`    |`10000010`    |S     |L    .3+|   .3+| * .3+| * .3+| xref:15-opcodes.adoc#get_child[`*get_child*`] object -> (result) ?(label)
                     >|146    <|`92`    |`10010010`    |S     |S
                     >|162    <|`a2`    |`10100010`    |S     |V
.3+|1OP  .3+|  3      |131     |`83`    |`10000011`    |S     |L    .3+|   .3+| * .3+|   .3+| xref:15-opcodes.adoc#get_parent[`*get_parent*`] object -> (result)
                     >|147    <|`93`    |`10010011`    |S     |S
                     >|163    <|`a3`    |`10100011`    |S     |V
.3+|1OP  .3+|  4      |132     |`84`    |`10000100`    |S     |L    .3+|   .3+| * .3+|   .3+| xref:15-opcodes.adoc#get_prop_len[`*get_prop_len*`] property-address -> (result)
                     >|148    <|`94`    |`10010100`    |S     |S
                     >|164    <|`a4`    |`10100100`    |S     |V
.3+|1OP  .3+|  5      |133     |`85`    |`10000101`    |S     |L    .3+|   .3+|   .3+|   .3+| xref:15-opcodes.adoc#inc[`*inc*`] (variable)
                     >|149    <|`95`    |`10010101`    |S     |S
                     >|165    <|`a5`    |`10100101`    |S     |V
.3+|1OP  .3+|  6      |134     |`86`    |`10000110`    |S     |L    .3+|   .3+|   .3+|   .3+| xref:15-opcodes.adoc#dec[`*dec*`] (variable)
                     >|150    <|`96`    |`10010110`    |S     |S
                     >|166    <|`a6`    |`10100110`    |S     |V
.3+|1OP  .3+|  7      |135     |`87`    |`10000111`    |S     |L    .3+|   .3+|   .3+|   .3+| xref:15-opcodes.adoc#print_addr[`*print_addr*`] byte-address-of-string
                     >|151    <|`97`    |`10010111`    |S     |S
                     >|167    <|`a7`    |`10100111`    |S     |V
.3+|1OP  .3+|  8      |136     |`88`    |`10001000`    |S     |L    .3+| 4 .3+| * .3+|   .3+| xref:15-opcodes.adoc#call_1s[`*call_1s*`] routine -> (result)
                     >|152    <|`98`    |`10011000`    |S     |S
                     >|168    <|`a8`    |`10101000`    |S     |V
.3+|1OP  .3+|  9      |137     |`89`    |`10001001`    |S     |L    .3+|   .3+|   .3+|   .3+| xref:15-opcodes.adoc#remove_obj[`*remove_obj*`] object
                     >|153    <|`99`    |`10011001`    |S     |S
                     >|169    <|`a9`    |`10101001`    |S     |V
.3+|1OP  .3+| 10      |138     |`8a`    |`10001010`    |S     |L    .3+|   .3+|   .3+|   .3+| xref:15-opcodes.adoc#print_obj[`*print_obj*`] object
                     >|154    <|`9a`    |`10011010`    |S     |S
                     >|170    <|`aa`    |`10101010`    |S     |V
.3+|1OP  .3+| 11      |139     |`8b`    |`10001011`    |S     |L    .3+|   .3+|   .3+|   .3+| xref:15-opcodes.adoc#ret[`*ret*`] value
                     >|155    <|`9b`    |`10011011`    |S     |S
                     >|171    <|`ab`    |`10101011`    |S     |V
.3+|1OP  .3+| 12      |140     |`8c`    |`10001100`    |S     |L    .3+|   .3+|   .3+|   .3+| xref:15-opcodes.adoc#jump[`*jump*`] ?(label)
                     >|156    <|`9c`    |`10011100`    |S     |S
                     >|172    <|`ac`    |`10101100`    |S     |V
.3+|1OP  .3+| 13      |141     |`8d`    |`10001101`    |S     |L    .3+|   .3+|   .3+|   .3+| xref:15-opcodes.adoc#print_paddr[`*print_paddr*`] packed-address-of-string
                     >|157    <|`9d`    |`10011101`    |S     |S
                     >|173    <|`ad`    |`10101101`    |S     |V
.3+|1OP  .3+| 14      |142     |`8e`    |`10001110`    |S     |L    .3+|   .3+| * .3+|   .3+| xref:15-opcodes.adoc#load[`*load*`] (variable) -> (result)
                     >|158    <|`9e`    |`10011110`    |S     |S
                     >|174    <|`ae`    |`10101110`    |S     |V
.3+|1OP  .3+| 15      |143     |`8f`    |`10001111`    |S     |L         | 1/4  | *    |      | xref:15-opcodes.adoc#not[`*not*`] value -> (result)
                     >|159    <|`9f`    |`10011111`    |S     |S     .2+^| 5 .2+|   .2+|   .2+<| xref:15-opcodes.adoc#call_1n[`*call_1n*`] routine
                     >|175    <|`af`    |`10101111`    |S     |V
.5+|2OP  .5+|  0      |  0     |`00`    |`00000000`    |L     |S,S  .5+| ― .5+| ― .5+| ― .5+| ―
                     >| 32    <|`20`    |`00100000`    |L     |S,V
                     >| 64    <|`40`    |`01000000`    |L     |V,S
                     >| 96    <|`60`    |`01100000`    |L     |V,V
                     >|192    <|`c0`    |`11000000`    |V     |?
.5+|2OP  .5+|  1      |  1     |`01`    |`00000001`    |L     |S,S  .5+|   .5+|   .5+| * .5+| xref:15-opcodes.adoc#je[`*je*`] a b ?(label)
                     >| 33    <|`21`    |`00100001`    |L     |S,V
                     >| 65    <|`41`    |`01000001`    |L     |V,S
                     >| 97    <|`61`    |`01100001`    |L     |V,V
                     >|193    <|`c1`    |`11000001`    |V     |?
.5+|2OP  .5+|  2      |  2     |`02`    |`00000010`    |L     |S,S  .5+|   .5+|   .5+| * .5+| xref:15-opcodes.adoc#jl[`*jl*`] a b ?(label)
                     >| 34    <|`22`    |`00100010`    |L     |S,V
                     >| 66    <|`42`    |`01000010`    |L     |V,S
                     >| 98    <|`62`    |`01100010`    |L     |V,V
                     >|194    <|`c2`    |`11000010`    |V     |?
.5+|2OP  .5+|  3      |  3     |`03`    |`00000011`    |L     |S,S  .5+|   .5+|   .5+| * .5+| xref:15-opcodes.adoc#jg[`*jg*`] a b ?(label)
                     >| 35    <|`23`    |`00100011`    |L     |S,V
                     >| 67    <|`43`    |`01000011`    |L     |V,S
                     >| 99    <|`63`    |`01100011`    |L     |V,V
                     >|195    <|`c3`    |`11000011`    |V     |?
.5+|2OP  .5+|  4      |  4     |`04`    |`00000100`    |L     |S,S  .5+|   .5+|   .5+| * .5+| xref:15-opcodes.adoc#dec_chk[`*dec_chk*`] (variable) value ?(label)
                     >| 36    <|`24`    |`00100100`    |L     |S,V
                     >| 68    <|`44`    |`01000100`    |L     |V,S
                     >|100    <|`64`    |`01100100`    |L     |V,V
                     >|196    <|`c4`    |`11000100`    |V     |?
.5+|2OP  .5+|  5      |  5     |`05`    |`00000101`    |L     |S,S  .5+|   .5+|   .5+| * .5+| xref:15-opcodes.adoc#inc_chk[`*inc_chk*`] (variable) value ?(label)
                     >| 37    <|`25`    |`00100101`    |L     |S,V
                     >| 69    <|`45`    |`01000101`    |L     |V,S
                     >|101    <|`65`    |`01100101`    |L     |V,V
                     >|197    <|`c5`    |`11000101`    |V     |?
.5+|2OP  .5+|  6      |  6     |`06`    |`00000110`    |L     |S,S  .5+|   .5+|   .5+| * .5+| xref:15-opcodes.adoc#jin[`*jin*`] obj1 obj2 ?(label)
                     >| 38    <|`26`    |`00100110`    |L     |S,V
                     >| 70    <|`46`    |`01000110`    |L     |V,S
                     >|102    <|`66`    |`01100110`    |L     |V,V
                     >|198    <|`c6`    |`11000110`    |V     |?
.5+|2OP  .5+|  7      |  7     |`07`    |`00000111`    |L     |S,S  .5+|   .5+|   .5+| * .5+| xref:15-opcodes.adoc#test[`*test*`] bitmap flags ?(label)
                     >| 39    <|`27`    |`00100111`    |L     |S,V
                     >| 71    <|`47`    |`01000111`    |L     |V,S
                     >|103    <|`67`    |`01100111`    |L     |V,V
                     >|199    <|`c7`    |`11000111`    |V     |?
.5+|2OP  .5+|  8      |  8     |`08`    |`00001000`    |L     |S,S  .5+|   .5+| * .5+|   .5+| xref:15-opcodes.adoc#or[`*or*`] a b -> (result)
                     >| 40    <|`28`    |`00101000`    |L     |S,V
                     >| 72    <|`48`    |`01001000`    |L     |V,S
                     >|104    <|`68`    |`01101000`    |L     |V,V
                     >|200    <|`c8`    |`11001000`    |V     |?
.5+|2OP  .5+|  9      |  9     |`09`    |`00001001`    |L     |S,S  .5+|   .5+| * .5+|   .5+| xref:15-opcodes.adoc#and[`*and*`] a b -> (result)
                     >| 41    <|`29`    |`00101001`    |L     |S,V
                     >| 73    <|`49`    |`01001001`    |L     |V,S
                     >|105    <|`69`    |`01101001`    |L     |V,V
                     >|201    <|`c9`    |`11001001`    |V     |?
.5+|2OP  .5+| 10      | 10     |`0a`    |`00001010`    |L     |S,S  .5+|   .5+|   .5+| * .5+| xref:15-opcodes.adoc#test_attr[`*test_attr*`] object attribute ?(label)
                     >| 42    <|`2a`    |`00101010`    |L     |S,V
                     >| 74    <|`4a`    |`01001010`    |L     |V,S
                     >|106    <|`6a`    |`01101010`    |L     |V,V
                     >|202    <|`ca`    |`11001010`    |V     |?
.5+|2OP  .5+| 11      | 11     |`0b`    |`00001011`    |L     |S,S  .5+|   .5+|   .5+|   .5+| xref:15-opcodes.adoc#set_attr[`*set_attr*`] object attribute
                     >| 43    <|`2b`    |`00101011`    |L     |S,V
                     >| 75    <|`4b`    |`01001011`    |L     |V,S
                     >|107    <|`6b`    |`01101011`    |L     |V,V
                     >|203    <|`cb`    |`11001011`    |V     |?
.5+|2OP  .5+| 12      | 12     |`0c`    |`00001100`    |L     |S,S  .5+|   .5+|   .5+|   .5+| xref:15-opcodes.adoc#clear_attr[`*clear_attr*`] object attribute
                     >| 44    <|`2c`    |`00101100`    |L     |S,V
                     >| 76    <|`4c`    |`01001100`    |L     |V,S
                     >|108    <|`6c`    |`01101100`    |L     |V,V
                     >|204    <|`cc`    |`11001100`    |V     |?
.5+|2OP  .5+| 13      | 13     |`0d`    |`00001101`    |L     |S,S  .5+|   .5+|   .5+|   .5+| xref:15-opcodes.adoc#store[`*store*`] (variable) value
                     >| 45    <|`2d`    |`00101101`    |L     |S,V
                     >| 77    <|`4d`    |`01001101`    |L     |V,S
                     >|109    <|`6d`    |`01101101`    |L     |V,V
                     >|205    <|`cd`    |`11001101`    |V     |?
.5+|2OP  .5+| 14      | 14     |`0e`    |`00001110`    |L     |S,S  .5+|   .5+|   .5+|   .5+| xref:15-opcodes.adoc#insert_obj[`*insert_obj*`] object destination
                     >| 46    <|`2e`    |`00101110`    |L     |S,V
                     >| 78    <|`4e`    |`01001110`    |L     |V,S
                     >|110    <|`6e`    |`01101110`    |L     |V,V
                     >|206    <|`ce`    |`11001110`    |V     |?
.5+|2OP  .5+| 15      | 15     |`0f`    |`00001111`    |L     |S,S  .5+|   .5+| * .5+|   .5+| xref:15-opcodes.adoc#loadw[`*loadw*`] array word-index -> (result)
                     >| 47    <|`2f`    |`00101111`    |L     |S,V
                     >| 79    <|`4f`    |`01001111`    |L     |V,S
                     >|111    <|`6f`    |`01101111`    |L     |V,V
                     >|207    <|`cf`    |`11001111`    |V     |?
.5+|2OP  .5+| 16      | 16     |`10`    |`00010000`    |L     |S,S  .5+|   .5+| * .5+|   .5+| xref:15-opcodes.adoc#loadb[`*loadb*`] array byte-index -> (result)
                     >| 48    <|`30`    |`00110000`    |L     |S,V
                     >| 80    <|`50`    |`01010000`    |L     |V,S
                     >|112    <|`70`    |`01110000`    |L     |V,V
                     >|208    <|`d0`    |`11010000`    |V     |?
.5+|2OP  .5+| 17      | 17     |`11`    |`00010001`    |L     |S,S  .5+|   .5+| * .5+|   .5+| xref:15-opcodes.adoc#get_prop[`*get_prop*`] object property -> (result)
                     >| 49    <|`31`    |`00110001`    |L     |S,V
                     >| 81    <|`51`    |`01010001`    |L     |V,S
                     >|113    <|`71`    |`01110001`    |L     |V,V
                     >|209    <|`d1`    |`11010001`    |V     |?
.5+|2OP  .5+| 18      | 18     |`12`    |`00010010`    |L     |S,S  .5+|   .5+| * .5+|   .5+| xref:15-opcodes.adoc#get_prop_addr[`*get_prop_addr*`] object property -> (result)
                     >| 50    <|`32`    |`00110010`    |L     |S,V
                     >| 82    <|`52`    |`01010010`    |L     |V,S
                     >|114    <|`72`    |`01110010`    |L     |V,V
                     >|210    <|`d2`    |`11010010`    |V     |?
.5+|2OP  .5+| 19      | 19     |`13`    |`00010011`    |L     |S,S  .5+|   .5+| * .5+|   .5+| xref:15-opcodes.adoc#get_next_prop[`*get_next_prop*`] object property -> (result)
                     >| 51    <|`33`    |`00110011`    |L     |S,V
                     >| 83    <|`53`    |`01010011`    |L     |V,S
                     >|115    <|`73`    |`01110011`    |L     |V,V
                     >|211    <|`d3`    |`11010011`    |V     |?
.5+|2OP  .5+| 20      | 20     |`14`    |`00010100`    |L     |S,S .5+|   .5+| * .5+|   .5+| xref:15-opcodes.adoc#add[`*add*`] a b -> (result)
                     >| 52    <|`34`    |`00110100`    |L     |S,V
                     >| 84    <|`54`    |`01010100`    |L     |V,S
                     >|116    <|`74`    |`01110100`    |L     |V,V
                     >|212    <|`d4`    |`11010100`    |V     |?
.5+|2OP  .5+| 21      | 21     |`15`    |`00010101`    |L     |S,S  .5+|   .5+| * .5+|   .5+| xref:15-opcodes.adoc#sub[`*sub*`] a b -> (result)
                     >| 53    <|`35`    |`00110101`    |L     |S,V
                     >| 85    <|`55`    |`01010101`    |L     |V,S
                     >|117    <|`75`    |`01110101`    |L     |V,V
                     >|213    <|`d5`    |`11010101`    |V     |?
.5+|2OP  .5+| 22      | 22     |`16`    |`00010110`    |L     |S,S  .5+|   .5+| * .5+|   .5+| xref:15-opcodes.adoc#mul[`*mul*`] a b -> (result)
                     >| 54    <|`36`    |`00110110`    |L     |S,V
                     >| 86    <|`56`    |`01010110`    |L     |V,S
                     >|118    <|`76`    |`01110110`    |L     |V,V
                     >|214    <|`d6`    |`11010110`    |V     |?
.5+|2OP  .5+| 23      | 23     |`17`    |`00010111`    |L     |S,S  .5+|   .5+| * .5+|   .5+| xref:15-opcodes.adoc#div[`*div*`] a b -> (result)
                     >| 55    <|`37`    |`00110111`    |L     |S,V
                     >| 87    <|`57`    |`01010111`    |L     |V,S
                     >|119    <|`77`    |`01110111`    |L     |V,V
                     >|215    <|`d7`    |`11010111`    |V     |?
.5+|2OP  .5+| 24      | 24     |`18`    |`00011000`    |L     |S,S  .5+|   .5+| * .5+|   .5+| xref:15-opcodes.adoc#mod[`*mod*`] a b -> (result)
                     >| 56    <|`38`    |`00111000`    |L     |S,V
                     >| 88    <|`58`    |`01011000`    |L     |V,S
                     >|120    <|`78`    |`01111000`    |L     |V,V
                     >|216    <|`d8`    |`11011000`    |V     |?
.5+|2OP  .5+| 25      | 25     |`19`    |`00011001`    |L     |S,S  .5+| 4 .5+| * .5+|   .5+| xref:15-opcodes.adoc#call_2s[`*call_2s*`] routine arg1 -> (result)
                     >| 57    <|`39`    |`00111001`    |L     |S,V
                     >| 89    <|`59`    |`01011001`    |L     |V,S
                     >|121    <|`79`    |`01111001`    |L     |V,V
                     >|217    <|`d9`    |`11011001`    |V     |?
.5+|2OP  .5+| 26      | 26     |`1a`    |`00011010`    |L     |S,S  .5+| 5 .5+|   .5+|   .5+| xref:15-opcodes.adoc#call_2n[`*call_2n*`] routine arg1
                     >| 58    <|`3a`    |`00111010`    |L     |S,V
                     >| 90    <|`5a`    |`01011010`    |L     |V,S
                     >|122    <|`7a`    |`01111010`    |L     |V,V
                     >|218    <|`da`    |`11011010`    |V     |?
.5+|2OP  .5+| 27      | 27     |`1b`    |`00011011`    |L     |S,S     | 5    |      |      | xref:15-opcodes.adoc#set_colour[`*set_colour*`] foreground background
                     >| 59    <|`3b`    |`00111011`    |L     |S,V .4+^| 6 .4+|   .4+|   .4+<| xref:15-opcodes.adoc#set_colour[`*set_colour*`] foreground background window
                     >| 91    <|`5b`    |`01011011`    |L     |V,S
                     >|123    <|`7b`    |`01111011`    |L     |V,V
                     >|219    <|`db`    |`11011011`    |V     |?
.5+|2OP  .5+| 28      | 28     |`1c`    |`00011100`    |L     |S,S  .5+|5/6 .5+|   .5+|   .5+| xref:15-opcodes.adoc#throw[`*throw*`] value stack-frame
                     >| 60    <|`3c`    |`00111100`    |L     |S,V
                     >| 92    <|`5c`    |`01011100`    |L     |V,S
                     >|124    <|`7c`    |`01111100`    |L     |V,V
                     >|220    <|`dc`    |`11011100`    |V     |?
.5+|2OP  .5+| 29      | 29     |`1d`    |`00011101`    |L     |S,S  .5+| ― .5+| ― .5+| ― .5+| ―
                     >| 61    <|`3d`    |`00111101`    |L     |S,V
                     >| 93    <|`5d`    |`01011101`    |L     |V,S
                     >|125    <|`7d`    |`01111101`    |L     |V,V
                     >|221    <|`dd`    |`11011101`    |V     |?
.5+|2OP  .5+| 30      | 30     |`1e`    |`00011110`    |L     |S,S  .5+| ― .5+| ― .5+| ― .5+| ―
                     >| 62    <|`3e`    |`00111110`    |L     |S,V
                     >| 94    <|`5e`    |`01011110`    |L     |V,S
                     >|126    <|`7e`    |`01111110`    |L     |V,V
                     >|222    <|`de`    |`11011110`    |V     |?
.5+|2OP  .5+| 31      | 31     |`1f`    |`00011111`    |L     |S,S  .5+| ― .5+| ― .5+| ― .5+| ―
                     >| 63    <|`3f`    |`00111111`    |L     |S,V
                     >| 95    <|`5f`    |`01011111`    |L     |V,S
                     >|127    <|`7f`    |`01111111`    |L     |V,V
                     >|223    <|`df`    |`11011111`    |V     |?
.2+|VAR  .2+|  0   .2+|224  .2+|`e0` .2+|`11100000` .2+|V  .2+|?       | 1 | * |   | xref:15-opcodes.adoc#call[`*call*`] routine _…​0 to 3 args…​_ -> (result)
                                                                      ^| 4 |   |   | xref:15-opcodes.adoc#call_vs[`*call_vs*`] routine _…​0 to 3 args…​_ -> (result)
   |VAR     |  1      |225     |`e1`    |`11100001`    |V     |?       |   |   |   | xref:15-opcodes.adoc#storew[`*storew*`] array word-index value
   |VAR     |  2      |226     |`e2`    |`11100010`    |V     |?       |   |   |   | xref:15-opcodes.adoc#storeb[`*storeb*`] array byte-index value
   |VAR     |  3      |227     |`e3`    |`11100011`    |V     |?       |   |   |   | xref:15-opcodes.adoc#put_prop[`*put_prop*`] object property value
.3+|VAR  .3+|  4   .3+|228  .3+|`e4` .3+|`11100100` .3+|V  .3+|?       | 1 |   |   | xref:15-opcodes.adoc#sread[`*sread*`] text parse
                                                                      ^| 4 |   |   | xref:15-opcodes.adoc#sread[`*sread*`] text parse time routine
                                                                      ^| 5 ^|* |   | xref:15-opcodes.adoc#aread[`*aread*`] text parse time routine -> (result)
   |VAR     |  5      |229     |`e5`    |`11100101`    |V     |?       |   |   |   | xref:15-opcodes.adoc#print_char[`*print_char*`] output-character-code
   |VAR     |  6      |230     |`e6`    |`11100110`    |V     |?       |   |   |   | xref:15-opcodes.adoc#print_num[`*print_num*`] value
   |VAR     |  7      |231     |`e7`    |`11100111`    |V     |?       |   | * |   | xref:15-opcodes.adoc#random[`*random*`] range -> (result)
   |VAR     |  8      |232     |`e8`    |`11101000`    |V     |?       |   |   |   | xref:15-opcodes.adoc#push[`*push*`] value
.2+|VAR  .2+|  9   .2+|233  .2+|`e9` .2+|`11101001` .2+|V  .2+|?       | 1 |   |   | xref:15-opcodes.adoc#pull[`*pull*`] (variable)
                                                                      ^| 6 ^|* |   | xref:15-opcodes.adoc#pull[`*pull*`] stack -> (result)
   |VAR     | 10      |234     |`ea`    |`11101010`    |V     |?       | 3 |   |   | xref:15-opcodes.adoc#split_window[`*split_window*`] lines
   |VAR     | 11      |235     |`eb`    |`11101011`    |V     |?       | 3 |   |   | xref:15-opcodes.adoc#set_window[`*set_window*`] window
   |VAR     | 12      |236     |`ec`    |`11101100`    |V     |?       | 4 | * |   | xref:15-opcodes.adoc#call_vs2[`*call_vs2*`] routine _…​0 to 7 args…​_ -> (result)
   |VAR     | 13      |237     |`ed`    |`11101101`    |V     |?       | 4 |   |   | xref:15-opcodes.adoc#erase_window[`*erase_window*`] window
.2+|VAR  .2+| 14   .2+|238  .2+|`ee` .2+|`11101110` .2+|V  .2+|?       |4/-|   |   | xref:15-opcodes.adoc#erase_line[`*erase_line*`] value
                                                                      ^| 6 |   |   | xref:15-opcodes.adoc#erase_line[`*erase_line*`] pixels
.2+|VAR  .2+| 15   .2+|239  .2+|`ef` .2+|`11101111` .2+|V  .2+|?       | 4 |   |   | xref:15-opcodes.adoc#set_cursor[`*set_cursor*`] line column
                                                                      ^| 6 |   |   | xref:15-opcodes.adoc#set_cursor[`*set_cursor*`] line column window
   |VAR     | 16      |240     |`f0`    |`11110000`    |V     |?       |4/6|   |   | xref:15-opcodes.adoc#get_cursor[`*get_cursor*`] array
   |VAR     | 17      |241     |`f1`    |`11110001`    |V     |?       | 4 |   |   | xref:15-opcodes.adoc#set_text_style[`*set_text_style*`] style
   |VAR     | 18      |242     |`f2`    |`11110010`    |V     |?       | 4 |   |   | xref:15-opcodes.adoc#buffer_mode[`*buffer_mode*`] flag
.3+|VAR  .3+| 19   .3+|243  .3+|`f3` .3+|`11110011` .3+|V  .3+|?       | 3 |   |   | xref:15-opcodes.adoc#output_stream[`*output_stream*`] number
                                                                      ^| 5 |   |   | xref:15-opcodes.adoc#output_stream[`*output_stream*`] number table
                                                                      ^| 6 |   |   | xref:15-opcodes.adoc#output_stream[`*output_stream*`] number table width
   |VAR     | 20      |244     |`f4`    |`11110100`    |V     |?       | 3 |   |   | xref:15-opcodes.adoc#input_stream[`*input_stream*`] number
   |VAR     | 21      |245     |`f5`    |`11110101`    |V     |?       |5/3|   |   | xref:15-opcodes.adoc#sound_effect[`*sound_effect*`] number effect volume routine
   |VAR     | 22      |246     |`f6`    |`11110110`    |V     |?       | 4 | * |   | xref:15-opcodes.adoc#read_char[`*read_char*`] 1 time routine -> (result)
   |VAR     | 23      |247     |`f7`    |`11110111`    |V     |?       | 4 | * | * | xref:15-opcodes.adoc#scan_table[`*scan_table*`] x table len form -> (result)
   |VAR     | 24      |248     |`f8`    |`11111000`    |V     |?       |5/6| * |   | xref:15-opcodes.adoc#not[`*not*`] value -> (result)
   |VAR     | 25      |249     |`f9`    |`11111001`    |V     |?       | 5 |   |   | xref:15-opcodes.adoc#call_vn[`*call_vn*`] routine _…​up to 3 args…​_
   |VAR     | 26      |250     |`fa`    |`11111010`    |V     |?       | 5 |   |   | xref:15-opcodes.adoc#call_vn2[`*call_vn2*`] routine _…​up to 7 args…​_
   |VAR     | 27      |251     |`fb`    |`11111011`    |V     |?       | 5 |   |   | xref:15-opcodes.adoc#tokenise[`*tokenise*`] text parse dictionary flag
   |VAR     | 28      |252     |`fc`    |`11111100`    |V     |?       | 5 |   |   | xref:15-opcodes.adoc#encode_text[`*encode_text*`] zscii-text length from coded-text
   |VAR     | 29      |253     |`fd`    |`11111101`    |V     |?       | 5 |   |   | xref:15-opcodes.adoc#copy_table[`*copy_table*`] first second size 
   |VAR     | 30      |254     |`fe`    |`11111110`    |V     |?       | 5 |   |   | xref:15-opcodes.adoc#print_table[`*print_table*`] zscii-text width height skip
   |VAR     | 31      |255     |`ff`    |`11111111`    |V     |?       | 5 |   | * | xref:15-opcodes.adoc#check_arg_count[`*check_arg_count*`] argument-number
   |EXT     |  ―      |190     |`be`    |`10111110`    |E     |        |   |   |   | _Extended opcode sentinel value_
   |EXT     |  0      |  0     |`00`    |`00000000`    |E     |?       | 5 | * |   | xref:15-opcodes.adoc#save[`*save*`] table bytes name prompt -> (result)
   |EXT     |  1      |  1     |`01`    |`00000001`    |E     |?       | 5 | * |   | xref:15-opcodes.adoc#restore[`*restore*`] table bytes name prompt -> (result)
   |EXT     |  2      |  2     |`02`    |`00000010`    |E     |?       | 5 | * |   | xref:15-opcodes.adoc#log_shift[`*log_shift*`] number places -> (result)
   |EXT     |  3      |  3     |`03`    |`00000011`    |E     |?       |5/-| * |   | xref:15-opcodes.adoc#art_shift[`*art_shift*`] number places -> (result)
.2+|EXT  .2+|  4   .2+|  4  .2+|`04` .2+|`00000100` .2+|E  .2+|?       | 5 | * |   | xref:15-opcodes.adoc#set_font[`*set_font*`] font -> (result)
                                                                      ^|6/- ^|*|   | xref:15-opcodes.adoc#set_font[`*set_font*`] font window -> (result)
   |EXT     |  5      |  5     |`05`    |`00000101`    |E     |?       | 6 |   |   | xref:15-opcodes.adoc#draw_picture[`*draw_picture*`] picture-number y x
   |EXT     |  6      |  6     |`06`    |`00000110`    |E     |?       | 6 |   | * | xref:15-opcodes.adoc#picture_data[`*picture_data*`] picture-number array ?(label)
   |EXT     |  7      |  7     |`07`    |`00000111`    |E     |?       | 6 |   |   | xref:15-opcodes.adoc#erase_picture[`*erase_picture*`] picture-number y x
   |EXT     |  8      |  8     |`08`    |`00001000`    |E     |?       | 6 |   |   | xref:15-opcodes.adoc#set_margins[`*set_margins*`] left right window
   |EXT     |  9      |  9     |`09`    |`00001001`    |E     |?       | 5 | * |   | xref:15-opcodes.adoc#save_undo[`*save_undo*`] -> (result)
   |EXT     | 10      | 10     |`0a`    |`00001010`    |E     |?       | 5 | * |   | xref:15-opcodes.adoc#restore_undo[`*restore_undo*`] -> (result)
   |EXT     | 11      | 11     |`0b`    |`00001011`    |E     |?       |5/*|   |   | xref:15-opcodes.adoc#print_unicode[`*print_unicode*`] char-number
   |EXT     | 12      | 12     |`0c`    |`00001100`    |E     |?       |5/*|   |   | xref:15-opcodes.adoc#check_unicode[`*check_unicode*`] char-number -> (result)
.2+|EXT  .2+| 13   .2+| 13  .2+|`0d` .2+|`00001101` .2+|E  .2+|?       |5/*|   |   | xref:15-opcodes.adoc#set_true_colour[`*set_true_colour*`] foreground background
                                                                      ^|6/*|   |   | xref:15-opcodes.adoc#set_true_colour[`*set_true_colour*`] foreground background window
   |EXT     | ―       | 14     |`0e`    |`00001110`    |E     |?       |   |   |   | ―
   |EXT     | ―       | 15     |`0f`    |`00001111`    |E     |?       |   |   |   | ―
   |EXT     | 16      | 16     |`10`    |`00010000`    |E     |?       | 6 |   |   | xref:15-opcodes.adoc#move_window[`*move_window*`] window y x
   |EXT     | 17      | 17     |`11`    |`00010001`    |E     |?       | 6 |   |   | xref:15-opcodes.adoc#window_size[`*window_size*`] window y x
   |EXT     | 18      | 18     |`12`    |`00010010`    |E     |?       | 6 |   |   | xref:15-opcodes.adoc#window_style[`*window_style*`] window flags operation
   |EXT     | 19      | 19     |`13`    |`00010011`    |E     |?       | 6 | * |   | xref:15-opcodes.adoc#get_wind_prop[`*get_wind_prop*`] window property-number -> (result)
   |EXT     | 20      | 20     |`14`    |`00010100`    |E     |?       | 6 |   |   | xref:15-opcodes.adoc#scroll_window[`*scroll_window*`] window pixels
   |EXT     | 21      | 21     |`15`    |`00010101`    |E     |?       | 6 |   |   | xref:15-opcodes.adoc#pop_stack[`*pop_stack*`] items stack
   |EXT     | 22      | 22     |`16`    |`00010110`    |E     |?       | 6 |   |   | xref:15-opcodes.adoc#read_mouse[`*read_mouse*`] array
   |EXT     | 23      | 23     |`17`    |`00010111`    |E     |?       | 6 |   |   | xref:15-opcodes.adoc#mouse_window[`*mouse_window*`] window
   |EXT     | 24      | 24     |`18`    |`00011000`    |E     |?       | 6 |   | * | xref:15-opcodes.adoc#push_stack[`*push_stack*`] value stack ?(label)
   |EXT     | 25      | 25     |`19`    |`00011001`    |E     |?       | 6 |   |   | xref:15-opcodes.adoc#put_wind_prop[`*put_wind_prop*`] window property-number value
   |EXT     | 26      | 26     |`1a`    |`00011010`    |E     |?       | 6 |   |   | xref:15-opcodes.adoc#print_form[`*print_form*`] formatted-table
   |EXT     | 27      | 27     |`1b`    |`00011011`    |E     |?       | 6 |   | * | xref:15-opcodes.adoc#make_menu[`*make_menu*`] number table ?(label)
   |EXT     | 28      | 28     |`1c`    |`00011100`    |E     |?       | 6 |   |   | xref:15-opcodes.adoc#picture_table[`*picture_table*`] table
   |EXT     | 29      | 29     |`1d`    |`00011101`    |E     |?       |6/*| * |   | xref:15-opcodes.adoc#buffer_screen[`*buffer_screen*`] mode -> (result)
"""


if __name__ == "__main__":
    if "-h" in sys.argv or "--help" in sys.argv:
        print(f"Usage: {sys.argv[0]}")
        print("Generates ")
        sys.exit(1)
    print(output())
