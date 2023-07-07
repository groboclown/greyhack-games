// Opcodes for v1-v3.
if not globals.hasIndex("Opcodes") then globals.Opcodes = {}

// template
OpV1_x = function(machine, operands, storesVarRef, branch)
end function
Opcodes.x_v1 = @OpV1_x

// OpV1_Add Signed 16-bit addition.
//    add a b -> stores
OpV1_Add = function(machine, operands, storesVarRef, branch)
    if operands.len != 2 then exit("Invalid opcode 'add': requires 2 arguments")
    if storesVarRef == null then exit("Invalid opcode 'add': requires storesVarRef")

    v1 = machine.Signed16(operands[0].c)
    v2 = machine.Signed16(operands[1].c)
    // Need to handle overflow nicely.
    machine.SetVariableRef(storesVarRef, machine.Unsign16(v1 + v2))
end function
Opcodes.add_v1 = @OpV1_Add

// OpV1_And bitwise And
//    and a b -> stores
// Assumed to be on 16-bit numbers.
OpV1_And = function(machine, operands, storesVarRef, branch)
    if operands.len != 2 then exit("Invalid opcode 'and': requires 2 arguments")
    if storesVarRef == null then exit("Invalid opcode 'and': requires storesVarRef")

    v1 = operands[0].c
    v2 = operands[1].c
    // Need to handle overflow nicely.
    machine.SetVariableRef(storesVarRef, bitAnd(v1, v2))
end function
Opcodes.and_v1 = @OpV1_And

// OpV1_Call v1 Call operand.
//   call routine [arg1 [arg2 [arg3]]
// It calls the routine with 0, 1, 2 or 3 arguments as supplied
// and stores the resulting return value.
// (When the address 0 is called as a routine, nothing happens and the return value is false.)
OpV1_Call = function(machine, operands, storesVarRef, branch)
    if operands.len < 1 then exit("Invalid opcode 'call': requires 1 argument (routine)")
    if storesVarRef == null then exit("Invalid opcode 'call': requires storesVarRef")
    routine = operands[0].c
    if routine == 0 then
        // just store false (0)
        machine.SetVariableRef(storesVarRef, 0)
        return
    end if
    arguments = []
    for operand in operands[1:]
        arguments.push(operand.c)
    end for
    OpCodeLogger.Trace("Calling routine " + routine + " with arguments " + arguments + "; stores return value in " + storesVarRef)
    machine.EnterRoutine(routine, arguments, storesVarRef)
end function
Opcodes.call_v1 = @OpV1_Call

// OpV1_ClearAttribute
//      clear_attr object attribute
// Make object not have the attribute numbered attribute.
OpV1_ClearAttribute = function(machine, operands, storesVarRef, branch)
    if operands.len != 2 then exit("Invalid opcode 'clear_attr': requires 2 arguments")
    objectId = operands[0].c
    attribute = operands[1].c

    object = machine.GetObjectData(objectId)
    machine.SetObjectFlag(object, attribute, false)
end function
Opcodes.clear_attr_v1 = @OpV1_ClearAttribute

// OpV1_Dec
//     dec (variable)
// Decrement variable (signed decrement)
OpV1_Dec = function(machine, operands, storesVarRef, branch)
    if operands.len != 1 then exit("Invalid opcode 'dec': requires 1 argument")

    // The first argument is the variable index; it points to the variable to increment.
    varIndex = operands[0].c
    varVal = machine.Signed16(machine.GetVariableRef(varIndex))

    // Unsign16 will perform proper overflow checking.
    varVal = varVal - 1
    machine.SetVariableRef(varIndex, machine.Unsign16(varVal))
end function
Opcodes.dec_v1 = @OpV1_Dec

// OpV1_DecCheck
//     dec_chk (variable) value (label)
// Decrement variable, and branch if now less than value.
OpV1_DecCheck = function(machine, operands, storesVarRef, branch)
    if operands.len != 2 then exit("Invalid opcode 'dec_chk': requires 2 arguments")
    if branch == null then exit("Invalid opcode 'dec_chk': requires branch label")

    // The first argument is the variable index; it points to the variable to increment.
    varIndex = operands[0].c
    varVal = machine.Signed16(machine.GetVariableRef(varIndex))
    test = machine.Signed16(operands[1].c)

    // Unsign16 will perform proper overflow checking.
    varVal = varVal - 1
    machine.SetVariableRef(varIndex, machine.Unsign16(varVal))

    machine.PerformBranch(branch, varVal < test)
end function
Opcodes.dec_chk_v1 = @OpV1_DecCheck

