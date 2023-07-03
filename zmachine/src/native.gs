// Native interactions.

Native = {}

Native.New = function(width, height)
    if height < 0 or height > 255 then exit("Screen height invalid")
    if width < 0 or width > 255 then exit("Screen width invalid")

    ret = new Native

    // Screen size.
    // Changing this during execution requires notifying the
    // users of the native object.
    ret.ScreenWidth = width
    ret.ScreenHeight = height

    // Transcript file
    // Because it's designed for a printer, some games can activate it
    // rapidly.  So the filename should be kept after set the first time.
    // It should also support buffering text (e.g. word wrapping), but we don't.
    ret.Stream2Filename = null
    ret.Stream2File = null

    // Output Stream 4
    // Saves user input.  Not currently supported.

    // The active screen contents, useful when reading characters at a time.
    ret.screenContents = []

    // Input stream 0 is the keyboard, input stream 1 is a file.
    ret.inputStream = 0

    // Location of the prompt.  This must be >= 0 for the prompt to be drawn.
    // These are zero based.  They must be set to values within the screen size.
    ret.cursorRow = -1
    ret.cursorColumn = -1

    // Draw a block as the cursor.
    ret.cursorColor = "#e0e0e0"
    ret.inputColor = "#e0f0f0"

    // Mouse isn't supported.
    // Timed input isn't supported.

    // Characters that indicate the end of a command.
    // These are Grey Hack characters.
    ret.terminatingChars = [""]

    // Character translation table to zscii
    ret.zsciiSpecialUnicode = {}

    return ret
end function

// SetZsciiUnicodeTable Set the zscii code -> unicode table
Native.SetZsciiUnicodeTable = function(table)
    self.zsciiSpecialUnicode = {}
    for code in table.indexes
        key = table[code]
        self.zsciiSpecialUnicode[key] = code
    end for
end function

// SaveGame Store the data to a save file.
//
// Data is a list of bytes (integers in range 0-255)
//
// The native interface figures out the name of the save game (usually by asking the user).
Native.SaveGame = function(data)
    user_input("Save game not implemented yet.  Press <enter> to continue.")
end function

// LoadGame Loads a save file and returns a list of bytes (integers in range 0-255).
//
// On error or user canceling the action, returns null
Native.LoadGame = function()
    user_input("Load game not implemented yet.  Press <enter> to continue.")
    return null
end function

// EnableTranscript Trigger transcript saving, which can ask the user for input.
//
// Returns 'true' if the user ok'd the enablement, 'false' if cancelled.
Native.EnableTranscript = function()
    if self.Stream2Filename == null then
        self.Stream2Filename = user_input("Please enter the transcript file name> ")
        user_input("Sorry.  Transcript saving is not currently supported.  Press <enter> to continue.")
    end if
    return false
end function

// DisableTranscript Turn off transcript saving.
//
// This shouldn't forget the file being saved to, so that re-enabling the
// transcript will reuse the previous transcript.
Native.DisableTranscript = function()
    self.Stream2File = null
end function

// EnableUserInputCapture Turn on stream 4 capturing, which is for user input.
Native.EnableUserInputCapture = function()
    // Currently ignored
end function

// DisableUserInputCapture Turn on stream 4 capturing, which is for user input.
Native.DisableUserInputCapture = function()
    // Currently ignored
end function

// PauseForScroll Called by the screen when the scrolling can lose data to the user.
//
// Returns when the user has signaled completion.  The native can display 1 line to
// ask the user for input, so the scrolling logic must take that screen space into
// consideration.
//
// If reading from stream 1, then the system shouldn't pause.
Native.PauseForScroll = function()
    user_input("[MORE]")
end function

