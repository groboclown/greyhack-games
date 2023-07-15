// Basic multiplayer game library.

GameServer = {}
GameServer.New = function(addr, username, passwd, port=21, service="ftp", gameDir="/home/guest")
    ret = new GameServer
    // GameName The game's name, so that the player only interacts with people in the same game.
    ret.addr = addr
    ret.username = username
    ret.passwd = passwd
    if port isa string then port = port.to_int
    ret.port = port
    ret.service = service
    ret.gameDir = gameDir
    ret.server = null
    ret.queue = {}
    ret.sendId = {}
    ret.recvId = {}
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

GameServer.msgSep = char(1)
GameServer.maxQueueLen = 100
GameServer.post = function(location, action)
    if self.server == null then return "not connected"
    if action.indexOf(GameServer.msgStart) != null then return "invalid message content"
    if not self.sendId.hasIndex(location) then self.sendId[location] = 0
    if not self.queue.hasIndex(location) then self.queue[location] = []
    if self.queue[location].len >= GameServer.maxQueueLen then self.queue[location].pull
    self.sendId[location] = self.sendId[location] + 1
    self.queue[location].push([str(self.sendId[location]), current_date, action])
    content = ""
    for msg in self.queue[location]
        content = content + GameServer.msgSep + msg[0] + "." + msg[1] + "." + action
    end for
    content = content[1:]

    file = self.server.host_computer.File(location)
    if file == null then
        pos = location.lastIndexOf("/")
        if pos < 0 then return "invalid location: '" + location + "'"
        res = self.server.host_computer.touch(location[:pos], location[pos+1:])
        if res isa string then return res
        file = self.server.host_computer.File(location)
        if file == null then return "failed to access '" + location + "'"
    end if
    res = file.set_content(content)
    if res isa string then return res
    return null
end function

GameServer.closePost = function(location)
    if self.queue.hasIndex(location) then self.queue.remove(location)
    if self.sendId.hasIndex(location) then self.sendId.remove(location)
    if self.server == null then return
    file = self.server.host_computer.File(location)
    if file != null then
        file.delete
    end if
end function

GameServer.pull = function(location)
    // pull all available messages from the location since the last pull.
    if self.server == null then return "not connected"
    if not self.recvId.hasIndex(location) then self.recvId[location] = -1
    file = self.server.host_computer.File(location)
    if file == null then return []
    res = file.get_content
    if res == null then return []
    ret = []
    for message in res.split(GameServer.msgSep)
        p1 = message.indexOf(".")
        if p1 == null then continue
        idx = message[:p1].to_int
        if idx <= self.recvId[location] then continue
        p2 = message.indexOf(".", p1 + 1)
        if p2 == null then continue
        ret.push([idx, message[p1+1:p2], message[p2+1:]])
    end for
    return ret
end function

GameServer.listIn = function(dirLocation)
    if self.server == null then return []
    file = self.server.host_computer.File(dirLocation)
    if file == null or not file.is_folder then return []
    ret = []
    for child in file.get_files
        ret.append({"path": child.path, "name": child.name})
    end for
    return ret
end function

// SetupServer Construct the server directories, so that people can easily connect.
GameServer.SetupServer = function()
    if self.server == null then return "not connected"
    // Ensure the gameDir exists...
    base = "/"
    for sub in self.gameDir.split("/")
        base = base + "/" + sub
        subdir = self.server.host_computer.File(base)
        if subdir == null then
            res = self.server.host_computer.create_folder(base)
            if res isa string then return res
        else if not subdir.is_folder then
            return "bad setup: '" + subdir.path + "' is not a folder"
        end if
    end for
end function

// VisitLobby Connect to the lobby.  Returns a string on error or the Lobby object.
GameServer.VisitLobby = function(gameName, playerName, force=false)
    // Ensure the directories exist.
    res = self.SetupServer()
    if res != null then return res
    lobby = GameServer.Lobby.mk(self, gameName, playerName)
    for path in [server.baseGameDir, lobby.lobbyDir, lobby.pendingGameDir, lobby.activeGameDir]
        subdir = self.server.host_computer.File(lobby.lobbyDir)
        if subdir == null then
            res = self.server.host_computer.create_folder()
            if res isa string then return res
        end if
    end for
    file = self.server.host_computer.File(lobby.userFile)
    if not force and file != null then return "user '" + playerName + "' already in lobby"
    self.post(lobby.userFile, "Arrived")
    return lobby
end function

// Lobby The game lobby.  Allows for chats and game matching.
GameServer.Lobby = {}
GameServer.Lobby.mk = function(server, gameName, playerName)
    if playername.indexOf("/") != null then return null
    ret = new GameServer.Lobby
    ret.playerName = playerName
    ret.server = server
    ret.baseGameDir = server.gameDir + "/" + gameName
    ret.lobbyDir = ret.baseGameDir + "/Lobby"
    ret.pendingGameDir = ret.baseGameDir + "/Pending"
    ret.activeGameDir = ret.baseGameDir + "/Active"
    ret.userFile = ret.lobbyDir + "/" + playerName
    return ret
end function

// Lobby.Disconnect Disconnect from the lobby.
GameServer.Lobby.Disconnect = function()
    if self.server == null then return "not connected"
    self.server.closePost(lobby.userFile)
    file = self.server.host_computer.File(lobby.userFile)
    if file != null then file.delete
    self.server = null
end function

// Lobby.ListPlayers Get the list if player names in the lobby.
GameServer.Lobby.ListPlayers = function()
    if self.server == null then return null
    for item in self.server.listIn(ret.lobbyDir)
        if item.name != self.playerName then ret.push(item.name)
    end for
    return ret
end function

// Lobby.GetPlayerText Get the player's text comments since the last request.
//
// Returns a list of [datetime, text]
GameServer.Lobby.GetPlayerText = function(name)
    if self.server == null then return null
    ret = []
    for item in self.server.pull(self.lobbyDir + "/" + name)
        ret.push([item[1], item[2]])
    end for
    return ret
end function
