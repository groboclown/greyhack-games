// Load the game file.
FileLoader = {}

// Read Ascii85 formatted text into a byte array
FileLoader.A85Reader = function(content)
    _zero = "!".code
    _85 = "u".code
    _4z = "z".code
    _4y = "y".code
    
    content = content + "uuuu"

	currx = 0
	curr = [0, 0, 0, 0, 0]
    read_pos = 0
    buffer = []

	for c in content
		x = c.code
		if x >= _zero and x <= _85 then
			curr[currx] = x
			currx = currx + 1
			if currx == 5 then
				// Filled up the next bits.
				acc = 0
				for x in curr
					acc = 85 * acc + (x - _zero)
				end for
				buffer.push(floor(acc / 16777216) % 256)
				buffer.push(floor(acc / 65536) % 256)
				buffer.push(floor(acc / 256) % 256)
				buffer.push(acc % 256)
				currx = 0
			end if
		else if x == _4z then
			// equivalent to 4 0s.
			buffer.push(0)
			buffer.push(0)
			buffer.push(0)
			buffer.push(0)
		else if x == _4y then
			// equivalent to 4 0x20s.
			buffer.push(32)
			buffer.push(32)
			buffer.push(32)
			buffer.push(32)
		// else ignore the character
		end if
	end for

	// Check for if there's possible padding to consume
    padding = 4 - currx
    if padding > 0 then
		// Remove the padding.
        buffer = buffer[:-padding]
    end if
    return buffer
end function
