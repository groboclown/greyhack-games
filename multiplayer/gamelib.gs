// Basic multiplayer game library.

GameServer = {}
GameServer.New = function(addr, username, passwd, port=21, service="ftp")
    ret = new GameServer
    ret.addr = addr
    ret.username = username
    ret.passwd = passwd
    ret.port = port
    ret.service = service
    ret.server = null
    return ret
end function

// Connect Connect to the server.  Returns a string on error, and null on okay.
GameServer.Connect = function()
    if self.server == null then
        srv = get_shell.connect_service(addr, port, username, passwd, service)
        if srv isa string then
            return srv
        end if
        self.server = srv
    end if
    return null
end function
