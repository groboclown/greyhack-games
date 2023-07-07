#!/usr/bin/python3

"""Generate the unicode table."""

from typing import List, Tuple


def parse_lookup() -> List[Tuple[int, int, str]]:
    """parse the lookup table into (zscii code, unicode, name)"""
    ret: List[Tuple[int, int, str]] = []
    for line in LOOKUP.splitlines():
        line = line.strip()
        if not line:
            continue
        if not line.startswith("<tr><td>"):
            continue
        line = line[len("<tr><td>"):].strip()
        cells = line.split("</td><td>")
        if len(cells) > 3:
            ret.append((int(cells[0].strip()), int(cells[1].strip(), 16), cells[2].strip()))
    return ret


def outputRows(rows: List[Tuple[int, int, str]]) -> str:
    """Output the parsed rows"""
    ret = [
        f"        {zsc}: char({uni:3d}),  // {uni:03x} - {name}"
        for zsc, uni, name in rows
    ]
    return "\n".join(ret)


def output() -> str:
    """Output the table."""
    return "ZSCII_SPECIAL_UNICODE = {\n" + HARD_CODED + outputRows(parse_lookup()) + "\n}\n"


# Hard-coded values
HARD_CODED = """
        0: "",  // char 0 is output as no-text.
        9: " ", // char 9 should only be printed as a tab if it's at the start of a line, otherwise just one space.
        11: "  ", // char 11 is a sentance space, V6 only.
        13: char(10), // newline
        34: \"\"\"\", // 0x22 - neutral double quote
        39: char(8217), // 0x27 - right single quote
        96: char(8216), // 0x60 - left single quote
"""



