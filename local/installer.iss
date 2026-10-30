; Inno Setup script for Mobile Shop on one PC (owner 2026-10-30).
; Compile after `pyinstaller local/mobileshop.spec`:  iscc local/installer.iss
; Data (database, uploads, backups) lives in %LOCALAPPDATA%\MobileShop and survives updates.

#ifndef AppVersion
  #define AppVersion "2.0.0"
#endif

[Setup]
AppId={{7D5A1C2E-5B7F-4C3A-9D1E-MOBILESHOP01}
AppName=Mobile Shop
AppVersion={#AppVersion}
AppPublisher=OOP Solutions
DefaultDirName={autopf}\Mobile Shop
DefaultGroupName=Mobile Shop
DisableProgramGroupPage=yes
OutputDir=..\dist
OutputBaseFilename=MobileShop-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\MobileShop.exe
CloseApplications=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a Desktop shortcut"; GroupDescription: "Shortcuts:"
Name: "autostart"; Description: "Start Mobile Shop when Windows starts"; GroupDescription: "Start-up:"

[Files]
Source: "..\dist\MobileShop\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Mobile Shop"; Filename: "{app}\MobileShop.exe"
Name: "{autodesktop}\Mobile Shop"; Filename: "{app}\MobileShop.exe"; Tasks: desktopicon
Name: "{userstartup}\Mobile Shop"; Filename: "{app}\MobileShop.exe"; Tasks: autostart

[Run]
Filename: "{app}\MobileShop.exe"; Description: "Open Mobile Shop now"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "taskkill"; Parameters: "/F /IM MobileShop.exe"; Flags: runhidden; RunOnceId: "stop"
