
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
//get_shell.host_computer.touch(home_dir + "/zmachine-out.txt")
MACHINE_PROGRESS = get_shell.host_computer.File(home_dir + "/zmachine-out.txt")
MACHINE_PROGRESS.set_content("")
//MACHINE_PROGRESS_CONTENT = ""
MachineLog = function(text)
    //MACHINE_PROGRESS_CONTENT = MACHINE_PROGRESS_CONTENT + str(text)
    MACHINE_PROGRESS.set_content(MACHINE_PROGRESS.get_content + text)
end function
MachineLogln = function(text)
    //MACHINE_PROGRESS_CONTENT = MACHINE_PROGRESS_CONTENT + str(text)
    //MACHINE_PROGRESS.set_content(MACHINE_PROGRESS_CONTENT + char(10))
    MACHINE_PROGRESS.set_content(MACHINE_PROGRESS.get_content + text + char(10))

    //print(MACHINE_PROGRESS_CONTENT)
    //MACHINE_PROGRESS_CONTENT = ""
end function