// OpV1_Div Signed 16-bit division.
//    div a b -> stores
OpV1_Div = function(machine, operands, storesVarRef, branch)
    if operands.len != 2 then exit("Invalid opcode 'div': requires 2 arguments")
    if storesVarRef == null then exit("Invalid opcode 'div': requires storesVarRef")

    v1 = machine.Signed16(operands[0].c)
    v2 = machine.Signed16(operands[1].c)
    if v2 == 0 then exit("Attempted 'div' by zero")
    // Need to handle overflow nicely.
    machine.SetVariableRef(storesVarRef, machine.Unsign16(floor(v1 / v2)))
end function
Opcodes.div_v1 = @OpV1_Div

// OpV1_GetChild
//      get_child parent_object -> result (branch label)
// Get the first child of the parent object and, if it exists, branch.
OpV1_GetChild = function(machine, operands, storesVarRef, branch)
    if operands.len != 1 then exit("Invalid opcode 'get_child': requires 1 arguments")
    if storesVarRef == null then exit("Invalid opcode 'get_child': requires storesVarRef")
    if branch == null then exit("Invalid opcode 'get_child': requires branch label")
    object1 = machine.GetObjectData(operands[0].c)
    OpCodeLogger.Debug("Getting child of " + operands[0].c + " " + object1)
    childId = machine.GetObjectId(machine.GetObjectChild(object1))
    OpCodeLogger.Debug("Found child id " + childId + "; setting to " + storesVarRef)
    machine.SetVariableRef(storesVarRef, childId)
    machine.PerformBranch(branch, childId != 0)
end function
Opcodes.get_child_v1 = @OpV1_GetChild

// OpV1_GetParent
//      get_parent child_object -> result
// Get the parent of the child object.  Does not branch.
OpV1_GetParent = function(machine, operands, storesVarRef, branch)
    if operands.len != 1 then exit("Invalid opcode 'get_parent': requires 1 arguments")
    if storesVarRef == null then exit("Invalid opcode 'get_parent': requires storesVarRef")
    object1 = machine.GetObjectData(operands[0].c)
    parentId = machine.GetObjectId(machine.GetObjectParent(object1))
    if parentId == null then parentId = 0  // the null object.
    machine.SetVariableRef(storesVarRef, parentId)
end function
Opcodes.get_parent_v1 = @OpV1_GetParent

// OpV1_GetProperty
//      get_prop object property -> (result)
// Read property from object (resulting in the default value if it had
// no such declared property).
OpV1_GetProperty = function(machine, operands, storesVarRef, branch)
    if operands.len != 2 then exit("Invalid opcode 'get_prop': requires 2 arguments")
    if storesVarRef == null then exit("Invalid opcode 'get_prop': requires storesVarRef")
    object1 = machine.GetObjectData(operands[0].c)
    OpCodeLogger.Debug("Getting property " + operands[1].c + " from object " + operands[0].c)
    value = machine.GetObjectPropertyWord(object1, operands[1].c)
    if value == null then exit("Encountered null property and no default value")
    machine.SetVariableRef(storesVarRef, value)
end function
Opcodes.get_prop_v1 = @OpV1_GetProperty

// OpV1_GetPropertyAddress
//      get_prop_addr object property -> (result)
// Get the byte address (in dynamic memory) of the property
// data for the given object’s property. This must return 0
// if the object hasn’t got the property.
OpV1_GetPropertyAddress = function(machine, operands, storesVarRef, branch)
    if operands.len != 2 then exit("Invalid opcode 'get_prop_addr': requires 2 arguments")
    if storesVarRef == null then exit("Invalid opcode 'get_prop_addr': requires storesVarRef")
    object1 = machine.GetObjectData(operands[0].c)
    OpCodeLogger.Debug("Getting property " + operands[1].c + " from object " + operands[0].c)
    value = machine.GetObjectProperty(object1, operands[1].c)
    if value == null then
        addr = 0
    else
        addr = value[2]
    end if
    machine.SetVariableRef(storesVarRef, addr)
end function
Opcodes.get_prop_addr_v1 = @OpV1_GetPropertyAddress

// OpV1_GetPropertyLength
//      get_prop_len property-address -> (result)
// Get length of property data (in bytes) for the given object’s property.
// It is illegal to try to find the property length of a property which does not
// exist for the given object, and an interpreter should halt with an error message (if it can efficiently check this condition).
// get_prop_len(0) must return 0. This is required by some Infocom games and files generated by old versions of Inform.
OpV1_GetPropertyLength = function(machine, operands, storesVarRef, branch)
    if operands.len != 1 then exit("Invalid opcode 'get_prop_len': requires 1 argument")
    if storesVarRef == null then exit("Invalid opcode 'get_prop_len': requires storesVarRef")
    propDataAddr = operands[0].c
    propInfo = machine.GetPropertyInfoForDataAddress(propDataAddr)
    if propInfo == null then
        propLen = 0
    else
        propLen = propInfo[1]
    end if
    machine.SetVariableRef(storesVarRef, propLen)
