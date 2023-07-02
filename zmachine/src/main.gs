// Main game.

import_code("logging.gs")
import_code("zscii_unicode.gs")
import_code("opcodes_list.gs")
import_code("machine.gs")
import_code("screen.gs")
import_code("loadstory.gs")

// A test for now
import_code("minizork.gs")

main = function(args)
    logger = Logger.New("main")
    logger.Debug("Loading story")
    story = FileLoader.A85Reader(MINIZORK_GAME)
    logger.Debug("Reading into memory")
    screen = Screen.New(80, 20)
    state = MachineState.New(story, screen)
    logger.Debug("Dumping story")
    for line in state.DumpStr()
        print(line)
    end for
end function

if locals == globals then main(params)
