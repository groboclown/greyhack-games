// Upload a game to the server.

main = function()
    if params.len <= 0 or params.indexOf("-h") != null or params.indexOf("--help") != null then
        print("Usage: " + program_path + " [-h | --help] --config=file --user=username --pass=password --game=game-dir")
        print("")
        print(" -h | --help          This help screen.")
        print(" --config=file        Configuration file for end-users of the game server.")
        print(" --user=username      Game Uploader's Username to connect to the game server.")
        print(" --pass=password      Game Uploader's Password for the user on the game server.")
        print(" --game=game-dir      Local directory containing the game to upload.")
        exit
    end if

    userConfigFile = null
    ownerUsername = null
    ownerPasswd = null
    gameDir = null

    for param in params
        if param[:9] == "--config=" then
            userConfigFile = param[9:]
        else if param[:7] == "--user=" then
            ownerUsername = param[7:]
        else if param[:7] == "--pass=" then
            ownerPasswd = param[7:]
        else if param[:7] == "--game=" then
            gameDir = param[7:]
        else
            exit("Unknown parameter '" + param + "'")
        end if
    end for
    if userConfigFile == null or ownerUsername == null or ownerPasswd == null or gameDir == null then
        exit("You must specify all the required parameters.  Use argument '--help' for details.")
    end if
    gdFile = get_shell.host_computer.File(gameDir)
    if gdFile == null then gdFile = get_shell.host_computer.File(current_path + "/" + gameDir)
    if gdFile == null then gdFile = get_shell.host_computer.File(home_dir + "/" + gameDir)
    if gdFile == null then exit("Could not find game directory '" + gameDir + "'")
    gameDir = gdFile.path

    server = GameServer.LoadFrom(userConfigFile)
    if server == null then exit("Failed to connect to server")
    res = server.Connect(ownerUsername, ownerPasswd)
    if res != null then exit("Failed to connect to server: " + res)

    aboutFile = get_shell.host_computer.File(gameDir + "/about.txt")
    infoFile = get_shell.host_computer.File(gameDir + "/gameinfo.txt")
    if aboutFile == null or infoFile == null or aboutFile.is_binary or infoFile.is_binary then
        exit("Game directory is not properly formatted.  See the README.md file for details.")
    end if
    gameInfo = GameServer.GameInfo.mk(server, aboutFile, infoFile)
    if gameInfo == null then exit("Invalid game directory setup.  See the README.md file for details.")

    // Need to get the source files.
    if gameInfo.Client[-4:] != ".src" and gameInfo.Client[-7:] != ".bundle" then
        exit("Invalid game directory setup; client source file must end with '.src' or '.bundle'")
    end if
    clientFile = get_shell.host_computer.File(gameInfo.gameDir + "/" + gameInfo.Client)
    if clientFile == null or clientFile.is_binary then exit("Invalid game directory setup; client source file is invalid: '" + gameInfo.gameDir + "/" + gameInfo.Client + "'")
    hostFile = null
    if gameInfo.Host != null then
        if gameInfo.Host[-4:] != ".src" and gameInfo.Host[-7:] != ".bundle" then
            exit("Invalid game directory setup; host source file must end with '.src' or '.bundle'")
        end if
        hostFile = get_shell.host_computer.File(gameInfo.gameDir + "/" + gameInfo.Host)
        if hostFile == null or hostFile.is_binary then exit("Invalid game directory setup; host source file is invalid: '" + gameInfo.gameDir + "/" + gameInfo.Host + "'")
    end if

    remoteGameDir = server.gameDir + "/Games/" + gameInfo.SimpleName
    server.AddFile(remoteGameDir, "about.txt", aboutFile)
    server.AddFile(remoteGameDir, "gameinfo.txt", infoFile)
    server.AddFile(remoteGameDir, gameInfo.Client, clientFile)
    if hostFile != null then
        server.AddFile(remoteGameDir, gameInfo.Host, hostFile)
    end if
end function

// ---------------------------
// Cut-n-paste from lobby.gs
GameServer = {}
GameServer.LoadFrom = function(filename)
    file = get_shell.host_computer.File(filename)
    if file == null then file = get_shell.host_computer.File(current_path + "/" + filename)
    if file == null then file = get_shell.host_computer.File(home_dir + "/" + filename)
    if file == null then
        print("Could not find local file '" + filename + "'")
        return null
    end if
    props = ParsePropertyFile(file.get_content)
    addr = null
    username = "guest"
    passwd = "guest"
    port = 21
    service = "ftp"
    gameDir = "/home/guest"
    if props.hasIndex("ip") then addr = props.ip
    if props.hasIndex("username") then username = props.username
    if props.hasIndex("password") then passwd = props.password
    if props.hasIndex("port") then port = props.port
    if props.hasIndex("service") then service = props.service
    if props.hasIndex("dir") then gameDir = props.dir
    if addr == null then
        print("No 'ip' field set in the game property file '" + filename + "'")
        return null
    end if
    return GameServer.mk(addr, username, passwd, port, service, gameDir)
end function
GameServer.mk = function(addr, username, passwd, port, service, gameDir)
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
    ret.knownGames = {}
    return ret
