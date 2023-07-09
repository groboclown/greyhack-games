// Pulled from:
//   https://github.com/JoeStrout/miniscript/blob/master/MiniScript-cpp/lib/json.ms
// Under the MIT License.
// Vastly simplified for the simple data dealt with here.

GameData = {}

GameData.Archive = function(value)
	if value == null then return "null"
	if value isa number then return str(value)
	if value isa string then return """" + GameData.escape(value) + """"
	if value isa list then return GameData.listToJSON(value)
	if value isa map then return GameData.mapToJSON(value)
    exit("bad value " + typeof(value))
end function

GameData.escape = function(s)
    return s.replace("\", "\\").replace("""", "\""")
    s = s.replace(GameData._escapeFrom[i], GameData._escapeTo[i])
	return s
end function

GameData.listToJSON = function(lst)
    ret = "["
	first = true
	for item in lst
        if first then
            first = false
        else
            ret = ret + ","
        end if
        ret = ret + GameData.Archive(item)
	end for
	return ret + "]"
end function

GameData.mapToJSON = function(lst)
    ret = "{"
	first = true
	for kv in lst.indexes
		if first then
            first = false
        else
			ret = ret + ","
		end if
        ret = ret + GameData.Archive(str(kv)) + ":" + GameData.Archive(lst[kv])
	end for
	return ret + "}"
end function

GameData.Extract = function(value)
    if value.len <= 0 then return null
    return GameData.extractValue([value, 0, value.len])
end function

GameData.extractValue = function(s)
    // Should only come from 'Archive'.  Don't need to worry about
    // whitespace.
    value = s[0]
    if s[1] >= s[2] then exit("Bad archive value at " + s[1])
    ch = value[s[1]]
    if ch == "{" then return GameData.extractMap(s)
    if ch == "[" then return GameData.extractList(s)
    if ch == """" then return GameData.extractString(s)
    // either null or number
    start = s[1]
    strVal = ""
    while "]},:".indexOf(ch) == null
        strVal = strVal + ch
        s[1] = s[1] + 1
        if s[1] >= s[2] then break
        ch = value[s[1]]
    end while
    if strVal == "null" then return null
    ret = strVal.val
    if ret == 0 and strVal != "0" then exit("Bad archive value at " + start + " (" + strVal + ")")
    return ret
end function

GameData.extractString = function(s)
    value = s[0]
    if value[s[1]] != """" then exit("Bad string state at " + s[1])
	strVal = ""
    start = s[1]
print("-- reading string at " + start)
    s[1] = s[1] + 1
    while s[1] < s[2]
        ch = value[s[1]]
        s[1] = s[1] + 1
        if ch == """" then return strVal
        if ch == "\" then
            s[1] = s[1] + 1
            if s[1] >= s[2] then break
            ch = value[s[1]]
        end if
        strVal = strVal + ch
    end while
    exit("Bad archive value at " + start + " (no end-of-string)")
end function

GameData.extractMap = function(s)
    value = s[0]
    if value[s[1]] != "{" then exit("Bad map state at " + s[1])
    retVal = {}
    start = s[1]
print("-- reading map at " + start)
    s[1] = s[1] + 1
    if s[1] < s[2] and value[s[1]] == "}" then
        s[1] = s[1] + 1
        return {}
    end if
    while s[1] < s[2]
        ch = value[s[1]]
        if ch != """" then exit("Bad map at " + start + ", key not a string at " + s[1])
        key = GameData.extractString(s)
        if s[1] >= s[2] then exit("Bad map at " + start + ", terminated with key at " + s[1])
        ch = value[s[1]]
        s[1] = s[1] + 1
        if ch != ":" then exit("Bad map at " + start + ", no ':' after key at " + s[1])

print("-- read key '" + key + "', ended " + s[1])

        entry = GameData.extractValue(s)
        retVal[key] = entry

print("-- read value '" + entry + "', ended " + s[1])

        if s[1] >= s[2] then exit("Bad map at " + start + ", terminated at value at " + s[1])
        ch = value[s[1]]
        s[1] = s[1] + 1
        if ch == "}" then return retVal
        if ch != "," then exit("Bad map at " + start + ", after value came '" + ch + "' at " + s[1])
    end while
    exit("Bad map at " + start + ", did not terminate")
end function

GameData.extractList = function(s)
    value = s[0]
    if value[s[1]] != "[" then exit("Bad list state at " + s[1])
    retVal = []
    start = s[1]
print("-- reading list at " + start)
    s[1] = s[1] + 1
    if s[1] < s[2] and value[s[1]] == "]" then
        s[1] = s[1] + 1
        return []
    end if
    while s[1] < s[2]
        entry = GameData.extractValue(s)
        retVal.push(entry)

        if s[1] >= s[2] then exit("Bad list at " + start + ", terminated at value at " + s[1])
        ch = value[s[1]]
        s[1] = s[1] + 1
        if ch == "]" then return retVal
        if ch != "," then exit("Bad list at " + start + ", after value came '" + ch + "' at " + s[1])
    end while
    exit("Bad list at " + start + ", did not terminate")
end function
