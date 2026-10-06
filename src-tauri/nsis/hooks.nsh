; Dayflit NSIS installer hooks.
; Install/upgrade/uninstall never prompt about a running copy: Dayflit is closed automatically.

!macro NSIS_HOOK_PREINSTALL
  nsExec::ExecToStack 'taskkill /F /IM dayflit.exe /T'
  Pop $0
  Pop $1
  nsExec::ExecToStack 'taskkill /F /IM Dayflit.exe /T'
  Pop $0
  Pop $1
  Sleep 400
!macroend

!macro NSIS_HOOK_POSTINSTALL
  IfFileExists "$INSTDIR\Dayflit.exe" 0 try_lower
    CreateShortcut "$DESKTOP\Dayflit.lnk" "$INSTDIR\Dayflit.exe" "" "$INSTDIR\Dayflit.exe" 0
    Goto done_shortcut
  try_lower:
  IfFileExists "$INSTDIR\dayflit.exe" 0 done_shortcut
    CreateShortcut "$DESKTOP\Dayflit.lnk" "$INSTDIR\dayflit.exe" "" "$INSTDIR\dayflit.exe" 0
  done_shortcut:
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::ExecToStack 'taskkill /F /IM dayflit.exe /T'
  Pop $0
  Pop $1
  nsExec::ExecToStack 'taskkill /F /IM Dayflit.exe /T'
  Pop $0
  Pop $1
  Sleep 400
  Delete "$DESKTOP\Dayflit.lnk"
!macroend

; On uninstall, offer to remove the user's data and settings (kept by default).
!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$DESKTOP\Dayflit.lnk"
  IfFileExists "$APPDATA\Dayflit\*.*" 0 dayflit_done
  IfSilent dayflit_done
  MessageBox MB_YESNO|MB_ICONQUESTION "Also delete your Dayflit data, settings and backups?$\r$\n$\r$\n$APPDATA\Dayflit$\r$\n$\r$\nChoose No to keep them for a future reinstall." IDNO dayflit_done
  RMDir /r "$APPDATA\Dayflit"
  dayflit_done:
!macroend