// DrawScreen Draw the entire screen.
//
// The native code doesn't allow for partial updates, only full drawing.
// The formatLines argument is an array, one entry per line, such that
// formatLines.len == screen height, and each entry
// is an array of format descriptions.
//
// A format description is a map that contains all the keys:
//   * 't' - the text to display.  The length sum of all these on a line should equal the screen width.
//   * 'fg' - the foreground color, in 24-bit rgb color space ('#rrggbb').
//   * 'bg' - the background color, in 24-bit rgb color space ('#rrggbb').
//   * 'b' - bold face; if not included, defaults to false.  Must be either false or true.
//   * 'i' - italic; if not included, defaults to false.  Must be either false or true.
//   * 'ft' - font index.  Currently ignored.
// Inverse color is implicit by swapping bg/fg.
Native.DrawScreen = function(formatLines, drawLastLine)
    self.screenContents = []
    for fmtParts in formatLines
        // The values are reset on each new line.
        line = ""
        fg = ""
        fgEnd = ""
        bg = ""
        bgEnd = ""
        b = false
        i = false
        // ft = 1
        for fmt in fmtParts
            if fmt.bg != bg then
                line = line + bgEnd + "<mark=" + bg + ">"
                bgEnd = "</mark>"
            end if
            if fmt.fg != fg then
                line = line + fgEnd + "<color=" + fg + ">"
                fgEnd = "</color>"
            end if
            if fmt.b != b then
                if b then
                    line = line + "</b>"
                    b = false
                else
                    line = line + "<b>"
                    b = true
                end if
            end if
            if fmt.i != i then
                if i then
                    line = line + "</i>"
                    i = false
                else
                    line = line + "<i>"
                    i = true
                end if
            end if
            line = line + "<noparse>" + fmt.t + "</noparse>"
        end for
        self.screenContents.push(line)
    end for

    self.drawCurrentScreen(drawLastLine)
end function

Native.drawCurrentScreen = function(includeLastLine)
    clear_screen
    startRow = 0
    if self.cursorRow > 0 then
        // Draw up to the input row...
        // up to but not including the row...
        for idx in range(0, self.cursorRow - 1)
            print(self.screenContents[idx])
        end for
        if includeLastLine and self.cursorRow < self.screenContents.len then
            // The cursor row is earlier than the last line.
            // So draw the cursor row.  The cursor is done by drawing the line,
            // then adding in a <pos=count> to set the column.
            print(self.screenContents[self.cursorRow - 1] + "<pos=" + (self.cursorColumn - 1) + "><mark=" + cursorColor + "> </mark>")
        end if
        startRow = self.cursorRow
    end if
    lastRow = self.screenContents.len - 1
    if not includeLastLine then lastRow = lastRow - 1

    if startRow <= lastRow then
        for idx in range(startRow, lastRow)
            print(self.screenContents[idx])
        end for
    end if
end function

// SetTerminatingChars Set a list of characters that terminate input.
// In Versions 5 and later, the game may provide a “terminating characters table”.
// This table is a list of input character codes which cause aread to finish the command
// (in addition to new-line). Only function key codes are permitted: these are defined
// as those between 129 and 154 inclusive, together with 252, 253 and 254. The special
// value 255 means “any function key code is terminating”.  See the ZsciiKeyTranslate
// for details on the key codes.
Native.SetTerminatingChars = function(codes)
    self.terminatingChars = [""]
    using = {"" : true}  // "" is a newline; it must be here.

    if codes.indexOf(255) != null then
        // use any code.
        codes = [252, 253, 254]
        for i in range(129, 154)
            codes.push(i)
        end for
    end if

    for code in codes
        if code < 129 or code > 254 or (code > 154 and code < 252) then
            // Not a function key.
            continue
        end if
        missing = true
        for key in ZsciiKeyTranslate.indexes
            if using.hasIndex(key) then
                // already found this one.  Don't add it again.
                missing = false
                break
            end if
            keyCode = ZsciiKeyTranslate[key]
            if keyCode == code then
                missing = false
                using[key] = true
                self.terminatingChars.push(key)
                break
            end if
        end for
        if missing then
            // Not a special character.
            key = char(code)
            if not using.hasIndex(key) then
                using[key] = true
                self.terminatingChars.push(key)
            end if
        end if
    end for
end function

