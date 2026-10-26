#ifndef AppVersion
  #error AppVersion is required
#endif
[Setup]
#ifdef TestInstall
AppId=Bili-Space-Installer-Isolated-Test
AppName=Bili-Space Installer Test
OutputBaseFilename=Bili-Space-{#AppVersion}-Setup-Test
#else
AppId={{E049D014-909D-475F-916F-3912759BB78A}
AppName=Bili-Space
OutputBaseFilename=Bili-Space-{#AppVersion}-Setup
#endif
AppVersion={#AppVersion}
AppSupportURL=https://github.com/GuqiGG/Bili-Space/issues
AppUpdatesURL=https://github.com/GuqiGG/Bili-Space/releases
DefaultDirName={localappdata}\Programs\Bili-Space
DefaultGroupName=Bili-Space
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir={#OutputDir}
SetupIconFile={#SourceDir}\assets\branding\bili-space.ico
UninstallDisplayIcon={app}\Bili-Space.exe
LicenseFile={#SourceDir}\LICENSE
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=yes
CloseApplications=no
RestartApplications=no

[Languages]
Name: "zhcn"; MessagesFile: "ChineseSimplified.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: desktopicon; Description: "Create a desktop shortcut"; Flags: unchecked

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Bili-Space"; Filename: "{app}\Bili-Space.exe"
Name: "{autodesktop}\Bili-Space"; Filename: "{app}\Bili-Space.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Bili-Space.exe"; Description: "Launch Bili-Space"; Flags: nowait postinstall skipifsilent

[Code]
function InitializeSetup(): Boolean;
begin
#ifdef TestInstall
  Result := True;
#else
  Result := FindWindowByClassName('BetterBiliSpace') = 0;
  if not Result then
    MsgBox('Please exit Bili-Space from the tray before installing.', mbInformation, MB_OK);
#endif
end;
