
Logger = {}
Logger.TRACE = 0
Logger.DEBUG = 1
Logger.VERBOSE = 2
Logger.INFO = 3
Logger.WARNING = 4
Logger.ERROR = 5
Logger.New = function(src)
    ret = new Logger
    ret.src = src
    ret.level = Logger.WARNING
    return ret
end function

Logger.LEVELNAME = {
    Logger.TRACE:   "<color=#606060>[TRACE] ",
    Logger.DEBUG:   "<color=#808080>[DEBUG] ",
    Logger.VERBOSE: "<color=#5050ff>[VRBSE] ",
    Logger.INFO:    "<color=#901090>[ INFO] ",
    Logger.WARNING: "<color=#a08060>[ WARN] ",
    Logger.ERROR:   "<color=#f01010>[ERROR] ",
}
Logger.Log = function(level, msg)
    if self.level <= level then
        print(Logger.LEVELNAME[level] + msg)
    end if
end function

Logger.Trace = function(msg)
    self.Log(Logger.TRACE, msg)
end function

Logger.Debug = function(msg)
    self.Log(Logger.DEBUG, msg)
end function

Logger.Verbose = function(msg)
    self.Log(Logger.VERBOSE, msg)
end function

Logger.Info = function(msg)
    self.Log(Logger.INFO, msg)
end function

Logger.Warn = function(msg)
    self.Log(Logger.WARNING, msg)
end function

Logger.Error = function(msg)
    self.Log(Logger.ERROR, msg)
end function

// OpCodeLogger Logger used by opcodes.
OpCodeLogger = Logger.New("opcodes")

// ====================================================================
// Deep level debug controls
//   == 0 - normal
//   == 1 - don't clear the screen
//   == 2 - draw the low-level text formatting
//   == 3 - print only when a print command is sent; looks sloppy.
DISPLAY_DEBUGGING = 0
// DISPLAY_DEBUGGING = 3

// Log machine parsing progress.
// Used to debug the machine parser and opcode handling.
// A bit of native nonsense has crept into this...
//MACHINE_PROGRESS_IDX = 0
//if not get_shell.host_computer.touch(home_dir, "zmachine0.txt") then exit("Failed to create file (1)")
//MACHINE_PROGRESS = get_shell.host_computer.File(home_dir + "/zmachine0.txt")
//if MACHINE_PROGRESS == null then exit("Failed to create file (2)")
//MACHINE_PROGRESS.set_content("")
//MACHINE_PROGRESS_CONTENT = ""
MachineLog = function(text)
//    for ch in str(text).values
//        if ch < 10 or ch > 127 then ch = "\?"
//        outer.MACHINE_PROGRESS_CONTENT = outer.MACHINE_PROGRESS_CONTENT + ch
//    end for
end function
MachineLogln = function(text)
//    MachineLog(text + char(10))
//    outer.MACHINE_PROGRESS.set_content(outer.MACHINE_PROGRESS_CONTENT)
//    if outer.MACHINE_PROGRESS_CONTENT.len > 10000 then
//        outer.MACHINE_PROGRESS_IDX = outer.MACHINE_PROGRESS_IDX + 1
//        if not get_shell.host_computer.touch(home_dir, "zmachine" + outer.MACHINE_PROGRESS_IDX + ".txt") then exit("Failed to create file (3)")
//        outer.MACHINE_PROGRESS = get_shell.host_computer.File(home_dir + "/zmachine" + outer.MACHINE_PROGRESS_IDX + ".txt")
//        if outer.MACHINE_PROGRESS == null then exit("Failed to create file (4) " + outer.MACHINE_PROGRESS_IDX)
//        outer.MACHINE_PROGRESS.set_content("")
//        outer.MACHINE_PROGRESS_CONTENT = ""
//    end if
end function