// ReadLine Read a whole command from the user's input as a single line.
//
// Returned characters are a list of ZSCII bytes.
//
// No prompt is automatically displayed.
//
// The prompt is placed at the given position.  Text will be inserted
// on the same line after the prompt.  Caller must ensure a "scroll"
// like action happens on the screen of 1 line.
//
// In Versions 1 to 3, the status line is automatically redisplayed first.  The
// caller this must ensure that's done.
Native.ReadLine = function(maxChars, cursorRow, cursorColumn)
    // Should do a "inputStream" test.  But we don't.

    // The cursor may be at any legal screen position.  If not
    // legal, then this interpreter arbitrarily puts it in the bottom left side.
    if cursorRow <= 0 or cursorRow > self.ScreenHeight then
        cursorRow = self.ScreenHeight
    end if
    if cursorColumn <= 0 or cursorColumn > self.ScreenWidth then
        cursorColumn = 1
    end if

    // If things look like a simple mode, then just do a simple prompt.
    if cursorRow == self.ScreenHeight and self.terminatingChars.len == 1 then
        // Draw the screen with everything except the last row, then
        // use the prompt to draw it.
        self.drawCurrentScreen(false)
        val = user_input(self.screenContents[self.ScreenHeight - 1])
        ret = []
        for key in val.values()
            ret.push(self.convertInputToZscii(key))
        end for
        // Perform new-line.
        self.cursorColumn = 1
        self.cursorRow = cursorRow
        return ret
    end if

    // Simulate user input handling.
    ret = []
    self.cursorRow = cursorRow
    self.cursorColumn = cursorColumn
    insertPos = 0
    baseRowText = self.screenContents[self.ScreenHeight - 1] + "<pos=" + cursorRow + "><color=" + self.inputColor
    insertText = ""  // what to put at the end of baseRowText before redrawing.

    // Draw screen will show the cursor for us.
    while true
        // Draw the screen with the simulated cursor.
        self.screenContents[cursorRow - 1] = baseRowText + insertText
        self.drawCurrentScreen(true)
        // Read the character without showing an explicit prompt.
        ch = user_input("", false, true)
        if self.terminatingChars.indexOf(ch) != null then return ret
        // Not a terminating character.   Handle it.
        if ch == "LeftArrow" then
        else if ch =="RightArrow" then
        else if ch == "Delete" then
        else if ch == "Backspace" then
        else
            zscii = self.convertInputToZscii(ch)
            if ret.len < maxChars and cursorColumn < self.ScreenWidth then
                if insertPos != ret.len then
                    // Overwrite what's there.
                    ret[insertPos] = zscii
                    insertText = insertText[:insertPos] + ch + insertText[insertPos + 1:]
                else
                    // Append the character.
                    ret.push(zscii)
                    insertText = insertText + ch
                end if
                // Advance the position.
                insertPos = insertPos + 1
                cursorColumn = cursorColumn + 1
                self.cursorColumn = cursorColumn
            else
                // Overwrite the last character and don't advance the position
                ret[insertPos] = zscii
            end if
        end if
    end while

end function

// ReadKey Pull a ZSCII code value from the user for a single keystroke.
//
// Called by the read_char opcode.  No timer is supported.
Native.ReadKey = function()
    ch = user_input("", false, true)
    return self.convertInputToZscii(ch)
end function

// Turn the key into a lower-case zscii character
Native.convertInputToZscii = function(key)
    if ZsciiKeyTranslate.hasIndex(key) then return ZsciiKeyTranslate[key]
    if key == "" then return 13 // newline; special exception for zscii, as "" is 0.
    // No unicode lowercase support.
    if self.zsciiSpecialUnicode.hasIndex(key) then return self.zsciiSpecialUnicode[key]
    if key.len != 1 then return 0 // undefined

    // else assume a unicode -> zscii translation
    return key.lower().code    
end function

// ====================================================================
// Input helpers

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
    // Keypad 0-9 are 145-154, but keypad isn't supported in Grey Hack.
    // Menu click -> 252 (V6)
    // Double click -> 253 (V6)
    // Single click -> 254
}
