// Native interactions.
MIN_FRAME_WAIT = 0.21
MIN_FRAME_REFRESH_TIME = 0.5

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
    ret.unicodeFromZscii = {}

    // History of past input captures for history scrolling
    ret.cmdHistory = []

    // Time of the last draw.  Used to ensure waiting between redraw
    // to reduce flashing.
    ret.lastDraw = time()

    // Base font size.
    ret.fontWidth = 10

    return ret
end function

// Reset Set the internal settings as though a game "restart" happened.
Native.Reset = function()
    self.Stream2Filename = null
    self.Stream2File = null
    self.inputStream = 0
    self.cursorRow = -1
    self.cursorColumn = -1
    self.terminatingChars = [""]
end function

// SetZsciiUnicodeTable Set the zscii code -> unicode table
Native.SetZsciiUnicodeTable = function(table)
    self.unicodeFromZscii = table
    self.zsciiSpecialUnicode = {}
    for code in table.indexes
        key = table[code]
        self.zsciiSpecialUnicode[key] = code
    end for
    // There is a special case for tab in the unicode table that we'll overwrite for
    // the reverse conversion.
    self.zsciiSpecialUnicode[" "] = " ".code
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

// PrintTranscript Send text to the transcript
Native.PrintTranscript = function(text)
    // Currently ignored
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

// SetCursor set the column, row for the cursor position on the screen.
//
// Values are 0 based.  Set the values to null to remove the column.
Native.SetCursor = function(col, row)
    if row == null or col == null then
        self.cursorRow = -1
        self.cursorColumn = -1
    else
        if row >= self.ScreenWidth then row = self.ScreenWidth - 1
        if row < 0 then row = 0
        if col >= self.ScreenHeight then col = self.ScreenHeight - 1
        if col < 0 then col = 0
        self.cursorRow = row
        self.cursorColumn = col
    end if
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
//           this contains the text as a string, but with zscii character codes, not unicode.
//   * 'fg' - the foreground color, in 24-bit rgb color space ('#rrggbb').
//   * 'bg' - the background color, in 24-bit rgb color space ('#rrggbb').
//   * 'b' - bold face; if not included, defaults to false.  Must be either false or true.
//   * 'i' - italic; if not included, defaults to false.  Must be either false or true.
//   * 'ft' - font index.  Currently ignored.
// Inverse color is implicit by swapping bg/fg.
Native.DrawScreen = function(formatLines)
    self.screenContents = []
    if formatLines.len != self.ScreenHeight then exit("wrong screen size: " + formatLines.len + ", requires " + self.ScreenHeight)

    for idx in formatLines.indexes
        fmtParts = formatLines[idx]
        // The values are reset on each new line.
        line = ""
        lineCols = 0
        last = {"t": "", "fg": "#000000", "bg": "#000000", "b": false, "i": false, "ft": 1}
        for fmt in fmtParts
            // Don't add formatting if there's no text.
            if fmt.t.len <= 0 then continue
            // ignore font for now.
            if fmt.bg != last.bg or fmt.fg != last.fg or fmt.b != last.b or fmt.i != last.i then
                line = line + self.renderFmt(last, lineCols)
                lineCols = lineCols + last.t.len
                last.t = ""
                last.fg = fmt.fg
                last.bg = fmt.bg
                last.b = fmt.b
                last.i = fmt.i
            end if
            // Need to convert the text to unicode from zscii.
            for ch in fmt.t.values()
                idx = ch.code
                if self.unicodeFromZscii.hasIndex(idx) then
                    // self.log.Debug("  zscii " + idx + " -> " + self.zsciiSpecialUnicode[idx])
                    last.t = last.t + self.unicodeFromZscii[idx]
                else
                    // assume 1-to-1 unicode translation.
                    // self.log.Debug("  zscii " + idx + " -> " + char(idx))
                    last.t = last.t + ch
                end if
            end for
        end for

        // Explicitly add a final non-whitespace character to ensure the full
        // background color is placed.  The cursor line shouldn't have this.
        while last.t.len < self.ScreenWidth
            last.t = last.t + " "
        end while
        line = line + self.renderFmt(last, lineCols)
        line = line + "<color=" + last.bg + ">" + char(183)

        self.screenContents.push(line)
    end for

    // DEBUGGING MODE comment out this line.
    if DISPLAY_DEBUGGING < 3 then self.drawCurrentScreen()
    // Simulate the slow scrolling of old computers.
    // wait(0.02)
end function

