param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class PageTraceWindow {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr handle, uint message, IntPtr wParam, IntPtr lParam);
}
'@
$root = [System.Windows.Automation.AutomationElement]::RootElement
$condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, 'Choose where to save PageTrace captures')
$dialog = $null
for ($attempt = 0; $attempt -lt 180; $attempt++) {
  $dialog = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
  if ($dialog) { break }
  Start-Sleep -Milliseconds 250
}
if (!$dialog) { throw 'PageTrace output-folder dialog did not appear. No dependency selector should appear.' }
[PageTraceWindow]::SetForegroundWindow([IntPtr]$dialog.Current.NativeWindowHandle) | Out-Null
Start-Sleep -Milliseconds 250
[System.Windows.Forms.SendKeys]::SendWait('%d')
Start-Sleep -Milliseconds 250
# The Windows shell address control does not consistently expose ValuePattern.
# Type into the address bar as a user would, escaping SendKeys metacharacters.
$typedDestination = -join ($Destination.ToCharArray() | ForEach-Object {
  if ('+^%~(){}[]'.Contains([string]$_)) { '{' + $_ + '}' } else { [string]$_ }
})
[System.Windows.Forms.SendKeys]::SendWait($typedDestination)
Start-Sleep -Milliseconds 250
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
# IFileDialog's confirmation control is a shell split button; it need not expose
# InvokePattern or ControlType.Button. Activate the dialog's standard IDOK command.
Start-Sleep -Milliseconds 750
[PageTraceWindow]::SendMessage([IntPtr]$dialog.Current.NativeWindowHandle, 0x0111, [IntPtr]1, [IntPtr]0) | Out-Null
Write-Output 'PageTrace output folder chosen through the native Windows dialog.'
