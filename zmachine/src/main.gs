// Main game.

import_code("logging.gs")
import_code("zscii_unicode.gs")
import_code("opcodes_list.gs")
import_code("machine.gs")
import_code("screen.gs")
import_code("loadstory.gs")
import_code("native.gs")


main = function(args)
    if args.len != 1 then
        print("Z-Machine interpreter.  For running old Infocom style text adventure games.")
        print("Usage: zmachine (location of story file)")
        print("The story file must be an ascii85 encoded version of the original file.")
        exit
    end if
    filename = args[0]
    storyFile = get_shell.host_computer.File(filename)
    if storyFile == null then
        storyFile = get_shell.host_computer.File(home_dir + "/" + filename)
    end if
    if storyFile == null then
        storyFile = get_shell.host_computer.File(current_path + "/" + filename)
    end if
    if storyFile == null then
        exit("Could not find story file " + filename)
    end if

    logger = Logger.New("main")
    logger.Debug("Loading story")
    
    story = FileLoader.A85Reader(storyFile.get_content)
    if story == null then
        exit("Failed to decode Ascii85 encoded file " + storyFile.path)
    end if

    native = Native.New(80, 20)
    logger.Debug("Reading into memory")
    state = MachineState.New(story, native)
    logger.Debug("Dumping story")
    for line in state.DumpStr()
        print(line)
    end for
end function

if locals == globals then main(params)
