// Example Multiplayer Game Library.

GameLib = {}

// New Create a new GameLib object.  Returns null on error in the setup.
GameLib.New = function(context=null)
    if context == null then context = get_custom_object
    ret = new GameLib
    if not context.hasIndex("gameDir") or not context.hasIndex("server") or not context.hasIndex("controller") or not context.hasIndex("playerName") then
        print("Invalid context object")
        return null
    end if

    ret.gameDir = context.gameDir
    ret.server = context.server
    ret.controller = context.controller

    // PlayerName the current game player's alias.
    ret.PlayerName = context.playerName  // string

    if not ret.gameDir isa string or typeof(ret.server) != "computer" or typeof(ret.controller) != "file" or not ret.PlayerName isa string then
        print("Invalid context object format")
        return null
    end if

    file = ret.server.File(ret.gameDir + "/.host.txt")
    if file == null then return null

    // PlayerOrder order of players in the game; the hosting player is first.
    ret.PlayerOrder = file.get_content.split(char(10))

    // PlayerIndex the current player's index in the game.
    ret.PlayerIndex = ret.PlayerOrder.indexOf(ret.PlayerName)
    if ret.PlayerIndex == null then
        print("Player '" + ret.PlayerName + "' not in game's player list.")
        return null
    end if

    ret.ctrlIdx = ""
    ret.postId = {}
    ret.postQueue = {}
    ret.recvId = {}

    // IsHost true if this player hosted the game; false if joined the game.
    ret.IsHost = ret.PlayerIndex == 0
    return ret
end function

// WaitForPlayers Wait up to the number of seconds for all players to be present.
//
// Returns true on timeout waiting for players, false on all players found before the timeout.
// When the check loops, the onWait function is called.  It should, at a minimum, call
// `wait(0.5)` or something similar.
GameLib.WaitForPlayers = function(timeoutSeconds=60.0, onWait=null)
    find = {}
    for name in self.PlayerOrder
        find[name] = true
    end for

    endTime = time + timeoutSeconds
    while time < endTime
        check = {} + find
        for name in check.indexes
            file = self.server.File(self.gameDir + "/" + name)
            if file != null then find.remove(name)
        end for
        if find.len <= 0 then return false
        if @onWait != null then
            onWait()
        else
            wait(0.5)
        end if
    end while
    return true
end function

// NextCommand Read the next command from the controller.
//
// Returns null if there is no new command, or an array
// [isKey (boolean), value].  If isKey is 1, then the value
// is the name of the key (the enter key is 'Enter').  If
// isKey is 0, then the value is the line entered.
// If the isKey is 2, then the controller program has exited.
GameLib.NextCommand = function()
    val = self.controller.get_content
    if val == "exit" then return [2, ""]
    pos = val.indexOf("|")
    if pos == null then return null
    idx = val[:pos]
    if idx != self.ctrlIdx then
        // New command
        self.ctrlIdx = idx
        if val[pos+1] == "!" then return [1, val[pos+2:]]
        return [0, val[pos+2:]]
    end if
    return null
end function

// NewMessagesFrom Pull the latest messages from a single name, in the form [datetime, message, epoch].
//
// This is useful for pulling non-player messages, such as the host actions.
GameLib.NewMessagesFrom = function(name)
    // pull all available messages from the location since the last pull.
    if self.server == null then return []
    locStr = self.gameDir + "/" + name
    maxRecvId = -1
    if self.recvId.hasIndex(name) then maxRecvId = self.recvId[name]
    prevRecvId = maxRecvId
    file = self.server.File(locStr)
    if file == null then return []
    res = file.get_content
    if res == null then return []
    ret = []
    for message in res.split(GameLib.msgSep)
        p1 = message.indexOf(".")
        if p1 == null then continue
        idx = message[:p1].to_int
        if idx <= prevRecvId then continue
        if idx > maxRecvId then maxRecvId = idx
        p2 = message.indexOf(".", p1 + 1)
        if p2 == null then continue
        when = message[p1+1:p2]
        ret.push([when, message[p2+1:], GameLib.dateEpoch(when)])
    end for
    self.recvId[name] = maxRecvId
    return ret