Native.renderFmt = function(fmt, startPos)
    if fmt.t.len <= 0 then return ""
    // Using "mark" will incorrectly put a rectangle bar on top of the
    // text, which isn't what we want.  However, attempts at drawing
    // the inverse color underneath with a character then using <pos>
    // to go back over it doesn't really work either.  I mean, it
    // works, but there isn't a character that will fill in the block.

    // Note: Setting '<font="LiberationSans SDF">' allows the text to be
    // drawn on top of the background.  It's not monospace, though.
    // <mspace> can override the character spacing to be monospace.

    ret = ""
    if startPos <= 0 then
        ret = "<font=""LiberationSans SDF""><mspace=" + self.fontWidth + ">"
    end if

    ret = ret + "<mark=" + fmt.bg + "><color=" + fmt.fg + ">"
    tail = "</color></mark>"
    if fmt.b then
        ret = ret + "<b>"
        tail = "</b>" + tail
    end if
    if fmt.i then
        ret = ret + "<i>"
        tail = "</i>" + tail
    end if
    // fmt.fnt
    return ret + "<noparse>" + fmt.t + "</noparse>" + tail
end function

Native.drawCurrentScreen = function()
    lines = []
    for idx in self.screenContents.indexes
        out = self.screenContents[idx]
        if self.cursorRow == idx and self.cursorColumn >= 0 then
            // Then insert the cursor.  The cursor in the game is a sprite.
            // <sprite index=0 color=#00DD13FF>
            // It also has a blink style.  Need to figure that out.
            out = out + "<pos=" + (self.cursorColumn * self.fontWidth) + "><sprite index=0 color=" + self.cursorColor + ">"
        end if
        if DISPLAY_DEBUGGING == 2 then
            lines.push("$DISPLAY <noparse>" + out.replace("<", "$"))
        else
            lines.push(out)
        end if
    end for
    currentTime = time()
    under = MIN_FRAME_REFRESH_TIME - (currentTime - self.lastDraw)
    clear = DISPLAY_DEBUGGING == 0
    if under > 0 and clear then
        // waiting allow the print with clear-screen to properly clear the screen.
        // wait(MIN_FRAME_WAIT)
        clear_screen
        clear = false
    end if
    self.lastDraw = time()
    // So much faster to redraw the screen in a single call.
    print(lines.join(char(10)), clear)
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

