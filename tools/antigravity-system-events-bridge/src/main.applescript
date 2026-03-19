property requestPath : "/Users/unitybox/nanoclaw/runtime/antigravity-system-events-bridge/request.txt"
property stdoutPath : "/Users/unitybox/nanoclaw/runtime/antigravity-system-events-bridge/stdout.log"
property stderrPath : "/Users/unitybox/nanoclaw/runtime/antigravity-system-events-bridge/stderr.log"
property exitCodePath : "/Users/unitybox/nanoclaw/runtime/antigravity-system-events-bridge/exit_code.txt"

on run
  try
    set requestText to my readFile(requestPath)
    if requestText is "" then
      my writeFile(stderrPath, "No bridge request file was found.")
      my writeFile(exitCodePath, "64")
      return
    end if

    if requestText is "prompt-automation" then
      tell application "System Events"
        count every process
      end tell
      my writeFile(stdoutPath, "automation-ready")
      my writeFile(exitCodePath, "0")
      return
    end if

    if requestText starts with "send:" then
      set messageText to text 6 thru -1 of requestText
      set the clipboard to messageText
      tell application "System Events"
        keystroke "v" using command down
        delay 0.12
        key code 36
      end tell
      my writeFile(stdoutPath, "sent")
      my writeFile(exitCodePath, "0")
      return
    end if

    my writeFile(stderrPath, "Unknown bridge request: " & requestText)
    my writeFile(exitCodePath, "64")
  on error errMsg number errNum
    my writeFile(stderrPath, "System Events bridge failed (" & errNum & "): " & errMsg)
    if requestText is "prompt-automation" then
      my writeFile(exitCodePath, "12")
    else
      my writeFile(exitCodePath, "11")
    end if
  end try
end run

on readFile(targetPath)
  try
    set targetFile to POSIX file targetPath
    set targetRef to open for access targetFile
    set fileText to read targetRef as «class utf8»
    close access targetRef
    return fileText
  on error
    try
      close access POSIX file targetPath
    end try
    return ""
  end try
end readFile

on writeFile(targetPath, textValue)
  set targetFile to POSIX file targetPath
  set targetRef to open for access targetFile with write permission
  try
    set eof targetRef to 0
    write (textValue & linefeed) to targetRef as «class utf8»
    close access targetRef
  on error
    try
      close access targetRef
    end try
  end try
end writeFile
