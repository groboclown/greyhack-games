// MachineState The machine state.
MachineState = {}

// Machine.New Loads in the game data from the story data
//
// The memory stores static, dynamic, high memory, the stack,
// local variables, and global variables.  This allows it to be
// a one-stop-shop for the opcode value lookup.
//
// Direct data access is done in one of two ways:
//   * request a block of bytes by address type, and the
//     "physical" (by index) address range is returned.
//     The data can be directly accessed from the returned
//     values.
//   * request a block of words by address type.  The
//     data is extracted out using word conversion into an
//     array of words, with 0 index == initial address.
//
// Internally, the function will look up values as is the
// most optimal for that function.
//
// String access is a bit of a hybrid, in that
// it maintains a copy of the decoded string at an address,
// and decodes directly from memory.
MachineState.New = function(storyData, native)
    if storyData.len < 64 then exit("data must be at least 64 bytes long")

    ret = new MachineState
    ret.screen = Screen.New(native.ScreenWidth, native.ScreenHeight)
    ret.native = native
    ret.log = Logger.New("mcst")
    ret.log.Debug("Loading " + storyData.len + " byte story.")

    // storyData The original story.
    //
    // Used as a reference, so that restarting a story is easy.
    ret.storyData = storyData

    // ================================================================
    // Dynamic Data Setup
    //    Data that the interpreter can set and the game data can change.

    // headerData Modifiable header data.
    //
    // A combination of interpreter
    // data and game set data.  The key is the header address.
    // The key is in the range 0-64 (0x40).
    ret.headerData = {}

    // headerExtensionData Modifiable header extension data.
    ret.headerExtensionData = {}

    // callStack The state of execution within the story.
    //
    // The call stack is the "call..." references + initial game play.  It stores
    // the stack ("stack") (accessed via variable number 0x00), the code pointer ("pc"),
    // and local variables ("locals") (variable reference 0x01 to 0x0f).
    //
    // Current execution is the last item (callStack[-1]).
    //
    // The index in this call stack is the "stack frame" used for catch and throw opcodes.
    ret.callStack = []

    // Dynamic Memory.
    // Writes to dynamic memory are done here.  Dynamic memory is everything below
    // the static memory address.
    ret.dynamicMemory = {}

    // In Version 6, the Z-machine understands a "user stack",
    // which is a table of words in dynamic memory.  However, v6 isn't supported here.

    // ================================================================
    // Header Parsing

    // FileVersion The story file version.
    //
    // Drives compatibility with everything in the game.
    version = storyData[0] // 0x00
    if version == 6 then exit("version 6 files not supported")
    ret.FileVersion = version

    ret.WordSize = 2
    if version >= 8 then
        ret.WordSize = 4
    end if

    // Story Release Number
    ret.ReleaseNumber = storyData[3]

    // Flags 1
    flags = storyData[1] // 0x01
    // StatusLineType The status line display done by the interpreter
    //   == null - defined by story file
    //   == 0 - score/turns
    //   == 2 - hours:mins
    ret.StatusLineType = null
    // SplitFile Is the game split across two discs?
    ret.SplitFile = false
    if version <= 3 then
        ret.StatusLineType = bitAnd(flags, 2)
        ret.SplitFile = bitAnd(flags, 4) == 4 // bit 2

        // Interpreter needs to set these bits:
        // Bit 4: interpreter sets 1 if status line is unavailable
        // Bit 5: interpreter sets 1 if screen splitting is available
        // Bit 6: is variable pitch font the default?
        ret.headerData[1] = bitAnd(flags, 143) + 96  // (flags & 0b10001111) | 0b01100000
    else
        // Interpreter needs to set these bits:
        // Bit 0: Colors available?  (v5+)
        // Bit 1: Picture displaying available? (v6+)
        // Bit 2: Boldface available? (v4+)
        // Bit 3: Italic available? (v4+)
        // Bit 4: Fixed space style available? (v4+)
        // Bit 5: Sound effects available? (v6+)
        // Bit 7: Timed keyboard available? (v4+)
        ret.headerData[1] = 29  // 0b00011101
    end if

    // HighMemoryMark Byte address of high memory.
    ret.HighMemoryMark = (storyData[4] * 256) + storyData[5] // 0x04, 0x05

    // Packed Memory addressing.
    //   v1 - 3: address * 2
    //   v4 - 5: address * 4
    //   v6 - 7:
    //       routine address: (address * 4) + routine offset
    //       string address: (address * 4) + string offset
    //   v8+: address * 8
    ret.packedAddressMult = 2
    ret.routineOffset = 0
    ret.stringOffset = 0
    if version >= 4 and version <= 5 then
        ret.packedAddressMult = 4
    else if version >= 6 and version <= 7 then
        ret.packedAddressMult = 4
        // Routine Offset, for version 6 and 7 files.  Divided by 8
        ret.routineOffset = 8 * ((storyData[40] * 256) + storyData[41]) // 0x28, 0x29
        // String Offset, for version 6 and 7 files.  Divided by 8
        ret.stringOffset = 8 * ((storyData[42] * 256) + storyData[43]) // 0x2a, 0x2b
    else if version > 7 then
        ret.packedAddressMult = 8
    end if

    // StartPC Initial value of program counter
    //    v1-5: byte address
    //    v6+:  main routine (packed address)
    ret.StartPC = (storyData[6] * 256) + storyData[7]

    // DictionaryAddress Location of dictionary (byte address)
    ret.DictionaryAddress = (storyData[8] * 256) + storyData[9]  // 0x08, 0x09

    // ObjectTableAddress Location of object table (byte address)
    ret.ObjectTableAddress = (storyData[10] * 256) + storyData[11]  // 0x0a, 0x0b

    // GlobalVariablesTableAddress Location of global variables table (byte address)
    ret.GlobalVariablesTableAddress = (storyData[12] * 256) + storyData[13]  // 0x0c, 0x0d

    // Base of static memory (byte address)
    // Also, the size of dynamic memory
    ret.StaticMemoryBaseAddress = (storyData[14] * 256) + storyData[15]  // 0x0e, 0x0f

    // Flags 2
    flags = (storyData[16] * 256) + storyData[17]  // 0x10, 0x11
    // Bit 0: set to 1 when transcripting is turned on.
    //    The game + interpreter can set this whenever.
	// Bit 1: Game sets to 1 when forcing display in fixed-pitch font.
    //    Interpreter restores value on game state load.
    // Bit 2 (v6+): Interpreter sets to 1 when requesting screen redraw, and game sets to 0 after redraw
    // Bit 3: Set by game when it wants to use pictures.
    //    Interpreter restores value on game state load.
    // Bit 4: Set by game when it wants to use UNDO opcodes.
    //    Interpreter restores value on game state load.
    // Bit 5: Set by game when it wants to use a mouse.
    //    Interpreter restores value on game state load.
	// Bit 6: Set by game when it wants to use colors.  Hard-coded.
    ret.UsesColors = (bitAnd(flags, 64)) == 64
	// Bit 7: Set by game when it wants to use sound effects
    //    Interpreter restores value on game state load.
	// Bit 8: Set by game when it wants to use menus (v6 only)
    //    Interpreter restores value on game state load.

    // Convention - game serial number stored as 6 characters of ascii.
    ret.SerialNumber = ""
    for i in range(18, 18 + 6)  // 0x12
        if storyData[i] >= 32 and storyData[i] <= 127 then
            ret.SerialNumber = ret.SerialNumber + char(storyData[i])
        end if
    end for

    // AbbreviationsTableAddress Location of abbreviations table (byte address)
    ret.AbbreviationsTableAddress = (storyData[24] * 256) + storyData[25] // 0x18, 0x19

    // 0x1a,0x1b - Length of file (v3 or higher)
    // 0x1c,0x1d - Checksum (v3 or higher)
    // Some early Version 3 files do not contain length and checksum data.
    ret.FileLen = (storyData[26] * 256) + storyData[27]  // 0x1a, 0x1b
    if ret.FileLen <= 0 then
        ret.FileLen = storyData.len
    end if
    ret.Checksum = (storyData[28] * 256) + storyData[29]  // 0x1c, 0x1d

    // Interpreter number (v4 or higher).  We're picking Apple //e
    ret.headerData[30] = 2  // 0x1e
    // Interpreter version (v4 or higher)
    // Interpreter versions are conventionally ASCII codes for upper-case
    // letters in Versions 4 and 5 (note that Infocom’s Version 6 interpreters
    // just store numbers here).
    // Modern games are strongly discouraged from testing the interpreter number or
    // interpreter version header information for any game-changing behaviour. It is 
    // rarely meaningful, and a Standard interpreter provides many better ways to query
    // the interpreter for information.
    ret.headerData[31] = 65  // 0x1f, "A".code

    // Address of terminating characters table (bytes)
    ret.TerminatingCharactersTableAddress = (storyData[46] * 256) + storyData[47]  // 0x2e, 0x2f
    
    // 0x30 - Total width in pixels of text sent to output stream 3 (v6 only)

    // Standard revision number
    // If an interpreter obeys Revision n.m of this document perfectly, as
    // far as anyone knows, then byte $32 should be written with n and byte
    // $33 with m. If it is an earlier (non-standard) interpreter, it should
    // leave these bytes as 0.
    ret.headerData[50] = 0  // 0x32
    ret.headerData[51] = 0  // 0x33

    // Alphabet table address (bytes), or 0 for default
    ret.AlphabetTableAddress = (storyData[52] * 256) + storyData[53]  // 0x34, 0x35
    if ret.AlphabetTableAddress == 0 then
        ret.AlphabetTableAddress = null
    end if

    // Extension header
    ret.ExtensionHeaderAddr = null
    ret.ExtensionHeaderWordCount = 0
    ret.UnicodeTranslationTableAddress = null
    if ret.FileVersion >= 5 then
        ret.ExtensionHeaderAddr = (storyData[54] * 256) + storyData[55]  // 0x36, 0x37
        if ret.ExtensionHeaderAddr == 0 or ret.ExtensionHeaderAddr >= storyData.len then
            ret.ExtensionHeaderAddr = null
        else
            // word 0: Number of further words in table
            ret.ExtensionHeaderWordCount = (storyData[ret.ExtensionHeaderAddr] * 256) + storyData[ret.ExtensionHeaderAddr + 1]
            // word 1: X-coordinate of mouse after a click
            // word 2: Y-coordinate of mouse after a click

            // word 3: Unicode translation table address (optional)
            if ret.ExtensionHeaderWordCount >= 3 then
                ret.UnicodeTranslationTableAddress = (storyData[ret.ExtensionHeaderAddr + 6] * 256) + storyData[ret.ExtensionHeaderAddr + 7]
                if ret.UnicodeTranslationTableAddress == 0 then ret.UnicodeTranslationTableAddress = null
            end if

            // word 4: flags 3
            // bit 0: If set, game wants to use transparency (v6 only)

            // word 5: true default foreground color
            // word 6: true default background color
        end if
    end if

    // positions 32 - 37 reflect the screen size, and 44-45 handle the colors, and extension
    // header word 5 and 6 handle the true colors.
    ret.UpdateScreenRef()

    // Stream handling.

    // Stream 1 == screen
    ret.Stream1Active = true

    // Stream 2 == transcript
    ret.Stream2Active = false

    // Stream 3 == dynamic memory table; when selected, no output is sent to the other two.
    // While stream 3 is selected, the table’s contents are unspecified
    // (and a game cannot safely read or write to it). When the stream is deselected,
    // the initial word of the table holds the number of characters printed and
    // subsequent bytes hold those characters.
    // Writing a newline to stream 3 is turned into ZSCII 13.
    // It is possible for stream 3 to be selected while it is already on.
    // If this happens, the previous table address is remembered and the previous
    // table is resumed when the new one is finished. This nesting can reach a depth of up
    // to 16: if stream 3 is opened for a seventeenth time, the interpreter should halt
    // with an error message.
    // Stream 3 is a stack containing a map if {"address": 0, "buffer": []}
    ret.Stream3 = []

    // Stream 4 is just user input.  It's pushed to the native handler.
    ret.Stream4Active = false

    // strings by memory address
    ret.cachedStrings = {}

    // parsed dictionary tables by memory address
    // Each value is map of { entry name: [address, index] }
    ret.cachedDictionaries = {}

    // Initialize the zscii table, based on the current version information.
    ret.log.Debug("Initializing the zscii alphabet table")
    ret.cachedAbbreviations = {}
    ret.zsciiAlphabetTableInit()
    native.SetZsciiUnicodeTable(ret.zsciiSpecialUnicode)

    return ret
