// The screen Object.
// Not output stream 1, but part of it.

DefaultColorSpace24 = {
    // -1: the colour of the pixel under the cursor (if any)
	// 0: current color
    // 1: default color
    2: "#000000",  // black; rgb15: 0x0000
    3: "#e80000",  // red; 0x001D
    4: "#00d000",  // green; 0x0340
    5: "#e8e800",  // yellow; 0x03BD
    6: "#0068b0",  // blue; 0x59A0
    7: "#f800f8",  // magenta; 0x7C1F
    8: "#00e8e8",  // cyan; 0x77A0
    9: "#f8f8f8",  // white; 0x7FFF
    10: "#b0b0b0",  // light grey; 0x5AD6
    11: "#888888",  // medium grey; 0x4631
    12: "#585858",  // dark grey; 0x2D6B
    // 13: reserved
    // 14: reserved
    // 15: transparent (V6 only)
}
// TEST
//"<color=#000000>black<color=#e80000>red<color=#00d000>green<color=#0068b0>blue"
//"<color=#f800f8>magenta<color=#00e8e8>cyan<color=#f8f8f8>white<color=#b0b0b0>light grey<color=#585858>dark grey"

Screen = {}

// Screen The drawing functions.
//
// Note that the Machine must know this width and height, so changing it
// requires updating the machine as well.
Screen.New = function(width, height)
    ret = new Screen()
    ret.Width = width
    ret.Height = height
    ret.Windows = []  // Needed for SetColorspace, but set to real value later.
    ret.ColorSpace24 = {}
    ret.ColorSpace15 = {}
    ret.SetColorspace24(DefaultColorSpace24)

    // The base color is the color index
    // Color 24 is the "#rrggbb" color space string.
    // Color 15 is the "true color" sRGB space, with 5 bits per color, used by true color calls.
    ret.DefaultBackgroundColor = 2
    ret.DefaultBackgroundColor24 = ret.ColorSpace24[ret.DefaultBackgroundColor]
    ret.DefaultBackgroundColor15 = ret.ColorSpace15[ret.DefaultBackgroundColor]

    ret.DefaultForegroundColor = 9
    ret.DefaultForegroundColor24 = ret.ColorSpace24[ret.DefaultForegroundColor]
    ret.DefaultForegroundColor15 = ret.ColorSpace15[ret.DefaultForegroundColor]

    // Set to true if the interpreter must draw the status line.
    ret.IsInterpreterStatusLine = false
    // Set to true if the interpreter's drawn status line is hours:minutes format.
    ret.IsInterpreterScore = false
    // Set to true to show 24-hour time, instead of "am" or "pm" 12 hour time.
    ret.IsInterpreter24HourTime = false
    ret.StatusLineObjectName = ""
    ret.StatusLineScore = 0  // or hours
    ret.StatusLineTurn = 0  // or minutes

    ret.StatusBackgroundColor = ret.DefaultForegroundColor
    ret.StatusForegroundColor = ret.DefaultBackgroundColor

    ret.Windows = [
        // Window ordering here doesn't necessarily match the opcode names.
        // Upper window
        ScreenWindow.New(width, 0, ret.DefaultForegroundColor, ret.DefaultBackgroundColor, ret.ColorSpace24, ret.ColorSpace15),
        // Lower window
        ScreenWindow.New(width, height, ret.DefaultForegroundColor, ret.DefaultBackgroundColor, ret.ColorSpace24, ret.ColorSpace15),
    ]
    ret.ActiveWindowIndex = 1
    // In all versions, the lower window always buffers text by default.
    ret.Windows[1].IsBufferingText = true
    ret.Windows[1].CanBufferText = true
    ret.Windows[1].ScrollsUp = true
    ret.Windows[1].CursorY = height - 1

    return ret
end function

// Reset Set the state back to initial values, as though a game "restart" happened.
Screen.Reset = function()
    self.IsInterpreterStatusLine = false
    self.IsInterpreterScore = false
    self.IsInterpreter24HourTime = false
    self.StatusLineObjectName = ""
    self.StatusLineScore = 0
    self.StatusLineTurn = 0

    self.StatusBackgroundColor = self.DefaultForegroundColor
    self.StatusForegroundColor = self.DefaultBackgroundColor

    self.Windows = [
        ScreenWindow.New(self.Width, 0, self.DefaultForegroundColor, self.DefaultBackgroundColor, self.ColorSpace24, self.ColorSpace15),
        ScreenWindow.New(self.Width, self.Height, self.DefaultForegroundColor, self.DefaultBackgroundColor, self.ColorSpace24, self.ColorSpace15),
    ]
    self.ActiveWindowIndex = 1
    self.Windows[1].IsBufferingText = true
    self.Windows[1].CanBufferText = true
    self.Windows[1].ScrollsUp = true
    self.Windows[1].CursorY = self.Height - 1
