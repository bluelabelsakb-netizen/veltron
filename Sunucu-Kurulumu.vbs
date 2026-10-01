' ============================================================
'  Veltron Sunucusu - Masaustu kisayolu
'  Cift tiklayin: sunucu calisiyorsa uygulamayi acar,
'  calismiyorsa baslatir.
' ============================================================
Option Explicit

Dim sh
Set sh = CreateObject("WScript.Shell")

If IsPortOpen(4000) Then
    sh.Run "http://localhost:4000", 1, False
    WScript.Quit 0
End If

Dim answer
answer = MsgBox( _
    "Veltron sunucusu calismiyor." & vbCrLf & vbCrLf & _
    "Simdi baslatilsin mi?" & vbCrLf & vbCrLf & _
    "Karsilik: gorsel bir terminal penceresi acilacak, kapali kalir.", _
    vbQuestion + vbYesNo, "Veltron")

If answer = vbYes Then
    sh.CurrentDirectory = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\") - 1)
    sh.Run "cmd /c node server\src\index.js", 1, False
End If

Dim i
For i = 1 To 30
    WScript.Sleep 1000
    If IsPortOpen(4000) Then
        sh.Run "http://localhost:4000", 1, False
        WScript.Quit 0
    End If
Next

MsgBox "Sunucu baslatilamadi." & vbCrLf & vbCrLf & _
       "Terminali acinca su hatayi gorun:" & vbCrLf & _
       "  node server\src\index.js", vbExclamation, "Veltron"

' ------------------------------------------------------------
' Port acik mi kontrolu
' ------------------------------------------------------------
Function IsPortOpen(ByVal port As Long) As Boolean
    Dim nw
    On Error Resume Next
    Set nw = CreateObject("WScript.Network")
    If Err.Number <> 0 Then
        IsPortOpen = False
        Exit Function
    End If
    IsPortOpen = (nw.GetTcpEntStatus("127.0.0.1", port) = 2)
End Function
