#!/bin/bash
# Fix type-crafter generation bugs in Terminal.ts
# Bug 1: Union type references use C{N} but classes are C{Union}{N}
# Bug 2: Array item types use camelCase instead of PascalCase named types
#
# NOTE: These sed patterns are intentional safety nets. When the generator
# output is already correct, the patterns match nothing and are harmless
# no-ops. If the generator regresses (e.g., after a type-crafter upgrade),
# they activate and silently fix the output. Do not remove them.

FILE="./src/generated/types/Terminal.ts"

# Portable sed-in-place helper (works on both BSD/macOS and GNU/Linux)
_sed_i() {
  sed "$1" "$2" > "$2.tmp" && mv "$2.tmp" "$2"
}

# Fix union type references: CHolderClientMessageN → CHolderClientMessageHolderClientMessageN
_sed_i 's/CHolderClientMessage\([1-9]\)/CHolderClientMessageHolderClientMessage\1/g' "$FILE"
_sed_i 's/CHolderServerMessage\([1-9]\)/CHolderServerMessageHolderServerMessage\1/g' "$FILE"
_sed_i 's/CWsEvent\([1-9]\)/CWsEventWsEvent\1/g' "$FILE"
_sed_i 's/CWsSessionMessage\([1-9]\)/CWsSessionMessageWsSessionMessage\1/g' "$FILE"
_sed_i 's/CWsSessionOutput\([1-9]\)/CWsSessionOutputWsSessionOutput\1/g' "$FILE"
_sed_i 's/CWsTerminalMessage\([1-9]\)/CWsTerminalMessageWsTerminalMessage\1/g' "$FILE"
_sed_i 's/CWsTerminalOutput\([1-9]\)/CWsTerminalOutputWsTerminalOutput\1/g' "$FILE"

# Fix array item types: messagesItem → SessionMessageItem, contentItem → ContentBlockItem
_sed_i 's/messagesItem/SessionMessageItem/g' "$FILE"
_sed_i 's/decodeMessagesItem/decodeSessionMessageItem/g' "$FILE"
_sed_i 's/contentItem/ContentBlockItem/g' "$FILE"
_sed_i 's/decodeContentItem/decodeContentBlockItem/g' "$FILE"

# Remove stale lowercase barrel exports from index.ts
INDEX="./src/generated/types/index.ts"
_sed_i "/export .* from '\\.\\/Apn'/d" "$INDEX"
_sed_i "/export .* from '\\.\\/Cli'/d" "$INDEX"
_sed_i "/export .* from '\\.\\/Api'/d" "$INDEX"