end function

// Render Create the format lines to send to the native draw screen.
Screen.Render = function()
    lines = []
    if self.IsInterpreterStatusLine then
        if self.IsInterpreterScore then
            score = "" + self.StatusLineScore + "/" + self.StatusLineTurn + " "
        else if self.IsInterpreter24HourTime then
            score = "" + self.StatusLineScore + ":" + self.StatusLineTurn + " "
        else
            hour = self.StatusLineScore
            med = "AM"
            if hour >= 12 then
                hour = hour - 12
                med = "PM"
            else if hour == 0 then
                hour = 12
            end if
            score = "" + hour + ":" + self.StatusLineTurn + " " + med + " "
        end if
        title = " " + self.StatusLineObjectName
        if score.len + title.len + 2 > self.Width then
            title = title[:self.Width - 2 - score.len] + char(8230)
        end if
        splitLen = self.Width - title.len - score.len
        split = " "
        while split.len < splitLen
            split = split + " "
        end while
        // Status line is a single formatted block.
        lines.push([{
            "t": title + split + score,
            "fg": self.ColorSpace24[self.StatusForegroundColor],
            "bg": self.ColorSpace24[self.StatusBackgroundColor],
            "b": false,
            "i": false,
        }])
    end if
    for window in self.Windows
        if window.ScrollsUp then
            endY = window.StoredLines - 1
            startY = endY - window.Height + 1
            if startY < 0 then startY = 0
        else
            startY = 0
            endY = window.Height - 1
            if endY >= window.StoredLines then
                endY = window.StoredLines - 1
            end if
        end if
        if endY > startY then
            for y in range(startY, endY)
                // Need to fill in the line.
                lines.push(window.FormattedLines[y])
            end for
        end if
    end for
    return lines
end function

// SetStatusLine Sets the status line information.
//
// By calling this with non-null values, the status line is set to be shown.
Screen.SetStatusLine = function(objectName, scoreHour, turnMinute)
    if not self.IsInterpreterStatusLine then
        // Turn on the status line.  Need to adjust the lower window to have
        // a 1-less height, but not adjusting the stored line height.
        // We hard code the window(1) because the status line is only for
        // early version games that have limited windowing.
        self.IsInterpreterStatusLine = true
        self.Windows[1].SetHeight(self.Windows[1].Height - 1)
    end if
    self.StatusLineObjectName = objectName
    self.StatusLineScore = scoreHour
    self.StatusLineTurn = turnMinute
end function

// GetActiveCursor Get the cursor [x, y] for the active window
Screen.GetActiveCursor = function()
    // Need to adjust the Y to accomodate other windows above it.
    height = 0
    if self.IsInterpreterStatusLine then height = 1
    for idx in range(0, self.Windows.len - 1)
        window = self.Windows[idx]
        if self.ActiveWindowIndex == idx then
            // Active window may not have a cursor, which is fine.
            if window.CursorY < 0 then return [-1, -1]
            // CursorY is position in the full height.  We need it adjusted for the screen.
            // This depends on whether the window is scrolling or not.
            if window.ScrollsUp then
                return [window.CursorX, height + window.CursorY - (window.StoredLines - window.Height) + 1]
            else
                return [window.CursorX, height + window.CursorY]
            end if
        end if
        height = height + window.Height
    end for
    // no active window?
    return height
end function

// PrintZscii Send text to the active window.
Screen.PrintZscii = function(text)
    self.Windows[self.ActiveWindowIndex].PrintZscii(text)
end function

Screen.AddUserInput = function(originalText, includeNewline)
    self.Windows[self.ActiveWindowIndex].AddUserInput(originalText, includeNewline)
end function