end function

// SaveState Record the state of the z-machine for later loading.
//
// Returns a string for sending to a file, for later retrieval.
MachineState.SaveState = function()
    // 1. Save game-settable header values.
    //      "flags 2" is not saved. (offset 16, 17 / 0x10, 0x11
    // 2. 
    return ""
end function

// UpdateScreenRef Update the machine state to reflect changes to the output screen.
MachineState.UpdateScreenRef = function()
    self.log.Debug("Updating the header screen values")

    // This is using the screen object's width/height, not the native values.
    // The screen may have its own things between the game's view of the output
    // and the actual output construction.

    // Screen height (lines): 255 means “infinite”
    self.headerData[32] = self.screen.Height  // 0x20

    // Screen width (characters)
    self.headerData[33] = self.screen.Width // 0x21

    // Unit sizes: since we don't use graphics, use unit size of 1 to make it easy on us.
    // And it's completely valid.

    // Screen width in units (word)
    self.headerData[34] = 0  // 0x22
    self.headerData[35] = self.screen.Width  // 0x23

    // Screen height in units (word)
    self.headerData[36] = 0  // 0x24
    self.headerData[37] = self.screen.Height  // 0x25

    // Font width in units (defined as width of a 0)
    //   v6, this is font height in units
    self.headerData[38] = 1  // 0x26

    // Font height in units
    //   v6, this is Font width in units (defined as width of a 0)
    self.headerData[39] = 1  // 0x27

    // Default background colour
    self.DefaultBackgroundColor = 2
    self.headerData[44] = self.screen.DefaultBackgroundColor  // 0x2c

    // Default foreground colour
    self.DefaultForegroundColor = 4
    self.headerData[45] = self.screen.DefaultForegroundColor  // 0x2d

    // Extension header word 5: true default foreground color
    // Extension header word 6: true default background color
    if self.ExtensionHeaderAddr != null and self.ExtensionHeaderWordCount >= 6 then
        self.headerExtensionData[10] = floor(self.screen.DefaultForegroundColor15 / 256) % 256
        self.headerExtensionData[11] = self.screen.DefaultForegroundColor15 % 256
        self.headerExtensionData[12] = floor(self.screen.DefaultBackgroundColor15 / 256) % 256
        self.headerExtensionData[13] = self.screen.DefaultBackgroundColor15 % 256
    end if
end function

// GetVariableRef Get the variable reference value, or null if invalid.
MachineState.GetVariableRef = function(variableRef)
    // self.log.Trace("Getting variable reference " + variableRef)
    if variableRef >= 16 then return self.getGlobalVariable(variableRef)
    if variableRef == 0 then
        // get from the stack
        stack = self.callStack[-1].stack
        if stack.len > 0 then
            // self.log.Trace(":: Stack (" + stack[-1] + ")")
            return stack[-1]
        end if
        self.log.Info("Getting variable reference from empty stack")
        return 0
    end if
    callLocals = self.callStack[-1].locals
    // variableRef will reference index - 1
    self.log.Trace(" - Getting from local variables " + callLocals)
    if callLocals.len < variableRef then return 0
    return callLocals[variableRef - 1]
end function

// SetVariableRef Set the variable reference value.
MachineState.SetVariableRef = function(variableRef, value)
    if variableRef >= 16 then return self.setGlobalVariable(variableRef, value)
    // should this check that the value is in range?
    if variableRef == 0 then
        // push onto the stack
        self.log.Trace(":: Stack <- " + value)
        MachineLogln("  [stack <- " + value + "]")
        self.callStack[-1].stack.push(value)
        return
    end if
    callLocals = self.callStack[-1].locals
    // variableRef will reference index - 1
    // Really, the variable size is set in the routine header, so this
    // should cause a failure if the variable ref > size.
    while callLocals.len < variableRef
        callLocals.push(0)
    end while
    self.log.Trace(":: Local " + (variableRef - 1) + " <- " + value)
    MachineLogln("  [local " + (variableRef - 1) + " <- " + value + "]")
    callLocals[variableRef - 1] = value