end function
Opcodes.get_prop_len_v1 = @OpV1_GetPropertyLength

// OpV1_GetSibling
//      get_sibling object -> result (branch label)
// Get the next sibling of the object and, if it exists, branch.
OpV1_GetSibling = function(machine, operands, storesVarRef, branch)
    if operands.len != 1 then exit("Invalid opcode 'get_sibling': requires 1 arguments")
    if storesVarRef == null then exit("Invalid opcode 'get_sibling': requires storesVarRef")
    if branch == null then exit("Invalid opcode 'get_sibling': requires branch label")
    object1 = machine.GetObjectData(operands[0].c)
    siblingId = machine.GetObjectId(machine.GetObjectSibling(object1))
    if siblingId == null then siblingId = 0  // the null object.
    machine.SetVariableRef(storesVarRef, siblingId)
    machine.PerformBranch(branch, siblingId != 0)
end function
Opcodes.get_sibling_v1 = @OpV1_GetSibling

// OpV1_Inc
//     inc (variable)
// Increment variable (signed increment)
OpV1_Inc = function(machine, operands, storesVarRef, branch)
    if operands.len != 1 then exit("Invalid opcode 'inc': requires 1 argument")

    // The first argument is the variable index; it points to the variable to increment.
    varIndex = operands[0].c
    varVal = machine.Signed16(machine.GetVariableRef(varIndex))

    // Unsign16 will perform proper overflow checking.
    varVal = varVal + 1
    machine.SetVariableRef(varIndex, machine.Unsign16(varVal))
end function
Opcodes.inc_v1 = @OpV1_Inc

// OpV1_IncCheck
//     inc_chk (variable) value (label)
// Increment variable, and branch if now greater than value.
OpV1_IncCheck = function(machine, operands, storesVarRef, branch)
    if operands.len != 2 then exit("Invalid opcode 'inc_chk': requires 2 arguments")
    if branch == null then exit("Invalid opcode 'inc_chk': requires branch label")

    // The first argument is the variable index; it points to the variable to increment.
    varIndex = operands[0].c
    varVal = machine.Signed16(machine.GetVariableRef(varIndex))
    test = machine.Signed16(operands[1].c)

    // Unsign16 will perform proper overflow checking.
    varVal = varVal + 1
    machine.SetVariableRef(varIndex, machine.Unsign16(varVal))

    machine.PerformBranch(branch, varVal > test)
end function
Opcodes.inc_chk_v1 = @OpV1_IncCheck

// OpV1_InsertObject
//     insert_obj object destination
// Moves object "object" to become the first child of the destination
// object "destination".
// (Thus, after the operation the child of D is O, and the sibling of O
// is whatever was previously the child of D.) All children of O move
// with it. (Initially O can be at any point in the object tree; it may legally have parent zero.)
OpV1_InsertObject = function(machine, operands, storesVarRef, branch)
    if operands.len != 2 then exit("Invalid opcode 'insert_obj': requires 2 arguments")
    OpCodeLogger.Debug("Moving object " + operands[0].c + " to first child of " + operands[1].c)
    obj = machine.GetObjectData(operands[0].c)
    if obj == null then exit("Invalid opcode 'insert_obj': first argument is not an object")
    destId = operands[1].c
    dest = machine.GetObjectData(destId)
    if dest == null then exit("Invalid opcode 'insert_obj': second argument is not an object")

    // Whatever obj's previous sibling is, reassign it's sibling to obj's sibling.
    // If it has no previous sibling, then the parent's child is set to obj's sibling.
    objId = operands[0].c // machine.GetObjectId(obj)
    objParent = machine.GetObjectParent(obj)  // could be null
    objSibling = machine.GetObjectSibling(obj)  // could be null
    objSiblingId = machine.GetObjectId(objSibling)  // could be 0, the null object.
    if objParent != null then
        // Reassign the parent links to remove obj from the existing tree.
        OpCodeLogger.Trace("  removing as child of " + machine.GetObjectId(objParent))

        child = machine.GetObjectChild(objParent)
        if machine.GetObjectId(child) == objId then
            // Change the object's sibling to be the first child.
            OpCodeLogger.Trace("  .. it was the first child.")
            machine.SetObjectChild(objParent, objSiblingId)
        else
            // Find what has obj as the sibling...
            while child != null
                if child == null then exit("Invalid object tree: object's parent does not contain the object")
                childSibling = machine.GetObjectSibling(child)
                if machine.GetObjectId(childSibling) == objId then
                    // switch out the sibling to remove obj from the child chain.
                    OpCodeLogger.Trace("  .. it was the sibling of " + machine.GetObjectId(child))
                    machine.SetObjectSibling(child, objSiblingId)
                    break
                end if
                child = childSibling
            end while
        end if
        // Skipping clearing out obj's sibling, because it will be set to the destination's
        // child.
    else
        // It's fine if the object has no parent.  However, this should mean that
        // it has no siblings.
        if objSibling != null then exit("Invalid object tree: top object has sibling")
    end if

    // Insert the object into the new tree.
    OpCodeLogger.Trace("  setting destination object " + destId + " as parent of " + objId)
    machine.SetObjectParent(obj, destId)
    destChild = machine.GetObjectChild(dest)  // might be null
    destChildId = machine.GetObjectId(destChild)  // could be 0, the null object.
    OpCodeLogger.Trace("  moving destination object " + destId + " first child " + destChildId + " to sibling of " + objId)
    machine.SetObjectSibling(obj, destChildId)
    OpCodeLogger.Trace("  setting destination object " + destId + " first child to " + objId)
    machine.SetObjectChild(dest, objId)
