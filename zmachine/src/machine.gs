
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
MachineState.New = function(storyData, screen)
    if storyData.len < 64 then exit("data must be at least 64 bytes long")

    ret = new MachineState
    ret.screen = screen
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
    
    // StartPCAddress Initial value of program counter (byte address)
    //    Version 6+: Packed address of initial “main” routine
    ret.StartPCAddress = (storyData[6] * 256) + storyData[7]
    if version >= 6 then
        // Stored as a packed routine address
        ret.StartPCAddress = (ret.StartPCAddress * ret.packedAddressMult) + ret.routineOffset
    end if

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
    ret.UpdateScreen(screen)


    // Stream handling.

    // Stream 1 == screen
    ret.Stream1Active = true

    // Stream 2 == transcript
    // Because it's designed for a printer, some games can activate it
    // rapidly.  So the filename should be kept after set the first time.
    // It should also support buffering text (e.g. word wrapping), but we don't.
    ret.Stream2Active = false
    ret.Stream2Filename = null
    ret.Stream2File = null

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

    // Stream 4 is just user input
    ret.Stream4 = null

    // strings by memory address
    ret.cachedStrings = {}

    // parsed dictionary tables by memory address
    // Each value is map of { entry name: [address, index] }
    ret.cachedDictionaries = {}

    // Initialize the table, based on the current version information.
    ret.log.Debug("Initializing the zscii alphabet table")
    ret.zsciiAlphabetTableInit()

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

// Dump Dump the memory of the data to a string, for debugging purposes.
MachineState.DumpStr = function()
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

    if self.StatusLineType == null then
        interpreterFlags = "(explicit display)"
    else if self.StatusLineType == 0 then
        interpreterFlags = "Display score/moves"
    else if self.StatusLineType == 2 then
        interpreterFlags = "Display hours:minutes"
    end if
    // StatusLineType The status line display done by the interpreter
    //   == null - defined by story file
    //   == 0 - score/turns
    //   == 2 - hors:mins

    ret = [
        "    **** Story file header ****",
        "Z-code version:           " + self.FileVersion,
        "Interpreter flags:        " + interpreterFlags,
        "Release number:           " + self.ReleaseNumber,
        "Size of resident memory:  " + toHex(self.HighMemoryMark),
        "Start PC:                 " + toHex(self.StartPCAddress),
        "Routine Offset (v6+)      " + toHex(self.routineOffset, 8),
        "String Offset (v6+)       " + toHex(self.stringOffset, 8),
        "Dictionary address:       " + toHex(self.DictionaryAddress),
        "Object table address:     " + toHex(self.ObjectTableAddress),
        "Global variables address: " + toHex(self.GlobalVariablesTableAddress),
        "Static memory address:    " + toHex(self.StaticMemoryBaseAddress),
        //"Size of dynamic memory:   " + toHex(self.StaticMemoryBaseAddress), ??
        "Game flags:               ()",
        "Serial number:            " + self.SerialNumber,
        "Abbreviations address:    " + toHex(self.AbbreviationsTableAddress),
        "File size:                " + toHex(self.FileLen, 8),
        "Checksum:                 " + toHex(self.Checksum),
        "Alphabet table address:   " + toHex(self.AlphabetTableAddress),
        "Terminating table address:" + toHex(self.TerminatingCharactersTableAddress),
        "",
        "    **** Story file default dictionary ****",
        "",
    ]
    self.log.Debug("Generating the dictionary at " + toHex(self.DictionaryAddress))
    dict = self.ParseDictionary(self.DictionaryAddress)
    for index in dict.indexes
        item = dict[index]
        ret.push("  " + item[1] + " (" + toHex(item[0]) + ")  '" + index + "'")
    end for
    return ret
end function

