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
$buttonName = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, 'Save captures here')
$buttonType = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
$buttonCondition = [System.Windows.Automation.AndCondition]::new($buttonName, $buttonType)
$button = $null
for ($attempt = 0; $attempt -lt 40; $attempt++) {
  $button = $dialog.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $buttonCondition)
  if ($button -and $button.Current.IsEnabled) { break }
  Start-Sleep -Milliseconds 100
}
if (!$button -or !$button.Current.IsEnabled) { throw 'Output-folder confirmation button unavailable.' }
$invoke = $null
if ($button.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$invoke)) {
  $invoke.Invoke()
} else {
  $button.SetFocus()
  [System.Windows.Forms.SendKeys]::SendWait(' ')
}
Write-Output 'PageTrace output folder chosen through the native Windows dialog.'