end function
Opcodes.insert_obj_v1 = @OpV1_InsertObject

// OpV1_JumpEqual Jump if equal
//      je a b c d ?(label)
// Jump if a is equal to any of the subsequent operands.
// (Thus @je a never jumps and @je a b jumps if a = b.)
// je with just 1 operand is not permitted.
OpV1_JumpEqual = function(machine, operands, storesVarRef, branch)
    if operands.len < 1 then exit("Invalid opcode 'je': requires at least 1 argument")
    if branch == null then exit("Invalid opcode 'je': requires branch label")

    test = operands[0].c
    idx = 1
    while idx < operands.len
        if test == operands[idx].c then
            machine.PerformBranch(branch, true)
            return
        end if
        idx = idx + 1
    end while
    // No match, so try branch on failure.
    machine.PerformBranch(branch, false)
end function
Opcodes.je_v1 = @OpV1_JumpEqual

// OpV1_JumpGreater Jump if greater
//      jg a b ?(label)
// Jump if a is greater than b (signed)
OpV1_JumpGreater = function(machine, operands, storesVarRef, branch)
    if operands.len != 2 then exit("Invalid opcode 'jg': requires 2 arguments")
    if branch == null then exit("Invalid opcode 'jg': requires branch label")

    v1 = machine.Signed16(operands[0].c)
    v2 = machine.Signed16(operands[1].c)
    machine.PerformBranch(branch, v1 > v2)
end function
Opcodes.jg_v1 = @OpV1_JumpGreater

// OpV1_JumpLess Jump if less
//      jl a b ?(label)
// Jump if a is less than b (signed)
OpV1_JumpLess = function(machine, operands, storesVarRef, branch)
    if operands.len != 2 then exit("Invalid opcode 'jl': requires 2 arguments")
    if branch == null then exit("Invalid opcode 'jl': requires branch label")

    v1 = machine.Signed16(operands[0].c)
    v2 = machine.Signed16(operands[1].c)
    machine.PerformBranch(branch, v1 < v2)
end function
Opcodes.jl_v1 = @OpV1_JumpLess

// OpV1_Jump
//     jump (offset)
// Jump (unconditionally) to the given label. (This is not a branch instruction
// and the operand is a 2-byte signed offset to apply to the program counter.)
// The destination of the jump opcode is:
//     Address after instruction + Offset - 2
// The offset is a signed number.
OpV1_Jump = function(machine, operands, storesVarRef, branch)
    if operands.len != 1 then exit("Invalid opcode 'jump': requires 1 argument")
    offset = MachineState.Signed16(operands[0].c) - 2
    OpCodeLogger.Trace("Jumping " + offset + " bytes offset")
    machine.JumpByOffset(offset)
end function
Opcodes.jump_v1 = @OpV1_Jump

// OpV1_JumpIn
//     jin obj1 obj2 (label)
// Jump if parent(obj1) == obj2
OpV1_JumpIn = function(machine, operands, storesVarRef, branch)
    if operands.len != 2 then exit("Invalid opcode 'jin': requires 2 arguments")
    if branch == null then exit("Invalid opcode 'jin': requires branch label")
    object1 = machine.GetObjectData(operands[0].c)
    object2Id = operands[1].c
    machine.PerformBranch(branch, machine.GetObjectId(machine.GetObjectParent(object1)) == object2Id)
end function
Opcodes.jin_v1 = @OpV1_JumpIn

