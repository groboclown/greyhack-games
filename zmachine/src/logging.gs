
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
    ret.level = Logger.TRACE
    return ret
end function

Logger.LEVELNAME = {
    Logger.TRACE:   "<color=#606060>[TRACE] ",
    Logger.DEBUG:   "<color=#808080>[DEBUG] ",
    Logger.VERBOSE: "<color=#3030a0>[VRBSE] ",
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
    self.Log(Logger.Verbose, msg)
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

OpCodeLogger = Logger.New("opcodes")
