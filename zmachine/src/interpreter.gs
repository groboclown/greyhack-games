// Run the Story file.

Interpreter = {}
Interpreter.New = function(storyData, native)
    ret = new Interpreter
    ret.log = Logger.New("intr")
    ret.machine = MachineState.New(storyData, native)
    ret.FileVersion = ret.machine.FileVersion
    ret.machine.StartGame()
    //for line in self.DumpStr()
    //    ret.log.Debug(line)
    //end for
    return ret
end function

// Run Interpret some of the game.
//
// Returns true if completed.
Interpreter.Run = function()
    self.log.Debug("Fetching next instruction")
    instruction = self.machine.NextInstruction()
    if instruction == null then
        self.log.Debug("null instruction fetched")
        return true
    end if
    // Set the PC for this frame.  In most cases, that's the
    // right behavior.  Calls will return to the instruction *after* this one.
    // On return and jump opcodes, the opcode will explicitly change the PC.
    self.machine.JumpToAddress(instruction[2])
    return not self.HandleInstruction(instruction)
end function

// HandleInstruction Handle the instruction.
//
// instruction is the value returned by the machine state's instructionAt.
Interpreter.HandleInstruction = function(instruction)
    if instruction == null then return false
    mnemonic = instruction[0]
    if not Opcodes.hasIndex(mnemonic) then
        self.log.Error("Unsupported opcode " + mnemonic)
        return false
    end if
    // Return either "null" for standard return (advance instruction),
    // "false" for bad state or end-of-game,
    // or "true" for don't advance the instruction, because it's already
    // happened.
    // Passes:
    //    machine instance
    //    operand list
    //    stored variable reference or null
    //    branch operation or null
    //
    // Operand list is a list of maps:
    //     "t": indicating the type of value (c == const, v == variable reference)
    //     "c": call value (always positive; opcode may need to make it negative)
    //     "v": variable reference
    // branch operation is a map containing:
    //     "t": the type of branch operation (r == return a value, a == jump to address)
    //     "r": return value
    //     "a": jump-to address
    runner = @Opcodes[mnemonic]
    // self.log.Trace("Running mnemonic " + mnemonic)
    res = runner(self.machine, instruction[1], instruction[3], instruction[4])
    if res == null then return true
    return res
end function

// Dump Dump the memory of the data to a string, for debugging purposes.
Interpreter.DumpStr = function()
    toHex = function(num, count=4)
        if num == null then return "(null)"
        H = "0123456789abcdef"
        r = ""
        for i in range(1, count)
            r = H[num % 16] + r
            num = floor(num / 16)
        end for
        return r
    end function

    if self.machine.StatusLineType == null then
        interpreterFlags = "(explicit display)"
    else if self.machine.StatusLineType == 0 then
        interpreterFlags = "Display score/moves"
    else if self.machine.StatusLineType == 2 then
        interpreterFlags = "Display hours:minutes"
    end if
    // StatusLineType The status line display done by the interpreter
    //   == null - defined by story file
    //   == 0 - score/turns
    //   == 2 - hors:mins

    ret = [
        "    **** Story file header ****",
        "Z-code version:           " + self.machine.FileVersion,
        "Interpreter flags:        " + interpreterFlags,
        "Release number:           " + self.machine.ReleaseNumber,
        "Size of resident memory:  " + toHex(self.machine.HighMemoryMark),
        "Start PC:                 " + toHex(self.machine.StartPC),
        "Routine Offset (v6+)      " + toHex(self.machine.routineOffset, 8),
        "String Offset (v6+)       " + toHex(self.machine.stringOffset, 8),
        "Dictionary address:       " + toHex(self.machine.DictionaryAddress),
        "Object table address:     " + toHex(self.machine.ObjectTableAddress),
        "Global variables address: " + toHex(self.machine.GlobalVariablesTableAddress),
        "Static memory address:    " + toHex(self.machine.StaticMemoryBaseAddress),
        //"Size of dynamic memory:   " + toHex(self.machine.StaticMemoryBaseAddress), ??
        "Game flags:               ()",
        "Serial number:            " + self.machine.SerialNumber,
        "Abbreviations address:    " + toHex(self.machine.AbbreviationsTableAddress),
        "File size:                " + toHex(self.machine.FileLen, 8),
        "Checksum:                 " + toHex(self.machine.Checksum),
        "Alphabet table address:   " + toHex(self.machine.AlphabetTableAddress),
        "Terminating table address:" + toHex(self.machine.TerminatingCharactersTableAddress),
        "",
        "    **** Abbreviations ****",
        "",
    ]
    for index in self.machine.cachedAbbreviations.indexes
        ret.push("[" + index + "] '" + self.machine.cachedAbbreviations[index] + "'")
    end for

    ret = ret + ["", "    **** Story file default dictionary ****", ""]
    self.log.Debug("Generating the dictionary at " + toHex(self.machine.DictionaryAddress))
    dict = self.machine.ParseDictionary(self.machine.DictionaryAddress)
    for index in dict.indexes
        item = dict[index]
        ret.push("  " + item[1] + " (" + toHex(item[0]) + ")  '" + index + "'")
    end for

    ret = ret + ["", "    **** Object 2 Information ****", ""]
    data = self.machine.GetObjectData(2)
    ret = ret + [
        "Object Id:    1",
        "Object Name:  '" + self.machine.GetObjectName(data) + "'",
        "Parent Id:    " + self.machine.GetObjectParent(data),
        "Child Id:     " + self.machine.GetObjectChild(data),
        "Sibling Id:   " + self.machine.GetObjectSibling(data),
    ]
    propAddress = self.machine.getFirstPropertyAddress(data)
    propInfo = self.machine.getPropertyAddressInfo(propAddress)
    while propInfo != null
        ret.push("Property " + propInfo[0] + ": " + propInfo[1] + " bytes")
        propInfo = self.machine.getPropertyAddressInfo(propInfo[4])
    end while

    return ret
end function