// OpV1_JumpZero
//     jz a (label)
// Jump to the label if a == zero.
OpV1_JumpZero = function(machine, operands, storesVarRef, branch)
    if operands.len != 1 then exit("Invalid opcode 'jz': requires 1 argument")
    if branch == null then exit("Invalid opcode 'jz': requires branch label")
    machine.PerformBranch(branch, operands[0].c == 0)
end function
Opcodes.jz_v1 = @OpV1_JumpZero

// OpV1_LoadB Store byte value
//      loadw array byte-index -> (result)
// Stores the byte in result from the byte value
// at address array+byte-index, which must lie in static or dynamic memory.
OpV1_LoadB = function(machine, operands, storesVarRef, branch)
    if operands.len != 2 then exit("Invalid opcode 'loadb': requires 2 arguments")
    if storesVarRef == null then exit("Invalid opcode 'loadb': requires storesVarRef")
    // OpCodeLogger.Trace("Calling loadb")
    arrayAddress = operands[0].c
    // OpCodeLogger.Trace(" - array address " + arrayAddress)
    offset = operands[1].c
    // OpCodeLogger.Trace(" - offset " + offset)
    value = machine.ReadByte(arrayAddress + offset)
    // OpCodeLogger.Trace(" - value " + value)
    machine.SetVariableRef(storesVarRef, value)
end function
Opcodes.loadb_v1 = @OpV1_LoadB

// OpV1_LoadW Store word value
//      loadw array word-index -> (result)
// Stores the word in result from the word value
// at address array+2*word-index, which must lie in static or dynamic memory.
OpV1_LoadW = function(machine, operands, storesVarRef, branch)
    if operands.len != 2 then exit("Invalid opcode 'loadw': requires 2 arguments")
    if storesVarRef == null then exit("Invalid opcode 'loadw': requires storesVarRef")
    // OpCodeLogger.Trace("Calling loadw")
    arrayAddress = operands[0].c
    // OpCodeLogger.Trace(" - array address " + arrayAddress)
    offset = 2 * operands[1].c
    // OpCodeLogger.Trace(" - offset " + offset)
    value = machine.ReadWord(arrayAddress + offset)
    // OpCodeLogger.Trace(" - value " + value)
    machine.SetVariableRef(storesVarRef, value)
end function
Opcodes.loadw_v1 = @OpV1_LoadW

// OpV1_Mul Signed 16-bit multiplication.
//    mul a b -> stores
OpV1_Mul = function(machine, operands, storesVarRef, branch)
    if operands.len != 2 then exit("Invalid opcode 'mul': requires 2 arguments")
    if storesVarRef == null then exit("Invalid opcode 'mul': requires storesVarRef")

    v1 = machine.Signed16(operands[0].c)
    v2 = machine.Signed16(operands[1].c)
    // Need to handle overflow nicely.
    machine.SetVariableRef(storesVarRef, machine.Unsign16(v1 * v2))
end function
Opcodes.mul_v1 = @OpV1_Mul

// OpV1_NewLine
//     new_line
// Print carriage return.
OpV1_NewLine = function(machine, operands, storesVarRef, branch)
    machine.PrintZscii(char(13))  // zscii newline
end function
Opcodes.new_line_v1 = @OpV1_NewLine

// OpV1_Or bitwise Or
//    or a b -> stores
// Assumed to be on 16-bit numbers.
OpV1_Or = function(machine, operands, storesVarRef, branch)
    if operands.len != 2 then exit("Invalid opcode 'or': requires 2 arguments")
    if storesVarRef == null then exit("Invalid opcode 'or': requires storesVarRef")

    v1 = operands[0].c
    v2 = operands[1].c
    // Need to handle overflow nicely.
    machine.SetVariableRef(storesVarRef, bitOr(v1, v2))
end function
Opcodes.or_v1 = @OpV1_Or

// OpV1_Print
//     print <literal-string>
// Print the quoted (literal) Z-encoded string.
OpV1_Print = function(machine, operands, storesVarRef, branch)
    text = machine.AdvanceToInstructionAfterString()
    machine.PrintZscii(text)
end function
Opcodes.print_v1 = @OpV1_Print

// OpV1_PrintAddr
//     print byte-address
// Print the z-encoded string at the byte address.
OpV1_PrintAddr = function(machine, operands, storesVarRef, branch)
    if operands.len != 1 then exit("Invalid opcode 'print_paddr': requires 1 argument")
    address = operands[0].c
    OpCodeLogger.Trace("Printing @" + address)
    text = machine.ReadString(address)
    OpCodeLogger.Debug("Printing '" + text + "'")
    machine.PrintZscii(text)
end function
Opcodes.print_addr_v1 = @OpV1_PrintAddr