// SetColorspace24 Set the colorspace index.
//
// Argument is a map with keys of values in the range of 2 to 12, values
// are 24-bit RGB '#RRGGBB' format.
Screen.SetColorspace24 = function(colorspace)
    for i in range(2, 12)
        self.ColorSpace24[i] = colorspace[i]
        self.ColorSpace15[i] = convert24to15(colorspace[i])
    end for
    for window in self.Windows
        window.SetColorspace(self.ColorSpace15, self.ColorSpace24)
    end for
end function

// ScreenWindow A window to display within the screen.
ScreenWindow = {}
ScreenWindow.New = function(width, height, foregroundIndex, backgroundIndex, colorSpace24, colorSpace15)
    ret = new ScreenWindow()
    ret.Width = width
    ret.Height = height
    ret.properties = {
        // 10: actual style combination in use
        // 11: current color index
    }

    ret.BackgroundColor = backgroundIndex
    ret.BackgroundColor24 = colorSpace24[backgroundIndex]
    ret.BackgroundColor15 = colorSpace15[backgroundIndex]
    ret.IsBgIndexed = true

    ret.ForegroundColor = foregroundIndex
    ret.ForegroundColor24 = colorSpace24[foregroundIndex]
    ret.ForegroundColor15 = colorSpace15[foregroundIndex]
    ret.IsFgIndexed = true
    
    ret.colorSpace24 = colorSpace24
    ret.colorSpace15 = colorSpace15

    // FormattedLines The lines with formatting.  Always filled with empty lines.
    ret.FormattedLines = []
    for y in range(1, height)
        ret.FormattedLines.push([])
    end for

    // StoredLines, unlike the actual height, is the number of lines
    // that can be "scrolled" to.  Though this interpreter doesn't allow
    // for scrolling, it allows for the upper window to change to size 0
    // and redraw the lines underneath it.
    ret.StoredLines = height

    // If ScrollsUp is true, then at EOL, the current line
    // is pushed up, and the top line is removed.  Without
    // scrolling, the cursor cannot move past the last column of the last line.
    ret.ScrollsUp = false

    // The upper window can never "buffer" (e.g. word-wrap) text.
    ret.CanBufferText = false

    // In version 5, erasing the screen moves the cursor to the upper 

    ret.IsBufferingText = false

    // LineCount keeps track of lines written to the screen.
    // The interpreter can clear it.  It's used by the interpreter to
    // know when to display the "[MORE]" line and pause for user.
    ret.LineCount = 0

    // CursorX is from 0 to width-1, and CursorY is from 0 to stored lines - 1.
    ret.CursorX = 0
    ret.CursorY = 0

    // Note that changing back to Roman font should turn off all the text styles currently active.
    // Note that scrolling turns off reverse color.
    // Note that erasing the screen will ignore the reverse color mode.
    ret.ReverseColor = false
    ret.Bold = false
    ret.Italic = false

    return ret
end function

// AddUserInput Add input read by the native code into the screen.
ScreenWindow.AddUserInput = function(originalText, includeNewline)
    // At this point in the processing, the story has written the prompt, and
    // the native code has read in the input.  The screen needs to insert the text
    // and possibly scroll.

    // TODO should convert the original text to zscii characters, specifically around unicode.

    if includeNewline then
        originalText = originalText + ScreenWindow__EOL1
        // For some reason, the cursor Y is wrong.  Need to figure out why.
        // This is probably related to why the GetActiveCursor has a + 1 on it.
        // This is also clearly wrong, because it causes the cursorX to be wrong.
        if self.ScrollsUp then self.CursorY = self.StoredLines - 1
    end if
    // TODO Look at not hard-coding processed input text color.
    // Technically, it should be the same color as was last displayed.
    self.printFormattedZscii(originalText, "#c0c0c0", self.BackgroundColor24, false, false)

    // Reset the line count to allow proper wait for more.
    self.LineCount = 0
end function

ScreenWindow__EOL1 = char(13)
ScreenWindow__TAB = char(9)

// PrintZscii Print the zscii string to the window.
ScreenWindow.PrintZscii = function(text)
    fg = self.ForegroundColor24
    bg = self.BackgroundColor24
    if self.ReverseColor then
        fg = bg
        bg = self.ForegroundColor24
    end if
    self.printFormattedZscii(text, fg, bg, self.Bold, self.Italic)
end function

