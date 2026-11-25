# AeroTube

Widget para Windows que controla **YouTube Music** e **YouTube** com visual Frutiger Aero / Cyberpunk e mais 10 temas.

## Recursos
- YouTube Music: barra, letra sincronizada (lrclib.net), vídeo, abrir no navegador
- YouTube: modo áudio ou vídeo, abrir no navegador (no tempo atual)
- Spotify (app do Windows): controle, letra, pular segundos, sem login. Escolha YT Music, Spotify ou ambos
- 12 temas, tamanhos S/M/L + redimensionamento livre, opacidade
- Pular N segundos (você define), velocidade, volume, repetir, timer para dormir
- Cor do tema pela capa, notificação de música, esmaecer sem mouse, iniciar com o Windows
- Atalhos globais: `Ctrl+Alt+Espaço`, `←/→` (anterior/próxima), `↑/↓` (pular)

## Usar (sem instalar nada)
Baixe o `AeroTube-win.zip` em **Releases**, extraia e abra `AeroTube.exe`.
Se o Windows avisar "protegeu seu PC": **Mais informações > Executar assim mesmo** (o app não é assinado).

## Rodar pelo código
Requer Node 22.
```
npm install
npm start
npm run pack   # gera dist/AeroTube-win.zip
```

Projeto não oficial, sem relação com Google/YouTube. Os temas são homenagens de fã.
