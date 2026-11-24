Attribute VB_Name = "ConvertDocxToPdf"
' Fallback for scripts\migrations\convert-docx-to-pdf.ps1: runs INSIDE Word (no PowerShell).
'
' Converts every .docx in IN_DIR to a PDF with the same base name in OUT_DIR. A file whose PDF
' already exists is skipped (run it again after a problem). The .docx files are opened read-only
' and never changed. Nothing is uploaded.
'
' How to use (Word open, no document needed):
'   1. Alt+F11 (Visual Basic editor) -> File -> Import File... -> choose this .bas file.
'   2. Run the small test first: put the cursor inside "Sub ConvertFirstFive" and press F5.
'   3. Open a few of the PDFs in OUT_DIR. If they look right, run "Sub ConvertAll" the same way.
'   4. A summary box shows at the end; the names of failed files are listed in OUT_DIR\convert-failed.txt.
' Remove the module afterwards: right-click ConvertDocxToPdf in the Project window -> Remove (answer No to export).

Option Explicit

Private Const IN_DIR As String = "C:\Users\User\Dev\Projects\ApitherapyV2\scratch\point-docs-en\docx\"
Private Const OUT_DIR As String = "C:\Users\User\Dev\Projects\ApitherapyV2\scratch\point-docs-en\pdf\"

Public Sub ConvertFirstFive()
    ConvertFolder 5
End Sub

Public Sub ConvertAll()
    ConvertFolder 0
End Sub

Private Sub ConvertFolder(ByVal maxFiles As Long)
    Dim fso As Object, folder As Object, file As Object
    Dim doc As Document
    Dim pdfPath As String, failedNames As String, failedFile As Integer
    Dim converted As Long, skipped As Long, failed As Long, tried As Long

    Set fso = CreateObject("Scripting.FileSystemObject")
    If Not fso.FolderExists(IN_DIR) Then
        MsgBox "Input folder not found: " & IN_DIR, vbCritical
        Exit Sub
    End If
    If Not fso.FolderExists(OUT_DIR) Then fso.CreateFolder OUT_DIR

    Set folder = fso.GetFolder(IN_DIR)
    Application.ScreenUpdating = False

    For Each file In folder.Files
        If LCase$(fso.GetExtensionName(file.Name)) = "docx" And Left$(file.Name, 2) <> "~$" Then
            pdfPath = OUT_DIR & fso.GetBaseName(file.Name) & ".pdf"
            If fso.FileExists(pdfPath) Then
                skipped = skipped + 1
            Else
                If maxFiles > 0 And tried >= maxFiles Then Exit For
                tried = tried + 1
                Set doc = Nothing
                On Error Resume Next
                Set doc = Documents.Open(FileName:=file.Path, ConfirmConversions:=False, ReadOnly:=True, AddToRecentFiles:=False)
                If Err.Number = 0 Then
                    doc.ExportAsFixedFormat OutputFileName:=pdfPath, ExportFormat:=wdExportFormatPDF
                End If
                If Err.Number <> 0 Or Not fso.FileExists(pdfPath) Then
                    failed = failed + 1
                    failedNames = failedNames & file.Name & " (" & Err.Description & ")" & vbCrLf
                    Err.Clear
                Else
                    converted = converted + 1
                End If
                If Not doc Is Nothing Then doc.Close SaveChanges:=wdDoNotSaveChanges
                On Error GoTo 0
                Application.StatusBar = "Converted " & converted & ", failed " & failed & " : " & file.Name
                DoEvents
            End If
        End If
    Next file

    Application.ScreenUpdating = True
    Application.StatusBar = False

    If failed > 0 Then
        failedFile = FreeFile
        Open OUT_DIR & "convert-failed.txt" For Output As #failedFile
        Print #failedFile, failedNames
        Close #failedFile
    End If

    MsgBox "Converted now: " & converted & vbCrLf & "Skipped (PDF exists): " & skipped & vbCrLf & _
           "Failed: " & failed & IIf(failed > 0, vbCrLf & "See " & OUT_DIR & "convert-failed.txt", ""), vbInformation, "DOCX to PDF"
End Sub