end function

// getGlobalVariable Get the global variable as the opcode references it (number between 0x10 and 0xff)
MachineState.getGlobalVariable = function(variable)
    if variable < 16 or variable > 255 then exit("Invalid variable reference " + variable)

    address = self.GlobalVariablesTableAddress + ((variable - 16) * 2)  // 0x10
    // self.log.Trace("Getting global variable " + variable + " @" + address)
    hi = self.storyData[address]
    if self.dynamicMemory.hasIndex(address) then
        hi = self.dynamicMemory[address]
    end if
    address = address + 1
    lo = self.storyData[address]
    if self.dynamicMemory.hasIndex(address) then
        lo = self.dynamicMemory[address]
    end if
    ret = (hi * 256) + lo
    // self.log.Trace(" -> " + ret)
    return ret
end function

// setGlobalVariable Set the global variable as the opcode references it (number between 0x10 and 0xff)
MachineState.setGlobalVariable = function(variable, value)
    if variable < 16 or variable > 255 then exit("Invalid variable reference " + variable)
    if value < 0 or value > 65535 then exit("Invalid variable value " + value)
    // Set the changed value store.
    address = self.GlobalVariablesTableAddress + ((variable - 16) * 2)  // 0x10
    MachineLogln("  [global " + (variable - 16) + " <- " + value + "]")
    self.log.Trace(":: Global @" + address + " <- " + (floor(value / 256) % 256))
    self.dynamicMemory[address] = floor(value / 256) % 256  // modulo shouldn't be necessary.
    self.log.Trace(":: Global @" + (address + 1) + " <- " + (value % 256))
    self.dynamicMemory[address + 1] = value % 256
end function

// FromByteAddress Convert a byte address to a physical address
MachineState.FromByteAddress = function(address)
    if address > self.MaxStaticMemoryPos then return null
    return address
end function

// FromStringPackAddress Convert a string pack address to a physical address.
MachineState.FromStringPackAddress = function(address)
    return (address * self.packedAddressMult) + self.stringOffset
end function

// ReadWord Read a 'word' from memory.
MachineState.ReadWord = function(physAddress)
    // Because of the frequency of this call, it should be optimized.
    if self.WordSize == 2 then
        return (self.ReadByte(physAddress) * 256) + self.ReadByte(physAddress + 1)
    end if
    return (self.ReadByte(physAddress) * 16777216) + (self.ReadByte(physAddress + 1) * 65536) + (self.ReadByte(physAddress + 2) * 256) + self.ReadByte(physAddress + 3)
end function

// Read the physical address from memory.
MachineState.ReadByte = function(physAddress)
    // Needs to find the right section of memory to read.
    // Could be from a flexible portion.
    // if physAddress < 0 or physAddress > self.FileLen then exit("Invalid address " + physAddress + " (file len " + self.FileLen + ")")
    if physAddress < 0 or physAddress > self.storyData.len then exit("Invalid address " + physAddress)
    
    // Is it header memory?
    if self.headerData.hasIndex(physAddress) then
        return self.headerData[physAddress]
    end if
    if self.ExtensionHeaderAddr != null then
        offset = physAddress - self.ExtensionHeaderAddr
        if offset >= 0 and offset < (self.ExtensionHeaderWordCount * 2) then
            wordIdx = floor(offset / 2)
            if self.headerExtensionData.hasIndex(wordIdx) then
                value = self.headerExtensionData[wordIdx]
                if (offset % 2) == 0 then
                    return floor(value / 256) % 256
                end if
                return value % 256
            end if
            return self.storyData[physAddress]
        end if
    end if

    // Is it dynamic memory?
    if self.dynamicMemory.hasIndex(physAddress) then
        return self.dynamicMemory[physAddress]
    end if

    // Otherwise, just use raw access.
    return self.storyData[physAddress]
end function

// SetWord Game accessible memory write
MachineState.SetWord = function(physAddress, value)
    // Because of the frequency of this call, it should be optimized.
    MachineLogln("  [mem @" + physAddress + " <- word " + value + "]")
    if self.WordSize == 2 then
        self.SetByte(physAddress, floor(value / 256) % 256)
        self.SetByte(physAddress + 1, value % 256)
        return
    end if
    self.SetByte(physAddress, floor(value / 16777216) % 256)
    self.SetByte(physAddress + 1, floor(value / 65536) % 256)
    self.SetByte(physAddress + 2, floor(value / 256) % 256)
    self.SetByte(physAddress + 3, value % 256)
end function

// SetByte Game accessible memory write
MachineState.SetByte = function(physAddress, value)
    // It is illegal for a game to attempt to write to static memory.
    if physAddress < 0 or physAddress >= self.StaticMemoryBaseAddress then exit("Illegal address: " + physAddress)
    if value < 0 or value > 255 then exit("Illegal value: " + value)

    MachineLogln("  [mem @" + physAddress + " <- byte " + value + "]")

    // flags 2 bits 7-0
    if physAddress == 16 then  // 0x10
        // Bit 0: set to 1 when transcripting is turned on.
        //    The game + interpreter can set this whenever.
        if value % 2 == 1 then
            // Turn on file transcript.
            if self.native.EnableTranscript() then
                self.Stream2Active = true
            end if
        else
            // Turn off stream 2, but don't change the filename.
            self.native.DisableTranscript()
            self.Stream2Active = false
        end if

        // If bit 1 is set, then the game is forcing fixed-pitch font.
        // However, this interpreter only prints in fixed-pitch font.
        // In version 6, if bit 2 is cleared, then that means the game has
        // redrawn the screen.

        // Ignore any changes the game makes to the other bits.

        self.headerData[physAddress] = value

        return
    end if

    if physAddress < 64 then  // 0x40
        // Anything else in the header shouldn't be writable...
        exit("Header not writable; address " + physAddress)
    end if

    // Else it's dynamic memory
    self.dynamicMemory[physAddress] = value
end function

// SetOutputStreamState Set the output stream (1, 2, 3, 4) and optional table (for stream 3).
//
// If the stream number is negative, then that stream is disabled.
// Stream number 0 does nothing.
MachineState.SetOutputStreamState = function(streamNumber, tableAddress = null)
    enabled = true
    if streamNumber > 32767 then  // top bit set on a word
        enabled = false
        streamNumber = 65536 - streamNumber
    else if streamNumber > 127 then  // top bit set on a byte
        enabled = false
        streamNumber = 256 - streamNumber
    end if

    if streamNumber == 1 then
        self.Stream1Active = enabled == 1
    else if streamNumber == 2 then
        // This must also change the transcript bit in flags 2

        flag2 = self.ReadByte(16)  // 0x10
        flag2flip = bitAnd(flag2, 254)  // 0xfe, 0b11111110
        if enabled then flag2flip = flag2flip + 1
        if flag2flip != flag2 then
            // This should trigger the native state change.
            self.SetByte(16, flag2flip)  // 0x10
        end if
    else if streamNumber == 3 then
        // Special stream stack.
        if enabled then
            // Push a new stream stack.
            // If stream 3 is opened for a seventeenth time, the interpreter should halt
            // with an error message.
            if self.Stream3.len >= 16 then exit("opened stream 3 too many times")
            if tableAddress == null or tableAddress < 64 or tableAddress >= self.StaticMemoryBaseAddress then  // 0x40
                exit("Invalid stream 3 table address: " + tableAddress)
            end if
            self.Stream3.push({"address": tableAddress, "buffer": []})
        else
        end if
    else if streamNumber == 4 then
        // Stream 4 is just user input
        if enabled then
            self.native.EnableUserInputCapture()
        else
            self.native.DisableUserInputCapture()
        end if
    else if streamNumber != 0 then
        // enable stream 0 is ignored.
        exit("Invalid stream number " + streamNumber)
    end if
end function

// ====================================================================
// Input and Display Stuff.

// UpdateStatusLine Update the status line, and ensure that it is shown.
MachineState.UpdateStatusLine = function()
    // Shows the short name of the object whose number is in the first global variable.
    statusObjectId = self.getGlobalVariable(16)  // 0x10, the first global
    statusObject = self.GetObjectData(statusObjectId)
    statusObjectName = self.GetObjectName(statusObject)
    if statusObjectName == null then statusObjectName = "(unset)"
    // score or hour is in the second global variable, turn or minute is in the third.
    score = self.getGlobalVariable(17)  // 0x11, the second global
    turn = self.getGlobalVariable(18)  // 0x11, the third global
    self.screen.SetStatusLine(statusObjectName, score, turn)
    if self.Stream1Active then
        self.native.DrawScreen(self.screen.Render())
        cursor = self.screen.GetActiveCursor()
        self.native.SetCursor(cursor[0], cursor[1])
    end if
