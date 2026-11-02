; Windows Firewall rules for ilet (THREAT_MODEL.md T5; ports from PROTOCOL.md sections 2 and 6).
; Phones may reach ilet only on Private networks: HTTPS and Bonjour are allowed there, and every
; incoming connection is blocked on Public and Domain networks. With a rule for every network
; profile, Windows also never asks the user whether to open ilet on a Public network.
; test/installer/firewallRules.test.ts checks these ports against the app's constants.

!include LogicLib.nsh

!define ILET_RULE_HTTPS "ilet: files from paired phones (Private networks)"
!define ILET_RULE_BONJOUR "ilet: Bonjour discovery (Private networks)"
!define ILET_RULE_BLOCK "ilet: blocked on Public and Domain networks"

!macro iletFirewall arguments
  nsExec::ExecToLog 'netsh advfirewall firewall ${arguments}'
  Pop $0
!macroend

!macro iletAddFirewallRule arguments
  !insertmacro iletFirewall 'add rule ${arguments} dir=in program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" enable=yes'
  ${If} $0 S!= "0"
    MessageBox MB_ICONEXCLAMATION|MB_OK "ilet could not add its Windows Firewall rules, so phones may not reach this PC. Install ilet again to retry." /SD IDOK
  ${EndIf}
!macroend

!macro iletRemoveFirewallRules
  ; netsh reports an error for a rule that does not exist, which is fine here.
  !insertmacro iletFirewall 'delete rule name="${ILET_RULE_HTTPS}"'
  !insertmacro iletFirewall 'delete rule name="${ILET_RULE_BONJOUR}"'
  !insertmacro iletFirewall 'delete rule name="${ILET_RULE_BLOCK}"'
!macroend

!macro customInstall
  ; Installing again replaces the rules instead of adding copies.
  !insertmacro iletRemoveFirewallRules
  !insertmacro iletAddFirewallRule 'name="${ILET_RULE_HTTPS}" action=allow profile=private protocol=TCP localport=45380'
  !insertmacro iletAddFirewallRule 'name="${ILET_RULE_BONJOUR}" action=allow profile=private protocol=UDP localport=5353'
  !insertmacro iletAddFirewallRule 'name="${ILET_RULE_BLOCK}" action=block profile=public,domain'
!macroend

!macro customUnInstall
  !insertmacro iletRemoveFirewallRules
!macroend