// printFormattedZscii Send some zscii text with formatting into the window.
ScreenWindow.printFormattedZscii = function(text, fg, bg, bold, italic)
    // Append to the current line.  Optionally word wrap (if buffer mode is on).

    // Early check to prevent more complex behavior.
    if self.Height <= 0 then return

    buff = ""
    for ch in text.values()
        drawChar = true
        if ch == ScreenWindow__EOL1 then
            drawChar = false  // handle EOL implicitly.
            if buff.len > 0 then
                // There has already been stuff put into the buffer, and the cursor was fine then.
                // So we can draw it on the current line.
                self.FormattedLines[self.CursorY].push({
                    "t": buff,
                    "fg": fg,
                    "bg": bg,
                    "b": bold,
                    "i": italic,
                })
                buff = ""
            end if
            self.CursorX = 0
            if self.addNewline() then return  // can't draw anything else
        else if self.CursorX >= self.Width then
            // Reached window width.
            if not self.CanBufferText then
                // No word-wrap.  Just insert the existing text and keep searching for EOL.
                drawChar = false
                if buff.len > 0 then
                    // There has already been stuff put into the buffer, and the cursor was fine then.
                    // So we can draw it on the current line.
                    self.FormattedLines[self.CursorY].push({
                        "t": buff,
                        "fg": fg,
                        "bg": bg,
                        "b": bold,
                        "i": italic,
                    })
                    buff = ""
                end if
            else
                // word-wrap enabled
                // At this point, white space is either space or tab.
                if ch != " " and ch != ScreenWindow__TAB then
                    // Need to word wrap on this non-whitespace character.
                    // Only wrap within the last format group.  The buffer is
                    // already under the width of the line, because it's been built
                    // up character by character.
                    pos = buff.len - 1
                    while pos >= 0 and buff[pos] != " " and buff[pos] != ScreenWindow__TAB
                        pos = pos - 1
                    end while
                    if pos < 0 then
                        // No break found.  Otherwise, move the text to the next line.
                        if self.CursorX == 0 then
                            // The buffer takes up the whole window width.  Need to
                            // hard break the text.
                            prevLine = buff[:self.Width-1] + "-"
                            buff = buff[self.Window-1:]
                        else
                            // Keep the existing text in the buffer.  Let the line
                            // feed do its magic.
                            prevLine = ""
                        end if
                    else
                        // Found a break part way through the buffer.  Break it up.
                        prevLine = buff[:pos]
                        buff = buff[pos+1:]  // skip past the whitespace character
                    end if
                else
                    // word wrap enabled and it's whitespace, so don't draw the character.
                    drawChar = false
                    prevLine = buff
                    buff = ""
                end if
            end if

            self.FormattedLines[self.CursorY].push({
                "t": prevLine,
                "fg": fg,
                "bg": bg,
                "b": bold,
                "i": italic,
            })

            // Handle cursor wrapping
            self.CursorX = buff.len
            if self.addNewline() then return  // can't draw anything else
        else if ch == ScreenWindow__TAB then
            if self.CursorX == 0 then
                // First character of the line is a tab, so indent the line.
                // Assume that the window width is more than 4.
                ch = "    "
            else
                // Tab in the middle of text.  Use a space.
                ch = " "
            end if
        end if
        if drawChar then
            buff = buff + ch
            self.CursorX = self.CursorX + ch.len
        end if
    end for
    if buff.len > 0 then
        // There has already been stuff put into the buffer, and the cursor was fine then.
        // So we can draw it on the current line.
        self.FormattedLines[self.CursorY].push({
            "t": buff,
            "fg": fg,
            "bg": bg,
            "b": bold,
            "i": italic,
        })
    end if
end function

// Called on moving down a Y.
ScreenWindow.addNewline = function()
    self.LineCount = self.LineCount + 1
    if self.LineCount + 1 >= self.Height and self.ScrollsUp then
        // FIXME should wait for a "more" screen, but that requires
        // calling native.
        // Then, after the more,
        // self.LineCount = 0
    end if
    if self.CursorY + 1 >= self.StoredLines then
        if not self.ScrollsUp then return true  // can't scroll text up, so exit immediately.
        self.FormattedLines.pull()  // remove the top line
        self.FormattedLines.push([])
        self.CursorY = self.StoredLines - 1  // keep it on the last line.
        self.CursorX = 0  // move the x cursor to the start of the line.
    else
        self.CursorY = self.CursorY + 1
    end if
    return false
end function