end function

// ReadInputLine Read user input
//
// Returns [was CR terminated?, zscii text, raw user input text]
MachineState.ReadInputLine = function(maxCharCount)
    cursor = self.screen.GetActiveCursor()
    userInput = self.native.ReadLine(maxCharCount, cursor[0], cursor[1])
    // TODO send this to output stream 4.
    self.screen.AddUserInput(userInput[2], userInput[0])
    return userInput
end function

// PrintZscii Display a string to the output streams.
//
// Text should be a string with characters in zscii codes, not unicode.
MachineState.PrintZscii = function(text)
    if self.Stream3.len > 0 then
        // Stream 3 is a stack containing a map if {"address": 0, "buffer": []}
        // Writing a newline to stream 3 is turned into ZSCII 13.
        for ch in text.values()
            // Should this be bytes?
            ret.Stream3[-1].buffer.push(ch.code)
        end for

        // Output stream 3 is unusual in that, while it is selected, no text is sent
        // to any other output streams which are selected.
        return
    end if

    // Stream 1 == screen
    if self.Stream1Active then
        self.screen.PrintZscii(text)
        self.native.DrawScreen(self.screen.Render())
        cursor = self.screen.GetActiveCursor()
        self.native.SetCursor(cursor[0], cursor[1])
    end if

    // Stream 2 == transcript
    if self.Stream2Active then
        self.native.PrintTranscript(text)
    end if

    // Stream 4 is just user input.  Printing is not user input.
end function

// ====================================================================

// GetObjectPropertyDefault Get the default property value (unsigned 16-bit word)
MachineState.GetObjectPropertyDefault = function(propertyIndex)
    // 31 values in v3
    if propertyIndex > 31 and self.FileVersion <= 3 then return null
    // 63 values in v4+
    if propertyIndex > 63 or propertyIndex < 0 then return null

    address = self.ObjectTableAddress + (propertyIndex * self.WordSize)
    MachineLogln(" ; prop " + propertyIndex + " default read " + self.ReadWord(address))
    return self.ReadWord(address)
end function

// GetObjectData Get the base object's opaque value.
//
// The object value should be considered opaque, and the other object calls should be used to query.
// The returned object is a list of attribute flags array, parent object id, sibling object id,
// child object id, property pointer, object address, object index.
MachineState.GetObjectData = function(objectIndex)
    if objectIndex == null or objectIndex <= 0 then return null  // object 0 is the "no object".  Null.
    if objectIndex > 255 and self.FileVersion <= 3 then return null
    if objectIndex > 65535 then return null

    if self.FileVersion <= 3 then
        // 31 * word size byte header
        // Each entry is 9 bytes
        address = self.ObjectTableAddress + (31 * self.WordSize) + ((objectIndex - 1) * 9)
        // the 32 attribute flags     parent     sibling     child   properties
        // ---32 bits in 4 bytes---   ---3 bytes------------------  ---2 bytes--
        return [
            // flag bytes
            // Attribute 0 is bit 7 of byte 0.
            [self.ReadByte(address), self.ReadByte(address + 1), self.ReadByte(address + 2), self.ReadByte(address + 3)],
            // parent object id
            self.ReadByte(address + 4),
            // sibling object id
            self.ReadByte(address + 5),
            // child object id
            self.ReadByte(address + 6),
            // property pointer
            (self.ReadByte(address + 7) * 256) + self.ReadByte(address + 8),
            // object address
            address,
            // object index
            objectIndex,
        ]
    end if

    // 63 * word size byte header.
    // Each entry is 14 bytes.
    address = self.ObjectTableAddress + (63 * self.WordSize) + ((objectIndex - 1) * 14)
    // the 48 attribute flags     parent    sibling   child     properties
    // ---48 bits in 6 bytes---   ---3 words, i.e. 6 bytes----  ---2 bytes--
    return [
        // flag bytes
        // Attribute 0 is bit 7 of byte 0.
        [
            self.ReadByte(address), self.ReadByte(address + 1), self.ReadByte(address + 2),
            self.ReadByte(address + 3), self.ReadByte(address + 4), self.ReadByte(address + 5),
        ],
        // parent object id
        (self.ReadByte(address + 6) * 256) + self.ReadByte(address + 7),
        // sibling object id
        (self.ReadByte(address + 8) * 256) + self.ReadByte(address + 9),
        // child object id
        (self.ReadByte(address + 10) * 256) + self.ReadByte(address + 11),
        // property pointer
        (self.ReadByte(address + 12) * 256) + self.ReadByte(address + 13),
        // object address
        address,
        // object index
        objectIndex,
    ]
end function

// GetObjectId Get the ID for the object in the opaque value.
MachineState.GetObjectId = function(objectValues)
    if objectValues == null then return 0  // null object is index 0
    return objectValues[6]
end function

// GetObjectParent Get the parent object for the given opaque object, or null if it does not exist.
MachineState.GetObjectParent = function(objectValues)
    if objectValues == null then return null
    return self.GetObjectData(objectValues[1])
end function

// SetObjectParent Set the parent ID for the given opaque object.
MachineState.SetObjectParent = function(objectValues, parentIndex)
    if objectValues == null then return
    objectValues[1] = parentIndex
    address = objectValues[5]
    if self.FileVersion <= 3 then
        self.SetByte(address + 4, parentIndex)
    else
        self.SetWord(address + 6, parentIndex)
    end if
end function

// GetObjectSibling Get the sibling object for the given opaque object, or null if it does not exist.
MachineState.GetObjectSibling = function(objectValues, siblingId)
    if objectValues == null then return null
    return self.GetObjectData(objectValues[2])
end function

// SetObjectSibling Set the sibling ID for the given opaque object.
MachineState.SetObjectSibling = function(objectValues, siblingIndex)
    if objectValues == null then return
    objectValues[2] = siblingIndex
    address = objectValues[5]
    if self.FileVersion <= 3 then
        self.SetByte(address + 5, siblingIndex)
    else
        self.SetWord(address + 8, siblingIndex)
    end if
end function

// GetObjectChild Get the first child object for the given opaque object, or null if it does not exist.
MachineState.GetObjectChild = function(objectValues)
    if objectValues == null then return null
    return self.GetObjectData(objectValues[3])
end function

// SetObjectChild Set the first child ID for the given opaque object.
MachineState.SetObjectChild = function(objectValues, childId)
    if objectValues == null then return null
    objectValues[3] = childId
    address = objectValues[5]
    if self.FileVersion <= 3 then
        self.SetByte(address + 6, childId)
    else
        self.SetWord(address + 10, childId)
    end if
end function

_FLAG_BIT_MASK = [
    128, // flag 0 == 0x80
    64,  // flag 1 == 0x40
    32,  // flag 2 == 0x20
    16,  // flag 3 == 0x10
    8,   // flag 4 == 0x08
    4,   // flag 5 == 0x04
    2,   // flag 6 == 0x02
    1,   // flag 7 == 0x01
]

_FLAG_BIT_NOT_MASK = [
    127,  // flag 0 == 0x80
    191,  // flag 1 == 0x40
    223,  // flag 2 == 0x20
    239,  // flag 3 == 0x10
    247,  // flag 4 == 0x08
    251,  // flag 5 == 0x04
    253,  // flag 6 == 0x02
    254,  // flag 7 == 0x01
]

// IsObjectFlagSet Check if the flag (attribute) index, from the object values returned by GetObjectData, is set.
MachineState.IsObjectFlagSet = function(objectValues, flagIndex)
    if objectValues == null then return false
    byteIndex = floor(flagIndex / 8)
    bitIndex = flagIndex % 8
    if byteIndex < 0 or byteIndex >= objectValues[0].len then return false
    val = bitAnd(objectValues[0][byteIndex], _FLAG_BIT_MASK[bitIndex])
    return val != 0
end function