// UpdateScreen Update the machine state to reflect changes to the output screen.
MachineState.UpdateScreen = function(screen)
    self.log.Debug("Updating the header screen values")

    if screen == null then screen = self.screen
    self.screen = screen

    // Screen height (lines): 255 means “infinite”
    self.headerData[32] = screen.Height  // 0x20

    // Screen width (characters)
    self.headerData[33] = screen.Width // 0x21

    // Unit sizes: since we don't use graphics, use unit size of 1 to make it easy on us.
    // And it's completely valid.

    // Screen width in units (word)
    self.headerData[34] = 0  // 0x22
    self.headerData[35] = screen.Width  // 0x23

    // Screen height in units (word)
    self.headerData[36] = 0  // 0x24
    self.headerData[37] = screen.Height  // 0x25

    // Font width in units (defined as width of a 0)
    //   v6, this is font height in units
    self.headerData[38] = 1  // 0x26

    // Font height in units
    //   v6, this is Font width in units (defined as width of a 0)
    self.headerData[39] = 1  // 0x27

    // Default background colour
    self.DefaultBackgroundColor = 2
    self.headerData[44] = screen.DefaultBackgroundColor  // 0x2c

    // Default foreground colour
    self.DefaultForegroundColor = 4
    self.headerData[45] = screen.DefaultForegroundColor  // 0x2d

    // Extension header word 5: true default foreground color
    // Extension header word 6: true default background color
    if self.ExtensionHeaderAddr != null and self.ExtensionHeaderWordCount >= 6 then
        self.headerExtensionData[10] = floor(screen.DefaultForegroundColor15 / 256) % 256
        self.headerExtensionData[11] = screen.DefaultForegroundColor15 % 256
        self.headerExtensionData[12] = floor(screen.DefaultBackgroundColor15 / 256) % 256
        self.headerExtensionData[13] = screen.DefaultBackgroundColor15 % 256
    end if
end function

// GetGlobalVariable Get the global variable as the opcode references it (number between 0x10 and 0xff)
MachineState.GetGlobalVariable = function(variable)
    if variable < 16 or variable > 255 then exit("Invalid variable reference " + variable)

    address = self.GlobalVariablesTableAddress + (variable * 2)
    hi = self.storyData[address]
    if self.dynamicMemory.hasIndex(address) then
        hi = self.dynamicMemory[address]
    end if
    address = address + 1
    lo = self.storyData[address]
    if self.dynamicMemory.hasIndex(address) then
        lo = self.dynamicMemory[address]
    end if
    return (hi * 256) + lo
end function

// SetGlobalVariable Set the global variable as the opcode references it (number between 0x10 and 0xff)
MachineState.SetGlobalVariable = function(variable, value)
    if variable < 16 or variable > 255 then exit("Invalid variable reference " + variable)
    if value < 0 or value > 65535 then exit("Invalid variable value " + value)
    // Set the changed value store.
    address = self.GlobalVariablesTableAddress + (variable * 2)
    self.dynamicMemory[address] = floor(variable / 256) % 256  // modulo should be not necessary.
    self.dynamicMemory[address + 1] = variable % 256
end function

// GetStackFrame Get the current stack frame
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
MachineState.PopStackFrame = function()
    if self.callStack.len > 1 then
        self.callStack.pop()
    end if
end function