LOOKUP = """
<tr><td>	155	</td><td>	0e4 	</td><td>	a-diaeresis 		</td><td>&#xe4;</td><td>	ae 				</td></tr>
<tr><td>	156	</td><td>	0f6 	</td><td>	o-diaeresis 		</td><td>&#xf6;</td><td>	oe 				</td></tr>
<tr><td>	157	</td><td>	0fc 	</td><td>	u-diaeresis 		</td><td>&#xfc;</td><td>	ue 				</td></tr>
<tr><td>	158	</td><td>	0c4 	</td><td>	A-diaeresis 		</td><td>&#xc4;</td><td>	Ae 				</td></tr>
<tr><td>	159	</td><td>	0d6 	</td><td>	O-diaeresis 		</td><td>&#xd6;</td><td>	Oe 				</td></tr>
<tr><td>	160	</td><td>	0dc 	</td><td>	U-diaeresis 		</td><td>&#xdc;</td><td>	Ue 				</td></tr>
<tr><td>	161	</td><td>	0df 	</td><td>	sz-ligature 		</td><td>&#xdf;</td><td>	ss 				</td></tr>
<tr><td>	162	</td><td>	0bb 	</td><td>	quotation 			</td><td>&#xbb;</td><td>	&gt;&gt; or " 	</td></tr>
<tr><td>	163	</td><td>	0ab 	</td><td>	marks 				</td><td>&#xab;</td><td>	&lt;&lt; or " 	</td></tr>
<tr><td>	164	</td><td>	0eb 	</td><td>	e-diaeresis 		</td><td>&#xeb;</td><td>	e 				</td></tr>
<tr><td>	165	</td><td>	0ef 	</td><td>	i-diaeresis 		</td><td>&#xef;</td><td>	i 				</td></tr>
<tr><td>	166	</td><td>	0ff 	</td><td>	y-diaeresis 		</td><td>&#xff;</td><td>	y 				</td></tr>
<tr><td>	167	</td><td>	0cb 	</td><td>	E-diaeresis 		</td><td>&#xcb;</td><td>	E 				</td></tr>
<tr><td>	168	</td><td>	0cf 	</td><td>	I-diaeresis 		</td><td>&#xcf;</td><td>	I 				</td></tr>
<tr><td>	169	</td><td>	0e1 	</td><td>	a-acute 			</td><td>&#xe1;</td><td>	a 				</td></tr>
<tr><td>	170	</td><td>	0e9 	</td><td>	e-acute 			</td><td>&#xe9;</td><td>	e 				</td></tr>
<tr><td>	171	</td><td>	0ed 	</td><td>	i-acute 			</td><td>&#xed;</td><td>	i 				</td></tr>
<tr><td>	172	</td><td>	0f3 	</td><td>	o-acute 			</td><td>&#xf3;</td><td>	o 				</td></tr>
<tr><td>	173	</td><td>	0fa 	</td><td>	u-acute 			</td><td>&#xfa;</td><td>	u 				</td></tr>
<tr><td>	174	</td><td>	0fd 	</td><td>	y-acute 			</td><td>&#xfd;</td><td>	y 				</td></tr>
<tr><td>	175	</td><td>	0c1 	</td><td>	A-acute 			</td><td>&#xc1;</td><td>	A 				</td></tr>
<tr><td>	176	</td><td>	0c9 	</td><td>	E-acute 			</td><td>&#xc9;</td><td>	E 				</td></tr>
<tr><td>	177	</td><td>	0cd 	</td><td>	I-acute 			</td><td>&#xcd;</td><td>	I 				</td></tr>
<tr><td>	178	</td><td>	0d3 	</td><td>	O-acute 			</td><td>&#xd3;</td><td>	O 				</td></tr>
<tr><td>	179	</td><td>	0da 	</td><td>	U-acute 			</td><td>&#xda;</td><td>	U 				</td></tr>
<tr><td>	180	</td><td>	0dd 	</td><td>	Y-acute 			</td><td>&#xdd;</td><td>	Y 				</td></tr>
<tr><td>	181	</td><td>	0e0 	</td><td>	a-grave 			</td><td>&#xe0;</td><td>	a 				</td></tr>
<tr><td>	182	</td><td>	0e8 	</td><td>	e-grave 			</td><td>&#xe8;</td><td>	e 				</td></tr>
<tr><td>	183	</td><td>	0ec 	</td><td>	i-grave 			</td><td>&#xec;</td><td>	i 				</td></tr>
<tr><td>	184	</td><td>	0f2 	</td><td>	o-grave 			</td><td>&#xf2;</td><td>	o 				</td></tr>
<tr><td>	185	</td><td>	0f9 	</td><td>	u-grave 			</td><td>&#xf9;</td><td>	u 				</td></tr>
<tr><td>	186	</td><td>	0c0 	</td><td>	A-grave 			</td><td>&#xc0;</td><td>	A 				</td></tr>
<tr><td>	187	</td><td>	0c8 	</td><td>	E-grave 			</td><td>&#xc8;</td><td>	E 				</td></tr>
<tr><td>	188	</td><td>	0cc 	</td><td>	I-grave 			</td><td>&#xcc;</td><td>	I 				</td></tr>
<tr><td>	189	</td><td>	0d2 	</td><td>	O-grave 			</td><td>&#xd2;</td><td>	O 				</td></tr>
<tr><td>	190	</td><td>	0d9 	</td><td>	U-grave 			</td><td>&#xd9;</td><td>	U 				</td></tr>
<tr><td>	191	</td><td>	0e2 	</td><td>	a-circumflex 		</td><td>&#xe2;</td><td>	a				</td></tr>
<tr><td>	192	</td><td>	0ea 	</td><td>	e-circumflex 		</td><td>&#xea;</td><td>	e				</td></tr>
<tr><td>	193	</td><td>	0ee 	</td><td>	i-circumflex 		</td><td>&#xee;</td><td>	i				</td></tr>
<tr><td>	194	</td><td>	0f4 	</td><td>	o-circumflex 		</td><td>&#xf4;</td><td>	o				</td></tr>
<tr><td>	195	</td><td>	0fb 	</td><td>	u-circumflex 		</td><td>&#xfb;</td><td>	u				</td></tr>
<tr><td>	196	</td><td>	0c2 	</td><td>	A-circumflex 		</td><td>&#xc2;</td><td>	A				</td></tr>
<tr><td>	197	</td><td>	0ca 	</td><td>	E-circumflex 		</td><td>&#xca;</td><td>	E				</td></tr>
<tr><td>	198	</td><td>	0ce 	</td><td>	I-circumflex 		</td><td>&#xce;</td><td>	I				</td></tr>
<tr><td>	199	</td><td>	0d4 	</td><td>	O-circumflex 		</td><td>&#xd4;</td><td>	O				</td></tr>
<tr><td>	200	</td><td>	0db 	</td><td>	U-circumflex 		</td><td>&#xdb;</td><td>	U				</td></tr>
<tr><td>	201	</td><td>	0e5 	</td><td>	a-ring 				</td><td>&#xe5;</td><td>	a				</td></tr>
<tr><td>	202	</td><td>	0c5 	</td><td>	A-ring 				</td><td>&#xc5;</td><td>	A				</td></tr>
<tr><td>	203	</td><td>	0f8 	</td><td>	o-slash 			</td><td>&#xf8;</td><td>	o				</td></tr>
<tr><td>	204	</td><td>	0d8 	</td><td>	O-slash 			</td><td>&#xd8;</td><td>	O				</td></tr>
<tr><td>	205	</td><td>	0e3 	</td><td>	a-tilde 			</td><td>&#xe3;</td><td>	a				</td></tr>
<tr><td>	206	</td><td>	0f1 	</td><td>	n-tilde 			</td><td>&#xf1;</td><td>	n				</td></tr>
<tr><td>	207	</td><td>	0f5 	</td><td>	o-tilde 			</td><td>&#xf5;</td><td>	o				</td></tr>
<tr><td>	208	</td><td>	0c3 	</td><td>	A-tilde 			</td><td>&#xc3;</td><td>	A				</td></tr>
<tr><td>	209	</td><td>	0d1 	</td><td>	N-tilde 			</td><td>&#xd1;</td><td>	N				</td></tr>
<tr><td>	210	</td><td>	0d5 	</td><td>	O-tilde 			</td><td>&#xd5;</td><td>	O				</td></tr>
<tr><td>	211	</td><td>	0e6 	</td><td>	ae-ligature 		</td><td>&#xe6;</td><td>	ae				</td></tr>
<tr><td>	212	</td><td>	0c6 	</td><td>	AE-ligature 		</td><td>&#xc6;</td><td>	AE				</td></tr>
<tr><td>	213	</td><td>	0e7 	</td><td>	c-cedilla 			</td><td>&#xe7;</td><td>	c				</td></tr>
<tr><td>	214	</td><td>	0c7 	</td><td>	C-cedilla 			</td><td>&#xc7;</td><td>	C				</td></tr>
<tr><td>	215	</td><td>	0fe 	</td><td>	Icelandic thorn 	</td><td>&#xfe;</td><td>	th				</td></tr>
<tr><td>	216	</td><td>	0f0 	</td><td>	Icelandic eth 		</td><td>&#xf0;</td><td>	th				</td></tr>
<tr><td>	217	</td><td>	0de 	</td><td>	Icelandic Thorn 	</td><td>&#xde;</td><td>	Th				</td></tr>
<tr><td>	218	</td><td>	0d0 	</td><td>	Icelandic Eth 		</td><td>&#xd0;</td><td>	Th				</td></tr>
<tr><td>	219	</td><td>	0a3 	</td><td>	pound symbol 		</td><td>&#xa3;</td><td>	L				</td></tr>
<tr><td>	220	</td><td>	153		</td><td>	oe-ligature 		</td><td>&#x153;</td><td>	oe				</td></tr>
<tr><td>	221	</td><td>	152		</td><td>	OE-ligature 		</td><td>&#x152;</td><td>	OE				</td></tr>
<tr><td>	222	</td><td>	0a1 	</td><td>	inverted ! 			</td><td>&#xa1;</td><td>	!				</td></tr>
<tr><td>	223	</td><td>	0bf 	</td><td>	inverted ? 			</td><td>&#xbf;</td><td>	?				</td></tr>
"""

if __name__ == "__main__":
    print(output())
