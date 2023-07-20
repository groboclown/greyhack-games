// Main game.

import_code("../src/logging.gs")
import_code("../src/loadstory.gs")
import_code("../src/zscii_unicode.gs")
import_code("../src/opcodes_list.gs")
import_code("../src/machine.gs")
import_code("../src/screen.gs")
import_code("../src/opcodes_v3.gs")
import_code("../src/opcodes_v4.gs")
import_code("../src/opcodes_v5.gs")
import_code("../src/opcodes_v7.gs")
import_code("../src/interpreter.gs")
import_code("../src/native.gs")
import_code("../src/gamedata.gs")

import_code("minizork-src.gs")

native = Native.New(80, 20)
interpreter = Interpreter.New(MINIZORK, native)
completed = false
while not completed
    completed = interpreter.Run()
end while
