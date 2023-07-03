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

    ret.DefaultForegroundColor = 4
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

    ret.StatusBackgroundColor = 4
    ret.StatusForegroundColor = 2

    ret.Windows = [
        // Window ordering here doesn't necessarily match the opcode names.
        // Upper window
        ScreenWindow.New(width, 0, 2, 4, ret.ColorSpace24, ret.ColorSpace15),
        // Lower window
        ScreenWindow.New(width, height, 2, 4, ret.ColorSpace24, ret.ColorSpace15),
    ]
    ret.ActiveWindowIndex = 1
    // In all versions, the lower window always buffers text by default.
    ret.Windows[1].IsBufferingText = true
    ret.Windows[1].CanBufferText = true

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

    self.StatusBackgroundColor = 4
    self.StatusForegroundColor = 2

    self.Windows = [
        ScreenWindow.New(self.Width, 0, 2, 4, self.ColorSpace24, self.ColorSpace15),
        ScreenWindow.New(self.Width, self.Height, 2, 4, self.ColorSpace24, self.ColorSpace15),
    ]
    self.ActiveWindowIndex = 1
    self.Windows[1].IsBufferingText = true
    self.Windows[1].CanBufferText = true
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
        lines.push({
            "t": title + split + score,
            "fg": self.ColorSpace24[self.StatusForegroundColor],
            "bg": self.ColorSpace24[self.StatusBackgroundColor],
            "b": false,
            "i": false,
        })
    end if
    for window in self.Windows
        for y in range(0, window.StoredLines - window.Height + 1)
            lines.push(window.FormattedLines)
        end for
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
        self.IsInterpreterStatusLine = true
        self.Windows[1].SetHeight(self.Windows[1] - 1)
    end if
    StatusLineObjectName
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

    // Lines The currently shown, raw text within this window.
    ret.Lines = []
    // FormattedLines The lines with formatting.  Always filled.
    ret.FormattedLines = []
    fln = "<mark=#" + ret.BackgroundColor24 + ">"
    for x in range(1, width)
        x = x + " "
    end for
    for y in range(1, height)
        ret.FormattedLines.push(fln)
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
        fln = "<mark=#" + ret.BackgroundColor24 + ">"
        for x in range(1, self.Width)
            x = x + " "
        end for
        while self.StoredLines.len < lineCount
            if self.ScrollsUp then
                // Add to the top.
                self.FormattedLines.insert(0, fln)
            else
                self.FormattedLines.push(fln)
            end if
        end while
        self.StoredLines = lineCount
    end if
    self.Height = lineCount
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