// SetColorspace Change the indexed colorspace.
ScreenWindow.SetColorspace = function(colorSpace15, colorSpace24)
    self.colorSpace24 = colorSpace24
    self.colorSpace15 = colorSpace15
    if self.IsFgIndexed then
        self.ForegroundColor15 = self.colorSpace15[self.ForegroundColor]
        self.ForegroundColor24 = self.colorSpace24[self.ForegroundColor]
    end if
    if self.IsBgIndexed then
        self.BackgroundColor15 = self.colorSpace15[self.BackgroundColor]
        self.BackgroundColor24 = self.colorSpace24[self.BackgroundColor]
    end if
end function

// SetHeight Set the height of the window in lines.
//
// Will only increase the StoredLines value.
ScreenWindow.SetHeight = function(lineCount)
    if lineCount > self.StoredLines then
        // Insert lines into the formatted lines, either at the top or bottom.
        while self.FormattedLines.len < lineCount
            if self.ScrollsUp then
                // Add to the top.
                self.FormattedLines.insert(0, [])
            else
                self.FormattedLines.push([])
            end if
        end while
        self.StoredLines = lineCount
    end if
    self.Height = lineCount
    if self.CursorY >= lineCount then self.CursorY = lineCount - 1
    // This is done on a rare occasion, so just reset the counted line height
    self.LineCount = 0
end function

// SetScreenColorIndex Set the color index.
ScreenWindow.SetScreenColorIndex = function(foreground, background)
    self.ForegroundColor = foreground
    self.BackgroundColor = background
    self.ForegroundColor15 = self.colorSpace15[foreground]
    self.ForegroundColor24 = self.colorSpace24[foreground]
    self.BackgroundColor15 = self.colorSpace15[background]
    self.BackgroundColor24 = self.colorSpace24[background]
    self.IsFgIndexed = true
    self.IsBgIndexed = true
end function

// SetScreenColorTrue Set the "true" color, 15-bit sRGB.
ScreenWindow.SetScreenColorTrue = function(foreground15, background15)
    // Does not change the color index
    self.ForegroundColor15 = foreground15
    self.ForegroundColor24 = convert15to24(foreground15)
    self.BackgroundColor15 = background15
    self.BackgroundColor24 = convert15to24(background15)
    self.isFgIndexed = false
    self.isBgIndexed = false
    for idx in self.colorSpace15.indexes
        if self.colorSpace15[idx] == foreground15 then
            self.IsFgIndexed = true
        end if
        if self.colorSpace15[idx] == background15 then
            self.IsBgIndexed = true
        end if        
    end for
end function


HEX_STR = "01234567890abcdef"

// convert24to15 Turn 24-bit RGB '#RRGGBB' format string into a 15-bit integer
convert24to15 = function(rgb24)
    rgb24 = rgb24.lower
    if rgb24[0] == "#" then rgb24 = rgb24[1:]
    if rgb24.len != 6 then exit("Invalid rgb " + rgb24)
    r8 = (HEX_STR.indexOf(rgb24[0]) * 16) + HEX_STR.indexOf(rgb24[1])
    g8 = (HEX_STR.indexOf(rgb24[2]) * 16) + HEX_STR.indexOf(rgb24[3])
    b8 = (HEX_STR.indexOf(rgb24[4]) * 16) + HEX_STR.indexOf(rgb24[5])
    // 8 bit space to 5 bit space is (v * 32 / 256).
    // That then needs to be adjusted to the bit position,
    // so that R is in bits 14-10, G 9-5, B 4-0.
    // If we were really good:
    //  ((r8 << 7) & 7c00) | ((g8 << 2) & 0x3e0) | (b8 & 0x1f)
    r5 = floor(r8 * 32 / 256)
    g5 = floor(g8 * 32 / 256)
    b5 = floor(b8 * 32 / 256)
    return r5 + (g5 * 32) + (b5 * 1024)
end function

// convert15to24 Turn 15-bit RGB number to 32-bit '#RRGGBB' format string.
convert15to24 = function(rgb15)
    r8 = (rgb15 % 32) * 8
    g8 = (floor(rgb15 / 32) % 32) * 8
    b8 = (floor(rgb15 / 1024) % 32) * 8
    return "#" + HEX_STR[floor(r8 / 16)] + HEX_STR[r8 % 16] + HEX_STR[floor(g8 / 16)] + HEX_STR[g8 % 16] + HEX_STR[floor(b8 / 16)] + HEX_STR[b8 % 16]
end function
