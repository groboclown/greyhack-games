// Main game.

import_code("logging.gs")
import_code("loadstory.gs")
import_code("zscii_unicode.gs")
import_code("opcodes_list.gs")
import_code("machine.gs")
import_code("screen.gs")
import_code("opcodes_v3.gs")
import_code("opcodes_v4.gs")
import_code("opcodes_v5.gs")
import_code("opcodes_v7.gs")
import_code("interpreter.gs")
import_code("native.gs")
import_code("gamedata.gs")


main = function(args)
    if args.len < 1 then
        print("Z-Machine interpreter.  For running old Infocom style text adventure games.")
        print("Usage: zmachine (location of story file)")
        print("The story file must be an ascii85 encoded version of the original file.")
        exit
    end if
    // Allow for larger files...
    story = []
    for filename in args
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
    
        storyPart = FileLoader.A85Reader(storyFile.get_content)
        if storyPart == null then
            exit("Failed to decode Ascii85 encoded file " + storyFile.path)
        end if
        story = story + storyPart
        storyPart = null
    end for

    native = Native.New(80, 20)
    interpreter = Interpreter.New(story, native)
    completed = false
    while not completed
        completed = interpreter.Run()
    end while
end function

if locals == globals then main(params)
