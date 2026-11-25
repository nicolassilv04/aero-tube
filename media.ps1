param($cmd)
# Le/controla o Spotify via controle de midia do Windows (SMTC). Imprime 1 linha JSON a cada 0,5s.
[Console]::OutputEncoding=[Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$bt=[char]96
$at=([System.WindowsRuntimeSystemExtensions].GetMethods()|Where-Object{$_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq ('IAsyncOperation'+$bt+'1')})[0]
function Aw($t,$r){$n=$at.MakeGenericMethod($r).Invoke($null,@($t));$n.Wait(-1)|Out-Null;$n.Result}
function Emit($x){[Console]::Out.WriteLine($x);[Console]::Out.Flush()}
$null=[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
$null=[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties,Windows.Media.Control,ContentType=WindowsRuntime]
$null=[Windows.Storage.Streams.IRandomAccessStreamWithContentType,Windows.Storage.Streams,ContentType=WindowsRuntime]
$mgr=Aw ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$last='';$pat='Spotify'
$volOk=$false
try{
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume { int f(); int g(); int h(); int i(); int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext); int j(); int GetMasterVolumeLevelScalar(out float pfLevel); int k(); int l(); int m(); int n(); int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, System.Guid pguidEventContext); int GetMute(out bool pbMute); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref System.Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-4F14-8D6C-4D74E35AB45E")] class MMDeviceEnumeratorComObject { }
public class SysVol {
  static IAudioEndpointVolume V() { var e = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator; IMMDevice d = null; Marshal.ThrowExceptionForHR(e.GetDefaultAudioEndpoint(0, 1, out d)); IAudioEndpointVolume v = null; var g = typeof(IAudioEndpointVolume).GUID; Marshal.ThrowExceptionForHR(d.Activate(ref g, 23, 0, out v)); return v; }
  public static float Get() { float x; Marshal.ThrowExceptionForHR(V().GetMasterVolumeLevelScalar(out x)); return x; }
  public static void Set(float x) { Marshal.ThrowExceptionForHR(V().SetMasterVolumeLevelScalar(x, System.Guid.Empty)); }
  public static bool GetMute() { bool m; Marshal.ThrowExceptionForHR(V().GetMute(out m)); return m; }
  public static void SetMute(bool m) { Marshal.ThrowExceptionForHR(V().SetMute(m, System.Guid.Empty)); }
}
'@
$volOk=$true}catch{}
while($true){
 try{
  if($volOk){try{Emit ('{"vol":'+[string]::Format([Globalization.CultureInfo]::InvariantCulture,'{0:0.00}',[SysVol]::Get())+',"mute":'+([SysVol]::GetMute()).ToString().ToLower()+'}')}catch{}}
  $c='';if(Test-Path $cmd){$c=(Get-Content $cmd -Raw).Trim();Remove-Item $cmd -Force;if($c -like 'pat *'){$pat=$c.Substring(4);$c=''}elseif($c -like 'vol *'){if($volOk){[SysVol]::Set([float]::Parse($c.Substring(4),[Globalization.CultureInfo]::InvariantCulture))};$c=''}elseif($c -like 'mute *'){if($volOk){[SysVol]::SetMute($c.Substring(5) -eq '1')};$c=''}}
  $ss=$mgr.GetSessions()|Where-Object{$_.SourceAppUserModelId -match $pat}|Select-Object -First 1
  if(-not $ss){Emit '{"none":1}'}
  else{
   if($c){
    if($c -eq 'pp'){$null=Aw ($ss.TryTogglePlayPauseAsync()) ([bool])}
    elseif($c -eq 'next'){$null=Aw ($ss.TrySkipNextAsync()) ([bool])}
    elseif($c -eq 'prev'){$null=Aw ($ss.TrySkipPreviousAsync()) ([bool])}
    elseif($c -like 'seek *'){$null=Aw ($ss.TryChangePlaybackPositionAsync([long]([double]$c.Substring(5)*10000))) ([bool])}
   }
   $p=Aw ($ss.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
   $tl=$ss.GetTimelineProperties()
   $pl=($ss.GetPlaybackInfo().PlaybackStatus -eq 'Playing')
   $end=$tl.EndTime.TotalMilliseconds;$pos=$tl.Position.TotalMilliseconds
   if($pl){$pos+=([DateTimeOffset]::Now-$tl.LastUpdatedTime).TotalMilliseconds}
   if($end -gt 0 -and $pos -gt $end){$pos=$end};if($pos -lt 0){$pos=0}
   $k=$p.Title+'|'+$p.Artist;$img=$null
   if($k -ne $last){
    $last=$k
    try{
     $st=Aw ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
     $ms=New-Object IO.MemoryStream
     [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($st).CopyTo($ms)
     $img='data:image/jpeg;base64,'+[Convert]::ToBase64String($ms.ToArray())
    }catch{}
   }
   Emit ([pscustomobject]@{ti=$p.Title;ar=$p.Artist;t=$pos/1000;d=$end/1000;p=(-not $pl);img=$img}|ConvertTo-Json -Compress)
  }
 }catch{Emit '{"none":1}'}
 Start-Sleep -Milliseconds 500
}