// EnterRoutine Enter a new routine by adding to the call stack.
//
// Routines are never in dynamic memory.
MachineState.EnterRoutine = function(routine, arguments)
    if routine == 0 then exit("Illegal state: routine 0 must be handled by caller.")
    if self.FileVersion <= 3 and arguments.len > 3 then exit("Invalid argument count: " + arguments.len)
    if self.FileVersion >= 4 and arguments.len > 7 then exit("Invalid argument count: " + arguments.len)

    // Routine Packed Address Lookup
    address = (routine * self.packedAddressMult) + self.routineOffset
    if address < 0 or address > self.FileLen then exit("Invalid routine address " + routine + " -> " + address)
    if address < self.StaticMemoryBaseAddress then exit("Tried calling routine in static memory area: " + address)

    variableCount = self.storyData[address]
    address = address + 1
    // Initialize local variables
    locals = []
    if variableCount < arguments.len then exit("Too few local variables (" + variableCount + ") for argument count (" + arguments.len + ")")
    for i in range(1, variableCount)
        // Versions 5+, initial value for local variable is 0
        val = 0
        if self.FileVersion <= 4 then
            // initial values in versions 1-4 is the 2-byte words after the count.
            val = (self.storyData[address] * 256) + self.storyData[address]
            address = address + 2
        end if
        locals.push(val)
    end for

    // The arguments are written into the local variables (argument 1 into local 1 and so on).
    // It is legal for there to be more arguments than local variables (any spare arguments
    // are thrown away) or for there to be fewer.
    argCount = arguments.len
    if arguments.len > variableCount then argCount = variableCount
    for i in range(0, argCount - 1)
        locals[i] = arguments[i]
    end for

    self.callStack.push({
        "stack": [],
        "pc": address,
        "locals": locals,
    })
end function

// FromByteAddress Convert a byte address to a physical address
MachineState.FromByteAddress = function(address)
    if address > self.MaxStaticMemoryPos then return null
    return address
end function

// FromWordAddress Convert a word address to a physical address.
MachineState.FromWordAddress = function(address)
    physAddress = address * 2
    // Can access up to 128k
    if physAddress > 131071 or physAddress + 1 >= self.storyData.len then return null
    return physAddress
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
    if physAddress < 0 or physAddress > self.FileLen then exit("Invalid variable address " + physAddress)
    
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

// Set Game accessible memory write
MachineState.SetByte = function(physAddress, value)
    // It is illegal for a game to attempt to write to static memory.
    if physAddress < 0 or physAddress >= self.StaticMemoryBaseAddress then exit("Illegal address: " + physAddress)
    if value < 0 or value > 255 then exit("Illegal value: " + value)

    // flags 2 bits 7-0
    if physAddress == 16 then  // 0x10
        // Bit 0: set to 1 when transcripting is turned on.
        //    The game + interpreter can set this whenever.
        if value % 2 == 1 then
            // Turn on file transcript.
            // Because it's designed for a printer, some games can activate it
            // rapidly.  So the filename should be kept after set the first time.
            if self.Stream2Filename == null then
                print("NOTE: currently, transcript file writing is not implemented")
                filename = user_input("Transcript file name> ")
                self.Stream2Active = true
                // ret.Stream2Filename = null
                // ret.Stream2File = null
            end if
        else
            // Turn off stream 2, but don't change the filename.
            self.Stream2Active = false
        end if

        // If bit 1 is set, then the game is forcing fixed-pitch font.
        // However, this interpreter only prints in fixed-pitch font.
        // In version 6, if bit 2 is cleared, then that means the game has
        // redrawn the screen.

        // Ignore changing the other bits.

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
        // Not currently supported.
        // self.Stream4 = null
    else if streamNumber != 0 then
        // enable stream 0 is ignored.
        exit("Invalid stream number " + streamNumber)
    end if
end function

MachineState.Print = function()
    // Output stream 3 is unusual in that, while it is selected, no text is sent to any other
    // output streams which are selected. (However, they remain selected.)
    // Writing a newline to stream 3 is turned into ZSCII 13.
end function

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
        self.log.Debug("Parsed entry " + i + ": '" + entry + "'")
        dict[entry] = [physAddress, i]
        physAddress = physAddress + entryLength
    end for

    self.cachedDictionaries[dictAddress] = dict
    return dict
end function

// ====================================================================
// ZScii Memory functions

// ZsciiSplit Split a high and low byte into the three zscii characters.
//
// These are 5 bits each, with the top bit of the hi byte being ignored.
ZsciiSplit = function(b1, b2)
    return [
        floor(b1 / 4) % 32,
        floor(b2 / 32) % 7 + (b1 % 4),
        b2 % 32,
    ]
end function