// OpV1_PrintChar
//     print_char output-character-code
// Print a ZSCII character. The operand must be a character code
// defined in ZSCII for output (see S3). In particular, it must
// certainly not be negative or larger than 1023.
OpV1_PrintChar = function(machine, operands, storesVarRef, branch)
    if operands.len != 1 then exit("Invalid opcode 'print_char': requires 1 argument")
    v1 = char(operands[0].c)
    OpCodeLogger.Debug("Printing char " + operands[0].c + " as '" + v1 + "'")
    machine.PrintZscii(v1)
end function
Opcodes.print_char_v1 = @OpV1_PrintChar

// OpV1_PrintNum
//     print_num (number)
// Print (signed) number in decimal.
OpV1_PrintNum = function(machine, operands, storesVarRef, branch)
    if operands.len != 1 then exit("Invalid opcode 'print_num': requires 1 argument")
    v1 = machine.Signed16(operands[0].c)
    OpCodeLogger.Debug("Printing number " + operands[0].c + " as '" + v1 + "'")
    // assume zscii digits are 1-to-1 with unicode (they are)
    machine.PrintZscii(str(v1))
end function
Opcodes.print_num_v1 = @OpV1_PrintNum

// OpV1_PrintObject
//     print_obj object
// Print the object short name
OpV1_PrintObject = function(machine, operands, storesVarRef, branch)
    if operands.len != 1 then exit("Invalid opcode 'print_obj': requires 1 argument")
    objectId = operands[0].c
    object = machine.GetObjectData(objectId)
    name = machine.GetObjectName(object)
    OpCodeLogger.Debug("Printing object " + objectId + ": '" + name + "'")
    machine.PrintZscii(name)
end function
Opcodes.print_obj_v1 = @OpV1_PrintObject

// OpV1_PrintPAddr
//     print packed-address
// Print the z-encoded string at the packed address.
OpV1_PrintPAddr = function(machine, operands, storesVarRef, branch)
    if operands.len != 1 then exit("Invalid opcode 'print_paddr': requires 1 argument")
    address = machine.FromStringPackAddress(operands[0].c)
    OpCodeLogger.Trace("Printing @" + address)
    text = machine.ReadString(address)
    OpCodeLogger.Debug("Printing '" + text + "'")
    machine.PrintZscii(text)
end function
Opcodes.print_paddr_v1 = @OpV1_PrintPAddr

// OpV1_PrintRet
//     print_ret <literal-string>
// Print the quoted (literal) Z-encoded string immediately following
// the opcode, then print a new line, then return 1.
OpV1_PrintRet = function(machine, operands, storesVarRef, branch)
    text = machine.AdvanceToInstructionAfterString()
    machine.PrintZscii(text + char(13))
    machine.PopStackFrame(1)
end function
Opcodes.print_ret_v1 = @OpV1_PrintRet

// OpV1_Push
//     push value
// Push the value onto the game stack.
OpV1_Push = function(machine, operands, storesVarRef, branch)
    if operands.len != 1 then exit("Invalid opcode 'push': requires 1 argument")
    value = operands[0].c
    machine.SetVariableRef(0, value)  // setting variable 0 is equivalent to pushing to the stack.
end function
Opcodes.push_v1 = @OpV1_Push

// OpV1_Pull
//     pull variable
// Pull a value off the stack and store it in the variable specified by the argument.
// A stack underflow halts the interpreter.
OpV1_Pull = function(machine, operands, storesVarRef, branch)
    if operands.len != 1 then exit("Invalid opcode 'push': requires 1 argument")
    varRef = operands[0].c
    value = machine.GetVariableRef(0)  // getting variable 0 pulls off the stack.
    if value == null then exit("Pull on an empty stack.")
    machine.SetVariableRef(varRef, value)
end function
Opcodes.pull_v1 = @OpV1_Pull

// OpV1_PutProperty
//      put_prop object property value
// Writes the given value to the given property of the given object. If the property
// does not exist for that object, the interpreter should halt with a suitable error
// message. If the property length is 1, then the interpreter should store only the least
// significant byte of the value. (For instance, storing -1 into a 1-byte property results
// in the property value 255.) As with get_prop the property length must not be more than 2:
// if it is, the behaviour of the opcode is undefined.
OpV1_PutProperty = function(machine, operands, storesVarRef, branch)
    if operands.len != 3 then exit("Invalid opcode 'put_prop': requires 3 arguments")
    object1 = machine.GetObjectData(operands[0].c)
    propertyId = operands[1].c
    value = operands[2].c
    OpCodeLogger.Debug("Putting value " + value + " into property " + propertyId + " for object " + operands[0].c)
    machine.SetObjectPropertyWord(object1, propertyId, value)
end function
Opcodes.put_prop_v1 = @OpV1_PutProperty