end function

// NewMessages Pull new messages from all the players.  Ordered by date+time posted
GameLib.NewMessages = function()
    ret = []
    for player in self.PlayerOrder
        if player != self.PlayerName then
            ret = ret + self.NewMessagesFrom(player)
        end if
    end for
    GameLib.quickSort(ret, @GameLib__string3AscOrder)
    return ret
end function

// Post Post a message to the server file.
//
// Returns a string on error, null on no error.
GameLib.Post = function(message, ref = null)
    if self.server == null then return "not connected"
    if message.indexOf(GameLib.msgSep) != null then return "invalid message content"
    if ref == null then ref = self.PlayerName
    idx = 0
    if self.postId.hasIndex(ref) then idx = self.postId[ref]
    if self.postQueue.hasIndex(ref) then
        queue = self.postQueue[ref]
        if queue.len > GameLib.maxQueueLen then queue.pull()
    else
        queue = []
        self.postQueue[ref] = queue
    end if
    queue.push([idx, current_date, message])
    self.postId[ref] = idx + 1

    locStr = self.gameDir + "/" + ref
    content = ""
    for msg in queue
        content = content + GameLib.msgSep + msg[0] + "." + msg[1] + "." + msg[2]
    end for
    content = content[1:]  // strip leading separator

    file = self.server.File(locStr)
    if file == null then
        self.server.touch(self.gameDir, ref)
        file = self.server.File(locStr)
        if file == null then return "failed to access '" + locStr + "'"
    end if
    res = file.set_content(content)
    if res isa string then return res
    return null
end function

// --------------------------------------------------------------------
// Static utility functions and constants

// dateEpoch Static function that turns the current_date string into a sortable value.
GameLib.dateEpoch = function(dateStr)
    // Keeps everything as-is except the month (which is turned into a 2 digit number) and the order.
    dateSegments = dateStr.split(" - ")
    date = dateSegments[0].split("/")
    day = date[0]
    month = date[1]
    if GameLib.dateEpochMonths.hasIndex(month) then month = GameLib.dateEpochMonths[month]
    year = date[2]
    return year + month + day + dateSegments[1]
end function

// quickSort Sort the list (internally) using the comparison function.
GameLib.quickSort = function(list, comparison)
    return GameLib.quickSort__entry(list, @comparison, 0, list.len - 1)
end function

GameLib.quickSort__entry = function(list, comparison, lo, hi)
    if lo >= 0 and hi >= 0 and lo < hi then
        p = GameLib.quickSort__partition(list, @comparison, lo, hi)
        GameLib.quickSort__entry(list, @comparison, lo, p)
        GameLib.quickSort__entry(list, @comparison, p + 1, hi)
    end if
end function

GameLib.quickSort__partition = function(list, comparison, lo, hi)
    pivot = list[floor((hi - lo) / 2) + lo]
    i = lo - 1
    j = hi + 1
    while true
        i = i + 1
        while comparison(list[i], pivot) < 0
            i = i + 1
        end while
        j = j - 1
        while comparison(list[j], pivot) > 0
            j = j - 1
        end while
        if i >= j then return j
        tmp = list[i]
        list[i] = list[j]
        list[j] = tmp
    end while
end function

// GameLib__string3AscOrder Sort by the third index of the two arrays.
//    Strangely named to avoid issues with referencing functions in maps.
GameLib__string3AscOrder = function(a, b)
    if a[3] == b[3] then return 0
    if a[3] < b[3] then return -1
    return 1
end function

GameLib.dateEpochMonths = {
    "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04", "May": "05", "Jun": "06",
    "Jul": "07", "Aug": "08", "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12",
}
GameLib.msgSep = char(1)
GameLib.maxQueueLen = 100