// Turn the key into a zscii character
ToZscii = function(key)
    if ZsciiKeyTranslate.hasIndex(key) then return ZsciiKeyTranslate[key]
    if key == "" then return 13 // newline
    if key.len != 1 then return 0 // undefined

    // else assume a unicode -> zscii translation
    // FIXME this isn't right.  It should use the zsciiSpecialUnicode table.
    return key.lower().code
end function
ZsciiKeyTranslate = {
    "Delete": 8,
    "Backspace": 8,
    "Tab": 9,
    "Escape": 27,
    "UpArrow": 129,
    "DownArrow": 130,
    "LeftArrow": 131,
    "RightArrow": 132,
    "F1": 133,
    "F2": 134,
    "F3": 135,
    "F4": 136,
    "F5": 137,
    "F6": 138,
    "F7": 139,
    "F8": 140,
    "F9": 141,
    "F10": 142,
    "F11": 143,
    "F12": 144,
    // Keypad 0-9 are 145-154, but keypad isn't used in Grey Hack.
    // Menu click -> 252 (V6)
    // Double click -> 253 (V6)
    // Single click -> 254
}

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
MachineState.ReadString = function(physAddress, charCount)
    if self.cachedStrings.hasIndex(physAddress) then return self.cachedStrings[physAddress]
    stringAddress = physAddress

    // Start by loading the zscii bytes.
    buffer = []
    wordCount = ceil(charCount * 2 / 3)
    self.log.Debug("Reading " + wordCount + " words for string at " + stringAddress)
    for idx in range(1, wordCount)
        b1 = self.ReadByte(physAddress)
        self.log.Trace(" " + b1)
        physAddress = physAddress + 1
        b2 = self.ReadByte(physAddress)
        self.log.Trace(" " + b2)
        physAddress = physAddress + 1
        buffer = buffer + ZsciiSplit(b1, b2)
        self.log.Trace(" " + b1 + "/" + b2 + " -> " + buffer[-3] + "/" + buffer[-2] + "/" + buffer[-1])
    end for
    buffer = buffer[:charCount]

    // 3 alphabets.  Treatment of rotating between these is done through
    //   characters in the stream.
    alphabet = 0
    charAlpha = alphabet
    ret = ""

    for ch in buffer
        // loop...
        idx = 0
        if self.FileVersion <= 2 then
            if ch == 2 then
                // change just this one...
                charAlpha = (alphabet + 1) % 3
            else if ch == 3 then
                charAlpha = (alphabet + 2) % 3
            else if ch == 4 then
                // permanent change
                alphabet = (alphabet + 1) % 3
                charAlpha = alphabet
            else if ch == 5 then
                alphabet = (alphabet + 2) % 3
                charAlpha = alphabet
            else
                // perform the lookup
                idx = self.zsciiAlphabetTables[charAlpha][ch]
                self.log.Debug("Looked up " + ch + "/" + charAlpha + " -> " + idx)

                // and change the alphabet
                charAlpha = alphabet
            end if
        else
            if ch == 4 then
                charAlpha = 1
            else if ch == 5 then
                charAlpha = 2
            else
                // perform the lookup
                idx = self.zsciiAlphabetTables[charAlpha][ch]

                // and change the alphabet
                charAlpha = 0
            end if
        end if
        if self.zsciiSpecialUnicode.hasIndex(idx) then
            self.log.Debug("  zscii " + idx + " -> " + self.zsciiSpecialUnicode[idx])
            ret = ret + self.zsciiSpecialUnicode[idx]
        else
            // assume 1-to-1 unicode translation.
            self.log.Debug("  zscii " + idx + " -> " + char(idx))
            ret = ret + char(idx)
        end if
    end for
    self.cachedStrings[stringAddress] = ret
    return ret
end function

// ====================================================================
// Instruction loading