// ReadLine Read [cr terminated, zscii, text] read from the user's input as a single line.
//
// If the user pressed a carrage return at the end of the input, then the first item
// in the array is true, otherwise it's false.  The second element is
// a list of lower-case ZSCII bytes.
//
// No prompt is automatically displayed.
//
// The prompt is placed at the given position.  Text will be inserted
// on the same line after the prompt.  Caller must ensure a "scroll"
// like action happens on the screen of 1 line.
//
// In Versions 1 to 3, the status line is automatically redisplayed first.  The
// caller this must ensure that's done.
Native.ReadLine = function(maxChars, cursorColumn, cursorRow)
    // Should do a "inputStream" test.  But we don't.
    if DISPLAY_DEBUGGING == 2 then print("$ReadLine(" + maxChars + ", " + cursorColumn +", " + cursorRow + ")")
    clearScreen = DISPLAY_DEBUGGING == 0

    display = [] + self.screenContents

    // The cursor may be at any legal screen position.  If not
    // legal, then this interpreter arbitrarily puts it in the bottom left side.
    if cursorRow <= 0 or cursorRow >= display.len then
        cursorRow = display.len - 1
    end if
    if cursorColumn <= 0 or cursorColumn >= self.ScreenWidth then
        cursorColumn = 1
    end if

    // Optimizing the character read.  Rather than going through the draw again, do it
    // with cached versions of the screen.  This needs to be very, very fast.
    origCursorRow = self.screenContents[cursorRow] + "<pos=" + (cursorColumn * self.fontWidth) + "><color=" + self.inputColor + "><noparse>"
    cursorFlavor = "</noparse><sprite index=0 color=" + self.cursorColor + "><noparse>"

    // Simulate user input handling.
    startingCursorColumn = self.cursorColumn
    insertPos = 0
    insertTextPre = ""
    insertTextPost = ""
    needsDraw = true
    cmdHistoryPos = self.cmdHistory.len
    this = self  // needed for inner-function access to self

    mkRet = function(isEol)
        zscii = []
        text = outer.insertTextPre + outer.insertTextPost
        for ch in text.values
            if zscii.len >= maxChars then break
            zsciiCh = this.convertInputToZscii(ch)
            if zsciiCh > 0 then zscii.push(zsciiCh)
        end for
        return [isEol, zscii, text]
    end function
    leftArrowKey = function()
        if outer.insertTextPre.len > 0 then
            outer.insertTextPost = outer.insertTextPre[-1] + outer.insertTextPost
            outer.insertTextPre = outer.insertTextPre[:-1]
            outer.needsDraw = true
        end if
    end function
    rightArrowKey = function()
        if outer.insertTextPost.len > 0 then
            outer.insertTextPre = outer.insertTextPre + outer.insertTextPost[0]
            outer.insertTextPost = outer.insertTextPost[1:]
            outer.needsDraw = true
        end if
    end function
    upArrowKey = function()
        if outer.cmdHistoryPos >= 0 and outer.cmdHistoryPos < this.cmdHistory.len then
            outer.insertTextPre = this.cmdHistory[outer.cmdHistoryPos]
            outer.insertTextPost = ""
            outer.cmdHistoryPos = outer.cmdHistoryPos - 1
            return
        end if
        if outer.insertTextPre != "" or outer.insertTextPost != "" then
            this.cmdHistory.push(outer.insertTextPre + outer.insertTextPost)
            outer.insertTextPre = ""
            outer.insertTextPost = ""
        end if
    end function
    downArrowKey = function()
        if outer.cmdHistoryPos == 0 and this.cmdHistory.len == 0 and outer.insertTextPre != "" or outer.insertTextPost != "" then
            this.cmdHistory.push(outer.insertTextPre + outer.insertTextPost)
            outer.insertTextPre = ""
            outer.insertTextPost = ""
            return
        end if
        if outer.cmdHistoryPos < 0 and this.cmdHistory.len > 0 then
            outer.insertTextPre = this.cmdHistory[outer.cmdHistoryPos]
            outer.insertTextPost = ""
            outer.cmdHistoryPos = outer.cmdHistoryPos - 1
            return
        end if
        if outer.cmdHistoryPos < this.cmdHistory.len then
            outer.insertTextPre = this.cmdHistory[outer.cmdHistoryPos]
            outer.insertTextPost = ""
            outer.cmdHistoryPos = outer.cmdHistoryPos - 1
        end if
    end function
    deleteKey = function()
        if outer.insertTextPost.len > 0 then
            outer.insertTextPost = outer.insertTextPost[1:]
            outer.needsDraw = true
        end if
    end function
    backspaceKey = function()
        if outer.insertTextPre.len > 0 then
            outer.insertTextPre = outer.insertTextPre[:-1]
            outer.needsDraw = true
        end if
    end function
    endKey = function()
        outer.insertTextPre = outer.insertTextPre + outer.insertTextPost
        outer.insertTextPost = ""
        outer.needsDraw = true
    end function
    homeKey = function()
        outer.insertTextPost = outer.insertTextPre + outer.insertTextPost
        outer.insertTextPre = ""
    end function

    keyFuncs = {
        "LeftArrow": @leftArrowKey,
        "RightArrow": @rightArrowKey,
        "UpArrow": @upArrowKey,
        "DownArrow": @downArrowKey,
        "Delete": @deleteKey,
        "Backspace": @backspaceKey,
        "End": @endKey,
        "Home": @homeKey,
    }

    // Draw screen will show the cursor for us.
    // This needs to be really fast.  The longer this processes data,
    // the worse key input responsiveness is.
    while true
        // Draw the screen with the simulated cursor.
        // Because the cursor isn't flashing at the moment, just stick the whole post text after the cursor.
        if needsDraw then
            display[cursorRow] = origCursorRow + insertTextPre + cursorFlavor + insertTextPost
            if DISPLAY_DEBUGGING == 2 then
                print("===== clear screen for input ====")
                for row in display
                    print("$DISPLAY " + row.replace("<", "$"))
                end for
            else
                // The clear_screen then one by one print causes a flashing
                // on some screens.  Instead, just print it as a single print.
                //if DISPLAY_DEBUGGING == 0 then clear_screen
                //for row in display
                //    print(row)
                //end for
                // NOTE: this will always clear screen because of the trailing "1"
                print(display.join(char(10)), clearScreen)
            end if
        end if

        // Read the character without showing an explicit prompt.
        // Need to put something in the prompt text, or it will return all the
        // line's text, what's been printed + the typed character.
        // But... we can also add formatting to make the cursor disappear.
        ch = user_input("<color=#000000><mark=#000000>", false, true)
        if DISPLAY_DEBUGGING == 2 then print("$INPUT '" + ch + "'")
        if ch == "" then return mkRet(true)  // Explicit check for CR
        if self.terminatingChars.indexOf(ch) != null then return mkRet(false)
        // Not a terminating character.   Handle it.

        // Note: The key press handling won't work here with v5 and extra
        // existing character buffer.  Or does it work right?
        needsDraw = false
        if keyFuncs.hasIndex(ch) then
            keyFuncs[ch]()
        else if ch.len == 1 then
            // Needs length checking?
            insertTextPre = insertTextPre + ch
            needsDraw = true
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