// SetObjectFlag Set the object's flag (attribute) index, from the object values returned by GetObjectData.
MachineState.SetObjectFlag = function(objectValues, flagIndex, enable)
    if objectValues == null then return
    byteIndex = floor(flagIndex / 8)
    bitIndex = flagIndex % 8
    if byteIndex < 0 or byteIndex >= objectValues[0].len then return
    bit = 0
    if enable then bit = _FLAG_BIT_MASK[bitIndex]
    val = bitAnd(objectValues[0][byteIndex], _FLAG_BIT_NOT_MASK[bitIndex]) + bit
    objectValues[0][byteIndex] = val
    address = objectValues[5] + byteIndex
    self.SetByte(address, val)
    return val != 0
end function

// GetObjectName Get the short name of the object for the given opaque values.
MachineState.GetObjectName = function(objectValues)
    if objectValues == null then return null
    propAddress = objectValues[4]
    // All versions start the table with the length byte, short name text.
    textLen = self.ReadByte(propAddress)
    if textLen <= 0 then return "NoName"
    // return self.ReadString(propAddress + 1, textLen * 2)
    return self.ReadString(propAddress + 1)
end function

// getFirstPropertyAddress Get the physical address for the first property of the opaque object.
//
// It's possible for the first property address to be the end-of-list marker.  The check if this
// is the end-of-property is by calling getNextObjectProperty and checking if that is null, or
// by calling isListEndPropertyAddress to see if that returns true.
MachineState.getFirstPropertyAddress = function(objectValues)
    if objectValues == null then return null
    // Property table address
    propAddress = objectValues[4]
    nameLen = self.ReadByte(propAddress)
    addr = propAddress + (nameLen * 2) + 1
    return addr
end function

// getPropertyAddressInfo Get the property information for the property at the address.
//
// If the property is the end-of-property list marker, returns null.
// Otherwise, returns [propertyNumber, dataSize, dataAddress, propertyAddress, nextPropertyAddress]
MachineState.getPropertyAddressInfo = function(propertyAddress)
    if propertyAddress == null then return null
    if self.FileVersion <= 3 then
        // Bits 7-5: length - 1
        // Bits 4-0: property number. 0 means end of list.
        val = self.ReadByte(propertyAddress)
        propNum = val % 32
        if propNum == 0 then return null  // EOL marker
        // + 1 because the length bits need +1
        propLen = (floor(val / 32) % 8) + 1
        // + 1 to go past the argument's property's header byte (already read).
        return [propNum, propLen, propertyAddress + 1, propertyAddress, propertyAddress + propLen + 1]
    end if

    // Property block starts with either 1 or 2 bytes containing the size + number.
    // If the first byte has the top bit (7) set, then:
    //    byte 0: bits 5-0: property number
    //            bits 7-6: 0b10
    //    byte 1: bits 5-0: property data length (in bytes); == 0 means length == 64.
    //            bit  6:   unused
    //            bit  7:   always 1
    // If the first byte has the top bit (7) unset, then:
    //    byte 0: bits 5-0: property number
    //            bit  6:   unset == data length of 1, set == data length 2.
    //            bit  7:   always 0
    val1 = self.ReadByte(propertyAddress)
    propNum = val1 % 64  // bits 5-0
    if propNum == 0 then return null
    dataAddress = propertyAddress + 1
    if val1 >= 128 then
        // 2 byte header.
        val2 = self.ReadByte(dataAddress)
        dataAddress = dataAddress + 1
        propLen = val2 % 64  // bits 5-0
        if propLen == 0 then propLen = 64
    else
        propLen = 1
        if bitAnd(val1, 64) != 0 then propLen = 2
    end if
    return [propNum, propLen, dataAddress, propertyAddress, dataAddress + propLen]
end function

// GetObjectProperty Get details of the object's property at the ID.
//
// Returns a map with [propNumber, dataSizeInBytes, dataAddress, and other stuff]
MachineState.GetObjectProperty = function(objectValues, propertyId)
    if objectValues == null then return null
    propAddress = self.getFirstPropertyAddress(objectValues)
    propInfo = self.getPropertyAddressInfo(propAddress)
    while propInfo != null and propInfo[0] != propertyId
        propInfo = self.getPropertyAddressInfo(propInfo[4])
    end while
    return propInfo
end function

// GetObjectPropertyWord Get the 16-bit unsigned data value for the object's property.
//
// propertyId must be given to ensure the default value is returned on the null scenario.
MachineState.GetObjectPropertyWord = function(objectValues, propertyId)
    propertyAddressInfo = self.GetObjectProperty(objectValues, propertyId)

    if propertyAddressInfo == null then self.log.Debug("Getting default property for " + propertyId)
    if propertyAddressInfo == null then return self.GetObjectPropertyDefault(propertyId)

    // If the property has length 1, the value is
    // only that byte. If it has length 2, the first two bytes of the property
    // are taken as a word value. It is illegal for the opcode to be used if the
    // property has length greater than 2, and the result is unspecified.
    self.log.Debug("Getting " + propertyAddressInfo[1] + " byte length value for property " + propertyId)
    MachineLogln(" ; prop " + propertyId + " @" + propertyAddressInfo[2] + ", " + propertyAddressInfo[1] + " bytes")
    if propertyAddressInfo[1] == 1 then return self.ReadByte(propertyAddressInfo[2])
    if propertyAddressInfo[1] == 2 then return self.ReadWord(propertyAddressInfo[2])
    // Invalid state.
    exit("Invalid property data size " + propertyAddressInfo[1] + "; required byte or word")
end function

// ====================================================================

// ParseDictionary Parse the dictionary at the given address.
//
// Normally, this is just done for the static dictionary,
// however, the tokenize opcode can use any table.
MachineState.ParseDictionary = function(physAddress)
    if self.cachedDictionaries.hasIndex(physAddress) then return self.cachedDictionaries[physAddress]
    dictAddress = physAddress
    // Get the header.
    inputCodeCount = self.ReadByte(physAddress)
    physAddress = physAddress + 1
    inputCodes = []
    for i in range(1, inputCodeCount)
        inputCodes.push(self.ReadByte(physAddress))
        physAddress = physAddress + 1
    end for
    entryLength = self.ReadByte(physAddress)
    physAddress = physAddress + 1
    entryCount = (self.ReadByte(physAddress) * 256) + self.ReadByte(physAddress + 1)
    physAddress = physAddress + 2

    // Read in the entries.
    // v1-3, 6 bytes are read per entry, and only the first 4 bytes of z-characters are used.
    // v4+, 6 bytes are read per entry, and all of them are used.
    // We extract out the data to make the parsing not have to go text to z-char.
    // Dictionaries are { entry name: [address, index] }
    if self.FileVersion <= 3 then
        // 4 bytes, 6 z-characters
        charCount = 6
    else
        // 6 bytes, 9 z-characters
        charCount = 9
    end if
    dict = {}

    for i in range(0, entryCount - 1)
        entry = self.ReadString(physAddress, charCount)
        // self.log.Debug("Parsed entry " + i + ": '" + entry + "'")
        dict[entry] = [physAddress, i]
        physAddress = physAddress + entryLength
    end for

    // Only cache static dictionaries.
    if dictAddress >= self.StaticMemoryBaseAddress then self.cachedDictionaries[dictAddress] = dict
    return dict
end function

// ====================================================================
// ZScii Memory functions

// ZsciiSplit Split a high and low byte into the three zscii characters.
//
// These are 5 bits each, with the top bit of the hi byte being ignored;
// if set, it marks the end of the string.
//
// --first byte-------   --second byte---
//  7   6 5 4 3 2  1 0   7 6 5  4 3 2 1 0
// bit  --first--  --second---  --third--    
ZsciiSplit = function(b1, b2)
    b = (b1 * 256) + b2
    return [
        floor(b / 1024) % 32,
        floor(b / 32) % 32,
        b % 32,
    ]
end function

