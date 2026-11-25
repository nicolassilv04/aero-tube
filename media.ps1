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
$last=''
while($true){
 try{
  $ss=$mgr.GetSessions()|Where-Object{$_.SourceAppUserModelId -match 'Spotify'}|Select-Object -First 1
  if(-not $ss){Emit '{"none":1}'}
  else{
   if(Test-Path $cmd){
    $c=(Get-Content $cmd -Raw).Trim();Remove-Item $cmd -Force
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