end function

// Connect Connect to the server.  Returns a string on error, and null on okay.
GameServer.Connect = function(user=null, passwd=null)
    if user == null then user = self.username
    if passwd == null then passwd = self.passwd
    if self.server == null then
        if self.addr == "localhost" then
            srv = get_shell
        else
            srv = get_shell.connect_service(self.addr, self.port, user, passwd, self.service)
        end if
        if srv isa string then
            return srv
        end if
        self.server = srv
    end if
    return null
end function

GameServer.GameInfo = {}
GameServer.GameInfo.mk = function(server, aboutFile, infoFile)
    // aboutFile - the File object for the `about.txt` file.
    // infoFile - the File object for the `game.inf` file.
    ret = new GameServer.GameInfo
    ret.about = aboutFile.get_content
    ret.server = server
    aboutPath = aboutFile.path
    pos = aboutPath.lastIndexOf("/")
    if pos == null then return null
    ret.gameDir = aboutPath[:pos]
    pos = ret.gameDir.lastIndexOf("/")
    if pos == null then return null
    ret.SimpleName = ret.gameDir[pos + 1:]
    ret.pendingGameDir = ret.gameDir + "/Pending"
    ret.activeGameDir = ret.gameDir + "/Active"
    ret.knownPendingGames = {}
    ret.details = ParsePropertyFile(infoFile.get_content)
    ret.Name = null
    ret.Description = null
    ret.MinPlayers = 0
    ret.MaxPlayers = 0
    ret.Client = null
    ret.Host = null
    ret.ClientBin = null
    ret.HostBin = null
    if ret.details.hasIndex("name") then ret.Name = ret.details.name
    if ret.details.hasIndex("desc") then ret.Description = ret.details.desc
    if ret.details.hasIndex("min-players") then ret.MinPlayers = ret.details["min-players"].to_int
    if ret.details.hasIndex("max-players") then ret.MaxPlayers = ret.details["max-players"].to_int
    if ret.details.hasIndex("client") then ret.Client = ret.details.client
    if ret.details.hasIndex("client-bin") then ret.ClientBin = ret.details["client-bin"]
    if ret.details.hasIndex("host") then ret.Host = ret.details.host
    if ret.details.hasIndex("host-bin") then ret.HostBin = ret.details["host-bin"]
    if ret.Name == null or ret.MinPlayers <= 0 or ret.Client == null then return null
    if ret.Host != null and ret.Host.indexOf("/") != null then return null
    if ret.Client.indexOf("/") != null then return null
    return ret
end function

// ParsePropertyFile Parse the property file formatted contents.
ParsePropertyFile = function(contents)
    if contents == null then return {}
    ret = {}
    for line in contents.split(char(10))
        // Remove leading whitespace
        while line.len > 0 and line[0] == " "
            line = line[1:]
        end while
        if line.len <= 0 then continue
        if line[0] == "#" then continue
        pos = line.indexOf("=")
        if pos > 0 then
            ret[line[:pos]] = line[pos+1:]
        end if
    end for
    return ret
end function

// --------------
// Custom stuff on top of the game server.
GameServer.AddFile = function(dirName, fileName, localFile)
    if self.server == null then return "not connected"
    print("DEBUG Getting server directory '" + dirName + "'")
    parent = self.server.host_computer.File(dirName)
    if parent == null then
        pos = dirName.lastIndexOf("/")
        self.server.host_computer.create_folder(dirName[:pos], dirName[pos+1:])
        print("DEBUG Getting server directory '" + dirName + "'")
        parent = self.server.host_computer.File(dirName)
        if parent != null then
            // Set permissions
            res = parent.chmod("u+rwx")
            if res != "" and res != null then exit("Failed to update directory '" + dirName + "' user permissions: " + res)
            res = parent.chmod("g+rwx")
            if res != "" and res != null then exit("Failed to update directory '" + dirName + "' user permissions: " + res)
            res = parent.chmod("o+rx")
            if res != "" and res != null then exit("Failed to update directory '" + dirName + "' user permissions: " + res)
        end if
    end if
    if parent == null or not parent.is_folder then
        return "Could not create parent directory '" + dirName + "'"
    end if
    rfile = self.server.host_computer.File(dirName + "/" + fileName)
    if rfile == null then
        self.server.host_computer.touch(dirName, fileName)
        rfile = self.server.host_computer.File(dirName + "/" + fileName)
    end if
    if rfile == null or rfile.is_folder then exit("Failed to create file '" + dirName + "/" + fileName + "'")
    res = rfile.chmod("u+rwx")
    if res != "" and res != null then exit("Failed to update directory '" + rfile.path + "' group permissions: " + res)
    res = rfile.chmod("g+rwx")
    if res != "" and res != null then exit("Failed to update directory '" + rfile.path + "' group permissions: " + res)
    res = rfile.chmod("o+rwx")
    if res != "" and res != null then exit("Failed to update directory '" + rfile.path + "' other permissions: " + res)

    rfile.set_content(localFile.get_content)
end function

if locals == globals then main()
