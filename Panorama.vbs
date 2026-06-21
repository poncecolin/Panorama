' Silent launcher — runs Panorama.cmd with no visible console window.
' Double-click this for a clean start (the app window still appears normally).
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
proj = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = proj
sh.Run """" & proj & "\Panorama.cmd""", 0, False