// OpV1_Quit
//     quit
// Exits the game immediately.
OpV1_Quit = function(machine, operands, storesVarRef, branch)
    return false  // do not continue running
end function
Opcodes.quit_v1 = @OpV1_Quit

// OpV1_Restart
//     restart
// Restarts the game immediately.
// The only pieces of information surviving from the previous state are the
// "transcribing to printer" bit (bit 0 of ’Flags 2′ in the header, at
// address 0x10) and the "use fixed pitch font" bit (bit 1 of 'Flags 2').
OpV1_Restart = function(machine, operands, storesVarRef, branch)
    machine.StartGame()
end function
Opcodes.restart_v1 = @OpV1_Restart

// OpV1_Ret
//     ret value
// Returns from the current routine with the value given.
OpV1_Ret = function(machine, operands, storesVarRef, branch)
    if operands.len != 1 then exit("Invalid opcode 'ret': requires 1 argument")
    machine.PopStackFrame(operands[0].c)
end function
Opcodes.ret_v1 = @OpV1_Ret

// OpV1_RetPopped
//     ret_popped
// Pops the top of the stack, and returns that value.
OpV1_RetPopped = function(machine, operands, storesVarRef, branch)
    retval = machine.GetVariableRef(0)
    machine.PopStackFrame(retval)
end function
Opcodes.ret_popped_v1 = @OpV1_RetPopped

// OpV1_RTrue
//     rtrue
// Return true (1) from the current routine.
OpV1_RTrue = function(machine, operands, storesVarRef, branch)
    machine.PopStackFrame(1)
end function
Opcodes.rtrue_v1 = @OpV1_RTrue

// OpV1_RFalse
//     rfalse
// Return false (0) from the current routine.
OpV1_RFalse = function(machine, operands, storesVarRef, branch)
    machine.PopStackFrame(0)
end function
Opcodes.rfalse_v1 = @OpV1_RFalse

// OpV1_SetAttribute
//      set_attr object attribute
// Make object have the attribute numbered attribute.
OpV1_SetAttribute = function(machine, operands, storesVarRef, branch)
    if operands.len != 2 then exit("Invalid opcode 'set_attr': requires 2 arguments")
    objectId = operands[0].c
    attribute = operands[1].c

    object = machine.GetObjectData(objectId)
    machine.SetObjectFlag(object, attribute, true)
end function
Opcodes.set_attr_v1 = @OpV1_SetAttribute

// OpV1_SRead
//      sread text parse
// The whopper.  Read in text from the current input stream until a terminating
// character.  Does not show a prompt.
OpV1_SRead = function(machine, operands, storesVarRef, branch)
    if operands.len < 1 or operands.len > 2 then exit("Invalid opcode 'sread': requires 1 or 2 arguments")
    if machine.FileVersion <= 3 then
        machine.UpdateStatusLine()
    end if

    // text - pointer to the text buffer
    text = operands[0].c
    // n Versions 1 to 4, byte 0 of the text-buffer should initially contain the maximum number of
    // letters which can be typed, minus 1 (the interpreter should not accept more than this).
    maxInputChars = machine.ReadByte(text)
    if maxInputChars < 3 then exit("Invalid story file: text buffer size < 3")

    textCountPos = 0
    textStartPos = 1
    textInsertPos = 1
    if machine.FileVersion >= 5 then
        // If byte 1 contains a positive value at the start of the input, then read assumes that
        // number of characters are left over from an interrupted previous input, and writes the new characters
        // after those already there. Note that the interpreter does not redisplay the characters left over:
        // the game does this, if it wants to.        
        // The interpreter stores the number of characters actually typed in byte 1 (not counting
        // the terminating character), and the characters themselves (reduced to lower case) in bytes
        // 2 onward (not storing the terminating character).
        leftoverChars = machine.ReadByte(text + 1)
        textCountPos = 1
        textStartPos = 2
        textInsertPos = 2 + leftoverChars

        // Note: these leftover chars should be put into the output stream 4.
    end if

    // Read the text
    userInput = machine.ReadInputLine(maxInputChars)

    // Update the text buffer

    // Set the number of characters read in - byte 0.
    input = userInput[1]
    if machine.FileVersion <= 4 then
        // add a zero terminator.
        input.push(0)
    end if
    if input.len < maxInputChars then maxInputChars = input.len
    if machine.FileVersion >= 5 then
        // Insert back the number of read characters.
        machine.SetByte(text + textCountPos, maxInputChars)
    end if
    MachineLogln(" ; inserting " + maxInputChars + " input characters")
    for idx in range(0, maxInputChars - 1)
        machine.SetByte(text + textInsertPos + idx, input[idx])
    end for

    // parse - pointer to the parse buffer
    parse = 0
    if operands.len > 1 then parse = operands[1].c

    if parse != 0 then
        // Perform lexical analysis.
        machine.LoadParseTable(input, parse, textInsertPos)
    end if