// Zscii alphabet table
MachineState.zsciiAlphabetTableInit = function()
    rawZsciiAlphabetTables = [
        // 0   1   2   3   4   5    6    7    8    9   10   11   12   13   14   15   16   17   18   19   20   21   22   23   24   25   26   27   28   29   30   31
        // A0
        [" ", "", "", "", "", "", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"],
        // A1
        [" ", "", "", "", "", "", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"],
        // A2
        [" ", "", "", "", "", "", null, char(13), "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", ".", ",", "!", "?", "_", "#", char(8217), """", "/", "\", "-", ":", "(", ")"],
    ]

    if self.FileVersion == 1 then
        rawZsciiAlphabetTables[0][1] = char(13)
        rawZsciiAlphabetTables[1][1] = char(13)
        rawZsciiAlphabetTables[2] = [" ", char(13), "", "", "", "", null, "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", ".", ",", "!", "?", "_", "#", char(8217), """", "/", "\", "<", "-", ":", "(", ")"]
    end if
    self.zsciiAlphabetTables = []
    for raw in rawZsciiAlphabetTables
        alpha = []
        for x in raw
            if x == null then
                alpha.push(null)
            else if x.len <= 0 then
                alpha.push(0)
            else
                alpha.push(x.code)
            end if
        end for
        self.zsciiAlphabetTables.push(alpha)
    end for

    if self.AlphabetTableAddress != null then  // 0x34, 0x35
        // word at self.storyData[52] (0x34) references the alphabet table.
        // 78 bytes arranged as 3 blocks of 26 ZSCII values, characters 6-31.
        address = self.AlphabetTableAddress
        for alpha in range(0, 2)
            for idx in range(6, 31)
                self.zsciiAlphabetTables[alpha][idx] = self.storyData[address]
                address = address + 1
            end for
        end for
        // these are still hard-coded...
        self.zsciiAlphabetTables[2][6] = null
        self.zsciiAlphabetTables[2][7] = 13
    end if

    self.zsciiSpecialUnicode = {} + ZSCII_SPECIAL_UNICODE
    if self.UnicodeTranslationTableAddress != null then
        // Version 5 and later, if word 3 of the header extension table
        // is present and non-zero, then it is the byte address of the unicode
        // translation table.
        addr = self.UnicodeTranslationTableAddress
        count = self.storyData[addr]
        addr = addr + 1
        if addr + (count * 2) > self.storyData.len then exit("Bad unicode table size")
        idx = 155
        for p in range(1, count)
            self.zsciiSpecialUnicode[idx] = (self.storyData[addr] * 256) + self.storyData[addr + 1]
            idx = idx + 1
            addr = addr + 2
        end for
    end if
end function

// ReadString Read a physical address, up to the char count, of text.
MachineState.ReadString = function(physAddress, maxLen = null)
    return self.readStringLen(physAddress, maxLen)[0]
end function

// readStringLen Read a physical address, up to the char count, of text.  Returns the text + encoded length
MachineState.readStringLen = function(physAddress, maxLen = null)
    if self.cachedStrings.hasIndex(physAddress) then return self.cachedStrings[physAddress]
    stringAddress = physAddress

    // Start by loading the zscii bytes.
    // End-of-string marker is bit 7 == 1 of the first byte of the last pair.
    buffer = []
    retLen = 0
    // self.log.Debug("Reading @" + stringAddress)
    while maxLen == null or buffer.len < maxLen
        b1 = self.ReadByte(physAddress)
        physAddress = physAddress + 1
        b2 = self.ReadByte(physAddress)
        physAddress = physAddress + 1
        retLen = retLen + 2
        buffer = buffer + ZsciiSplit(b1, b2)
        // self.log.Trace(" " + buffer.len + ": " + b1 + "/" + b2 + " -> " + buffer[-3] + "/" + buffer[-2] + "/" + buffer[-1])
        if b1 > 127 then
            // top bit is set.
            break
        end if
    end while
    if maxLen != null then buffer = buffer[:maxLen]

    // 3 alphabets.  Treatment of rotating between these is done through
    //   characters in the stream.
    alphabet = 0
    charAlpha = alphabet
    retStr = ""
    escBuff = -1
    abbrevBuff = 0

    for ch in buffer
        // self.log.Debug("Handling " + ch)
        // loop...
        idx = 0

        // Abbreviation / Synonym check.
        if abbrevBuff >= 1 then
            // In the middle of an abbreviation lookup.
            // If z is the first Z-character (1, 2 or 3) and x the subsequent one, then
            // the interpreter must look up entry 32(z-1)+x in the abbreviations table
            // and print the string at that word address.
            // The abbreviations are cached at start time, so they can be just looked up.
            // self.log.Debug("Looked up abbreviation " + abbrevBuff + " index " + ch)
            abbrevIdx = ((abbrevBuff - 1) * 32) + ch
            if not self.cachedAbbreviations.hasIndex(abbrevIdx) then
                abbrevLookupAddress = self.AbbreviationsTableAddress + (abbrevIdx * 2)
                // Should this look in dynamic data?
                wordAddress = self.ReadWord(abbrevLookupAddress)
                physAddress = wordAddress * self.WordSize
                // self.log.Debug("Loading abbreviation " + abbrevIdx + " @ptr " + abbrevLookupAddress + " -> " + physAddress)
    
                self.cachedAbbreviations[abbrevIdx] = self.ReadString(physAddress)
                // self.log.Debug(" -> " + self.cachedAbbreviations[abbrevIdx])
            end if

            retStr = retStr + self.cachedAbbreviations[abbrevIdx]
            abbrevBuff = 0
            continue

        // ZSCII escape check.
        //   If the alphabet is A2, and character is 6, then the next 2 characters represent
        //   a 10-bit ZSCII character code.
        else if escBuff == -2 then
            // first character after escape marker is the top 5 bits.
            escBuff = ch * 32
            // self.log.Trace("Read zscii escape sequence hi bits")
            // Don't process this character yet...
            continue
        else if escBuff >= 0 then
            // second character is the bottom 5 bits.
            idx = escBuff + ch
            // self.log.Trace("Read zscii escape sequence lo bits")
            escBuff = -1
            // process this character by falling through.
        else if charAlpha == 2 and ch == 6 then
            // Entering the zscii escape sequence.
            // self.log.Trace("Turning to zscii escape sequence")
            escBuff = -2
            charAlpha = 0
            // don't process this character
            continue
        
        // normal character processing...
        // Due to the limited number of v1 and v2 files, it may be
        // worth while to remove v1 & v2 support.
        else if self.FileVersion <= 2 then
            if ch == 1 and self.FileVersion == 2 then
                // version 2 abbreviation.  Next character is the abbreviation lookup.
                abbrevBuff = 1
                // and change the alphabet back
                charAlpha = alphabet
                // Do not fall through; must immediately handle the next character
                continue

            else if ch == 2 then
                // Change for this next one character to another alphabet.
                charAlpha = (alphabet + 1) % 3
                // and continue
                continue
            else if ch == 3 then
                // Change for this next one character to another alphabet.
                charAlpha = (alphabet + 2) % 3
                // and don't fall through
                continue
            else if ch == 4 then
                // permanent change the alphabet
                alphabet = (alphabet + 1) % 3
                charAlpha = alphabet
                // and don't fall through
                continue
            else if ch == 5 then
                // permanent change the alphabet
                alphabet = (alphabet + 2) % 3
                charAlpha = alphabet
                // and don't fall through
                continue
            else
                // perform the lookup
                idx = self.zsciiAlphabetTables[charAlpha][ch]
                // self.log.Debug("Looked up " + ch + "/" + charAlpha + " -> " + idx)
                // Use the zscii character, not the unicode character.
                retStr = retStr + char(idx)

                // and change the alphabet back
                charAlpha = alphabet
            end if
        else
            if ch >= 1 and ch <= 3 then
                // Abbreviation lookup next character.
                // self.log.Trace("Turning to abbreviation replacement")
                abbrevBuff = ch
                // and change the alphabet back
                charAlpha = 0

                // Do not fall through; must immediately handle the next character
                continue
            else if ch == 4 then
                // Change for this next one character to A1
                // self.log.Trace("Turning to A1")
                charAlpha = 1
                // and don't fall through
                continue
            else if ch == 5 then
                // Change for this next one character to A2
                // self.log.Trace("Turning to A2")
                charAlpha = 2
                // and don't fall through
                continue
            else
                // perform the lookup
                idx = self.zsciiAlphabetTables[charAlpha][ch]
                // self.log.Trace(" -> " + idx)
                // Use the zscii character, not the unicode character.
                retStr = retStr + char(idx)

                // and change the alphabet back
                charAlpha = 0
            end if
        end if
        // Note: the returned string is in zscii, not unicode.
    end for
    ret = [retStr, retLen]
    // Only cache static strings.
    if stringAddress >= self.StaticMemoryBaseAddress then self.cachedStrings[stringAddress] = ret
    return ret
end function

// ====================================================================
// Instruction loading

// StartGame setup the initial state of the game to allow execution to begin.
MachineState.StartGame = function()
    // Reset game changable data.
    // For the header, only the flag 2 can be changed.
    self.headerData[16] = 0  // 0x10
    self.headerData[17] = 0  // 0x11
    if self.UsesColors then
        self.headerData[16] = 64
    end if
    self.headerExtensionData = {}
    self.callStack = []
    self.dynamicMemory = {}

    // Reset streams
    // Stream 1 == screen
    self.Stream1Active = true
    // Stream 2 == transcript
    self.Stream2Active = false
    // Stream 3 == dynamic memory table
    self.Stream3 = []
    // Stream 4 == user input
    self.Stream4Active = false

    // Reset the other objects
    self.native.Reset()
    self.screen.Reset()
    if self.StatusLineType == 0 then
        // Only set this when the first input is requested...
        // self.screen.IsInterpreterStatusLine = true
        self.screen.IsInterpreterScore = true
        self.screen.IsInterpreter24HourTime = false
    else if self.StatusLineType == 2 then
        self.screen.IsInterpreterStatusLine = true
        self.screen.IsInterpreterScore = false
        self.screen.IsInterpreter24HourTime = true
    end if

    // Set up the initial call stack.
    if self.FileVersion >= 6 then
        self.EnterRoutine(self.StartPC, [], -1)
    else
        // It's just a position, not considered a routine.
        self.callStack.push({
            "stack": [],
            "pc": self.StartPC,
            "locals": [],
            "returnsRef": -1,
        })
    end if
end function

// GetStackFrame Get the current stack frame (the index)
//
// Used by the "catch" opcode.
MachineState.GetStackFrame = function()
    return self.callStack.len - 1
end function

// JumpToStackFrame Long jump to a previous (or possibly current) call.
MachineState.JumpToStackFrame = function(stackFrame)
    if stackFrame < 0 or stackFrame >= self.callStack then exit("Invalid stack frame: " + stackFrame)
    // stackFrame is the position of the stack.  So, if we want to get to
    // stack position 2, then the length is 3.  Rather than creating a new object
    // with 'stack = stack[:stackFrame]', we just pop the stack.
    while self.callStack.len > stackFrame
        self.callStack.pop()
    end while
end function

// PopStackFrame Exit the current stack frame.
//
// Can never have fewer than 1 active stack frame.
MachineState.PopStackFrame = function(returnValue)
    if self.callStack.len > 1 then
        prev = self.callStack.pop()
        // Now, store the return value to the value.
        // If the returns reference is < 0, then nothing is stored.
        if prev.returnsRef >= 0 then self.SetVariableRef(prev.returnsRef, returnValue)
    end if
end function

// EnterRoutine Enter a new routine by adding to the call stack.
//
// When the call completes, it stores the return value to the given return variable reference.
//
// Routines are never in dynamic memory.
MachineState.EnterRoutine = function(routine, arguments, returnsRef)
    if routine == 0 then exit("Illegal state: routine 0 must be handled by caller.")
    if self.FileVersion <= 3 and arguments.len > 3 then exit("Invalid argument count: " + arguments.len)
    if self.FileVersion >= 4 and arguments.len > 7 then exit("Invalid argument count: " + arguments.len)

    // Routine Packed Address Lookup
    address = (routine * self.packedAddressMult) + self.routineOffset
    if address < 0 or address > self.storyData.len then exit("Invalid routine address " + routine + " -> " + address)
    if address < self.StaticMemoryBaseAddress then exit("Tried calling routine in static memory area: " + address)

    variableCount = self.storyData[address]
    self.log.Trace("Call routine " + routine + " @" + address + ", " + variableCount + " local variables")
    MachineLog("[routine " + routine + " @" + address + ", frame " + self.callStack.len + ", " + variableCount + " locals")
    address = address + 1
    // Initialize local variables
    callLocals = []
    // Seems like this happens.  Could be a bad opcode reader, though.
    // if variableCount < arguments.len then exit("Too few local variables (" + variableCount + ") for argument count (" + arguments.len + ")")
    if variableCount > 0 then
        for i in range(1, variableCount)
            // Versions 5+, initial value for local variable is 0
            val = 0
            if self.FileVersion <= 4 then
                // initial values in versions 1-4 is the 2-byte words after the count.
                val = (self.storyData[address] * 256) + self.storyData[address + 1]
                address = address + 2
            end if
            // self.log.Trace(" - Default local value " + i + " = " + val)
            callLocals.push(val)
        end for
    end if

    // The arguments are written into the local variables (argument 1 into local 1 and so on).
    // It is legal for there to be more arguments than local variables (any spare arguments
    // are thrown away) or for there to be fewer.
    argCount = arguments.len
    if arguments.len > variableCount then argCount = variableCount
    if argCount > 0 then
        for i in range(0, argCount - 1)
            callLocals[i] = arguments[i]
            // self.log.Trace(" - Setting local variable " + i + " to argument value " + arguments[i])
        end for
    end if

    // self.log.Trace(" - Adding to call stack @" + address)
    self.callStack.push({
        "stack": [],
        "pc": address,
        "locals": callLocals,
        "returnsRef": returnsRef,
    })
    self.log.Trace(" :: frame " + (self.callStack.len - 1) + ", locals " + self.callStack[-1].locals)
    MachineLogln(" == " + self.callStack[-1].locals + "]")
end function

// JumpToAddress Move the current stack frame's instruction pointer to the given address.
MachineState.JumpToAddress = function(physAddress)
    self.callStack[-1].pc = physAddress
end function

// JumpByOffset Move the current stack frame's instruction pointer by the number of bytes.
// Can be negative.
MachineState.JumpByOffset = function(byteOffset)
    top = self.callStack[-1]
    top.pc = top.pc + byteOffset
end function

// PerformBranch Perform the correct branching logic, based on the opcode branch value.
//
// Branching is always conditional.  The branch argument contains within it a
// branch on success/failure flag that must be used.
MachineState.PerformBranch = function(branch, condition)
    if branch == null then exit("Invalid opcode: requires branch")
    if (condition != 0 and branch.b == true) or (condition == 0 and branch.b == false) then
        // self.log.Trace("Branching on " + branch.t)
        if branch.t == "a" then
            // Jump to an address
            MachineLogln(" ; branch base offset ? ; jump to " + branch.a)
            self.JumpToAddress(branch.a)
            return
        end if
        MachineLogln(" ; branch returning " + branch.r + " ; jumping")
        // t == r, so return.
        self.PopStackFrame(branch.r)
    else
        MachineLogln(" ; branch base offset ? ; no jump")
        // self.log.Trace("No branching - condition failed.")
    end if
end function

// Signed16 Return the 16-bit value as a signed value
MachineState.Signed16 = function(value)
    if value >= 32768 then return value - 65536
    return value
end function

// Unsign16 Return the 16-bit signed value as an unsigned value
// This performs proper overflow checking.
MachineState.Unsign16 = function(value)
    if value < 0 then return 65536 + value
    if value < 0 then value = 0  // This one isn't 100% right
    value = value % 65536
    return value
end function

// NextInstruction Get the next instruction in the current stack frame.
//
// Does not advance the current instruction pointer.
MachineState.NextInstruction = function()
    if self.callStack.len <= 0 then exit("No call stack frame")
    return self.instructionAt(self.callStack[-1].pc, STD_OPCODE_TABLE, EXT_OPCODE_TABLE)
end function

// AdvanceToInstructionAfterString Gets the string at the current PC, returns it, and advances the PC after the string.
// Very special instruction for supporting some operands.
MachineState.AdvanceToInstructionAfterString = function()
    stack = self.callStack[-1]
    strLen = self.readStringLen(stack.pc)
    stack.pc = stack.pc + strLen[1]
    return strLen[0]
end function

// getInstructionAt Read the instruction at the given address.
//
// Returns [opcodeName, operandsList, nextInstructionAddress, storedValue (maybe null), branchValue (maybe null)]
// If the opcode isn't found, then opcodeName is null.  If the opcode is invalid, null is returned.
// The operand is either:
//     {"c": constantNumber, "t": "c", "s": (1 or 2; the number of bytes for the value)}
// or
//     {"v": variable reference, "t": "v", "c": value, "s": 2}.
// If a branch value is returned, then it is either {"r": return value, "t": "r"} or {"a": jump address, "t": "a"},
// and it will also include the "b" value to mean branch-on (value - either true or false).
//
// The opcode lists are the opcodes_list contents.  This is an array of per-version information, each item
// containing [introduced version number, mnemonic, operands type id, stores value?, branches?]
MachineState.instructionAt = function(physAddress, opcodeList, extendedOpcodeList)
    // Note: instructions should be only in static memory.
    // This gives us a touch of performance boost.
    if physAddress < self.StaticMemoryBaseAddress then exit("Tried to run instruction in dynamic memory " + physAddress)
    MachineLog(str(physAddress) + " ")
    // For debugging...
    instructionAddress = physAddress

    // self.log.Debug("Loading instruction at " + physAddress)
    val1 = self.storyData[physAddress]
    // self.log.Trace("  - opcode " + val1)
    physAddress = physAddress + 1
    ops = opcodeList
    if self.FileVersion >= 5 and val1 == 190 then
        // extended opcodes.
        ops = extendedOpcodeList
        val1 = self.storyData[physAddress]
        // self.log.Trace("  - extended opcode " + val1)
        physAddress = physAddress + 1
    end if
    if val1 < 0 or val1 >= ops.len then
        self.log.Warn("Discovered unknown opcode " + val1 + " @" + instructionAddress)
        return null
    end if
    opTypeVersionList = ops[val1]

    // Find the version compatible opcode
    // These are sorted by version introduced, so that you loop through them until
    // the story version is >= the opcode version.
    opCodeInfo = null
    for oci in opTypeVersionList
        if self.FileVersion >= oci[0] then
            opCodeInfo = oci
            break
        end if
    end for
    if opCodeInfo == null then
        self.log.Warn("Discovered incompatible opcode " + val1 + " @" + instructionAddress)
        return null
    end if

    opcodeMnemonic = opCodeInfo[1]
    // self.log.Trace(opcodeMnemonic)

    // Load operands.
    // Operand type code is a list of each operand type,
    // possibly with variable number of operand descriptions.
    operandTypeCodeList = opCodeInfo[2]
    // If it's variable number, then handle those specially.
    if operandTypeCodeList.len == 1 and operandTypeCodeList[0] >= 3 then
        // In variable or extended forms, a byte of 4 operand types is given next.
        // This contains 4 2-bit fields: bits 6 and 7 are the first field, bits 0 and 1
        // the fourth. The values are operand types as above. Once one type has been given as
        // 'omitted' all subsequent ones must be. Example: $$00101111 means large constant
        // followed by variable (and no third or fourth opcode).
        operandTypeIds = [self.storyData[physAddress]]
        physAddress = physAddress + 1
        // self.log.Trace("  - Variable operands: " + operandTypeIds[0])

        if operandTypeCodeList[0] == 4 then
            // In the special case of the “double variable” VAR opcodes call_vs2 and call_vn2
            // (opcode numbers 12 and 26), a second byte of types is given, containing the types
            // for the next four operands.
            operandTypeIds.push(self.storyData[physAddress])
            // self.log.Trace("  - Variable operands: " + operandTypeIds[1])
            physAddress = physAddress + 1
        end if

        // Set it to a fresh list based on what's in the opcode description.
        operandTypeCodeList = []
        for typeId in operandTypeIds
            idx = 64
            while idx >= 1
                // This will set the type code to 3 on omitted, which is fine.
                operandTypeCodeList.push(floor(typeId / idx) % 4)
                // self.log.Trace("  - " + idx + ": " + operandTypeCodeList.len + ": " + operandTypeCodeList[-1])
                idx = floor(idx / 4)
            end while 
        end for
    end if

    operands = []
    for operandTypeCode in operandTypeCodeList
        if operandTypeCode == 0 then
            // Large constant; 2 byte operand.
            operands.push({"t": "c", "s": 2, "c": (self.storyData[physAddress] * 256) + self.storyData[physAddress + 1]})
            physAddress = physAddress + 2
            // self.log.Trace("  - operand long constant " + operands[-1].c)
            continue
        end if
        if operandTypeCode == 1 then
            // Small constant; 1 byte operand.
            operands.push({"t": "c", "s": 1, "c": self.storyData[physAddress]})
            physAddress = physAddress + 1
            // self.log.Trace("  - operand constant " + operands[-1].c)
            continue
        end if
        if operandTypeCode == 2 then
            // Variable reference; 1 byte operand.
            opVal = self.storyData[physAddress]
            MachineLog(" [@" + physAddress + " var " + opVal + "] ")
            operands.push({"t": "v", "s": 2, "v": opVal, "c": self.GetVariableRef(opVal)})

            // self.log.Trace("  - operand variable @" + physAddress + " reference " + operands[-1].v + " == " + operands[-1].c)
            physAddress = physAddress + 1
            // continue
        end if
        // If 3, then it's from an omitted variable count.
    end for

    storesVariable = null
    if opCodeInfo[3] then
        // Stores a value.  Next byte is the variable reference.
        storesVariable = self.storyData[physAddress]
        // self.log.Trace("  - stores to variable reference " + storesVariable)
        physAddress = physAddress + 1
    end if

    branch = null
    if opCodeInfo[4] then
        // Stores a branch location.
        // Instructions which test a condition are called "branch" instructions.
        // The branch information is stored in one or two bytes, indicating what to do with the result
        // of the test.
        branch = {}
        val1 = self.storyData[physAddress]
        physAddress = physAddress + 1
        
        if val1 >= 128 then
            // bit 7 set.  Branch is on true.
            branch.b = true
            val1 = val1 % 128  // clear bit 7 for easier testing of bit 6.
            // self.log.Trace("  - branches on true")
        else
            // bit 7 not set.  A branch occurs when the condition was false
            branch.b = false
            // self.log.Trace("  - branches on false")
        end if

        if val1 >= 64 then
            // If bit 6 is set, then the branch occupies 1 byte only, and the
            // "offset" is in the range 0 to 63, given in the bottom 6 bits.
            offset = val1 % 64  // get bottom 6 bits
            // self.log.Trace("  - branch base offset = " + offset)
        else
            // If bit 6 is clear, then the offset is a signed 14-bit number given in bits 0 to 5 of the
            // first byte followed by all 8 of the second.
            val2 = self.storyData[physAddress]
            physAddress = physAddress + 1

            // To get the offset, we'll first compute it as though it's a positive 14-bit
            // number, then, if negative, handle that.
            offset = ((val1 % 64) * 256) + val2
            // self.log.Trace("  - branch base offset = " + offset)
            
            if offset >= 8192 then  // 0x2000
                // Now make it negative.  This is done with a 2's complement.
                offset = offset - 16384  // 0x4000
                // self.log.Trace("  - ... negated to " + offset)
            end if
        end if

        // An offset of 0 means "return false from the current routine", and 1 means "return true
        // from the current routine".
        if offset == 0 or offset == 1 then
            // false == 0, true == 1
            branch.r = offset
            branch.t = "r"
            // self.log.Trace("  - branch returns " + offset)
        else
            // Otherwise, a branch moves execution to the instruction at address
            // Address after branch data + Offset - 2.
            branch.a = physAddress + offset - 2
            branch.t = "a"
            // self.log.Trace("  - branch jumps to " + branch.a)
        end if
    end if

    if opcodeMnemonic == "call_v1" then
        DEBUG_MNEMONIC = "z_call_vs"
    else
        DEBUG_MNEMONIC = "z_" + opcodeMnemonic[:-3]
    end if
    MachineLog(DEBUG_MNEMONIC + " [")
    DEBUG_PRE = ""
    for DEBUG_OPER in operands
        MachineLog(DEBUG_PRE + DEBUG_OPER.c)
        DEBUG_PRE = ", "
    end for
    MachineLogln("]")

    self.log.Verbose(str(instructionAddress) + " " + opcodeMnemonic + " " + operands + " " + storesVariable + " " + branch)
    // [opcodeName, operandsList, nextInstructionAddress, storedValue (maybe null), branchValue (maybe null)]
    return [opcodeMnemonic, operands, physAddress, storesVariable, branch]
end function