MachineState.InstructionAt = function(physAddress)
    // Read the opcode
    opcode = self.storyData[physAddress]
    physAddress = physAddress + 1
    // operand value type 0 == constant
    // operand value type 1 == top of the stack (value is meaningless)
    // operand value type 2 == local variable
    // operand value type 3 == global variable
    operands = [] // list of [type, value]
    operandCount = -1
    allOperandTypes = 65535

    if opcode == 190 and self.FileVersion >= 5 then // 0xbe
        // extended opcode
        operandCount = 4 // VAR; set to the maximum allowed
        opcodeNumber = self.storyData[physAddress]
        physAddress = physAddress + 1
        allOperandTypes = self.storyData[physAddress]
        physAddress = physAddress + 1
    end if

    form = floor(opcode / 64) % 4 // bits 7 & 6
    if form == 3 then // 0b11
        // variable
        allOperandTypes = self.storyData[physAddress]
        physAddress = physAddress + 1

        if floor(opcode / 32) % 2 == 0 then // bit 5
            operandCount = 2
        else
            operandCount = 4 // VAR; set to the maximum allowed
        end if
        opcodeNumber = opcode % 32 // bits 4-0
    else if form == 2 then // 0b10
        // short
        operand1Type = floor(opcode / 16) % 4 // bits 5-4
        // operand count can be 0 if the type == 0b11,
        // but in that situation, it won't be hit in the extraction phase.
        operandCount = 1
        allOperandTypes = 252 + operand1Type // mark all upper bits as 1 to omit them
        opcodeNumber = opcode % 16 // bits 3-0
    else
        // long
        operandCount = 2
        allOperandTypes = 240 // mark upper 4 bits as 1 to omit them

        operand1Type = floor(opcode / 64) % 2 // bit 6
        if operand1Type == 0 then
            // == 0 -> small constant
            allOperandTypes = allOperandTypes + 4 // 0b01, bits 3-2
        else if operand1Type == 1 then
            // == 1 -> variable
            allOperandTypes = allOperandTypes + 8 // 0b10, bits 3-2
        end if
        operand2Type = floor(opcode / 32) % 2 // bit 5
        if operand2Type == 0 then
            // == 0 -> small constant
            allOperandTypes = allOperandTypes + 1 // 0b01, bits 1-0
        else if operand2Type == 1 then
            // == 1 -> variable
            allOperandTypes = allOperandTypes + 2 // 0b10, bits 1-0
        end if

        opcodeNumber = opcode % 32 // bits 4-0
    end if
    // Read the operands

    // The operand type is encoded in the 4 two-bit pairs,
    // operand 1, bits 7-6
    // operand 2, bits 5-4
    // operand 3, bits 3-2
    // operand 4, bits 1-0
    // type 0: small constant
    // type 1: variable
    // type 2: large constant
    // type 3: omitted (no operand)

    bitPair = 64
    for loop in range(1, 4)
        opType = (allOperandTypes / bitPair) % 4
        if opType == 0 then
            // large constant, 0-65535
            operands.push([0, (self.storyData[physAddress] * 256) + self.storyData[physAddress + 1]])
            physAddress = physAddress + 2
            operandCount = operandCount - 1
        else if opType == 1 then
            // small constant
            // 1 byte, 0 - 255
            operands.push([0, self.storyData[physAddress]])
            physAddress = physAddress + 1
            operandCount = operandCount - 1
        else if opType == 2 then
            // variable

    // operand value type 1 == top of the stack (value is meaningless)
    // operand value type 2 == local variable
    // operand value type 3 == global variable

            variable = self.storyData[physAddress]
            physAddress = physAddress + 1
            if variable == 0 then
                // top of the stack
                operands.push([1, 0])
            else if variable < 16 then // 0x01 - 0x0f
                // local variable
                operands.push([2, variable - 1])
            else // 0x10 - 0xff
                // global variable
                operands.push([3, variable - 16])
            end if

        // else if opType == 3 then
        // no operand
        end if

        if operandCount <= 0 then break
        bitPair = floor(bitPair / 4)
    end for

    // "call_vs2" and "call_vn2" can have > 4 operands, <= 8...
    // "store" instructions (e.g. mul) include a following operand
    //   which is the variable number to store the value.

end function