end function
Opcodes.sread_v1 = @OpV1_SRead

// OpV1_Store Store variable value value
//     store (variable) value
// Set the VARiable referenced by the operand to value.
OpV1_Store = function(machine, operands, storesVarRef, branch)
    if operands.len != 2 then exit("Invalid opcode 'store': requires 2 arguments")
    variableRef = operands[0].c
    value = operands[1].c
    machine.SetVariableRef(variableRef, value)
end function
Opcodes.store_v1 = @OpV1_Store

// OpV1_StoreB Store byte value
//      storeb array byte-index value
// Stores the value at memory address array+(byte-index)
OpV1_StoreB = function(machine, operands, storesVarRef, branch)
    if operands.len != 3 then exit("Invalid opcode 'storeb': requires 3 arguments")
    // OpCodeLogger.Trace("Calling storeb")
    arrayAddress = operands[0].c
    // OpCodeLogger.Trace(" - array address " + arrayAddress)
    offset = operands[1].c
    // OpCodeLogger.Trace(" - offset " + offset)
    value = operands[2].c
    // OpCodeLogger.Trace(" - value " + value)
    address = arrayAddress + offset
    // OpCodeLogger.Trace(" - array index address " + address)
    // OpCodeLogger.Trace("Setting memory @" + address + " = " + value)
    machine.SetByte(address, value)

    // Double check our logic.
    assertion = machine.ReadByte(address)
    if assertion != value then exit("Wrote " + value + " to @" + address + ", but read back " + assertion)
end function
Opcodes.storeb_v1 = @OpV1_StoreB

// OpV1_StoreW Store word value
//      storew array word-index value
// Stores the value at memory address array+(2*word-index)
OpV1_StoreW = function(machine, operands, storesVarRef, branch)
    if operands.len != 3 then exit("Invalid opcode 'storew': requires 3 arguments")
    // OpCodeLogger.Trace("Calling storew")
    arrayAddress = operands[0].c
    // OpCodeLogger.Trace(" - array address " + arrayAddress)
    offset = 2 * operands[1].c
    // OpCodeLogger.Trace(" - offset " + offset)
    value = operands[2].c
    // OpCodeLogger.Trace(" - value " + value)
    address = arrayAddress + offset
    // OpCodeLogger.Trace(" - array index address " + address)
    // OpCodeLogger.Trace("Setting memory @" + address + " = " + value)
    machine.SetWord(address, value)

    // Double check our logic.
    assertion = machine.ReadWord(address)
    if assertion != value then exit("Wrote " + value + " to @" + address + ", but read back " + assertion)

end function
Opcodes.storew_v1 = @OpV1_StoreW

// OpV1_Sub Signed 16-bit subtraction.
//    sub a b -> stores
OpV1_Sub = function(machine, operands, storesVarRef, branch)
    if operands.len != 2 then exit("Invalid opcode 'sub': requires 2 arguments")
    if storesVarRef == null then exit("Invalid opcode 'sub': requires storesVarRef")

    v1 = machine.Signed16(operands[0].c)
    v2 = machine.Signed16(operands[1].c)
    // Need to handle overflow nicely.
    machine.SetVariableRef(storesVarRef, machine.Unsign16(v1 - v2))
end function
Opcodes.sub_v1 = @OpV1_Sub

// OpV1_Test Jump if bitmap values are set.
//     test bitmap flags (branch to label)
// Jump if all of the flags in bitmap are set (i.e. if bitmap & flags == flags).
OpV1_Test = function(machine, operands, storesVarRef, branch)
    if operands.len != 2 then exit("Invalid opcode 'test': requires 2 arguments")
    if branch == null then exit("Invalid opcode 'test': requires branch label")
    bitmap = operands[0].c
    flags = operands[1].c

    machine.PerformBranch(branch, bitAnd(bitmap, flags) == flags)
end function
Opcodes.test_v1 = @OpV1_Test

// OpV1_TestAttr Jump if bitmap values are set.
//     test_attr object attribute (branch to label)
// Jump if object has attribute.
OpV1_TestAttr = function(machine, operands, storesVarRef, branch)
    if operands.len != 2 then exit("Invalid opcode 'test_attr': requires 2 arguments")
    if branch == null then exit("Invalid opcode 'test_attr': requires branch label")
    objectId = operands[0].c
    attribute = operands[1].c

    object = machine.GetObjectData(objectId)
    machine.PerformBranch(branch, machine.IsObjectFlagSet(object, attribute))
end function
Opcodes.test_attr_v1 = @OpV1_TestAttr
